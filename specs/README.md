# Specification Layer

**Status: Phase 1 — 8 templates authored.**

Adopts spec-kit's document family (spec / plan / tasks / constitution
/ checklist) per ADR-0002, extended with three AIECP-original
templates (contracts / invariants / state-machines).

## Templates

### spec-kit family (MIT, verbatim with attribution — ADR-0018)

Verbatim copies of the upstream templates from
`github/spec-kit@83883a2` (MIT, cloned 2026-08-14). Each file has
an HTML comment at the top recording the upstream source commit
and license, per ADR-0018's attribution requirement.

- [`spec.template.md`](spec.template.md) — feature specification
  template (user stories, requirements, success criteria).
- [`plan.template.md`](plan.template.md) — implementation plan
  template (technical context, project structure, complexity
  tracking).
- [`tasks.template.md`](tasks.template.md) — task list template
  grouped by user story.
- [`constitution.template.md`](constitution.template.md) —
  per-project constitution template (core principles; distinct
  from AIECP's own framework-level
  `constitution/constitution.md`).
- [`checklist.template.md`](checklist.template.md) — reviewer-owned
  requirements-quality checklist template.

### AIECP-original extensions (per ADR-0002)

Novel to AIECP; no upstream equivalent found in spec-kit or any
other verified upstream source. The entity shapes these templates
document are derived from `docs/evidence-model.md`'s "Contract",
"Invariant", and "State Transition" definitions.

- [`contracts.template.md`](contracts.template.md) — contract
  declaration template (parties, input/output schema, invariants,
  failure modes). Each contract becomes an `Expected` entity with
  `predicate_kind: "behavioral"` when referenced by a workflow's
  `design` / `design-change` / `design-refactor` state.
- [`invariants.template.md`](invariants.template.md) — invariant
  declaration template (scope, predicate, validation method,
  failure mode, rationale). Each invariant becomes an `Expected`
  entity with `predicate_kind: "invariant"`.
- [`state-machines.template.md`](state-machines.template.md) —
  state machine declaration template (YAML or Markdown, same shape
  as AIECP's own workflow `.sm.yaml` files). Each state machine
  becomes one or more `Expected` entities with `predicate_kind:
  "state_property"`.

## Usage

A feature directory `specs/<feature-name>/` typically contains:

```
specs/<feature-name>/
├── spec.md              # from spec.template.md
├── plan.md              # from plan.template.md
├── tasks.md             # from tasks.template.md
├── contracts.md         # from contracts.template.md (AIECP-original)
├── invariants.md       # from invariants.template.md (AIECP-original)
└── state-machines.md   # from state-machines.template.md (AIECP-original)
```

The `constitution.template.md` and `checklist.template.md` are
project-wide, not per-feature: a project has one
`constitution.md` (filled in once at onboarding), and per-feature
`checklist-<feature>.md` files as needed for review gates.

## Relationship to AIECP workflows

The `skills/specification/SKILL.md` skill reads these templates
when authoring `Expected` entities at a workflow's `design` /
`design-change` / `design-refactor` state. Each template section
that declares a contract, invariant, or state machine can become
an `Expected` with `source_ref` pointing at the section's anchor
(e.g., `specs/auth-feature/contracts.md#CONTRACT-1`).

This makes the specification layer machine-checkable: a
`Validation` with `method: "contract_validation"` can prove (or
disprove) that the implementation honors each declared contract
or invariant, by referencing the same `source_ref`.
