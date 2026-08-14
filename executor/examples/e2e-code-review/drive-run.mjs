// End-to-end driver for code-review.sm.yaml. Feeds a scripted (but
// realistic) code-review scenario through the real WorkflowRun API —
// emits real, schema-valid Evidence Model entities at each state and
// writes a real project memory entry at the terminal `report` state.
//
// What this proves:
//   1. code-review.sm.yaml loads cleanly through loadWorkflow
//      (structural validation, no dead ends, all states reachable,
//      no safety_gates declared because the workflow is read-only).
//   2. A real WorkflowRun walks intake -> classify -> understand-change
//      -> assess -> review -> report, emitting schema-valid evidence
//      at every emitting state.
//   3. NO safety gate fires during the run — proving the workflow
//      correctly declares no gates. The run log has zero "gate-check"
//      entries (every other e2e driver in this repo has them —
//      bug-report at propose-fix/apply-fix, feature-request at
//      implement). This is the structural inverse of those drivers:
//      proving the gate logic is workflow-declaration-driven, not
//      unconditional.
//   4. The question_economy (max_questions: 1, allowed_states:
//      [classify]) enforces correctly: one question in classify is
//      accepted, a second question in classify is rejected as
//      question-economy-exceeded, and a question in understand-change
//      (not in allowed_states) is rejected as question-economy-wrong-
//      state (asserted in a fresh run to avoid the budget already
//      being exhausted in the main scenario).
//   5. A second scenario walks the failure path: review surfaces a
//      real concern (the /health endpoint masks DB-down state),
//      validation result is "mismatch", transitions to blocked on
//      review_blocked_by_unresolved_concern — demonstrating the
//      terminal `blocked` state is reachable and the validation
//      result is correctly emitted as mismatch, not silently match.
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
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "code-review.sm.yaml");

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

// The diff under review (happy path): adds GET /health to an Express
// app, plus a test file. The change is clean and the review approves.
const HAPPY_DIFF = `--- a/src/routes/health.ts
+++ b/src/routes/health.ts
@@ -0,0 +1,7 @@
+import { Router } from "express";
+export const healthRouter = Router();
+healthRouter.get("/health", (_req, res) => {
+  res.json({ status: "ok" });
+});
--- a/src/app.ts
+++ b/src/app.ts
@@ -3,4 +3,5 @@ import { itemsRouter } from "./routes/items";
+import { healthRouter } from "./routes/health";
 app.use(itemsRouter);
+app.use(healthRouter);
--- /dev/null
+++ b/tests/health.test.ts
@@ -0,0 +1,8 @@
+import request from "supertest";
+import { app } from "../src/app";
+describe("GET /health", () => {
+  it("returns 200 with { status: 'ok' }", async () => {
+    const res = await request(app).get("/health");
+    expect(res.status).toBe(200);
+    expect(res.body).toEqual({ status: "ok" });
+  });
+});`;

// The diff under review (failure path): /health endpoint that always
// returns 200 even when the DB is down — defeats the purpose of a
// health check that an orchestrator would use to route traffic.
const FAILURE_DIFF = `--- a/src/routes/health.ts
+++ b/src/routes/health.ts
@@ -0,0 +1,6 @@
+import { Router } from "express";
+export const healthRouter = Router();
+healthRouter.get("/health", (_req, res) => {
+  // always ok — orchestrator will route traffic here
+  res.json({ status: "ok" });
+});`;

