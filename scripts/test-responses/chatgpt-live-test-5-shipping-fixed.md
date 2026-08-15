```aiecp:evidence
kind: trace
data:
  id: trace-onboarding-intake
  started_at: "2026-08-15T12:16:00Z"
  event_refs:
    - event-onboarding-required
```

```aiecp:evidence
kind: event
data:
  id: event-onboarding-required
  trace_ref: trace-onboarding-intake
  ts: "2026-08-15T12:16:00Z"
  kind: state_read
  source: "CHAT-ENTRYPOINT-SANDBOX.md / workflow router"
  payload:
    finding: "`.aiecp/project-intelligence.json` was absent, so project-onboarding had to run before bug-report."
```

```aiecp:evidence
kind: decision
data:
  id: decision-onboarding-class
  trace_ref: trace-onboarding-intake
  what: "onboard_repository_before_bug_report"
  why: "The router requires project-onboarding whenever Project Intelligence is missing."
  validated: true
  result: accepted
  evidence_refs:
    - event-onboarding-required
```

```aiecp:advance
on: class_known
```

```aiecp:evidence
kind: trace
data:
  id: trace-onboarding-discovery
  started_at: "2026-08-15T12:16:10Z"
  environment_fingerprint_ref: mem-environment-aiecp-shipping
  event_refs:
    - event-discovery-cli
    - event-discovery-output
```

```aiecp:evidence
kind: event
data:
  id: event-discovery-cli
  trace_ref: trace-onboarding-discovery
  ts: "2026-08-15T12:16:11Z"
  kind: action
  source: "discovery/cli:canonical"
  payload:
    finding: "node discovery/cli/dist/cli.js . completed successfully and wrote .aiecp/project-intelligence.json."
```

```aiecp:evidence
kind: event
data:
  id: event-discovery-output
  trace_ref: trace-onboarding-discovery
  ts: "2026-08-15T12:16:12Z"
  kind: observation
  source: "discovery/cli"
  payload:
    finding: "Detected stack=javascript, layer=backend, build_system=npm, test_system=npm-script:test, has_test_suite=true."
```

```aiecp:advance
on: discovery_complete
```

```aiecp:evidence
kind: expected
data:
  id: expected-project-intelligence
  source_ref: "discovery/schema/project-intelligence.schema.json"
  predicate: "Project Intelligence is schema-valid and describes the detected repository stack/build/test capabilities."
  predicate_kind: behavioral
```

```aiecp:evidence
kind: actual
data:
  id: actual-project-intelligence
  expected_ref: expected-project-intelligence
  observed_value: "Generated project intelligence reports javascript/backend/npm/npm-script:test and has_test_suite=true."
  observation_ref: event-discovery-output
```

```aiecp:evidence
kind: validation
data:
  id: validation-project-intelligence
  expected_ref: expected-project-intelligence
  actual_ref: actual-project-intelligence
  result: match
  method: contract_validation
  evidence_refs:
    - event-discovery-output
```

```aiecp:evidence
kind: event
data:
  id: event-project-memory-write
  trace_ref: trace-onboarding-discovery
  ts: "2026-08-15T12:16:13Z"
  kind: state_write
  source: ".aiecp/memory/project/mem-project-aiecp-shipping.json"
  payload:
    finding: "Initial project memory was written from validated Project Intelligence."
```

```aiecp:advance
on: discovery_valid
```

```aiecp:memory
type: project
data:
  id: mem-project-aiecp-shipping
  type: project
  schema_version: "1.0.0"
  created_at: "2026-08-15T12:16:12Z"
  source: project-onboarding-run-chat-sandbox
  stack:
    - javascript
  layer:
    - backend
  domain: "AIECP framework repository with executor examples, including a Python toy shipping bug fixture."
```

```aiecp:evidence
kind: event
data:
  id: event-environment-memory-write
  trace_ref: trace-onboarding-discovery
  ts: "2026-08-15T12:16:14Z"
  kind: state_write
  source: ".aiecp/memory/environment/mem-environment-aiecp-shipping.json"
  payload:
    finding: "Initial environment memory was written from direct runtime/version probes."
```

```aiecp:advance
on: project_memory_written
```

```aiecp:memory
type: environment
data:
  id: mem-environment-aiecp-shipping
  type: environment
  schema_version: "1.0.0"
  created_at: "2026-08-15T12:16:12Z"
  source: project-onboarding-run-chat-sandbox
  runtime: "node22 + python3.13"
  versions:
    node: "22.16.0"
    python: "3.13.5"
    pytest: "9.0.2"
```

```aiecp:advance
on: environment_memory_written
```

```aiecp:evidence
kind: trace
data:
  id: trace-intake
  started_at: "2026-08-15T12:16:20Z"
  event_refs:
    - event-user-shipping-report
```

```aiecp:evidence
kind: event
data:
  id: event-user-shipping-report
  trace_ref: trace-intake
  ts: "2026-08-15T12:16:20Z"
  kind: user_message
  source: "user"
  payload:
    finding: "calculate_shipping_cost(5.0) returns 8.0, but 5kg should use HEAVY rate $15"
```

