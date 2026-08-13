# Project Discovery

**Status: Phase 1/2 — implemented and tested for Python + TypeScript.**

Detector-driven project onboarding pipeline per ADR-0009. The real,
working implementation lives at **`discovery/cli/`** — see
`discovery/cli/README.md` for usage and verification notes.

The output schema (`schema/project-intelligence.schema.json`,
ADR-0015) is finalized and validated in code (ajv) on every run.

MVP scope (ADR-0016) is Python and TypeScript detectors only — both
implemented. Additional stacks (Go, Rust, Java/Kotlin, Swift, C#, C/C++,
Electron) are future work; adding one means one new file under
`discovery/cli/src/detectors/` plus one registry line, per the
detector interface documented in `discovery/cli/src/types.ts`.

**Not yet implemented:** a `discovery-refresh` trigger that flips
`stale: true` on an existing `.aiecp/project-intelligence.json` when
repository structure changes (currently, `aiecp-discover` must be
re-run manually to refresh).
