---
name: discovery-refresh
description: Use at the run-discovery, validate-discovery, update-project-memory, and update-environment-memory states of workflows/discovery-refresh.sm.yaml — refreshes a stale .aiecp/project-intelligence.json and UPDATES the existing project + environment memory entries in place (same ids, updated_at bumped, drifted fields overwritten) rather than creating new ones. Runs when the document is stale (not missing — that is project-onboarding's job). Novel to AIECP; no upstream equivalent found in docs/research.md.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# Discovery Refresh

## When to use this skill

At the `run-discovery`, `validate-discovery`,
`update-project-memory`, and `update-environment-memory` states
of `workflows/discovery-refresh.sm.yaml`. This skill is what
stands between "the existing `.aiecp/project-intelligence.json`
is `stale: true`" and "every subsequent workflow can trust that
the document is fresh and the `project` / `environment` memory
entries reflect the current state of the repo."

This is the **refresh counterpart** to `project-onboarding`. Per
`workflows/_router.md`'s classification method step 1: "Check
whether `.aiecp/project-intelligence.json` exists and is not
`stale: true`. If missing/stale → route to `project-onboarding`
first." That single sentence collapses two distinct cases: if the
document is *missing*, route to `project-onboarding` (which
CREATEs the initial memory entries); if the document is *stale*
(exists but `stale: true`), route to `discovery-refresh` (which
UPDATEs the existing memory entries in place). Conflating the two
cases would produce a different memory-entry shape — a fresh
`project` entry with a new id versus an `updated_at` bump on the
existing id — and the prior entry's `id` is what every downstream
workflow's `reads_memory: [project]` declaration points at, so
creating a fresh entry would orphan the prior one rather than
refreshing it.

**The structural distinction that makes this workflow separate
from `project-onboarding` is CREATE vs. UPDATE.** Project-onboarding
writes the initial memory entries (new ids, `created_at` set, no
`updated_at`). Discovery-refresh updates those same entries in
place (same ids, `updated_at` bumped on `project`, refreshed
`runtime` / `versions` on `environment`). The two workflows share
the same discovery procedure (canonical CLI + fallback), the same
two-state write shape (`update-project-memory` +
`update-environment-memory` mirror `project-onboarding`'s
`write-project-memory` + `write-environment-memory`), and the same
no-safety-gate declaration (both write only to `.aiecp/`, never to
source code). What differs is the *write semantics*: CREATE vs.
UPDATE.

**Anti-patterns that mean: stop and return to `intake`.**

- Running discovery-refresh against a repo where
  `.aiecp/project-intelligence.json` is MISSING. The refresh has
  no prior memory entries to UPDATE — `update-project-memory`
  would have to CREATE rather than UPDATE, which collapses
  discovery-refresh into project-onboarding while losing the
  CREATE-vs-UPDATE distinction. The correct routing is
  `project-onboarding`, not `discovery-refresh`. The `intake`
  state's acid test (does the document exist on disk AND have
  `stale: true`?) catches this.
- Running discovery-refresh against a repo where
  `.aiecp/project-intelligence.json` exists and is `stale: false`.
  Nothing needs refreshing — the document is current, the memory
  entries reflect the current state, no workflow should run. The
  `intake` state's acid test catches this too.
