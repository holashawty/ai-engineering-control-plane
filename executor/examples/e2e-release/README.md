# End-to-end run: release workflow (ship v1.4.0 to npm, signed tag, clean-env verification)

**This is the twelfth e2e proof point** in the repo, alongside the
eleven existing proofs. The first proved `bug-report.sm.yaml`
works end-to-end against a real (non-scripted) bug. The second
through eleventh proved the executor is **workflow-agnostic** —
structurally different workflows run through the same
`WorkflowRun` engine with zero code changes to the executor. This
one proves the same workflow-agnosticism for the **release**
shape — the only workflow in the catalog whose job is to bundle
already-made changes into a versioned artifact, rather than to
modify code.

## What this run is, and what it isn't

**Is:** a real, schema-valid end-to-end run through every state
of `release.sm.yaml`. Every `emitEvidence` call writes a JSON
file to disk that the executor's `EvidenceStore` validates
against the actual `evidence/schema/*.schema.json` files. Every
transition goes through the real `StateMachine.advance` and
`WorkflowRun.advance` (with safety gate enforcement).

**Isn't:** a recording of a live multi-turn agent session, AND
isn't an actual `npm publish` against a real registry. The
test counts, the advisory-lookup output, and the clean-env
install log are realistic but scripted. A live release
integration test (real `npm publish` against a sandbox registry
in a temp dir) is tracked as future work in `STATUS.md`.

## What makes release structurally different

`release` is triggered by "ship this" / "cut a release" /
"publish v1.4.0." This is distinct from:

- `change-request` — modify existing behavior. `release` does
  not write new code; it bundles already-made changes into a
  versioned artifact.
- `feature-request` — add a new capability. `release` does not
  add capabilities; it packages existing ones for distribution.
- `bug-report` — fix something broken. `release` assumes the
  fixes are already on main; it bundles them into a version.

The structural distinction that makes `release` a separate
workflow is **what the workflow produces**. The other workflows
produce code changes (and their evidence trails). `release`
produces a *versioned artifact*: a git tag, a registry
publication, a Docker image, a GitHub Release. The release's
*content* is the cumulative diff since the last release; the
release's *process* is the readiness check + test bar + changelog
+ tag + publish + verify sequence that makes the artifact
discoverable, installable, and trustworthy.

Four structural consequences follow from this distinction:

1. **The `broad-refactor` safety gate is at `tag`, not at
   `publish`.** Tagging is the irreversible-ish step: a
   published tag can be moved, but moving it leaves a
   fingerprint in any consumer's lockfile that pointed at the
   original. The gate fires at `tag` to require explicit human
   confirmation before that irreversible-ish step. (`publish`
   is technically also hard to undo — npm unpublish is allowed
   only within 72h of publish, and PyPI doesn't allow it at all —
   but the gate at `tag` catches the irreversible step *before*
   the publish attempt, so a release that fails the tag
   confirmation doesn't waste a registry publication slot.)
2. **The `verify-release` state uses a CLEAN-ENV install.**
   The dev-tree test suite at `run-tests` can pass while the
   published tarball is broken (a missing file in the `files`
   array, a transitive dependency that's a devDependency but
   should be a dependency). `verify-release` runs `npm install
   <pkg>@<version>` in a temp dir and imports the public API —
   the dev tree's `node_modules` masks these defects; the
   clean-env check catches them. Per ADR-0010, `unit_test` alone
   would be insufficient; the clean-env install is the direct
   behavioral check that the artifact is consumable.
3. **The changelog is a release artifact, not a commit log.**
   The `update-changelog` state emits a `Decision` recording
   the structure choice (Keep-a-Changelog vs flat-per-commit)
   so a future audit can reconstruct the rationale, AND an
   `Event` recording the changelog diff. The changelog rephrases
   commits into user-visible changes (Added / Changed /
   Deprecated / Removed / Fixed / Security per Keep-a-Changelog),
   because downstream consumers read the changelog to decide
   whether to upgrade — a flat commit log forces every consumer
   to diff the tag themselves.
4. **The `report` state records deferred security advisories.**
   If `check-readiness` found an open advisory below the
   project's declared fix-threshold (e.g., CVSS 5.3 in a
   devDependency), the release proceeds (the advisory doesn't
   block) but the `report` state's `project` memory entry
   records the advisory ID and CVSS score in its `domain` field.
   A silent release that ships a known-but-deferred vuln would
   be a disclosure violation; recording it makes the next
   security audit cycle aware.

## What the run proves

Run `node executor/examples/e2e-release/drive-run.mjs` and
observe the assertions passing. The interesting ones:

1. **Structural soundness.** `loadWorkflow` succeeds — every
   transition's `from`/`to` is in `states[]`, no non-terminal
   state is a dead end, all states are reachable from `intake`.
2. **End-to-end walk.** A single `WorkflowRun` walks `intake →
   classify → check-readiness → run-tests → update-changelog →
   tag → publish → verify-release → report`, emitting
   schema-valid evidence at every emitting state.
3. **Safety gate is workflow-agnostic.** The `broad-refactor`
   gate at the `tag` state blocks an un-confirmed advance out of
   `tag` (the executor throws `safety-gate-needs-confirmation`),
   then allows the same advance once `advanceWithConfirmation`
   is called. This is the same gate code `bug-report` exercises
   at `propose-fix`/`apply-fix`, `feature-request` exercises at
   `implement`, `refactor` exercises at `implement`,
   `change-request` exercises at `migrate`, `regression`
   exercises at `re-fix`, `user-complaint` exercises at
   `apply-fix`, and `security-problem` exercises at
   `apply-mitigation` — proving the gate logic is keyed off the
   workflow's `safety_gates` declaration, not hardcoded to any
   one workflow's specific states.
