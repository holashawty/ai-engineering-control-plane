---
name: code-review
description: Use at the understand-change, assess, and review states of workflows/code-review.sm.yaml — reviews a diff/PR against its baseline contract and the change's own claims, producing a Validation (match/mismatch/inconclusive) but applying no patch. Read-only by design. Novel to AIECP; no upstream equivalent found in docs/research.md.
license: MIT
allowed-tools: [filesystem_read, shell_exec, test_runner]
---

# Code Review

## When to use this skill

At the `understand-change`, `assess`, and `review` states in
`workflows/code-review.sm.yaml`. This is a read-only workflow: it
inspects a diff and emits a `Validation` describing whether the change
should ship, but it does not itself apply any patch. If the review
surfaces a needed fix, the user should run `bug-report` or
`change-request` against the surfaced concern — `code-review` does not
transition into a fix state, which is why the workflow declares no
`safety_gates`.

Distinct from `bug-report` (something is broken, fix it) and
`feature-request` (something new is needed, design and build it): here
the code exists and works, the question is whether it should ship.
Distinct from `behavioral-verification`: that skill judges a *fix*
against its `Expected`; this skill judges a *change* against both the
baseline it must not break and the new contract it claims to add.

## Procedure

### 1. Understand the change (state: `understand-change`)

Before forming any judgment about the diff, capture the diff itself as
evidence and establish the baseline the change must not silently break:

