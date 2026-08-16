# Evaluations

**Status: Phase 8 — eval harness operational.**

Python-based evaluation harness (per ADR-0017) that tests framework
behavior across three tiers per `docs/evaluations/evaluation-strategy.md`:

1. **Skill behavior evals** — does following a skill's procedure
   produce the expected evidence artifacts?
2. **Workflow evals** — does the workflow SM reach `report` with
   verified success for a given scenario?
3. **Compatibility tests** — do all agent adapters produce equivalent
   observable behavior?

A fourth dimension: **question economy** — does the scenario reach
`report` without asking avoidable questions?

## Running the eval harness

The harness drives the real `WorkflowRun` API (TypeScript), which
lives in `executor/dist/`. That directory is gitignored (per
ADR-0021's policy of not committing build artifacts, except
`discovery/cli/dist/`). You MUST build the executor first:

```bash
# Required once before first eval run, and after any executor/ change
npm run build --workspace=executor

# Then run evals:
python3 evaluations/eval_runner.py

# Run one workflow's scenarios
python3 evaluations/eval_runner.py --workflow bug-report

# Run one tier
python3 evaluations/eval_runner.py --tier workflow

# List all scenarios
python3 evaluations/eval_runner.py --list

# Show assertion details
python3 evaluations/eval_runner.py --verbose
```

If you see `ERR_MODULE_NOT_FOUND` for `executor/dist/run.js`, the
build step above was skipped.

Note: `npm run count-assertions` (per ADR-0029) does NOT auto-build.
The `.github/workflows/assertion-table-check.yml` CI workflow runs
`npm run build` as a separate step before
`npm run count-assertions -- --check`, but if you run
`count-assertions` locally without building first, you'll get the
same `ERR_MODULE_NOT_FOUND`.

## Current coverage

| Workflow | Scenarios | Status |
|---|---|---|
| bug-report | 5 (happy, question × 2, safety gate, blocked) | ✅ 5/5 PASS |
| code-review | 3 (happy, no gate, blocked) | ✅ 3/3 PASS |
| feature-request | 3 (happy, safety gate, blocked) | ✅ 3/3 PASS |
| **Total** | **11 scenarios, 43 assertions** | **11/11 PASS** |

## How it works

1. **Scenarios** are YAML files in `scenarios/` — each defines a
   workflow, ordered steps (emitEvidence, writeMemory, advance,
   askQuestion, expectViolation), and expected outcomes.
2. **eval_runner.py** generates a Node.js driver script that calls
   the real `WorkflowRun` API (`emitEvidence()`, `advance()`,
   `writeMemory()`, `askQuestion()`), executes it, and collects
   the output.
3. **Assertions** compare the driver output to expected outcomes:
   terminal state, question count, evidence kinds, memory types,
   disk persistence, error count, log entries, expected violations.
4. **Results** are written to `results/eval-<timestamp>.json`.

## Architecture

- `eval_runner.py` — main runner (Python, per ADR-0017)
- `scenarios/*.yaml` — scenario definitions
- `fixtures/` — toy repo fixtures (for future expansion)
- `results/` — JSON result files

Inspired by OpenHands eval harness and SWE-bench, but scoped to
*framework behavior*, not benchmark problems.
