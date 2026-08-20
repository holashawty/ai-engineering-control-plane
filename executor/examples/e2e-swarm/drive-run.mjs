import { SubagentSwarmCoordinator } from "../../dist/subagent-swarm.js";
import { VerificationBudgetEngine } from "../../dist/verification-budget.js";
import { CausalEvidenceGraph } from "../../dist/evidence-graph.js";
import { RuntimePolicyGateway } from "../../dist/runtime-gateway.js";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

console.log("\n=== E2E Swarm & Policy Orchestration Demo ===");
console.log("Mission: Real File-Backed Parallel Subagent Delivery of Trading Engine\n");

// 1. Initialize Runtime Gateway
const gateway = new RuntimePolicyGateway();
check("Runtime Policy Gateway initialized", gateway !== undefined);

// 2. Determine Verification Budget for high-risk mission
const budgetEngine = new VerificationBudgetEngine();
const plan = budgetEngine.determinePlan("high");
check("Verification plan derived for high-risk mission", plan.tier === "TIER_3_BROWSER_FUZZ_REPLAY");
check("High risk requires human signoff gate", plan.requiresHumanSignoff === true);

// 3. Create Real Temp Workspace
const workDir = await mkdtemp(join(tmpdir(), "aiecp-swarm-demo-"));

try {
  // 4. Coordinate Subagent Swarm with Real File Execution
  const coordinator = new SubagentSwarmCoordinator();
  const tasks = coordinator.planSwarm("Multiplayer Real-Time Trading Engine", "web-saas");
  check("Swarm decomposed into 4 specialized tasks", tasks.length === 4);

  console.log("\n[Swarm Dispatch] Executing real file authoring across roles:");
  for (const t of tasks) {
    console.log(`  -> [${t.role}] Task: ${t.id} (${t.assignedFiles.join(", ")})`);
  }

  // Execute against the real workspace
  const swarmReport = await coordinator.executeSwarm(tasks, undefined, workDir);
  check("Swarm completed successfully", swarmReport.successfulTasks === 4);
  check("Consensus achieved across all 4 subagents", swarmReport.consensusStatus === "CONSENSUS_ACHIEVED");

  // Verify real physical files were authored on disk
  const contractExists = existsSync(join(workDir, "specs/contracts.md"));
  const modelsExists = existsSync(join(workDir, "src/models.js"));
  const uiExists = existsSync(join(workDir, "src/ui.js"));
  const fuzzExists = existsSync(join(workDir, "tests/fuzz.test.js"));

  check("Physical artifact created: specs/contracts.md", contractExists);
  check("Physical artifact created: src/models.js", modelsExists);
  check("Physical artifact created: src/ui.js", uiExists);
  check("Physical artifact created: tests/fuzz.test.js", fuzzExists);

  // Assert file contents are non-empty and well-structured
  const modelsContent = readFileSync(join(workDir, "src/models.js"), "utf-8");
  check("src/models.js contains EngineCore class export", modelsContent.includes("class EngineCore"));

  // 5. Build Causal Evidence Graph
  const graph = new CausalEvidenceGraph();
  const inc = graph.addEntity("incident", { id: "inc-swarm-1", summary: "High-volume trade latency spikes" });
  const tr = graph.addEntity("trace", { id: "tr-swarm-1", incident_ref: "inc-swarm-1" });
  const dec = graph.addEntity("decision", { id: "dec-swarm-1", trace_ref: "tr-swarm-1", what: "design:add_lock_free_queue" });
  const val = graph.addEntity("validation", { id: "val-swarm-1", decision_ref: "dec-swarm-1", passed: true });

  const lineage = graph.traceCausalChain("val-swarm-1");
  check("Evidence graph traces provenance back to root incident", lineage.rootIncidentId === "inc-swarm-1");
  check("Evidence graph confirms full causal justification", lineage.isFullyJustified === true);

} finally {
  await rm(workDir, { recursive: true, force: true });
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("E2E SWARM DEMO FAILED");
  process.exit(1);
}
console.log("E2E SWARM DEMO PASSED (REAL FILE EXECUTION VERIFIED)");
