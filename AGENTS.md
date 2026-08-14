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


## Skills index (Codex has partial native Agent Skills support)

Codex's Agent Skills support is partial as of this adapter's last
verification (docs/portability.md). The skill descriptions below are
inlined here as a fallback in case native SKILL.md discovery doesn't
pick up everything; the authoritative source is always the individual
`skills/*/SKILL.md` files.

- **behavioral-simulation** (`skills/behavioral-simulation/SKILL.md`) — Use at the `verify` state of any workflow, after the test suite passes — simulates plausible end-user interaction sequences (clicks, form submissions, edge-case inputs, accessibility paths) against the changed behavior, emitting a `Trace` per simulation. Catches behavioral bugs that unit tests miss because tests assert what the author thought to check, while simulation explores what users actually do. Distinct from `behavioral-verification` (which checks one specific claim against `Expected`); this skill generates many plausible usage variations and checks each against the spec.
- **behavioral-verification** (`skills/behavioral-verification/SKILL.md`) — Use at the verify state of any workflow, after a fix is applied — confirms the fix actually resolved the validated root cause, not just that the test suite exits 0. Operationalizes ADR-0010 ("no exception ≠ success"). Novel to AIECP; no upstream equivalent found in docs/research.md.
- **code-review** (`skills/code-review/SKILL.md`) — Use at the understand-change, assess, and review states of workflows/code-review.sm.yaml — reviews a diff/PR against its baseline contract and the change's own claims, producing a Validation (match/mismatch/inconclusive) but applying no patch. Read-only by design. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **diverse-thinking** (`skills/diverse-thinking/SKILL.md`) — Use when an agent has tested 3+ root-cause candidates in systematic-debugging's diagnose state and all have been rejected, OR when an agent has spent >10 minutes on a problem without making verifiable progress, OR when an agent notices it is repeating the same style of analysis (Pattern → Hypothesis → Test) without success. Switches the agent to a different thinking style (analogical, inverse, first-principles, systems, lateral, adversarial, constraint-relaxation) to break out of cognitive loops. Not a debugging skill per se — a meta-skill that changes *how* the agent thinks, not *what* it analyzes.
- **documentation** (`skills/documentation/SKILL.md`) — Use when updating user-facing or developer-facing docs to reflect a change — emits an event of kind: file_change recording the doc update, so the workflow's report state can cite it in the decision trace per constitution/engineering-principles.md "Report the decision trace, not just the outcome."
- **evidence-engineering** (`skills/evidence-engineering/SKILL.md`) — Use whenever a workflow step needs to emit an Incident, Trace, Event, Decision, Expected, Actual, Validation, or Replay entity — ensures every evidence artifact validates against its JSON Schema and follows the debugging-chain ordering in docs/evidence-model.md. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **implementation** (`skills/implementation/SKILL.md`) — Use when applying a code change to fulfill an approved spec — produces an AI-proposal Decision with validated=false until behavioral verification confirms it, per the AI-output validation pattern (docs/evidence-model.md). Not a code generator; a discipline for code-changing states.
- **refactor** (`skills/refactor/SKILL.md`) — Use at the capture-baseline, design-refactor, implement, and verify-equivalence states of workflows/refactor.sm.yaml — performs behavior-preserving code restructuring where the contract is "do not change externally-observable behavior." Specialized: the verify-equivalence step uses Validation.method="replay_comparison" (the only workflow that does), because unit_test alone cannot prove equivalence. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **specification** (`skills/specification/SKILL.md`) — Use when authoring or updating specs, contracts, invariants, or state-machines — produces Evidence Model Expected entities with proper source_ref to specs/spec.md, contracts.md, invariants.md, or state-machines.md per ADR-0002.
- **systematic-debugging** (`skills/systematic-debugging/SKILL.md`) — Use when diagnosing a reported bug or unexpected behavior — locates evidence, reproduces deterministically, and walks the debugging chain to a validated root cause before any fix is proposed. Adapted from obra/superpowers' systematic-debugging skill (MIT, see NOTICE) with the addition of the AIECP Evidence Model; deepened with concrete shell-level evidence-gathering techniques, call-stack backward tracing, and multi-layer defense patterns adapted from the same upstream skill.
- **testing** (`skills/testing/SKILL.md`) — Use whenever a workflow needs to run, write, or interpret tests — always via the project's own detected test runner (Project Intelligence project.test_system), never a framework-imposed toolchain. Supports reproduce, verify, and regression-protect states.