- Creating a new `project` memory entry with a fresh id (rather
  than updating the existing entry in place). This orphans the
  prior entry — every downstream workflow's `reads_memory:
  [project]` declaration would either read the orphaned prior
  entry (and miss the refresh) or read the new entry (and lose
  the prior `created_at` / `source` provenance). The
  `update-project-memory` state's procedure is explicit: same
  id, `updated_at` bumped, drifted fields overwritten.
- Overwriting `project` memory fields that did NOT drift. The
  UPDATE is field-level, not entry-level — a refresh that
  detects no structural change leaves `stack` / `layer` /
  `domain` untouched and only bumps `updated_at` (recording
  that the refresh ran and confirmed no drift). Overwriting
  unchanged fields with the same values is technically harmless
  but loses the "this field was confirmed, not changed" signal
  that the field-level UPDATE pattern preserves.
- Treating `update-environment-memory` as a no-op when no
  version drift is detected. Even when `versions` did not drift,
  the `os` / `arch` / `fingerprint_hash` fields may have (if
  the refresh ran on a different machine, or after a container
  rebuild). The state should always re-emit these fields with
  refreshed values, even if they happen to match the prior
  values — the refresh is the act of re-asserting the current
  environment, not just the act of changing it.

## Procedure

### 1. Run discovery (state: `run-discovery`)

Re-invoke `discovery/cli` (or the fallback procedure) to produce
a refreshed `.aiecp/project-intelligence.json`. The same two-path
shape as `project-onboarding`'s `run-discovery` (per ADR-0021):

#### Path A (PRIMARY) — canonical `discovery/cli` tool

```bash
# Run against the host repo — overwrites the existing
# .aiecp/project-intelligence.json (sets stale: false, bumps
# generated_at). Works in offline sandboxes because dist/ is
# committed (per ADR-0021).
node discovery/cli/dist/cli.js /path/to/host/repo

# Dry run — validate and print, don't write (useful for
# validate-discovery when you want to inspect the refreshed
# document before persisting)
node discovery/cli/dist/cli.js /path/to/host/repo --dry-run
```

The CLI runs ADR-0009's detector pipeline (language, framework,
build, test, entrypoint, layer, integration, cicd) — same as on
the initial onboarding run. For each detector that ran, emit one
`Event` with `kind: "action"`, `source: "discovery/cli:<detector
name>"`, and `payload.finding` describing what was detected on
*this refresh run*. Wrap these in a single `Trace` covering the
refresh run, so the detector sequence is citable as a unit and the
eventual `report` state can include the refresh trail in the
decision trace.

Transition to `validate-discovery` on `discovery_complete` after
this path.

#### Path B (FALLBACK) — text discovery procedure (per ADR-0021)

Use this path when Path A fails or is unavailable (no Node.js
runtime, `discovery/cli/dist/` missing or stale, `node
discovery/cli/dist/cli.js` errored for any reason). Follow the
procedure in
[`skills/project-onboarding/discovery-fallback.md`](../project-onboarding/discovery-fallback.md)
— the same 8-step procedure used for the initial onboarding. For
each step of the fallback procedure, emit one `Event` with `kind:
"action"`, `source: "discovery-fallback:step-N"`.

Transition to `validate-discovery` on
`discovery_complete_via_fallback` after this path.

#### Failure handling

If neither path succeeds (Path A errored AND Path B cannot
complete because essential marker files are missing), transition
to `blocked` with `on: discovery_failed` and a precise gap
statement — never a vague "discovery didn't work." The blocked
report should name which path was tried, what error occurred, and
what essential information is missing. Critically, the blocked
report should also note that the prior stale document remains on
disk with `stale: true` — every downstream workflow that reads it
should treat it as untrusted per the schema's `stale` field
description.

**Per `skills/tool-use-discipline/SKILL.md`**: discovery is a
tool-driven activity. Do not guess at the refreshed stack from
memory of "what the repo looked like last time" — invoke the CLI
(Path A) or follow the procedure (Path B) and let the
detectors/markers tell you. Per
`skills/recency-verification/SKILL.md` step 2, the version probes
the CLI runs (`python --version`, `node --version`,
language-appropriate equivalents) are time-sensitive claims about
the current environment — let the tool produce them, do not assert
them from memory.

### 2. Validate discovery (state: `validate-discovery`)

Validate the refreshed Project Intelligence against the schema AND
against the prior document to determine what actually drifted.
Per ADR-0009, each detector's output is a fragment of Project
Intelligence that must validate against
`discovery/schema/project-intelligence.schema.json`. The CLI itself
validates before writing — if the document failed schema validation,
`run-discovery` would have transitioned to `blocked` already. This
state's job is the *semantic* validation: did the detectors pick up
the *right* tools on this refresh, AND what fields drifted relative
to the prior document?

Emit three evidence artifacts:

