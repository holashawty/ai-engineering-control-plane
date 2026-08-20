import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("======================================================================");
console.log("              AIECP PUBLIC AGENT QUALITY BENCHMARK (V2)");
console.log("======================================================================");
console.log("Evaluating autonomous engineering discipline, policy enforcement,");
console.log("blast-radius slicing, and behavioral verification...\n");

const scenarios = [
  {
    name: "Scenario 1: Real Bug Reproduction & Boundary Fix",
    cmd: "node",
    args: ["executor/examples/e2e-membership-bug/drive-run.mjs"],
  },
  {
    name: "Scenario 2: Feature Request & Contract-Driven Implement",
    cmd: "node",
    args: ["executor/examples/e2e-feature-request/drive-run.mjs"],
  },
  {
    name: "Scenario 3: Runtime Policy Gateway & Safety Enforcement",
    cmd: "node",
    args: ["executor/dist/cli.js", "--self-test"],
  },
  {
    name: "Scenario 4: Blast-Radius Context Slicing & Token Optimization",
    cmd: "node",
    args: ["discovery/cli/dist/cli.js", "--self-test"],
  },
  {
    name: "Scenario 5: Closed-Loop Headless Browser Verification",
    cmd: "node",
    args: ["scripts/browser-verifier.mjs", "--self-test"],
  },
  {
    name: "Scenario 6: Parallel Subagent Swarm & Causal Evidence Graph",
    cmd: "node",
    args: ["executor/examples/e2e-swarm/drive-run.mjs"],
  },
];

let passedCount = 0;
const latencies = [];

for (const sc of scenarios) {
  process.stdout.write(`[BENCHMARK] Running: ${sc.name}... `);
  const start = performance.now();
  const res = spawnSync(sc.cmd, sc.args, { encoding: "utf-8", stdio: "pipe" });
  const duration = Math.round(performance.now() - start);
  latencies.push(duration);

  if (res.status === 0) {
    console.log(`PASSED (${duration}ms)`);
    passedCount++;
  } else {
    console.log(`FAILED (${duration}ms)`);
    if (res.stderr) console.error(res.stderr.slice(0, 300));
  }
}

const passAtOne = ((passedCount / scenarios.length) * 100).toFixed(1);
const medianLat = latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)];

// REAL context-savings measurement — no fixed string. Runs the offline,
// zero-cost tokenizer-based measurement and parses its JSON output.
const measureResult = spawnSync(
  "node",
  [join(__dirname, "..", "scripts", "measure-context-savings.mjs"), "--json"],
  { encoding: "utf-8" },
);
let contextSavingsLine = "Token Slicing Efficiency:       MEASUREMENT FAILED (see stderr)";
let zeroMatchWarningLine = "";
if (measureResult.status === 0) {
  try {
    const parsed = JSON.parse(measureResult.stdout);
    const zeroRows = parsed.rows.filter((r) => r.jit_tokens === 0);
    contextSavingsLine = `Token Slicing Efficiency:       +${parsed.overallSavings}% context savings (MEASURED via gpt-tokenizer)`;
    zeroMatchWarningLine = `Zero-Match States:              ${zeroRows.length}/${parsed.rows.length} (see scripts/measure-context-savings.mjs)`;
  } catch {
    // leave failure message
  }
}

console.log("\n======================================================================");
console.log("                       BENCHMARK SCORECARD REPORT                      ");
console.log("======================================================================");
console.log(`Total Scenarios Evaluated:      ${scenarios.length}`);
console.log(`Pass@1 Success Rate:            ${passAtOne}%`);
console.log(contextSavingsLine);
if (zeroMatchWarningLine) console.log(zeroMatchWarningLine);
console.log(`Median Scenario Latency:        ${medianLat} ms`);
console.log("======================================================================");

if (passedCount === scenarios.length) {
  console.log("RESULT: ALL BENCHMARK CRITERIA MET (VERIFIED PASS)\n");
  process.exit(0);
} else {
  console.error("RESULT: BENCHMARK SUITE FAILED\n");
  process.exit(1);
}
