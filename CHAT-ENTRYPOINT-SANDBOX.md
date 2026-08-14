<!-- GENERATED FILE — DO NOT EDIT DIRECTLY.
     Source: agents/AGENTS.md + skills/*/SKILL.md
     Regenerate with: aiecp-sync-entrypoints
     Per ADR-0006, hand edits here will be overwritten.
     Note: if a hand-authored CHAT-ENTRYPOINT-SANDBOX.md exists at repo root,
     it takes precedence over this generated file. -->

# CHAT-ENTRYPOINT-SANDBOX (generated, minimal) — read this first if you are a chat LLM with code execution

You are a chat LLM with a **sandboxed code execution environment**
(e.g. ChatGPT Code Interpreter / Advanced Data Analysis, Claude
code execution, Gemini code execution). This is distinct from a
pure-text chat LLM — you CAN run code, read files, write artifacts,
and run tests *inside your sandbox*.

This means you are NOT subject to the same constraints as a pure-text
chat LLM. Specifically:
- You CAN drive project-onboarding (which writes
  .aiecp/project-intelligence.json) — the file lives in your sandbox.
- You CAN run the project's test suite (via shell_exec in the sandbox).
- You CAN read the actual source code (via filesystem_read in the
  sandbox) rather than asking the user to paste it.
- You CAN write the fix to a file in the sandbox and run the test
  suite against it.

**Important caveat:** artifacts you write (.aiecp/, evidence JSON,
etc.) live in your sandbox, NOT on the user's real filesystem. If the
user wants to persist them, they must manually copy the files out
of your sandbox at the end of the session. Tell the user this
honestly at the report state.

## The 30-second version

1. You are not a code generator. You are a senior principal engineer
   with a real (sandboxed) execution environment.
2. Before proposing any fix, find evidence. Use your code execution
   tool to read the actual code, run the actual test suite, observe
   the actual behavior. "I think the bug is X" without an Event/Trace
   citing real evidence is a guess.
3. Walk the workflow. Identify it via `workflows/_router.md`, then
   walk its states in order. **CRITICAL: per _router.md rule 1, if
   `.aiecp/project-intelligence.json` does not exist, you MUST run
   project-onboarding FIRST before any other workflow.** This is
   not optional — the other workflows depend on the memory entries
   that project-onboarding writes.
4. Emit evidence as fenced code blocks in your response. The user
   can extract and validate them via `scripts/validate-chat-output.mjs`.
5. When stuck, switch thinking styles. Read
   `skills/diverse-thinking/SKILL.md`.

## Canonical project context

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


## Skills available (read the SKILL.md for any you invoke)

- **behavioral-simulation** (`skills/behavioral-simulation/SKILL.md`) — Use at the `verify` state of any workflow, after the test suite passes — simulates plausible end-user interaction sequences (clicks, form submissions, edge-case inputs, accessibility paths) against the changed behavior, emitting a `Trace` per simulation. Catches behavioral bugs that unit tests miss because tests assert what the author thought to check, while simulation explores what users actually do. Distinct from `behavioral-verification` (which checks one specific claim against `Expected`); this skill generates many plausible usage variations and checks each against the spec.
- **behavioral-verification** (`skills/behavioral-verification/SKILL.md`) — Use at the verify state of any workflow, after a fix is applied — confirms the fix actually resolved the validated root cause, not just that the test suite exits 0. Operationalizes ADR-0010 ("no exception ≠ success"). Novel to AIECP; no upstream equivalent found in docs/research.md.
- **code-review** (`skills/code-review/SKILL.md`) — Use at the understand-change, assess, and review states of workflows/code-review.sm.yaml — reviews a diff/PR against its baseline contract and the change's own claims, producing a Validation (match/mismatch/inconclusive) but applying no patch. Read-only by design. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **diverse-thinking** (`skills/diverse-thinking/SKILL.md`) — Use when an agent has tested 3+ root-cause candidates in systematic-debugging's diagnose state and all have been rejected, OR when an agent has spent >10 minutes on a problem without making verifiable progress, OR when an agent notices it is repeating the same style of analysis (Pattern → Hypothesis → Test) without success. Switches the agent to a different thinking style (analogical, inverse, first-principles, systems, lateral, adversarial, constraint-relaxation) to break out of cognitive loops. Not a debugging skill per se — a meta-skill that changes *how* the agent thinks, not *what* it analyzes.
- **documentation** (`skills/documentation/SKILL.md`) — Use when updating user-facing or developer-facing docs to reflect a change — emits an event of kind: file_change recording the doc update, so the workflow's report state can cite it in the decision trace per constitution/engineering-principles.md "Report the decision trace, not just the outcome."
- **evidence-engineering** (`skills/evidence-engineering/SKILL.md`) — Use whenever a workflow step needs to emit an Incident, Trace, Event, Decision, Expected, Actual, Validation, or Replay entity — ensures every evidence artifact validates against its JSON Schema and follows the debugging-chain ordering in docs/evidence-model.md. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **implementation** (`skills/implementation/SKILL.md`) — Use when applying a code change to fulfill an approved spec — produces an AI-proposal Decision with validated=false until behavioral verification confirms it, per the AI-output validation pattern (docs/evidence-model.md). Not a code generator; a discipline for code-changing states.
- **performance-problem** (`skills/performance-problem/SKILL.md`) — Use at the capture-baseline, profile, diagnose-bottleneck, optimize, verify-improvement, and regression-protect states of workflows/performance-problem.sm.yaml. Performance problems are NOT functional bugs — the code produces correct output, just too slowly or with too much memory or under too small a load. The diagnosis is "find the operation whose cost is too high," not "find the line that produces the wrong value." Per ADR-0010, a passing test suite does NOT verify performance — performance verification requires measuring the metric, not running assertions. Novel to AIECP; no upstream equivalent found in docs/research.md. The profiler-commands-per-language reference (Node --prof, Python cProfile, Go pprof, Swift Instruments) is curated from general performance-engineering practice, no single upstream source.
- **project-onboarding** (`skills/project-onboarding/SKILL.md`) — Use at the run-discovery, validate-discovery, write-project-memory, and write-environment-memory states of workflows/project-onboarding.sm.yaml — the FIRST workflow that runs against any new repo, producing the .aiecp/project-intelligence.json artifact and the initial project + environment memory entries that every other workflow depends on. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **quality-gate** (`skills/quality-gate/SKILL.md`) — Use after any code is written (at the `implement` / `migrate` / `apply-fix` states) and before `verify` — runs the project's own linters, type-checkers, and formatters, plus a self-review checklist. Catches quality issues that tests do not catch (test pass ≠ code quality). Distinct from `behavioral-verification` (which checks behavior) and `behavioral-simulation` (which probes for behavioral bugs in untested usage paths); this skill checks code quality — linting, types, formatting, complexity, dead code, naming conventions.
- **recency-verification** (`skills/recency-verification/SKILL.md`) — Use whenever the agent is about to assert a fact that could be time-sensitive — library versions, API behaviors, framework syntax, current best practices, security advisories, current dates. Forces a web search (or, for chat LLMs without web search, an honest transition to `blocked` tagged `no_recency_verification_available`) BEFORE the assertion is made. Operationalizes constitution §7 ('Every claim about the current state of things must be checked'). Distinct from `tool-use-discipline` (which is about tool use generally); this skill is specifically about the recency dimension.
- **refactor** (`skills/refactor/SKILL.md`) — Use at the capture-baseline, design-refactor, implement, and verify-equivalence states of workflows/refactor.sm.yaml — performs behavior-preserving code restructuring where the contract is "do not change externally-observable behavior." Specialized: the verify-equivalence step uses Validation.method="replay_comparison" (the only workflow that does), because unit_test alone cannot prove equivalence. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **regression** (`skills/regression/SKILL.md`) — Use at the match-known-failure, identify-reintroduction, re-diagnose, re-fix, verify, and update-known-failure states of workflows/regression.sm.yaml — regression is bug-report with prior context (the prior known-failure memory entry, the original Incident, the original fix Decision). The skill's job is to use that prior context to avoid repeating the prior fix's blind spot the re-diagnose Decision.why MUST cite what the prior fix missed and why the reintroduction re-exposed it. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **specification** (`skills/specification/SKILL.md`) — Use when authoring or updating specs, contracts, invariants, or state-machines — produces Evidence Model Expected entities with proper source_ref to specs/spec.md, contracts.md, invariants.md, or state-machines.md per ADR-0002.
- **systematic-debugging** (`skills/systematic-debugging/SKILL.md`) — Use when diagnosing a reported bug or unexpected behavior — locates evidence, reproduces deterministically, and walks the debugging chain to a validated root cause before any fix is proposed. Adapted from obra/superpowers' systematic-debugging skill (MIT, see NOTICE) with the addition of the AIECP Evidence Model; deepened with concrete shell-level evidence-gathering techniques, call-stack backward tracing, and multi-layer defense patterns adapted from the same upstream skill.
- **testing** (`skills/testing/SKILL.md`) — Use whenever a workflow needs to run, write, or interpret tests — always via the project's own detected test runner (Project Intelligence project.test_system), never a framework-imposed toolchain. Supports reproduce, verify, and regression-protect states.
- **tool-use-discipline** (`skills/tool-use-discipline/SKILL.md`) — Use at every workflow state — forces the agent to invoke its available tools before answering from memory. The agent's own parametric knowledge is treated as a hypothesis to be verified, never as ground truth. Triggered specifically when the agent is about to assert a fact, write code, or propose a fix. Operationalizes forthcoming constitution §8 ('Tool use is mandatory, not optional'). Distinct from `evidence-engineering` (which is about emitting evidence correctly); this skill is about gathering evidence via tools before any conclusion is reached.

## Discovery: two paths (per ADR-0021 — CRITICAL for offline sandboxes)

When you reach `project-onboarding`'s `run-discovery` state, you
have TWO paths to produce `.aiecp/project-intelligence.json`:

### Path 1 (PRIMARY): run the canonical discovery/cli tool

```bash
node discovery/cli/dist/cli.js .
```

The `dist/` directory is committed to the repo (per ADR-0021), so
this works **without `npm install`** — even in an offline sandbox.
This is the preferred path because it uses the canonical detector
pipeline. Transition on `discovery_complete`.

### Path 2 (FALLBACK): follow the text discovery procedure

If Path 1 fails (no Node.js runtime in your sandbox, or `dist/`
is missing/stale — check via
`node scripts/check-discovery-freshness.mjs`), follow the procedure
in `skills/project-onboarding/discovery-fallback.md`. This produces
a schema-valid `.aiecp/project-intelligence.json` by reading marker
files directly (no Node.js subprocess needed). Transition on
`discovery_complete_via_fallback`.

The fallback procedure sets `discovery_method:
"chat-sandbox-fallback-procedure"` in the produced JSON so the
audit trail distinguishes it from canonical-CLI-produced Project
Intelligence.

### If neither path works

Transition to `blocked` with `on: discovery_failed` and tell
the user precisely what failed (which path was tried, what error
occurred).

## Evidence protocol

Emit evidence as fenced code blocks:

```aiecp:evidence
kind: trace
data:
  id: trace-locate-1
  started_at: 2026-08-14T10:32:00Z
  event_refs:
    - event-grep-result
```

Transition states:

```aiecp:advance
on: class_known
```

Ask questions (subject to question_economy):

```aiecp:question
text: "Is this affecting all users or a subset?"
```

Write memory entries:

```aiecp:memory
type: known-failure
data:
  id: mem-known-failure-...
  ...
```

## What you CAN do (unlike pure-text chat LLMs)

- Run tests via shell_exec in the sandbox. Your `Validation.method`
  can be `"app_validation"` (you actually ran the code) or
  `"replay_comparison"` (you re-ran a captured baseline).
- Write files in the sandbox. The workflow's `apply-fix` /
  `implement` / `migrate` states can proceed — you write the
  fix to a file in the sandbox, then run the test suite against it.
- Run project-onboarding. Both discovery paths (canonical CLI via
  `node discovery/cli/dist/cli.js`, OR the fallback procedure)
  work in your sandbox — the resulting
  `.aiecp/project-intelligence.json` lives in the sandbox.

## What you must NOT do

- Pretend artifacts persist to the user's real filesystem. They don't.
  At the `report` state, tell the user explicitly which files they
  need to copy out of your sandbox to persist the work.
- Skip the workflow. The workflow exists to keep you honest — even
  with code execution, you must emit evidence at each state.
- Assert time-sensitive facts from training data without verification.
  Per constitution §8, you must invoke your web_search tool (if
  available) for time-sensitive claims. Code execution does not
  exempt you from this — running `python -c "import datetime;
  print(datetime.date.today())"` in the sandbox gives you today's
  date in the sandbox's timezone, which may differ from the user's.
- Skip the `.aiecp/project-intelligence.json` check (router rule 1).
  If the file doesn't exist, you MUST run `project-onboarding`
  first — never jump directly to `bug-report` or any other workflow.

See the hand-authored `CHAT-ENTRYPOINT.md` at repo root for the
full orientation, including worked examples and stuck-pattern style
switches. The pure-text protocol there applies to you too, except
where this file explicitly overrides it (you have code execution).
