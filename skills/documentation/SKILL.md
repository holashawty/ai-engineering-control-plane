---
name: documentation
description: "Use when updating user-facing or developer-facing docs to reflect a change — emits an event of kind: file_change recording the doc update, so the workflow's report state can cite it in the decision trace per constitution/engineering-principles.md \"Report the decision trace, not just the outcome.\""
license: MIT
allowed-tools: [filesystem_read, filesystem_write]
---

# Documentation

## When to use this skill

Anywhere a workflow has reached its `document` state — the state
between `verify` (behavioral verification passed) and `report`
(summarize the run). Concretely:

- The `document` state of `workflows/feature-request.sm.yaml`.
- The `document` state of `workflows/change-request.sm.yaml`.
- The `document` state of any future `refactor` workflow (planned,
  see `workflows/_router.md`).

**A meaningful structural difference between reactive and constructive
workflows:** `bug-report` has **no** `document` state. Bug fixes
typically do not require doc updates beyond the regression test (the
test *is* the documentation that this behavior is now enforced),
because a bug fix restores behavior to what the docs already said. A
`feature-request` adds a capability the docs did not describe; a
`change-request` modifies behavior the docs *used to describe
correctly* and now describe incorrectly. Both require doc updates;
`bug-report` typically does not. This is not an oversight in
`bug-report` — it is a deliberate structural choice that follows from
what each workflow is doing to the spec/contract: bug-report *restores*
it, feature-request *extends* it, change-request *supersedes* it. If
you find yourself wanting to update docs in a `bug-report` run, that
is a signal the bug fix has crept into change-request territory and
the router may have miscategorized — surface it rather than silently
adding a `document` step the workflow does not declare.

## Procedure

