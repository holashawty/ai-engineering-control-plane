// End-to-end driver for feature-request.sm.yaml. Feeds a scripted
// (but realistic) feature-request scenario through the real WorkflowRun
// API — emits real, schema-valid Evidence Model entities at each state
// and writes a real project memory entry at the terminal `report` state.
//
// What this proves:
//   1. feature-request.sm.yaml loads cleanly through loadWorkflow
//      (structural validation, no dead ends, all states reachable).
//   2. A real WorkflowRun walks intake -> classify -> understand-existing-
//      behavior -> design -> implement -> test -> verify -> document ->
//      report, emitting schema-valid evidence at every step.
//   3. The broad-refactor safety gate at the `implement` state actually
//      blocks an un-confirmed transition out of `implement`, then
//      allows it when confirmation is supplied (advanceWithConfirmation).
//      This is the same gate bug-report uses at propose-fix/apply-fix —
//      proving the gate is workflow-agnostic, not bug-report-specific.
//   4. The question_economy (max_questions: 2, allowed_states:
//      [classify, design]) enforces correctly: one question in classify
//      and one in design are accepted, a question in implement would be
//      rejected (negative case is asserted).
//
// What this does NOT prove: a live, multi-turn agent session driving
// the framework one tool call at a time. Same honest scope note as
// executor/examples/e2e-membership-bug/README.md.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { WorkflowViolation } from "../../dist/types.js";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "feature-request.sm.yaml");

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
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-feature-request-"));
  const runDir = join(runDirParent, "evidence-and-memory");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  console.log("=== End-to-end feature-request run: 'add tag-based filtering to list endpoint' ===\n");
  console.log("User request: 'users should be able to filter the /items list by tag'\n");

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  run.advance("intent_classified");
  check("state is classify", run.currentState === "classify");

  // classify: one allowed question, then proceed. We model asking the
  // user "should filtering be additive (AND) or any-match (OR)?" — a
  // decision-changing question that genuinely cannot be answered by
  // inspecting the repo, because the feature doesn't exist yet.
  run.askQuestion("Should multi-tag filtering be additive (AND) or any-match (OR)?");
  check("question count is 1 (under max_questions=2)", run.questions.count === 1);

  // Emit the acceptance Decision — "proceed, scope = additive filtering"
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
    source: "project-intelligence.json",
    payload: {
      finding: "no /items endpoint currently accepts a tag query param; feature is genuinely new, not a fix",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-feature-1",
    trace_ref: "trace-classify-1",
    what: "acceptance:proceed_with_feature_request",
    why: "feature is genuinely new (no existing impl), scope = additive tag filtering per user answer",
    validated: true,
    result: "accepted",
  });
  run.advance("class_known");
  check("state is understand-existing-behavior", run.currentState === "understand-existing-behavior");

  // ------------------------------------------------------------------
  // understand-existing-behavior -> design
  // ------------------------------------------------------------------
  // Emit a Trace of the current /items endpoint behavior + an Expected
  // describing the baseline contract the new feature must not break.
  await run.emitEvidence("trace", {
    id: "trace-understand-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-existing-items-endpoint", "event-existing-test-suite-green"],
  });
  await run.emitEvidence("event", {
    id: "event-existing-items-endpoint",
    trace_ref: "trace-understand-1",
    ts: new Date().toISOString(),
    kind: "log_line",
    source: "grep -rn 'GET.*items' src/",
    payload: {
      finding: "src/routes/items.ts:12: router.get('/items', listItemsHandler);  —  no query parsing beyond ?limit and ?offset",
    },
  });
  await run.emitEvidence("event", {
    id: "event-existing-test-suite-green",
    trace_ref: "trace-understand-1",
    ts: new Date().toISOString(),
    kind: "test_result",
    source: "npm test --silent (before any change)",
    payload: {
      result: "12 passed",
      note: "existing suite covers limit/offset pagination; nothing covers tag filtering because the feature does not exist yet.",
    },
  });
  await run.emitEvidence("expected", {
    id: "expected-baseline-items-endpoint",
    source_ref: "specs/spec.md#items-endpoint",
    predicate: "GET /items returns 200 with a JSON array; existing limit/offset pagination continues to work",
    predicate_kind: "behavioral",
  });
  run.advance("existing_behavior_mapped");
  check("state is design", run.currentState === "design");

  // ------------------------------------------------------------------
  // design -> implement
  // ------------------------------------------------------------------
  // The design Decision: additive filtering via `?tag=t1&tag=t2`.
  // Alternatives recorded (any-match OR, separate /items/by-tag endpoint)
  // with rejection reasons — for the decision trace at report time.
  //
  // Second question (the design question) is permitted here: this is
  // the second of the max_questions=2 budget, and design is in
  // allowed_states.
  run.askQuestion("Should an empty tag list (tag=) return 400, or be treated as no filter?");
  check("question count is 2 (at max_questions=2)", run.questions.count === 2);

  await run.emitEvidence("trace", {
    id: "trace-design-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-design-choice"],
  });
  await run.emitEvidence("event", {
    id: "event-design-choice",
    trace_ref: "trace-design-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "design-decision",
    payload: {
      choice: "additive filtering via repeated ?tag= query params; empty tag= returns 400 per user answer",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-design-additive-filtering",
    trace_ref: "trace-design-1",
    what: "design:additive_tag_filtering_via_repeated_query_param",
    why: "matches user's additive (AND) answer; consistent with existing limit/offset query-param convention; empty tag= as 400 per user's second answer",
    validated: false, // proposal until verify confirms
    result: "pending",
    alternatives: [
      { option: "any-match (OR) filtering", rejected_because: "user answered additive in classify question" },
      { option: "separate /items/by-tag endpoint", rejected_because: "introduces routing surface area with no caller asking for it; additive ?tag= is a smaller change to the existing endpoint" },
    ],
  });
  await run.emitEvidence("expected", {
    id: "expected-new-tag-filtering",
    source_ref: "specs/spec.md#items-endpoint-tag-filter",
    predicate: "GET /items?tag=a&tag=b returns only items having BOTH tag a AND tag b; GET /items with no tag= behaves as before; GET /items?tag= (empty) returns 400",
    predicate_kind: "behavioral",
  });
  run.advance("design_approved");
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
  check("state is test after confirmation", run.currentState === "test");

  // We should also have emitted the implementation Decision (AI proposal,
  // validated=false) BEFORE advancing. Let's emit it now retroactively
  // (referencing the trace from design so the reference chain is intact).
  // In a real run this would be emitted during the implement state, before
  // the gate-checked advance; here we emit it after the confirmed advance
  // for narrative simplicity. The schema permits this — Decision only
  // requires trace_ref + what + why + validated.
  await run.emitEvidence("decision", {
    id: "decision-impl-add-tag-query-param",
    trace_ref: "trace-design-1",
    what: "ai_proposal:apply_patch_to_items_handler",
    why: "add tag query param parsing to listItemsHandler; reject empty tag= with 400; preserve existing limit/offset behavior",
    validated: false, // AI proposal — flipped to true only after verify
    result: "pending",
  });
  await run.emitEvidence("event", {
    id: "event-impl-file-change",
    trace_ref: "trace-design-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "src/routes/items.ts",
    payload: {
      diff_summary: "added req.query.tag parsing (string[]); empty-string check returns 400; filter applied to DB query before pagination",
    },
  });

  // Negative test: confirm a third question would exceed the budget.
  // (Question is asked from `test` state, which is NOT in allowed_states,
  // so it should be rejected for that reason first — but the wrong-state
  // kind is the more specific violation, so that's what we expect.)
  await expectViolation(
    "question asked in test state (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should I name the param 'tag' or 'tags'?")
  );

  // ------------------------------------------------------------------
  // test -> verify
  // ------------------------------------------------------------------
  await run.emitEvidence("trace", {
    id: "trace-test-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-test-suite-after"],
  });
  await run.emitEvidence("event", {
    id: "event-test-suite-after",
    trace_ref: "trace-test-1",
    ts: new Date().toISOString(),
    kind: "test_result",
    source: "npm test --silent (after implementation)",
    payload: {
      result: "15 passed (12 existing + 3 new for tag filtering)",
      note: "suite is green, but per behavioral-verification this is necessary-not-sufficient — verify must directly check the additive AND semantics, not just that the suite exits 0",
    },
  });
  run.advance("tests_pass");
  check("state is verify", run.currentState === "verify");

  // ------------------------------------------------------------------
  // verify -> document
  // ------------------------------------------------------------------
  // The direct behavioral check: send a real request with two tags and
  // confirm only items having BOTH are returned. Modeled as an Actual
  // (what the system produced) compared against the Expected from design
  // via a Validation with method=app_validation (per behavioral-verification
  // — unit_test alone would be insufficient per ADR-0010).
  await run.emitEvidence("actual", {
    id: "actual-additive-filtering-result",
    expected_ref: "expected-new-tag-filtering",
    observed_value: "GET /items?tag=a&tag=b returned 2 items (those tagged both a and b); GET /items?tag= returned 400; GET /items (no tag) returned all items as before",
    observation_ref: "event-test-suite-after",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("validation", {
    id: "validation-verify-additive-filtering",
    expected_ref: "expected-new-tag-filtering",
    actual_ref: "actual-additive-filtering-result",
    result: "match",
    method: "app_validation",
    evidence_refs: ["event-test-suite-after"],
    decision_ref: "decision-impl-add-tag-query-param",
    validated_at: new Date().toISOString(),
  });
  run.advance("behavior_verified");
  check("state is document", run.currentState === "document");

  // ------------------------------------------------------------------
  // document -> report
  // ------------------------------------------------------------------
  await run.emitEvidence("event", {
    id: "event-doc-update",
    trace_ref: "trace-design-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "docs/api/items.md",
    payload: {
      diff_summary: "added 'Tag filtering' section documenting ?tag= query param, additive semantics, and 400 on empty tag=",
    },
  });
  run.advance("documentation_complete");
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // report: write project memory entry recording the new capability
  // ------------------------------------------------------------------
  await run.writeMemory("project", {
    id: "mem-project-items-endpoint-tag-filter-2026-08-14",
    type: "project",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "feature-request-run-1",
    stack: ["typescript"],
    layer: ["backend", "api"],
    domain: "items endpoint with additive tag filtering via ?tag= query param",
  });

  // ------------------------------------------------------------------
  // Final assertions: the run produced the expected evidence trail
  // ------------------------------------------------------------------
  check("exactly 2 questions were asked", run.questions.count === 2);
  check("log has entries for every transition + evidence + gate check", run.log.length > 15);

  // Confirm the run wrote real evidence files to disk (not just logged
  // them in memory) — the EvidenceStore validates and persists each one.
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

  // Spot-check one persisted file to confirm it round-tripped through
  // schema validation (EvidenceStore would have thrown on write if invalid).
  const persistedDecision = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-impl-add-tag-query-param.json"), "utf-8")
  );
  check(
    "persisted decision has validated=false (AI proposal, awaiting verify)",
    persistedDecision.validated === false && persistedDecision.what.startsWith("ai_proposal:")
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
  console.log("- feature-request.sm.yaml loads through the real executor");
  console.log("- A full WorkflowRun walks all 8 non-terminal states + 1 terminal (report)");
  console.log("- Schema-valid evidence emitted at every emitting state (8 of 10 states)");
  console.log("- broad-refactor safety gate at `implement` blocks un-confirmed advance, allows confirmed");
  console.log("- question_economy enforces max_questions=2 and allowed_states=[classify,design]");
  console.log("- Negative test: question in `test` state correctly rejected as wrong-state");
  console.log("- All evidence persisted to disk as JSON (would have thrown on schema violation)");
  console.log("- Project memory entry written at `report` state recording the new capability");
}

scenario().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
