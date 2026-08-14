# Memory

**Status: Phase 1 — MVP schemas complete.**

Typed memory taxonomy per `docs/memory-model.md`. The 4 types exercised
by the MVP `bug-report` workflow now have JSON Schemas in `schemas/`:

- `project.schema.json`
- `decision.schema.json`
- `known-failure.schema.json`
- `environment.schema.json`

The remaining 4 types (architecture, domain, constraint, workflow) are
introduced once the MVP vertical slice is proven (ADR-0016).

No storage/read-write implementation exists yet — schemas only. Phase 6.