4. **Question economy with 1 allowed state.** The budget is
   `max_questions: 1, allowed_states: [classify]`. The driver
   asks one question in `classify` ("regular cut off main, or
   hotfix off v1.3.x?") — accepted. A question attempted in
   `publish` (not in `allowed_states`) is rejected with
   `question-economy-wrong-state`. This is the same budget
   shape as `bug-report`, `regression`, `user-complaint`, and
   `code-review`, but for a different structural reason: release
   is mechanically driven by the repo's own state rather than by
   design choices the way `feature-request` or `change-request`
   are.
5. **Readiness check produces a Trace with 5 Events.** Each
   readiness check (clean tree / branch up-to-date / no open
   advisories above threshold / dependencies frozen / test
   runner configured) is its own `Event` with `kind:
   "observation"` and a verbatim `source` citation. Per
   `tool-use-discipline`, no readiness assertion is made from
   memory.
6. **Release-bar test phase produces a Trace with 4 Events.**
   Each phase (unit / integration / contract / e2e) is its own
   `Event` with `kind: "test_result"` and the count + duration
   in `payload.note`. The release bar is the FULL suite, not
   the developer-tight subset.
7. **Changelog structure is a Decision.** The `update-changelog`
   state emits a `Decision` (`what:
   "changelog_structure:keep-a-changelog"`) recording the
   structure choice AND an `Event` (`kind: "file_change"`)
   recording the CHANGELOG.md diff. The structure choice is
   auditable; the diff is the user-visible artifact.
8. **Tag Event records signed-vs-unsigned.** The `tag` state's
   `Event` is `kind: "action"` with the tag command verbatim,
   the tag name, the commit it points at, and a `signed: true`
   flag (with the signing key fingerprint recorded for audit —
   the key itself is never persisted in evidence, only its
   fingerprint).
9. **Verify-release uses `method: "app_validation"`.** The
   clean-env install + import is the direct behavioral check
   that the published artifact is consumable. Per ADR-0010,
   `unit_test` alone would be insufficient — the dev-tree test
   suite can pass while the published tarball is broken. The
   `Validation` references both `Event`s (install + import) as
   `evidence_refs`.
10. **Memory update at terminal.** The `report` state writes a
    `project` memory entry recording the version, tag, registry
    URL, and any deferred advisory note (CVE ID + CVSS score)
    for the next security audit cycle.
11. **Disk persistence.** Evidence files actually land on disk
    under `evidence/<kind>/*.json` and `memory/<kind>/*.json` —
    the driver spot-checks several (the changelog structure
    `Decision`, the tag `Event` with `signed: true`, the
    `verify-release` `Validation` with `method:
    "app_validation"`, the `project` memory entry with the
    registry URL and deferred advisory note) to confirm they
    round-tripped through `JSON.stringify` without mutation.

## The scenario

A realistic release: *"ship v1.4.0"* (a minor release, npm
registry, GPG-signed tag). The driver models:

- **classify:** asks one decision-changing question ("regular
  cut off main, or hotfix off v1.3.x?") — the answer determines
  the branch the tag is created on. Emit the acceptance
  `Decision`.
- **check-readiness:** emits 5 `Event`s (clean tree, branch
  up-to-date, 1 advisory below threshold recorded but not
  blocking, dependencies frozen, vitest configured). All checks
  pass.
- **run-tests:** emits 4 `Event`s for the release bar (unit: 42
  passed, integration: 18 passed, contract: 7 passed, e2e: 5
  passed). All phases green.
- **update-changelog:** emits a `Decision` (`changelog_structure:
  keep-a-changelog`) and an `Event` with the CHANGELOG.md diff
  adding the v1.4.0 section (Added: tag filtering, /health
  endpoint; no breaking changes; deferred advisory noted).
- **tag:** blocked by safety gate until confirmed; emits an
  `Event` with `git tag -s v1.4.0 -m "Release v1.4.0"` after
  the confirmed advance. Tag is GPG-signed with the project's
  signing key (fingerprint recorded for audit; key not
  persisted).
- **publish:** emits an `Event` with `npm publish --access
  public --provenance` and the registry URL.
- **verify-release:** emits TWO clean-env `Event`s (install +
  import) and an `Actual` + `Validation` with `method:
  "app_validation"`, `result: "match"`.
- **report:** writes the `project` memory entry with the
  version, tag, registry URL, and deferred advisory note.
  Terminal.

## Why this matters (beyond "another test passes")

Before this run, the repo's eleven e2e proofs covered workflows
that all *modified code* in some way — fixing, adding,
changing, refactoring, reviewing, mitigating, onboarding. None
of them exercised the case where the workflow's job is to
*package* existing code into a versioned artifact. This is one
of the most common shapes of real engineering work (every
release, every publish, every cut) and one of the highest-stakes
(release failures can leave consumers with broken installs,
orphaned tags, or shipped-but-broken artifacts).

`release` covers this shape and exercises structural features
the first eleven did not: (a) the safety gate positioned at
`tag` (the irreversible-ish step) rather than at a code-change
state, (b) the clean-env verification step distinct from the
dev-tree test suite, (c) the changelog structure choice recorded
as a `Decision` for audit, and (d) the deferred-advisory note
in the `project` memory for the next security audit cycle.

The fact that the same executor runs all twelve workflows
without code changes is the empirical proof that the Evidence
Model's `Event` entity (with `kind: "action"` for the tag/publish
operations, `kind: "observation"` for the readiness checks,
`kind: "test_result"` for the test phases, `kind: "file_change"`
for the changelog) is flexible enough to represent release-
shaped operations alongside the code-change operations the
earlier workflows exercised.
