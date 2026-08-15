---
name: release
description: Use at the check-readiness, run-tests, update-changelog, tag, publish, and verify-release states of workflows/release.sm.yaml — when the user wants to ship a versioned artifact ("ship this", "cut a release", "publish v1.4.0"). Includes semver shape classification, full-suite release-bar testing, Keep-a-Changelog drafting, signed-tag creation, registry publication, and clean-env installability verification. Novel to AIECP; no upstream equivalent found in docs/research.md.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Release

## When to use this skill

At the `check-readiness`, `run-tests`, `update-changelog`, `tag`,
`publish`, and `verify-release` states of
`workflows/release.sm.yaml`. This skill is what stands between
"the user said ship v1.4.0" and "a versioned artifact is
published to the registry, tagged in git, installable in a clean
environment, and verified to import and call its declared public
API."

The structural distinction that makes this workflow separate from
`change-request` (which also modifies code) is **what the workflow
produces**. `change-request` modifies the system's behavior in
place. `release` does not write new code — it bundles
already-made changes into a versioned artifact (a tag, a registry
publication, a Docker image, a GitHub Release). The release's
*content* is the cumulative diff since the last release; the
release's *process* is the readiness check + test bar + changelog
+ tag + publish + verify sequence that makes the artifact
discoverable, installable, and trustworthy.

**Anti-patterns that mean: stop and return to `check-readiness`.**

- Releasing with an uncommitted working tree. "I'll commit after
  the release" is exactly backwards: the release tag will point
  at a commit that doesn't include the uncommitted change, and
  the change is lost from the artifact's history. Resolve the
  uncommitted state (commit, stash, or discard) BEFORE the
  release.
- Releasing with an open security advisory below the project's
  declared fix-threshold. "It's only CVSS 5.3, we'll fix it
  next sprint" may be the right call — but the release report
  must *record* the open advisory so downstream consumers can
  self-assess. A silent release that ships a known-but-deferred
  vuln is a disclosure violation.
- Skipping the changelog because "nothing user-visible changed."
  If nothing user-visible changed, the changelog says "no
  user-visible changes (internal refactor)" — the empty changelog
  is itself a release artifact that downstream consumers use to
  skip the upgrade. An absent changelog forces every consumer to
  diff the tag themselves.
