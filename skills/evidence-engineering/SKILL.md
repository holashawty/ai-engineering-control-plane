---
name: evidence-engineering
description: Use whenever a workflow step needs to emit an Incident, Trace, Event, Decision, Expected, Actual, Validation, or Replay entity — ensures every evidence artifact validates against its JSON Schema and follows the debugging-chain ordering in docs/evidence-model.md. Novel to AIECP; no upstream equivalent found in docs/research.md.
license: MIT
allowed-tools: [filesystem_read, filesystem_write]
---

# Evidence Engineering

## When to use this skill

Any time another skill or workflow state needs to write an evidence
artifact. This skill is the shared, correct-by-construction way to do
that — other skills (`systematic-debugging`, `behavioral-verification`)
call into this one rather than hand-rolling JSON.

## Procedure

### 1. Pick the right entity

Consult this table before writing anything (full definitions in
`docs/evidence-model.md`):

| Situation | Entity | Schema |
|---|---|---|
| Something diverged from expected — the anchor for a whole debugging session | `Incident` | `evidence/schema/incident.schema.json` |
| An execution you want to record as an ordered sequence | `Trace` | `evidence/schema/trace.schema.json` |
| One observed occurrence within a trace | `Event` | `evidence/schema/event.schema.json` |
| A choice made (by agent or system) at a fork | `Decision` | `evidence/schema/decision.schema.json` |
| What the system *should* produce, per spec/contract/invariant | `Expected` | `evidence/schema/expected.schema.json` |
| What the system *actually* produced, as observed | `Actual` | `evidence/schema/actual.schema.json` |
| Did Actual match Expected? | `Validation` | `evidence/schema/validation.schema.json` |
| Re-running a trace after a fix to confirm no divergence | `Replay` | `evidence/schema/replay.schema.json` |

### 2. Never skip the reference chain

Every entity above (except `Incident` and `Trace` themselves) exists to
be *referenced by* another entity. An `Actual` with no `expected_ref`,
or a `Validation` with no `expected_ref`+`actual_ref`, is invalid by
schema (`required` fields) — the schemas enforce this structurally, but
the *reason* it matters is docs/architecture.md's SPEC/OBS separation:
an `Actual` floating with nothing to be compared against is an
unverifiable claim.

### 3. IDs are stable and typed

All entity ids follow `<kind>-<slug>` (e.g. `incident-login-race-2026-
08-12`, enforced by each schema's `pattern`). Generate a slug from the
Incident's summary or the workflow run id — never a bare random UUID
with no human-readable trace back to what it's about.

### 4. Redact before writing

Per `docs/security-model.md` and `docs/evidence-model.md`'s explicit
note on `environment_fingerprint.env_vars`: never write a raw secret
value into any evidence artifact. If a captured `Event.payload` would
contain one (e.g. a captured HTTP header, an env dump), redact it
before emitting the event, not after.

### 5. Validate before trusting

Every evidence document this skill (or any skill) writes must be
validated against its schema before anything downstream reads it as
fact. `discovery/cli` demonstrates the pattern (ajv, 2020-12 build) —
the same validate-on-write discipline applies here even though the
evidence engine's own writer/validator CLI doesn't exist yet (see
`STATUS.md`; this skill documents the *procedure* the future
implementation must follow).

## Tool integration

- `filesystem_write`: write evidence JSON documents (target location
  not yet finalized — see `STATUS.md` open questions).
- `filesystem_read`: read prior evidence when building a reference
  chain (e.g. reading a `Trace` to find its `Event` ids before writing
  a `Decision` that cites them).

## Validation

An evidence-engineering step is successful only if every entity it
emitted:
1. Validates against its JSON Schema.
2. Has every `*_ref` field pointing at an entity that actually exists
   (referential integrity — not currently schema-enforced since JSON
   Schema can't express cross-document foreign keys; must be checked
   procedurally until a linter exists).
3. Contains no unredacted secret-shaped values.

## Examples

**Correct chain:** `Incident` (login sometimes fails) → `Trace`
(the reproduction run) → 3 `Event`s (request sent, token refresh
started, request retried before refresh completed) → `Decision`
(root-cause candidate, referencing the 3 events) → `Expected` (token
refresh completes before retry, per the auth contract) → `Actual`
(retry observed before refresh completed) → `Validation` (result:
mismatch, method: contract_validation) → after fix → `Replay` (result:
matches_expected).

**Common mistake this skill prevents:** writing a `Decision` that
asserts a root cause without any `evidence_refs` pointing at real
`Event`/`Trace` ids — schema-valid (the field is optional) but hollow.
This skill's procedure step 2 exists specifically to catch that class
of technically-valid-but-meaningless evidence.
