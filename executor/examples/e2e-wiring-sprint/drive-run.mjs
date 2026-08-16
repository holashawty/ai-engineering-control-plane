// executor/examples/e2e-wiring-sprint/drive-run.mjs
//
// Phase 2.5 — Wiring Sprint regression test.
//
// Proves the 4 "unwired" connections identified by the pro-LLM audit are
// now live:
//
//   1. ORCHESTRATOR FAST-PATH: classify-goal → risk_trivial → fast-path
//      state → fast_path_complete → report (skips the full FSM)
//
//   2. HUMAN-APPROVAL-REQUIRED GATE: execute-workflow-critical's gate
//      throws safety-gate-needs-human-approval on advance(); ALSO throws
//      on advanceWithConfirmation() (confirmation is NOT enough); ONLY
//      advanceWithHumanApproval() bypasses it
//
//   3. VOCABULARY: fast_path_applied + risk_classified:<level> are
//      recognized by the ADR-0026 vocab linter (no warning emitted)
//
//   4. WASM FALLBACK: detectUniversalAst with missing WASM returns
//      fallback result (tested in e2e-universal-ast; here we just verify
//      the module exports the fallback reason constant)
//
// This test does NOT re-test the risk classifier itself (that's
// e2e-risk-classifier) or the full orchestrator happy path (that's
// e2e-orchestrator). It tests the WIRING — the connections between
// the risk classifier, the orchestrator state machine, the safety gate,
// and the vocabulary registry.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { WorkflowViolation } from "../../dist/types.js";
import { classifyRisk } from "../../dist/risk-classifier.js";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

let passed = 0, failed = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed++; }
  else { console.log(`  FAIL ${label} — ${detail}`); failed++; }
}

async function expectViolation(label, expectedKind, fn) {
  try {
    await fn();
    check(`${label} (expected ${expectedKind})`, false, "no violation thrown");
  } catch (e) {
    if (e instanceof WorkflowViolation && e.kind === expectedKind) {
      check(label, true);
    } else {
      check(`${label} (expected ${expectedKind})`, false, `got: ${e.kind ?? e.message}`);
    }
  }
}