1. **`Expected`** describing what a schema-valid Project
   Intelligence document for this repo's class (per the `classify`
   decision: structure-changed / versions-drifted / both) should
   contain. For a structure-changed refresh: `project.stack` /
   `project.layer` may differ from the prior document. For a
   versions-drifted refresh: `project.versions` may differ. For
   both: any field may differ. The `source_ref` should point at
   the schema (`discovery/schema/project-intelligence.schema.json`)
   since this Expected is derived from the contract the document
   must honor. `predicate_kind: "behavioral"` is fine here — the
   schema describes behavioral properties of the document.

2. **`Actual`** describing what `discovery/cli` actually produced
   on this refresh run. The `observed_value` is a summary of the
   persisted refreshed `.aiecp/project-intelligence.json`:
   detected stack, detected test system, detected entrypoints,
   detected capabilities. The `observation_ref` should point at
   the `Event` from `run-discovery` whose `payload.finding`
   corroborates the observation.

3. **`Validation`** comparing `Actual` against `Expected` with
   `method: "contract_validation"`. This is a schema/contract
   check, not a behavioral check — same method as
   `project-onboarding`'s `validate-discovery`. Set `result:
   "match"` if the refreshed document validates against both the
   JSON Schema AND the per-class Expected (the detected tools are
   the right tools). Set `result: "mismatch"` if a detector picked
   up the wrong tool.

Note: this state is NOT in `allowed_states` (only `classify` is),
so any question asked here would be a constitution violation. The
question budget for discovery-refresh is 1 total (in `classify`),
not 2 (unlike project-onboarding's classify + validate-discovery
budget of 2). The lower budget reflects that discovery-refresh
starts from prior context (the existing memory entries + the stale
Project Intelligence), so less ambiguity needs resolving than a
fresh onboarding.

**Failure handling:** if the refreshed document fails the per-class
Expected (a detector picked up the wrong tool), transition back to
`run-discovery` with `on: discovery_invalid_needs_rerun` rather
than accepting a wrong Project Intelligence document. A wrong
refreshed document poisons every downstream workflow just as much
as a wrong initial document would — catching the mismatch here,
in `validate-discovery`, is structurally cheaper than discovering
it three workflows later.

### 3. Update project memory (state: `update-project-memory`)

UPDATE the existing `project` memory entry in place. Per
`memory/schemas/project.schema.json`, the entry has an optional
`updated_at` field (null when first written by `project-onboarding`,
set to a date-time when the entry is updated). This state
activates that field.

1. Read the existing `project` memory entry (via
   `filesystem_read`) — the entry's `id` is what every
   downstream workflow's `reads_memory: [project]` declaration
   points at, so the UPDATE must preserve the `id` exactly.
   Per `tool-use-discipline` and constitution §8, never recall
   the prior entry from memory — read it from disk.
2. Determine which fields drifted per the `validate-discovery`
   `Actual`:
   - If `project.stack` differs from the prior entry's `stack`,
     overwrite `stack` with the refreshed value.
   - If `project.layer` differs, overwrite `layer`.
   - If `project.domain` no longer accurately describes the repo
     (e.g., a new endpoint was added, a layer was removed),
     overwrite `domain` with a refreshed one-line description.
   - If no fields drifted (the refresh confirmed no structural
     change), leave `stack` / `layer` / `domain` untouched.
3. Set `updated_at` to the current timestamp (the prior value,
   if any, is overwritten — `updated_at` records the *most recent*
   refresh, not the history of refreshes; the audit trail of
   refreshes lives in the evidence chain, not in the memory
   entry's fields).
4. Preserve `id`, `type`, `schema_version`, `created_at`,
   `source` exactly as they were. The `source` field records
   which run *first wrote* the entry (typically
   `project-onboarding-run-1`); the refresh does NOT change
   `source` — the entry's provenance is the original onboarding,
   not the most recent refresh.
5. Write the updated entry back to the memory store (via
   `filesystem_write` — overwriting the prior entry in place at
   the same `memory/project/<id>.json` path).

**Why this state UPDATES rather than CREATEs.**
`project-onboarding`'s `write-project-memory` CREATEs the initial
`project` entry (new id, `created_at` set, no `updated_at`).
`discovery-refresh`'s `update-project-memory` UPDATEs that same
entry in place (same id, `updated_at` bumped, drifted fields
overwritten). This is the structural distinction that makes
discovery-refresh a separate workflow from project-onboarding:
the CREATE-vs-UPDATE semantics. Per `docs/memory-model.md` ("Set
on onboarding, versioned on structural change"), this is the
"versioned on structural change" step — the entry's `id` and
`created_at` are immutable from onboarding onward; only
`updated_at` and the drifted fields change.

### 4. Update environment memory (state: `update-environment-memory`)

UPDATE the existing `environment` memory entry in place. Per
`memory/schemas/environment.schema.json`, the entry has no explicit
`updated_at` field (unlike `project`); the refresh is recorded by
overwriting the `runtime` and `versions` fields with the refreshed
values.

1. Read the existing `environment` memory entry (via
   `filesystem_read`) — same `id`-preservation rule as
   `update-project-memory`.
2. Capture the refreshed `runtime` and `versions` from the
   `discovery/cli` output and from direct `shell_exec` probes
   (`python --version`, `node --version`, language-appropriate
   version queries per `skills/recency-verification/SKILL.md`
   step 2). REDACT any secret-shaped env var before writing —
   same redaction rule as `project-onboarding`'s
   `write-environment-memory`.
3. Overwrite `runtime` and `versions` with the refreshed values
   (even if they happen to match the prior values — the refresh
   is the act of re-asserting the current environment, not just
   the act of changing it).
4. Optionally refresh `os`, `arch`, `fingerprint_hash` if they
   drifted (e.g., the refresh ran on a different machine, or
   after a container rebuild). If they did not drift, overwrite
   with the same values (re-asserting the current environment).
5. Preserve `id`, `type`, `schema_version`, `created_at`,
   `source` exactly as they were — same provenance-preservation
   rule as `update-project-memory`.
6. Write the updated entry back to the memory store (via
   `filesystem_write` — overwriting the prior entry in place at
   the same `memory/environment/<id>.json` path).

This entry is kept separate from `project` memory because the two
have different change rates (per `docs/memory-model.md`): `project`
records what the repo IS (structural, slow-changing — stack, layer,
domain), while `environment` records HOW it was built this run
(versions, runtime — fast-changing, refreshed on every environment
change). A discovery-refresh run that detects only version drift
(no structural change) would leave `update-project-memory` as a
near-no-op (only `updated_at` bumped) while `update-environment-memory`
overwrites `versions` substantially — the two states are separate
so the structural vs. environment distinction is preserved in the
memory write pattern, not just in the schema.

## Tool integration

- **`shell_exec`**: invoke `discovery/cli` (`node dist/cli.js
  <repo-path>` from `discovery/cli/`), invoke version probes
  (`python --version`, `node --version`, `pip show <package>`,
  `npm ls <package>`, `go version`, `cargo --version`, etc.). The
  CLI's stdout/stderr is captured as `Event.payload.finding`
  verbatim — do not paraphrase it, the next state's `Actual` needs
  to cite what the CLI actually said.
- **`filesystem_read`**: read the prior `project` and `environment`
  memory entries (mandatory per constitution §8 — never recall
  from training-data memory); read the stale
  `.aiecp/project-intelligence.json` to determine what fields are
  likely to have drifted; read the host repo's structure to
  determine refresh class in `classify`; read the refreshed
  `.aiecp/project-intelligence.json` after `run-discovery` writes
  it, so `validate-discovery` can compare the Actual against the
  Expected.
- **`filesystem_write`**: write the refreshed
  `.aiecp/project-intelligence.json` (the CLI does this itself
  when not in `--dry-run` mode); write the UPDATED `project` and
  `environment` memory entries back to `.aiecp/memory/<type>/`
  (overwriting the prior entries in place, NOT creating new ones
  with fresh ids). All writes are to `.aiecp/`, never to source
  code.

## Validation (of this skill itself)

A `run-discovery` / `validate-discovery` / `update-project-memory`
/ `update-environment-memory` step using this skill is done
correctly only if:

- At least one `Event` of `kind: "action"` with `source: "discovery/
  cli:<detector_name>"` (or `source: "discovery-fallback:step-N"`
  for the fallback path) was emitted for each detector/step that
  ran on this refresh (per `tool-use-discipline`, no detector
  result is asserted from memory).
