# Grok live test #5 — real LLM output with common schema mistakes
# This file contains the SAME mistakes Grok made in a real live test
# (2026-08-15). It is a regression fixture: validate-chat-output.mjs
# must detect all these mistakes and --strict-hint must provide correct
# template references.
#
# Known mistakes in this file:
# - `timestamp` instead of `ts` (event)
# - `summary` instead of `what`/`why` (decision)
# - `claim` instead of `predicate` (expected)
# - `observation` instead of `observed_value` (actual)
# - Missing `trace_ref` (event, decision)
# - Missing `type`, `schema_version`, `created_at`, `source` (known-failure memory)
# - `fix_applied` instead of `fix` (known-failure memory)
# - Missing `incident_ref` (known-failure memory)

```aiecp:evidence
kind: event
data:
  id: event-code-read
  timestamp: 2026-08-15T10:00:35Z
  kind: observation
  source: "shipping.py:47"
  payload:
    finding: "if weight_kg > 5 contradicts docstring"
```

```aiecp:evidence
kind: decision
data:
  id: decision-root-cause-1
  summary: "strict > instead of >= at the 5 kg boundary"
  validated: false
```

```aiecp:evidence
kind: expected
data:
  id: expected-heavy-5kg
  source_ref: "shipping.py docstring"
  claim: "calculate_shipping_cost(5.0) must return 15.0"
```

```aiecp:evidence
kind: actual
data:
  id: actual-light-5kg
  expected_ref: expected-heavy-5kg
  observation: "returned 8.0 instead of 15.0"
```

```aiecp:memory
type: known-failure
data:
  id: mem-known-failure-shipping-1
  symptom: "5kg charged LIGHT instead of HEAVY"
  root_cause: "strict > instead of >= at 5kg boundary"
  fix_applied: "changed to weight_kg >= 5"
```
