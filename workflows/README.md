# Workflows

State-machine workflow definitions per `docs/workflow-model.md`.

**Status:** `bug-report.sm.yaml` is complete and is the MVP vertical
slice (ADR-0016) — the one workflow that must run correctly end-to-end
before any other workflow is built out. `_router.md` routes intent to it
and documents the full target routing table for post-MVP workflows.

No workflow *executor* (the runtime that actually walks the state
machine) exists yet — that is Phase 2 (Core) in
`docs/implementation-roadmap.md`.
