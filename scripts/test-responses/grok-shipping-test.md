# Grok AI output — toy-shipping-bug test

```aiecp
kind: event
data:
  id: event-file-change-1
  kind: file_change
  source: filesystem_write
  payload:
    path: executor/examples/toy-shipping-bug/shipping.py
    change: "operator > → >= on the weight boundary check"
```

```aiecp
kind: decision
data:
  id: decision-apply-fix-1
  kind: fix_applied
  validated: false
  summary: "Applied single-operator change: weight_kg > 5 → weight_kg >= 5"
```

```aiecp
on: fix_applied
```

**verify**

```aiecp
kind: event
data:
  id: event-pytest-after
  kind: test_result
  source: "python3 -m pytest test_shipping.py -v"
  payload:
    summary: "7 passed"
    previously_failing:
      - test_heavy_rate_at_exactly_5kg: now PASSED
      - test_express_at_boundary: now PASSED
```

```aiecp
kind: actual
data:
  id: actual-after-fix
  observation: "calculate_shipping_cost(5.0) == 15.0; calculate_shipping_cost(5.0, express=True) == 30.0"
```

```aiecp
kind: validation
data:
  id: validation-match-1
  result: match
  method: app_validation
  expected_ref: expected-heavy-at-5kg
  actual_ref: actual-after-fix
```

```aiecp
on: behavior_verified
```

**regression-protect**

```aiecp
type: known-failure
data:
  id: mem-known-failure-shipping-boundary-2026-08-15
  symptom: "calculate_shipping_cost(5.0) returned LIGHT rate instead of HEAVY"
  root_cause: "strict > comparison instead of >= at the 5 kg boundary"
  fix: "changed to weight_kg >= 5"
  regression_signal: "reintroduction of `>` on the weight boundary in shipping.py"
  related_tests:
    - test_heavy_rate_at_exactly_5kg
    - test_express_at_boundary
  source_ref: "executor/examples/toy-shipping-bug/shipping.py"
```

```aiecp
on: regression_added
```

**replay**

```aiecp
kind: event
data:
  id: event-replay-boundary
  kind: test_result
  source: "python3 -c \"from shipping import calculate_shipping_cost; print(calculate_shipping_cost(5.0), calculate_shipping_cost(5.0, express=True))\""
  payload:
    output: "15.0 30.0"
```

```aiecp
kind: validation
data:
  id: validation-replay-1
  result: match
  method: replay_comparison
  note: "Original failing inputs now produce the documented expected values"
```

```aiecp
on: replay_matches
```

**report**

```aiecp
on: report
workflow: bug-report
```
