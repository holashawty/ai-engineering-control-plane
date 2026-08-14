<!-- GENERATED FILE — DO NOT EDIT DIRECTLY.
     Source: agents/AGENTS.md + skills/*/SKILL.md
     Regenerate with: aiecp-sync-entrypoints
     Per ADR-0006, hand edits here will be overwritten. -->

# AGENTS.md — AI Engineering Control Plane (AIECP)

This is the canonical, agent-agnostic entrypoint for any AI coding agent
working in a repository that has AIECP installed. Per ADR-0006, this
file is the source of truth; `CLAUDE.md`, `GEMINI.md`,
`.cursor/rules/*.mdc`, `.windsurfrules`, and
`.github/copilot-instructions.md` are generated from it by
`sync-entrypoints` (`adapters/agents/src/sync-entrypoints.ts` — see
`STATUS.md` for current coverage) and must
never be hand-edited directly.

If you are an agent reading this file natively (no generated wrapper
exists yet, or you're Codex/OpenCode reading `AGENTS.md` directly): this
**is** your instructions. Follow them as-is.

## What this repository is

This is the AIECP framework's own repository — not a host project it's
been installed into. If you were expecting a `.aiecp/` directory with a
`project-intelligence.json` in a *different* project, you're in the
wrong place; that only exists in repos where AIECP has been installed
as a dependency, which this repo is not (it *is* the dependency).

If you are working **in this repo**, you are contributing to the
framework itself, and everything in `constitution/` applies to you
directly, not just to a downstream project.

## Before you do anything else

1. Read `STATUS.md`. It tells you what phase this project is in, what's
   done, and what the next task in sequence is.
2. Read `DECISIONS.md`. Do not re-decide something that already has an
   ADR without writing a new ADR that supersedes it (`constitution/
   change-policy.md`).
3. Read `constitution/constitution.md`. It is not optional context —
   it is the governing ruleset for how you work in this repo.
4. If you need to actually run the framework's own tooling (discovery,
   executor, agent adapters), run `npm run bootstrap` once from the
   repo root first — it installs, builds, and self-tests all 3
   sub-packages in one command via npm workspaces. Individual
   sub-package commands (`cd discovery/cli && npm install && ...`) work
   too but are not necessary.

## What you may do without asking

- Read any file in this repository.
- Add new schemas, skills, docs, or workflow definitions that don't
  touch the constitution-layer files listed in
  `constitution/change-policy.md`.
- Run validation (JSON Schema validation, YAML parsing) against
  anything you write.
- Update `STATUS.md` to reflect work you've completed, in the same
  commit as that work.

## What requires an ADR first (constitution/change-policy.md)

- Any edit to `constitution/*.md`, `constitution/*.schema.json`,
  `evidence/schema/*`, `memory/schemas/*`, `discovery/schema/*`, or
  `DECISIONS.md` itself (other than appending).

## What requires explicit human confirmation regardless of autonomy level

Per `docs/security-model.md`: production mutation, irreversible
migration, credential access, broad refactor (see
`constitution/autonomy-policy.schema.json` `broad_refactor_threshold`),
security-sensitive changes, force-push, branch deletion. This repo's
own autonomy policy (once one is declared for the framework repo
itself, as opposed to host projects) will live at
`.aiecp/policy.yaml` — until it exists, treat every one of the above
classes as requiring confirmation.

## Sequencing — what to work on next

See `STATUS.md` "Sequencing decision" for the current dependency-ordered
task list. Do not skip ahead to a later step if an earlier one is
unchecked, unless you have a specific reason — and if so, write that
reason into `STATUS.md`, don't silently reorder.

## For a downstream project (once AIECP is installed there)

This section is a placeholder for what will be generated into a host
project's own `AGENTS.md` by `sync-entrypoints` once that tool exists.
It does not apply to work inside *this* repository.


## Skills available natively in Claude Code

Claude Code reads Agent Skills (SKILL.md) natively — no flattening
required. The following skills are available in this repository:

- **behavioral-verification** (`skills/behavioral-verification/SKILL.md`) — Use at the verify state of any workflow, after a fix is applied — confirms the fix actually resolved the validated root cause, not just that the test suite exits 0. Operationalizes ADR-0010 ("no exception ≠ success"). Novel to AIECP; no upstream equivalent found in docs/research.md.
- **evidence-engineering** (`skills/evidence-engineering/SKILL.md`) — Use whenever a workflow step needs to emit an Incident, Trace, Event, Decision, Expected, Actual, Validation, or Replay entity — ensures every evidence artifact validates against its JSON Schema and follows the debugging-chain ordering in docs/evidence-model.md. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **systematic-debugging** (`skills/systematic-debugging/SKILL.md`) — Use when diagnosing a reported bug or unexpected behavior — locates evidence, reproduces deterministically, and walks the debugging chain to a validated root cause before any fix is proposed. Adapted from obra/superpowers' systematic-debugging skill (MIT, see NOTICE) with the addition of the AIECP Evidence Model.
- **testing** (`skills/testing/SKILL.md`) — Use whenever a workflow needs to run, write, or interpret tests — always via the project's own detected test runner (Project Intelligence project.test_system), never a framework-imposed toolchain. Supports reproduce, verify, and regression-protect states.
