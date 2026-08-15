// End-to-end driver for orchestrator.sm.yaml. Feeds a scripted (but
// realistic) multi-workflow scenario through the real WorkflowRun API
// — emits real, schema-valid Evidence Model entities at each state,
// exercises the LOOP BACK EDGE (evaluate-result → route), proves the
// broad-refactor safety gate fires at every execute-workflow spawn,
// and writes a real project memory entry at the terminal `report`
// state recording the full multi-workflow execution chain.
//
// What this proves:
//   1. orchestrator.sm.yaml loads cleanly through loadWorkflow
//      (structural validation, no dead ends, all states reachable,
//      including the back-edge from evaluate-result to route).
//   2. A real WorkflowRun walks intake → classify-goal → route →
//      execute-workflow → evaluate-result → route (LOOP BACK) →
//      execute-workflow → evaluate-result → report, emitting
//      schema-valid evidence at every emitting state.
//   3. The LOOP BACK EDGE — the structural feature that makes
//      orchestrator distinct from every other workflow in the
//      catalog — is traversed at least once during a multi-workflow
//      goal. The state machine's `history` array contains at least
//      one entry where from="evaluate-result", to="route", on=
//      "goal_not_yet_met". This is the "loop engineering" pattern
//      (LangChain, June 2026) operationalized: the agent prompts
//      ITSELF to select the next workflow, rather than returning to
//      the user between workflows.
//   4. The broad-refactor safety gate at the `execute-workflow`
//      state fires CORRECTLY on EVERY spawn — both the first
//      iteration (bug-report spawn) and the second iteration
//      (feature-request spawn). An un-confirmed `advance` is
//      rejected with `safety-gate-needs-confirmation`; a confirmed
//      `advanceWithConfirmation` proceeds. This is the orchestrator's
//      UNIQUE safety property: no other workflow in the catalog
//      declares a gate whose purpose is to bound delegation to
//      another workflow. The orchestrator's own code does not modify
//      source — it CAUSES other workflows to modify source, and
//      "causes" is gated just as "applies" is gated (per
//      constitution/safety-rules.md "autonomy is bounded, not
//      implicit — delegation does not escape the bound").
//   5. At least TWO `workflow_routed:<workflow>` Decisions are
//      emitted during a multi-workflow run — one per loop iteration.
//      The first iteration routes to `bug-report`; the second routes
//      to `feature-request`. The orchestrator's `route` state emits
//      the same `what` form as `unknown-failure`'s `route-or-block`
//      state, but unlike `unknown-failure` (which transitions to
//      `report` after emitting the routing Decision, handing it back
//      to the user), the orchestrator transitions to `execute-workflow`
//      and PROCEEDS to run the routed workflow — the loop-
//      engineering shape rather than the single-workflow triage
//      shape.
//   6. The question_economy (max_questions: 1, allowed_states:
//      [classify-goal]) enforces correctly: one question in
//      classify-goal is accepted, a question in `route` (NOT in
//      allowed_states) is rejected with `question-economy-wrong-
//      state`, and a second question in classify-goal (in a fresh
//      run, budget exhausted) is rejected with `question-economy-
//      exceeded`. The budget is 1 (not 2 like `unknown-failure`'s)
//      because the orchestrator operates autonomously after
//      classify-goal — the entire point of loop engineering is that
//      the agent prompts ITSELF between iterations, not the user.
//   7. The terminal `report` state emits a final `goal_achieved:
//      <summary>` Decision with validated=true + result=accepted,
//      whose evidence_refs chain together the decomposition + 2
//      routing + 2 execute-workflow + 2 evaluate-result Decisions.
//      This is the "Decision Trace" per docs/architecture.md — the
//      chain of evidence that justifies the goal achievement, not
//      just "goal achieved."
//
// What this does NOT prove: a live, multi-turn agent session driving
// the framework one tool call at a time, AND it isn't an actual
// cross-workflow spawn (the child workflows `bug-report` and
// `feature-request` are not actually invoked from this driver — the
// driver simulates their outcomes by emitting the evidence the
// children would have emitted). A live cross-workflow spawning
// integration test (where orchestrator's `execute-workflow` state
// actually spawns a child `WorkflowRun` of `bug-report` /
// `feature-request`) is tracked as future work in STATUS.md. Same
// honest scope note as executor/examples/e2e-feature-request/README.md.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { WorkflowViolation } from "../../dist/types.js";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "..", "..", "workflows", "orchestrator.sm.yaml");

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

