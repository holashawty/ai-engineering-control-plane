---
name: testing
description: Use whenever a workflow needs to run, write, or interpret tests — always via the project's own detected test runner (Project Intelligence project.test_system), never a framework-imposed toolchain. Supports reproduce, verify, and regression-protect states.
license: MIT
allowed-tools: [shell_exec, test_runner, filesystem_read, filesystem_write]
---

# Testing

## When to use this skill

Any workflow state that needs to run or write tests:
`reproduce` (write/run a reproduction), `verify` (run the suite +
targeted behavioral check, via `behavioral-verification`),
`regression-protect` (add a guard so the incident class can't recur
silently).

## Procedure

### 1. Never guess the toolchain

Read `.aiecp/project-intelligence.json`
(`discovery/schema/project-intelligence.schema.json` shape) —
specifically `project.test_system` and `project.build_system` — before
running or writing anything. If that file doesn't exist yet, run
`discovery/cli` first (`node dist/cli.js <repo-path>`) rather than
assuming pytest/vitest/whatever is the framework's own default.

Concretely, this means: a Python project detected with `pytest` gets
`pytest`-shaped tests; a TypeScript project detected with `vitest` gets
`vitest`-shaped tests; per
`constitution/engineering-principles.md` "Stack-native tooling."

### 2. Reproduction tests are disposable; regression tests are permanent

A test written during `reproduce` exists to trigger the symptom
deterministically — it may be deleted or folded into the regression
test once the incident is resolved. A test written during
`regression-protect` is permanent and must be committed alongside the
fix; it is what makes `docs/memory-model.md`'s `known-failure` entry
meaningful (a known-failure with no regression guard is just a note,
not protection).

### 3. Test output becomes Evidence, not just pass/fail

Per `evidence-engineering`: a test run corresponds to a `Trace` with
`Event`s (per assertion or per significant step, not necessarily one
Event per line of output). Raw stdout/stderr is not itself evidence
until captured as a structured `Event.payload` — see
`evidence/schema/event.schema.json`.

### 4. A passing suite is an input to verification, not the output

This skill runs tests. It does not, on its own, decide whether an
`Incident` is resolved — that judgment belongs to
`behavioral-verification`, which explicitly treats "tests pass" as
necessary-but-not-sufficient. Do not let this skill's output be
mistaken for a `Validation` entity; it produces `Trace`/`Event` data
that `behavioral-verification` consumes.

## Tool integration

- `test_runner`: preferred when the agent adapter exposes structured
  test results (pass/fail per case, not raw text) — per
  `docs/portability.md` adapter `capabilities()`.
- `shell_exec`: fallback when no structured `test_runner` capability is
  available; parse output carefully rather than assuming exit-code 0
  means "all assertions meaningful" (see `behavioral-verification`).
- `filesystem_write`: add new test files during `reproduce` and
  `regression-protect`.
- `filesystem_read`: read existing tests to avoid duplicating coverage
  and to match the project's existing test style/conventions.

## Validation

This skill is used correctly if:
- The test runner invoked matches `project.test_system` from Project
  Intelligence — never a runner the project doesn't already use,
  without an ADR justifying an exception.
- Every test run is captured as a `Trace`, not just reported as
  pass/fail text in the final report.
- A `regression-protect` step never completes without at least one new
  permanent test file being written and referenced from the
  `known-failure` memory entry's `regression_id`-adjacent context.

## Examples

**Correct:** Project Intelligence shows `test_system: ["pytest"]` →
reproduction written as `tests/test_repro_login_race.py` using pytest
→ once root cause confirmed, folded into
`tests/test_auth_token_refresh.py` as a permanent regression test →
`known-failure` memory entry references it.

**Failure mode this skill prevents:** introducing a Jest-based test
into a pytest-only Python project because the agent "prefers" Jest —
blocked by step 1 (stack-native tooling) unless an ADR explicitly
authorizes a toolchain change for that project, which is out of scope
for a `bug-report` workflow run.
