# End-to-end run: regression workflow (membership expiry off-by-one RECURRED)

**This is the sixth e2e proof point** in the repo, alongside
`executor/examples/e2e-membership-bug/`,
`executor/examples/e2e-feature-request/`,
`executor/examples/e2e-code-review/`,
`executor/examples/e2e-refactor/`,
`executor/examples/e2e-change-request/`, and
`executor/examples/e2e-chat-adapter/`. The first proved
`bug-report.sm.yaml` works end-to-end against a real (non-scripted)
bug. The second through fifth proved the executor is
workflow-agnostic by running structurally different workflows
(`feature-request`, `code-review`, `refactor`, `change-request`)
through it with zero code changes. This one proves the same
workflow-agnosticism for the regression shape — the only workflow
in the catalog whose first memory operation is a READ of prior
`known-failure` rather than a WRITE of new memory at the end.

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`regression.sm.yaml`. Every `emitEvidence` call writes a JSON file
to disk that the executor's `EvidenceStore` validates against the
actual `evidence/schema/*.schema.json` and `memory/schemas/*.schema.json`
files — a schema violation would throw before the file is written.
Every transition goes through the real `StateMachine.advance` and
`WorkflowRun.advance` (with safety gate enforcement).

**Isn't:** a recording of a live multi-turn agent session issuing
one tool call at a time through an actual agent adapter. The
scenario data (the prior known-failure entry, the git log output,
the test failure messages) is realistic but scripted — and the
prior known-failure entry is embedded as a JS object in the driver
rather than read from `.aiecp/memory/known-failure/` on disk, so
the driver is self-contained. The same honest scope note as
`executor/examples/e2e-feature-request/README.md` applies: a driver
script assembling realistic data is not yet a live agent session.

## What the run proves

Run `node executor/examples/e2e-regression/drive-run.mjs` and
observe 43 assertions passing. The interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal state
   is a dead end, all states reachable from `intake`.
2. **End-to-end walk.** A single `WorkflowRun` walks `intake →
   classify → match-known-failure → identify-reintroduction →
   re-diagnose → re-fix → verify → update-known-failure → report`,
   emitting schema-valid evidence at every emitting state.
3. **Safety gate is workflow-agnostic.** The `broad-refactor` gate
   at the `re-fix` state blocks an un-confirmed advance out of
   `re-fix` (the executor throws `safety-gate-needs-confirmation`),
   then allows the same advance once `advanceWithConfirmation` is
   called. This is the same gate code `bug-report` exercises at
   `propose-fix`/`apply-fix`, `feature-request` exercises at
   `implement`, `refactor` exercises at `implement`, and
   `change-request` exercises at `migrate` — proving the gate logic
   is keyed off the workflow's `safety_gates` declaration, not
   hardcoded to any one workflow's specific states.
4. **Question economy with 1 allowed state.** The budget is
   `max_questions: 1, allowed_states: [classify]`. The driver asks
   one decision-changing question in `classify` ("is this the same
   symptom as the prior incident, or a similar-looking new one?")
   — accepted. A second question, attempted in `verify` (not in
   `allowed_states`), is rejected with
   `question-economy-wrong-state`. A second question in `classify`
   itself (in a fresh run, the budget already at 1) is rejected
   with `question-economy-exceeded`. This is the same budget shape
   `bug-report` and `refactor` use (1 question, only in `classify`) —
   regression IS bug-report with prior context, and the prior
   context reduces the question budget just as much.
5. **AI-output validation pattern holds.** The `re-diagnose`
   `Decision` is emitted with `validated: false, result: "pending"`
   — a root-cause candidate, not a self-confirmed claim. The
   `re-fix` `Decision` is also `validated: false, result:
   "pending"` — an AI proposal. Both only become trustworthy after
   `verify` emits a `Validation` with `method: "app_validation"`
   (per ADR-0010, `unit_test` alone would be insufficient — the
   direct behavioral check on the boundary is what makes the
   validation meaningful).
6. **Decision trace preserved.** The `identify-reintroduction`
   `Decision` records `evidence_refs` pointing at concrete commit
   events (one `Event` per `git log` commit since the prior fix).
   The `re-diagnose` `Decision.why` cites the prior fix's blind
   spot in the fixed shape. The `re-fix` `Decision.why` names what
   the re-fix does differently from the prior fix. All three are
   artifacts a future reviewer (or future regression run) can read
   to understand why the second fix is structurally different from
   the first.
7. **`update-known-failure` UPDATES rather than creates.** This is
   the only workflow in the catalog that updates an existing memory
   entry rather than creating a new one. `bug-report`'s
   `regression-protect` writes a new `known-failure` entry (the
   failure is being recorded for the first time). `change-request`'s
   `report` writes a new `known-failure` entry (the failure mode
   being recorded is the *new behavior's* impact on downstream
   users). `regression`'s `update-known-failure` writes the prior
   entry back with `regression_id` flipped from `null` to a new
   `regression-<slug>` id — the only state in the catalog that
   performs an UPDATE.
8. **`regression_recorded` Decision is the post-MVP stand-in for
   the `Regression` evidence entity.** The `Regression` entity is
   listed in `docs/evidence-model.md`'s core entities table (id,
   incident_ref, original_fix_ref, current_evidence_ref) but
   `evidence/schema/` does not yet have a `regression.schema.json`
   file (post-MVP per the schema directory). This workflow emits a
   `Decision` with `what: "regression_recorded"` as the stand-in,
   referencing the prior `incident_ref` and the new evidence
   (`re-diagnose` Decision id, `verify` Validation id) in
   `evidence_refs`. The driver spot-checks this Decision's
   persisted JSON to confirm the reference chain is intact.
