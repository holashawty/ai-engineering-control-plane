#!/usr/bin/env python3
"""
AIECP Evaluation Harness — Phase 8 (per ADR-0017).

Evaluates framework behavior (NOT LLM quality) across three tiers:
  1. Skill behavior evals: does following a skill's procedure produce
     the expected evidence artifacts?
  2. Workflow evals: does the workflow SM reach `report` with verified
     success for a given scenario?
  3. Compatibility tests: do all agent adapters produce equivalent
     observable behavior (modulo capability gaps)?

A fourth dimension: question economy — does the scenario reach `report`
without asking avoidable questions?

Architecture (per docs/evaluations/evaluation-strategy.md):
  - Scenarios are fixtures: a repo state + an intent + expected evidence
    artifacts + expected memory updates + expected outcome.
  - Eval runner: (a) load fixture, (b) invoke the framework's WorkflowRun
    API (via Node.js subprocess), (c) collect evidence artifacts, (d)
    compare to expected via schema-validated assertions, (e) score.
  - Inspired by OpenHands eval harness and SWE-bench, but scoped to
    *framework behavior*, not benchmark problems.

Usage:
  python3 evaluations/eval_runner.py                    # run all scenarios
  python3 evaluations/eval_runner.py --workflow bug-report  # one workflow
  python3 evaluations/eval_runner.py --tier skill         # one tier
  python3 evaluations/eval_runner.py --list                # list scenarios
  python3 evaluations/eval_runner.py --verbose             # show details

Exit codes:
  0  all scenarios PASS
  1  one or more scenarios FAIL
  2  harness error (bad config, missing files, etc.)
"""

import json
import os
import subprocess
import sys
import tempfile
import time
import yaml
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ---- Configuration ----

# Custom YAML loader that doesn't interpret 'on'/'off'/'yes'/'no' as booleans
# (YAML 1.1 treats 'on' as True, which breaks our 'on:' field in scenarios)
class StrictLoader(yaml.SafeLoader):
    pass

StrictLoader.yaml_implicit_resolvers = {
    k: [r for r in v] for k, v in yaml.SafeLoader.yaml_implicit_resolvers.items()
}
# Remove bool resolver for 'o' (on/off), 'y' (yes), 'n' (no)
for char in ['o', 'y', 'n']:
    if char in StrictLoader.yaml_implicit_resolvers:
        StrictLoader.yaml_implicit_resolvers[char] = [
            (tag, regexp) for tag, regexp in StrictLoader.yaml_implicit_resolvers[char]
            if tag != 'tag:yaml.org,2002:bool'
        ]

REPO_ROOT = Path(__file__).resolve().parent.parent
SCENARIOS_DIR = Path(__file__).resolve().parent / "scenarios"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
RESULTS_DIR = Path(__file__).resolve().parent / "results"

# ---- Data classes ----

@dataclass
class EvalResult:
    scenario_id: str
    workflow: str
    tier: str  # "skill" | "workflow" | "compatibility"
    passed: bool
    assertions_passed: int
    assertions_failed: int
    assertions: list = field(default_factory=list)
    duration_ms: int = 0
    error: Optional[str] = None

    @property
    def summary(self) -> str:
        status = "PASS" if self.passed else "FAIL"
        return f"[{status}] {self.scenario_id} ({self.workflow}/{self.tier}): {self.assertions_passed}/{self.assertions_passed + self.assertions_failed} assertions"

@dataclass
class Assertion:
    description: str
    passed: bool
    detail: str = ""

# ---- Scenario loading ----

def load_scenarios() -> list[dict]:
    """Load all scenario YAML files from scenarios/ directory."""
    scenarios = []
    if not SCENARIOS_DIR.exists():
        return scenarios
    for path in sorted(SCENARIOS_DIR.glob("*.yaml")) + sorted(SCENARIOS_DIR.glob("*.yml")):
        with open(path) as f:
            data = yaml.load(f, Loader=StrictLoader)
            if data and isinstance(data, list):
                for s in data:
                    s["_source_file"] = path.name
                    scenarios.append(s)
            elif data and isinstance(data, dict):
                data["_source_file"] = path.name
                scenarios.append(data)
    return scenarios

def filter_scenarios(scenarios: list[dict], workflow: Optional[str] = None, tier: Optional[str] = None) -> list[dict]:
    result = scenarios
    if workflow:
        result = [s for s in result if s.get("workflow") == workflow]
    if tier:
        result = [s for s in result if s.get("tier") == tier]
    return result

# ---- WorkflowRun bridge ----