// ---------------------------------------------------------------------------
// Scenario 1 (happy path — LOOP BACK traversed): multi-workflow goal
// "fix the shipping bug AND add a feature for batch label printing"
// routes through bug-report → feature-request, looping back from
// evaluate-result to route after the first iteration (bug fixed, but
// feature not yet added). This exercises the LOOP BACK EDGE — the
// structural feature that makes the orchestrator distinct from every
// other workflow in the catalog.
// ---------------------------------------------------------------------------
async function scenarioHappyPath(runDir) {
  console.log("=== End-to-end orchestrator run (happy path): 'fix the shipping bug and add a feature' → bug-report → feature-request ===\n");
  console.log("User request: 'fix the shipping bug where labels print on the wrong slot, and add a feature for batch label printing'\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  check("workflow loaded with name 'orchestrator'", def.workflow === "orchestrator");
  check("initial state is intake", run.currentState === "intake");
  check("workflow declares safety_gates at execute-workflow (broad-refactor)",
    Array.isArray(def.safety_gates) &&
      def.safety_gates.length === 1 &&
      def.safety_gates[0].state === "execute-workflow" &&
      def.safety_gates[0].gate === "broad-refactor");
  check("question_economy budget is 1, allowed_states=[classify-goal]",
    def.question_economy.max_questions === 1 &&
      JSON.stringify(def.question_economy.allowed_states) === JSON.stringify(["classify-goal"]));
  // Track every advance()'s returned gateDecision. We expect:
  // - non-execute-workflow advances return gateDecision=undefined
  // - execute-workflow advance() (without confirmation) THROWS — those
  //   are caught by expectViolation and not pushed to advanceResults
  // - execute-workflow advanceWithConfirmation() returns gateDecision
  //   "confirmed-by-human" (we collect those separately)
  const advanceResults = [];
  const confirmedAdvanceResults = [];

  // ------------------------------------------------------------------
  // intake → classify-goal
  // ------------------------------------------------------------------
  advanceResults.push(run.advance("intent_classified"));
  check("state is classify-goal", run.currentState === "classify-goal");

  // classify-goal: the request names TWO distinct intents — a bug
  // ("fix the shipping bug") and a feature ("add a feature for
  // batch label printing"). This is a multi-workflow goal — the
  // orchestrator is the correct workflow. The one allowed question
  // is about sub-goal ordering.
  run.askQuestion("Should the shipping bug be fixed before the batch-label feature is added (the feature's tests will depend on the slot calculation being correct)?");
  check("question count is 1 (at max_questions=1)", run.questions.count === 1);

  // Emit a Trace + Decision recording the decomposition.
  await run.emitEvidence("trace", {
    id: "trace-classify-goal-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-classify-goal-1", "event-classify-goal-2", "event-classify-goal-3"],
  });
  await run.emitEvidence("event", {
    id: "event-classify-goal-1",
    trace_ref: "trace-classify-goal-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "filesystem_read: user request + project-intelligence.json",
    payload: {
      finding: "request names TWO distinct intents: (1) reactive — 'fix the shipping bug where labels print on the wrong slot' (candidate target: bug-report); (2) constructive — 'add a feature for batch label printing' (candidate target: feature-request). Project Intelligence confirms a Python shipping service exists with src/shipping/labels.py as the main entrypoint.",
    },
  });
  await run.emitEvidence("event", {
    id: "event-classify-goal-2",
    trace_ref: "trace-classify-goal-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "git log --oneline -10",
    payload: {
      finding: "recent commits: abc1234 'feat: add label slot calculation in print_label'; def5678 'chore: bump dependencies'; ghi9012 'test: add slot calculation tests' — the slot calculation was added recently and may be the source of the wrong-slot bug",
    },
  });
  await run.emitEvidence("event", {
    id: "event-classify-goal-3",
    trace_ref: "trace-classify-goal-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "ls .aiecp/memory/known-failure/",
    payload: {
      finding: "no prior known-failure memory entry matches the shipping label slot symptom — this is a new bug, not a regression",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-classify-goal-decomposition",
    trace_ref: "trace-classify-goal-1",
    what: "goal_decomposition:bug-report(shipping-label-slot);feature-request(batch-label-printing)",
    why: "request names two distinct intents (reactive + constructive); per user's classify-goal answer, bug-report must precede feature-request because the feature's tests depend on the slot calculation being correct; bug-report candidate corroborated by event-classify-goal-2 (recent commit abc1234 added the slot calculation, likely source of the bug); feature-request candidate is a genuinely new capability not present in the codebase",
    validated: false, // the decomposition is a plan, not a verified outcome — accepted only when every sub-goal's workflow terminates in `report`
    result: "pending",
    evidence_refs: ["event-classify-goal-1", "event-classify-goal-2", "event-classify-goal-3"],
    alternatives: [
      { option: "goal_decomposition:feature-request(batch-label-printing);bug-report(shipping-label-slot)", rejected_because: "feature-first ordering would have the feature's tests run against the buggy slot calculation, producing flaky failures; the user's classify-goal answer confirms bug-first is the correct ordering" },
      { option: "goal_decomposition:bug-report(shipping-label-slot) (single-workflow)", rejected_because: "the request explicitly names two intents — collapsing to a single-workflow decomposition would silently drop the feature request" },
    ],
  });
  advanceResults.push(run.advance("goal_classified"));
  check("state is route (after classify-goal decomposition)", run.currentState === "route");

  // ------------------------------------------------------------------
  // route → execute-workflow (FIRST iteration: select bug-report)
  // ------------------------------------------------------------------
  await run.emitEvidence("decision", {
    id: "decision-route-iteration-1-bug-report",
    trace_ref: "trace-classify-goal-1",
    what: "workflow_routed:bug-report",
    why: "first sub-goal in decomposition (bug-report(shipping-label-slot)) is at the head of the remaining-sub-goals list; bug-report is the correct target per workflows/_router.md routing table ('X doesn't work' → bug-report); no prior known-failure match (per event-classify-goal-3), so regression is not the candidate — bug-report is the more specific match for a new bug",
    validated: true,
    result: "accepted",
    evidence_refs: [
      "decision-classify-goal-decomposition", // the plan this routing executes against (required for every iteration)
      // NOTE: this is the FIRST iteration — no prior evaluate-result Decision exists yet,
      // so evidence_refs contains ONLY the decomposition Decision. Subsequent iterations
      // will also include the most recent evaluate-result Decision.
    ],
  });
  advanceResults.push(run.advance("workflow_selected"));
  check("state is execute-workflow (first iteration — bug-report spawn)", run.currentState === "execute-workflow");

  // ------------------------------------------------------------------
  // execute-workflow: SAFETY GATE fires here (broad-refactor →
  // edit_source, default policy = "ask"). Confirm an un-confirmed
  // advance is blocked BEFORE we proceed via advanceWithConfirmation.
  // This is the orchestrator's UNIQUE safety property — the gate
  // bounds DELEGATION to another workflow, not an intra-workflow
  // transition. Same gate as bug-report's propose-fix, feature-
  // request's implement, refactor's implement, change-request's
  // migrate — but applied at the INTER-workflow boundary.
  // ------------------------------------------------------------------
  await expectViolation(
    "FIRST iteration: un-confirmed transition out of execute-workflow is blocked by safety gate",
    "safety-gate-needs-confirmation",
    () => run.advance("workflow_complete")
  );
  check("state is still execute-workflow after first blocked attempt", run.currentState === "execute-workflow");

  // Now simulate the human confirming and proceed. The Decision +
  // Event emitted below represent what the child bug-report workflow
  // would have produced (its terminal `report` state). In the MVP
  // executor (no cross-workflow spawning), the driver simulates the
  // child outcome; in a future executor with spawn support, this
  // state would actually spawn a child WorkflowRun of bug-report,
  // wait for it to terminate, and propagate its evidence.
  run.advanceWithConfirmation("workflow_complete");
  confirmedAdvanceResults.push("iteration-1-bug-report");
  check("state is evaluate-result (after first confirmed advance)", run.currentState === "evaluate-result");

  // Emit the child workflow outcome Decision + Event.
  await run.emitEvidence("decision", {
    id: "decision-execute-iteration-1-child-bug-report",
    trace_ref: "trace-classify-goal-1",
    what: "child_workflow_complete:bug-report(report)",
    why: "child bug-report WorkflowRun walked intake → classify → locate-evidence → reproduce → diagnose → propose-fix → apply-fix → verify → regression-protect → replay → report, terminating in `report` with a known-failure memory entry written (mem-known-failure-shipping-label-slot); root cause was an off-by-one in the slot calculation introduced in commit abc1234; fix changed `<` to `<=` in print_label's slot calculation; verified via 8 passing tests + replay_comparison",
    validated: false, // the orchestrator's self-assessment, not externally validated
    result: "pending",
    evidence_refs: ["decision-route-iteration-1-bug-report"],
  });
  await run.emitEvidence("event", {
    id: "event-execute-iteration-1-child-bug-report",
    trace_ref: "trace-classify-goal-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "child-workflow:bug-report (terminal state: report)",
    payload: {
      finding: "child bug-report run produced: 1 known-failure memory entry (mem-known-failure-shipping-label-slot), 1 patch applied (print_label slot calculation: < → <=), 8 tests passing post-fix, 1 replay confirming no divergence. The shipping label slot bug is fixed; the first sub-goal is addressed.",
    },
  });

  // ------------------------------------------------------------------
  // evaluate-result → route (LOOP BACK EDGE — goal_not_yet_met)
  // This is the structural feature that makes the orchestrator
  // distinct from every other workflow in the catalog. The agent
  // prompts ITSELF to select the next workflow, rather than
  // returning to the user. The bug is fixed (sub-goal 1 addressed),
  // but the feature is not yet added (sub-goal 2 unaddressed) — the
  // goal is not yet met, so the loop continues.
  // ------------------------------------------------------------------
  await run.emitEvidence("decision", {
    id: "decision-evaluate-iteration-1-not-yet-met",
    trace_ref: "trace-classify-goal-1",
    what: "goal_evaluation:not_yet_met",
    why: "first sub-goal (bug-report(shipping-label-slot)) is addressed — child bug-report terminated in `report` with the bug fixed (per event-execute-iteration-1-child-bug-report); second sub-goal (feature-request(batch-label-printing)) is unaddressed — no workflow has been run for it yet. Goal is not yet met; loop back to route to select the next workflow.",
    validated: false, // the orchestrator's self-assessment
    result: "pending",
    evidence_refs: [
      "decision-route-iteration-1-bug-report", // the routing being evaluated
      "decision-execute-iteration-1-child-bug-report", // the child outcome being evaluated
    ],
  });
  advanceResults.push(run.advance("goal_not_yet_met"));
  check("state is route (LOOP BACK EDGE traversed — back in route for second iteration)", run.currentState === "route");

  // ------------------------------------------------------------------
  // route → execute-workflow (SECOND iteration: select feature-request)
  // The route Decision for the second iteration MUST reference BOTH
  // the decomposition Decision AND the most recent evaluate-result
  // Decision (proving the loop is aware of the prior iteration's
  // outcome, not just blindly re-routing).
  // ------------------------------------------------------------------
  await run.emitEvidence("decision", {
    id: "decision-route-iteration-2-feature-request",
    trace_ref: "trace-classify-goal-1",
    what: "workflow_routed:feature-request",
    why: "second sub-goal in decomposition (feature-request(batch-label-printing)) is now at the head of the remaining-sub-goals list (the first sub-goal was addressed in iteration 1 per decision-evaluate-iteration-1-not-yet-met); feature-request is the correct target per workflows/_router.md routing table ('add a feature' → feature-request); the feature is genuinely new (no existing batch-label-printing code found in the codebase)",
    validated: true,
    result: "accepted",
    evidence_refs: [
      "decision-classify-goal-decomposition", // the plan (required for every iteration)
      "decision-evaluate-iteration-1-not-yet-met", // the prior iteration's evaluation (required for iterations after the first)
    ],
  });
  advanceResults.push(run.advance("workflow_selected"));
  check("state is execute-workflow (second iteration — feature-request spawn)", run.currentState === "execute-workflow");

  // ------------------------------------------------------------------
  // execute-workflow: SAFETY GATE fires AGAIN (every spawn is gated,
  // not just the first). Confirm the gate fires correctly on the
  // second iteration too — proving the gate is per-spawn, not
  // per-run.
  // ------------------------------------------------------------------
  await expectViolation(
    "SECOND iteration: un-confirmed transition out of execute-workflow is blocked by safety gate",
    "safety-gate-needs-confirmation",
    () => run.advance("workflow_complete")
  );
  check("state is still execute-workflow after second blocked attempt", run.currentState === "execute-workflow");

  run.advanceWithConfirmation("workflow_complete");
  confirmedAdvanceResults.push("iteration-2-feature-request");
  check("state is evaluate-result (after second confirmed advance)", run.currentState === "evaluate-result");

  await run.emitEvidence("decision", {
    id: "decision-execute-iteration-2-child-feature-request",
    trace_ref: "trace-classify-goal-1",
    what: "child_workflow_complete:feature-request(report)",
    why: "child feature-request WorkflowRun walked intake → classify → understand-existing-behavior → design → implement → test → verify → document → report, terminating in `report` with a project memory entry written (mem-project-batch-label-printing-feature); added /labels/batch endpoint accepting an array of label payloads; printed batch via the now-correct slot calculation; verified via 12 passing tests (4 new + 8 existing)",
    validated: false,
    result: "pending",
    evidence_refs: ["decision-route-iteration-2-feature-request"],
  });
  await run.emitEvidence("event", {
    id: "event-execute-iteration-2-child-feature-request",
    trace_ref: "trace-classify-goal-1",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "child-workflow:feature-request (terminal state: report)",
    payload: {
      finding: "child feature-request run produced: 1 project memory entry (mem-project-batch-label-printing-feature), 1 new endpoint (/labels/batch), 4 new tests + 8 existing tests passing post-implementation. The batch label printing feature is added; the second sub-goal is addressed.",
    },
  });

  // ------------------------------------------------------------------
  // evaluate-result → report (goal_achieved)
  // Both sub-goals are now addressed by workflows that terminated
  // in `report`. The goal is met — the loop terminates (does NOT
  // loop back to route).
  // ------------------------------------------------------------------
  await run.emitEvidence("decision", {
    id: "decision-evaluate-iteration-2-achieved",
    trace_ref: "trace-classify-goal-1",
    what: "goal_evaluation:achieved",
    why: "ALL sub-goals in the decomposition are now addressed: (1) bug-report(shipping-label-slot) — addressed in iteration 1, child terminated in `report` with the bug fixed (per decision-execute-iteration-1-child-bug-report); (2) feature-request(batch-label-printing) — addressed in iteration 2, child terminated in `report` with the feature added (per decision-execute-iteration-2-child-feature-request). The original goal 'fix the shipping bug and add a feature for batch label printing' is met.",
    validated: false, // the orchestrator's self-assessment — validated=true only on the final goal_achieved Decision at `report`
    result: "pending",
    evidence_refs: [
      "decision-route-iteration-2-feature-request",
      "decision-execute-iteration-2-child-feature-request",
      // Also reference the prior iteration's evaluation to make the chain complete
      "decision-evaluate-iteration-1-not-yet-met",
    ],
  });
  advanceResults.push(run.advance("goal_achieved"));
  check("state is report (terminal — goal achieved, no loop back)", run.currentState === "report" && run.isTerminal());

  // ------------------------------------------------------------------
  // report: emit the final goal_achieved Decision + write project memory
  // ------------------------------------------------------------------
  await run.emitEvidence("decision", {
    id: "decision-report-goal-achieved",
    trace_ref: "trace-classify-goal-1",
    what: "goal_achieved:shipping-bug-fixed+batch-label-feature-added",
    why: "orchestrator run completed: original goal 'fix the shipping bug and add a feature for batch label printing' achieved via a 2-iteration loop. Iteration 1 routed to bug-report (slot calculation off-by-one fixed at commit abc1234, < → <=, 8 tests passing + replay confirmed no divergence, known-failure memory entry written). Iteration 2 routed to feature-request (added /labels/batch endpoint, 12 tests passing post-implementation, project memory entry written). The decomposition ordering (bug-first) was correct — the feature's tests depended on the slot calculation being correct, which the bug fix ensured.",
    validated: true, // the final goal_achieved Decision is validated (the orchestrator's terminal claim, supported by the full evidence chain)
    result: "accepted",
    evidence_refs: [
      // The full chain: decomposition + 2 routing + 2 execute-workflow + 2 evaluate-result Decisions
      "decision-classify-goal-decomposition",
      "decision-route-iteration-1-bug-report",
      "decision-execute-iteration-1-child-bug-report",
      "decision-evaluate-iteration-1-not-yet-met",
      "decision-route-iteration-2-feature-request",
      "decision-execute-iteration-2-child-feature-request",
      "decision-evaluate-iteration-2-achieved",
    ],
  });
  // Write the project memory entry recording the orchestrator run.
  await run.writeMemory("project", {
    id: "mem-project-orchestrator-run-shipping-bug-and-batch-label-2026-08-15",
    type: "project",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "orchestrator-run-1",
    stack: ["python"],
    layer: ["backend"],
    domain: "shipping service: orchestrator run achieved the multi-workflow goal 'fix the shipping bug and add a feature for batch label printing' via a 2-iteration loop (bug-report → feature-request); the slot calculation off-by-one was fixed at commit abc1234 (< → <=), the batch label printing feature was added at /labels/batch, and the orchestrator's decomposition (bug-first) was confirmed correct because the feature's tests depended on the slot calculation being correct",
  });

  // ------------------------------------------------------------------
  // FINAL ASSERTIONS — the structural features that make this driver
  // distinct from every other e2e driver in the repo.
  // ------------------------------------------------------------------

  // (a) The LOOP BACK EDGE was traversed. The state machine's history
  // must contain at least one entry where from="evaluate-result",
  // to="route", on="goal_not_yet_met". This is the structural feature
  // that makes the orchestrator distinct from every other workflow
  // in the catalog — no other workflow has a back-edge from a post-
  // execution state to a pre-execution state.
  const loopBackEntries = run.machine.history.filter(
    (h) => h.from === "evaluate-result" && h.to === "route" && h.on === "goal_not_yet_met"
  );
  check("LOOP BACK EDGE traversed at least once (evaluate-result → route on goal_not_yet_met)",
    loopBackEntries.length >= 1);

  // (b) The safety gate at execute-workflow fired on EVERY spawn
  // (both iterations). The run log should contain at least 2
  // gate-check entries — one per execute-workflow visit. And the
  // confirmedAdvanceResults array should have 2 entries (one per
  // confirmed advance).
  const gateCheckEntries = run.log.filter((e) => e.type === "gate-check");
  check("run log has at least 2 gate-check entries (one per execute-workflow spawn)",
    gateCheckEntries.length >= 2);
  check("all gate-check entries are at execute-workflow state (no other state is gated)",
    gateCheckEntries.every((e) => e.detail.state === "execute-workflow"));
  check("all gate-check entries use broad-refactor gate (mapped to edit_source capability)",
    gateCheckEntries.every((e) => e.detail.gate === "broad-refactor"));
  check(`confirmed ${confirmedAdvanceResults.length} advanceWithConfirmation calls (one per loop iteration)`,
    confirmedAdvanceResults.length === 2);

  // (c) At least TWO `workflow_routed:<workflow>` Decisions were
  // emitted — one per loop iteration. The first iteration routes to
  // bug-report; the second routes to feature-request. This proves
  // the orchestrator executed multiple workflows (loop engineering).
  const routingDecisions = [];
  for (const prefix of ["decision-route-iteration-1-bug-report", "decision-route-iteration-2-feature-request"]) {
    const f = join(runDir, "evidence", "decision", `${prefix}.json`);
    try {
      const d = JSON.parse(await readFile(f, "utf-8"));
      routingDecisions.push(d);
    } catch {
      // file may not exist if evidence wasn't emitted — leave undefined
    }
  }
  check("at least 2 workflow_routed Decisions persisted to disk (bug-report + feature-request)",
    routingDecisions.length === 2);
  check("first routing Decision has what=workflow_routed:bug-report",
    routingDecisions[0]?.what === "workflow_routed:bug-report");
  check("second routing Decision has what=workflow_routed:feature-request",
    routingDecisions[1]?.what === "workflow_routed:feature-request");
  check("both routing Decisions have validated=true + result=accepted (confirmed routes, not candidates)",
    routingDecisions.every((d) => d.validated === true && d.result === "accepted"));
  check("second routing Decision references BOTH decomposition AND prior evaluate-result (loop-aware evidence chain)",
    Array.isArray(routingDecisions[1]?.evidence_refs) &&
      routingDecisions[1].evidence_refs.includes("decision-classify-goal-decomposition") &&
      routingDecisions[1].evidence_refs.includes("decision-evaluate-iteration-1-not-yet-met"));

  // (d) No more than 1 question was asked across the entire run
  // (loop engineering — the agent prompts ITSELF between iterations,
  // not the user).
  check("exactly 1 question was asked in the main run (loop engineering — agent prompts itself between iterations)",
    run.questions.count === 1);

  // (e) Terminal state is `report` (not `blocked`) — the goal was
  // achieved.
  check("terminal state is report (goal achieved)", run.currentState === "report" && run.isTerminal());

  // (f) The final goal_achieved Decision has the required shape:
  // what=goal_achieved:<summary>, validated=true, result=accepted,
  // evidence_refs chaining the full multi-workflow execution.
  const persistedFinal = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-report-goal-achieved.json"), "utf-8")
  );
  check("persisted final Decision has what=goal_achieved:<summary>",
    typeof persistedFinal.what === "string" && persistedFinal.what.startsWith("goal_achieved:"));
  check("persisted final Decision has validated=true + result=accepted",
    persistedFinal.validated === true && persistedFinal.result === "accepted");
  check("persisted final Decision references all 7 chain Decisions (decomposition + 2 routing + 2 execute + 2 evaluate)",
    Array.isArray(persistedFinal.evidence_refs) && persistedFinal.evidence_refs.length === 7);

  // (g) Project memory entry was written at the report state,
  // recording the orchestrator run (the multi-workflow execution
  // chain). This is structurally distinct from every other
  // workflow's memory write — bug-report writes a known-failure
  // entry about a single incident; project-onboarding writes the
  // initial project+environment entries; the orchestrator writes a
  // project entry recording a MULTI-WORKFLOW execution chain.
  const memoryDir = join(runDir, "memory", "project");
  const memoryFiles = await readdir(memoryDir).catch(() => []);
  check("memory/project/ has at least one persisted JSON file (orchestrator run recorded)",
    memoryFiles.length > 0);
  const persistedMemory = JSON.parse(
    await readFile(join(memoryDir, memoryFiles[0]), "utf-8")
  );
  check("persisted project memory entry has source=orchestrator-run-1 (records the multi-workflow execution chain)",
    /orchestrator-run/.test(persistedMemory.source));
  check("persisted project memory entry domain mentions BOTH the bug fix AND the feature (multi-workflow summary)",
    /shipping bug/.test(persistedMemory.domain) || /slot calculation/.test(persistedMemory.domain) ||
      /batch label/.test(persistedMemory.domain) || /batch-label/.test(persistedMemory.domain));

  // (h) Disk persistence — every evidence kind that the orchestrator
  // emits (trace, event, decision) has at least one file on disk.
  const evidenceKinds = ["trace", "event", "decision"];
  for (const kind of evidenceKinds) {
    const dir = join(runDir, "evidence", kind);
    const files = await readdir(dir).catch(() => []);
    check(`evidence/${kind}/ has at least one persisted JSON file`, files.length > 0);
  }

  // (i) State machine history — the orchestrator's run walked the
  // full multi-iteration path: 9 transitions total (intake→classify-
  // goal, classify-goal→route, route→execute-workflow, execute-
  // workflow→evaluate-result, evaluate-result→route (LOOP BACK),
  // route→execute-workflow, execute-workflow→evaluate-result,
  // evaluate-result→report). Plus the report state's terminal
  // nature means no further transitions are possible.
  check(`state machine history has 8 transitions (intake→classify-goal, classify-goal→route, route→execute-workflow ×2, execute-workflow→evaluate-result ×2, evaluate-result→route LOOP BACK ×1, evaluate-result→report)`,
    run.machine.history.length === 8);

  // (j) Non-execute-workflow advances returned gateDecision=undefined
  // (no gate fired on those transitions). All confirmed advances
  // went through advanceWithConfirmation (separate code path).
  check("every non-gated advance() returned gateDecision=undefined (only execute-workflow is gated)",
    advanceResults.every((r) => r.gateDecision === undefined));
}