// ---------------------------------------------------------------------------
// Scenario 1: happy path — clean /health endpoint addition, validation
// matches, project memory written at report.
// ---------------------------------------------------------------------------
async function scenarioHappyPath(runDir) {
  console.log("=== End-to-end code-review run (happy): 'add /health endpoint to Express app' ===\n");
  console.log("User request: 'review this PR before I merge it'\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  check("workflow loaded with name 'code-review'", def.workflow === "code-review");
  check("initial state is intake", run.currentState === "intake");
  check("workflow declares no safety_gates (read-only by design)",
    !def.safety_gates || def.safety_gates.length === 0);
  check("question_economy budget is 1, allowed_states=[classify]",
    def.question_economy.max_questions === 1 &&
    JSON.stringify(def.question_economy.allowed_states) === JSON.stringify(["classify"]));

  // ------------------------------------------------------------------
  // intake -> classify
  // ------------------------------------------------------------------
  run.advance("intent_classified");
  check("state is classify", run.currentState === "classify");

  // classify: one allowed question, then proceed. We model asking the
  // user "is this intended for the next release or a hotfix?" — a
  // decision-changing question (hotfixes need stricter rollback review)
  // that the diff itself cannot answer.
  run.askQuestion("Is this intended for the next release or a hotfix?");
  check("question count is 1 (at max_questions=1)", run.questions.count === 1);

  // Negative test: a second question in classify exceeds the budget.
  await expectViolation(
    "second question in classify exceeds max_questions=1",
    "question-economy-exceeded",
    () => run.askQuestion("Second question — should be rejected.")
  );

  // Emit the acceptance Decision (proceed: next release, lower rollback
  // review bar).
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
    source: "git log --oneline -5",
    payload: {
      finding: "PR #142: 'add /health endpoint' — single commit, touches src/routes/health.ts (new), src/app.ts (1-line wiring), tests/health.test.ts (new)",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-review-1",
    trace_ref: "trace-classify-1",
    what: "acceptance:proceed_with_code_review",
    why: "review class = new feature merge; target = next release per user answer (lower rollback-review bar); diff is small and self-contained",
    validated: true,
    result: "accepted",
  });
  run.advance("class_known");
  check("state is understand-change", run.currentState === "understand-change");

  // ------------------------------------------------------------------
  // understand-change: capture the diff itself as a file_change Event,
  // emit a baseline Expected the change must not break.
  // ------------------------------------------------------------------
  await run.emitEvidence("trace", {
    id: "trace-understand-change-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-diff-captured", "event-grep-existing-routes"],
  });
  await run.emitEvidence("event", {
    id: "event-diff-captured",
    trace_ref: "trace-understand-change-1",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "git diff main..feature/health-endpoint",
    payload: {
      diff: HAPPY_DIFF,
      files_changed: 3,
      additions: 16,
      deletions: 0,
    },
  });
  await run.emitEvidence("event", {
    id: "event-grep-existing-routes",
    trace_ref: "trace-understand-change-1",
    ts: new Date().toISOString(),
    kind: "log_line",
    source: "grep -rn 'Router()' src/",
    payload: {
      finding: "src/routes/items.ts:2: export const itemsRouter = Router();  — single existing route module; /health follows the same Router() pattern",
    },
  });
  await run.emitEvidence("expected", {
    id: "expected-baseline-items-endpoint-unchanged",
    source_ref: "specs/spec.md#items-endpoint",
    predicate: "GET /items continues to return 200 with a JSON array; existing limit/offset pagination is unaffected by the /health route addition",
    predicate_kind: "behavioral",
  });
  run.advance("change_mapped");
  check("state is assess", run.currentState === "assess");

  // ------------------------------------------------------------------
  // assess: emit Decision recording concerns (none blocking here) +
  // a new-contract Expected describing what the change claims to do.
  // ------------------------------------------------------------------
  await run.emitEvidence("trace", {
    id: "trace-assess-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-assessment-finding"],
  });
  await run.emitEvidence("event", {
    id: "event-assessment-finding",
    trace_ref: "trace-assess-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "review: read diff + ran the new test",
    payload: {
      finding: "diff adds a small, self-contained /health route following the existing Router() pattern; new test covers the new path; no contract drift; no new security surface (/health is unauthenticated but intentionally so per the existing /items pattern); no performance regression",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-assessment-1",
    trace_ref: "trace-assess-1",
    what: "assessment:proceed_to_review",
    why: "no blocking concerns surfaced; the change is small, follows existing patterns, and is covered by a new test",
    validated: true,
    result: "accepted",
    alternatives: [
      { option: "concern: /health is unauthenticated — could leak service existence", rejected_because: "matches existing /items pattern; /health returns no sensitive data, only { status: 'ok' }" },
      { option: "concern: no rate-limit on /health — could be abused for load", rejected_because: "out of scope for this PR; tracked as a separate follow-up if the route becomes a target" },
    ],
  });
  await run.emitEvidence("expected", {
    id: "expected-health-endpoint-new-contract",
    source_ref: "PR #142 description",
    predicate: "GET /health returns 200 with JSON body { status: 'ok' }; the route is registered on the app via app.use(healthRouter)",
    predicate_kind: "behavioral",
  });
  run.advance("assessment_complete");
  check("state is review", run.currentState === "review");

  // ------------------------------------------------------------------
  // review: emit Actual (what the change actually does, observed) +
  // Validation (did Actual match the new-contract Expected?).
  // method: manual_review — per ADR-0010, unit_test alone is
  // insufficient for a review verdict.
  // ------------------------------------------------------------------
  await run.emitEvidence("actual", {
    id: "actual-health-endpoint-behavior",
    expected_ref: "expected-health-endpoint-new-contract",
    observed_value: "GET /health returns 200 with { status: 'ok' } (verified by reading the diff and running tests/health.test.ts — 1 passed); route is wired into the app via app.use(healthRouter) at src/app.ts:5; does not affect /items behavior (existing tests still pass)",
    observation_ref: "event-assessment-finding",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("validation", {
    id: "validation-review-health-endpoint",
    expected_ref: "expected-health-endpoint-new-contract",
    actual_ref: "actual-health-endpoint-behavior",
    result: "match",
    method: "manual_review",
    evidence_refs: ["event-assessment-finding", "event-diff-captured"],
    decision_ref: "decision-assessment-1",
    validated_at: new Date().toISOString(),
  });
  run.advance("review_complete");
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // report: write project memory recording the change was reviewed
  // and accepted (per spec's "OR a project memory entry if the review
  // approved" branch).
  // ------------------------------------------------------------------
  await run.writeMemory("project", {
    id: "mem-project-health-endpoint-reviewed-2026-08-14",
    type: "project",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "code-review-run-1",
    stack: ["typescript"],
    layer: ["backend", "api"],
    domain: "Express app with /items and /health endpoints; /health was added in PR #142 and accepted via code-review on 2026-08-14 (validation: match, method: manual_review)",
  });

  // ------------------------------------------------------------------
  // Final assertions: the run produced the expected evidence trail
  // ------------------------------------------------------------------
  check("exactly 1 question was asked", run.questions.count === 1);
  check("log has entries for every transition + evidence (no gate-checks)", run.log.length > 10);
  check("log has ZERO gate-check entries (no safety_gates declared)",
    run.log.filter((e) => e.type === "gate-check").length === 0);

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
  const persistedValidation = JSON.parse(
    await readFile(join(runDir, "evidence", "validation", "validation-review-health-endpoint.json"), "utf-8")
  );
  check(
    "persisted validation has result='match' and method='manual_review'",
    persistedValidation.result === "match" && persistedValidation.method === "manual_review"
  );
}

// ---------------------------------------------------------------------------
// Scenario 2: failure path — /health endpoint masks DB-down state,
// validation mismatches, transitions to blocked.
// ---------------------------------------------------------------------------
async function scenarioFailurePath(runDir) {
  console.log("\n=== End-to-end code-review run (failure): '/health masks DB-down state' ===\n");
  console.log("User request: 'review this PR — it adds /health returning { status: ok }'\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  // intake -> classify (no question needed — repo inspection sufficient)
  run.advance("intent_classified");
  check("[scenario 2] state is classify", run.currentState === "classify");

  await run.emitEvidence("trace", {
    id: "trace-classify-2",
    started_at: new Date().toISOString(),
    event_refs: ["event-classify-2"],
  });
  await run.emitEvidence("event", {
    id: "event-classify-2",
    trace_ref: "trace-classify-2",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "git log --oneline -3",
    payload: {
      finding: "PR #143: 'add /health endpoint' — single commit, adds src/routes/health.ts only",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-accept-review-2",
    trace_ref: "trace-classify-2",
    what: "acceptance:proceed_with_code_review",
    why: "review class = new feature merge; intent clear from the diff; no clarifying question needed",
    validated: true,
    result: "accepted",
  });
  run.advance("class_known");
  check("[scenario 2] state is understand-change", run.currentState === "understand-change");

  // understand-change: capture the concerning diff
  await run.emitEvidence("trace", {
    id: "trace-understand-change-2",
    started_at: new Date().toISOString(),
    event_refs: ["event-diff-captured-2"],
  });
  await run.emitEvidence("event", {
    id: "event-diff-captured-2",
    trace_ref: "trace-understand-change-2",
    ts: new Date().toISOString(),
    kind: "file_change",
    source: "git diff main..feature/health-masks-db",
    payload: {
      diff: FAILURE_DIFF,
      files_changed: 1,
      additions: 6,
      deletions: 0,
      note: "the /health endpoint unconditionally returns { status: 'ok' } without checking DB connection state",
    },
  });
  await run.emitEvidence("expected", {
    id: "expected-baseline-no-health-endpoint-2",
    source_ref: "specs/spec.md#existing-routes",
    predicate: "existing routes (/items) behavior is unchanged by the /health addition",
    predicate_kind: "behavioral",
  });
  run.advance("change_mapped");
  check("[scenario 2] state is assess", run.currentState === "assess");

  // assess: emit Decision recording the blocking concern + a new-contract
  // Expected describing what the change SHOULD do (reflect DB state).
  await run.emitEvidence("trace", {
    id: "trace-assess-2",
    started_at: new Date().toISOString(),
    event_refs: ["event-assessment-finding-2"],
  });
  await run.emitEvidence("event", {
    id: "event-assessment-finding-2",
    trace_ref: "trace-assess-2",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "review: read diff + checked orchestrator config",
    payload: {
      finding: "the orchestrator (k8s) is configured to use /health as a liveness probe; an endpoint that always returns 200 will route traffic to a pod even when its DB connection is down — defeats the purpose of the health check",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-assessment-2",
    trace_ref: "trace-assess-2",
    what: "assessment:concerns_surfaced",
    why: "one blocking concern: /health masks DB-down state, which an orchestrator using /health as a liveness probe would treat as healthy and route traffic to",
    validated: true,
    result: "accepted",
    alternatives: [
      { option: "concern: /health always returns 200 — blocking", rejected_because: "not rejected; this is the blocking concern being surfaced for the review state to validate" },
      { option: "concern: no test for /health", rejected_because: "non-blocking in this scenario; the blocking concern is the masking behavior, not the missing test" },
    ],
  });
  await run.emitEvidence("expected", {
    id: "expected-health-endpoint-should-reflect-db-2",
    source_ref: "orchestrator config: liveness probe -> /health",
    predicate: "GET /health returns 200 with { status: 'ok' } when DB is reachable; returns 503 with { status: 'db_unreachable' } when DB is not reachable",
    predicate_kind: "behavioral",
  });
  run.advance("assessment_complete");
  check("[scenario 2] state is review", run.currentState === "review");

  // review: Actual mismatches Expected (the change always returns 200,
  // does not reflect DB state). Validation result: mismatch.
  await run.emitEvidence("actual", {
    id: "actual-health-endpoint-always-200-2",
    expected_ref: "expected-health-endpoint-should-reflect-db-2",
    observed_value: "GET /health always returns 200 with { status: 'ok' } regardless of DB connection state (verified by reading the diff: handler body has no DB check; comment in code explicitly says 'always ok')",
    observation_ref: "event-assessment-finding-2",
    observed_at: new Date().toISOString(),
  });
  await run.emitEvidence("validation", {
    id: "validation-review-health-endpoint-2",
    expected_ref: "expected-health-endpoint-should-reflect-db-2",
    actual_ref: "actual-health-endpoint-always-200-2",
    result: "mismatch",
    method: "manual_review",
    evidence_refs: ["event-assessment-finding-2", "event-diff-captured-2"],
    decision_ref: "decision-assessment-2",
    validated_at: new Date().toISOString(),
  });
  run.advance("review_blocked_by_unresolved_concern");
  check("[scenario 2] state is blocked (terminal)", run.currentState === "blocked" && run.isTerminal());
  check("[scenario 2] log has ZERO gate-check entries (no safety_gates declared)",
    run.log.filter((e) => e.type === "gate-check").length === 0);
  check("[scenario 2] no project memory written (review did not approve)",
    run.log.filter((e) => e.type === "evidence" && e.detail.store === "memory").length === 0);
}

// ---------------------------------------------------------------------------
// Scenario 3: question economy — a question asked in understand-change
// (not in allowed_states) is rejected with question-economy-wrong-state.
// Uses a fresh run so the budget is not already exhausted.
// ---------------------------------------------------------------------------
async function scenarioQuestionEconomyWrongState(runDir) {
  console.log("\n=== Question-economy wrong-state assertion ===\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  run.advance("intent_classified"); // classify
  run.advance("class_known");        // understand-change (no question asked, budget still 0)

  await expectViolation(
    "question asked in understand-change (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should /health use a separate router instance?")
  );
}

async function main() {
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-code-review-"));
  try {
    await scenarioHappyPath(join(runDirParent, "scenario1-happy"));
    await scenarioFailurePath(join(runDirParent, "scenario2-failure"));
    await scenarioQuestionEconomyWrongState(join(runDirParent, "scenario3-wrong-state"));
  } finally {
    await rm(runDirParent, { recursive: true, force: true });
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
  console.log("");
  console.log("Proof summary:");
  console.log("- code-review.sm.yaml loads through the real executor");
  console.log("- Happy path: WorkflowRun walks all 5 non-terminal states + 1 terminal (report)");
  console.log("- Failure path: WorkflowRun walks to blocked via review_blocked_by_unresolved_concern");
  console.log("- Schema-valid evidence emitted at every emitting state (6 evidence kinds)");
  console.log("- NO safety gate fires (workflow declares none — read-only by design)");
  console.log("- question_economy enforces max_questions=1 and allowed_states=[classify]");
  console.log("- Negative tests: 2nd question in classify rejected; question in wrong state rejected");
  console.log("- Project memory entry written at report (happy path)");
  console.log("- No project memory written at blocked (failure path) — review did not approve");
}

main().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