- The `validate-discovery` `Validation.method` is
  `"contract_validation"` (NOT `"unit_test"` — that would be wrong
  for a schema/contract check; NOT `"app_validation"` — that's for
  behavior; NOT `"manual_review"` — that's for human review). Same
  canonical method as `project-onboarding`'s `validate-discovery`.
- The `update-project-memory` step wrote an UPDATED `project`
  memory entry whose `id` matches the prior entry's `id` exactly
  (not a new id), `updated_at` is set to the current timestamp
  (previously `null` if this is the first refresh, or previously
  a prior timestamp if this is a subsequent refresh), `created_at`
  is preserved exactly, `source` is preserved exactly, and
  whichever fields drifted per `validate-discovery` (`stack` /
  `layer` / `domain`) are overwritten with the refreshed values.
  Fields that did NOT drift are preserved verbatim.
- The `update-environment-memory` step wrote an UPDATED
  `environment` memory entry whose `id` matches the prior entry's
  `id` exactly, `runtime` and `versions` are overwritten with the
  refreshed values (even if they match the prior values), `os` /
  `arch` / `fingerprint_hash` are refreshed if they drifted, and
  `versions` contains no secret-shaped values (per
  `evidence-engineering` step 4's redaction rule).
- No question was asked during `run-discovery`,
  `validate-discovery`, `update-project-memory`, or
  `update-environment-memory` — these states are not in
  `discovery-refresh.sm.yaml`'s `question_economy.allowed_states`
  (only `classify` is). Asking a question here is a constitution
  violation, not a stylistic choice (per
  `constitution/constitution.md` §4).
- The skill was NOT applied to a repo where
  `.aiecp/project-intelligence.json` is missing — that case is
  `project-onboarding`, not `discovery-refresh`. The `intake`
  state's acid test (does the document exist on disk AND have
  `stale: true`?) catches this; if you find yourself running
  discovery-refresh against a repo with no prior document, stop
  and reroute to project-onboarding.

## Examples

**Happy path (versions-drifted refresh):** A Python+pytest
membership service was onboarded three months ago via
`project-onboarding` (which wrote
`mem-project-membership-service-2026-08-14` with `stack=["python"]`,
`layer=["backend"]`, `domain="Python membership service with pytest
test suite"`, `updated_at: null`, and
`mem-environment-membership-service-2026-08-14` with
`runtime="python3.11"`, `versions={"pytest": "8.1.2", "python":
"3.11.7"}`). Since then, the team bumped pytest to 8.2.0 and
Python to 3.12.0. A downstream `bug-report` workflow's `intake`
state reads `project-intelligence.json` and notices `stale: true`
(the discovery-refresh trigger set the flag — perhaps a watcher
process noticed `pyproject.toml`'s modification time is newer than
`generated_at`). Routes to `discovery-refresh`. → `classify` reads
the existing `project` + `environment` memory entries and the
stale `project-intelligence.json`; the kind of drift is
versions-drifted (no structural change — `pyproject.toml`'s
`[tool.poetry]` and `[tool.pytest.ini_options]` sections are
unchanged, only the version pins bumped). No question needed —
the drift class is unambiguous from inspection. Emits a `Decision`
(`acceptance:proceed_with_refresh`, scope=versions-drifted). →
`run-discovery` invokes `node discovery/cli/dist/cli.js`, the CLI's
8 detectors run; for each, emit one `Event` of `kind: "action"`
with `source: "discovery/cli:<detector>"` and `payload.finding`
describing what was detected on this refresh run. Wrap in a
`Trace`. → `validate-discovery` emits `Expected` (Python stack,
pytest test system, versions may differ from prior), `Actual`
(stack=['python'], test_system=['pytest'], versions={pytest:
8.2.0, python: 3.12.0} — refreshed values), `Validation` with
`method: "contract_validation"`, `result: "match"` (the document
validates against the schema AND matches the per-class Expected).
→ `update-project-memory` reads
`mem-project-membership-service-2026-08-14`, sets `updated_at:
"2026-11-14T10:00:00Z"`, preserves `stack` / `layer` / `domain`
(no structural change — they did not drift), preserves `id` /
`type` / `schema_version` / `created_at` / `source`, writes the
updated entry back to `memory/project/mem-project-membership-service-
2026-08-14.json`. → `update-environment-memory` reads
`mem-environment-membership-service-2026-08-14`, overwrites
`runtime: "python3.12"` and `versions: {pytest: "8.2.0", python:
"3.12.0"}`, preserves `id` / `type` / `schema_version` /
`created_at` / `source`, writes the updated entry back. → `report`
summarizes: drift class=versions-drifted, what was refreshed
(`environment.versions` + `environment.runtime`; `project.updated_at`
bumped, no field changes), the document is now `stale: false` with
bumped `generated_at`. No new memory entries created — the prior
entries were updated in place.

**Failure mode (structure-changed refresh, blocked because
discovery failed):** A polyglot repo (Python+pytest in `backend/`,
TypeScript+vitest in `frontend/`) was onboarded six months ago.
Since then, the team added a Rust `worker/` crate for batch
processing — a structural change. The watcher process noticed
`Cargo.toml` appeared and set `stale: true`. Routes to
`discovery-refresh`. → `classify` reads the existing memory
entries; the kind of drift is structure-changed (a new
`Cargo.toml` appeared at the repo root, indicating a new language
was added). Asks the one allowed question ("is the Rust `worker/`
crate part of this repo's contract, or is it a vendored
dependency?") — user confirms it's part of the repo. Emits a
`Decision` (scope=structure-changed, new-stack=rust). →
`run-discovery` tries `node discovery/cli/dist/cli.js` — but the
Rust detector is missing from the CLI (the CLI version is older
than the new stack); the CLI errors. Tries the fallback procedure
— but the Rust marker file (`Cargo.toml`) is not in the fallback
procedure's marker table (the table was authored before Rust
support was added). Both paths fail. Transition to `blocked` with
`on: discovery_failed` and a precise gap: "the canonical CLI
errored because the Rust detector is missing; the fallback
procedure cannot complete because `Cargo.toml` is not in its
marker table. The prior stale document remains on disk with
`stale: true` — every downstream workflow that reads it should
treat it as untrusted. To resolve: either upgrade `discovery/cli`
to a version that includes a Rust detector, or manually produce
a refreshed `.aiecp/project-intelligence.json` with the Rust stack
added, then re-run discovery-refresh." The blocked report is
actionable — the user can see exactly what to do next, and the
stale document's `stale: true` flag remains to warn downstream
workflows that the document is untrusted.

**Happy path (no-drift refresh — refresh confirmed no drift):**
The same Python+pytest membership service from the first example,
six months later. The watcher process noticed `.aiecp/
project-intelligence.json`'s `generated_at` is older than the
repo's `pyproject.toml` modification time and set `stale: true`.
Routes to `discovery-refresh`. → `classify` reads the existing
memory entries; the kind of drift is unclear from inspection
(`pyproject.toml` was modified — maybe versions bumped, maybe
just a comment change). No question needed — the refresh will
determine whether anything actually drifted. Emits a `Decision`
(scope=unknown, proceed to refresh). → `run-discovery` invokes
the CLI; the detectors run. → `validate-discovery` emits `Expected`
+ `Actual` + `Validation` with `result: "match"` — the refreshed
document matches the prior document field-by-field (the
`pyproject.toml` modification was just a comment change, no
versions bumped, no structure changed). → `update-project-memory`
reads the prior entry, sets `updated_at` to the current timestamp,
preserves all other fields (nothing drifted), writes the entry
back. → `update-environment-memory` reads the prior entry,
re-asserts `runtime` and `versions` with the same values (no
drift), writes the entry back. → `report` summarizes: drift
class=no-drift (the refresh ran and confirmed the prior memory
entries are still current), the document is now `stale: false`
with bumped `generated_at`. This is a valid refresh outcome —
running the refresh and confirming nothing drifted is just as
legitimate as running it and detecting drift; the `updated_at`
bump records that the refresh ran and the prior values were
re-confirmed.
