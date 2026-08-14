---
name: specification
description: Use when authoring or updating specs, contracts, invariants, or state-machines — produces Evidence Model Expected entities with proper source_ref to specs/spec.md, contracts.md, invariants.md, or state-machines.md per ADR-0002.
license: MIT
allowed-tools: [filesystem_read, filesystem_write]
---

# Specification

## When to use this skill

Anywhere a workflow is authoring a new `Expected` entity — i.e.
designing behavior rather than observing or modifying it. Concretely:

- The `design` state of `workflows/feature-request.sm.yaml`.
- The `design-change` state of `workflows/change-request.sm.yaml`.
- The `design-refactor` state of any future `refactor` workflow
  (planned, see `workflows/_router.md`).
- Anywhere else a new behavioral contract, invariant, or state-machine
  property is being written down for the first time.

This skill is **not** for reading existing specs into `Expected` form
(that is `evidence-engineering`'s job — the `source_ref` already
exists, the spec already says what it says). This skill is for the
moment a *new* spec section is being authored in
`specs/spec.md` / `contracts.md` / `invariants.md` /
`state-machines.md`, and the `Expected` that references it must be
emitted alongside so the rest of the workflow can validate against it.

## Procedure

1. **Read existing specs before writing new ones.** Open every file
   in `specs/` (`spec.md`, `plan.md`, `tasks.md`, `contracts.md`,
   `invariants.md`, `state-machines.md`, `constitution.md` — the
   document family adopted per ADR-0002). Search each for the concept
   the new spec section will describe. If a section already covers
   it — even partially — extend that section rather than creating a
   new one; do not duplicate. Duplication produces two `Expected`
   entities with overlapping `source_ref`s, and `verify` cannot tell
   which one is authoritative.
2. **Author the new spec section** following the spec/plan/tasks/
   constitution family (ADR-0002). A spec section is a behavioral
   contract: it states *what* the system must do, not *how*. Code
   sketches, implementation choices, and library picks belong in
   `tasks.md` or `plan.md`, not in `spec.md` — a spec section that
   dictates "use library X" has conflated the contract with one
   implementation of it, and the next agent who needs to swap libraries
   has to renegotiate the spec rather than just the implementation.
3. **Emit an `Expected`** (`evidence/schema/expected.schema.json`)
   with `source_ref` pointing at the new spec section (e.g.
   `specs/spec.md#password-reset-from-address` or
   `specs/contracts.md#items-endpoint-pagination`). The `predicate`
   field is a human- and machine-checkable statement of the contract;
   prefer "GET /items?tag=a&tag=b returns only items having BOTH tag a
   AND tag b" over "tag filtering works correctly" — the former can
   be turned into an assertion, the latter cannot.
4. **If the spec implies an invariant**, emit an additional
   `Expected` with `predicate_kind: "invariant"` and `source_ref`
   pointing at `specs/invariants.md#<anchor>`. An invariant is
   stricter than a behavioral `Expected`: it must hold across *all*
   states, not just at the boundary the spec section describes (e.g.
   "every persisted User has a non-null `created_at`" is an
   invariant; "GET /items returns 200" is a behavioral `Expected`).
   The `predicate_kind` distinction matters because
   `behavioral-verification` uses different validation methods for
   invariants (`contract_validation` typically) vs behavioral
   `Expected`s (`app_validation` typically).
5. **If the spec implies a state-machine**, emit an additional
   `Expected` with `predicate_kind: "state_property"` and
   `source_ref` pointing at `specs/state-machines.md#<anchor>`. A
   state property is a claim about a state-machine's reachable states
   or transitions (e.g. "an Order in state `shipped` cannot
   transition back to `pending` without an explicit `unship` event").
   State properties require a state-machine description in
   `state-machines.md` to reference; do not emit a `state_property`
   `Expected` whose `source_ref` points at a behavioral section in
   `spec.md` — the `predicate_kind` and the `source_ref` must agree.

## Tool integration

- `filesystem_read`: read existing `specs/` files to avoid duplication
  (step 1) and to find the right anchor for the new section.
- `filesystem_write`: write the new spec section into the appropriate
  `specs/` file. Append, do not overwrite — `specs/` is append-mostly
  per ADR-0002 (the family is "spec evolves, plan accrues, tasks
  complete"). Sections may be edited to refine a contract, but a
  contract that has shipped and been validated against should be
  *deprecated with a successor*, not silently rewritten — otherwise
  prior `Expected` entities whose `source_ref` pointed at the old
  section become dangling references.

## Validation

This skill is considered successful for a given run only if:

- Every new spec section authored during the run has at least one
  `Expected` entity with `source_ref` pointing at it (no orphan spec
  sections that nothing validates against).
- Every `Expected` emitted has a `predicate_kind` that matches the
  kind of section its `source_ref` points at (behavioral → `spec.md`
  or `contracts.md`; invariant → `invariants.md`; state property →
  `state-machines.md`).
- No two `Expected` entities in the same run have `source_ref`s
  pointing at overlapping spec sections (which would mean two
  competing contracts for the same behavior).
- No spec section authored in this run duplicates a section already
  present in `specs/` (step 1's check passed).

## Examples

**Happy path:** A `change-request` workflow asks the agent to change
the password reset email's "from" address from `support@` to
`noreply@`. The agent opens `specs/spec.md`, finds a section
`#password-reset-email` describing the current from-address behavior,
extends it with a *deprecation note* for `support@` and a *new
behavior* paragraph stating `noreply@` is the from address going
forward. The agent emits an `Expected` with
`source_ref: "specs/spec.md#password-reset-email"`, `predicate:
"password reset email From: header is noreply@<domain>"`,
`predicate_kind: "behavioral"`. The `design-change` `Decision`
records the chosen new behavior and references this `Expected` in its
`evidence_refs`. `verify` later compares the post-migration `Actual`
against this `Expected`. The skill exits successfully: one new spec
section, one matching `Expected`, no duplication, `predicate_kind`
matches the section.

**Failure mode (duplicates an existing spec, transitions to blocked):**
A `feature-request` workflow asks the agent to "add tag-based
filtering to /items." The agent skips step 1 (reading existing specs)
and authors a new section `#items-endpoint-tag-filter` in
`specs/spec.md` — but a section `#items-endpoint` already covered tag
filtering in passing two paragraphs down, with a slightly different
contract (it had said "tag filtering will be added in a future
release"). The agent emits the new `Expected` with
`source_ref: "specs/spec.md#items-endpoint-tag-filter"`. During
review (or by a future workflow run), the duplication is caught: two
sections in `spec.md` describe tag filtering, with subtly different
contracts. The workflow transitions to `blocked` with the precise gap
"spec section `#items-endpoint-tag-filter` duplicates content in
`#items-endpoint`; reconcile before re-emitting the `Expected`."
Without step 1, the agent would have shipped a feature with two
competing contracts, and `verify` would have arbitrarily validated
against one of them.