1. Capture the diff verbatim as an `Event` of `kind: "file_change"`
   (`evidence/schema/event.schema.json`), with the diff text in
   `payload` — not paraphrased. The diff is the primary subject of the
   review; a review that paraphrases the diff is reviewing the
   reviewer's summary, not the change. Use `shell_exec` (`git diff
   <base>..HEAD`) to produce the diff text, and put the verbatim output
   in `Event.payload.diff` (or `Event.payload.diff_summary` for very
   large diffs — but prefer the verbatim text whenever feasible).
2. Wrap the diff-capture event in a `Trace`
   (`evidence/schema/trace.schema.json`) that also includes any
   supporting inspection events (e.g. a `git log` event showing the
   change's commit context, a `grep` event showing what existing code
   the diff touches).
3. Emit an `Expected` (`evidence/schema/expected.schema.json`)
   describing the *baseline* contract — the existing behavior the diff
   touches that the change must not silently break. This is distinct
   from the new-behavior `Expected` emitted in `assess`: the baseline
   `Expected` is "what the system already does that this change must
   not break"; the `assess` `Expected` is "what the change claims to
   add." Both must be present, both must be `Expected` entities —
   never merge them.

**Failure handling:** if the diff cannot be captured (diff too large,
no base ref, binary patch the agent can't read), transition to
`blocked` with `on: change_unknowable` — do not proceed to assess a
diff you have not actually read. A review of an unread diff is a guess,
and guesses are exactly what `constitution/engineering-principles.md`
"Evidence before explanation" prohibits.

### 2. Assess (state: `assess`)

Form an assessment of the change against the baseline `Expected` from
`understand-change` and against the change's own claims:

1. Read the diff and the baseline `Expected` together. Identify each
   concern the change surfaces: could-be-breaking behavior changes,
   missing test coverage for new code paths, contract drift (the
   change's claims don't match what the diff actually does), security
   surface (new endpoint, new input parsing, new auth path),
   performance regression (new N+1 query, new blocking I/O).
2. Emit a `Decision` (`evidence/schema/decision.schema.json`) recording
   the assessment findings. The `Decision.what` describes the
   assessment verdict (e.g. `assessment:proceed_to_review` or
   `assessment:concerns_surfaced`). Use `alternatives` to list each
   concern surfaced and whether it is blocking or non-blocking (with
   reasons) — the eventual `report` state can cite these for the
   decision trace `constitution/engineering-principles.md` "Report the
   decision trace, not just the outcome" requires.
3. Emit a second `Expected` describing what the change *claims* to do
   — the new contract the diff asserts (e.g. "GET /health returns 200
   with { status: 'ok' }"). This is the contract the `review` state's
   `Validation` will compare the `Actual` against. Do NOT merge this
   with the baseline `Expected` from `understand-change`; they answer
   different questions.

**Failure handling:** if the assessment cannot be completed without
more context (e.g. a referenced spec is missing, an upstream contract
is ambiguous, the diff references a file the agent can't find),
transition back to `understand-change` with `on:
assessment_needs_more_context` rather than guessing. This back-edge is
expected and is the skill working correctly, not a failure — same
discipline as `systematic-debugging`'s `root_cause_invalid` return to
`locate-evidence`.

### 3. Review (state: `review`)

Compare the `Actual` (what the change actually does) against the
new-contract `Expected` from `assess` (what the change claims to do):

1. Read the diff and (optionally) run the diff's new tests via
   `test_runner`. Per `behavioral-verification`, a passing test suite
   is necessary but not sufficient — a green suite does not constitute
   a code review, it constitutes corroborating evidence for the
   `Actual`. If you do run tests, capture their result as a
   `test_result` `Event` and reference it from the `Actual`'s
   `observation_ref`.
2. Emit an `Actual` (`evidence/schema/actual.schema.json`) describing
   what the change actually does, as observed by reading the diff and
   running any targeted checks. The `observed_value` should be concrete
   (e.g. "GET /health returns 200 with { status: 'ok' }; the route
   does not check DB connection state"), not a restatement of the diff.
   The `expected_ref` must point at the new-contract `Expected` from
   `assess`, not the baseline `Expected` from `understand-change` —
   the `Actual` answers "did the change do what it claimed," not
   "did the change break the baseline" (the latter is what `assess`'s
   concerns already addressed).
3. Emit a `Validation` (`evidence/schema/validation.schema.json`)
   comparing the `Actual` against the new-contract `Expected` from
   `assess`. Use `method: "manual_review"` for a read-only review, or
   `method: "contract_validation"` if the diff claims to honor a
   specific named contract. Do NOT use `method: "unit_test"` alone —
   per ADR-0010, a passing test suite is not a code review.

**Read-only by design.** code-review produces a `Validation` with
`result: match/mismatch/inconclusive` but does not apply any patch. If
`result: "mismatch"` and the concern is blocking, transition to
`blocked` with `on: review_blocked_by_unresolved_concern` — the user
should run `bug-report` or `change-request` against the surfaced
concern. If `result: "match"` (or `"inconclusive"` with non-blocking
caveats), transition to `report` with `on: review_complete`. There is
no fix state in this workflow; if a fix is needed, that's a different
workflow.

## Tool integration

- `filesystem_read`: read the diff (from `git diff` output captured by
  `shell_exec`, or from a PR file), read the source files the diff
  touches for context, and read prior `Trace`/`Event`/`Decision`
  artifacts when building a reference chain. Never use `filesystem_
  write` — this is a read-only workflow (the SKILL's `allowed-tools`
  frontmatter intentionally omits it).
- `shell_exec`: capture the diff itself via `git diff <base>..HEAD`
  (the output becomes the `payload` of the `file_change` `Event`).
  Also used for any targeted inspection: `git log --oneline -20 --
  <path>` for change context, `grep -rn '<symbol>' src/` for the
  surface area the diff touches, `git show <sha>` for a specific
  commit's content. Prefer one-shot, scriptable commands over
  interactive tools — the captured output must be replayable by a
  future run that re-reviews the same diff.
- `test_runner`: optional — run the diff's new tests to corroborate
  the `Actual` (the diff does what its tests claim). Per
  `behavioral-verification`, never the sole basis for a `match`
  verdict; a green suite is necessary-not-sufficient. If
  `test_runner` is unavailable (the host project has no detected test
  runner, or the adapter doesn't expose one), proceed on
  `filesystem_read` + `shell_exec` alone with `method: "manual_review"`
  — do not block the review on `test_runner` availability, but note
  the absence in the `Actual.observed_value`.

## Validation

This skill is considered successful for a given run only if:
- At least one `event`/`trace` was emitted in `understand-change`
  before any `decision` was emitted in `assess` — evidence-before-
  explanation, enforced structurally (per
  `constitution/engineering-principles.md` "Evidence before
  explanation"). A `decision` in `assess` with no preceding `event` in
  `understand-change` is a process violation of this skill, even if
  the JSON Schemas individually validate.
- The final `Validation` in `review` references both `expected_ref`
  (the new-contract `Expected` from `assess`) and `actual_ref` (the
  observed `Actual` from `review`) — a `Validation` without both is
  invalid by schema (`required` fields), and a review that produces
  no `Validation` did not actually review.
- The `Validation.method` is `"manual_review"` or
  `"contract_validation"`, never `"unit_test"` alone (per ADR-0010
  and the same rule `behavioral-verification` enforces for fix
  verification — the bar for review is at least as high as the bar
  for fix verification).
- No question was asked during `understand-change`, `assess`, or
  `review` — none are in `code-review.sm.yaml`'s
  `question_economy.allowed_states` (only `classify` is). A question
  asked mid-review is a `question-economy-wrong-state` violation
  per the executor's `QuestionBudget` enforcement.
- No `safety_gates` entry was hit during the run — `code-review` is
  read-only by design, and the executor's run log should contain zero
  `gate-check` entries. (The e2e driver at
  `executor/examples/e2e-code-review/drive-run.mjs` asserts this
  explicitly.)

## Examples

**Happy path (clean review, validation match):** user says "review
this PR — it adds a `/health` endpoint to our Express app, plus a test
file." `classify` asks one decision-changing question ("hotfix or next
release?" — answer: next release, which lowers the rollback-review bar)
and emits an acceptance `Decision` (proceed). `understand-change`
captures the diff (route addition + app wiring + new test file) as a
`file_change` `Event` with the verbatim diff in `payload`, wraps it in
a `Trace` with a `git log` event for context, and emits a baseline
`Expected` ("existing `/items` endpoint behavior unchanged").
`assess` emits a `Decision` recording the concerns considered (none
blocking: small surface, the new test covers the new path, no contract
drift, no new security surface — `/health` is unauthenticated but
intentionally so per the existing pattern) and a new-contract `Expected`
("GET /health returns 200 with { status: 'ok' }"). `review` runs the
new test, reads the diff, emits an `Actual` matching the `Expected`,
and a `Validation` with `result: "match", method: "manual_review"`.
Transitions to `report`; a `project` memory entry records the change
was reviewed and accepted so a future workflow does not re-review the
same diff.

**Failure mode (review surfaces a real concern, validation mismatch):**
user says "review this PR — it adds `/health` returning
{ status: 'ok' }." `understand-change` captures the diff and emits
the baseline `Expected`. `assess` emits a `Decision` recording
concerns (one blocking: `/health` returns 200 even when the database
connection is down, defeating the purpose of a health check that an
orchestrator would use to decide whether to route traffic) and a
new-contract `Expected` reflecting what the change *should* do
("GET /health reflects DB connection state — 503 when DB unreachable").
`review` reads the diff, emits an `Actual` ("GET /health always
returns 200 regardless of DB connection state") and a `Validation`
with `result: "mismatch", method: "manual_review"`. Transitions to
`blocked` on `review_blocked_by_unresolved_concern`. The user is
pointed at `bug-report` or `change-request` to address the DB-state
concern — `code-review` itself does not fix. A `project` memory
entry is NOT written here (the change was not accepted); the concern
is preserved in the `blocked` state's report and the `Validation`
artifact, both of which cite the `Decision` and `Actual` so the
follow-up `bug-report`/`change-request` run can pick up the chain
without re-deriving it.
