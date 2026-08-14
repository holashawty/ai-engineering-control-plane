# Workflows

State-machine workflow definitions per `docs/workflow-model.md`.

**Status:** Two workflows are complete and runnable end-to-end
through the executor:

- `bug-report.sm.yaml` — the MVP vertical slice (ADR-0016). Proven
  end-to-end against a real (non-scripted) bug in
  `executor/examples/e2e-membership-bug/`.
- `feature-request.sm.yaml` — the second workflow. Proven
  end-to-end against the executor in
  `executor/examples/e2e-feature-request/` (23/23 assertions pass,
  safety gate and question economy both enforced).

Both run through the same `WorkflowRun` engine (`executor/src/run.ts`)
with no per-workflow code in the executor — the engine is
workflow-agnostic, reading the `.sm.yaml` declaration at runtime.
`_router.md` documents the full target routing table for post-MVP
workflows not yet backed by an `.sm.yaml` file.

