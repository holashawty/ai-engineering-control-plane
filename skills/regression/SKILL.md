---
name: regression
description: 'Use at the match-known-failure, identify-reintroduction, re-diagnose, re-fix, verify, and update-known-failure states of workflows/regression.sm.yaml — regression is bug-report with prior context (the prior known-failure memory entry, the original Incident, the original fix Decision). The skill''s job is to use that prior context to avoid repeating the prior fix''s blind spot the re-diagnose Decision.why MUST cite what the prior fix missed and why the reintroduction re-exposed it. Novel to AIECP; no upstream equivalent found in docs/research.md.'
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Regression

## When to use this skill

At the `match-known-failure`, `identify-reintroduction`, `re-diagnose`,
`re-fix`, `verify`, and `update-known-failure` states in
`workflows/regression.sm.yaml`. Do not apply this skill to a request
that lacks prior known-failure context — that is `bug-report`, not
regression, and routing it through this workflow will silently
produce a regression-shaped artifact (with the regression_id field
flipped) against a non-existent prior fix.

**Regression is bug-report with prior context.** Where `bug-report`
walks `locate-evidence → reproduce → diagnose → propose-fix →
apply-fix → verify → regression-protect → replay` from a cold start,
regression walks `match-known-failure → identify-reintroduction →
re-diagnose → re-fix → verify → update-known-failure` from a warm
start: the prior `known-failure` memory entry (written by
`bug-report`'s `regression-protect` state) has already localized
the original root cause and recorded the original fix. The skill's
job is to use that prior context to avoid repeating the same blind
spot the prior fix had — the entire reason `regression` exists as
a separate workflow from `bug-report` is to force that citation,
so the re-fix is structurally aware of what its predecessor missed.

**The blind-spot citation is non-negotiable.** A `re-diagnose`
`Decision` whose `why` field does not cite the prior fix's blind
spot is a process violation of this skill, even if the JSON Schema
itself permits any string in `why`. The citation's shape is fixed:
"the prior fix at `<commit>` addressed `<symptom>` via `<approach>`,
but did not account for `<edge case>`; the reintroduction at
`<commit>` re-exposed the edge case because `<reason>`." A re-fix
proposed without that citation is just a re-application of the same
fix that already failed once — which is the failure mode this skill
exists to prevent.

**When NOT to use this skill:**

- The request describes a new bug with no prior known-failure
  context → `bug-report`. The `match-known-failure` state will
  route there if no matching prior entry is found.
- The request describes adding new behavior → `feature-request`.
- The request describes changing existing (working) behavior →
  `change-request`.
- The request describes a behavior-preserving cleanup → `refactor`.

## Procedure

### 1. Match known-failure (state: `match-known-failure`)

Query the prior `known-failure` memory entry. The memory schema
(`memory/schemas/known-failure.schema.json`) is append-only; entries
live at `.aiecp/memory/known-failure/<id>.json` (or wherever the
project's memory store is configured). If no in-repo store exists,
ask the user to paste the prior known-failure entry verbatim
(its `symptom`, `root_cause`, `fix`, and `incident_ref` fields —
`regression_id` should be `null`, since this is the first recurrence).

1. Emit an `expected` (`evidence/schema/expected.schema.json`)
   describing the prior known-failure's symptom, retrieved from
   memory. The `source_ref` should point at the memory entry's id
   (e.g. `mem-known-failure-membership-expiry-boundary`) — the
   `Expected` is the contract the prior fix established, and the
   current symptom is being matched against it.
2. Emit an `actual` (`evidence/schema/actual.schema.json`) describing
   the currently-reported symptom, as observed in the current run.
   The `expected_ref` points at the `expected` from step 1; the
   `observation_ref` points at the `event` (e.g. a reproduction run
   or a user-supplied description captured as a `user_message`
   `event`).
3. Emit a `validation` (`evidence/schema/validation.schema.json`)
   comparing the two. Use `method: "manual_review"` for a
   human-judged symptom comparison (the symptom is described in
   prose, not checkable programmatically) or `method:
   "contract_validation"` if the symptom is encoded as a checkable
   contract (e.g. an assertion that throws, a JSON shape mismatch).
   `result: "match"` → proceed to `identify-reintroduction`.
   `result: "mismatch"` → transition to `blocked` with
   `no_matching_known_failure` and recommend `bug-report` instead
   (the symptom is actually new — proceeding without prior context
   collapses regression into bug-report while losing the routing
   discipline).

**Reading memory with `filesystem_read` is mandatory**, per
constitution §8 ("Tool use is mandatory, not optional") and the
`tool-use-discipline` skill. An agent that "remembers" the prior
known-failure from training-data familiarity rather than reading the
actual memory entry is hallucinating prior context — exactly the
failure mode §8 exists to prevent. If no memory store exists, ask
the user to paste the entry; do NOT invent one.

### 2. Identify reintroduction (state: `identify-reintroduction`)

The prior known-failure entry records the original fix (in its
`fix` field). The reintroduction is whatever removed, bypassed, or
contradicted that fix since it was applied. Find it.

1. Emit a `trace` (`evidence/schema/trace.schema.json`) covering
   the recent-commit inspection, with `source: "agent_adapter"` and
   empty `event_refs` initially — events will be appended in step 2.
2. For each recent commit since the prior fix (captured via
   `shell_exec: git log --oneline --since=<prior-fix-commit> --
   <path>` or `git log <prior-fix-commit>..HEAD -- <path>`), emit
   an `event` (`evidence/schema/event.schema.json`) with `kind:
   "observation"`, `source: "git log -- <path>"`, and
   `payload.finding` describing what that commit changed (one event
   per commit — do not collapse them into a single "5 commits since
   the prior fix" event; per-commit attribution is what makes the
   reintroduction-identifying `Decision` citable). Append each
   event's id to the trace's `event_refs`.
3. Emit a `decision` (`evidence/schema/decision.schema.json`)
   recording which commit reintroduced the regression, with
   `evidence_refs` pointing at the specific `event`(s) that justify
   the attribution. The `what` field should be
   `reintroduction_identified:<commit-sha>` or similar. The `why`
   field should describe in prose what specifically about that
   commit re-introduced the prior fix's flaw (e.g. "commit abc123
   refactored parseExpiryDate from src/membership.ts to
   src/membership/parsing.ts and in doing so changed the boundary
   check from `<=` back to `<`, contradicting the prior fix at
   commit def456 which had changed `<` to `<=`").
4. If the reintroduction cannot be attributed to a specific commit
   (the diff between fixed-then and broken-now is too large, no
   `git log` history available, or the symptom is timing-dependent
   across multiple commits), transition to `blocked` with
   `reintroduction_unidentifiable` and a precise gap statement
   ("`git log` since prior fix commit `<sha>` produced 47 commits
   across 12 files; cannot attribute the reintroduction to a single
   commit without further narrowing — recommend running `bug-report`
   against the current symptom with the prior known-failure context
   preserved as a starting point").

**Why this state is structurally smaller than `bug-report`'s
`locate-evidence`:** in `bug-report`, the diagnosis walks the
codebase for the first time. In regression, the diagnosis walks the
diff between "fixed-then" and "broken-now" — a much smaller search
space, because the prior known-failure has already localized the
original root cause. This is the structural advantage of having
prior context: the search is bounded by the prior fix's location,
not the whole codebase.

### 3. Re-diagnose (state: `re-diagnose`)

This is `systematic-debugging` Phase 3 (hypothesis → test → minimal
fix), applied against the Evidence Model, with ONE structural
addition that is the entire reason this skill and workflow exist
separately from `bug-report`:

**The `Decision.why` field MUST cite the prior fix's blind spot.**

The shape is fixed:
> "the prior fix at `<commit>` addressed `<symptom>` via
> `<approach>`, but did not account for `<edge case>`; the
> reintroduction at `<commit>` re-exposed the edge case because
> `<reason>`. The re-fix must therefore `<what the re-fix does
> differently>`."

A re-diagnosis `Decision` whose `why` does not include this citation
is a process violation of this skill — without the citation, the
re-fix is just bug-report with a memory read at the start, which
defeats the purpose of separating the workflows. The citation
forces the agent to articulate WHY the prior fix failed to prevent
this recurrence, which is the institutional learning that makes the
re-fix different in kind from a re-application of the original fix.

1. From the trace, identify the first point where a `Decision` or
   state diverges from what the prior known-failure's `fix` field
   established. This is the root-cause candidate.
2. State that candidate as a `decision` with `validated: false`,
   `root_cause: false` initially. The `why` field MUST include the
   blind-spot citation above. The `evidence_refs` should point at
   the events from `identify-reintroduction` that justify the
   attribution.
3. Test the candidate: does forcing the opposite of that decision
   eliminate the symptom in a controlled way (a targeted unit test,
   a debugger breakpoint, a log statement)? This is the "test the
   hypothesis" step — do not accept a candidate on plausibility
   alone.
4. Only after the candidate is confirmed against evidence, emit a
   `validation` with `method: "manual_review"` or stronger, and
   flip the `decision`'s `root_cause: true`. The `validated` field
   stays `false` until `verify` confirms the *re-fix* resolves the
   symptom — re-diagnose validates the root-cause *candidate*, not
   the re-fix itself (same AI-output validation pattern as
   `bug-report`'s `diagnose` state).

**Failure handling:** if the root-cause candidate does not survive
testing, transition back to `identify-reintroduction` with
`root_cause_invalid`. This back-edge is expected and is the skill
working correctly — same discipline as `systematic-debugging`'s
`root_cause_invalid` return to `locate-evidence`. Do not force a
candidate through just because a first attempt was made.

### 4. Re-fix (state: `re-fix`)

Apply a re-fix that explicitly addresses the prior fix's blind spot.
This is NOT a re-application of the original fix — that would just
regress again the next time the same reintroduction pattern occurs.
The re-fix must be different in kind from the prior fix, in a way
that the `re-diagnose` `Decision.why` field already named.

1. Retrieve the validated root-cause `Decision` from `re-diagnose`
   (with `root_cause: true`). If you cannot point to it, do not
   write code — return to `re-diagnose`.
2. Make the smallest change that addresses the blind spot cited in
   the `Decision.why` — per `constitution/engineering-principles.md`
   "Minimal fix, not opportunistic rewrite." Unrelated cleanup is a
   separate `Decision`, subject to its own `broad-refactor` gate,
   never bundled silently into the re-fix patch.
3. Emit a `decision` with `what: "ai_proposal:apply_patch"` (or
   more specific `ai_proposal:*`), `validated: false`, `result:
   "pending"`. The `why` should reference the prior fix's blind
   spot from `re-diagnose` and name *what the re-fix does
   differently*. This `Decision`'s `why` is the artifact a future
   reviewer (or future regression run) will read to understand
   why the second fix is structurally different from the first.
4. Emit an `event` with `kind: "file_change"` and a `diff_summary`
   specific enough that `report` can cite it in the decision trace.
5. The `broad-refactor` safety gate fires here — if the re-fix
   exceeds `broad_refactor_threshold`, transition back to
   `re-diagnose` (not `re-fix`) so the design can be re-scoped,
   rather than pressing on with a refactor that was never approved
   as a design.

### 5. Verify (state: `verify`)

Behavioral verification per ADR-0010 and the `behavioral-verification`
skill. The check is NOT "did the test suite pass" (the prior fix
already had a regression test that the reintroduction may have
silently passed); the check is "did the prior known-failure's symptom
actually go away after the re-fix."

1. Re-derive `Expected` from the prior known-failure's symptom
   (already emitted as `expected` in `match-known-failure`). The
   re-fix must satisfy this same `Expected` — that is the
   contract the prior fix established, and the re-fix must
   re-establish it.
2. Run the project's own test suite (via `test_runner`, per
   Project Intelligence `project.test_system`) — necessary but
   not sufficient on its own (per ADR-0010).
3. Directly check the behavioral claim: re-run (or write, if the
   prior fix's regression test was lost) a check that specifically
   exercises the root-cause scenario from `re-diagnose`. Emit an
   `actual` (`evidence/schema/actual.schema.json`) recording the
   observed post-re-fix behavior, with `expected_ref` pointing at
   the `expected` from `match-known-failure` (not a new one — the
   contract being verified is the prior known-failure's symptom,
   which is the same contract the prior fix established).
4. Emit a `validation` with `method: "app_validation"` (for a
   direct behavioral check) or `method: "replay_comparison"` (if
   re-running the original reproduction against the re-fixed code).
   `result: "match"` only if step 3's direct behavioral check
   passed. `result: "mismatch"` → transition back to `re-fix` with
   `behavior_not_verified`, not forward.

**Why `replay_comparison` is acceptable here but not the default.**
`replay_comparison` is the canonical method for `refactor` (per
`skills/refactor/SKILL.md`'s "verify-equivalence" procedure), where
the question is "did the behavior change?". For regression, the
question is "did the symptom go away?" — which is closer to
`app_validation` (a direct check that the symptom no longer
occurs). `replay_comparison` is acceptable when the original
reproduction from the prior known-failure is re-runnable bit-for-bit
against the re-fixed code; `app_validation` is the more common
case and the default.

### 6. Update known-failure (state: `update-known-failure`)

Update the prior `known-failure` memory entry by setting its
`regression_id` field. Per
`memory/schemas/known-failure.schema.json`, the entry's
`regression_id` is `null` when first written (in `bug-report`'s
`regression-protect` state) and gets set to a new id when a
regression occurs.

1. Read the prior `known-failure` memory entry (via
   `filesystem_read`). Do NOT modify any other field — the entry's
   `symptom`, `root_cause`, `fix`, `incident_ref`, `created_at`,
   `source` all stay as they were. Only `regression_id` flips from
   `null` to a new value.
2. Generate a new `regression-<slug>` id for the `regression_id`
   field. The id should follow the evidence id pattern
   (`regression-<slug>`) even though no `regression.schema.json`
   exists in `evidence/schema/` yet — the schema directory marks
   the `Regression` entity as post-MVP, and this skill's procedure
   is forward-compatible with the eventual schema by using the
   id pattern now.
3. Write the updated entry back to the memory store (via
   `filesystem_write` — overwriting the prior entry in place, since
   the schema description says "append-only" but the
   `regression_id` field exists in the schema for exactly this
   update — append-only refers to the *fact* of the failure being
   recorded, not that the entry's fields are frozen forever).
4. Emit a `decision` with `what: "regression_recorded"`,
   `validated: true`, `result: "accepted"`. This `Decision` is
   the post-MVP stand-in for what would be a `Regression` evidence
   entity (per `docs/evidence-model.md`'s core entities table —
   id, incident_ref, original_fix_ref, current_evidence_ref). The
   `Decision.evidence_refs` array should reference the prior
   `incident_ref` (from the known-failure entry) and the new
   evidence (`re-diagnose` Decision id, `verify` Validation id).
   The `Decision.id` may double as the value placed in the
   known-failure's `regression_id` field, OR a dedicated
   `regression-<slug>` id may be generated — the latter is
   preferred, so the `regression_id` field reads as "this entry
   has a regression linked to it" rather than "this entry has a
   decision linked to it" (the semantic distinction matters when
   the eventual `Regression` schema lands).
5. If the memory update cannot be persisted (no writeable memory
   store, schema rejects the update, the prior entry's id format
   does not match the schema's `^mem-known-failure-[a-zA-Z0-9_-]+$`
   pattern), transition to `blocked` with
   `known_failure_update_failed` — a regression that is not
   recorded in memory is one a future run will not know about,
   defeating the purpose of this workflow's existence.

**Why this state updates an existing memory entry rather than
writing a new one.** `bug-report`'s `regression-protect` writes a
new `known-failure` entry (the failure is being recorded for the
first time). `change-request`'s `report` writes a new `known-failure`
entry (the failure mode being recorded is the *new behavior's*
impact on downstream users — a new failure, even though no bug
existed). `regression`'s `update-known-failure` is the only state
in the catalog that UPDATES an existing memory entry — the failure
is the same one that was previously fixed, and the update records
that it recurred. The `regression_id` field exists in the schema
for exactly this case; flipping it from `null` to a new id is the
memory-level signal that this known-failure has now recurred at
least once.

## Tool integration

- `filesystem_read`: read the prior `known-failure` memory entry
  (mandatory per constitution §8 — never recall from training-data
  memory); read the prior fix's source code (the prior fix commit,
  identified via `git log`); read prior `Trace`/`Event`/`Decision`
  artifacts when building the reference chain in `verify`.
- `filesystem_write`: apply the re-fix patch; write the updated
  `known-failure` memory entry back to the memory store.
- `shell_exec`: run `git log` / `git diff` for the
  `identify-reintroduction` state's commit inspection; run the
  project's test runner for `verify`; run any targeted behavioral
  check for `verify` step 3.
- `test_runner`: structured access to test results for `verify`
  (preferred over `shell_exec` for test runs when the adapter
  exposes it — per `docs/portability.md` adapter `capabilities()`).

## Validation

This skill is considered successful for a given run only if:

- The `re-diagnose` `Decision.why` field explicitly cites the prior
  fix's blind spot in the fixed shape ("the prior fix at `<commit>`
  addressed `<symptom>` via `<approach>`, but did not account for
  `<edge case>`; the reintroduction at `<commit>` re-exposed the
  edge case because `<reason>`"). A re-diagnosis without this
  citation is a process violation of this skill, even if the JSON
  Schema permits any string in `why`.
- The `match-known-failure` state emitted an `expected` (the prior
  known-failure's symptom, retrieved from memory), an `actual`
  (the current symptom, observed), and a `validation` comparing the
  two. A regression run that did not actually read the prior
  known-failure entry before forming a root-cause candidate has
  skipped the prior-context step that defines this workflow.
- The `identify-reintroduction` state's `Decision.evidence_refs`
  array points at concrete `event`s (one per recent commit since
  the prior fix). A reintroduction-attributing `Decision` with no
  `evidence_refs` is a guess, not a diagnosis — same hollow-evidence
  failure mode `evidence-engineering` step 2 exists to prevent.
- The `re-fix` `Decision.why` field names what the re-fix does
  differently from the prior fix (the blind-spot-addressing
  difference). A re-fix whose `why` does not name the difference is
  a re-application of the original fix, which would just regress
  again the next time the same reintroduction pattern occurs.
- The `update-known-failure` state wrote an updated `known-failure`
  memory entry with `regression_id` set to a new `regression-<slug>`
  id (previously `null`), AND emitted a `Decision` with `what:
  "regression_recorded"` referencing the prior `incident_ref` and
  the new evidence. A regression that does not record itself in
  memory is one a future run will not know about.
- No question was asked outside `classify` (per the workflow's
  `question_economy.allowed_states: [classify]`) and at most one
  question total was asked across the whole run.

**The non-negotiable check:** if any of the above is missing, the
regression run is not done — it is incomplete, regardless of
whether the symptom appears to be gone. A green test suite with no
blind-spot citation in the `re-diagnose` `Decision.why` is, for
regression specifically, the same hazard ADR-0010 names for
`bug-report`: technical success masking unverifiable correctness.

## Examples

**Happy path:** A membership service had a known off-by-one bug in
`is_active()` (the function used `<` instead of `<=` against the
expiry date, contradicting its own docstring). `bug-report` fixed
it: `<` → `<=`, added a regression test `test_active_on_expiry_date_
itself`, wrote a `known-failure` memory entry
(`mem-known-failure-membership-expiry-boundary`) with `regression_id:
null`. Three months later, a refactor extracts `parseExpiryDate`
into its own helper module `src/membership/parsing.ts` and — in
doing so — accidentally re-introduces the strict `<` comparison
(the refactor's diff included a "cleanup" of the comparison that
reverted to `<`). Users report the same symptom: "members say their
membership expired a day early." This `regression` workflow fires:
`match-known-failure` reads the prior entry, emits `expected`
(symptom from memory) + `actual` (current symptom) + `validation`
(match — same symptom). `identify-reintroduction` runs `git log
<original-fix-commit>..HEAD -- src/membership/`, emits one
`event` per commit since the prior fix, identifies the
refactor commit as the reintroduction (its diff touched the
comparison). `re-diagnose` emits a `Decision` with `why`: "the
prior fix at commit `<sha>` addressed the off-by-one symptom via
the `<` → `<=` change, but did not account for the fact that the
fix lived inside `validateMembership`'s inline date-parsing block
rather than as a separate tested function; the reintroduction at
commit `<sha>` re-exposed the edge case because the refactor that
extracted `parseExpiryDate` did not preserve the boundary
comparison (the refactor's 'cleanup' reverted to `<`). The re-fix
must therefore extract `parseExpiryDate` AND add a boundary test
inside `parseExpiryDate`'s own test file, so the boundary check is
not coupled to the broader `validateMembership` test." `re-fix`
extracts the function with the correct `<=` plus a dedicated
boundary test in `src/membership/parsing.test.ts`. `verify` re-runs
the suite + directly checks `is_active(date(2026,6,1),
date(2026,6,1))` returns `True`. `update-known-failure` writes the
prior entry back with `regression_id: "regression-membership-expiry-
boundary-recurrence-1"` and emits `decision: regression_recorded`.
`report` summarizes: original incident, prior fix's blind spot (the
fix was inline and untested at the function level), reintroduction
commit, re-fix's structural difference (extracted function + own
test file). Without the blind-spot citation, the re-fix would have
been just `<` → `<=` again — and the next refactor touching that
file would re-regress the same way.

**Failure mode handled correctly (no matching known-failure,
rerouted to bug-report):** User reports "the password reset email
from-address is back to support@." `match-known-failure` queries
`.aiecp/memory/known-failure/` and finds no entry whose `symptom`
matches a password reset from-address issue — there WAS a
`change-request` that wrote a `known-failure` entry for the
from-address change, but that entry's `symptom` describes the
downstream impact of the change (allow-list filters breaking),
not the from-address reverting. The `validation` emits
`result: "mismatch"` (the current symptom does not match any prior
known-failure's symptom). The workflow transitions to `blocked`
with `no_matching_known_failure` and the blocked state's report
recommends rerunning as `bug-report` against the current symptom
(preserving the prior known-failure context as a starting point,
but not forcing a regression-shaped artifact onto what is actually
a new bug). Without this guardrail, the workflow would have
proceeded to `re-diagnose` against a non-existent prior fix,
inventing the prior fix's blind spot from training-data
familiarity rather than reading it from memory — exactly the
hallucination mode constitution §8 exists to prevent.
