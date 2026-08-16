// ADR-0026 e2e driver: verifies that emitting a Decision with an
// unrecognized `what` value triggers a SOFT warning on stderr (NOT a
// hard error — the Decision is still written).
//
// Tests two cases:
//   1. Known-good `what` value: NO warning emitted, Decision written.
//   2. Known-bad `what` value (the ADR-0026 motivating case — plausible
//      variant of "architecture_constraint_conflict"): WARNING emitted
//      to stderr, Decision still written.
//
// Verifies:
//   - The vocabulary registry is loadable (proves evidence/vocabulary/
//     decision-what.json is in the right place and valid JSON).
//   - The linter is wired into evidence-store.writeEvidence.
//   - The linter is SOFT (does NOT throw, Decision is persisted to disk).

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { WorkflowRun } from "../../dist/run.js";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed++; }
  else { console.log(`  FAIL ${label} — ${detail}`); failed++; }
}

// Capture stderr during the run
let stderrBuf = "";
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...args) => {
  stderrBuf += chunk.toString();
  return true;
};

async function scenario() {
  const tmpDir = mkdtempSync(join(tmpdir(), "aiecp-vocab-"));

  // We don't need a real workflow — we just need to call WorkflowRun's
  // emitEvidence directly. Use any workflow for the constructor.
  const def = loadWorkflow(join(__dirname, "..", "..", "..", "workflows", "bug-report.sm.yaml"));
  const run = new WorkflowRun(def, { runDir: tmpDir });

  console.log("=== ADR-0026 vocabulary linter e2e ===\n");

  // --- Case 1: known-good `what` value ---
  stderrBuf = "";
  await run.emitEvidence("trace", {
    id: "trace-vocab-known-good",
    started_at: new Date().toISOString(),
    event_refs: [],
  });
  await run.emitEvidence("decision", {
    id: "decision-vocab-known-good",
    trace_ref: "trace-vocab-known-good",
    what: "architecture_constraint_conflict",
    why: "test: known-good value",
    validated: false,
    result: "pending",
  });
  check("known-good `what` does NOT trigger warning", !stderrBuf.includes("WARNING (ADR-0026"),
    `unexpected warning: ${stderrBuf.slice(0, 200)}`);

  // --- Case 2: known-bad `what` value (the motivating typo case) ---
  stderrBuf = "";
  await run.emitEvidence("decision", {
    id: "decision-vocab-bad-1",
    trace_ref: "trace-vocab-known-good",
    what: "architecture_conflict_with_req",  // plausible typo
    why: "test: known-bad value (typo of architecture_constraint_conflict)",
    validated: false,
    result: "pending",
  });
  check("known-bad `what` triggers ADR-0026 warning", stderrBuf.includes("WARNING (ADR-0026"),
    `expected ADR-0026 warning, got: ${stderrBuf.slice(0, 200)}`);
  check("warning mentions the offending value", stderrBuf.includes("architecture_conflict_with_req"),
    `warning did not name the value: ${stderrBuf.slice(0, 400)}`);

  // --- Case 3: another known-bad variant (hyphen vs underscore) ---
  stderrBuf = "";
  await run.emitEvidence("decision", {
    id: "decision-vocab-bad-2",
    trace_ref: "trace-vocab-known-good",
    what: "architecture-conflict",  // hyphen typo
    why: "test: known-bad value (hyphen instead of underscore)",
    validated: false,
    result: "pending",
  });
  check("hyphen-typo `what` triggers warning", stderrBuf.includes("WARNING (ADR-0026"),
    `expected warning, got: ${stderrBuf.slice(0, 200)}`);

  // --- Case 4: soft lint — bad `what` does NOT throw, Decision IS persisted ---
  const decisionDir = join(tmpDir, "evidence", "decision");
  const files = readdirSync(decisionDir).sort();
  check("bad-`what` Decisions are still persisted to disk", files.length >= 3,
    `expected >= 3 decision files, got ${files.length}`);
  const badDecisionPath = join(decisionDir, "decision-vocab-bad-1.json");
  const badDoc = JSON.parse(readFileSync(badDecisionPath, "utf-8"));
  check("persisted bad Decision has the original `what` value",
    badDoc.what === "architecture_conflict_with_req",
    `got: ${badDoc.what}`);

  // Restore stderr for the final summary
  process.stderr.write = origStderrWrite;

  rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
}

scenario().catch(e => {
  process.stderr.write = origStderrWrite;
  console.error(`\nE2E DRIVER FAILED WITH UNCAUGHT ERROR: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
