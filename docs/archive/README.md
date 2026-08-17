# Archived Documentation

This directory contains historical / point-in-time snapshot documents whose
counts and claims are **stale** relative to the current state of the project.
They are kept for historical reference (to understand the evolution of AIECP
and the decisions that shaped it) but should NOT be cited as current state.

For current state, see:
- `STATUS.md` (root) — current phase, counts, auto-generated assertion table
- `DECISIONS.md` (root) — current ADR log (29 ADRs as of 2026-08-16)
- `README.md` (root) — current skill/workflow/adapter catalog
- `docs/architecture.md` — current architecture (live)
- `docs/evidence-model.md` — current evidence model (live)
- `docs/workflow-model.md` — current workflow model (live)
- `docs/memory-model.md` — current memory model (live)

## Archived files

| File | Archived because |
|---|---|
| `controller-audit-and-roadmap-2026.md` | 2026-08-15 audit; claims 14 workflows/26 skills/4 adapters (actual: 15/35/5); presents now-implemented recommendations as TODO |
| `implementation-roadmap.md` | Phase 0/1 roadmap with `[ ]` items that are all now `[x] done`; phase labels stale (says Phase 1 in-progress, actual Phase 2) |
| `quality-audit.md` | 2026-08-15 audit report; every count stale (14/26/23/4/15/11/~610 vs actual 15/35/29/5/20/25/953) |
| `vision-and-roadmap.md` | 2026-08-15 vision doc; claims MCP/visual-regression/self-healing/context-engineering "eksik" (missing) — all 4 now implemented; 466 lines of stale counts |

## When to update this directory

If a future audit produces a new point-in-time snapshot that supersedes one of
these files, the older file should be deleted (not kept as double-archive). The
archive is for the most recent prior snapshot only — older snapshots have no
reference value once a newer one exists.