def run_workflow_scenario(scenario: dict) -> EvalResult:
    """
    Run a scenario against the real WorkflowRun API via a Node.js subprocess.

    The scenario defines:
    - workflow: which workflow to run
    - steps: ordered list of actions (emitEvidence, writeMemory, advance, askQuestion)
    - expected: expected outcomes (terminal_state, question_count, evidence_kinds, memory_types)

    The runner creates a temporary directory, writes a Node.js script that
    drives the WorkflowRun API, executes it, and compares the output to
    expectations.
    """
    scenario_id = scenario.get("id", "unknown")
    workflow_name = scenario.get("workflow", "bug-report")
    tier = scenario.get("tier", "workflow")
    expected = scenario.get("expected", {})
    steps = scenario.get("steps", [])

    result = EvalResult(
        scenario_id=scenario_id,
        workflow=workflow_name,
        tier=tier,
        passed=False,
        assertions_passed=0,
        assertions_failed=0,
    )

    start_time = time.time()

    try:
        # Build a Node.js driver script that exercises the WorkflowRun API
        # with the scenario's steps
        driver_code = build_driver_script(scenario)

        # Write to temp file and execute
        with tempfile.NamedTemporaryFile(suffix=".mjs", mode="w", delete=False, dir=str(REPO_ROOT)) as f:
            f.write(driver_code)
            driver_path = f.name

        try:
            proc = subprocess.run(
                ["node", driver_path],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=str(REPO_ROOT),
            )

            output = proc.stdout + proc.stderr
            result.duration_ms = int((time.time() - start_time) * 1000)

            if proc.returncode != 0:
                # The driver itself crashed
                result.error = f"Driver exited {proc.returncode}: {output[:500]}"
                result.assertions.append(Assertion(
                    description="driver executes without error",
                    passed=False,
                    detail=result.error,
                ))
                result.assertions_failed += 1
                return result

            # Parse the JSON output from the driver
            try:
                driver_result = json.loads(output.strip().split("\n")[-1])
            except (json.JSONDecodeError, IndexError):
                result.error = f"Could not parse driver output as JSON: {output[:500]}"
                result.assertions.append(Assertion(
                    description="driver produces valid JSON output",
                    passed=False,
                    detail=result.error,
                ))
                result.assertions_failed += 1
                return result

            # Run assertions against the driver result
            assertions = evaluate_expectations(driver_result, expected, scenario)
            for a in assertions:
                if a.passed:
                    result.assertions_passed += 1
                else:
                    result.assertions_failed += 1
                result.assertions.append(a)

            result.passed = result.assertions_failed == 0

        finally:
            os.unlink(driver_path)

    except subprocess.TimeoutExpired:
        result.error = "Driver timed out (30s)"
        result.assertions.append(Assertion(
            description="driver completes within 30s",
            passed=False,
            detail=result.error,
        ))
        result.assertions_failed += 1
    except Exception as e:
        result.error = str(e)
        result.assertions.append(Assertion(
            description="scenario runs without exception",
            passed=False,
            detail=result.error,
        ))
        result.assertions_failed += 1

    result.duration_ms = int((time.time() - start_time) * 1000)
    return result

