# Workflows

State-machine workflow definitions per `docs/workflow-model.md`.

**Status:** Five workflows are complete and runnable end-to-end
through the executor:

- `bug-report.sm.yaml` — reactive (something broken). Proof:
  `executor/examples/e2e-membership-bug/`.
- `feature-request.sm.yaml` — constructive (new capability added).
  Proof: `executor/examples/e2e-feature-request/`.
- `code-review.sm.yaml` — gatekeeping (read-only change assessment).
  Proof: `executor/examples/e2e-code-review/`.
- `refactor.sm.yaml` — behavior-preserving (uses
  `method: "replay_comparison"` for `verify-equivalence`).
  Proof: `executor/examples/e2e-refactor/`.
- `change-request.sm.yaml` — behavior-modifying (emits TWO
  `Expected` entities — OLD baseline + NEW contract).
  Proof: `executor/examples/e2e-change-request/`.

All five run through the same `WorkflowRun` engine
(`executor/src/run.ts`) with no per-workflow code in the executor —
the engine is workflow-agnostic, reading the `.sm.yaml` declaration
at runtime. Together they cover the four primary shapes of
engineering work (reactive, constructive, behavior-preserving,
behavior-modifying) plus the orthogonal gatekeeping shape.

`_router.md` documents the full target routing table for post-MVP
workflows not yet backed by an `.sm.yaml` file.