```aiecp:advance
on: intent_classified
```

```aiecp:evidence
kind: incident
data:
  id: incident-shipping-boundary-2026-08-15
  observed_at: "2026-08-15T12:16:25Z"
  environment_fingerprint_ref: mem-environment-aiecp-shipping
  expected_ref: expected-heavy-5kg
  actual_ref: actual-light-5kg
  severity: medium
  status: open
```

```aiecp:advance
on: class_known
```

```aiecp:evidence
kind: trace
data:
  id: trace-locate-evidence
  started_at: "2026-08-15T12:16:30Z"
  event_refs:
    - event-shipping-source
    - event-shipping-tests
```

```aiecp:evidence
kind: event
data:
  id: event-shipping-source
  trace_ref: trace-locate-evidence
  ts: "2026-08-15T12:16:31Z"
  kind: observation
  source: "executor/examples/toy-shipping-bug/shipping.py:47"
  payload:
    finding: "if weight_kg > 5 contradicts docstring"
```

```aiecp:advance
on: evidence_located
```

```aiecp:evidence
kind: trace
data:
  id: trace-reproduce-shipping
  started_at: "2026-08-15T12:16:40Z"
  event_refs:
    - event-pytest-before
```

```aiecp:evidence
kind: event
data:
  id: event-pytest-before
  trace_ref: trace-reproduce-shipping
  ts: "2026-08-15T12:16:41Z"
  kind: test_result
  source: "python3 -m pytest test_shipping.py -v"
  payload:
    finding: "2 failed, 5 passed"
```

```aiecp:advance
on: reproduction_ready
```

```aiecp:evidence
kind: expected
data:
  id: expected-heavy-5kg
  source_ref: "shipping.py docstring"
  predicate: "calculate_shipping_cost(5.0) must return 15.0"
```

```aiecp:evidence
kind: actual
data:
  id: actual-light-5kg
  expected_ref: expected-heavy-5kg
  observed_value: "returned 8.0"
  observation_ref: event-pytest-before
```

```aiecp:evidence
kind: decision
data:
  id: decision-root-cause-shipping
  trace_ref: trace-reproduce-shipping
  what: "root_cause_candidate:strict_gt_instead_of_gte"
  why: "weight_kg > 5 is false at 5.0"
  validated: true
  root_cause: true
  result: accepted
```

```aiecp:evidence
kind: validation
data:
  id: validation-root-cause-shipping
  expected_ref: expected-heavy-5kg
  actual_ref: actual-light-5kg
  result: mismatch
  method: app_validation
  decision_ref: decision-root-cause-shipping
```

```aiecp:advance
on: root_cause_found
```

```aiecp:evidence
kind: decision
data:
  id: decision-propose-fix-shipping
  trace_ref: trace-reproduce-shipping
  what: "ai_proposal:change_gt_to_gte"
  why: "minimal fix: change > to >= on line 47"
  validated: false
  result: pending
```

```aiecp:confirm
gate: broad-refactor
reason: "User explicitly asked to fix the shipping boundary bug"
```

```aiecp:advance
on: fix_approved
```

```aiecp:evidence
kind: event
data:
  id: event-apply-fix-shipping
  trace_ref: trace-repro-1
  ts: "2026-08-15T12:17:10Z"
  kind: file_change
  source: "shipping.py"
  payload:
    finding: "Changed > to >="
```

```aiecp:confirm
gate: edit_source
reason: "User explicitly authorized the fix"
```

```aiecp:advance
on: fix_applied
```

```aiecp:evidence
kind: event
data:
  id: event-pytest-after
  trace_ref: trace-repro-1
  ts: "2026-08-15T12:17:21Z"
  kind: test_result
  source: "python3 -m pytest test_shipping.py -v"
  payload:
    finding: "7 passed"
```

```aiecp:evidence
kind: actual
data:
  id: actual-heavy-5kg-fixed
  expected_ref: expected-heavy-5kg
  observed_value: "15.0"
  observation_ref: event-pytest-after
```

```aiecp:evidence
kind: validation
data:
  id: validation-verify-shipping
  expected_ref: expected-heavy-5kg
  actual_ref: actual-heavy-5kg-fixed
  result: match
  method: app_validation
  decision_ref: decision-propose-fix-shipping
```

```aiecp:advance
on: behavior_verified
```

```aiecp:memory
type: known-failure
data:
  id: mem-known-failure-shipping-boundary
  type: known-failure
  schema_version: "1.0.0"
  created_at: "2026-08-15T12:18:00Z"
  source: bug-report-run-chat-sandbox
  incident_ref: incident-shipping-boundary-2026-08-15
  symptom: "5kg charged LIGHT instead of HEAVY"
  root_cause: "strict > instead of >= at 5kg boundary"
  fix: "changed to weight_kg >= 5"
```

```aiecp:advance
on: regression_added
```

```aiecp:evidence
kind: replay
data:
  id: replay-shipping-boundary
  original_trace_ref: trace-reproduce-shipping
  result: matches_expected
  environment_fingerprint_ref: mem-environment-aiecp-shipping
```

```aiecp:advance
on: replay_matches
```
