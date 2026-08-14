# Memory Model

## Eight types (no more, no less)

| Type | Purpose | Schema keys | Lifecycle |
|---|---|---|---|
| project | What this project is | id, stack, layer, domain | set on onboarding, versioned |
| architecture | Structural invariants | components, boundaries, data-flow | updated on architecture change |
| decision | Past decisions + reasons | decision, alternatives, reason, tradeoffs | append-only (ADRs) |
| domain | Domain knowledge | terms, entities, rules | updated with new domain insight |
| constraint | Hard constraints | constraint, source, scope | immutable unless explicitly revised |
| known-failure | Past failures + root causes | symptom, root-cause, fix, regression-id | append-only |
| environment | Environment fingerprints | runtime, versions, fingerprints | refreshed on env change |
| workflow | Workflow state + lessons | workflow-id, stage, outcome | lifecycle = workflow lifecycle |

## Validation rules

- Every entry has `id`, `type`, `created_at`, `source` (which
  evidence/decision produced it), `schema_version`.
- `known-failure` must reference an `incident` in the evidence model.
- `decision` must reference alternatives considered.
- Entries are *small* (target < 500 tokens each). Long entries are
  split.

## What is explicitly *not* memory

- Chat transcripts (those are traces, in the evidence model).
- Long "session summaries."
- Unstructured notes.
- Secrets or credentials of any kind (see `docs/security-model.md`).

## Storage

- Default: version-controlled markdown + sidecar JSON in
  `context/memory/<type>/`.
- Optional: a vector index built *from* the typed memory, never
  replacing it.

## Relationship to Project Intelligence (ADR-0015)

Memory records *what happened and was learned*. Project Intelligence
(`docs/architecture.md` "known gap" note, ADR-0015) records *what the
project structurally is*. The two are complementary: Project
Intelligence is refreshed by Discovery; Memory is appended to by
workflows. Project Intelligence schemas are finalized in Phase 1.
