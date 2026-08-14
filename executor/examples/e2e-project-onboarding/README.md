# End-to-end run: project-onboarding workflow (onboard clean Python+pytest repo)

**This is the seventh e2e proof point** in the repo, alongside
`executor/examples/e2e-membership-bug/` (bug-report),
`executor/examples/e2e-feature-request/` (feature-request),
`executor/examples/e2e-code-review/` (code-review),
`executor/examples/e2e-refactor/` (refactor),
`executor/examples/e2e-change-request/` (change-request), and
`executor/examples/e2e-chat-adapter/` (chat adapter). The first six
proved the executor handles five structurally distinct workflows
(reactive, constructive, gatekeeping, behavior-preserving,
behavior-modifying) plus a chat-LLM text-protocol adapter. This one
proves the executor handles the **entry-point workflow** of the catalog:
the one that, unlike every other workflow, *writes* the initial memory
entries that all other workflows *read*.

## What makes project-onboarding structurally different

Every other workflow in the catalog declares `reads_memory: [project]`
(or similar) in its `intake` state — its very first state assumes that
`.aiecp/project-intelligence.json` exists and that a `project` memory
entry has already been written. That assumption is what
`workflows/_router.md`'s classification method step 1 enforces: "Check
whether `.aiecp/project-intelligence.json` exists and is not `stale:
true`. If missing/stale → route to `project-onboarding` first."

`project-onboarding` is the workflow that runs when that check fails.
It is structurally distinct from every other workflow in three ways:

1. **It WRITES the initial memory entries that all other workflows
   READ.** Every other e2e driver in this repo writes a single
   memory entry at its terminal `report` state (a `project` entry
   for feature-request / refactor / code-review; a `known-failure`
   entry for bug-report and change-request). `project-onboarding`
   writes **two** memory entries at **two dedicated pre-report
   states** (`write-project-memory` writes the `project` entry;
   `write-environment-memory` writes the `environment` entry), and
   the `report` state itself writes nothing — the entries are
   already on disk by the time the run reaches `report`. The
   entries written here are what the next workflow run's `intake`
   state will read; if they're wrong, every downstream workflow
   inherits the wrongness.
2. **It has no prior memory to read.** `intake` declares no
   `reads_memory` (the project is new — there is nothing to read).
   This is the only workflow in the catalog with this property;
   every other workflow's `intake` reads at least the `project`
   memory entry to ground itself in what the repo is.
3. **It has no safety gate.** Like `code-review`, `project-onboarding`
   declares no `safety_gates` — but for a different reason.
   `code-review` is read-only by design (it produces a `Validation`
   but applies no patch). `project-onboarding` *does* write to disk,
   but only to `.aiecp/` (the AIECP memory directory) — never to
   source code. The `broad-refactor` gate is not appropriate
   (discovery doesn't refactor anything; it reads the repo and
   writes a sibling metadata file). The `edit_source` gate is not
   appropriate (no source files are edited). The e2e driver asserts
   this by checking the run log has zero `gate-check` entries and
   that every `advance()` call returned `gateDecision: undefined`.

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`project-onboarding.sm.yaml`. Every `emitEvidence` call writes a JSON
file to disk that the executor's `EvidenceStore` validates against the
actual `evidence/schema/*.schema.json` files — a schema violation
would throw before the file is written. Every transition goes through
the real `StateMachine.advance` and `WorkflowRun.advance`. The two
`writeMemory` calls validate against `memory/schemas/project.schema.
json` and `memory/schemas/environment.schema.json` respectively.

**Isn't:** a recording of a live multi-turn agent session, AND it
isn't an actual invocation of `discovery/cli` against a real on-disk
repo. The scenario data (the 8 detector findings, the version probe
results, the produced Project Intelligence summary) is realistic but
scripted. A live discovery integration test (CLI shelled out against
a toy repo in a temp dir, with `discovery/cli`'s real output captured
as `Event.payload.finding` rather than scripted) is tracked as future
work in `STATUS.md` — see "open questions" there. The same honest
scope note as `executor/examples/e2e-feature-request/README.md`
applies: a driver script assembling realistic data is not yet a live
agent session.

## What the run proves

Run `node executor/examples/e2e-project-onboarding/drive-run.mjs` and
observe 30+ assertions passing across three scenarios. The
interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal state
   is a dead end, all states are reachable from `intake`.
2. **End-to-end walk (happy path).** A single `WorkflowRun` walks
   `intake → classify → run-discovery → validate-discovery →
   write-project-memory → write-environment-memory → report`,
   emitting schema-valid evidence at every emitting state. Seven
   transitions; six non-terminal emitting states + one terminal.
