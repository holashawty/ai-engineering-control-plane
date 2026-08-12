# Workflow Router

**Status: Phase 1 draft — MVP-scoped.**

Deterministic mapping from (intent classification, repository state) to a
workflow. Per docs/workflow-model.md, the user never selects a workflow
directly; they supply intent in natural language.

## MVP routing table

Only `bug-report` is implemented as a runnable workflow (see
`bug-report.sm.yaml`, ADR-0016). The remaining rows describe target
routing for post-MVP workflows and are not yet backed by an `.sm.yaml`
file.

| Intent signal (heuristic, not exhaustive) | Workflow | Status |
|---|---|---|
| "X doesn't work", "X sometimes fails", "error when I...", stack trace pasted | `bug-report` | **MVP — implemented** |
| No `.aiecp/project-intelligence.json` present in repo | `project-onboarding` | Planned |
| "add a feature", "I want users to be able to...", new capability request | `feature-request` | Planned |
| "change how X works", modify existing behavior without it being broken | `change-request` | Planned |
| User reports a UI/API bug filed by someone else against them | `user-complaint` | Planned |
| A `known-failure` memory entry's symptom recurs | `regression` | Planned |
| "clean up", "refactor", "simplify", no behavior change intended | `refactor` | Planned |
| "review this PR/diff" | `code-review` | Planned |
| "it's slow", latency/throughput complaint | `performance-problem` | Planned |
| Vulnerability report, suspicious access pattern | `security-problem` | Planned |
| "ship this", "cut a release" | `release` | Planned |
| Production alert, on-call page | `incident` | Planned |
| Intent doesn't match any row above with confidence | `unknown-failure` | Fallback — must triage into another workflow or refuse safely |

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
