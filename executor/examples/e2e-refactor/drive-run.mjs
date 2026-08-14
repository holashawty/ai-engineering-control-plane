// End-to-end driver for refactor.sm.yaml. Feeds a scripted (but
// realistic) refactor scenario through the real WorkflowRun API —
// emits real, schema-valid Evidence Model entities at each state
// and writes a real project memory entry at the terminal `report`
// state.
//
// What this proves:
//   1. refactor.sm.yaml loads cleanly through loadWorkflow
//      (structural validation, no dead ends, all states reachable).
//   2. A real WorkflowRun walks intake -> classify -> capture-baseline
//      -> design-refactor -> implement -> verify-equivalence ->
//      document -> report, emitting schema-valid evidence at every
//      emitting state.
//   3. The broad-refactor safety gate at the `implement` state
//      blocks an un-confirmed transition out of `implement`, then
//      allows it when confirmation is supplied (advanceWithConfirmation).
//      This is the same gate bug-report uses at propose-fix/apply-fix
//      and feature-request uses at implement — proving the gate is
//      workflow-agnostic. The gate matters MORE for refactor: a
//      refactor that exceeds broad_refactor_threshold is no longer
//      a refactor, it's a rewrite, and should be reclassified.
//   4. The question_economy (max_questions: 1, allowed_states:
//      [classify]) enforces correctly: one question in classify is
//      accepted, a second question is rejected
//      (question-economy-exceeded), and a question outside classify
//      would be rejected as wrong-state (the negative case is
//      asserted).
//   5. The verify-equivalence state emits a Validation with method
//      "replay_comparison" — the only workflow that uses this
//      Validation method. This is what makes refactor distinct from
//      feature-request (which uses method: "app_validation"): the
//      refactor's defining question is "did the behavior change?"
//      and replay_comparison is the method named for exactly that.
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
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "refactor.sm.yaml");

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
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-refactor-"));
  const runDir = join(runDirParent, "evidence-and-memory");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  console.log("=== End-to-end refactor run: 'extract parseExpiryDate from validateMembership' ===\n");
  console.log("User request: 'clean up validateMembership — the date parsing should be its own helper'\n");

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  run.advance("intent_classified");
  check("state is classify", run.currentState === "classify");

  // classify: one allowed question. The one decision-changing
  // question for refactor that the code cannot answer itself is the
  // GOAL: readability, performance, or maintainability — different
  // goals produce different refactors from the same starting code.
  // The user said "clean up" (vague), so the goal is genuinely
  // ambiguous and the question is necessary.
  run.askQuestion("Is this refactor for readability, performance, or maintainability?");
  check("question count is 1 (at max_questions=1)", run.questions.count === 1);

  // Emit a Trace + Decision recording the acceptance: proceed, scope
  // = maintainability-focused extract-to-module.
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
    source: "project-intelligence.json + grep -rn 'expir' src/",
    payload: {
      finding: "validateMembership() in src/membership.ts is 87 lines, mixes date parsing with field validation; parseExpiryDate candidate extraction identified; no behavior change requested",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-refactor-1",
    trace_ref: "trace-classify-1",
    what: "acceptance:proceed_with_refactor",
    why: "request is behavior-preserving (no 'and also make it do X'); goal = maintainability per user's classify answer; scope = extract parseExpiryDate to dedicated module",
    validated: true,
    result: "accepted",
  });
  run.advance("class_known");
  check("state is capture-baseline", run.currentState === "capture-baseline");

  // ------------------------------------------------------------------
  // capture-baseline -> design-refactor
  // ------------------------------------------------------------------
  // Run the existing test suite (8 tests) and capture as a Trace of
  // test_result Events. The baseline Expected is the behavioral
  // contract the refactor must NOT break.
  const baselineTests = [
    "test_validateMembership_valid_input_returns_valid",
    "test_validateMembership_missing_expiry_returns_invalid",
    "test_validateMembership_null_input_throws",
    "test_validateMembership_iso_date_parses_correctly",
    "test_validateMembership_rfc2822_date_parses_correctly",
    "test_validateMembership_expired_membership_returns_invalid",
    "test_validateMembership_future_expiry_returns_valid",
    "test_validateMembership_empty_string_expiry_returns_invalid",
  ];
  const baselineEventIds = baselineTests.map(
    (_, i) => `event-baseline-test-${i + 1}`
  );

  await run.emitEvidence("trace", {
    id: "trace-capture-baseline-1",
    started_at: new Date().toISOString(),
    source: "test_runner",
    event_refs: baselineEventIds,
  });
  for (let i = 0; i < baselineTests.length; i++) {
    await run.emitEvidence("event", {
      id: baselineEventIds[i],
      trace_ref: "trace-capture-baseline-1",
      ts: new Date().toISOString(),
      kind: "test_result",
      source: "vitest run src/membership.test.ts (before any change)",
      payload: {
        test_name: baselineTests[i],
        result: "passed",
      },
    });
  }
  await run.emitEvidence("expected", {
    id: "expected-baseline-membership-behavior",
    source_ref: "src/membership.test.ts (8 existing tests, all green pre-refactor)",
    predicate:
      "validateMembership(input) returns the same shape of result for all 8 baseline test cases after refactor as before; specifically: ISO date strings parse, RFC2822 date strings parse, missing/null/empty expiry returns invalid, expired memberships return invalid, future memberships return valid",
    predicate_kind: "behavioral",
  });
  run.advance("baseline_captured");
  check("state is design-refactor", run.currentState === "design-refactor");

  // ------------------------------------------------------------------
  // design-refactor -> implement
  // ------------------------------------------------------------------
  // Design Decision: extract parseExpiryDate into a new pure module
  // src/membership/parsing.ts. Alternatives recorded (extract-method
  // into the same file; extract-to-class) with rejection reasons.
  await run.emitEvidence("trace", {
    id: "trace-design-refactor-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-design-choice"],
  });
  await run.emitEvidence("event", {
    id: "event-design-choice",
    trace_ref: "trace-design-refactor-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "design-decision",
    payload: {
      choice:
        "extract parseExpiryDate(s: string): Date | null into a new pure module src/membership/parsing.ts, exported and re-exported from src/membership.ts (preserving the public API surface)",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-refactor-design",
    trace_ref: "trace-design-refactor-1",
    what: "design:extract_to_module_src_membership_parsing_ts",
    why: "matches user's maintainability answer; isolates the date-parsing concern from field-validation logic; enables future targeted testing of parseExpiryDate without going through validateMembership; preserves the public API surface (re-export from src/membership.ts)",
    validated: false, // proposal until verify-equivalence confirms
    result: "pending",
    alternatives: [
      {
        option:
          "extract-method: keep parseExpiryDate as a private function at the bottom of src/membership.ts",
        rejected_because:
          "src/membership.ts is already 600 lines; extracting in-place does not address the maintainability goal and makes the file harder to navigate, not easier",
      },
      {
        option: "extract-to-class: MembershipDateParser class with parse() method",
        rejected_because:
          "no shared state to justify a class; parseExpiryDate is a pure function and a class wrapper would add boilerplate with no encapsulation benefit",
      },
    ],
  });
  await run.emitEvidence("expected", {
    id: "expected-new-internal-structure",
    source_ref: "design-decision-refactor-design",
    predicate:
      "new module src/membership/parsing.ts exports parseExpiryDate(s: string): Date | null as a pure function (no side effects, no module-level mutable state, ≤ 20 lines); src/membership.ts re-exports parseExpiryDate so existing imports continue to work unchanged",
    predicate_kind: "state_property",
  });
  run.advance("refactor_design_approved");
  check("state is implement", run.currentState === "implement");

  // ------------------------------------------------------------------
  // implement: safety gate fires here (broad-refactor -> edit_source,
  // default policy = "ask"). Confirm an un-confirmed advance is blocked
  // BEFORE we proceed via advanceWithConfirmation.
  // ------------------------------------------------------------------
  await expectViolation(
    "un-confirmed transition out of implement is blocked by safety gate",
    "safety-gate-needs-confirmation",
    () => run.advance("implementation_complete")
  );
  check("state is still implement after blocked attempt", run.currentState === "implement");

  // Now simulate the human confirming and proceed.
  run.advanceWithConfirmation("implementation_complete");
  check("state is verify-equivalence after confirmation", run.currentState === "verify-equivalence");

  // Emit the implementation Decision (AI proposal, validated=false)
  // + a file_change Event describing what changed structurally. We
  // emit these AFTER the confirmed advance for narrative simplicity
  // (the schema permits this — Decision only requires trace_ref +
  // what + why + validated). In a real run these would be emitted
  // during the implement state, before the gate-checked advance.
  await run.emitEvidence("decision", {
    id: "decision-impl-extract-parse-expiry-date",
    trace_ref: "trace-design-refactor-1",
    what: "ai_proposal:apply_refactor_extract_parseExpiryDate",
    why: "created src/membership/parsing.ts with pure parseExpiryDate(s: string): Date | null; updated src/membership.ts to import + re-export parseExpiryDate and call it from validateMembership; deleted the inline date-parsing block from validateMembership; no other callers",
    validated: false, // AI proposal — flipped to true only after verify-equivalence
    result: "pending",
  });
  await run.emitEvidence("event", {
    id: "event-impl-file-change",
    trace_ref: "trace-design-refactor-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "src/membership.ts, src/membership/parsing.ts (new)",
    payload: {
      diff_summary:
        "added src/membership/parsing.ts (18 lines, exports parseExpiryDate); src/membership.ts: removed inline parseExpiryDate block (12 lines), added import + re-export; net LOC change: +6; files touched: 2 (under broad_refactor_threshold max_files=10, max_loc=300)",
      public_api_surface: "unchanged — parseExpiryDate is re-exported from src/membership.ts, so existing imports continue to resolve",
    },
  });

  // Negative test: confirm a second question would exceed the budget.
  // Asked from verify-equivalence state, which is NOT in
  // allowed_states (only classify is), so it should be rejected for
  // that reason first — the wrong-state kind is the more specific
  // violation, so that's what we expect.
  await expectViolation(
    "question asked in verify-equivalence state (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should I name the new file parsing.ts or date-helpers.ts?")
  );

  // Also confirm the budget itself: a fresh run, one question already
  // asked in classify, a second question in classify should be
  // rejected as exceeded (not wrong-state, since classify IS in
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
  // verify-equivalence -> document
  // ------------------------------------------------------------------
  // Re-run the captured baseline tests against the refactored code.
  // All 8 tests still pass (behavior preserved). Emit a Trace of
  // the post-refactor run + an Actual recording the observed
  // behavior + a Validation with method: "replay_comparison" (the
  // canonical validation method for refactor — this is the only
  // workflow that uses it).
  const postRefactorEventIds = baselineTests.map(
    (_, i) => `event-post-refactor-test-${i + 1}`
  );
  await run.emitEvidence("trace", {
    id: "trace-verify-equivalence-1",
    started_at: new Date().toISOString(),
    source: "test_runner",
    event_refs: postRefactorEventIds,
  });
  for (let i = 0; i < baselineTests.length; i++) {
    await run.emitEvidence("event", {
      id: postRefactorEventIds[i],
      trace_ref: "trace-verify-equivalence-1",
      ts: new Date().toISOString(),
      kind: "test_result",
      source: "vitest run src/membership.test.ts (after refactor)",
      payload: {
        test_name: baselineTests[i],
        result: "passed",
        note: "post-refactor result identical to baseline (all 8 tests still pass with identical assertion outcomes)",
      },
    });
  }
  await run.emitEvidence("actual", {
    id: "actual-post-refactor-equivalence",
    expected_ref: "expected-baseline-membership-behavior",
    observed_value:
      "all 8 baseline tests pass against refactored code with identical assertion outcomes; ISO date strings parse to same Date values; RFC2822 date strings parse to same Date values; missing/null/empty expiry returns invalid; expired/future membership boundary checks behave identically",
    observation_ref: "event-post-refactor-test-1",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("validation", {
    id: "validation-equivalence-replay",
    expected_ref: "expected-baseline-membership-behavior",
    actual_ref: "actual-post-refactor-equivalence",
    result: "match",
    method: "replay_comparison",
    evidence_refs: [
      // Both the baseline events and the post-refactor events —
      // the Validation exists to make the comparison between these
      // two citable. Per skills/refactor/SKILL.md, a Validation
      // with only post-refactor evidence has nothing to compare
      // against and is unverifiable.
      ...baselineEventIds,
      ...postRefactorEventIds,
    ],
    decision_ref: "decision-impl-extract-parse-expiry-date",
    validated_at: new Date().toISOString(),
  });
  run.advance("equivalence_verified");
  check("state is document", run.currentState === "document");

  // ------------------------------------------------------------------
  // document -> report
  // ------------------------------------------------------------------
  // Update internal-architecture docs (module map). For refactor,
  // this is usually more important than user-facing docs (which
  // describe behavior, and behavior didn't change).
  await run.emitEvidence("event", {
    id: "event-doc-update",
    trace_ref: "trace-design-refactor-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "docs/architecture.md",
    payload: {
      diff_summary:
        "added 'src/membership/parsing.ts' to module map; updated membership module entry to reflect the extract; added one-line note that parseExpiryDate is now a pure helper exported from the new module",
    },
  });
  run.advance("documentation_complete");
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // report: write project memory entry recording the new structural
  // fact, so future workflows do not re-derive or re-propose the
  // same extraction.
  // ------------------------------------------------------------------
  await run.writeMemory("project", {
    id: "mem-project-membership-parsing-extracted-2026-08-14",
    type: "project",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "refactor-run-1",
    stack: ["typescript"],
    layer: ["backend"],
    domain:
      "membership service with parseExpiryDate extracted to src/membership/parsing.ts as a pure helper (behavior-preserving refactor, equivalence verified via replay_comparison)",
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

  const memoryKinds = ["project"];
  for (const kind of memoryKinds) {
    const dir = join(runDir, "memory", kind);
    const files = await readdir(dir).catch(() => []);
    check(`memory/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  // Spot-check the persisted Validation to confirm it round-tripped
  // through schema validation with method=replay_comparison (the
  // canonical refactor validation method — the only workflow that
  // uses this method).
  const persistedValidation = JSON.parse(
    await readFile(join(runDir, "evidence", "validation", "validation-equivalence-replay.json"), "utf-8")
  );
  check(
    "persisted validation has method=replay_comparison (canonical for refactor)",
    persistedValidation.method === "replay_comparison"
  );
  check(
    "persisted validation has result=match (behavior preserved)",
    persistedValidation.result === "match"
  );
  check(
    "persisted validation references both baseline AND post-refactor evidence",
    Array.isArray(persistedValidation.evidence_refs) &&
      persistedValidation.evidence_refs.some((r) => r.startsWith("event-baseline-test-")) &&
      persistedValidation.evidence_refs.some((r) => r.startsWith("event-post-refactor-test-"))
  );

  // Spot-check the persisted implementation Decision to confirm it's
  // an AI proposal (validated=false), not a self-confirmed claim.
  const persistedImplDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-impl-extract-parse-expiry-date.json"), "utf-8")
  );
  check(
    "persisted impl decision has validated=false (AI proposal, awaiting verify-equivalence)",
    persistedImplDecision.validated === false &&
      persistedImplDecision.what.startsWith("ai_proposal:")
  );

  // Spot-check the design Decision to confirm alternatives are
  // recorded (decision trace per constitution/engineering-principles.md).
  const persistedDesignDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-refactor-design.json"), "utf-8")
  );
  check(
    "persisted design decision records at least 2 rejected alternatives",
    Array.isArray(persistedDesignDecision.alternatives) &&
      persistedDesignDecision.alternatives.length >= 2
  );

  // Spot-check the baseline Expected (the contract the refactor
  // must not break) — this is distinct from the structural Expected
  // authored in design-refactor.
  const persistedBaselineExpected = JSON.parse(
    await readFile(join(runDir, "evidence", "expected", "expected-baseline-membership-behavior.json"), "utf-8")
  );
  check(
    "persisted baseline expected has predicate_kind=behavioral",
    persistedBaselineExpected.predicate_kind === "behavioral"
  );
  const persistedStructuralExpected = JSON.parse(
    await readFile(join(runDir, "evidence", "expected", "expected-new-internal-structure.json"), "utf-8")
  );
  check(
    "persisted structural expected has predicate_kind=state_property (distinct from baseline behavioral)",
    persistedStructuralExpected.predicate_kind === "state_property"
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
  console.log("- refactor.sm.yaml loads through the real executor");
  console.log("- A full WorkflowRun walks all 7 non-terminal states + 1 terminal (report)");
  console.log("- Schema-valid evidence emitted at every emitting state (6 of 9 states)");
  console.log("- broad-refactor safety gate at `implement` blocks un-confirmed advance, allows confirmed");
  console.log("- question_economy enforces max_questions=1 and allowed_states=[classify]");
  console.log("- Negative tests: question in verify-equivalence (wrong-state) rejected;");
  console.log("  second question in classify (exceeded) rejected in a fresh run");
  console.log("- verify-equivalence emits Validation with method=replay_comparison + result=match");
  console.log("  (the only workflow that uses replay_comparison as its validation method)");
  console.log("- All evidence persisted to disk as JSON (would have thrown on schema violation)");
  console.log("- Project memory entry written at `report` state recording the new structural fact");
}

scenario().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
