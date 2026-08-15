### 8. apply-fix (continued)

```aiecp
kind: event
data:
  id: event-file-change-apply
  kind: file_change
  source: filesystem_write
  payload:
    path: executor/examples/toy-shipping-bug/shipping.py
    before: "if weight_kg > 5:"
    after: "if weight_kg >= 5:"
    comment_updated: true
```

```aiecp
kind: decision
data:
  id: decision-fix-applied
  kind: fix_applied
  validated: false
  summary: "Operator changed from > to >= on the 5 kg boundary"
```

```aiecp
on: fix_applied
```

### 8. verify

```aiecp
kind: event
data:
  id: event-pytest-post-fix
  kind: test_result
  source: "python3 -m pytest test_shipping.py -v"
  payload:
    collected: 7
    passed: 7
    failed: 0
    previously_failing_now_passing:
      - test_heavy_rate_at_exactly_5kg
      - test_express_at_boundary
```

```aiecp
kind: actual
data:
  id: actual-post-fix
  observation: |
    calculate_shipping_cost(5.0) == 15.0
    calculate_shipping_cost(5.0, express=True) == 30.0
    calculate_shipping_cost(4.99) == 8.0
    calculate_shipping_cost(5.01) == 15.0
```

```aiecp
kind: validation
data:
  id: validation-post-fix-match
  result: match
  method: app_validation
  expected_ref: expected-5kg-heavy
  actual_ref: actual-post-fix
  note: "All 7 tests green; boundary behavior now matches docstring contract"
```

```aiecp
on: behavior_verified
```

### 9. regression-protect

```aiecp
type: known-failure
data:
  id: mem-known-failure-shipping-boundary-2026-08-15
  symptom: "5.00 kg package charged LIGHT ($8) instead of HEAVY ($15)"
  root_cause: "strict `>` comparison at the documented 5 kg threshold"
  fix_applied: "changed to `weight_kg >= 5`"
  regression_signal: "any reintroduction of `weight_kg > 5` (or equivalent strict inequality) on the shipping cost boundary"
  protecting_tests:
    - test_heavy_rate_at_exactly_5kg
    - test_express_at_boundary
  source_ref: "executor/examples/toy-shipping-bug/shipping.py"
  related_incident: incident-shipping-boundary-20260815
```

```aiecp
on: regression_added
```

### 10. replay

```aiecp
kind: event
data:
  id: event-replay-original-failures
  kind: test_result
  source: "python3 -c + pytest boundary tests"
  payload:
    inputs:
      - {weight: 5.0, express: false, got: 15.0, expected: 15.0}
      - {weight: 5.0, express: true, got: 30.0, expected: 30.0}
    result: matches_expected
```

```aiecp
kind: validation
data:
  id: validation-replay
  result: match
  method: replay_comparison
  note: "Original failing cases now produce the values required by the contract"
```

```aiecp
on: replay_matches
```

### 11. report (terminal)

```aiecp
on: report
workflow: bug-report
```