- Skipping the clean-env install verification because "the tests
  passed in the dev tree." The dev tree has devDependencies, dev
  tooling, local caches, and `.env` files that mask packaging
  defects (a missing file in the published tarball, a transitive
  dependency that's a devDependency but should be a dependency).
  The clean-env check catches these — the dev-tree tests do not.
- Moving a published tag. Technically possible (`git tag -f`),
  but every consumer who already pulled the tag has the original
  commit in their lockfile, and a moved tag silently breaks their
  reproducibility. If a tag needs to move, the right move is a
  new tag (v1.4.1) and a retraction notice for the original.
- Releasing on a Friday afternoon without an on-call rotation.
  Not a constitution rule, a craft rule — releases that go out
  before a weekend have the worst time-to-rollback because the
  on-call may be slower to respond. The `report` state can flag
  this; the workflow does not block on it.

## Procedure

### 1. Check readiness (state: `check-readiness`)

Verify the repository is in a releasable state. Emit a `Trace`
of `Event`s, one per readiness check:

1. **Working tree clean** — `Event` with `kind: "observation"`,
   `source: "git status --porcelain"`, `payload.finding` quoting
   the output (must be empty for a clean tree).
2. **Branch up to date** — `Event` with `kind: "observation"`,
   `source: "git fetch && git status -sb"`, `payload.finding`
   confirming the branch is not `behind` the remote.
3. **No open security advisories below the fix-threshold** —
   `Event` with `kind: "observation"`, `source:
   "advisory-lookup:project-policy"` (or `npm audit --json` /
   `pip-audit --json` / `safety check --json`), `payload.finding`
   listing each open advisory with its CVE id, CVSS score, and
   whether it's above or below the project's declared fix-
   threshold (per `security-problem.sm.yaml`'s CVSS scoring).
   An advisory above the threshold MUST be resolved before
   release (route back to `security-problem`); an advisory below
   the threshold is recorded but does not block.
4. **Dependency versions frozen** — `Event` with `kind:
   "observation"`, `source: "filesystem_read: lockfile"`,
   `payload.finding` confirming no SNAPSHOT / dev / latest tags
   in the lockfile.
5. **Test runner configured** — `Event` with `kind:
   "observation"`, `source: "project-intelligence.json:
   test_system"`, `payload.finding` confirming the project's
   declared test runner (vitest / jest / pytest / cargo test)
   and that the release-bar test phases (per `run-tests` below)
   are configured.

Per `skills/tool-use-discipline/SKILL.md`, each check is a tool
invocation whose output becomes an `Event.payload.finding` — no
readiness assertion is made from memory.

**Failure handling:** if ANY check fails, transition to
`blocked` with `on: readiness_failed` and a precise gap citing
the failed check. Do not proceed to `run-tests` against an
unready repo — the test bar's pass/fail signal is meaningless if
the working tree is dirty or the branch is behind.

### 2. Run tests (state: `run-tests`)

Run the FULL test suite as a release bar — not just the
developer-tight subset. The release bar typically includes tests
that are slow (integration, end-to-end, contract) and are skipped
during normal development. The phases are determined by Project
Intelligence's `test.phases` (or the workflow's default: unit →
integration → contract → end-to-end).

Emit a `Trace` with one `Event` per test phase:

- `kind: "test_result"`, `source: "<test-runner-invocation>"`
  (e.g., `"npm test --silent"` for unit, `"npm run test:integration
  --silent"` for integration).
- `payload.result: "passed" | "failed"`.
- `payload.note`: count and duration (e.g., `"42 passed, 0 failed
  in 8.3s"`).
- `payload.phase`: which release bar phase this was (unit /
  integration / contract / e2e), for the eventual report's
  decision trace.

Per `behavioral-verification`, a green test suite is necessary
but not sufficient — `verify-release` later directly checks the
published artifact is installable and importable in a clean
environment, because the dev-tree tests can pass while the
packaged artifact is broken (a missing file in the tarball, a
transitive dependency that's a devDependency but should be a
dependency).

**Failure handling:** if any phase fails, transition to
`blocked` with `on: tests_fail` and a precise gap citing the
failing test (file, name, assertion line). Do not proceed to
`update-changelog` against a red suite.

### 3. Update changelog (state: `update-changelog`)

Update the user-facing changelog with the changes since the last
release. The changelog is a release artifact, not a commit log.

**The structure choice:** the project's changelog follows either
the Keep-a-Changelog convention (grouped by Added / Changed /
Deprecated / Removed / Fixed / Security) or a flat-list-per-commit
convention. The choice is recorded as a `Decision` (`what:
"changelog_structure:keep-a-changelog"` or `"changelog_structure:
flat-per-commit"`) so a future audit can reconstruct the rationale
and so a future release can follow the same convention without
re-deriving it.

The CHANGELOG.md content itself is recorded as an `Event` (`kind:
"file_change"`, `source: "CHANGELOG.md"`, `payload.diff_summary`
with the new section added under the version heading). The diff
is the artifact; the prose is what the user sees.

**Ambiguity handling:** if the changelog cannot be drafted
unambiguously — two changes overlap (a refactor that's also a
behavior change), a deprecation note is unclear (deprecated
since when?), the user-facing impact of an internal refactor is
ambiguous (does it change a public API?) — transition to
`blocked` with `on: changelog_ambiguous` and a precise gap. Do
not silently guess the changelog structure; downstream consumers
read it.

### 4. Tag (state: `tag`)

Create the release tag. Per `constitution/safety-rules.md`,
tagging is a destructive-operation class: published tags can be
moved, but moving them leaves a fingerprint in any consumer's
lockfile that pointed at the original.

**The broad-refactor safety gate fires here.** Per
`workflows/release.sm.yaml`'s `safety_gates` declaration, the
`tag` state requires explicit confirmation before the tag is
created. The executor throws `safety-gate-needs-confirmation`
on `advance()` without confirmation; `advanceWithConfirmation()`
proceeds.

Emit an `Event` (`kind: "action"`) capturing the tag command:

- Signed tag (preferred for projects that sign releases per
  Project Intelligence `release.signing`):
  `git tag -s v1.4.0 -m "Release v1.4.0"`. The signing key must
  be available in the agent's GPG agent / SSH agent / etc.
- Unsigned tag (for projects that don't sign):
  `git tag -a v1.4.0 -m "Release v1.4.0"`.

The `Event.payload` should record the tag command verbatim, the
tag name, the commit it points at, and whether the tag is signed.
A future audit can verify the tag's signature from this record.

**Failure handling:** if the tag fails to create (the tag already
exists, the signing key is missing, the branch is detached),
transition to `blocked` with `on: tag_failed` and a precise gap.
The "tag already exists" case is common when retrying a release
after a partial failure — the right move is to delete the
existing tag (if it hasn't been published yet) or to bump the
version (if it has).

### 5. Publish (state: `publish`)

Publish the versioned artifact to the declared registry (per
Project Intelligence `release.registry`). Emit an `Event` (`kind:
"action"`) capturing:

- The publish command (`npm publish --access public`, `twine
  upload dist/*`, `docker push <repo>:<tag>`, `gh release create
  v1.4.0 --notes-file CHANGELOG.md`).
- The registry URL.
- The output (success message with the URL, or the error).

Per `skills/recency-verification/SKILL.md`, the declared
registry's current publish protocol is time-sensitive:

- `npm publish` recently added `--provenance` for supply-chain
  attestation; check the project's policy and Project
  Intelligence for whether provenance is required.
- `twine` 5+ requires API tokens (password auth was removed);
  check the project's `~/.pypirc` configuration.
- `docker push` may require `docker buildx` for multi-arch
  builds; check the project's `Dockerfile` and CI for the
  expected architecture matrix.

**Failure handling:** if the publish fails (network, auth,
rate-limit, version-already-exists in the registry), transition
to `blocked` with `on: publish_failed` and a precise gap. The
version-already-exists case is common when retrying — the right
move is to bump the version (never re-publish the same version
to most registries; npm and PyPI both reject re-publication of
the same version, by design).

For chat-LLM agents without `shell_exec` + `filesystem_write`,
transition to `blocked` with `on: requires_publish_capability`
— the prepared release plan (changelog draft, tag name, publish
command, registry URL) is handed back to the user, who can drive
the remaining steps via a tool-using agent. Honest fallback, not
a fabricated "published."

### 6. Verify release (state: `verify-release`)

Behavioral verification per ADR-0010 — the published artifact
must be installable and importable in a CLEAN environment (not
the dev tree). The dev tree has devDependencies, dev tooling,
local caches, and `.env` files that mask packaging defects; the
clean-env check catches these.

Emit a `Trace` with two `Event`s:

1. **Clean-env install** — `Event` with `kind: "observation"`,
   `source: "mktemp -d && cd <tmp> && npm install
   <pkg>@<version>"` (or the language equivalent: `python -m
   venv /tmp/venv && /tmp/venv/bin/pip install <pkg>==<version>`,
   `docker pull <repo>:<tag>`). `payload.finding`: the install
   output, confirming success or citing the error.
2. **Clean-env import** — `Event` with `kind: "observation"`,
   `source: "node -e \"const { foo } = require('<pkg>'); foo();\""`
   (or `python -c "from <pkg> import foo; foo()"`,
   `docker run --rm <repo>:<tag> <entrypoint>`). `payload.finding`:
   the import output, confirming the public API is callable.

Emit an `Actual` (what the published artifact actually does when
installed cleanly) and a `Validation` with `method:
"app_validation"` (this is a behavioral check on the published
artifact, not just "the publish command exited 0"). Per
ADR-0010, `unit_test` alone would be insufficient — the
clean-env install is the direct behavioral check that the
artifact is consumable.

**Failure handling:** if the install or import fails, transition
to `blocked` with `on: release_unverified` and a precise gap
(the error message from the clean-env install). The release is
NOT shippable — even though the publish succeeded, the artifact
is broken from the consumer's perspective. The right move is
typically: yank the broken version (if the registry supports it),
fix the packaging defect, bump the version, re-release.

## Tool integration

- **`shell_exec`**: run the readiness checks (`git status`,
  `git fetch`, `npm audit`, `pip-audit`), run the test suite
  (`npm test`, `pytest`, `cargo test`), create the tag (`git
  tag -s`), publish (`npm publish`, `twine upload`), run the
  clean-env install (`mktemp -d && npm install <pkg>@<version>`).
  Each command's output becomes an `Event.payload.finding` —
  verbatim, not paraphrased.
- **`filesystem_read`**: read the lockfile for the dependency-
  versions-frozen check, read the changelog for the structure
  check, read Project Intelligence for the declared registry /
  signing policy / test runner.
- **`filesystem_write`**: write the updated CHANGELOG.md (the
  changelog state's `Event` records the diff; the actual write
  is via filesystem_write), write a temp file for the clean-env
  install verification.
- **`test_runner`**: structured access to test results for the
  release-bar test phases. Per `behavioral-verification`,
  `test_runner`'s pass/fail signal is necessary-but-not-sufficient
  — the clean-env install in `verify-release` is the direct
  behavioral check.

## Validation (of this skill itself)

A `check-readiness` / `run-tests` / `update-changelog` / `tag` /
`publish` / `verify-release` step using this skill is done
correctly only if:

- The `check-readiness` state emitted at least one `Event` per
  readiness check (clean tree / branch up-to-date / no open
  advisories / dependencies frozen / test runner configured),
  each `kind: "observation"` with a verbatim `source` citation.
- The `run-tests` state emitted one `Event` per test phase, each
  `kind: "test_result"` with `payload.result: "passed"` (or
  `failed` with the failing test cited).
- The `update-changelog` state emitted BOTH a `Decision`
  recording the structure choice (`keep-a-changelog` vs
  `flat-per-commit`) AND an `Event` of `kind: "file_change"`
  recording the changelog diff.
- The `tag` state's `Event` is `kind: "action"` with the tag
  command verbatim and the signed-vs-unsigned flag recorded.
  The broad-refactor safety gate fired (the run log has a
  `gate-check` entry for the `tag` state).
- The `publish` state's `Event` is `kind: "action"` with the
  publish command verbatim, the registry URL, and the success
  or failure output.
- The `verify-release` state emitted TWO `Event`s (clean-env
  install + clean-env import) and a `Validation` with `method:
  "app_validation"`. A green test suite alone does NOT earn
  `result: "match"` here — the clean-env check is required.
- No question was asked during `check-readiness`, `run-tests`,
  `update-changelog`, `tag`, `publish`, or `verify-release` —
  these states are not in `release.sm.yaml`'s
  `question_economy.allowed_states` (only `classify` is).

## Examples

**Happy path (minor release v1.4.0):** User requests "ship
v1.4.0" → `classify` reads Project Intelligence (version policy:
semver, registry: npm, signing: GPG-signed tags), the diff since
v1.3.0 (new features added, no breaking changes — minor bump is
correct), no question needed → `check-readiness` emits 5
`Event`s (clean tree, branch up-to-date, no open advisories
above threshold, dependencies frozen, vitest configured) →
`run-tests` emits 4 `Event`s (unit: 42 passed, integration: 18
passed, contract: 7 passed, e2e: 5 passed) → `update-changelog`
emits a `Decision` (`changelog_structure:keep-a-changelog`) and
an `Event` with the CHANGELOG.md diff adding the v1.4.0 section
under Added/Changed/Fixed → `tag` fires the broad-refactor gate,
confirmed via `advanceWithConfirmation`, emits an `Event` with
`git tag -s v1.4.0 -m "Release v1.4.0"` → `publish` emits an
`Event` with `npm publish --access public --provenance` and the
registry URL → `verify-release` emits two `Event`s (clean-env
`npm install pkg@1.4.0` in a temp dir succeeded; clean-env
`node -e "const { foo } = require('pkg'); foo();"` succeeded)
and a `Validation` with `method: "app_validation"`, `result:
"match"` → `report` writes a `project` memory entry recording
the version, tag, date, channel, and registry URL.

**Failure mode (release unverified — broken tarball):** User
requests "ship v2.0.0" → readiness OK, tests pass, changelog
drafted, tag created, publish to npm succeeds → `verify-release`
runs `npm install pkg@2.0.0` in a temp dir (succeeds — the
tarball downloads), then `node -e "const { newApi } =
require('pkg'); newApi();"` — which fails with "Cannot find
module 'pkg/dist/new-api'" because the package.json's `files`
array omitted `dist/new-api.js` from the published tarball →
transition to `blocked` with `on: release_unverified` and a
precise gap: "the clean-env import fails with 'Cannot find
module pkg/dist/new-api'; the package.json `files` array
includes `dist/**/*.js` patterns but the publish step appears
to have stripped `dist/new-api.js`; recommendation: yank
v2.0.0 from npm (npm unpublish pkg@2.0.0 within 72h of publish),
add `dist/new-api.js` to the `files` array explicitly, bump to
v2.0.1, re-release." The blocked state's report is structured
so the user can act on it directly without re-investigating.

**Failure mode (chat LLM without publish capability):** A
chat-driven agent (per `CHAT-ENTRYPOINT.md`, pure-text adapter)
reaches `publish` after drafting the changelog, but has no
`shell_exec` and no `filesystem_write` capability. → The
transition `publish → blocked on: requires_publish_capability`
fires → the `blocked` state's report includes: the prepared
CHANGELOG.md draft (as the `update-changelog` `Event`'s
`payload.diff_summary`), the tag command the user should run
(`git tag -s v1.4.0 -m "Release v1.4.0"`), the publish command
(`npm publish --access public --provenance`), and the
verification commands the user should run after publish (the
two `verify-release` `Event` commands). Honest fallback, not a
fabricated "published" — the alternative (a chat LLM claiming
to publish when it cannot) is exactly the failure mode the
constitution §3 / §8 mandate exists to prevent, and in release
work it's especially dangerous because consumers may pin to a
version that was never actually published.
