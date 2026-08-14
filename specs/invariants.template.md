<!--
  AIECP-original extension to spec-kit's document family (ADR-0002).
  No upstream equivalent — spec-kit does not include an invariants.md
  template. This template is novel to AIECP; the invariant shape is
  derived from docs/evidence-model.md's "Invariant" entity definition
  ("A property that must always hold. Required keys: id, scope,
  predicate, validation_ref") and is used by
  skills/specification/SKILL.md step 4 to emit `Expected` entities
  with `predicate_kind: "invariant"`.
-->

# Invariants: [FEATURE NAME]

**Feature**: [link to spec.md]
**Created**: [DATE]
**Status**: Draft

## Purpose

This document declares the invariants of this feature — properties
that MUST always hold true, regardless of code path, input, or
environment. An invariant is not a behavior (that's a contract);
it is a constraint on the state of the system.

Per `docs/evidence-model.md`, every invariant in this document can
be referenced by an `Expected` entity (`evidence/schema/expected.
schema.json`) with `predicate_kind: "invariant"` via its
`source_ref` field — typically
`specs/<feature>/invariants.md#<invariant-id>`. This makes
invariants machine-checkable: a `Validation`
(`evidence/schema/validation.schema.json`) with
`method: "contract_validation"` (since invariants are a contract
on state) can prove (or disprove) that the implementation honors
each invariant.

## Invariant Template

### [INVARIANT_ID]: [Brief title]

**Scope**: [what state/region/component this invariant constrains —
e.g., "the `users` table", "the in-memory cache of authenticated
sessions", "the public API response of /items"]

**Predicate**: [the property that MUST hold, written as a
machine-checkable assertion — e.g., "every row in `users` with
`deleted_at IS NULL` MUST have a non-null `email` field that
matches the regex `^[^@]+@[^@]+\.[^@]+$`."]

**Validation method**: [how to check this invariant —
e.g., "SQL query at startup: `SELECT COUNT(*) FROM users WHERE
deleted_at IS NULL AND (email IS NULL OR email NOT SIMILAR TO
'%@%.%')` MUST return 0.", or "a unit test in `tests/invariants/
user_email.test.ts` that inserts a user with a null/invalid email
and asserts the insert fails."]

**Failure mode**: [what happens if the invariant is violated —
e.g., "the startup check fails fast, the application refuses to
boot, and the operator is alerted.", or "the unit test fails in CI,
blocking merge."]

**Why this invariant exists**: [the bug class it prevents — e.g.,
"we once shipped a bug where a NULL email propagated to the
password-reset flow and crashed it; this invariant makes the
schema reject the bad data at insert time."]

---

## Invariants for [FEATURE NAME]

<!--
  ACTION REQUIRED: Replace the placeholder invariant below with the
  actual invariants for this feature. Each invariant becomes an
  `Expected` entity (with predicate_kind: "invariant") in the
  Evidence Model when referenced by an AIECP workflow's `design` /
  `design-change` / `design-refactor` state (per
  skills/specification/SKILL.md step 4).

  Guidelines:
  - An invariant is a property of STATE, not behavior. "Endpoint
    returns 200" is a behavior (use contracts.md); "every user
    has a non-null email" is an invariant (use this file).
  - An invariant MUST be machine-checkable. If you can't write
    a SQL query or a unit test for it, it's a wish, not an
    invariant.
  - An invariant that holds "usually" is not an invariant. If it
    can be violated, it's either not actually required (remove
    it) or it's required and the code that violates it is a bug
    (fix the code).
  - The fewer the invariants, the better. Each one is a constraint
    the system must enforce forever. Aim for 5-15 invariants per
    feature, not 50.
-->

### INVARIANT-1: [Brief title]

(Fill in per the template above.)
