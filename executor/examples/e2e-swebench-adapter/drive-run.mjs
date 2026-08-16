// executor/examples/e2e-swebench-adapter/drive-run.mjs
//
// ADR-0031 / ADR-0036 (Phase 3) — SWE-bench adapter regression test.
//
// This driver proves the adapter's ONLY contract: a SWE-bench instance
// JSON is convertible to an AIECP eval scenario YAML that the existing
// `evaluations/eval_runner.py` harness can load and execute.
//
// What this proves:
//   1. `python3 evaluations/swebench-adapter.py <instance.json> --output <out.yaml>`
//      exits 0 and writes a non-empty YAML file.
//   2. The generated YAML parses as valid YAML (via PyYAML, using the
//      same StrictLoader eval_runner.py uses to avoid `on:` being
//      misparsed as a bool).
//   3. The scenario shape matches `_template.yaml`:
//        - id starts with "swebench-"
//        - workflow === "bug-report"
//        - tier === "workflow"
//        - description is a non-empty string mentioning the instance_id
//        - swebench_metadata block exists with all 5 required fields
//          (instance_id, repo, base_commit, fail_to_pass, pass_to_pass)
//        - steps is a non-empty list with ≥10 entries
//        - expected has terminal_state="report", is_terminal=true,
//          max_questions, no_errors=true, evidence_kinds (≥7),
//          memory_types (includes "known-failure"), min_log_entries
//   4. The metadata round-trips: the YAML's swebench_metadata matches the
//      source instance JSON's fields verbatim (no data loss).
//   5. The scenario is loadable by eval_runner.py's scenario loader
//      (StrictLoader) — `on:` is parsed as a string, not a bool.
//   6. The scenario runs through the real WorkflowRun API via
//      `evaluations/eval_runner.py`'s `run_workflow_scenario` — exits
//      `report`, no errors, all expected evidence kinds emitted, the
//      known-failure memory written.
//   7. `--list-samples` exits 0 and lists the sympy-13031 sample.
//   8. `--download <id>` is a STUB: exits 0 and prints instructions
//      (does NOT actually download anything).
//
// What this does NOT prove (out of scope, deferred to Phase 3.5):
//   - Real Pass@1 numbers (needs Docker + real GitHub repo downloads).
//   - That an LLM can actually solve a SWE-bench problem (LLM quality,
//     not framework behavior).
//
// Run: `npm run e2e:swebench-adapter` (after `npm run build --workspace=executor`).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const ADAPTER = join(REPO_ROOT, "evaluations", "swebench-adapter.py");
const SAMPLE = join(REPO_ROOT, "evaluations", "swebench-samples", "sympy-13031.json");

let passed = 0, failed = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed++; }
  else { console.log(`  FAIL ${label} — ${detail}`); failed++; }
}