1. **Identify what docs the change affects.** Walk this checklist
   before writing anything:
   - **User-facing API docs.** If the change touches a public API
     (an HTTP endpoint, a CLI flag, a library export, a config
     option), the corresponding doc section must be updated. Find
     it by `source_ref` of the new `Expected` (the spec section
     the change fulfills) and trace from there to any docs that
     describe the user-facing surface.
   - **Developer-facing architecture docs.** If the change alters
     a component's responsibilities, its interactions with other
     components, or its invariants, the architecture doc must be
     updated. Find it by searching for the component name in
     `docs/architecture.md`, the project's `README.md`, or any
     `AGENTS.md`/`CLAUDE.md` files (per ADR-0006 these are
     generated from canonical sources — update the source, not
     the generated file).
   - **The project's README.md.** If the change alters how a user
     installs, configures, or first-runs the project, the README's
     quickstart must reflect it. README changes are high-visibility
     — every consumer sees them — and so are high-risk to leave
     stale.
   - **`AGENTS.md`/`CLAUDE.md` if the change affects how an agent
     should approach the project.** If the change introduces a new
     convention (e.g. "all new endpoints must include rate limiting"),
     updates an existing convention (e.g. "the test runner is now
     vitest, not jest"), or modifies a safety rule, the canonical
     agent-entrypoint source must be updated so future agent runs
     pick up the new rule. Per ADR-0006 these files are *generated*,
     so the update goes in the source (typically
     `agents/AGENTS.md` for AIECP, or whatever canonical source the
     host project uses) and `sync-entrypoints` is re-run — do not
     hand-edit the generated files.
2. **Update the docs to reflect the new behavior** — not the
   implementation. Docs describe contracts (what the system does),
   not mechanisms (how it does it). A doc that says "uses library X
   to validate input" has conflated the contract with one
   implementation; "validates input per `specs/contracts.md#input-
   validation`" is the right level. The implementation may change
   without the contract changing, and the docs should not need to
   follow.
3. **Emit an `event` of `kind: "file_change"`**
   (`evidence/schema/event.schema.json`) for each doc file updated,
   with the file path in `source` and a `diff_summary` in `payload`
   describing what was added, changed, or removed. One `Event` per
   file (each `Event` has a single `source`). The `trace_ref` should
   point at the trace established in the prior state. These events
   are what `report` cites in the decision trace per
   `constitution/engineering-principles.md` "Report the decision
   trace, not just the outcome" — a `report` that says "shipped"
   without citing the doc `Event`s is the same failure mode as a
   `report` that says "fixed" without citing the evidence chain.

## Tool integration

- `filesystem_read`: read existing docs to find the right section to
  update (and to confirm what the docs *currently* say before
  rewriting — a doc rewrite that does not first read the existing
  text is a guess). Also read the new `Expected` from the prior
  state to know what the new contract says the docs must reflect.
- `filesystem_write`: write the updated doc. Append or extend
  sections; do not rewrite entire docs unless the doc structure
  itself is wrong (in which case that is a separate `change-request`
  of its own). For `AGENTS.md`/`CLAUDE.md`-style generated files,
  update the canonical source and re-run `sync-entrypoints` rather
  than editing the generated file directly.

## Validation

This skill is considered successful for a given run only if:

- Every public API or behavior surface the change touched has a
  corresponding doc update. If the change touched a public API and
  no doc `Event` was emitted, the workflow's `document` state's
  validation should catch this and transition back (the failure-mode
  example below describes the shape of this catch).
- Every doc `Event` emitted has a `diff_summary` specific enough
  that `report` can cite it without re-reading the file ("added
  'Tag filtering' section to `docs/api/items.md` documenting the
  `?tag=` query param and additive semantics" — not "updated docs").
- No doc update was made for a behavior the change did NOT touch
  (which would mean the doc is now describing behavior the code does
  not implement — a different kind of staleness, equally bad).
- If the change touched `AGENTS.md`/`CLAUDE.md`-relevant conventions,
  the canonical source was updated and `sync-entrypoints` re-run
  (not the generated file hand-edited).

## Examples

**Happy path:** A `change-request` workflow has migrated the
password reset email's from-address from `support@` to `noreply@`,
behavioral verification has passed. The agent walks the checklist
from step 1: (a) `docs/api/email.md` has a section
`#password-reset-from-address` documenting the from-address as
`support@` — it must be updated; (b) the project's `README.md`
quickstart does not mention the from-address — no update needed;
(c) `AGENTS.md` does not reference the from-address — no update
needed. The agent updates `docs/api/email.md`'s
`#password-reset-from-address` section, replacing `support@` with
`noreply@` and adding a deprecation note ("prior to <release>,
password reset emails were sent from `support@`; this was changed
to `noreply@` to clarify that the address does not accept replies
— see `specs/spec.md#password-reset-email` for the new contract").
The agent emits a `file_change` `Event` with `source:
"docs/api/email.md"`, `diff_summary: "updated
#password-reset-from-address section: replaced support@ with
noreply@ in the documented From: header; added deprecation note
referencing the spec section"`. The skill exits successfully: one
doc file updated, one `Event` emitted with a specific `diff_summary`,
`report` can now cite the `Event` in its decision trace.

**Failure mode (change touched a public API but no docs were updated,
caught by `document` state's validation, transitions back):** A
`feature-request` workflow has added a `?tag=` query param to the
`/items` endpoint, behavioral verification has passed, and the
workflow has reached `document`. The agent — under time pressure,
or assuming "the test covers it" — emits a single `file_change`
`Event` for `src/routes/items.ts` (the implementation) and skips the
docs entirely, advancing to `report` immediately. The workflow's
`document` state validation rejects the advance: the change touched
a public API (a new query param), and no doc `Event` was emitted
for `docs/api/items.md`. The workflow transitions back (or to
`blocked`, depending on the workflow's exact transitions) with the
precise gap "feature `?tag=` query param added to `/items` but
`docs/api/items.md` was not updated; the API surface has changed and
no documentation reflects it — emit a doc `Event` before advancing
to `report`." Without this skill's step 1 checklist enforcement, the
feature would have shipped with the new query param invisible to
every consumer reading the API docs — a silent contract change that
`change-request` is specifically designed to prevent, and that
`feature-request` should not introduce by accident either.
