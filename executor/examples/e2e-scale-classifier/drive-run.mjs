// ADR-0027 e2e driver: misclassification detector for project_scale.
//
// Simulates an orchestrator run that classified a goal as "small" but
// then ran 4 execute-workflow iterations — a clear under-classification.
// Verifies that project-scale-classifier.ts correctly:
//   1. Extracts the classified scale from emitted Decisions.
//   2. Counts actual execute-workflow iterations from machine.history.
//   3. Detects the mismatch (4 > 1, the max for "small").
//   4. Infers the correct scale ("medium" for 2-3 iters, "large" for 4+).
//   5. Builds a Validation entity with result: "mismatch".
//
// Also tests the happy path: classified "large", ran 5 iterations — match.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { classifyRun, buildValidation, extractClassifiedScale, countExecuteWorkflowIterations, SCALE_RANGES } from "../../dist/project-scale-classifier.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed++; }
  else { console.log(`  FAIL ${label} — ${detail}`); failed++; }
}

async function scenario() {
  const tmpDir = mkdtempSync(join(tmpdir(), "aiecp-scale-"));
  const def = loadWorkflow(join(__dirname, "..", "..", "..", "workflows", "orchestrator.sm.yaml"));
  const run = new WorkflowRun(def, { runDir: tmpDir });

  console.log("=== ADR-0027 scale misclassification detector e2e ===\n");

  // --- Unit test 1: SCALE_RANGES has the expected entries ---
  check("SCALE_RANGES has small/medium/large",
    SCALE_RANGES.small && SCALE_RANGES.medium && SCALE_RANGES.large);
  check("small has max=1", SCALE_RANGES.small.max === 1);
  check("medium has max=3", SCALE_RANGES.medium.max === 3);
  check("large has max=-1 (no upper bound)", SCALE_RANGES.large.max === -1);

  // --- Unit test 2: extractClassifiedScale parses correctly ---
  check("extractClassifiedScale finds 'small'",
    extractClassifiedScale([{ what: "project_scale:small" }]) === "small");
  check("extractClassifiedScale finds 'large'",
    extractClassifiedScale([{ what: "project_scale:large" }]) === "large");
  check("extractClassifiedScale returns null for non-scale Decision",
    extractClassifiedScale([{ what: "workflow_routed:bug-report" }]) === null);
  check("extractClassifiedScale returns null for empty array",
    extractClassifiedScale([]) === null);

  // --- Integration: simulate an under-classified run ---
  // The orchestrator emits `project_scale:small` in classify-goal, then
  // somehow runs 4 execute-workflow iterations. This shouldn't happen
  // for a genuinely-small goal — that's exactly what the detector exists
  // to surface.
  console.log("\n--- Simulating under-classified run (small, 4 iterations) ---");
  await run.advance("intent_classified");
  await run.advance("goal_classified");  // classify-goal → route (no real Decision emit needed for this test)
  // Simulate 4 route → execute-workflow → workflow_complete cycles
  // The execute-workflow state has a broad-refactor safety gate; use
  // advanceWithConfirmation to bypass it (real runs would emit aiecp:confirm).
  for (let i = 0; i < 4; i++) {
    await run.advance("workflow_selected");  // route → execute-workflow
    run.advanceWithConfirmation("workflow_complete"); // execute-workflow → evaluate-result (gate confirmed)
    if (i < 3) {
      await run.advance("goal_not_yet_met"); // evaluate-result → route (loop back)
    }
  }
  // Now at evaluate-result after 4th iteration. Advance to report.
  await run.advance("goal_achieved");

  const decisions = [{ what: "project_scale:small" }];
  const actualCount = countExecuteWorkflowIterations(run);
  check("under-classified run has 4 execute-workflow iterations", actualCount === 4,
    `got ${actualCount}`);

  const result = classifyRun(run, decisions);
  check("under-classified run verdict is 'under_classified'",
    result.verdict === "under_classified", `got ${result.verdict}`);
  check("under-classified run inferred correct scale is 'large' (4 iters > medium's 3)",
    result.inferred_correct_scale === "large", `got ${result.inferred_correct_scale}`);

  const validation = buildValidation(result);
  check("validation has result: 'mismatch'", validation.result === "mismatch",
    `got ${validation.result}`);
  check("validation method is 'scale_classification_review'",
    validation.method === "scale_classification_review");
  check("validation notes include the inferred scale",
    (validation.notes || "").includes("inferred_correct_scale: large"),
    `got: ${validation.notes}`);

  // --- Integration: simulate a correctly-classified run ---
  console.log("\n--- Simulating correctly-classified run (large, 5 iterations) ---");
  const tmpDir2 = mkdtempSync(join(tmpdir(), "aiecp-scale-2-"));
  const run2 = new WorkflowRun(def, { runDir: tmpDir2 });
  await run2.advance("intent_classified");
  await run2.advance("goal_classified");
  for (let i = 0; i < 5; i++) {
    await run2.advance("workflow_selected");
    run2.advanceWithConfirmation("workflow_complete");
    if (i < 4) await run2.advance("goal_not_yet_met");
  }
  await run2.advance("goal_achieved");

  const result2 = classifyRun(run2, [{ what: "project_scale:large" }]);
  check("large+5iters verdict is 'match'", result2.verdict === "match",
    `got ${result2.verdict}`);
  check("match does not infer a different scale",
    result2.inferred_correct_scale === null);

  const validation2 = buildValidation(result2);
  check("match validation has result: 'match'", validation2.result === "match");

  // --- Edge case: no scale Decision emitted ---
  console.log("\n--- Edge: no project_scale Decision emitted ---");
  const result3 = classifyRun(run, []);  // empty decisions
  check("no-scale verdict is 'no_scale_decision'",
    result3.verdict === "no_scale_decision");
  const validation3 = buildValidation(result3);
  // No scale decision → treated as match (no claim to refute)
  check("no-scale validation has result: 'match'", validation3.result === "match",
    `got ${validation3.result}`);

  // --- Edge case: unknown scale value ---
  console.log("\n--- Edge: unknown scale value ---");
  const result4 = classifyRun(run, [{ what: "project_scale:huge" }]);
  check("unknown-scale verdict is 'unknown_scale'",
    result4.verdict === "unknown_scale");

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(tmpDir2, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
}

scenario().catch(e => {
  console.error(`\nE2E DRIVER FAILED WITH UNCAUGHT ERROR: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
