# Workflows

State-machine workflow definitions per `docs/workflow-model.md`.

**Status:** Fifteen workflows are complete and runnable
end-to-end through the executor:

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
- `user-complaint.sm.yaml` — third-party-filed complaint
  (something reported AGAINST the user's project by an external
  party). Proof: `executor/examples/e2e-user-complaint/`.
- `security-problem.sm.yaml` — vulnerability report /
  suspicious-access-pattern. Proof:
  `executor/examples/e2e-security-problem/`.
- `release.sm.yaml` — release-shaped ("ship this", "cut a
  release"). Proof: `executor/examples/e2e-release/`.
- `incident.sm.yaml` — production alert / on-call page
  (production-shaped, distinct from bug-report by SLA pressure).
  Proof: `executor/examples/e2e-incident/`.
- `discovery-refresh.sm.yaml` — refresh a stale
  `.aiecp/project-intelligence.json` and UPDATE existing `project`
  + `environment` memory entries in place (same ids, `updated_at`
  bumped) rather than creating new ones. Proof:
  `executor/examples/e2e-discovery-refresh/`.
- `unknown-failure.sm.yaml` — the fallback workflow (router
  cannot confidently classify intent; triages into a target
  workflow or refuses safely). WRITES NOTHING — purely
  diagnostic. Proof: `executor/examples/e2e-unknown-failure/`.
- `orchestrator.sm.yaml` — "loop engineering" (LangChain, June
  2026): chains workflows in a loop (bug-report → feature-request →
  …) until the goal is met or blocked. The agent prompts ITSELF
  between iterations rather than returning to the user. The ONLY
  workflow in the catalog with a back-edge from a post-execution
  state (`evaluate-result`) to a pre-execution state (`route`) —
  the structural feature that makes "loop engineering"
  possible. Distinct from `unknown-failure` (which triages a
  single ambiguous intent into one target); the orchestrator
  drives multi-workflow autonomous execution. Safety-gated at
  `execute-workflow` (broad-refactor) on every spawn — delegation
  is gated just as application is gated. Proof:
  `executor/examples/e2e-orchestrator/`.

All fifteen run through the same `WorkflowRun` engine
(`executor/src/run.ts`) with no per-workflow code in the executor —
the engine is workflow-agnostic, reading the `.sm.yaml` declaration
at runtime. Together they cover the primary shapes of engineering
work: reactive, constructive, behavior-preserving, behavior-
modifying, gatekeeping, onboarding, regression, performance,
complaint, security, release, incident, refresh, fallback
triage, and multi-workflow autonomous goal pursuit (loop
engineering).

`_router.md` documents the full target routing table (including
the post-MVP intent signals now backed by `.sm.yaml` files).
