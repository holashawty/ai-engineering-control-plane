# Evidence Engine

**Status: Phase 1 — MVP schemas complete.**

Semantic evidence model per `docs/evidence-model.md`. The 8 MVP-scope
entities now have JSON Schemas in `schema/`:

- `incident.schema.json`
- `trace.schema.json`
- `event.schema.json`
- `decision.schema.json`
- `expected.schema.json`
- `actual.schema.json`
- `validation.schema.json`
- `replay.schema.json`

The remaining 6 entities (State Transition, Contract, Invariant,
Environment Fingerprint, Reproduction, Regression) are long-term scope
(ADR-0016) and are introduced once the MVP vertical slice
(`workflows/bug-report.sm.yaml`) runs correctly end-to-end.

Each schema instance must validate before being written to the
`examples/` corpus or consumed by a workflow. No implementation of the
*writer* (the code that actually emits these JSON documents during a
workflow run) exists yet — that is Phase 4 in `docs/implementation-roadmap.md`.
