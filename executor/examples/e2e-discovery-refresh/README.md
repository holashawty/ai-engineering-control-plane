# End-to-end run: discovery-refresh workflow (refresh stale membership-service Project Intelligence — versions-drifted)

**This is the tenth e2e proof point** in the repo, alongside
`executor/examples/e2e-membership-bug/` (bug-report),
`executor/examples/e2e-feature-request/` (feature-request),
`executor/examples/e2e-code-review/` (code-review),
`executor/examples/e2e-refactor/` (refactor),
`executor/examples/e2e-change-request/` (change-request),
`executor/examples/e2e-chat-adapter/` (chat adapter),
`executor/examples/e2e-project-onboarding/` (project-onboarding),
`executor/examples/e2e-regression/` (regression),
`executor/examples/e2e-performance-problem/` (performance-problem),
and `executor/examples/e2e-unknown-failure/` (unknown-failure). The
first ten proved the executor handles ten structurally distinct
workflows (reactive, constructive, gatekeeping, behavior-preserving,
behavior-modifying, onboarding, prior-context-aware, cost-shaped,
fallback-routing) plus a chat-LLM text-protocol adapter. This one
proves the executor handles the **refresh counterpart** to
project-onboarding: the workflow that, unlike project-onboarding
(which CREATEs initial memory entries), UPDATEs existing memory
entries in place.

## What makes discovery-refresh structurally different

`project-onboarding` and `discovery-refresh` share the same
discovery procedure (canonical CLI + fallback), the same two-state
write shape (`update-project-memory` + `update-environment-memory`
mirror `project-onboarding`'s `write-project-memory` +
`write-environment-memory`), and the same no-safety-gate declaration
(both write only to `.aiecp/`, never to source code). What differs
is the **write semantics**: CREATE vs. UPDATE.

1. **discovery-refresh UPDATES existing memory entries in place.**
   `project-onboarding` writes the initial `project` + `environment`
   memory entries (new ids, `created_at` set, no `updated_at` on
   `project`). `discovery-refresh` updates those same entries in
   place (same ids, `updated_at` bumped on `project`, refreshed
   `runtime` + `versions` on `environment`). The `project` entry's
   `id` is what every downstream workflow's `reads_memory: [project]`
   declaration points at — creating a fresh entry with a new id would
   orphan the prior one rather than refreshing it. This is the
   structural distinction that makes discovery-refresh a separate
   workflow from project-onboarding.
2. **discovery-refresh preserves provenance.** The `created_at` and
   `source` fields of the updated entries are preserved exactly —
   they record the *original onboarding run*, not the most recent
   refresh. The refresh is recorded by `updated_at` (on `project`)
   and by the field-level overwrites (on `environment`); the
   provenance of the entry's creation is immutable from onboarding
   onward. This is the "set on onboarding, versioned on structural
   change" lifecycle rule from `docs/memory-model.md`.
3. **discovery-refresh has no safety gate.** Like `code-review`,
   `project-onboarding`, and `unknown-failure`, `discovery-refresh`
   declares no `safety_gates` — for the same reason as
   `project-onboarding` (writes only to `.aiecp/`, never to source
   code). The e2e driver asserts this by checking the run log has
   zero `gate-check` entries and that every `advance()` call
   returned `gateDecision: undefined`.

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state of
`discovery-refresh.sm.yaml`. Every `emitEvidence` call writes a JSON
file to disk that the executor's `EvidenceStore` validates against
the actual `evidence/schema/*.schema.json` and `memory/schemas/*.schema.json`
files — a schema violation would throw before the file is written.
Every transition goes through the real `StateMachine.advance` and
`WorkflowRun.advance`. The two `writeMemory` calls (with the same ids
as the prior entries) validate against `memory/schemas/project.schema.json`
and `memory/schemas/environment.schema.json` respectively — proving
the UPDATE-in-place semantics produce schema-valid entries (the
schemas permit `updated_at` on `project`, and the `environment` schema
has no `updated_at` field by design).

**Isn't:** a recording of a live multi-turn agent session, AND it
isn't an actual invocation of `discovery/cli` against a real on-disk
repo with a stale `project-intelligence.json`. The scenario data
(the 8 detector findings on the refresh run, the version probe
results, the prior memory entries) is realistic but scripted — the
prior memory entries are embedded as JS objects in the driver rather
than read from `.aiecp/memory/` on disk, so the driver is
self-contained. A live refresh integration test (CLI shelled out
against a toy repo with a stale document in a temp dir, with
`discovery/cli`'s real output captured as `Event.payload.finding`
rather than scripted) is tracked as future work in `STATUS.md`. The
same honest scope note as
`executor/examples/e2e-feature-request/README.md` applies.

