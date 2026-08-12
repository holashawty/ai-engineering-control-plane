# Project Discovery

**Status: Phase 1 — Project Intelligence schema complete, detectors not yet implemented.**

Detector-driven project onboarding pipeline per ADR-0009. The output
schema (`schema/project-intelligence.schema.json`, ADR-0015) is
finalized: a persistent `.aiecp/project-intelligence.json` document that
Discovery produces once and every subsequent workflow consumes, instead
of re-deriving "what is this repository" from scratch each time.

**Not yet implemented:** the detectors themselves (`detectors/`). MVP
scope (ADR-0016) is Python and TypeScript detectors only — see
`docs/implementation-roadmap.md` Phase 3. A `discovery-refresh` trigger
that flips `stale: true` on the Project Intelligence document when
repository structure changes is designed but not yet built.
