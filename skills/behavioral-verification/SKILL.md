---
name: behavioral-verification
description: Use at the verify state of any workflow, after a fix is applied — confirms the fix actually resolved the validated root cause, not just that the test suite exits 0. Operationalizes ADR-0010 ("no exception ≠ success"). Novel to AIECP; no upstream equivalent found in docs/research.md.
license: MIT
allowed-tools: [shell_exec, test_runner, filesystem_read]
---

# Behavioral Verification

## When to use this skill

At the `verify` state in `workflows/bug-report.sm.yaml`, immediately
after `apply-fix`. This skill is what stands between "the patch was
applied and tests pass" and "the incident is actually resolved."

## Why this skill exists (read this before skipping it)

Per `constitution/constitution.md` §2 and ADR-0010: a passing test
suite is *technical* success. It is not sufficient on its own to close
an `Incident`. A fix can pass every existing test and still not address
the validated root cause, for example if:
- the existing tests didn't cover the failure path at all (which is
  usually *why* the bug shipped in the first place),
- the fix suppresses the *symptom* observed in `reproduce` without
  correcting the `Decision` marked `root_cause: true` in `diagnose`,
- the fix is correct for the reproduction but the `Expected` it was
  checked against was itself under-specified.

This skill exists to make "verified" mean something stronger than
"green CI."

## Procedure

1. **Retrieve the root-cause `Decision`** from the `diagnose` state
   (the one with `root_cause: true`, `validated: true`). If you can't
   point to it, verification cannot proceed — return to `diagnose`.
2. **Re-derive `Expected`** for the specific behavior that decision
   violated (`evidence/schema/expected.schema.json`), not just "does
   the reproduction script exit 0."
3. **Run the project's own test suite** (via `test_runner`, per
   Project Intelligence `project.test_system`) — this is necessary but
   explicitly NOT sufficient on its own.
4. **Directly check the behavioral claim.** Re-run (or write, if none
   existed) a check that specifically exercises the root-cause
   scenario from `diagnose`, and compare its `Actual` against the
   `Expected` from step 2. This is what makes the difference between
   `method: "unit_test"` alone (insufficient per this skill's
   description) and `method: "contract_validation"` or `"app_validation"`
   (sufficient).
5. **Emit a `Validation`** (`evidence/schema/validation.schema.json`)
   with `result: "match"` only if step 4's direct behavioral check
   passed — a green step-3 test suite with no step-4 check does not
   earn `result: "match"`.
6. If `result: "mismatch"` — transition back to `diagnose`
   (`on: behavior_not_verified`) rather than accepting a fix that
   passed tests but didn't resolve the actual root cause.

## Tool integration

- `test_runner`: run the project's existing suite (step 3).
- `shell_exec`: run or construct the direct behavioral check (step 4)
  when no existing test covers it.
- `filesystem_read`: read the `Decision`/`Expected` entities from
  earlier in the workflow run.

## Validation (of this skill itself)

A `verify` step using this skill is done correctly only if the emitted
`Validation.method` is `"app_validation"`, `"contract_validation"`, or
`"replay_comparison"` — or `"unit_test"` *plus* an explicit note that
an existing test already directly covered the root-cause behavior (not
merely the symptom). A `Validation` with `method: "unit_test"` and no
such justification is a process violation of this skill, even if the
JSON Schema itself doesn't forbid it (the schema can't express "was
this test actually meaningful," only this skill's procedure can).

## Examples

**Correct:** root cause was "token refresh Decision assumed synchronous
completion" → fix makes retry await refresh completion → step 3: full
suite passes → step 4: a new test specifically forces the race
condition (async refresh + immediate retry) and confirms retry now
waits → `Validation.method: "app_validation"`, `result: "match"`.

**Incorrect, caught by this skill:** same root cause → fix adds a retry
delay of 500ms → step 3: full suite passes (nothing exercises the race
directly) → step 4: the direct behavioral check reveals the race is
still possible under load, the delay just made it rarer → `Validation.
result: "mismatch"` → back to `diagnose`. Without this skill, the
500ms-delay fix would have shipped as "verified" on the strength of a
green test suite alone.
