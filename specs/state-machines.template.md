<!--
  AIECP-original extension to spec-kit's document family (ADR-0002).
  No upstream equivalent — spec-kit does not include a
  state-machines.md template. This template is novel to AIECP; the
  state-machine shape is derived from AIECP's own workflow .sm.yaml
  format (workflows/*.sm.yaml) — a feature's internal state machines
  use the same shape as the framework's own workflow state machines,
  so the executor (executor/src/state-machine.ts) can in principle
  walk them too (post-MVP). Used by skills/specification/SKILL.md
  step 4 to emit Expected entities with predicate_kind:
  "state_property".
-->

# State Machines: [FEATURE NAME]

**Feature**: [link to spec.md]
**Created**: [DATE]
**Status**: Draft

## Purpose

This document declares the state machines internal to this feature
— the lifecycle of entities, the states of long-running processes,
the transitions between UI screens. A state machine is not a
behavior (that's a contract); it is the set of legal state
transitions the system may undergo.

Per `docs/evidence-model.md`, every state machine in this document
can be referenced by an `Expected` entity
(`evidence/schema/expected.schema.json`) with `predicate_kind:
"state_property"` via its `source_ref` field — typically
`specs/<feature>/state-machines.md#<machine-id>`. This makes
state machines machine-checkable: a `Validation`
(`evidence/schema/validation.schema.json`) with `method:
"contract_validation"` can prove (or disprove) that the
implementation honors each declared transition.

## State Machine Template (YAML)

```yaml
machine: <machine-id>
schema_version: "1.0.0"
description: <one-line description of what this state machine models>

states:
  - <state-1>
  - <state-2>
  - <state-3>
  # ...

initial_state: <state-1>
terminal_states: [<terminal-state-1>, ...]

transitions:
  - { from: <state-1>, to: <state-2>, on: <event-1> }
  - { from: <state-2>, to: <state-3>, on: <event-2> }
  # ...

state_detail:
  <state-1>:
    purpose: <what this state represents>
    entry_action: <what happens on entry — e.g., "send welcome email">
    exit_action: <what happens on exit — e.g., "log transition">
  <state-2>:
    purpose: <what this state represents>
    # ...
```

## Validation rules

For a state machine to be valid (per the same rules
`executor/src/state-machine.ts`'s `StateMachine.validateDefinition`
enforces for workflow .sm.yaml files):

1. Every transition's `from` and `to` MUST be in `states[]`.
2. Every `terminal_state` MUST be in `states[]`.
3. Every non-terminal state MUST have at least one outgoing
   transition (no dead ends).
4. Every state MUST be reachable from `initial_state` (no orphan
   states).
5. The `initial_state` MUST NOT be a terminal state (otherwise
   the machine is trivial).

## State Machine Template (Markdown)

For simple state machines, a Markdown table may be clearer than
YAML:

| From state | Event | To state | Side effect |
|---|---|---|---|
| `draft` | `submit` | `pending_review` | notify reviewer |
| `pending_review` | `approve` | `approved` | notify author |
| `pending_review` | `reject` | `rejected` | notify author with reason |
| `approved` | `publish` | `published` | make public |
| `published` | `unpublish` | `draft` | revert to draft |

## When to use YAML vs Markdown

- **YAML** (per the template above): when the state machine has
  entry/exit actions, when it will be validated by a script, or
  when it has >5 states.
- **Markdown table**: when the state machine is simple (≤5 states,
  no entry/exit actions) and humans are the primary reader.

## State Machines for [FEATURE NAME]

<!--
  ACTION REQUIRED: Replace the placeholder machine below with the
  actual state machines for this feature. Each state machine becomes
  one or more `Expected` entities (with predicate_kind:
  "state_property") in the Evidence Model when referenced by an
  AIECP workflow's `design` / `design-change` / `design-refactor`
  state (per skills/specification/SKILL.md step 4).

  Guidelines:
  - A state machine models LIFECYCLE, not behavior. "Endpoint
    returns 200" is a behavior (use contracts.md); "a user
    transitions from `pending` to `active` only after email
    verification" is a state machine (use this file).
  - Prefer fewer states. Each state is a case the code must
    handle; combinatorial explosion happens fast. 3-7 states is
    usually enough.
  - Name states after the durable fact they represent, not the
    action that led there. "email_verified" is better than
    "after_email_click".
  - Terminal states are for lifecycle END, not for "currently
    doing nothing." A user that's `active` is not in a terminal
    state — they're still active.
-->

### MACHINE-1: <machine-id>

(Fill in per the YAML or Markdown template above.)