def build_driver_script(scenario: dict) -> str:
    """Build a Node.js .mjs script that drives the WorkflowRun API."""
    workflow = scenario.get("workflow", "bug-report")
    steps = scenario.get("steps", [])

    steps_json = json.dumps(steps, indent=2)

    return f"""import {{ loadWorkflow }} from "./executor/dist/workflow-loader.js";
import {{ WorkflowRun }} from "./executor/dist/run.js";
import {{ WorkflowViolation }} from "./executor/dist/types.js";
import {{ mkdtempSync, rmSync, readdirSync }} from "node:fs";
import {{ tmpdir }} from "node:os";
import {{ join }} from "node:path";

const steps = {steps_json};
const tmpDir = mkdtempSync(join(tmpdir(), "aiecp-eval-"));

async function run() {{
  const def = loadWorkflow("workflows/{workflow}.sm.yaml");
  const run = new WorkflowRun(def, {{ runDir: tmpDir }});

  const errors = [];
  let evidenceKinds = new Set();
  let memoryTypes = new Set();
  let advanceResults = [];

  for (const step of steps) {{
    try {{
      switch (step.action) {{
        case "emitEvidence":
          await run.emitEvidence(step.kind, step.data);
          evidenceKinds.add(step.kind);
          break;
        case "writeMemory":
          await run.writeMemory(step.type, step.data);
          memoryTypes.add(step.type);
          break;
        case "advance":
          try {{
            const result = run.advance(step.on);
            advanceResults.push({{ on: step.on, result: "ok", state: run.currentState, gateDecision: result.gateDecision }});
          }} catch (e) {{
            if (e instanceof WorkflowViolation && e.kind === "safety-gate-needs-confirmation") {{
              run.advanceWithConfirmation(step.on);
              advanceResults.push({{ on: step.on, result: "confirmed", state: run.currentState }});
            }} else {{
              throw e;
            }}
          }}
          break;
        case "askQuestion":
          run.askQuestion(step.text);
          break;
        case "expectViolation":
          // This step expects a violation — try the action and verify it throws
          try {{
            if (step.violationAction === "advance") {{
              run.advance(step.on);
            }} else if (step.violationAction === "askQuestion") {{
              run.askQuestion(step.text);
            }}
            errors.push(`Expected violation on ${{step.violationAction}} but none was thrown`);
          }} catch (e) {{
            if (e instanceof WorkflowViolation && e.kind === step.expectedKind) {{
              // Expected violation caught
            }} else {{
              errors.push(`Expected violation kind ${{step.expectedKind}} but got ${{e.kind ?? e.message}}`);
            }}
          }}
          break;
      }}
    }} catch (e) {{
      if (e instanceof WorkflowViolation) {{
        errors.push(`WorkflowViolation: ${{e.kind}} — ${{e.message}}`);
      }} else {{
        errors.push(`Error: ${{e.message}}`);
      }}
    }}
  }}

  // Check disk persistence
  let evidenceOnDisk = [];
  let memoryOnDisk = [];
  try {{
    const evidenceDir = join(tmpDir, "evidence");
    for (const kind of readdirSync(evidenceDir)) {{
      const files = readdirSync(join(evidenceDir, kind));
      evidenceOnDisk.push(kind);
    }}
  }} catch {{}}
  try {{
    const memoryDir = join(tmpDir, "memory");
    for (const type of readdirSync(memoryDir)) {{
      memoryOnDisk.push(type);
    }}
  }} catch {{}}

  rmSync(tmpDir, {{ recursive: true, force: true }});

  const result = {{
    finalState: run.currentState,
    isTerminal: run.isTerminal(),
    questionCount: run.questions.count,
    logEntries: run.log.length,
    errors: errors,
    evidenceKinds: [...evidenceKinds],
    memoryTypes: [...memoryTypes],
    evidenceOnDisk: evidenceOnDisk,
    memoryOnDisk: memoryOnDisk,
    advanceResults: advanceResults,
  }};

  console.log(JSON.stringify(result));
}}

run().catch(e => {{
  console.error(JSON.stringify({{ error: e.message }}));
  process.exit(1);
}});
"""

def evaluate_expectations(driver_result: dict, expected: dict, scenario: dict) -> list[Assertion]:
    """Compare driver output to expected outcomes."""
    assertions = []

    # 1. Terminal state
    if "terminal_state" in expected:
        actual = driver_result.get("finalState", "")
        passed = actual == expected["terminal_state"]
        assertions.append(Assertion(
            description=f"final state is '{expected['terminal_state']}'",
            passed=passed,
            detail=f"actual: {actual}",
        ))

    # 2. Is terminal
    if expected.get("is_terminal", True):
        passed = driver_result.get("isTerminal", False)
        assertions.append(Assertion(
            description="workflow reached a terminal state",
            passed=passed,
            detail=f"isTerminal: {passed}",
        ))

    # 3. Question count
    if "max_questions" in expected:
        actual = driver_result.get("questionCount", 0)
        passed = actual <= expected["max_questions"]
        assertions.append(Assertion(
            description=f"questions asked <= {expected['max_questions']}",
            passed=passed,
            detail=f"actual: {actual}",
        ))

    # 4. No errors
    if expected.get("no_errors", True):
        errors = driver_result.get("errors", [])
        passed = len(errors) == 0
        assertions.append(Assertion(
            description="no WorkflowViolation errors",
            passed=passed,
            detail=f"errors: {errors[:3]}" if errors else "none",
        ))

    # 5. Evidence kinds emitted
    if "evidence_kinds" in expected:
        actual = set(driver_result.get("evidenceKinds", []))
        expected_kinds = set(expected["evidence_kinds"])
        passed = expected_kinds.issubset(actual)
        missing = expected_kinds - actual
        assertions.append(Assertion(
            description=f"evidence kinds include {expected_kinds}",
            passed=passed,
            detail=f"actual: {actual}, missing: {missing}" if missing else f"actual: {actual}",
        ))

    # 6. Memory types written
    if "memory_types" in expected:
        actual = set(driver_result.get("memoryTypes", []))
        expected_types = set(expected["memory_types"])
        passed = expected_types.issubset(actual)
        missing = expected_types - actual
        assertions.append(Assertion(
            description=f"memory types include {expected_types}",
            passed=passed,
            detail=f"actual: {actual}, missing: {missing}" if missing else f"actual: {actual}",
        ))

    # 7. Evidence persisted to disk
    if expected.get("evidence_on_disk", False):
        actual = driver_result.get("evidenceOnDisk", [])
        passed = len(actual) > 0
        assertions.append(Assertion(
            description="evidence persisted to disk",
            passed=passed,
            detail=f"on disk: {actual}",
        ))

    # 8. Log entries
    if "min_log_entries" in expected:
        actual = driver_result.get("logEntries", 0)
        passed = actual >= expected["min_log_entries"]
        assertions.append(Assertion(
            description=f"log entries >= {expected['min_log_entries']}",
            passed=passed,
            detail=f"actual: {actual}",
        ))

    # 9. Specific violation expected
    if "expected_violation" in expected:
        errors = driver_result.get("errors", [])
        violation = expected["expected_violation"]
        passed = any(violation in e for e in errors)
        assertions.append(Assertion(
            description=f"expected violation '{violation}' in errors",
            passed=passed,
            detail=f"errors: {errors[:3]}",
        ))

    return assertions

