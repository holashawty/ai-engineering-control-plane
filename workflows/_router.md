# Workflow Router

**Status: Phase 1 — eight runnable workflows.**

Deterministic mapping from (intent classification, repository state) to a
workflow. Per docs/workflow-model.md, the user never selects a workflow
directly; they supply intent in natural language.

## MVP routing table

Eight workflows are implemented as runnable workflows and proven
end-to-end against the real executor (`WorkflowRun` API):

- `bug-report.sm.yaml` — reactive (something broken). Proof:
  `executor/examples/e2e-membership-bug/`.
- `feature-request.sm.yaml` — constructive (new capability added).
  Proof: `executor/examples/e2e-feature-request/`.
- `code-review.sm.yaml` — gatekeeping (read-only change assessment).
  Proof: `executor/examples/e2e-code-review/`.
- `refactor.sm.yaml` — behavior-preserving. Proof:
  `executor/examples/e2e-refactor/`.
- `change-request.sm.yaml` — behavior-modifying. Proof:
  `executor/examples/e2e-change-request/`.
- `project-onboarding.sm.yaml` — entry point for any new repo;
  runs `discovery/cli` and writes the initial memory entries.
  Proof: `executor/examples/e2e-project-onboarding/`.
- `regression.sm.yaml` — prior-context-aware (a known-failure
  symptom recurs). Proof: `executor/examples/e2e-regression/`.
- `performance-problem.sm.yaml` — cost-shaped ("it's slow").
  Proof: `executor/examples/e2e-performance-problem/`.

Together these cover the primary shapes of engineering work:
reactive, constructive, behavior-preserving, behavior-modifying,
gatekeeping, onboarding, regression, and performance — driven by
the same workflow-agnostic executor. The remaining rows describe
target routing for post-MVP workflows and are not yet backed by an
`.sm.yaml` file.

| Intent signal (heuristic, not exhaustive) | Workflow | Status |
|---|---|---|
| "X doesn't work", "X sometimes fails", "error when I...", stack trace pasted | `bug-report` | **MVP — implemented** |
| No `.aiecp/project-intelligence.json` present in repo | `project-onboarding` | **MVP — implemented** |
| "add a feature", "I want users to be able to...", new capability request | `feature-request` | **MVP — implemented** |
| "change how X works", modify existing behavior without it being broken | `change-request` | **MVP — implemented** |
| User reports a UI/API bug filed by someone else against them | `user-complaint` | **MVP — implemented** |
| A `known-failure` memory entry's symptom recurs | `regression` | **MVP — implemented** |
| "clean up", "refactor", "simplify", no behavior change intended | `refactor` | **MVP — implemented** |
| "review this PR/diff" | `code-review` | **MVP — implemented** |
| "it's slow", latency/throughput complaint | `performance-problem` | **MVP — implemented** |
| Vulnerability report, suspicious access pattern | `security-problem` | **MVP — implemented** |
| "ship this", "cut a release" | `release` | **MVP — implemented** |
| Production alert, on-call page | `incident` | **MVP — implemented** |
| Intent doesn't match any row above with confidence | `unknown-failure` | **MVP — implemented** (fallback) — must triage into another workflow or refuse safely |

## Classification method (MVP)

1. Check whether `.aiecp/project-intelligence.json` exists and is not
   `stale: true`. If missing/stale → route to `project-onboarding` first
   (once implemented; until then, surface a `blocked` state explaining
   discovery hasn't run).
2. Otherwise, match intent signal against the table above using the
   project's own Discovery output (error logs, recent commits, test
   failures) as corroborating evidence, not just message text.
3. If no confident match → `unknown-failure` (fallback), never silently
   guess a workflow.

## Non-goals for MVP

The router does not yet handle multi-intent messages ("fix this bug AND
add this feature") — that is explicitly deferred past the vertical
slice per ADR-0016.
