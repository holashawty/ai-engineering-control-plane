```aiecp
kind: decision
data:
  id: decision-apply-fix-1
  trace_ref: trace-repro-1
  what: "ai_proposal:apply_patch"
  why: "changed weight_kg > 5 to weight_kg >= 5"
  validated: false
  result: pending
```

```aiecp
kind: event
data:
  id: event-file-change-1
  trace_ref: trace-repro-1
  ts: 2026-08-15T12:22:00Z
  kind: file_change
  source: "executor/examples/toy-shipping-bug/shipping.py"
  payload:
    before: "if weight_kg > 5"
    after: "if weight_kg >= 5"
```

```aiecp
gate: broad-refactor
reason: "fix applied in sandbox; proceeding to verify"
```

```aiecp
on: fix_applied
```

```aiecp
kind: event
data:
  id: event-pytest-after
  trace_ref: trace-repro-1
  ts: 2026-08-15T12:22:30Z
  kind: test_result
  source: "python3 -m pytest test_shipping.py -v"
  payload:
    result: "7 passed"
```

```aiecp
kind: actual
data:
  id: actual-after-fix
  expected_ref: expected-heavy-5kg
  observed_value: "15.0"
  observation_ref: event-pytest-after
```

```aiecp
kind: validation
data:
  id: validation-verify-1
  expected_ref: expected-heavy-5kg
  actual_ref: actual-after-fix
  result: match
  method: app_validation
```

```aiecp
on: behavior_verified
```

```aiecp
type: known-failure
data:
  id: mem-known-failure-shipping-1
  type: known-failure
  schema_version: "1.0.0"
  created_at: 2026-08-15T12:23:00Z
  source: chat-sandbox-run-1
  incident_ref: incident-shipping-boundary-2026-08-15
  symptom: "5kg charged LIGHT instead of HEAVY"
  root_cause: "strict > instead of >="
  fix: "changed to weight_kg >= 5"
```

```aiecp
on: regression_added
```

```aiecp
kind: replay
data:
  id: replay-1
  original_trace_ref: trace-repro-1
  result: matches_expected
  environment_fingerprint_ref: env-fp-1
```

```aiecp
on: replay_matches
```
