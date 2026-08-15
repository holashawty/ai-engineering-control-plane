# Toy Shipping Bug — AIECP Framework Test Fixture

**Purpose:** This directory is a deliberately-buggy toy Python module
that chat-sandbox LLMs (ChatGPT Code Interpreter, Claude code
execution, etc.) can use to test the FULL AIECP `bug-report`
workflow end-to-end, including the `apply-fix` → `verify` →
`regression-protect` → `replay` → `report` states that previously
couldn't be tested because no real source file existed in the repo.

## The bug

`shipping.py` contains `calculate_shipping_cost(weight_kg, express)`.
The pricing logic has a boundary off-by-one:

```python
if weight_kg > 5:   # BUG: should be >= (5kg is HEAVY per docstring)
    base = 15.0
else:
    base = 8.0
```

Per the docstring, packages "5kg or heavier" should be charged the
HEAVY rate ($15). But `weight_kg > 5` is `False` when `weight_kg == 5.0`,
so a 5.00kg package is incorrectly charged $8 instead of $15.

This is the exact same shape as the membership-expiry off-by-one in
`executor/examples/e2e-membership-bug/` — both are boundary
comparisons using `>` instead of `>=`, both contradict their own
docstring, both are caught by a boundary test case.

## How to test with a chat-sandbox LLM

Give the chat-sandbox LLM (ChatGPT Code Interpreter, Claude code
execution, etc.) this prompt:

```
I've uploaded the AIECP repo as a zip. Read CHAT-ENTRYPOINT-SANDBOX.md
first (or CHAT-ENTRYPOINT.md if you have no code execution tool),
then help me with this bug:

The function calculate_shipping_cost in
executor/examples/toy-shipping-bug/shipping.py has a boundary bug.
When I call calculate_shipping_cost(5.0), it returns 8.0, but the
docstring says 5kg should be HEAVY rate ($15). Diagnose and fix.

Walk the bug-report workflow per AIECP. The repo already has
.aiecp/project-intelligence.json (project-onboarding was already
run), so you can go directly to bug-report.
```

**What the LLM should do** (the full workflow):

1. Read CHAT-ENTRYPOINT-SANDBOX.md → self-identify as chat-sandbox.
2. Step 0.5: check `.aiecp/project-intelligence.json` exists →
   it does (this repo is already onboarded) → proceed to bug-report.
3. `intake` → `classify`: classify as a wrong-result behavioral bug.
4. `classify` → `locate-evidence`: read `shipping.py`, emit `event`
   citing the buggy line (`weight_kg > 5`) and the contradicting
   docstring.
5. `locate-evidence` → `reproduce`: run `pytest test_shipping.py -v`
   in the sandbox. Observe `test_heavy_rate_at_exactly_5kg` FAILS.
   Emit `trace` + `event` of `kind: test_result`.
6. `reproduce` → `diagnose`: emit `decision` (root-cause candidate:
   `>` should be `>=`), `expected` (per docstring), `actual`
   (observed), `validation` (mismatch).
7. `diagnose` → `propose-fix`: emit `decision` (AI proposal:
   change `>` to `>=` on line 32, `validated: false`).
8. `propose-fix` → `apply-fix`: chat-sandbox has `filesystem_write`
   → apply the fix in the sandbox. Emit `decision` (`validated:
   false`) + `event` (`file_change`).
9. `apply-fix` → `verify`: re-run `pytest test_shipping.py -v`.
   Observe ALL tests pass now. Emit `actual` (post-fix) +
   `validation` (`result: match`, `method: app_validation`).
10. `verify` → `regression-protect`: write `known-failure` memory
    entry recording the bug + fix, so future code that
    reintroduces `>` fires the `regression` workflow.
11. `regression-protect` → `replay`: re-run the original
    reproduction (the failing test) against the fixed code.
    Emit `replay` (`result: matches_expected`).
12. `replay` → `report`: terminal state. Summarize: root cause
    (`>` instead of `>=`), fix (changed to `>=`), validation
    (all 7 tests pass), regression protection (known-failure
    memory written).

**What the LLM should NOT do:**
- Skip `project-onboarding` if `.aiecp/project-intelligence.json`
  is missing (per `_router.md` rule 1).
- Claim the fix is "validated" before running the test suite (per
  ADR-0010 + constitution §8).
- Fabricate evidence — every `event.payload` must cite real code or
  real test output.
- Assert time-sensitive facts from training data (per §8) — though
  this bug has no time-sensitive claims.

## Running the tests locally

```bash
cd executor/examples/toy-shipping-bug/

# Run the test suite (BEFORE the fix — 2 tests should fail)
python3 -m pytest test_shipping.py -v

# Expected output:
#   test_light_rate_under_5kg PASSED
#   test_heavy_rate_over_5kg PASSED
#   test_heavy_rate_at_exactly_5kg FAILED  ← the bug
#   test_express_doubles_cost PASSED
#   test_express_at_boundary FAILED        ← depends on the bug
#   test_zero_weight PASSED
#   test_negative_weight PASSED

# Apply the fix: change `if weight_kg > 5:` to `if weight_kg >= 5:`
# in shipping.py. Then re-run:

python3 -m pytest test_shipping.py -v

# Expected output:
#   all 7 tests PASSED
```

## Why this fixture exists

Previous chat-sandbox tests (2026-08-14, patron's home) used an
isolated Python snippet the user pasted into the chat. The LLM
correctly identified the bug but blocked at `requires target source
file` because the function wasn't in the repo — there was nothing
to `apply-fix` against. This fixture fixes that: the function is
now in the repo at a known path, so the full workflow can run.

This is the same pattern as `executor/examples/e2e-membership-bug/`
— a deliberately-buggy toy module that exercises the full bug-report
workflow. The difference: `e2e-membership-bug/` is driven by a
scripted `drive-run.mjs` (for CI); `toy-shipping-bug/` is driven by
a chat-sandbox LLM (for live testing).

## Relationship to AIECP

This fixture is part of the AIECP framework's test infrastructure.
It is NOT a real shipping service — it exists solely to give
chat-sandbox LLMs a real source file to test against. The bug is
intentional. Do not "fix" it without also updating `test_shipping.py`
(removing the `test_heavy_rate_at_exactly_5kg` and
`test_express_at_boundary` tests, or updating their expected values).