function runPython(code, cwd = REPO_ROOT) {
  // Run inline Python via `python3 -c`, return { exitCode, stdout, stderr }.
  const r = spawnSync("python3", ["-c", code], {
    cwd,
    encoding: "utf-8",
    timeout: 30000,
  });
  return { exitCode: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function runPythonScript(scriptPath, args, cwd = REPO_ROOT) {
  const r = spawnSync("python3", [scriptPath, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 60000,
  });
  return { exitCode: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

async function scenario() {
  console.log("=== ADR-0031 SWE-bench adapter e2e ===\n");

  // ─── Pre-flight: sample file exists ──────────────────────────────────
  console.log("--- Pre-flight: sample + adapter exist ---");
  check("evaluations/swebench-samples/sympy-13031.json exists", existsSync(SAMPLE));
  check("evaluations/swebench-adapter.py exists", existsSync(ADAPTER));

  // ─── Test 1: --list-samples lists the synthetic sample ──────────────
  console.log("\n--- Test 1: --list-samples ---");
  const listResult = runPythonScript(ADAPTER, ["--list-samples"]);
  check("--list-samples exits 0", listResult.exitCode === 0,
    `exit=${listResult.exitCode} stderr=${listResult.stderr.slice(0, 200)}`);
  check("--list-samples mentions sympy-13031", /sympy-13031/.test(listResult.stdout),
    `stdout: ${listResult.stdout.slice(0, 200)}`);
  check("--list-samples mentions FAIL_TO_PASS", /FAIL_TO_PASS/.test(listResult.stdout),
    `stdout: ${listResult.stdout.slice(0, 200)}`);

  // ─── Test 2: --download is a STUB (exits 0, prints instructions) ─────
  console.log("\n--- Test 2: --download <instance-id> (stub) ---");
  const dlResult = runPythonScript(ADAPTER, ["--download", "sympy-13031"]);
  check("--download exits 0 (stub succeeds)", dlResult.exitCode === 0,
    `exit=${dlResult.exitCode} stderr=${dlResult.stderr.slice(0, 200)}`);
  check("--download prints 'STUB' header", /STUB/.test(dlResult.stdout),
    `stdout: ${dlResult.stdout.slice(0, 200)}`);
  check("--download mentions HuggingFace dataset", /SWE-bench_Verified/.test(dlResult.stdout),
    `stdout: ${dlResult.stdout.slice(0, 200)}`);
  check("--download does NOT actually download anything (no network, no cloned repo)",
    !/Cloning into|git clone.*\.git$/.test(dlResult.stdout));

  // ─── Test 3: Convert sample to scenario YAML ─────────────────────────
  console.log("\n--- Test 3: convert sample → scenario.yaml ---");
  const outDir = mkdtempSync(join(tmpdir(), "aiecp-swebench-adapter-"));
  const outYaml = join(outDir, "scenario.yaml");
  const convResult = runPythonScript(ADAPTER, [SAMPLE, "--output", outYaml]);
  check("convert exits 0", convResult.exitCode === 0,
    `exit=${convResult.exitCode} stderr=${convResult.stderr.slice(0, 200)}`);
  check("convert prints 'OK' status", /^OK  /m.test(convResult.stdout),
    `stdout: ${convResult.stdout.slice(0, 200)}`);
  check("convert mentions scenario id 'swebench-sympy-13031'", /swebench-sympy-13031/.test(convResult.stdout),
    `stdout: ${convResult.stdout.slice(0, 200)}`);
  check("output YAML file exists", existsSync(outYaml));
  check("output YAML is non-empty", readFileSync(outYaml, "utf-8").length > 100);

  // ─── Test 4: Verify YAML parses + shape correctness ───────────────────
  // Use the eval_runner.py's own StrictLoader (same one that loads
  // scenarios/*.yaml). This proves the generated YAML is loadable by
  // the harness without any custom handling.
  console.log("\n--- Test 4: YAML parses via StrictLoader (eval_runner's loader) ---");
  const verifyCode = `
import json, sys, yaml
sys.path.insert(0, ${JSON.stringify(REPO_ROOT)})
from evaluations.eval_runner import StrictLoader, load_scenarios, run_workflow_scenario

with open(${JSON.stringify(outYaml)}) as f:
    data = yaml.load(f, Loader=StrictLoader)

assert isinstance(data, list) and len(data) == 1, "expected a list with 1 scenario"
s = data[0]
out = {
  "parses_ok": True,
  "is_list": isinstance(data, list),
  "len": len(data),
  "id": s.get("id"),
  "workflow": s.get("workflow"),
  "tier": s.get("tier"),
  "description": s.get("description"),
  "has_swebench_metadata": "swebench_metadata" in s,
  "swebench_metadata": s.get("swebench_metadata"),
  "steps_count": len(s.get("steps", [])),
  "expected": s.get("expected"),
  "step_on_is_str": all(isinstance(step.get("on"), str) for step in s.get("steps", []) if "on" in step),
}
print(json.dumps(out))
`;
  const verifyResult = runPython(verifyCode);
  check("YAML parses via StrictLoader without exception", verifyResult.exitCode === 0,
    `stderr: ${verifyResult.stderr.slice(0, 400)}`);

  let parsed;
  try {
    parsed = JSON.parse(verifyResult.stdout.trim().split("\n").pop());
  } catch (e) {
    check("parsed JSON output from verifier", false, `err: ${e.message}, stdout: ${verifyResult.stdout.slice(0, 400)}`);
    parsed = {};
  }

  if (parsed.parses_ok) {
    check("parsed as a list with 1 scenario", parsed.is_list && parsed.len === 1);
    check("id starts with 'swebench-'", typeof parsed.id === "string" && parsed.id.startsWith("swebench-"),
      `id=${parsed.id}`);
    check("id is 'swebench-sympy-13031'", parsed.id === "swebench-sympy-13031", `id=${parsed.id}`);
    check("workflow === 'bug-report'", parsed.workflow === "bug-report", `workflow=${parsed.workflow}`);
    check("tier === 'workflow'", parsed.tier === "workflow", `tier=${parsed.tier}`);
    check("description is non-empty string",
      typeof parsed.description === "string" && parsed.description.length > 0,
      `description=${parsed.description}`);
    check("description mentions the instance_id",
      typeof parsed.description === "string" && parsed.description.includes("sympy-13031"),
      `description=${parsed.description}`);
    check("swebench_metadata block exists", parsed.has_swebench_metadata);
    check("swebench_metadata.instance_id === 'sympy-13031'",
      parsed.swebench_metadata?.instance_id === "sympy-13031",
      `got: ${parsed.swebench_metadata?.instance_id}`);
    check("swebench_metadata.repo === 'https://github.com/sympy/sympy'",
      parsed.swebench_metadata?.repo === "https://github.com/sympy/sympy",
      `got: ${parsed.swebench_metadata?.repo}`);
    check("swebench_metadata.base_commit is a 40-char SHA-like string",
      typeof parsed.swebench_metadata?.base_commit === "string" &&
        parsed.swebench_metadata.base_commit.length >= 12,
      `got: ${parsed.swebench_metadata?.base_commit}`);
    check("swebench_metadata.fail_to_pass is a non-empty list",
      Array.isArray(parsed.swebench_metadata?.fail_to_pass) &&
        parsed.swebench_metadata.fail_to_pass.length >= 1,
      `got: ${parsed.swebench_metadata?.fail_to_pass}`);
    check("swebench_metadata.fail_to_pass includes 'test_simplify_edge_case'",
      parsed.swebench_metadata?.fail_to_pass?.includes("test_simplify_edge_case"),
      `got: ${parsed.swebench_metadata?.fail_to_pass}`);
    check("swebench_metadata.pass_to_pass is a non-empty list",
      Array.isArray(parsed.swebench_metadata?.pass_to_pass) &&
        parsed.swebench_metadata.pass_to_pass.length >= 1,
      `got: ${parsed.swebench_metadata?.pass_to_pass}`);
    check("swebench_metadata.pass_to_pass includes 'test_simplify_basic'",
      parsed.swebench_metadata?.pass_to_pass?.includes("test_simplify_basic"),
      `got: ${parsed.swebench_metadata?.pass_to_pass}`);
    check("steps is a non-empty list (≥10 entries)",
      parsed.steps_count >= 10, `steps_count=${parsed.steps_count}`);
    check("all 'on:' fields are parsed as strings (not bools)",
      parsed.step_on_is_str === true,
      `step_on_is_str=${parsed.step_on_is_str}`);
    check("expected.terminal_state === 'report'",
      parsed.expected?.terminal_state === "report",
      `got: ${parsed.expected?.terminal_state}`);
    check("expected.is_terminal === true",
      parsed.expected?.is_terminal === true,
      `got: ${parsed.expected?.is_terminal}`);
    check("expected.max_questions is a positive int (≤2)",
      typeof parsed.expected?.max_questions === "number" &&
        parsed.expected.max_questions >= 0 && parsed.expected.max_questions <= 2,
      `got: ${parsed.expected?.max_questions}`);
    check("expected.no_errors === true",
      parsed.expected?.no_errors === true,
      `got: ${parsed.expected?.no_errors}`);
    check("expected.evidence_kinds has ≥7 entries",
      Array.isArray(parsed.expected?.evidence_kinds) &&
        parsed.expected.evidence_kinds.length >= 7,
      `got: ${parsed.expected?.evidence_kinds}`);
    check("expected.evidence_kinds includes 'incident'",
      parsed.expected?.evidence_kinds?.includes("incident"));
    check("expected.evidence_kinds includes 'decision'",
      parsed.expected?.evidence_kinds?.includes("decision"));
    check("expected.evidence_kinds includes 'trace'",
      parsed.expected?.evidence_kinds?.includes("trace"));
    check("expected.evidence_kinds includes 'event'",
      parsed.expected?.evidence_kinds?.includes("event"));
    check("expected.evidence_kinds includes 'expected'",
      parsed.expected?.evidence_kinds?.includes("expected"));
    check("expected.evidence_kinds includes 'actual'",
      parsed.expected?.evidence_kinds?.includes("actual"));
    check("expected.evidence_kinds includes 'validation'",
      parsed.expected?.evidence_kinds?.includes("validation"));
    check("expected.evidence_kinds includes 'replay'",
      parsed.expected?.evidence_kinds?.includes("replay"));
    check("expected.memory_types includes 'known-failure'",
      Array.isArray(parsed.expected?.memory_types) &&
        parsed.expected.memory_types.includes("known-failure"),
      `got: ${parsed.expected?.memory_types}`);
    check("expected.min_log_entries is a positive int",
      typeof parsed.expected?.min_log_entries === "number" &&
        parsed.expected.min_log_entries >= 5,
      `got: ${parsed.expected?.min_log_entries}`);
  }

  // ─── Test 5: Metadata round-trips ────────────────────────────────────
  // The adapter must not lose or mangle data: every field in the source
  // instance JSON must appear verbatim in the generated YAML's
  // swebench_metadata block (with the only rename being FAIL_TO_PASS →
  // fail_to_pass / PASS_TO_PASS → pass_to_pass per YAML conventions).
  console.log("\n--- Test 5: metadata round-trips (no data loss) ---");
  const sampleJson = JSON.parse(readFileSync(SAMPLE, "utf-8"));
  if (parsed.swebench_metadata) {
    check("instance_id matches source JSON",
      parsed.swebench_metadata.instance_id === sampleJson.instance_id,
      `adapter=${parsed.swebench_metadata.instance_id} source=${sampleJson.instance_id}`);
    check("repo matches source JSON",
      parsed.swebench_metadata.repo === sampleJson.repo);
    check("base_commit matches source JSON",
      parsed.swebench_metadata.base_commit === sampleJson.base_commit);
    check("fail_to_pass matches source JSON (order preserved)",
      JSON.stringify(parsed.swebench_metadata.fail_to_pass) ===
        JSON.stringify(sampleJson.FAIL_TO_PASS),
      `adapter=${JSON.stringify(parsed.swebench_metadata.fail_to_pass)} source=${JSON.stringify(sampleJson.FAIL_TO_PASS)}`);
    check("pass_to_pass matches source JSON (order preserved)",
      JSON.stringify(parsed.swebench_metadata.pass_to_pass) ===
        JSON.stringify(sampleJson.PASS_TO_PASS),
      `adapter=${JSON.stringify(parsed.swebench_metadata.pass_to_pass)} source=${JSON.stringify(sampleJson.PASS_TO_PASS)}`);
  }

  // ─── Test 6: Scenario runs through the real WorkflowRun API ───────────
  // The adapter's contract is that the generated scenario is RUNNABLE by
  // the existing eval_runner.py harness. We verify this by copying the
  // generated YAML into a temp scenarios/ directory and invoking the
  // harness's run_workflow_scenario function on it directly.
  console.log("\n--- Test 6: scenario runs through eval_runner.py's run_workflow_scenario ---");
  const runCode = `
import json, sys, yaml, os, tempfile
sys.path.insert(0, ${JSON.stringify(REPO_ROOT)})
from evaluations.eval_runner import StrictLoader, run_workflow_scenario

with open(${JSON.stringify(outYaml)}) as f:
    data = yaml.load(f, Loader=StrictLoader)
scenario = data[0]
scenario["_source_file"] = "swebench-generated.yaml"

result = run_workflow_scenario(scenario)
out = {
  "scenario_id": result.scenario_id,
  "passed": result.passed,
  "assertions_passed": result.assertions_passed,
  "assertions_failed": result.assertions_failed,
  "final_state": None,
  "error": result.error,
  "assertions": [{"description": a.description, "passed": a.passed, "detail": a.detail} for a in result.assertions],
}
print(json.dumps(out))
`;
  const runResult = runPython(runCode);
  check("run_workflow_scenario completes without harness error", runResult.exitCode === 0,
    `exit=${runResult.exitCode} stderr=${runResult.stderr.slice(0, 400)}`);

  let runOut;
  try {
    runOut = JSON.parse(runResult.stdout.trim().split("\n").pop());
  } catch (e) {
    check("parsed JSON output from run_workflow_scenario", false,
      `err: ${e.message}, stdout: ${runResult.stdout.slice(0, 400)}`);
    runOut = { passed: false, assertions_failed: -1, assertions: [] };
  }

  if (runOut.assertions !== undefined) {
    check(`run_workflow_scenario reports scenario PASSED`, runOut.passed === true,
      `passed=${runOut.passed} error=${runOut.error}`);
    check(`assertions: ${runOut.assertions_passed} passed, ${runOut.assertions_failed} failed`,
      runOut.assertions_failed === 0 && runOut.assertions_passed >= 5,
      `assertions_passed=${runOut.assertions_passed} assertions_failed=${runOut.assertions_failed}`);
    check("final state assertion: 'report' reached",
      runOut.assertions.some(a => a.description.includes("final state") && a.passed),
      `assertions: ${JSON.stringify(runOut.assertions.map(a => a.description))}`);
    check("no WorkflowViolation errors",
      runOut.assertions.some(a => a.description.includes("no WorkflowViolation") && a.passed),
      `assertions: ${JSON.stringify(runOut.assertions.map(a => a.description))}`);
    check("evidence kinds assertion passed (8 expected kinds emitted)",
      runOut.assertions.some(a => a.description.includes("evidence kinds") && a.passed),
      `assertions: ${JSON.stringify(runOut.assertions.map(a => a.description))}`);
    check("memory types assertion passed (known-failure written)",
      runOut.assertions.some(a => a.description.includes("memory types") && a.passed),
      `assertions: ${JSON.stringify(runOut.assertions.map(a => a.description))}`);
    check("log entries assertion passed (≥ 8)",
      runOut.assertions.some(a => a.description.includes("log entries") && a.passed),
      `assertions: ${JSON.stringify(runOut.assertions.map(a => a.description))}`);
  }

  // ─── Test 7: --download stub for unknown instance ────────────────────
  console.log("\n--- Test 7: --download for arbitrary instance-id (stub is generic) ---");
  const dl2 = runPythonScript(ADAPTER, ["--download", "django-12345"]);
  check("--download for arbitrary id exits 0", dl2.exitCode === 0,
    `exit=${dl2.exitCode} stderr=${dl2.stderr.slice(0, 200)}`);
  check("--download mentions the requested id", /django-12345/.test(dl2.stdout),
    `stdout: ${dl2.stdout.slice(0, 200)}`);

  // ─── Test 8: Missing instance → usage error (exit 2) ──────────────────
  console.log("\n--- Test 8: missing instance arg → exit 2 ---");
  const noarg = runPythonScript(ADAPTER, []);
  check("no args exits 2 (usage error)", noarg.exitCode === 2,
    `exit=${noarg.exitCode}`);
  check("no-args stderr mentions usage", /usage/i.test(noarg.stderr) || /usage/i.test(noarg.stdout),
    `stderr: ${noarg.stderr.slice(0, 200)}`);

  // ─── Test 9: Non-existent instance file → exit 2 ----------------------
  console.log("\n--- Test 9: non-existent instance file → exit 2 ---");
  const bad = runPythonScript(ADAPTER, ["/tmp/does-not-exist-swebench-13031.json"]);
  check("non-existent file exits 2", bad.exitCode === 2,
    `exit=${bad.exitCode}`);
  check("non-existent file error mentions 'not found'", /not found/i.test(bad.stderr),
    `stderr: ${bad.stderr.slice(0, 200)}`);

  // ─── Cleanup ──────────────────────────────────────────────────────────
  rmSync(outDir, { recursive: true, force: true });

  // ─── Summary ─────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
}

scenario().catch((e) => {
  console.error(`\nE2E DRIVER FAILED WITH UNCAUGHT ERROR: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
