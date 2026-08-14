---
name: implementation
description: Use when applying a code change to fulfill an approved spec — produces an AI-proposal Decision with validated=false until behavioral verification confirms it, per the AI-output validation pattern (docs/evidence-model.md). Not a code generator; a discipline for code-changing states.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# Implementation

## When to use this skill

Anywhere a workflow has reached the state where an approved design is
being turned into a code change. Concretely:

- The `implement` state of `workflows/feature-request.sm.yaml`.
- The `migrate` state of `workflows/change-request.sm.yaml` — named
  differently because the existing behavior is being *migrated* to
  new behavior (the OLD `Expected` is being superseded, not extended),
  but the discipline this skill enforces is identical.
- The `implement` state of any future `refactor` workflow (planned,
  see `workflows/_router.md`).
- The `apply-fix` state of `workflows/bug-report.sm.yaml` — the
  minimal-fix principle applies equally, though `apply-fix` is gated
  by `edit_source` rather than `broad-refactor` and the AI-proposal
  Decision pattern is the same.

This skill is **not** a code generator and does not propose what the
code change should be — that is `specification`'s job (which produces
the approved `Decision` and `Expected` this skill consumes). This
skill is the discipline for *executing* the code change once it has
been approved: the smallest patch, an `Event` recording what changed,
and a `Decision` that stays `validated: false` until
`behavioral-verification` flips it. Skipping this skill turns every
code change into an unverifiable assertion ("I changed the code,
therefore it works").

## Procedure

1. **Retrieve the approved design `Decision`** from the prior state
   (the `design` / `design-change` / `design-refactor` `Decision`
   with `result: "accepted"` — typically `validated: false` still,
   because the AI-output validation pattern requires `verify` to
   flip it, not the design state itself). If you cannot point to
   this `Decision`, do not write code — return to the design state.
   Writing code without a referenced design `Decision` is the same
   failure mode as `systematic-debugging`'s "propose-fix before any
   evidence" anti-pattern: a guess dressed up as an action.
2. **Make the smallest change that fulfills the design** — per
   `constitution/engineering-principles.md` "Minimal fix, not
   opportunistic rewrite." That principle is stated for `propose-fix`
   in `bug-report`, but it applies equally to feature implementation
   and change migration: unrelated cleanup, refactors, or "while I'm
   here" changes are separate `Decision`s, subject to their own
   `broad-refactor` safety-gate classification, never bundled silently
   into the implementation patch. A patch that bundles two changes
   is a patch that cannot be reverted independently when one of them
   turns out to be wrong.
3. **Emit a new `Decision`** (`evidence/schema/decision.schema.json`)
   with `what: "ai_proposal:apply_patch"` (or a more specific
   `ai_proposal:*` `what` if the patch type is known — e.g.
   `ai_proposal:apply_patch_to_items_handler`), `validated: false`,
   `result: "pending"`. The `trace_ref` should point at the trace
   established in the prior state so the reference chain is intact.
   This is the AI-output validation pattern from
   `docs/evidence-model.md`: every code change is a proposal until
   `verify` emits a `Validation` with `result: "match"` referencing
   it. An implementation `Decision` with `validated: true` written
   *before* `verify` has run is a process violation of this skill,
   even though the JSON Schema would technically permit it — the
   schema cannot express "did `verify` actually run."
4. **Emit an `event`** of `kind: "file_change"`
   (`evidence/schema/event.schema.json`) with the file path in
   `source` and a `diff_summary` in `payload` describing what
   changed at a level a reviewer can follow without re-reading the
   whole file. Prefer concrete, prose-style summaries
   ("added `?tag=` query param parsing; empty-string check returns
   400; filter applied to DB query before pagination") over
   one-word labels ("updated handler") — the `report` state will cite
   this `Event` in the decision trace, and "updated handler" is not a
   decision trace. If multiple files changed, emit one `Event` per
   file (each `Event` has a single `source`); a single `Event` with
   multiple files in `source` would lose the per-file diff summary.

## Tool integration

- `filesystem_read`: read the code being changed, the surrounding
  context (callers, tests, type signatures), and the prior-state
  `Decision`/`Expected` entities the change is meant to fulfill.
- `filesystem_write`: apply the patch. Write the new file content,
  do not append unless the file format is append-only (logs, append-
  only audit trails). For source code, write the complete updated
  file content; do not attempt line-level patch application at this
  layer — the agent adapter's `edit` capability (if available) is
  the right tool for surgical edits, and `filesystem_write` is the
  right tool for "rewrite this file with this new content."
- `shell_exec`: run any build or syntax check the change requires to
  confirm *syntactic* validity (e.g. `tsc --noEmit`, `python -c
  'import ast; ast.parse(open("file").read())'`, `cargo check`).
  This is **not** behavioral verification — that is
  `behavioral-verification`'s job at the `verify` state, which uses
  a stronger `Validation.method` than `unit_test` alone per ADR-0010.
  A clean `tsc` run here only confirms the patch parses; it does not
  flip the `Decision`'s `validated` field.

## Validation

This skill is considered successful for a given run only if:

- The implementation `Decision` was emitted with `validated: false`
  and `result: "pending"` (the AI-output validation pattern — never
  self-confirmed).
- The implementation `Decision` references the approved design
  `Decision` from the prior state in its `evidence_refs` or `why`
  (so the reference chain "design → implementation → validation"
  is intact; `verify` cannot flip a `Decision` whose design parent
  it cannot find).
- At least one `file_change` `Event` was emitted with a `diff_summary`
  specific enough that `report` can cite it in the decision trace
  without re-reading the file.
- The patch did not bundle unrelated changes (the minimal-fix
  principle). If the agent found itself wanting to "also clean up
  X while I'm in here," that cleanup is a separate `Decision` and a
  separate `file_change` `Event`, or it does not happen in this run.

## Examples

**Happy path:** A `change-request` workflow has approved a design to
change the password reset email's from-address from `support@` to
`noreply@`. The agent retrieves the design `Decision` (id
`decision-design-change-from-address`), reads the email-sending
module to find the from-address constant, makes the smallest
possible change: updates the constant from `"support@example.com"`
to `"noreply@example.com"` in one file. Emits a `Decision` with
`what: "ai_proposal:apply_patch_to_email_constants"`, `validated:
false`, `result: "pending"`, `evidence_refs:
["decision-design-change-from-address"]`. Emits a `file_change`
`Event` with `source: "src/email/constants.ts"`,
`diff_summary: "FROM_ADDRESS constant changed from
'support@example.com' to 'noreply@example.com' (line 12); no other
lines touched."`. The skill exits successfully: one focused patch, the
`Decision` stays `validated: false`, the `Event` cites the file and
summarizes the diff. `verify` will later flip `validated` to `true`
once behavioral verification confirms the new from-address actually
appears in a sent email.

**Failure mode (patch bundles unrelated cleanup, blocked by
minimal-fix principle):** A `feature-request` workflow has approved
a design to add tag-based filtering to the `/items` endpoint. The
agent retrieves the design `Decision`, reads `src/routes/items.ts`
to find the handler — and notices that the file uses an outdated
`var` declaration style on line 8, and a comment on line 45 references
a function that was renamed three commits ago. The agent, "while
here," rewrites the file to: (a) add the tag filtering, (b) modernize
`var` to `let`/`const`, (c) update the stale comment. The
`file_change` `Event` is emitted with a `diff_summary` covering all
three changes. During review (or by the safety gate at the next
state's broad-refactor check), the patch is flagged as a
broad-refactor: it touches 3 logical changes across one file. The
workflow transitions back to `design` (or to `blocked`, depending
on the workflow) with the precise gap "implementation patch bundled
the approved tag-filtering change with two unrelated cleanups
(var→let, stale comment); split into three separate `Decision`s per
the minimal-fix principle." Without this skill's step 2 enforcement,
the bundled patch would have shipped — and when the tag-filtering
turns out to be wrong, the agent could not revert it without also
reverting the (correct) var modernization and comment fix.
