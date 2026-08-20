import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkflow } from "./workflow-loader.js";
import { WorkflowRun } from "./run.js";
import { WorkflowViolation } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "..", "workflows", "bug-report.sm.yaml");

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}`);
    failed++;
  }
}

async function expectViolation(label: string, kind: string, fn: () => unknown | Promise<unknown>) {
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

/**
 * Scenario 1: a full, successful bug-report run, scripted the way an
 * agent following skills/systematic-debugging + evidence-engineering +
 * behavioral-verification + testing would drive it. Emits real,
 * schema-valid evidence at each step.
 */
async function scenarioHappyPath(runDir: string) {
  console.log("\n=== Scenario 1: happy-path bug-report run ===");
  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  // intake -> classify
  run.advance("intent_classified");
  check("state is classify", run.currentState === "classify");

  // classify: one allowed question, then classify -> locate-evidence
  run.askQuestion("Is this affecting all users or a subset?");
  await run.emitEvidence("incident", {
    id: "incident-login-race-2026-08-12",
    observed_at: new Date().toISOString(),
    environment_fingerprint_ref: "env-fp-1",
    expected_ref: "expected-login-success",
    actual_ref: "actual-login-fail",
    severity: "high",
    status: "open",
  });
  run.advance("class_known");
  check("state is locate-evidence", run.currentState === "locate-evidence");

  // locate-evidence -> reproduce
  await run.emitEvidence("trace", {
    id: "trace-locate-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-1"],
  });
  await run.emitEvidence("event", {
    id: "event-1",
    trace_ref: "trace-locate-1",
    ts: new Date().toISOString(),
    kind: "log_line",
    source: "auth-service.log",
  });
  run.advance("evidence_located");
  check("state is reproduce", run.currentState === "reproduce");

  // reproduce -> diagnose
  await run.emitEvidence("trace", {
    id: "trace-repro-1",
    started_at: new Date().toISOString(),
    event_refs: ["event-2"],
  });
  run.advance("reproduction_ready");
  check("state is diagnose", run.currentState === "diagnose");

  // diagnose -> propose-fix
  await run.emitEvidence("decision", {
    id: "decision-root-cause-1",
    trace_ref: "trace-repro-1",
    what: "root_cause_candidate:token_refresh_assumed_synchronous",
    why: "retry observed before refresh completed in trace-repro-1",
    validated: true,
    root_cause: true,
    result: "accepted",
  });
  await run.emitEvidence("expected", {
    id: "expected-login-success",
    source_ref: "specs/spec.md#auth-contract",
    predicate: "retry must wait for token refresh to complete",
  });
  await run.emitEvidence("actual", {
    id: "actual-login-fail",
    expected_ref: "expected-login-success",
    observed_value: "retry fired before refresh completed",
    observation_ref: "event-1",
  });
  await run.emitEvidence("validation", {
    id: "validation-diagnose-1",
    expected_ref: "expected-login-success",
    actual_ref: "actual-login-fail",
    result: "mismatch",
    method: "contract_validation",
  });
  run.advance("root_cause_found");
  check("state is propose-fix", run.currentState === "propose-fix");

  // propose-fix -> apply-fix: this transition is safety-gated
  // (safety_gates: propose-fix -> broad-refactor -> capability
  // edit_source, default policy = "ask"). Confirm the gate actually
  // blocks an un-confirmed attempt first.
  await expectViolation(
    "un-confirmed transition out of propose-fix is blocked by safety gate",
    "safety-gate-needs-confirmation",
    () => run.advance("fix_approved")
  );
  check("state is still propose-fix after blocked attempt", run.currentState === "propose-fix");

  // Now simulate the human confirming, and proceed via the confirmed path.
  run.advanceWithConfirmation("fix_approved");
  check("state is apply-fix after confirmation", run.currentState === "apply-fix");

  // apply-fix -> verify: also gated (edit_source). Confirm again.
  run.advanceWithConfirmation("fix_applied");
  check("state is verify", run.currentState === "verify");

  // Mandatory Shell execution check via WorkflowRun.runShell()
  const shellBlock = run.runShell(["rm", "-rf", "/"]);
  check("runShell physically blocks destructive command with exitCode 126", shellBlock.exitCode === 126);
  check("runShell warning records blocked decision", shellBlock.warning?.includes("BLOCKED") === true);

  // Swarm execution check via WorkflowRun.runSwarm()
  const swarmReport = await run.runSwarm("Feature implementation with contracts and fuzz testing", "web-saas");
  check("runSwarm completes 4 tasks successfully", swarmReport.successfulTasks === 4);
  check("runSwarm reaches consensus", swarmReport.consensusStatus === "CONSENSUS_ACHIEVED");

  // verify -> regression-protect
  await run.emitEvidence("validation", {
    id: "validation-verify-1",
    expected_ref: "expected-login-success",
    actual_ref: "actual-login-fail",
    result: "match",
    method: "app_validation",
  });
  run.advance("behavior_verified");
  check("state is regression-protect", run.currentState === "regression-protect");

  // regression-protect -> replay, writing a known-failure memory entry
  await run.writeMemory("known-failure", {
    id: "mem-known-failure-login-race-1",
    type: "known-failure",
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    source: "bug-report-run-1",
    incident_ref: "incident-login-race-2026-08-12",
    symptom: "login sometimes fails under concurrent refresh+retry",
    root_cause: "retry fired before token refresh completed",
    fix: "retry now awaits refresh completion",
  });
  run.advance("regression_added");
  check("state is replay", run.currentState === "replay");

  // replay -> report
  await run.emitEvidence("replay", {
    id: "replay-1",
    original_trace_ref: "trace-repro-1",
    environment_fingerprint_ref: "env-fp-1",
    result: "matches_expected",
  });
  run.advance("replay_matches");
  check("state is report (terminal)", run.currentState === "report" && run.isTerminal());
  // Tampering detection verification at terminal transition
  const tamperDir = join(runDir, "tamper");
  mkdirSync(tamperDir, { recursive: true });
  const runTamper = new WorkflowRun(def, { runDir: tamperDir });
  runTamper.advance("intent_classified");
  runTamper.runShell(["echo", "tamper-test"]);
  const tamperLog = runTamper.gateway.getAuditLog();
  if (tamperLog.length > 0) {
    tamperLog[0].auditHash = "deadbeef12345678";
  }
  check("verifyAuditChain detects tampering", runTamper.gateway.verifyAuditChain() === false);

  let tamperCaught = false;
  try {
    (runTamper.machine as any).current = "report";
    (runTamper as any).checkTerminalAuditChain();
  } catch (e: any) {
    tamperCaught = e.kind === "audit-chain-corrupted";
  }
  check("tampered audit log is caught and throws audit-chain-corrupted", tamperCaught === true);

  check("exactly 1 question was asked", run.questions.count === 1);
  check("log has entries for every transition + evidence + gate check", run.log.length > 10);
}

/** Scenario 2: question economy must reject a second question and a misplaced one. */
async function scenarioQuestionEconomy(runDir: string) {
  console.log("\n=== Scenario 2: question economy enforcement ===");
  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  run.advance("intent_classified"); // now in classify, the only allowed_states entry

  run.askQuestion("First question — allowed.");
  check("first question in classify succeeds", run.questions.count === 1);

  await expectViolation(
    "second question in same run exceeds max_questions=1",
    "question-economy-exceeded",
    () => run.askQuestion("Second question — should be rejected.")
  );

  const run2 = new WorkflowRun(def, { runDir: join(runDir, "run2") });
  await expectViolation(
    "question asked outside allowed_states (intake) is rejected",
    "question-economy-wrong-state",
    () => run2.askQuestion("Asked too early, before classify.")
  );
}

/** Scenario 3: invalid transitions and invalid evidence must be rejected, not silently accepted. */
async function scenarioInvalidInputsRejected(runDir: string) {
  console.log("\n=== Scenario 3: invalid transitions/evidence are rejected ===");
  const def = loadWorkflow(WORKFLOW_PATH);
  const run = new WorkflowRun(def, { runDir });

  await expectViolation(
    "advancing on an event not valid from the current state throws",
    "invalid-transition",
    () => run.advance("this_event_does_not_exist")
  );

  await expectViolation(
    "emitting evidence missing required fields throws instead of writing",
    "evidence-schema-invalid",
    () => run.emitEvidence("incident", { id: "incident-bad" }) // missing required fields
  );

  await expectViolation(
    "emitting an unknown evidence kind throws",
    "unknown-evidence-kind",
    () => run.emitEvidence("not-a-real-kind", { id: "x" })
  );
}

import { runGatewaySelfTest } from "./runtime-gateway.js";
import { runSwarmSelfTest, SubagentSwarmCoordinator } from "./subagent-swarm.js";
import { runVerificationBudgetSelfTest, VerificationBudgetEngine } from "./verification-budget.js";
import { runEvidenceGraphSelfTest, CausalEvidenceGraph } from "./evidence-graph.js";

async function selfTest() {
  console.log("=== aiecp-run self-test ===");
  const tmp = await mkdtemp(join(tmpdir(), "aiecp-run-"));
  try {
    await scenarioHappyPath(join(tmp, "scenario1"));
    await scenarioQuestionEconomy(join(tmp, "scenario2"));
    await scenarioInvalidInputsRejected(join(tmp, "scenario3"));
    
    const gwRes = runGatewaySelfTest();
    passed += gwRes.passed;
    failed += gwRes.failed;

    const swarmRes = await runSwarmSelfTest();
    passed += swarmRes.passed;
    failed += swarmRes.failed;

    const budgetRes = runVerificationBudgetSelfTest();
    passed += budgetRes.passed;
    failed += budgetRes.failed;

    const graphRes = runEvidenceGraphSelfTest();
    passed += graphRes.passed;
    failed += graphRes.failed;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("SELF-TEST FAILED");
    process.exit(1);
  }
  console.log("SELF-TEST PASSED");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    await selfTest();
    return;
  }

  if (args[0] === "swarm") {
    const goal = args[1] || "Default Engineering Mission";
    const archetype = args.includes("--archetype")
      ? args[args.indexOf("--archetype") + 1]
      : "web-saas";
    const coordinator = new SubagentSwarmCoordinator();
    const tasks = coordinator.planSwarm(goal, archetype);
    console.log(`[AIECP Swarm] Decomposed goal into ${tasks.length} specialized tasks:`);
    for (const t of tasks) {
      console.log(`  - [${t.role}] ${t.id}: ${t.objective}`);
    }
    const report = await coordinator.executeSwarm(tasks);
    console.log(`[AIECP Swarm] Execution complete: ${report.consensusStatus} (${report.successfulTasks}/${report.totalTasks} passed)`);
    return;
  }

  if (args[0] === "graph") {
    const runDir = args[1] || ".aiecp/evidence";
    const graph = new CausalEvidenceGraph();
    graph.loadFromDir(runDir);
    console.log(`[AIECP Evidence Graph] Loaded graph from ${runDir}`);
    return;
  }

  console.log(
    "aiecp: AI Engineering Control Plane Executor CLI\n" +
      "Commands:\n" +
      "  aiecp swarm <goal> [--archetype <archetype>]  Plan & execute parallel subagent swarm\n" +
      "  aiecp graph [evidence-dir]                    Query causal evidence graph & lineage\n" +
      "  aiecp --self-test                             Run full executor validation suite\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