## What the run proves

Run `node executor/examples/e2e-discovery-refresh/drive-run.mjs`
and observe 35+ assertions passing across three scenarios. The
interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal state
   is a dead end, all states are reachable from `intake`.
2. **End-to-end walk (happy path).** A single `WorkflowRun` walks
   `intake → classify → run-discovery → validate-discovery →
   update-project-memory → update-environment-memory → report`,
   emitting schema-valid evidence at every emitting state. Seven
   transitions; six non-terminal emitting states + one terminal.
3. **No safety gate fires.** The workflow declares no `safety_gates`
   (writes only to `.aiecp/`, never to source code — same as
   `project-onboarding`). The run log has zero `gate-check` entries
   AND every `advance()` call returned `gateDecision: undefined` —
   proving the executor's gate logic correctly skips enforcement
   when no gates are declared. This is the same structural property
   `code-review`, `project-onboarding`, and `unknown-failure`
   exercise.
4. **Question economy with one allowed state.** The budget is
   `max_questions: 1, allowed_states: [classify]`. The happy-path
   scenario asks one question in `classify` ("did the runtime
   version change on purpose, or is this drift from a dependency
   bump?") — accepted, budget exhausted. A second question,
   attempted in `update-project-memory` (NOT in `allowed_states`),
   is rejected with `question-economy-wrong-state`. A third
   assertion (in a fresh run) confirms a second question in
   `classify` itself IS rejected as `question-economy-exceeded`
   (budget exhausted) — the wrong-state rejection only fires when
   the state itself is disallowed, not when the budget is
   exhausted. The budget is 1 (not 2 like `project-onboarding`'s)
   because discovery-refresh starts from prior context — the
   existing memory entries + the stale Project Intelligence document
   reduce the ambiguity that a fresh onboarding faces.
5. **Validation method is contract_validation.** The
   `validate-discovery` state emits a `Validation` with `method:
   "contract_validation"` — the canonical method for schema/contract
   checks (same as `project-onboarding`'s `validate-discovery`). This
   is NOT `app_validation` (which is for behavior), NOT `unit_test`
   (which is for a test suite), and NOT `manual_review` (which is
   for human review).
6. **Detector Events emitted with the right source pattern.** The
   `run-discovery` state emits one `Event` per detector that ran
   on the refresh (8 detectors per ADR-0009: language, framework,
   build, test, entrypoint, layer, integration, cicd). Each `Event`
   has `kind: "action"`, `source: "discovery/cli:<detector_name>"` —
   exactly what `skills/tool-use-discipline/SKILL.md` step 4
   requires for tool invocations. The 8 events are wrapped in a
   single `Trace` (with an additional version-probe `Event` for
   the refreshed runtime/versions).
7. **TWO memory entries UPDATED in place at dedicated pre-report
   states.** `update-project-memory` writes the `project` memory
   entry back with the SAME id as the prior entry (UPDATE, not
   CREATE); `update-environment-memory` writes the `environment`
   memory entry back with the SAME id. Both persist to disk under
   `memory/<type>/<id>.json` — same path as the prior entries would
   have lived at. The driver spot-checks the persisted entries to
   confirm UPDATE-in-place semantics held.
8. **`project` memory entry preserves provenance.** The `created_at`
   and `source` fields of the updated `project` entry are preserved
   exactly — they record the *original onboarding run*, not the most
   recent refresh. The refresh is recorded by `updated_at` (flipped
   from `null` to a timestamp). The `id` is also preserved (same
   `mem-project-...` id as the prior entry). This is the "set on
   onboarding, versioned on structural change" lifecycle rule from
   `docs/memory-model.md`.
9. **`environment` memory entry overwrites `runtime` + `versions`.**
   The updated `environment` entry has refreshed `runtime='python3.12'`
   (was `'python3.11'`) and refreshed `versions.pytest='8.2.0'` (was
   `'8.1.2'`) and `versions.python='3.12.0'` (was `'3.11.7'`). The
   `environment` schema has no `updated_at` field (unlike `project`);
   the refresh is recorded by the field-level overwrites themselves.
   The `id`, `type`, `schema_version`, `created_at`, `source`, and
   `os` are all preserved exactly.
10. **`report` writes no new memory.** Like `project-onboarding`'s
    `report` state, `discovery-refresh`'s `report` writes nothing
    — the `project` and `environment` entries were already updated
    by the preceding two states. Writing a third here would
    duplicate the entries this run just updated.
11. **Disk persistence.** Evidence files actually land on disk under
    `evidence/<kind>/*.json` and `memory/<kind>/*.json` — the driver
    spot-checks several (the `Validation` with `method:
    contract_validation`; the updated `project` memory entry with
    same id + `updated_at` flipped; the updated `environment` memory
    entry with refreshed `runtime` + `versions`; the acceptance
    `Decision` with `result=accepted`) to confirm they round-tripped
    through `JSON.stringify` without mutation.

## The scenario

The natural sequel to `executor/examples/e2e-project-onboarding/`:

> "the membership-service repo's `.aiecp/project-intelligence.json`
> is stale — pytest bumped to 8.2.0, Python to 3.12.0. Refresh it."

Three months ago, the original `project-onboarding` run wrote
`mem-project-membership-service-2026-08-14` (stack=['python'],
layer=['backend'], domain='Python membership service with pytest
test suite, poetry build system, single main entrypoint at
src/membership.py', updated_at=null) and
`mem-environment-membership-service-2026-08-14`
(runtime='python3.11', versions={python: '3.11.7', pytest: '8.1.2',
poetry: '1.8.3'}). Since then, the team bumped pytest to 8.2.0 and
Python to 3.12.0 — a versions-drifted refresh (no structural
change). A downstream workflow's `intake` state reads
`project-intelligence.json` and notices `stale: true`. Routes to
`discovery-refresh`. The driver models:

- **classify:** reads the prior `project` + `environment` memory
  entries and the stale `project-intelligence.json`. The kind of
  drift is versions-drifted (no structural change — `pyproject.toml`'s
  `[tool.poetry]` and `[tool.pytest.ini_options]` sections are
  unchanged in structure, only version pins bumped). Asks the one
  allowed question ("did the runtime version change on purpose, or
  is this drift from a dependency bump?") — user answers
  "dependency bump" (so `update-environment-memory` overwrites both
  `runtime` and `versions`, since the Python runtime itself bumped).
  Emits a `Decision` (acceptance: proceed with refresh, scope=
  versions-drifted, alternatives structure-changed and both
  rejected).
- **run-discovery:** invokes `discovery/cli` (scripted; in a real
  run this would be `node dist/cli.js <repo-path>` from
  `discovery/cli/`). Each of the 8 ADR-0009 detectors runs and
  emits its own `Event` of `kind: "action"` with `source:
  "discovery/cli:<detector_name>"`. The 8 events + 1 version-probe
  `Event` are wrapped in a single `Trace`. Discovery succeeds — all
  detectors produced findings, the refreshed document validates
  against the schema.
- **validate-discovery:** emits an `Expected` (per-class contract
  for a versions-drifted refresh: stack unchanged, layer unchanged,
  test_system unchanged, but versions.pytest='8.2.0' and
  versions.python='3.12.0' refreshed, runtime='python3.12' refreshed),
  an `Actual` (summary of what the CLI produced on this refresh
  run: stack=['python'] matches prior, layer=['backend'] matches
  prior, but versions refreshed), and a `Validation` with `method:
  "contract_validation"`, `result: "match"`. No second question
  needed (the budget is 1, not 2 like project-onboarding's).
- **update-project-memory:** writes the `project` memory entry
  back with the SAME id as the prior entry (`mem-project-
  membership-service-2026-08-14`), `updated_at` flipped from `null`
  to `"2026-11-14T10:00:00Z"`, `created_at` + `source` + `stack` +
  `layer` + `domain` all preserved (no structural drift). This is
  an UPDATE, not a CREATE — the entry's id and provenance are
  immutable from onboarding onward.
- **update-environment-memory:** writes the `environment` memory
  entry back with the SAME id as the prior entry (`mem-environment-
  membership-service-2026-08-14`), `runtime` refreshed from
  `'python3.11'` to `'python3.12'`, `versions` refreshed (`pytest`
  from `'8.1.2'` to `'8.2.0'`, `python` from `'3.11.7'` to `'3.12.0'`,
  `poetry` unchanged at `'1.8.3'`), `created_at` + `source` + `os`
  preserved. This is an UPDATE, not a CREATE.
- **report:** terminal. Summarizes the refresh outcome: drift class
  = versions-drifted, what was refreshed (`environment.versions` +
  `environment.runtime`; `project.updated_at` bumped, no field
  changes), the document is now `stale: false` with bumped
  `generated_at`. Writes no new memory.

## What makes discovery-refresh different (the architectural point)

Before this run, the repo's ten e2e proofs covered nine workflow
shapes:

- `bug-report` (reactive, fixes broken behavior)
- `feature-request` (constructive, adds new behavior)
- `code-review` (gatekeeping, read-only)
- `refactor` (behavior-preserving, negative contract)
- `change-request` (behavior-modifying, supersedes existing
  contract)
- `project-onboarding` (entry-point, CREATEs initial memory)
- `regression` (prior-context-aware, UPDATEs known-failure memory
  in place — one entry, one field: `regression_id`)
- `performance-problem` (cost-shaped, "it's slow")
- `unknown-failure` (fallback, routes to another workflow)

`discovery-refresh` is the **tenth** shape — the only workflow
besides `regression` that **UPDATEs existing memory in place**, and
the only workflow that UPDATEs TWO memory entries in a single run
(`project` + `environment`). This requires three structural features
that, in combination, no other workflow in the catalog has:

1. **A `update-project-memory` state whose action is a memory UPDATE
   with the same id as the prior entry.** `project-onboarding`'s
   `write-project-memory` CREATEs the initial entry (new id);
   `regression`'s `update-known-failure` UPDATEs an existing entry
   in place (same id, `regression_id` flipped). `discovery-refresh`'s
   `update-project-memory` is the second workflow in the catalog
   that UPDATEs in place — but it updates TWO fields (`updated_at`
   + drifted fields), where `regression` updates one field
   (`regression_id`). The structural pattern is the same; the
   field-level scope is broader.
2. **A `update-environment-memory` state whose action is a memory
   UPDATE with the same id as the prior entry.** This is the only
   workflow in the catalog that UPDATEs an `environment` entry —
   `project-onboarding` CREATEs the initial entry; no other workflow
   touches `environment` memory at all. The `environment` schema
   has no `updated_at` field (unlike `project`), so the refresh is
   recorded by overwriting `runtime` + `versions` themselves (even
   when matching prior values would be harmless — the refresh is
   the act of re-asserting the current environment).
3. **A two-state pre-report write shape that mirrors
   `project-onboarding`'s `write-project-memory` + `write-environment-
   memory` shape, but with UPDATE semantics instead of CREATE.** The
   state names differ (`update-*` vs. `write-*`) to make the
   semantic distinction explicit; the transitions are symmetric
   (`update-project-memory → update-environment-memory → report` vs.
   `write-project-memory → write-environment-memory → report`). The
   driver asserts both states write to disk and that the persisted
   entries have the same ids as the prior entries — proving the
   UPDATE-in-place semantics held, not just the CREATE-new-id
   semantics that project-onboarding's driver proved.

The fact that the same executor runs both `project-onboarding`
(CREATE) and `discovery-refresh` (UPDATE) without code changes is
the empirical proof that the executor's `writeMemory` API is
opt-in per state, not differentiated by workflow. The
`EvidenceStore.writeMemory` function writes to
`memory/<type>/<id>.json` — the path is determined by the entry's
`id` field, not by whether the workflow is creating or updating.
This means a workflow that wants to UPDATE in place simply calls
`writeMemory` with the same id as the prior entry; the file is
overwritten. A workflow that wants to CREATE calls `writeMemory`
with a fresh id; a new file is created. The distinction is in the
data, not in the API — which is exactly the design property that
lets the same executor run both workflows without specialization.

The architectural point of this proof: **the workflow catalog's
CREATE-vs-UPDATE distinction is enforced by the workflow's state
machines and skill procedures, not by the executor's API.** The
executor's `writeMemory` is unopinionated about whether the write
is a CREATE or an UPDATE; the workflow's `state_detail.<state>.
writes_memory` declaration and the skill's procedure (which specifies
"same id" vs. "new id") are what enforce the distinction. This is
the same design property that lets `regression`'s
`update-known-failure` state UPDATE the `known-failure` entry
without code changes to the executor. `discovery-refresh` extends
this property to TWO memory types (`project` + `environment`) in a
single workflow — the only workflow in the catalog that updates
two memory types in one run.

## Running it yourself

```bash
cd executor
npm install && npm run build
cd examples/e2e-discovery-refresh
node drive-run.mjs
```

The "host repo" being refreshed (the `membership-service`
Python+pytest repo) is described in the script's comments and
`Event.payload.finding` strings — it is not actually created on disk
in this driver (a live refresh integration test that does create it
on disk, writes a stale `project-intelligence.json`, and shells out
to `discovery/cli` to refresh it is tracked as future work in
`STATUS.md`). The scenario data is realistic enough to exercise
every state and every evidence/memory schema the real run would
exercise.
