# Workflows

State-machine workflow definitions per `docs/workflow-model.md`.

**Status:** Eight workflows are complete and runnable end-to-end
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
- `project-onboarding.sm.yaml` — entry point for any new repo
  (runs `discovery/cli`, writes initial `project` + `environment`
  memory entries). Proof: `executor/examples/e2e-project-onboarding/`.
- `regression.sm.yaml` — prior-context-aware (a `known-failure`
  symptom recurs; `re-diagnose` Decision.why MUST cite the prior
  fix's blind spot). Proof: `executor/examples/e2e-regression/`.
- `performance-problem.sm.yaml` — cost-shaped ("it's slow";
  requires `environment_fingerprint_ref` at baseline; `verify-
  improvement` requires BOTH perf check AND functional regression
  check). Proof: `executor/examples/e2e-performance-problem/`.

All eight run through the same `WorkflowRun` engine
(`executor/src/run.ts`) with no per-workflow code in the executor —
the engine is workflow-agnostic, reading the `.sm.yaml` declaration
at runtime. Together they cover the primary shapes of engineering
work: reactive, constructive, behavior-preserving, behavior-
modifying, gatekeeping, onboarding, regression, and performance.

`_router.md` documents the full target routing table for post-MVP
workflows not yet backed by an `.sm.yaml` file.



