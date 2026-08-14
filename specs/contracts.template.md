<!--
  AIECP-original extension to spec-kit's document family (ADR-0002).
  No upstream equivalent — spec-kit does not include a contracts.md
  template. This template is novel to AIECP; the contract shape is
  derived from docs/evidence-model.md's "Contract" entity definition
  ("A declared contract between components. Required keys: id,
  parties, input_schema, output_schema, invariants[]") and is used
  by skills/specification/SKILL.md step 4 to emit Expected entities
  with predicate_kind: "behavioral" or "invariant".
-->

# Contracts: [FEATURE NAME]

**Feature**: [link to spec.md]
**Created**: [DATE]
**Status**: Draft

## Purpose

This document declares the contracts between components of this
feature. A contract is a binding agreement between two parties
(caller and callee, or producer and consumer) about the shape of
data exchanged and the invariants that must hold across the exchange.

Per `docs/evidence-model.md`, every contract in this document can be
referenced by an `Expected` entity (`evidence/schema/expected.
schema.json`) via its `source_ref` field — typically
`specs/<feature>/contracts.md#<contract-id>`. This makes contracts
machine-checkable: a `Validation` (`evidence/schema/validation.
schema.json`) with `method: "contract_validation"` can prove (or
disprove) that the implementation honors each contract.

## Contract Template

### [CONTRACT_ID]: [Brief title]

**Parties**:
- **Caller**: [component A — e.g., `src/api/users.ts`]
- **Callee**: [component B — e.g., `src/services/user_service.ts`]

**Input schema** (what the caller passes to the callee):
- `field_name`: `type` — [description, constraints]
- `field_name`: `type` — [description, constraints]

**Output schema** (what the callee returns to the caller):
- Success: `field_name`: `type` — [description]
- Error: `field_name`: `type` — [description of error shape]

**Invariants** (properties that MUST hold true across every call):
1. [invariant 1 — e.g., "If the input contains `id`, the callee MUST NOT return a different user's data."]
2. [invariant 2 — e.g., "If the callee throws, it MUST throw before any side effect."]
3. [invariant 3 — e.g., "The callee MUST be idempotent for the same input within a 5-second window."]

**Failure modes** (how the callee signals each failure class):
- `class_1` (recoverable): [callee returns error shape X; caller may retry.]
- `class_2` (programming error): [callee throws; caller must not retry — fix the call.]
- `class_3` (system error): [callee propagates the underlying system error.]

**Examples**:
- Happy path: input `{...}` → output `{...}` (cite acceptance scenario from spec.md).
- Edge case: input `{...}` (empty/boundary) → output `{...}` or error.
- Failure: input `{...}` (invalid) → error of class `class_2`.

---

## Contracts for [FEATURE NAME]

<!--
  ACTION REQUIRED: Replace the placeholder contract below with the
  actual contracts for this feature. Each contract becomes an
  `Expected` entity in the Evidence Model when referenced by an
  AIECP workflow's `design` / `design-change` / `design-refactor`
  state (per skills/specification/SKILL.md step 4).
-->

### CONTRACT-1: [Brief title]

(Fill in per the template above.)