9. **Disk persistence.** Evidence files actually land on disk under
   `evidence/<kind>/*.json` and `memory/<kind>/*.json` — the driver
   spot-checks several (the `re-diagnose` Decision with the
   blind-spot citation, the `reintroduction_identified` Decision
   with commit-event `evidence_refs`, the `regression_recorded`
   Decision referencing the prior incident, the updated
   `known-failure` memory entry with `regression_id` set) to
   confirm the persisted JSON matches what was emitted.

## The scenario

The natural sequel to `executor/examples/e2e-membership-bug/`:

> "some members say their membership expired a day early — again."

Three months ago, the original `bug-report` run fixed the off-by-one
in `is_active()` (changed `<` to `<=`, added the regression guard
test `test_active_on_expiry_date_itself`, wrote the
`mem-known-failure-membership-expiry-boundary` memory entry with
`regression_id: null`). Now the symptom has recurred. The driver
models:

- **classify:** asks one decision-changing question ("is this the
  same symptom as the prior incident, or a similar-looking new
  one?") — the question that routes either forward to
  `match-known-failure` or out to `bug-report`.
- **match-known-failure:** reads the prior `known-failure` memory
  entry, emits an `expected` (the prior symptom, retrieved from
  memory), an `actual` (the current symptom, observed via the
  reproduction test failing), and a `validation` with
  `method: "contract_validation"`, `result: "match"` (the symptom
  matches the prior known-failure's symptom).
- **identify-reintroduction:** runs `git log <original-fix-commit>..HEAD
  -- src/membership/`, emits one `event` per commit (3 commits
  total: the refactor that extracted `parseExpiryDate`, a
  dependency bump, a test addition), emits a `decision` naming
  commit `abc1234` as the reintroduction (the refactor's "cleanup"
  reverted the boundary comparison from `<=` back to `<`).
- **re-diagnose:** emits a root-cause candidate `Decision` with
  `why` citing the prior fix's blind spot in the required shape:
  "the prior fix at `<original-fix-commit>` addressed the off-by-one
  symptom via the `<` → `<=` change, but did not account for the
  fact that the fix lived inside `validateMembership`'s inline
  date-parsing block rather than as a separate tested function;
  the reintroduction at commit `abc1234` re-exposed the edge case
  because the refactor that extracted `parseExpiryDate` did not
  preserve the boundary comparison. The re-fix must therefore
  extract `parseExpiryDate` AND add a boundary test in
  `parseExpiryDate`'s own test file."
- **re-fix:** blocked by safety gate until confirmed; emits the
  AI-proposal `Decision` (`validated: false`) and two
  `file_change` `Event`s (the helper source + the new helper test
  file).
- **verify:** re-runs the reproduction against the re-fixed code,
  emits `Actual` (boundary test now passes) + `Validation` with
  `method: "app_validation"`, `result: "match"`.
- **update-known-failure:** writes the prior `known-failure` entry
  back with `regression_id` flipped from `null` to
  `regression-membership-expiry-boundary-recurrence-1`; emits a
  `Decision` with `what: "regression_recorded"` referencing the
  prior `incident_ref` and the new evidence.
- **report:** writes a `project` memory entry recording the
  regression occurrence and resolution, terminal.

## What makes regression different (the architectural point)

Before this run, the repo's six e2e proofs covered five workflow
shapes:

- `bug-report` (reactive, fixes broken behavior)
- `feature-request` (constructive, adds new behavior)
- `code-review` (gatekeeping, read-only)
- `refactor` (behavior-preserving, negative contract)
- `change-request` (behavior-modifying, supersedes existing
  contract)

`regression` is the **sixth** shape — the only workflow that
**reads prior `known-failure` memory as its first step** rather
than writing new memory at the end. This requires three structural
features none of the other five workflows have:

1. **A `match-known-failure` state whose first action is a memory
   READ.** All other workflows either read `project` memory at
   `intake` (read-only context) or write memory at the terminal
   `report` state. `regression`'s `match-known-failure` state
   reads a prior `known-failure` entry and uses it to construct the
   `Expected` (the prior symptom) that the current symptom is
   matched against. This is the structural inverse of
   `bug-report`'s `regression-protect` state — that state WRITES a
   `known-failure` entry; this state READS one.

2. **A `re-diagnose` state whose `Decision.why` field MUST cite
   the prior fix's blind spot in a fixed shape.** The shape is:
   "the prior fix at `<commit>` addressed `<symptom>` via
   `<approach>`, but did not account for `<edge case>`; the
   reintroduction at `<commit>` re-exposed the edge case because
   `<reason>`. The re-fix must therefore `<what the re-fix does
   differently>`." A `re-diagnose` `Decision` whose `why` does
   not include this citation is a process violation of the
   `regression` skill — without the citation, the re-fix is just
   `bug-report` with a memory read at the start, which defeats the
   purpose of separating the workflows. The driver spot-checks
   the persisted `Decision.why` against all four clauses of the
   citation shape.

3. **An `update-known-failure` state that UPDATES an existing
   memory entry in place rather than creating a new one.** All
   other workflows that write memory create a new entry (new id,
   new fields). `regression`'s `update-known-failure` writes the
   prior entry back with `regression_id` flipped from `null` to
   a new `regression-<slug>` id — the only state in the catalog
   that performs an UPDATE. The `regression_id` field exists in
   `memory/schemas/known-failure.schema.json` for exactly this
   case; the schema description marks it as "Set if this failure
   has recurred (references an evidence/Regression entity,
   post-MVP)." This workflow activates that field.

The `Regression` evidence entity itself is post-MVP — it is listed
in `docs/evidence-model.md`'s core entities table but
`evidence/schema/` does not yet have a `regression.schema.json`
file. This workflow uses a `Decision` with `what:
"regression_recorded"` as the post-MVP stand-in, referencing the
prior `incident_ref` and the new evidence (`re-diagnose` Decision
id, `verify` Validation id) in `evidence_refs`. The
`regression_id` field on the updated `known-failure` entry is set
to a new `regression-<slug>` id (matching the evidence id pattern,
even though no schema file enforces it yet) — this is forward-
compatible with the eventual `Regression` schema.

The fact that the same executor runs all six workflows (bug-report,
feature-request, code-review, refactor, change-request, regression)
without code changes is the empirical proof of the "workflow-
agnostic executor" claim — now demonstrated across six structurally
distinct workflow shapes: reactive diagnostic, constructive
feature, gatekeeping review, behavior-preserving restructure,
behavior-modifying migration, and prior-context-aware re-diagnosis.
That's the architectural point of this proof.

## The blind-spot citation, concretely

The single most important assertion in this driver is the
`re-diagnose` `Decision.why` field's blind-spot citation. Without
it, `regression` would just be `bug-report` with a memory read at
the start — the citation is what makes the re-fix structurally
different from a re-application of the original fix. The driver
spot-checks all four clauses of the citation shape against the
persisted `Decision.why`:

1. **"the prior fix at `<commit>` addressed `<symptom>` via
   `<approach>`"** — names the prior fix, the symptom it addressed,
   and the approach it used.
2. **"but did not account for `<edge case>`"** — names what the
   prior fix missed (the blind spot).
3. **"the reintroduction at `<commit>` re-exposed the edge case
   because `<reason>`"** — names the reintroduction commit and
   the reason it re-exposed the edge case.
4. **"The re-fix must therefore `<what the re-fix does
   differently>`"** — names what the re-fix does differently
   from the prior fix.

In the scenario, the prior fix changed `<` to `<=` inline in
`validateMembership`. The blind spot was that the fix lived inside
the inline date-parsing block rather than as a separate tested
function — so when the refactor extracted `parseExpiryDate` and
"cleaned up" the comparison back to `<`, no test in the helper's
own file caught the revert (the regression guard was in
`tests/test_membership.py`, which the refactor didn't touch). The
re-fix therefore does TWO things: restores `<=` inside
`parseExpiryDate` AND adds a boundary test in
`src/membership/parsing.test.ts` (the helper's own test file), so
the boundary check is structurally coupled to the function that
owns the boundary, not to the broader caller. This is the
institutional learning that makes the second fix different in kind
from the first — and the citation is what forces the agent to
articulate it.
