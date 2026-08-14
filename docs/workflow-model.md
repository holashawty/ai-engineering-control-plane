# Workflow Model

## Router

`workflows/_router.md` defines routing rules from user-intent
classification to a workflow SM. Routing is deterministic given the
intent class + project state. The user is never prompted to select a
workflow manually.

## State machines

Each workflow is a YAML state machine:

```yaml
workflow: bug-report
states: [intake, classify, locate-evidence, reproduce, diagnose, propose-fix, apply-fix, verify, regression-protect, replay, report]
transitions:
  - { from: intake, to: classify, on: intent_classified }
  - { from: classify, to: locate-evidence, on: class_known }
  - { from: locate-evidence, to: reproduce, on: evidence_located }
  - { from: reproduce, to: diagnose, on: reproduction_ready }
  - { from: diagnose, to: propose-fix, on: root_cause_found }
  - { from: propose-fix, to: apply-fix, on: fix_approved }
  - { from: apply-fix, to: verify, on: fix_applied }
  - { from: verify, to: regression-protect, on: behavior_verified }
  - { from: regression-protect, to: replay, on: regression_added }
  - { from: replay, to: report, on: replay_matches }
on_failure:
  - state: diagnose
    next: locate-evidence
    reason: root_cause_invalid
skills_required:
  - systematic-debugging
  - evidence-engineering
  - behavioral-verification
  - testing
capabilities_required:
  - filesystem_read
  - filesystem_write
  - shell_exec
  - test_runner
safety_gates:
  - apply-fix (broad-refactor)
```

## Workflow catalog

`new-project`, `project-onboarding`, `feature-request`,
`change-request`, `bug-report`, `user-complaint`, `regression`,
`refactor`, `code-review`, `performance-problem`, `security-problem`,
`release`, `incident`, `unknown-failure`.

The `unknown-failure` workflow is the fallback — it triages into another
workflow or refuses safely.

## Question economy

A workflow may only transition to a state that requires user input if
the required information genuinely cannot be derived from repository
inspection (discovery, project intelligence, evidence, memory). When a
question is unavoidable, it must be:

- **necessary** — the workflow is genuinely blocked without it,
- **specific** — answerable in one short reply, not open-ended,
- **decision-changing** — the answer measurably changes what happens
  next.

This is a design goal, not yet a mechanically enforced rule; enforcing
it (e.g. via an eval that penalizes avoidable questions) is part of
Phase 8 (Evaluation).

## Auto-routing principle

The router picks a workflow from intent classification + repository
state. Users never pick workflows. They supply intent.
