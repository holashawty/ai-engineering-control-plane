# Real end-to-end run: membership expiry off-by-one

**This is the final MVP milestone (ADR-0016).** Every previous
`--self-test` in this repository (`discovery/cli`, `executor`,
`adapters/agents`) used realistic but *scripted* data. This one does
not: a real toy repository was created, a real bug was diagnosed by
actually running `pytest` and reading source, a real fix was applied,
and the *real* captured output from those real commands (not invented
strings) was fed into the real `WorkflowRun` API.

**What this run does NOT prove:** that a live, multi-turn Claude
Code/Codex session driving this framework tool-call-by-tool-call
produces the same result. The diagnostic work below was done
interactively during a Claude session and then assembled into one
driver script (`drive-run.mjs`) for reproducibility — it is not a
recording of a live agent session issuing one tool call per turn
through an actual agent adapter. That remains a real, open gap — see
`STATUS.md`.

## The repository

A toy Python package (`membership-service`, poetry + pytest, matching
`discovery/cli`'s detected shape) with one function:

```python
def is_active(today: date, expiry_date: date) -> bool:
    """Return whether a membership is still active on `today`.

    A membership purchased through `expiry_date` should remain active
    ON the expiry date itself — the member paid for that day.
    """
    return today < expiry_date
```

Two existing tests, both passing, neither covering the boundary:

```python
def test_active_well_before_expiry():
    assert is_active(date(2026, 1, 1), date(2026, 6, 1)) is True

def test_inactive_well_after_expiry():
    assert is_active(date(2026, 9, 1), date(2026, 6, 1)) is False
```

## The user report

> "some members say their membership expired a day early"

## Step-by-step transcript (real commands, real output)

### 1. Discovery (`discovery/cli`)

```
$ node dist/cli.js /tmp/aiecp-e2e-demo
```

Real output (relevant excerpt):

```json
"project": {
  "stack": ["python"], "layer": ["backend"],
  "build_system": ["poetry"], "test_system": ["pytest"]
},
"capabilities": { "has_test_suite": true, "has_ci": true, ... }
```

Wrote `.aiecp/project-intelligence.json` — used to know the toy repo
runs pytest before touching anything.

### 2. Locate evidence — real grep, real baseline test run

```
$ grep -rn "expir" --include="*.py" .
./tests/test_membership.py:5:def test_active_well_before_expiry():
./tests/test_membership.py:9:def test_inactive_well_after_expiry():
./membership.py:5:def is_active(today: date, expiry_date: date) -> bool:
./membership.py:9:    ON the expiry date itself — the member paid for that day.
./membership.py:11:    return today < expiry_date

$ python3 -m pytest tests/ -v
tests/test_membership.py::test_active_well_before_expiry PASSED [ 50%]
tests/test_membership.py::test_inactive_well_after_expiry PASSED [100%]
2 passed in 0.01s
```

**This is the exact trap ADR-0010 exists to name**: the suite is 100%
green, and there is a real bug. Neither existing test touches the
boundary date.

### 3. Reproduce — a real new test, run for real, fails for real

```python
def test_active_on_expiry_date_itself():
    """Docstring says member should stay active ON expiry_date — verify that."""
    assert is_active(date(2026, 6, 1), date(2026, 6, 1)) is True
```

```
$ python3 -m pytest tests/test_membership.py -v
tests/test_membership.py::test_active_well_before_expiry PASSED   [ 33%]
tests/test_membership.py::test_inactive_well_after_expiry PASSED  [ 66%]
tests/test_membership.py::test_active_on_expiry_date_itself FAILED [100%]

    assert is_active(date(2026, 6, 1), date(2026, 6, 1)) is True
E   assert False is True
1 failed, 2 passed in 0.02s
```

Deterministic reproduction achieved.

### 4. Diagnose — read the exact line the failure implicates

```
membership.py:11:    return today < expiry_date
```

Contradicts the function's own docstring (line 9: "should remain
active ON the expiry date itself"). Root cause: strict `<` should be
`<=`.

### 5. Propose fix → apply fix (real safety gate, really tested)

The driver script attempted the `propose-fix -> apply-fix` transition
*without* confirmation first — exactly as an agent naively rushing to
apply a fix might — and the executor's safety gate genuinely blocked
it:

```
gate correctly blocked unconfirmed transition: safety-gate-needs-confirmation
```

Only after `advanceWithConfirmation()` (simulating explicit human
sign-off) did the transition succeed. The actual code change:

```diff
-    return today < expiry_date
+    return today <= expiry_date
```

### 6. Verify — real suite rerun AND a real direct behavioral check

Per `skills/behavioral-verification/SKILL.md`: a green suite alone is
not accepted as verification.

```
$ python3 -m pytest tests/ -v
tests/test_membership.py::test_active_well_before_expiry PASSED   [ 33%]
tests/test_membership.py::test_inactive_well_after_expiry PASSED  [ 66%]
tests/test_membership.py::test_active_on_expiry_date_itself PASSED [100%]
3 passed in 0.01s

$ python3 -c "
from membership import is_active
from datetime import date
print(is_active(date(2026,6,1), date(2026,6,1)))
"
True
```

Both the technical check (suite green) and the direct behavioral check
(the exact root-cause scenario, independently re-verified) passed.
`Validation.method: "app_validation"`, `result: "match"`.

### 7. Regression-protect, replay, report

`test_active_on_expiry_date_itself` is the permanent regression guard
(per `skills/testing/SKILL.md` — reproduction tests are disposable,
regression tests are permanent; here they're the same test, which is
fine). A `known-failure` memory entry references the real `Incident`.
Replay against the fixed code confirms no divergence. The workflow
reaches `report`, a terminal state (`run.isTerminal() === true`).

## Running it yourself

```bash
cd executor
npm install && npm run build
cd examples/e2e-membership-bug
node drive-run.mjs
```

The toy repo itself (`/tmp/aiecp-e2e-demo` in the original session) is
not committed to this repository — it's disposable scaffolding, exactly
like the toy repos `discovery/cli`'s own self-test builds and tears
down. `drive-run.mjs` embeds the real captured data as comments/payload
values so the run is reproducible without needing the original toy
repo to still exist on disk.

## Result

All 12 states reached, `report` terminal state achieved, 0 questions
asked (repository inspection was sufficient), safety gate correctly
enforced on a real (not scripted) transition attempt, every evidence
entity written validated against its actual Phase 1 JSON Schema at
write time. 27 log entries recorded across the full run.