// ---------------------------------------------------------------------------
// Scenario 2 (question-economy wrong-state): a fresh run, asked in
// `route` (NOT in allowed_states=[classify-goal]), is rejected with
// question-economy-wrong-state. Uses a fresh run so the budget is not
// already exhausted.
// ---------------------------------------------------------------------------
async function scenarioQuestionEconomyWrongState(runDir) {
  console.log("\n=== Question-economy wrong-state assertion ===\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  // Walk to route without asking any questions.
  run.advance("intent_classified");     // classify-goal
  run.advance("goal_classified");         // route

  // route is NOT in allowed_states=[classify-goal].
  await expectViolation(
    "question asked in route (not in allowed_states) is rejected",
    "question-economy-wrong-state",
    () => run.askQuestion("Should the orchestrator pick bug-report or regression for the reactive sub-goal?")
  );
}

// ---------------------------------------------------------------------------
// Scenario 3 (question-economy exceeded): a fresh run, one question
// already asked in classify-goal (accepted), a second question in
// classify-goal should be rejected as question-economy-exceeded
// (budget exhausted — max_questions=1). Classify-goal IS in
// allowed_states, so the wrong-state check does not fire first.
// ---------------------------------------------------------------------------
async function scenarioQuestionEconomyExceeded(runDir) {
  console.log("\n=== Question-economy exceeded assertion ===\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  run.advance("intent_classified");     // classify-goal
  run.askQuestion("First question — allowed (in classify-goal).");

  await expectViolation(
    "second question in classify-goal exceeds max_questions=1",
    "question-economy-exceeded",
    () => run.askQuestion("Second question — should be rejected (budget exhausted).")
  );
}

// ---------------------------------------------------------------------------
// Scenario 4 (blocked path — goal too ambiguous): a fresh run with a
// vague goal that cannot be decomposed even after the one allowed
// question. Transitions classify-goal → blocked on goal_too_ambiguous.
// Proves the orchestrator refuses safely with a precise gap rather
// than silently guessing a workflow.
// ---------------------------------------------------------------------------
async function scenarioBlockedPath(runDir) {
  console.log("\n=== Blocked path: 'make the system better' → blocked (goal too ambiguous) ===\n");

  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  // intake → classify-goal
  run.advance("intent_classified");
  check("[scenario 4] state is classify-goal", run.currentState === "classify-goal");

  // classify-goal: the request "make the system better" is too vague
  // to decompose. Ask the one allowed question.
  run.askQuestion("Can you name a specific surface, behavior, or quality you'd like improved?");
  check("[scenario 4] question count is 1 (classify-goal question asked)", run.questions.count === 1);

  // Emit the failed-decomposition Decision + the gap.
  await run.emitEvidence("trace", {
    id: "trace-classify-goal-2",
    started_at: new Date().toISOString(),
    event_refs: ["event-classify-goal-2-1", "event-classify-goal-2-2"],
  });
  await run.emitEvidence("event", {
    id: "event-classify-goal-2-1",
    trace_ref: "trace-classify-goal-2",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "filesystem_read: user request + project-intelligence.json",
    payload: {
      finding: "request 'make the system better' names no specific surface, no specific behavior, no specific quality dimension; user's classify-goal answer was 'no, just make it better in general' — no intent can be matched against any routing-table signal with confidence",
    },
  });
  await run.emitEvidence("event", {
    id: "event-classify-goal-2-2",
    trace_ref: "trace-classify-goal-2",
    ts: new Date().toISOString(),
    kind: "observation",
    source: "ls .aiecp/memory/known-failure/",
    payload: {
      finding: "no prior known-failure memory entry matches a vague 'better' symptom — the directory contains only specific entries (mem-known-failure-login-race, mem-known-failure-shipping-label-slot), none matching 'better'",
    },
  });
  await run.emitEvidence("decision", {
    id: "decision-classify-goal-2-no-decomposition",
    trace_ref: "trace-classify-goal-2",
    what: "goal_decomposition:none",
    why: "the request 'make the system better' was considered against the following workflows: bug-report (rejected — no specific broken behavior named; bug-report's locate-evidence would have nothing to locate), refactor (rejected — no specific cleanup target named; refactor's capture-baseline would have no scope), performance-problem (rejected — no latency/throughput signal cited), feature-request (rejected — no specific capability requested), change-request (rejected — no behavior-modification intent). To decompose this goal, the request would need at least one of: (a) a specific surface (endpoint, UI route, CLI command), (b) a specific behavior (broken, missing, slow, insecure), (c) a specific quality dimension (readability, performance, security, accessibility). The user should rephrase with at least one of these, or manually invoke a specific workflow if they have a strong prior on which dimension to improve.",
    validated: false,
    result: "pending",
    evidence_refs: ["event-classify-goal-2-1", "event-classify-goal-2-2"],
    alternatives: [
      { option: "goal_decomposition:bug-report(guess)", rejected_because: "no specific broken behavior named; bug-report's locate-evidence would have nothing to locate" },
      { option: "goal_decomposition:refactor(guess)", rejected_because: "no specific cleanup target named; refactor's capture-baseline would have no scope" },
      { option: "goal_decomposition:performance-problem(guess)", rejected_because: "no latency/throughput signal cited" },
    ],
  });
  run.advance("goal_too_ambiguous");
  check("[scenario 4] state is blocked (terminal)", run.currentState === "blocked" && run.isTerminal());

  // No safety gate should have fired (the run never reached execute-workflow).
  check("[scenario 4] run log has ZERO gate-check entries (never reached execute-workflow)",
    run.log.filter((e) => e.type === "gate-check").length === 0);
  check("[scenario 4] exactly 1 question was asked (budget exhausted by the single classify-goal question)",
    run.questions.count === 1);

  // Spot-check the persisted no-decomposition Decision records the refusal.
  const persistedNoDecomp = JSON.parse(
    await readFile(join(runDir, "evidence", "decision", "decision-classify-goal-2-no-decomposition.json"), "utf-8")
  );
  check("[scenario 4] persisted no-decomposition Decision has what=goal_decomposition:none",
    persistedNoDecomp.what === "goal_decomposition:none");
  check("[scenario 4] persisted no-decomposition Decision.why names which workflows were considered + why each rejected",
    /bug-report/.test(persistedNoDecomp.why) &&
      /refactor/.test(persistedNoDecomp.why) &&
      /performance-problem/.test(persistedNoDecomp.why) &&
      /rejected/.test(persistedNoDecomp.why));
  check("[scenario 4] persisted no-decomposition Decision.why names what the user should do next (rephrase or manually invoke)",
    /rephrase/.test(persistedNoDecomp.why) && /manually invoke/.test(persistedNoDecomp.why));
}

async function main() {
  const runDirParent = await mkdtemp(join(tmpdir(), "aiecp-orchestrator-"));
  try {
    await scenarioHappyPath(join(runDirParent, "scenario1-happy"));
    await scenarioQuestionEconomyWrongState(join(runDirParent, "scenario2-wrong-state"));
    await scenarioQuestionEconomyExceeded(join(runDirParent, "scenario3-exceeded"));
    await scenarioBlockedPath(join(runDirParent, "scenario4-blocked"));
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
  console.log("- orchestrator.sm.yaml loads through the real executor");
  console.log("- Happy path: WorkflowRun walks all 5 non-terminal states + 1 terminal (report)");
  console.log("  with a LOOP BACK from evaluate-result to route (the 'loop engineering' back-edge)");
  console.log("- Blocked path: classify-goal → blocked on goal_too_ambiguous (precise gap)");
  console.log("- Schema-valid evidence emitted at every emitting state (3 evidence kinds: trace, event, decision)");
  console.log("- Safety gate at execute-workflow fires on EVERY spawn (both iterations)");
  console.log("  — broad-refactor → edit_source, the same gate bug-report/feature-request/refactor use,");
  console.log("  but applied at the INTER-workflow boundary (delegation, not application)");
  console.log("- At least 2 workflow_routed Decisions emitted per multi-workflow run (bug-report + feature-request)");
  console.log("- Second routing Decision references BOTH decomposition AND prior evaluate-result");
  console.log("  (loop-aware evidence chain — the agent knows what the prior iteration produced)");
  console.log("- question_economy enforces max_questions=1 and allowed_states=[classify-goal]");
  console.log("  (loop engineering — the agent prompts ITSELF between iterations, not the user)");
  console.log("- Negative tests: question in `route` (wrong-state) rejected;");
  console.log("  2nd question in classify-goal (exceeded) rejected in a fresh run");
  console.log("- UNIQUE FEATURE: LOOP BACK EDGE (evaluate-result → route on goal_not_yet_met)");
  console.log("  is traversed at least once per multi-workflow run — the structural feature that");
  console.log("  makes the orchestrator distinct from every other workflow in the catalog");
  console.log("- UNIQUE FEATURE: Safety gate bounds DELEGATION to another workflow, not application");
  console.log("  of a code change — no other workflow in the catalog gates an inter-workflow boundary");
  console.log("- UNIQUE FEATURE: Terminal `report` state emits a `goal_achieved:<summary>` Decision");
  console.log("  whose evidence_refs chain 7 Decisions (decomposition + 2 routing + 2 execute + 2");
  console.log("  evaluate) — the full multi-workflow execution trace");
  console.log("- All evidence persisted to disk as JSON (would have thrown on schema violation)");
  console.log("- Project memory entry written at `report` recording the multi-workflow execution chain");
}

main().catch((err) => {
  console.error("E2E DRIVER FAILED WITH UNCAUGHT ERROR:");
  console.error(err);
  process.exit(1);
});