3. **No safety gate fires.** The workflow declares no `safety_gates`
   (writes only to `.aiecp/`, never to source code). The run log
   has zero `gate-check` entries AND every `advance()` call
   returned `gateDecision: undefined` — proving the executor's gate
   logic correctly skips enforcement when no gates are declared.
   This is the same structural property `code-review` exercises,
   for a different reason (see "What makes project-onboarding
   structurally different" above).
4. **Question economy with two allowed states.** The budget is
   `max_questions: 2, allowed_states: [classify, validate-discovery]`.
   The driver asks one question in `classify` ("is this a
   monorepo?") and one in `validate-discovery` ("is pytest the
   detected test runner correct?") — both accepted. A third
   question, attempted in `write-project-memory` (NOT in
   `allowed_states`), is rejected with `question-economy-wrong-
   state`. A fourth assertion (in a fresh run) confirms a third
   question in `validate-discovery` IS rejected as
   `question-economy-exceeded` (budget exhausted) — the wrong-state
   rejection only fires when the state itself is disallowed, not
   when the budget is exhausted.
5. **Validation method is contract_validation.** The
   `validate-discovery` state emits a `Validation` with `method:
   "contract_validation"` — the canonical method for schema/contract
   checks (per `evidence/schema/validation.schema.json`'s method
   enum). This is NOT `app_validation` (which is for behavior, per
   `behavioral-verification`), NOT `unit_test` (which is for a
   test suite), and NOT `manual_review` (which is for human review).
   The `contract_validation` method is named specifically for
   "checking against a declared contract" — which is exactly what
   `validate-discovery` does (the contract being
   `discovery/schema/project-intelligence.schema.json`).
6. **Detector Events emitted with the right source pattern.** The
   `run-discovery` state emits one `Event` per detector that ran
   (8 detectors per ADR-0009: language, framework, build, test,
   entrypoint, layer, integration, cicd). Each `Event` has
   `kind: "action"`, `source: "discovery/cli:<detector_name>"` —
   exactly what `skills/tool-use-discipline/SKILL.md` step 4
   requires for tool invocations. The 8 events are wrapped in a
   single `Trace` so the detector sequence is citable as a unit.
7. **TWO memory entries written at dedicated pre-report states.**
   `write-project-memory` writes the initial `project` memory
   entry (`memory/schemas/project.schema.json` shape); `write-
   environment-memory` writes the initial `environment` memory
   entry (`memory/schemas/environment.schema.json` shape). Both
   persist to disk under `memory/<type>/*.json` and round-trip
   through `JSON.stringify` without mutation. This is the ONLY
   workflow in the catalog that writes initial memory entries —
   every other workflow either writes a final summary memory at
   `report` (feature-request, refactor, code-review) or a
   `known-failure` memory at `report`/`regression-protect`
   (bug-report, change-request).
8. **`report` writes no new memory.** Unlike every other workflow's
   `report` state, `project-onboarding`'s `report` writes nothing
   — the `project` and `environment` entries were already written
   by the preceding two states. Writing a third here would
   duplicate the `project` entry this run just created.
9. **Disk persistence.** Evidence files actually land on disk under
   `evidence/<kind>/*.json` and `memory/<kind>/*.json` — the driver
   spot-checks several (the `Validation` with `method:
   contract_validation`; the `project` memory entry with
   `stack=["python"]`; the `environment` memory entry with
   `versions.pytest="8.1.2"`; the acceptance `Decision` with
   `result=accepted`) to confirm they round-tripped through
   `JSON.stringify` without mutation.

## The scenarios

### Scenario 1 (happy path): onboard clean Python+pytest repo

A realistic onboarding: the router detects no
`.aiecp/project-intelligence.json` and routes to `project-onboarding`.
The repo is the same "membership-service" toy repo used in
`executor/examples/e2e-membership-bug/` (Python, pytest, poetry, single
main entrypoint at `src/membership.py`, GitHub Actions CI). The driver
models:

- **classify:** filesystem inspection finds a single top-level
  `pyproject.toml` (no `packages/` or `apps/` directory), but the
  onboarding class is still ambiguous (single-package vs. monorepo
  is a real distinction that determines what discovery should
  expect). Asks the one allowed question ("is this a monorepo?")
  — user confirms single-package. Emits a `Decision` (acceptance:
  proceed with onboarding, scope = single-package Python repo).
- **run-discovery:** invokes `discovery/cli` (scripted; in a real
  run this would be `node dist/cli.js <repo-path>` from
  `discovery/cli/`). Each of the 8 ADR-0009 detectors runs and
  emits its own `Event` of `kind: "action"` with `source:
  "discovery/cli:<detector_name>"`. The 8 events are wrapped in a
  single `Trace`. Discovery succeeds — all detectors produced
  findings, the produced document validates against the schema.
- **validate-discovery:** emits an `Expected` (per-class contract:
  Python stack, pytest test system, main entrypoint), an `Actual`
  (summary of what the CLI produced: stack=['python'],
  test_system=['pytest'], entrypoints=[src/membership.py]), and a
  `Validation` with `method: "contract_validation"`, `result:
  "match"`. Asks the one allowed question ("is pytest the detected
  test runner correct?") — user confirms yes.
- **write-project-memory:** writes the initial `project` memory
  entry (`mem-project-membership-service-2026-08-14`) with
  `stack=["python"]`, `layer=["backend"]`, `domain="Python
  membership service with pytest test suite..."`. This is the
  FIRST `project` memory entry for this repo.
- **write-environment-memory:** writes the initial `environment`
  memory entry (`mem-environment-membership-service-2026-08-14`)
  with `runtime="python3.11"`, `versions={"python": "3.11.7",
  "pytest": "8.1.2", "poetry": "1.8.3"}`, `os="linux-x64"`. This
  is the FIRST `environment` memory entry for this repo.
- **report:** terminal. Summarizes the discovery trail and the two
  memory writes; writes no new memory (the entries are already on
  disk).

### Scenario 2 (question-economy wrong-state): fresh run

A minimal scenario: walk the workflow to `write-project-memory` (which
is NOT in `allowed_states`), then attempt to ask a question there.
The question is rejected with `question-economy-wrong-state`. A fresh
run is used so the budget-exhausted check (which fires first in
scenario 1's third question, if it were attempted in `classify` or
`validate-discovery`) does not mask the wrong-state check.

### Scenario 3 (question-economy exceeded): fresh run

Another minimal scenario: walk the workflow with two questions already
asked (one in `classify`, one in `validate-discovery` — both
accepted), then attempt a third question in `validate-discovery`. The
third question is rejected with `question-economy-exceeded` (budget
exhausted — `validate-discovery` IS in `allowed_states`, so the
wrong-state check does not fire first). This is the alternative
third-question rejection path the spec mentions ("third rejected") —
here rejected for the budget reason rather than the wrong-state
reason.

## Why this matters (beyond "another test passes")

`bug-report` covers reactive agent work (diagnose → fix → verify).
`feature-request` covers constructive work (design → implement →
verify). `code-review` covers gatekeeping work (assess → review →
approve/block). `refactor` covers behavior-preserving work
(capture-baseline → design → implement → verify-equivalence).
`change-request` covers behavior-modifying work (understand-current
→ design-change → migrate → verify).

`project-onboarding` covers the **zeroth** kind of agent work: the
work that runs *before any of the above can run*. Without
`.aiecp/project-intelligence.json` and the initial memory entries,
every other workflow's `intake` state would have nothing to read —
its `reads_memory: [project]` declaration would point at a memory
entry that doesn't exist. This is the workflow that produces that
entry. It is the entry point of the workflow catalog in the most
literal sense: the router's classification method step 1 explicitly
routes to `project-onboarding` first when no prior memory exists,
and only routes to the other workflows once project-onboarding has
run successfully.

The structural feature this driver proves that no prior driver proved:
**the same executor that runs workflows which READ memory can also
run a workflow that WRITES the initial memory entries.** The
`EvidenceStore` validates both evidence artifacts AND memory entries
on write (per `executor/src/evidence-store.ts`'s `writeMemory`
method); the `WorkflowRun.writeMemory` API is symmetric with
`emitEvidence`. The fact that this works without code changes to the
executor is the empirical proof that the Memory Model's eight types
were designed as first-class artifacts from the start, not bolted on
after the Evidence Model was built. Every workflow in the catalog
either reads memory (and depends on this one having written it),
writes memory (as this one does, and as `report` states in other
workflows do), or both. This driver proves the write-only-at-intake
shape works as cleanly as the read-at-intake shape all other drivers
exercise.

The second structural feature this driver proves: **a workflow can
declare no safety gates AND still produce meaningful side effects**
(writing two memory entries and a `.aiecp/project-intelligence.json`
document to disk). The `code-review` workflow is the other no-gate
workflow, but it's read-only — it produces a `Validation` and writes
no memory. `project-onboarding` writes to disk in two distinct states
without declaring any gate, and the executor's gate logic correctly
skips enforcement because there's no gate to enforce. The gate
machinery is workflow-declaration-driven, not unconditional — same
property `code-review` proved, here extended to a workflow that
*does* write to disk (just not to source code).

## Running it yourself

```bash
cd executor
npm install && npm run build
cd examples/e2e-project-onboarding
node drive-run.mjs
```

The "host repo" being onboarded (the `membership-service` Python+pytest
repo) is described in the script's comments and `Event.payload.finding`
strings — it is not actually created on disk in this driver (a live
discovery integration test that does create it on disk and shell out
to `discovery/cli` is tracked as future work in `STATUS.md`). The
scenario data is realistic enough to exercise every state and every
evidence/memory schema the real run would exercise.
