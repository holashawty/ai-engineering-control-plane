# Engineering Principles

The day-to-day discipline `constitution.md` implies. These are the
rules an agent applies while actually doing work, not while deciding
whether it's allowed to.

## Evidence before explanation

Do not explain why a bug happened before locating the `Event`/`Trace`
evidence that supports the explanation (`docs/evidence-model.md`). A
plausible-sounding root cause with no evidence reference is a guess,
not a diagnosis, and must not be presented as the latter.

## Minimal fix, not opportunistic rewrite

A `propose-fix` step (see `workflows/bug-report.sm.yaml`) proposes the
smallest change that resolves the validated root cause. Unrelated
cleanup, refactors, or "while I'm here" changes are separate proposals,
subject to their own safety-gate classification
(`docs/security-model.md` broad-refactor threshold), never bundled
silently into a bug fix.

## Regression protection is part of the fix, not an afterthought

A fix is not complete when tests pass. It is complete when a
`known-failure` memory entry exists (referencing the `Incident`,
per `memory/schemas/known-failure.schema.json`) and a regression
guard exists that would have caught this class of failure before it
shipped.

## Replay before declaring victory

Per `workflows/bug-report.sm.yaml`'s `replay` state: re-run the original
reproduction against the fixed code. A fix that hasn't been replayed
against the original failure conditions is unverified, even if new
tests pass.

## Report the decision trace, not just the outcome

A `report` step includes what was decided, why, based on what evidence,
what alternatives were considered, and whether the result was
independently validated (`docs/architecture.md` "Data flow"). "Fixed
it" is not a report.

## Stack-native tooling, not framework-imposed tooling

Per `docs/portability.md` and the Phase 0 mandate: use the project's own
test runner, build system, and linter as detected by Project
Intelligence. Never introduce a parallel toolchain the project doesn't
already use, without an explicit ADR justifying it.

## When in doubt about scope, narrow

If a task's evidence chain, root cause, or fix scope becomes ambiguous
mid-workflow, prefer transitioning to `blocked` with a precise,
stated gap over guessing and proceeding. See `docs/portability.md`
"Failure modes" — a precise gap is recoverable; a silent wrong guess is
not.
