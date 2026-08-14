// End-to-end driver for regression.sm.yaml. Feeds a scripted (but
// realistic) regression scenario through the real WorkflowRun API —
// emits real, schema-valid Evidence Model entities at each state
// and writes an UPDATED known-failure memory entry at the terminal
// `update-known-failure` state (the same id as the prior entry, but
// with `regression_id` now set to a new id; previously null).
//
// The scenario is the natural sequel to
// executor/examples/e2e-membership-bug/drive-run.mjs: that driver
// fixed the off-by-one in `is_active()` (changed `<` to `<=`,
// wrote `mem-known-failure-membership-expiry-boundary` with
// `regression_id: null`). This driver models the symptom recurring
// three months later, when a refactor extracted `parseExpiryDate`
// into its own helper module and — in doing so — accidentally
// reverted the boundary check to `<`.
//
// What this proves:
//   1. regression.sm.yaml loads cleanly through loadWorkflow
//      (structural validation, no dead ends, all states reachable).
//   2. A real WorkflowRun walks intake -> classify -> match-known-
//      failure -> identify-reintroduction -> re-diagnose -> re-fix
//      -> verify -> update-known-failure -> report, emitting
//      schema-valid evidence at every emitting state.
//   3. The broad-refactor safety gate at the `re-fix` state
//      blocks an un-confirmed transition out of `re-fix`, then
//      allows it when confirmation is supplied (advanceWithConfirmation).
//      This is the same gate bug-report uses at propose-fix/apply-fix,
//      feature-request uses at implement, refactor uses at implement,
//      and change-request uses at migrate — proving the gate is
//      workflow-agnostic, not specific to any one workflow.
//   4. The question_economy (max_questions: 1, allowed_states:
//      [classify]) enforces correctly: one question in classify is
//      accepted, a second question is rejected
//      (question-economy-exceeded), and a question outside classify
//      would be rejected as wrong-state (both negative cases are
//      asserted).
//   5. The workflow's UNIQUE structural features are exercised:
//        a. match-known-failure READS a prior known-failure memory
//           entry (the only workflow that reads memory before
//           writing it; all others write memory at the end).
//        b. re-diagnose's Decision.why field cites the prior fix's
//           blind spot in the required shape ("the prior fix at
//           <commit> addressed <symptom> via <approach>, but did
//           not account for <edge case>; the reintroduction at
//           <commit> re-exposed the edge case because <reason>").
//        c. update-known-failure UPDATES an existing memory entry
//           in place (regression_id flips from null to a new id)
//           rather than creating a new one — the only workflow
//           that updates rather than creates.
//   6. The Regression evidence entity is post-MVP per the schema
//      directory; this driver emits a Decision with what:
//      "regression_recorded" as the post-MVP stand-in, referencing
//      the prior incident_ref and the new evidence. The Decision's
//      schema-validity is asserted (validates against
//      evidence/schema/decision.schema.json).
//
// What this does NOT prove: a live, multi-turn agent session driving
// the framework one tool call at a time. Same honest scope note as
// executor/examples/e2e-feature-request/README.md.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { WorkflowViolation } from "../../dist/types.js";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "regression.sm.yaml");

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}`);
    failed++;
  }
}

async function expectViolation(label, kind, fn) {
  try {
    await fn();
    check(`${label} (expected WorkflowViolation kind="${kind}")`, false);
  } catch (e) {
    if (e instanceof WorkflowViolation && e.kind === kind) {
      check(label, true);
    } else {
      console.log(`  FAIL ${label} — wrong error: ${e}`);
      failed++;
    }
  }
}

async function scenario() {
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-regression-"));
  const runDir = join(runDirParent, "evidence-and-memory");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  console.log("=== End-to-end regression run: membership expiry off-by-one RECURRED ===\n");
  console.log("User report: 'some members say their membership expired a day early — again'\n");
  console.log("(This is the SAME symptom as the prior known-failure, which was fixed in");
  console.log(" the original bug-report run via `<` -> `<=` + a regression test.)\n");

  // The prior known-failure memory entry, as written by the original
  // bug-report run (see executor/examples/e2e-membership-bug/drive-run.mjs).
  // In a real run, this would be read from .aiecp/memory/known-failure/
  // via filesystem_read; here we embed it as a JS object so the driver
  // is self-contained. The match-known-failure state's first action
  // would be to read this entry from disk; the simulated read happens
  // before the state-machine advance, and the entry's contents are
  // used to populate the expected/actual/validation below.
  const priorKnownFailure = {
    id: "mem-known-failure-membership-expiry-boundary",
    type: "known-failure",
    schema_version: "1.0.0",
    created_at: "2026-08-14T10:00:00Z", // original bug-report run
    source: "real-e2e-run-2026-08-14",
    incident_ref: "incident-membership-expiry-off-by-one",
    symptom: "members report membership expiring one day early",
    root_cause: "is_active() used strict '<' instead of '<=' against expiry_date, contradicting its own docstring contract",
    fix: "changed comparison to '<=' in membership.py; added test_active_on_expiry_date_itself as a permanent regression guard",
    regression_id: null, // <-- null at first-time-fix; will be flipped in update-known-failure
  };

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  run.advance("intent_classified");
  check("state is classify", run.currentState === "classify");

  // classify: one allowed question. The one decision-changing
  // question for regression specifically is "is this the same symptom
  // as the prior incident, or a similar-looking new one?" — the answer
  // routes either forward to match-known-failure or out to bug-report.
  // The user said "again", which strongly suggests prior context, but
  // the question is still necessary: a similar-looking new bug (e.g.
  // off-by-one but on a different boundary) would also produce "expired
  // a day early" reports.
  run.askQuestion("Is this the same symptom as the prior incident (membership expires ON the expiry date instead of staying active through it), or a similar-looking new one (different boundary, different code path)?");
  check("question count is 1 (at max_questions=1)", run.questions.count === 1);

  // Emit a Trace + Decision recording the acceptance: proceed as
  // regression, scope = match against the prior known-failure.
  await run.emitEvidence("trace", {
    id: "trace-classify-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-classify-1"],
  });
  await run.emitEvidence("event", {
    id: "event-classify-1",
    trace_ref: "trace-classify-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "project-intelligence.json + .aiecp/memory/known-failure/",
    payload: {
      finding: "prior known-failure entry found (mem-known-failure-membership-expiry-boundary) whose symptom matches the current report verbatim; routing to match-known-failure to confirm the match against current behavior before diagnosing",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-regression-1",
    trace_ref: "trace-classify-1",
    what: "acceptance:proceed_with_regression",
    why: "user reports the same symptom as the prior known-failure ('again' signal + symptom matches memory); scope = match-then-re-diagnose with prior-context awareness",
    validated: true,
    result: "accepted",
  });
  run.advance("class_known");
  check("state is match-known-failure", run.currentState === "match-known-failure");

  // ------------------------------------------------------------------
  // match-known-failure -> identify-reintroduction
  // ------------------------------------------------------------------
  // UNIQUE STRUCTURAL FEATURE 1: this state READS the prior
  // known-failure memory entry rather than writing one. In a real
  // run, this would be a filesystem_read of .aiecp/memory/known-failure/
  // mem-known-failure-membership-expiry-boundary.json; here, the
  // priorKnownFailure JS object stands in for that read. Emit:
  //   - expected: the prior known-failure's symptom (from memory)
  //   - actual: the current symptom (observed in this run)
  //   - validation: did they match? (manual_review for a prose
  //     symptom comparison)
  await run.emitEvidence("expected", {
    id: "expected-prior-known-failure-symptom",
    source_ref: "mem-known-failure-membership-expiry-boundary (prior known-failure memory entry, symptom field)",
    predicate:
      "members report membership expiring one day early (the symptom as recorded in the prior known-failure memory entry, established as the contract by the original bug-report run's regression-protect state)",
    predicate_kind: "behavioral",
  });
  // A reproduction-style event to anchor the actual's observation_ref.
  await run.emitEvidence("trace", {
    id: "trace-match-known-failure-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-current-symptom-reproduction"],
  });
  await run.emitEvidence("event", {
    id: "event-current-symptom-reproduction",
    trace_ref: "trace-match-known-failure-1",
    ts: new Date().toISOString(),
    kind: "test_result",
    source: "pytest tests/test_membership.py -v (current run, before any re-fix)",
    payload: {
      result: "1 failed, 3 passed",
      failure: "assert False is True -- where False = is_active(date(2026,6,1), date(2026,6,1)) (the same boundary test that was added as the regression guard in the original bug-report run is now failing again)",
      note: "the regression guard added by the original fix (test_active_on_expiry_date_itself) is failing in the current run — the symptom has recurred",
    },
  });
  await run.emitEvidence("actual", {
    id: "actual-current-symptom",
    expected_ref: "expected-prior-known-failure-symptom",
    observed_value: "is_active(date(2026,6,1), date(2026,6,1)) returned False (the prior known-failure's symptom has recurred; the regression guard test is failing for the same reason as the original incident)",
    observation_ref: "event-current-symptom-reproduction",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("validation", {
    id: "validation-symptom-match",
    expected_ref: "expected-prior-known-failure-symptom",
    actual_ref: "actual-current-symptom",
    result: "match",
    method: "contract_validation",
    evidence_refs: ["event-current-symptom-reproduction"],
    validated_at: new Date().toISOString(),
  });
  run.advance("known_failure_matched");
  check("state is identify-reintroduction", run.currentState === "identify-reintroduction");

  // ------------------------------------------------------------------
  // identify-reintroduction -> re-diagnose
  // ------------------------------------------------------------------
  // Run git log <original-fix-commit>..HEAD -- src/membership/ to
  // find commits since the prior fix. Emit one Event per commit
  // (per-commit attribution is what makes the reintroduction-
  // identifying Decision citable). Then emit a Decision recording
  // which commit reintroduced the regression.
  const commits = [
    {
      sha: "abc1234",
      message: "refactor: extract parseExpiryDate into src/membership/parsing.ts",
      finding: "extracted parseExpiryDate(s: string): Date from inline block in validateMembership; moved the boundary check into the new helper; in doing so the comparison was 'cleaned up' from '<=' back to '<' (the inline comment about the boundary was lost in the extraction)",
    },
    {
      sha: "def5678",
      message: "chore: bump dependencies",
      finding: "package-lock.json changes only; no source code touched; unrelated to the membership boundary",
    },
    {
      sha: "ghi9012",
      message: "test: add more edge-case tests for parseExpiryDate",
      finding: "added 4 new test cases for parseExpiryDate covering timezone and leap-year edge cases; the boundary-test-on-expiry-date-itself case was NOT among the new tests (the original regression guard test_active_on_expiry_date_itself was preserved in tests/test_membership.py but is not run against the extracted helper directly)",
    },
  ];
  const commitEventIds = commits.map((_, i) => `event-commit-${i + 1}-${_.sha}`);
  await run.emitEvidence("trace", {
    id: "trace-identify-reintroduction-1",
    started_at: new Date().toISOString(),
    source: "agent_adapter",
    event_refs: commitEventIds,
  });
  for (let i = 0; i < commits.length; i++) {
    await run.emitEvidence("event", {
      id: commitEventIds[i],
      trace_ref: "trace-identify-reintroduction-1",
      ts: new Date().toISOString(),
      kind: "observation",
      source: `git log <original-fix-commit>..HEAD -- src/membership/ (commit ${commits[i].sha})`,
      payload: {
        commit_sha: commits[i].sha,
        commit_message: commits[i].message,
        finding: commits[i].finding,
      },
    });
  }
  // The Decision naming which commit reintroduced the regression.
  // evidence_refs points at the specific event(s) justifying the
  // attribution.
  await run.emitEvidence("decision", {
    id: "decision-reintroduction-identified",
    trace_ref: "trace-identify-reintroduction-1",
    what: "reintroduction_identified:abc1234",
    why: "commit abc1234 (refactor: extract parseExpiryDate) is the only commit in the diff between fixed-then and broken-now that touched the boundary comparison; its diff reverted '<=' back to '<' during the extraction, contradicting the prior fix at the original-fix-commit (which changed '<' to '<=')",
    validated: true,
    result: "accepted",
    evidence_refs: commitEventIds, // cite all commit events; the attribution is to abc1234 specifically but the negative evidence (def5678 and ghi9012 do NOT touch the boundary) is part of the decision trace
  });
  run.advance("reintroduction_identified");
  check("state is re-diagnose", run.currentState === "re-diagnose");

  // ------------------------------------------------------------------
  // re-diagnose -> re-fix
  // ------------------------------------------------------------------
  // UNIQUE STRUCTURAL FEATURE 2: the Decision.why field MUST cite
  // the prior fix's blind spot in the fixed shape. This is the
  // entire reason this workflow exists separately from bug-report.
  await run.emitEvidence("decision", {
    id: "decision-re-diagnose-root-cause",
    trace_ref: "trace-identify-reintroduction-1",
    what: "root_cause_candidate: parseExpiryDate in src/membership/parsing.ts uses strict '<' where the prior fix at the original-fix-commit established '<='",
    why: "the prior fix at commit <original-fix-commit> addressed the off-by-one symptom ('<') via the change to '<=', but did not account for the fact that the fix lived inside validateMembership's inline date-parsing block rather than as a separate tested function; the reintroduction at commit abc1234 re-exposed the edge case because the refactor that extracted parseExpiryDate did not preserve the boundary comparison (the refactor's 'cleanup' reverted '<=' back to '<', and the new helper has no test of its own that would have caught the revert). The re-fix must therefore restore '<=' inside parseExpiryDate AND add a boundary test in src/membership/parsing.test.ts (the helper's own test file), so the boundary check is not coupled to the broader validateMembership test — the next refactor touching parseExpiryDate will re-break the boundary if the test is in the wrong file.",
    validated: false, // candidate until verify confirms
    root_cause: false, // candidate until verify confirms
    result: "pending",
    evidence_refs: ["event-commit-1-abc1234", "event-current-symptom-reproduction"],
  });
  // (In a real run, a validation would be emitted here to confirm
  // the candidate; for narrative simplicity in this driver, we
  // proceed to re-fix and let verify confirm both the root cause
  // and the re-fix together.)
  run.advance("root_cause_found");
  check("state is re-fix", run.currentState === "re-fix");

  // ------------------------------------------------------------------
  // re-fix: safety gate fires here (broad-refactor -> edit_source,
  // default policy = "ask"). Confirm an un-confirmed advance is
  // blocked BEFORE we proceed via advanceWithConfirmation.
  // ------------------------------------------------------------------
  await expectViolation(
    "un-confirmed transition out of re-fix is blocked by safety gate",
    "safety-gate-needs-confirmation",
    () => run.advance("fix_applied")
  );
  check("state is still re-fix after blocked attempt", run.currentState === "re-fix");

  // Now simulate the human confirming and proceed.
  run.advanceWithConfirmation("fix_applied");
  check("state is verify after confirmation", run.currentState === "verify");

  // Emit the re-fix Decision (AI proposal, validated=false) + a
  // file_change Event. The Decision.why names what the re-fix does
  // differently from the prior fix (the blind-spot-addressing
  // difference) — this is the artifact a future reviewer (or future
  // regression run) will read to understand why the second fix is
  // structurally different from the first.
  await run.emitEvidence("decision", {
    id: "decision-re-fix-apply-patch",
    trace_ref: "trace-identify-reintroduction-1",
    what: "ai_proposal:apply_patch_to_parse_expiry_date_helper",
    why: "restore '<=' inside parseExpiryDate (src/membership/parsing.ts) — the same change the prior fix made inline, but this time inside the extracted helper so the boundary check is co-located with the function that owns it; PLUS add a boundary test (test_active_on_expiry_date_itself_for_helper) in src/membership/parsing.test.ts so the next refactor touching parseExpiryDate will re-break the test in the helper's own file rather than silently passing the broader validateMembership test. This is the blind-spot-addressing difference: the prior fix changed the operator in place; this fix changes the operator AND moves the regression guard to the helper's test file, so the boundary check is structurally coupled to the function that owns the boundary, not to the broader caller.",
    validated: false, // AI proposal — flipped to true only after verify
    result: "pending",
    evidence_refs: ["decision-re-diagnose-root-cause"],
  });
  await run.emitEvidence("event", {
    id: "event-re-fix-file-change-helper",
    trace_ref: "trace-identify-reintroduction-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "src/membership/parsing.ts",
    payload: {
      diff_summary: "line 14: changed comparison from '<' back to '<=' (restoring the prior fix inside the extracted helper); no other source lines touched",
    },
  });
  await run.emitEvidence("event", {
    id: "event-re-fix-file-change-test",
    trace_ref: "trace-identify-reintroduction-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "src/membership/parsing.test.ts",
    payload: {
      diff_summary: "added test_active_on_expiry_date_itself_for_helper: asserts parseExpiryDate('2026-06-01') returns a Date that, when compared against today=date(2026,6,1), satisfies the '<=' boundary (i.e., the helper's own test now independently covers the boundary, decoupled from the broader validateMembership test that the prior fix relied on)",
    },
  });

  // Negative test: a second question would exceed the budget. Asked
  // from `verify` state, which is NOT in allowed_states (only
  // classify is), so it should be rejected for that reason first
  // — the wrong-state kind is the more specific violation, so
  // that's what we expect.
  await expectViolation(
    "question asked in verify state (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should the new test go in parsing.test.ts or membership.test.ts?")
  );

  // Also confirm the budget itself: a fresh run, one question
  // already asked in classify, a second question in classify should
  // be rejected as exceeded (not wrong-state, since classify IS in
  // allowed_states).
  const budgetRun = new WorkflowRun(def, { runDir: join(runDir, "budget-test") });
  budgetRun.advance("intent_classified"); // now in classify
  budgetRun.askQuestion("First question — allowed.");
  await expectViolation(
    "second question in classify exceeds max_questions=1",
    "question-economy-exceeded",
    () => budgetRun.askQuestion("Second question — should be rejected.")
  );

  // ------------------------------------------------------------------
  // verify -> update-known-failure
  // ------------------------------------------------------------------
  // Behavioral verification: re-run the reproduction against the
  // re-fixed code. The Expected is the SAME as the one emitted in
  // match-known-failure (the prior known-failure's symptom — that
  // is the contract the prior fix established, and the re-fix must
  // re-establish it). Emit a new Actual (post-re-fix) and a
  // Validation with method: "app_validation" (a direct behavioral
  // check on the boundary).
  await run.emitEvidence("trace", {
    id: "trace-verify-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-verify-rerun-result"],
  });
  await run.emitEvidence("event", {
    id: "event-verify-rerun-result",
    trace_ref: "trace-verify-1",
    ts: new Date().toISOString(),
    kind: "test_result",
    source: "pytest tests/test_membership.py tests/membership/parsing.test.ts -v (after re-fix)",
    payload: {
      result: "4 passed (3 original + 1 new helper boundary test); the previously-failing test_active_on_expiry_date_itself now passes",
      behavioral_check: "is_active(date(2026,6,1), date(2026,6,1)) returned True (direct behavioral check on the boundary, per ADR-0010 — green suite alone would be insufficient)",
    },
  });
  await run.emitEvidence("actual", {
    id: "actual-post-rifix-boundary",
    expected_ref: "expected-prior-known-failure-symptom",
    observed_value: "is_active(date(2026,6,1), date(2026,6,1)) returned True (the prior known-failure's symptom has been resolved by the re-fix; the regression guard test now passes again, AND the new helper-level boundary test also passes)",
    observation_ref: "event-verify-rerun-result",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("validation", {
    id: "validation-verify-rifix",
    expected_ref: "expected-prior-known-failure-symptom",
    actual_ref: "actual-post-rifix-boundary",
    result: "match",
    method: "app_validation",
    evidence_refs: ["event-verify-rerun-result"],
    decision_ref: "decision-re-fix-apply-patch",
    validated_at: new Date().toISOString(),
  });
  run.advance("behavior_verified");
  check("state is update-known-failure", run.currentState === "update-known-failure");

  // ------------------------------------------------------------------
  // update-known-failure -> report
  // ------------------------------------------------------------------
  // UNIQUE STRUCTURAL FEATURE 3: this state UPDATES an existing
  // known-failure memory entry (the same id as the prior entry) by
  // flipping its regression_id field from null to a new id. This is
  // the only state in the catalog that updates rather than creates
  // memory.
  //
  // The new regression_id value: a `regression-<slug>` id, even
  // though no regression.schema.json exists yet (post-MVP per the
  // schema directory). This is forward-compatible with the eventual
  // schema.
  const newRegressionId = "regression-membership-expiry-boundary-recurrence-1";

  // Emit the regression_recorded Decision — the post-MVP stand-in
  // for what would be a Regression evidence entity. References the
  // prior incident_ref and the new evidence (re-diagnose Decision +
  // verify Validation).
  await run.emitEvidence("decision", {
    id: "decision-regression-recorded-1",
    trace_ref: "trace-identify-reintroduction-1",
    what: "regression_recorded",
    why: "the prior known-failure (mem-known-failure-membership-expiry-boundary, referencing incident-membership-expiry-off-by-one) has recurred; the reintroduction was identified at commit abc1234 (refactor that extracted parseExpiryDate), the root cause was re-diagnosed with the prior fix's blind spot cited, the re-fix was applied and behaviorally verified. This Decision is the post-MVP stand-in for what would be a Regression evidence entity (per docs/evidence-model.md core entities table — id, incident_ref, original_fix_ref, current_evidence_ref); the regression_id field on the updated known-failure entry references this regression occurrence.",
    validated: true,
    result: "accepted",
    evidence_refs: [
      "incident-membership-expiry-off-by-one", // prior incident_ref from the known-failure entry
      "decision-re-diagnose-root-cause", // the re-diagnose Decision (cites the prior fix's blind spot)
      "validation-verify-rifix", // the verify Validation (confirms re-fix resolved the symptom)
    ],
  });

  // Write the UPDATED known-failure memory entry — same id, same
  // everything except regression_id (now set to the new id; was null).
  await run.writeMemory("known-failure", {
    id: priorKnownFailure.id, // same id — UPDATE in place
    type: "known-failure",
    schema_version: "1.0.0",
    created_at: priorKnownFailure.created_at, // preserved
    source: priorKnownFailure.source, // preserved
    incident_ref: priorKnownFailure.incident_ref, // preserved
    symptom: priorKnownFailure.symptom, // preserved
    root_cause: priorKnownFailure.root_cause, // preserved
    fix: priorKnownFailure.fix, // preserved
    regression_id: newRegressionId, // <-- FLIPPED from null to a new id
  });

  run.advance("known_failure_updated");
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // report: write a project memory entry recording the regression
  // occurrence, so a future workflow does not re-derive the prior-
  // fix-context chain.
  // ------------------------------------------------------------------
  await run.writeMemory("project", {
    id: "mem-project-membership-regression-resolved-2026-11-14",
    type: "project",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "regression-run-1",
    stack: ["python"],
    layer: ["backend"],
    domain: "membership service with parseExpiryDate extracted to src/membership/parsing.ts (refactor reintroduced the off-by-one; regression run re-fixed with '<=' restored + dedicated boundary test in the helper's own test file)",
  });

  // ------------------------------------------------------------------
  // Final assertions: the run produced the expected evidence trail
  // ------------------------------------------------------------------
  check("exactly 1 question was asked in the main run", run.questions.count === 1);
  check("log has entries for every transition + evidence + gate check", run.log.length > 15);

  // Confirm the run wrote real evidence files to disk (not just
  // logged them in memory) — the EvidenceStore validates and
  // persists each one.
  const evidenceKinds = ["trace", "event", "decision", "expected", "actual", "validation"];
  for (const kind of evidenceKinds) {
    const dir = join(runDir, "evidence", kind);
    const files = await readdir(dir).catch(() => []);
    check(`evidence/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  const memoryKinds = ["known-failure", "project"];
  for (const kind of memoryKinds) {
    const dir = join(runDir, "memory", kind);
    const files = await readdir(dir).catch(() => []);
    check(`memory/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  // UNIQUE-STRUCTURAL-FEATURE assertions: spot-check the persisted
  // artifacts to confirm the regression-specific shapes round-tripped.

  // FEATURE 2: re-diagnose Decision.why cites the prior fix's blind
  // spot in the fixed shape.
  const persistedReDiagnose = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-re-diagnose-root-cause.json"), "utf-8")
  );
  check(
    "persisted re-diagnose Decision.why cites 'prior fix at <commit>'",
    /prior fix at .+ addressed .+ via/.test(persistedReDiagnose.why)
  );
  check(
    "persisted re-diagnose Decision.why cites 'did not account for'",
    /did not account for/.test(persistedReDiagnose.why)
  );
  check(
    "persisted re-diagnose Decision.why cites 'reintroduction at <commit> re-exposed'",
    /reintroduction at .+ re-exposed the edge case because/.test(persistedReDiagnose.why)
  );
  check(
    "persisted re-diagnose Decision.why names what the re-fix does differently",
    /The re-fix must therefore/.test(persistedReDiagnose.why)
  );
  check(
    "persisted re-diagnose Decision has validated=false (AI proposal, awaiting verify)",
    persistedReDiagnose.validated === false
  );

  // FEATURE 1: match-known-failure emitted an expected (prior
  // symptom from memory) + actual (current symptom) + validation
  // (match).
  const persistedExpected = JSON.parse(
    await readFile(join(runDir, "evidence", "expected", "expected-prior-known-failure-symptom.json"), "utf-8")
  );
  check(
    "persisted expected-prior-known-failure-symptom references the prior memory entry in source_ref",
    persistedExpected.source_ref.includes("mem-known-failure-membership-expiry-boundary")
  );
  const persistedMatchValidation = JSON.parse(
    await readFile(join(runDir, "evidence", "validation", "validation-symptom-match.json"), "utf-8")
  );
  check(
    "persisted validation-symptom-match has result=match (symptom matches prior known-failure)",
    persistedMatchValidation.result === "match"
  );
  check(
    "persisted validation-symptom-match has method=contract_validation (checkable assertion, not prose-only)",
    persistedMatchValidation.method === "contract_validation"
  );

  // identify-reintroduction: Decision.evidence_refs points at
  // concrete commit events.
  const persistedReintroDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-reintroduction-identified.json"), "utf-8")
  );
  check(
    "persisted reintroduction Decision has evidence_refs pointing at commit events",
    Array.isArray(persistedReintroDecision.evidence_refs) &&
      persistedReintroDecision.evidence_refs.some((r) => r.startsWith("event-commit-")) &&
      persistedReintroDecision.evidence_refs.length >= 3
  );
  check(
    "persisted reintroduction Decision.what names the commit sha (reintroduction_identified:abc1234)",
    persistedReintroDecision.what === "reintroduction_identified:abc1234"
  );

  // re-fix: Decision.why names what the re-fix does differently.
  const persistedReFixDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-re-fix-apply-patch.json"), "utf-8")
  );
  check(
    "persisted re-fix Decision.why names the blind-spot-addressing difference",
    /blind-spot-addressing difference/.test(persistedReFixDecision.why) &&
      /the prior fix changed the operator in place; this fix changes the operator AND moves the regression guard/.test(persistedReFixDecision.why)
  );
  check(
    "persisted re-fix Decision has validated=false (AI proposal, awaiting verify)",
    persistedReFixDecision.validated === false && persistedReFixDecision.what.startsWith("ai_proposal:")
  );

  // verify: Validation with method=app_validation + result=match.
  const persistedVerifyValidation = JSON.parse(
    await readFile(join(runDir, "evidence", "validation", "validation-verify-rifix.json"), "utf-8")
  );
  check(
    "persisted verify Validation has method=app_validation + result=match",
    persistedVerifyValidation.method === "app_validation" && persistedVerifyValidation.result === "match"
  );
  check(
    "persisted verify Validation references the re-fix Decision (decision_ref)",
    persistedVerifyValidation.decision_ref === "decision-re-fix-apply-patch"
  );

  // FEATURE 3: update-known-failure wrote an UPDATED known-failure
  // memory entry with regression_id flipped from null to a new id.
  const persistedKnownFailure = JSON.parse(
    await readFile(join(runDir, "memory", "known-failure", `${priorKnownFailure.id}.json`), "utf-8")
  );
  check(
    "persisted known-failure memory entry has regression_id set to a new id (was null)",
    typeof persistedKnownFailure.regression_id === "string" &&
      persistedKnownFailure.regression_id.startsWith("regression-") &&
      persistedKnownFailure.regression_id === newRegressionId
  );
  check(
    "persisted known-failure memory entry preserved the prior fields (id, symptom, root_cause, fix, incident_ref)",
    persistedKnownFailure.id === priorKnownFailure.id &&
      persistedKnownFailure.symptom === priorKnownFailure.symptom &&
      persistedKnownFailure.root_cause === priorKnownFailure.root_cause &&
      persistedKnownFailure.fix === priorKnownFailure.fix &&
      persistedKnownFailure.incident_ref === priorKnownFailure.incident_ref
  );

  // regression_recorded Decision references prior incident_ref + new evidence.
  const persistedRegressionRecorded = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-regression-recorded-1.json"), "utf-8")
  );
  check(
    "persisted regression_recorded Decision has what=regression_recorded",
    persistedRegressionRecorded.what === "regression_recorded"
  );
  check(
    "persisted regression_recorded Decision references prior incident_ref in evidence_refs",
    Array.isArray(persistedRegressionRecorded.evidence_refs) &&
      persistedRegressionRecorded.evidence_refs.includes("incident-membership-expiry-off-by-one")
  );
  check(
    "persisted regression_recorded Decision references re-diagnose Decision + verify Validation in evidence_refs",
    persistedRegressionRecorded.evidence_refs.includes("decision-re-diagnose-root-cause") &&
      persistedRegressionRecorded.evidence_refs.includes("validation-verify-rifix")
  );
  check(
    "persisted regression_recorded Decision has validated=true (regression is a fact, not a proposal)",
    persistedRegressionRecorded.validated === true
  );

  // Cleanup
  await rm(runDirParent, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
  console.log("");
  console.log("Proof summary:");
  console.log("- regression.sm.yaml loads through the real executor");
  console.log("- A full WorkflowRun walks all 8 non-terminal states + 1 terminal (report)");
  console.log("- Schema-valid evidence emitted at every emitting state (8 of 10 states)");
  console.log("- broad-refactor safety gate at `re-fix` blocks un-confirmed advance, allows confirmed");
  console.log("- question_economy enforces max_questions=1 and allowed_states=[classify]");
  console.log("- Negative tests: question in `verify` (wrong-state) rejected;");
  console.log("  second question in classify (exceeded) rejected in a fresh run");
  console.log("- UNIQUE FEATURE 1: match-known-failure READS a prior known-failure memory entry");
  console.log("  (emits expected from memory + actual from observation + validation comparing them)");
  console.log("- UNIQUE FEATURE 2: re-diagnose Decision.why cites the prior fix's blind spot in");
  console.log("  the fixed shape ('prior fix at <commit> addressed <symptom> via <approach>, but did");
  console.log("  not account for <edge case>; reintroduction at <commit> re-exposed because <reason>')");
  console.log("- UNIQUE FEATURE 3: update-known-failure UPDATES the prior memory entry in place");
  console.log("  (regression_id flips from null to a new regression-<slug> id; other fields preserved)");
  console.log("- regression_recorded Decision references prior incident_ref + new evidence (post-MVP");
  console.log("  stand-in for the Regression evidence entity, which has no schema file yet)");
  console.log("- All evidence persisted to disk as JSON (would have thrown on schema violation)");
}

scenario().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
