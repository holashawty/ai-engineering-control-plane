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

## Mode-Dependent Virtues (ADR-0037)

The principles above were written for **fix/maintenance** tasks — bug
reports, refactors, change requests. In that mode, minimalism IS the
virtue: don't add unasked features, don't scope-creep, "if it ain't
broke don't fix it."

But AIECP also supports **creation mode** (`--yarat` / greenfield
project creation via the orchestrator). In creation mode, the OPPOSITE
virtue applies: ambition, completeness, and delight are the goals. A
"Launch-Ready V1" that underwhelms the user is a failure, even if every
sub-goal technically completed.

### How to determine the mode

The mode is determined by the orchestrator's `classify-goal` state:
- If the goal is a **fix/maintenance** task (bug-report, refactor,
  change-request, regression, performance-problem, incident, security-
  problem) → **fix mode**.
- If the goal is a **creation** task (--yarat, greenfield project,
  feature-request on a new codebase, orchestrator with
  project_scale:large) → **creation mode**.

### What changes by mode

| Principle | Fix mode | Creation mode |
|---|---|---|
| Minimal fix | ✅ Smallest change that resolves the root cause | ❌ NOT applicable — build the FULL vision, not the minimum |
| Scope narrowing | ✅ When in doubt, narrow | ❌ When in doubt, EXPAND — ask "what would make this delightful?" |
| "While I'm here" changes | ❌ Never bundle into a fix | ✅ YES — if it enriches the product, add it (with evidence) |
| MVP | ✅ Minimal viable fix | ❌ "MVP" term is BANNED in creation mode — use "Launch-Ready V1" |
| Goal achievement | ✅ Bug fixed + regression guard | ✅ Product delights user + domain standards met + self-red-team passed |
| Feature richness | ❌ Don't add unasked features | ✅ Research domain standards, add standard features even if user didn't explicitly ask |

### The creation-mode checklist (before declaring goal_achieved)

In creation mode, the orchestrator's quality-gate state MUST verify ALL
of these before transitioning to `report`:

1. **Domain research**: was the domain standard researched (via web
   search / recency-verification)? A game without progression/upgrade
   is not Launch-Ready V1. An e-commerce without cart/checkout is not
   Launch-Ready V1. A CLI without --help is not Launch-Ready V1.
2. **Product vision**: did `product-vision` skill run and produce
   `specs/product-vision.md` with domain standards + wow factor targets?
3. **Creative expansion**: did `creative-expansion` skill run and either
   suggest enrichments that were implemented, OR explicitly reject
   suggestions with documented reasons?
4. **Self-red-team**: did `self-red-team` skill run the minimum tour
   count (based on project_scale: small=1, medium=2, large=3+) and
   either find no critical gaps, OR address all found gaps?
5. **User delight test**: would a real user who tried this product say
   "wow" or just "it works"? "It works" is NOT sufficient in creation
   mode.

### What does NOT change by mode

These principles are mode-INDEPENDENT — they apply equally to fix and
creation tasks:

- Evidence before explanation (always)
- Regression protection is part of the fix (always)
- Replay before declaring victory (always)
- Report the decision trace (always)
- Stack-native tooling (always)
- Safety gates (always — creation mode does NOT bypass safety gates)
- Question economy (always — creation mode does NOT allow unlimited
  questions; the agent researches autonomously)

### Why this matters

Without this separation, skills like `implementation` and `code-review`
apply fix-mode minimalism to creation-mode tasks, producing technically
correct but underwhelming products. The mode separation ensures that
when the user says "make me a game," the agent builds a DELIGHTFUL game,
not a minimal proof-of-concept that technically satisfies the letter of
the request while violating its spirit.