# ---- Main ----

def main():
    import argparse
    parser = argparse.ArgumentParser(description="AIECP Evaluation Harness")
    parser.add_argument("--workflow", help="Filter by workflow name")
    parser.add_argument("--tier", help="Filter by tier (skill, workflow, compatibility)")
    parser.add_argument("--list", action="store_true", help="List scenarios and exit")
    parser.add_argument("--verbose", action="store_true", help="Show assertion details")
    args = parser.parse_args()

    scenarios = load_scenarios()

    if not scenarios:
        print("No scenarios found. Create YAML files in evaluations/scenarios/.")
        print("See evaluations/scenarios/_template.yaml for the format.")
        sys.exit(2)

    if args.list:
        print(f"Found {len(scenarios)} scenario(s):")
        for s in scenarios:
            print(f"  {s.get('id', '?'):40s} workflow={s.get('workflow', '?'):20s} tier={s.get('tier', '?')}")
        sys.exit(0)

    filtered = filter_scenarios(scenarios, args.workflow, args.tier)
    if not filtered:
        print(f"No scenarios match the filter (workflow={args.workflow}, tier={args.tier}).")
        sys.exit(0)

    print(f"=== AIECP Evaluation Harness ===")
    print(f"Running {len(filtered)} scenario(s)...")
    print()

    results: list[EvalResult] = []
    for scenario in filtered:
        print(f"  Running: {scenario.get('id', '?')} ({scenario.get('workflow', '?')}/{scenario.get('tier', '?')})...")
        result = run_workflow_scenario(scenario)
        results.append(result)
        print(f"    {result.summary} ({result.duration_ms}ms)")
        if args.verbose or not result.passed:
            for a in result.assertions:
                status = "✓" if a.passed else "✗"
                print(f"      {status} {a.description}" + (f" — {a.detail}" if a.detail else ""))

    # Summary
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed
    total_assertions = sum(r.assertions_passed + r.assertions_failed for r in results)
    passed_assertions = sum(r.assertions_passed for r in results)
    failed_assertions = sum(r.assertions_failed for r in results)

    print()
    print(f"=== Summary ===")
    print(f"Scenarios:  {passed}/{total} passed ({failed} failed)")
    print(f"Assertions: {passed_assertions}/{total_assertions} passed ({failed_assertions} failed)")
    print(f"Duration:   {sum(r.duration_ms for r in results)}ms total")

    if failed > 0:
        print()
        print("Failed scenarios:")
        for r in results:
            if not r.passed:
                print(f"  {r.scenario_id}: {r.assertions_failed} assertion(s) failed")
        sys.exit(1)

    print()
    print("ALL SCENARIOS PASSED")

    # Write results to file
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    results_file = RESULTS_DIR / f"eval-{int(time.time())}.json"
    with open(results_file, "w") as f:
        json.dump([{
            "scenario_id": r.scenario_id,
            "workflow": r.workflow,
            "tier": r.tier,
            "passed": r.passed,
            "assertions_passed": r.assertions_passed,
            "assertions_failed": r.assertions_failed,
            "duration_ms": r.duration_ms,
            "error": r.error,
            "assertions": [{"description": a.description, "passed": a.passed, "detail": a.detail} for a in r.assertions],
        } for r in results], f, indent=2)
    print(f"Results written to {results_file}")

if __name__ == "__main__":
    main()