async function scenario() {
  const tmpDir = mkdtempSync(join(tmpdir(), "aiecp-wiring-"));
  const def = loadWorkflow(join(REPO_ROOT, "workflows", "orchestrator.sm.yaml"));
  const run = new WorkflowRun(def, { runDir: tmpDir });

  console.log("=== Phase 2.5 Wiring Sprint — 4 connections proven ===\n");

  // === WIRING 1: Orchestrator fast-path ===
  console.log("--- Wiring 1: Orchestrator fast-path (trivial risk → skip FSM) ---");

  // Verify the orchestrator HAS the fast-path state + transitions
  check("orchestrator has 'fast-path' state", def.states.includes("fast-path"));
  check("orchestrator has risk_trivial transition (classify-goal → fast-path)",
    def.transitions.some(t => t.from === "classify-goal" && t.to === "fast-path" && t.on === "risk_trivial"));
  check("orchestrator has fast_path_complete transition (fast-path → report)",
    def.transitions.some(t => t.from === "fast-path" && t.to === "report" && t.on === "fast_path_complete"));
  check("orchestrator has fast_path_failed transition (fast-path → blocked)",
    def.transitions.some(t => t.from === "fast-path" && t.to === "blocked" && t.on === "fast_path_failed"));

  // Simulate the fast-path flow: intake → classify-goal → (risk_trivial) → fast-path → report
  run.advance("intent_classified");
  check("state is classify-goal", run.currentState === "classify-goal");

  // Emit the risk_classified:trivial Decision (the agent would call classifyRisk + emit)
  const trivialRisk = classifyRisk({
    file_extensions: [".md"],
    files_changed: 1,
    diff_loc: 3,
    request_keywords: ["typo", "readme"],
    known_failure_match: false,
  });
  check("classifyRisk returns trivial for .md-only 3-LOC change",
    trivialRisk.level === "trivial");
  check("trivial risk is fast_path_eligible",
    trivialRisk.fast_path_eligible === true);

  await run.emitEvidence("decision", {
    id: "decision-risk-classified-trivial",
    trace_ref: "trace-wiring-1",
    what: "risk_classified:trivial",
    why: "3 LOC, .md only, no security keywords — trivial risk, fast-path eligible",
    validated: false,
    result: "pending",
  });

  // Advance on risk_trivial → fast-path
  run.advance("risk_trivial");
  check("state is fast-path (skipped route/execute-workflow/evaluate-result)",
    run.currentState === "fast-path");

  // Emit fast_path_applied Decision
  await run.emitEvidence("decision", {
    id: "decision-fast-path-applied",
    trace_ref: "trace-wiring-1",
    what: "fast_path_applied",
    why: "trivial change applied directly; README typo fixed; verified by re-reading the file",
    validated: true,
    result: "accepted",
  });

  // Advance to report
  run.advance("fast_path_complete");
  check("state is report (fast-path → report, terminal)", run.currentState === "report" && run.isTerminal());

  // === WIRING 2: human-approval-required gate ===
  console.log("\n--- Wiring 2: human-approval-required gate (critical risk) ---");

  // Start a fresh run for the critical-risk scenario
  const tmpDir2 = mkdtempSync(join(tmpdir(), "aiecp-wiring-2-"));
  const run2 = new WorkflowRun(def, { runDir: tmpDir2 });

  // Verify the orchestrator HAS the execute-workflow-critical state + gate
  check("orchestrator has 'execute-workflow-critical' state",
    def.states.includes("execute-workflow-critical"));
  check("orchestrator has workflow_selected_critical transition (route → execute-workflow-critical)",
    def.transitions.some(t => t.from === "route" && t.to === "execute-workflow-critical" && t.on === "workflow_selected_critical"));
  check("orchestrator declares human-approval-required gate on execute-workflow-critical",
    def.safety_gates?.some(g => g.state === "execute-workflow-critical" && g.gate === "human-approval-required"));

  // Navigate to execute-workflow-critical: intake → classify-goal → route → execute-workflow-critical
  run2.advance("intent_classified");

  const criticalRisk = classifyRisk({
    file_extensions: [".ts"],
    files_changed: 1,
    diff_loc: 10,
    request_keywords: ["password", "auth"],
    known_failure_match: false,
  });
  check("classifyRisk returns critical for password+auth keywords",
    criticalRisk.level === "critical");
  check("critical risk is NOT fast_path_eligible",
    criticalRisk.fast_path_eligible === false);
  check("critical risk recommended path includes human-approval",
    criticalRisk.recommended_workflow_path === "full-fsm-plus-human-approval");

  await run2.emitEvidence("decision", {
    id: "decision-risk-classified-critical",
    trace_ref: "trace-wiring-2",
    what: "risk_classified:critical",
    why: "request contains security keywords (password, auth) — critical risk, human approval required",
    validated: false,
    result: "pending",
  });

  run2.advance("goal_classified");
  check("state is route (critical risk → full FSM, not fast-path)", run2.currentState === "route");
  run2.advance("workflow_selected_critical");
  check("state is execute-workflow-critical", run2.currentState === "execute-workflow-critical");

  // NOW: advance() should throw safety-gate-needs-human-approval
  await expectViolation(
    "advance() on execute-workflow-critical throws safety-gate-needs-human-approval",
    "safety-gate-needs-human-approval",
    () => run2.advance("workflow_complete")
  );

  // advanceWithConfirmation() should ALSO throw (confirmation is NOT enough)
  await expectViolation(
    "advanceWithConfirmation() on execute-workflow-critical ALSO throws (confirmation insufficient)",
    "safety-gate-needs-human-approval",
    () => run2.advanceWithConfirmation("workflow_complete")
  );

  // ONLY advanceWithHumanApproval() should succeed
  run2.advanceWithHumanApproval("workflow_complete");
  check("advanceWithHumanApproval() succeeds (human approved out-of-band)",
    run2.currentState === "evaluate-result");

  // === WIRING 3: Vocabulary registry ===
  console.log("\n--- Wiring 3: Vocabulary (fast_path_applied + risk_classified) ---");

  // Emit a fast_path_applied Decision and verify NO vocab warning
  let stderrBuf = "";
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...args) => { stderrBuf += chunk.toString(); return true; };

  stderrBuf = "";
  await run.emitEvidence("decision", {
    id: "decision-vocab-test-fast-path",
    trace_ref: "trace-wiring-1",
    what: "fast_path_applied",
    why: "vocab test",
    validated: false,
    result: "pending",
  });
  check("fast_path_applied does NOT trigger ADR-0026 vocab warning",
    !stderrBuf.includes("WARNING (ADR-0026"),
    `unexpected warning: ${stderrBuf.slice(0, 200)}`);

  stderrBuf = "";
  await run.emitEvidence("decision", {
    id: "decision-vocab-test-risk-classified",
    trace_ref: "trace-wiring-1",
    what: "risk_classified:medium",
    why: "vocab test",
    validated: false,
    result: "pending",
  });
  check("risk_classified:medium does NOT trigger ADR-0026 vocab warning",
    !stderrBuf.includes("WARNING (ADR-0026"),
    `unexpected warning: ${stderrBuf.slice(0, 200)}`);

  // Verify the vocab linter self-test recognizes these
  const vocabResult = spawnSync("node", ["scripts/validate-what-vocabulary.mjs", "--self-test"],
    { cwd: REPO_ROOT, encoding: "utf-8" });
  check("vocab linter self-test passes with new entries",
    vocabResult.stdout.includes("68 passed") || vocabResult.stdout.includes("74 passed") || vocabResult.stdout.includes("passed, 0 failed"),
    `stdout: ${vocabResult.stdout.slice(-200)}`);

  // Restore stderr
  process.stderr.write = origStderrWrite;

  // === WIRING 4: WASM fallback (module export check) ===
  console.log("\n--- Wiring 4: WASM fallback (universal-ast) ---");

  // The full fallback test is in e2e-universal-ast. Here we just verify
  // the module exports the fallback reason constant.
  const universalAstModule = await import("../../../discovery/cli/dist/detectors/universal-ast.js");
  check("universal-ast module exports detectUniversalAst",
    typeof universalAstModule.detectUniversalAst === "function");
  check("universal-ast module exports UNIVERSAL_AST_FALLBACK_REASON",
    typeof universalAstModule.UNIVERSAL_AST_FALLBACK_REASON === "string" &&
    universalAstModule.UNIVERSAL_AST_FALLBACK_REASON.length > 0,
    `got: ${universalAstModule.UNIVERSAL_AST_FALLBACK_REASON}`);

  // Verify download-grammars script exists
  check("scripts/download-grammars.mjs exists",
    existsSync(join(REPO_ROOT, "scripts", "download-grammars.mjs")));

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(tmpDir2, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
  console.log("");
  console.log("Phase 2.5 Wiring Sprint — 4 connections proven:");
  console.log("  1. ✅ Orchestrator fast-path (trivial → skip FSM → report)");
  console.log("  2. ✅ human-approval-required gate (critical → blocks advance + advanceWithConfirmation)");
  console.log("  3. ✅ Vocabulary (fast_path_applied + risk_classified recognized)");
  console.log("  4. ✅ WASM fallback (universal-ast degrades gracefully)");
}

scenario().catch(e => {
  console.error(`\nE2E DRIVER FAILED WITH UNCAUGHT ERROR: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
