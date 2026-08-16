<!-- GENERATED FILE — DO NOT EDIT DIRECTLY.
     Source: agents/AGENTS.md + skills/*/SKILL.md
     Regenerate with: aiecp-sync-entrypoints
     Per ADR-0006, hand edits here will be overwritten. -->

# MCP-ENTRYPOINT (generated, minimal) — read this first if you are an MCP-connected agent

You are an agent whose primary tool-access mechanism is the **Model
Context Protocol** (MCP). You connect to MCP servers (filesystem, shell,
test-runner, and any project-installed servers) to read files, run
commands, execute tests, and invoke skills. Per web research
(2026-08-15), MCP is now a Linux Foundation standard under the Agentic
AI Foundation, with 10,000+ active public servers and 41% of surveyed
organizations in production use.

This is distinct from:
- a pure-text chat LLM (the `chat` adapter) — you have real tool use.
- a chat LLM with sandbox (the `chat-sandbox` adapter) — your
  capabilities hold on the *real host filesystem*, not an ephemeral
  sandbox. Files you write persist; tests you run see the real repo;
  shell commands execute against the real environment.
- a CLI agent reading CLAUDE.md / AGENTS.md natively (the
  `claude-code` / `codex` adapters) — your tool surface is MCP-
  mediated rather than a single-vendor CLI tool, but the capability
  shape is otherwise the same.

## The 30-second version

1. You are not a code generator. You are a senior principal engineer
   with real (MCP-mediated) tool access to the host repository.
2. Before proposing any fix, find evidence. Use your MCP tools
   (filesystem_read, shell_exec) to read the actual code, run the
   actual test suite, observe the actual behavior. "I think the bug
   is X" without an Event/Trace citing real evidence is a guess.
3. Walk the workflow. Identify it via `workflows/_router.md`, then
   walk its states in order. **CRITICAL: per _router.md rule 1, if
   `.aiecp/project-intelligence.json` does not exist, you MUST run
   project-onboarding FIRST before any other workflow.**
4. Emit evidence as fenced code blocks in your response. The user
   can extract and validate them via `scripts/validate-chat-output.mjs`
   (the same protocol works for any agent that emits text).
5. When stuck, switch thinking styles. Read
   `skills/diverse-thinking/SKILL.md`.

## MCP server discovery (how to find what's available)

Before invoking any MCP tool, know which servers are connected. The
MCP client exposes a `list_servers` (or equivalent) capability; the
exact command varies per client implementation but the shape is the
same: enumerate connected servers, then per-server `list_tools` to
see the tools that server exposes. A typical discovery pass:

```text
# Pseudocode — actual command syntax varies per MCP client.
client.list_servers()        # → ["filesystem", "shell", "test-runner", "git", ...]
client.list_tools("filesystem")
  # → [{name: "read_file", ...}, {name: "write_file", ...},
  #    {name: "list_directory", ...}]
```

Record the discovered server list as an `Event` of `kind:
"observation"` with `payload.servers: [<list>]` and per-server
`payload.tools: [<list>]`. This anchors every later tool call's
`source` field — without this `Event`, a reviewer cannot tell
which server a tool observation came from.

If a capability this adapter declares is NOT backed by a connected
server (e.g. `test_runner: true` declared but no test-runner server
is connected), emit a `Decision` with `what:
"mcp_capability_unavailable:<capability>"`, `validated: false`, and
transition the workflow to `blocked` with `on:
mcp_required_server_missing`. Do NOT silently fall back to pretending
the capability exists — that is exactly the failure mode the
`chat-sandbox` adapter's comment chain warns against.

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

- **architecture-design** (`skills/architecture-design/SKILL.md`) — Use after project-planning — selects technology stack based on requirements and plan, designs system architecture (monolith/microservice/serverless), database schema, API contracts, and deployment topology. Can trigger plan_revision_needed if architectural constraints conflict with requirements (emit Decision with what: architecture_constraint_conflict — see step 7 for why this is encoded in the what-field rather than a separate boolean field, due to decision.schema.json's additionalProperties: false). Distinct from specification (which writes spec TEMPLATES); this skill makes architectural DECISIONS and writes contracts.md + invariants.md + architecture.md. Writes: specs/contracts.md + specs/invariants.md + specs/architecture.md (new). Reads: specs/requirements.md + specs/plan.md. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **backend** (`skills/backend/SKILL.md`) — Use whenever a task touches API endpoints, service-layer logic, inter-service communication, or backend infrastructure. Ensures backend changes are verified by both unit tests AND contract validation (per behavioral-verification skill) — does the API actually honor its declared contracts? Covers REST/GraphQL/gRPC equally. Distinct from testing (which runs test suites) — this skill covers backend-specific discipline — API contract validation, error handling patterns, idempotency checking, rate-limit awareness.
- **behavioral-simulation** (`skills/behavioral-simulation/SKILL.md`) — Use at the `verify` state of any workflow, after the test suite passes — simulates plausible end-user interaction sequences (clicks, form submissions, edge-case inputs, accessibility paths) against the changed behavior, emitting a `Trace` per simulation. Catches behavioral bugs that unit tests miss because tests assert what the author thought to check, while simulation explores what users actually do. Distinct from `behavioral-verification` (which checks one specific claim against `Expected`); this skill generates many plausible usage variations and checks each against the spec.
- **behavioral-verification** (`skills/behavioral-verification/SKILL.md`) — Use at the verify state of any workflow, after a fix is applied — confirms the fix actually resolved the validated root cause, not just that the test suite exits 0. Operationalizes ADR-0010 ("no exception ≠ success"). Novel to AIECP; no upstream equivalent found in docs/research.md.
- **code-review** (`skills/code-review/SKILL.md`) — Use at the understand-change, assess, and review states of workflows/code-review.sm.yaml — reviews a diff/PR against its baseline contract and the change's own claims, producing a Validation (match/mismatch/inconclusive) but applying no patch. Read-only by design. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **context-engineering** (`skills/context-engineering/SKILL.md`) — Use when a workflow run is approaching the LLM's context window limit — summarizes evidence chains, compresses redundant traces, and preserves the audit trail without losing decision-relevant information. Operationalizes "context engineering" (2026 trend) for AIECP's evidence-driven model. Distinct from testing (which runs tests) and behavioral-verification (which checks behavior); this skill manages the agent's own memory budget.
- **database** (`skills/database/SKILL.md`) — Use whenever a task touches database schema, queries, migrations, or data integrity. Ensures database changes are treated as first-class Evidence Model artifacts — schema migrations emit Decision entities with validated=false until behavioral verification confirms the migration is safe. Covers SQL/NoSQL/NewSQL equally. Distinct from testing (which runs test suites) — this skill covers the database-specific discipline — migration safety, query validation, index impact, connection pool management.
- **discovery-refresh** (`skills/discovery-refresh/SKILL.md`) — Use at the run-discovery, validate-discovery, update-project-memory, and update-environment-memory states of workflows/discovery-refresh.sm.yaml — refreshes a stale .aiecp/project-intelligence.json and UPDATES the existing project + environment memory entries in place (same ids, updated_at bumped, drifted fields overwritten) rather than creating new ones. Runs when the document is stale (not missing — that is project-onboarding's job). Novel to AIECP; no upstream equivalent found in docs/research.md.
- **diverse-thinking** (`skills/diverse-thinking/SKILL.md`) — Use when an agent has tested 3+ root-cause candidates in systematic-debugging's diagnose state and all have been rejected, OR when an agent has spent >10 minutes on a problem without making verifiable progress, OR when an agent notices it is repeating the same style of analysis (Pattern → Hypothesis → Test) without success. Switches the agent to a different thinking style (analogical, inverse, first-principles, systems, lateral, adversarial, constraint-relaxation) to break out of cognitive loops. Not a debugging skill per se — a meta-skill that changes *how* the agent thinks, not *what* it analyzes.
- **documentation** (`skills/documentation/SKILL.md`) — Use when updating user-facing or developer-facing docs to reflect a change — emits an event of kind: file_change recording the doc update, so the workflow's report state can cite it in the decision trace per constitution/engineering-principles.md "Report the decision trace, not just the outcome."
- **evidence-engineering** (`skills/evidence-engineering/SKILL.md`) — Use whenever a workflow step needs to emit an Incident, Trace, Event, Decision, Expected, Actual, Validation, or Replay entity — ensures every evidence artifact validates against its JSON Schema and follows the debugging-chain ordering in docs/evidence-model.md. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **frontend** (`skills/frontend/SKILL.md`) — Use whenever a task touches UI, UX, accessibility, or frontend rendering. Ensures frontend changes are verified not just by unit tests but by behavioral simulation (per behavioral-simulation skill) — does the UI actually render correctly for all user states? Covers React/Vue/Svelte/Angular/Vanilla JS equally. Distinct from testing (which runs test suites) — this skill covers frontend-specific discipline — accessibility checks, responsive design verification, visual regression awareness, component prop validation.
- **implementation** (`skills/implementation/SKILL.md`) — Use when applying a code change to fulfill an approved spec — produces an AI-proposal Decision with validated=false until behavioral verification confirms it, per the AI-output validation pattern (docs/evidence-model.md). Not a code generator; a discipline for code-changing states.
- **incident** (`skills/incident/SKILL.md`) — Use at the assess-impact, triage, mitigate, verify-mitigation, and postmortem states of workflows/incident.sm.yaml — when a production alert has fired, the on-call has been paged, and the priority is mitigation FIRST, root-cause SECOND, postmortem THIRD. Includes SEV-scoring, proximate-trigger triage, mitigation-vs-fix distinction, SLO-recovery verification, and blameless-postmortem drafting. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **orchestrator** (`skills/orchestrator/SKILL.md`) — Use when a user's request spans multiple workflows or requires autonomous goal pursuit — the orchestrator chains workflows (bug-report → feature-request → verify, etc.) in a loop until the goal is met or blocked. Implements "loop engineering" (LangChain, June 2026) where the agent prompts itself, iterates until done, and reports findings. Distinct from unknown-failure (which triages a single ambiguous intent); this skill drives multi-workflow autonomous execution.
- **performance-problem** (`skills/performance-problem/SKILL.md`) — Use at the capture-baseline, profile, diagnose-bottleneck, optimize, verify-improvement, and regression-protect states of workflows/performance-problem.sm.yaml. Performance problems are NOT functional bugs — the code produces correct output, just too slowly or with too much memory or under too small a load. The diagnosis is "find the operation whose cost is too high," not "find the line that produces the wrong value." Per ADR-0010, a passing test suite does NOT verify performance — performance verification requires measuring the metric, not running assertions. Novel to AIECP; no upstream equivalent found in docs/research.md. The profiler-commands-per-language reference (Node --prof, Python cProfile, Go pprof, Swift Instruments) is curated from general performance-engineering practice, no single upstream source.
- **project-onboarding** (`skills/project-onboarding/SKILL.md`) — Use at the run-discovery, validate-discovery, write-project-memory, and write-environment-memory states of workflows/project-onboarding.sm.yaml — the FIRST workflow that runs against any new repo, producing the .aiecp/project-intelligence.json artifact and the initial project + environment memory entries that every other workflow depends on. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **project-planning** (`skills/project-planning/SKILL.md`) — Use after requirements-gathering — converts requirements into a phased development plan with modular task breakdown, dependency graph, risk assessment, and timeline estimate. Produces a LIVING plan that gets updated after each phase (orchestrator's evaluate-result state). Distinct from specification (which provides spec TEMPLATES per ADR-0002); this skill FILLS those templates with content. Writes: specs/plan.md + specs/tasks.md. Reads: specs/requirements.md + specs/contracts.md + specs/invariants.md. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **project-scaffolding** (`skills/project-scaffolding/SKILL.md`) — Use at the very start of a --yarat (create from scratch) session — chooses the tech stack, creates the directory structure, generates package.json/tsconfig/pyproject.toml, sets up the test runner, and creates the initial git repository. Distinct from project-onboarding (which discovers an existing repo); this skill creates the repo itself. Pairs with specification (which writes the spec after scaffolding) and orchestrator (which chains the full creation flow).
- **quality-gate** (`skills/quality-gate/SKILL.md`) — Use after any code is written (at the `implement` / `migrate` / `apply-fix` states) and before `verify` — runs the project's own linters, type-checkers, and formatters, plus a self-review checklist. Catches quality issues that tests do not catch (test pass ≠ code quality). Distinct from `behavioral-verification` (which checks behavior) and `behavioral-simulation` (which probes for behavioral bugs in untested usage paths); this skill checks code quality — linting, types, formatting, complexity, dead code, naming conventions.
- **recency-verification** (`skills/recency-verification/SKILL.md`) — Use whenever the agent is about to assert a fact that could be time-sensitive — library versions, API behaviors, framework syntax, current best practices, security advisories, current dates. Forces a web search (or, for chat LLMs without web search, an honest transition to `blocked` tagged `no_recency_verification_available`) BEFORE the assertion is made. Operationalizes constitution §7 ('Every claim about the current state of things must be checked'). Distinct from `tool-use-discipline` (which is about tool use generally); this skill is specifically about the recency dimension.
- **refactor** (`skills/refactor/SKILL.md`) — Use at the capture-baseline, design-refactor, implement, and verify-equivalence states of workflows/refactor.sm.yaml — performs behavior-preserving code restructuring where the contract is "do not change externally-observable behavior." Specialized: the verify-equivalence step uses Validation.method="replay_comparison" (the only workflow that does), because unit_test alone cannot prove equivalence. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **regression** (`skills/regression/SKILL.md`) — Use at the match-known-failure, identify-reintroduction, re-diagnose, re-fix, verify, and update-known-failure states of workflows/regression.sm.yaml — regression is bug-report with prior context (the prior known-failure memory entry, the original Incident, the original fix Decision). The skill's job is to use that prior context to avoid repeating the prior fix's blind spot the re-diagnose Decision.why MUST cite what the prior fix missed and why the reintroduction re-exposed it. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **release** (`skills/release/SKILL.md`) — Use at the check-readiness, run-tests, update-changelog, tag, publish, and verify-release states of workflows/release.sm.yaml — when the user wants to ship a versioned artifact ("ship this", "cut a release", "publish v1.4.0"). Includes semver shape classification, full-suite release-bar testing, Keep-a-Changelog drafting, signed-tag creation, registry publication, and clean-env installability verification. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **requirements-gathering** (`skills/requirements-gathering/SKILL.md`) — Use at the very start of a --yarat session or when a user describes a new feature/project — gathers requirements through structured clarifying questions, writes user stories (Given/When/Then), defines MVP scope, identifies target personas, and suggests monetization angles. Distinct from project-onboarding (which discovers the TECHNICAL stack); this skill discovers the HUMAN intent. Output: user stories + MVP scope + personas → feeds into project-planning. Reads: user's verbal description. Writes: specs/requirements.md (new file). Novel to AIECP; no upstream equivalent found in docs/research.md.
- **security-problem** (`skills/security-problem/SKILL.md`) — Use at the assess-severity, investigate, diagnose, and propose-mitigation states of workflows/security-problem.sm.yaml — when a vulnerability report, suspicious access pattern, or security-audit finding has been filed against the system. Includes CVSS-style severity scoring, reachability confirmation (so theoretical findings against unreachable code paths don't waste mitigation effort), and a layered-mitigation pattern (immediate patch + defense-in-depth guard + audit-trail improvement). Novel to AIECP; no upstream equivalent found in docs/research.md.
- **self-healing** (`skills/self-healing/SKILL.md`) — Use when tests fail due to selector/locator drift (UI element moved, renamed, or restructured) — automatically discovers the closest matching element, updates the selector, and re-runs the test without human intervention. Covers Playwright Healer pattern, AI-powered locator recovery, and DOM-diff-based element matching. Distinct from visual-regression (which checks pixel output); this skill fixes the test infrastructure itself. License MIT; tool integration cites Playwright Healer (75%+ success per web research 2026-08-15), custom DOM search, and BackstopJS selector recovery.
- **specification** (`skills/specification/SKILL.md`) — Use when authoring or updating specs, contracts, invariants, or state-machines — produces Evidence Model Expected entities with proper source_ref to specs/spec.md, contracts.md, invariants.md, or state-machines.md per ADR-0002.
- **systematic-debugging** (`skills/systematic-debugging/SKILL.md`) — Use when diagnosing a reported bug or unexpected behavior — locates evidence, reproduces deterministically, and walks the debugging chain to a validated root cause before any fix is proposed. Adapted from obra/superpowers' systematic-debugging skill (MIT, see NOTICE) with the addition of the AIECP Evidence Model; deepened with concrete shell-level evidence-gathering techniques, call-stack backward tracing, and multi-layer defense patterns adapted from the same upstream skill.
- **testing** (`skills/testing/SKILL.md`) — Use whenever a workflow needs to run, write, or interpret tests — always via the project's own detected test runner (Project Intelligence project.test_system), never a framework-imposed toolchain. Supports reproduce, verify, and regression-protect states.
- **tool-use-discipline** (`skills/tool-use-discipline/SKILL.md`) — Use at every workflow state — forces the agent to invoke its available tools before answering from memory. The agent's own parametric knowledge is treated as a hypothesis to be verified, never as ground truth. Triggered specifically when the agent is about to assert a fact, write code, or propose a fix. Operationalizes forthcoming constitution §8 ('Tool use is mandatory, not optional'). Distinct from `evidence-engineering` (which is about emitting evidence correctly); this skill is about gathering evidence via tools before any conclusion is reached.
- **unknown-failure** (`skills/unknown-failure/SKILL.md`) — Use at the classify, gather-context, triage, and route-or-block states of workflows/unknown-failure.sm.yaml — the fallback workflow that runs when the router cannot confidently classify the user's intent into any specific workflow. The skill's job is to triage the ambiguous request into the correct target workflow (bug-report, feature-request, change-request, refactor, code-review, regression, performance-problem, project-onboarding, or the implemented user-complaint / security-problem / release / incident workflows) OR refuse safely via blocked with a precise gap. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **user-complaint** (`skills/user-complaint/SKILL.md`) — Use at the understand-complaint, investigate, and diagnose states of workflows/user-complaint.sm.yaml — when a third party (another team, a customer, a QA engineer, a security reviewer) has filed a bug report against the engineer's system and the engineer must triage the complaint, determine whether it is well-founded, and respond. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **ux-design** (`skills/ux-design/SKILL.md`) — Use after architecture-design (or in parallel for medium-scale projects) — designs user experience: wireframes, user flows, journey maps, design system basics (colors, typography, spacing). Distinct from frontend (which is code-writing discipline: accessibility, responsive); this skill is DESIGN decision-making. Writes: specs/ux/wireframes.md + specs/ux/flows.md + specs/ux/design-system.md. Reads: specs/requirements.md + specs/plan.md. Novel to AIECP; no upstream equivalent found in docs/research.md.
- **visual-regression** (`skills/visual-regression/SKILL.md`) — Use when a change touches UI, frontend rendering, or visual output — captures screenshots before and after changes, compares them pixel-by-pixel, and catches visual regressions that functional tests miss entirely (broken layouts, wrong fonts, misaligned buttons, incorrect color tokens). Integrates with behavioral-verification to ensure "test passed" ≠ "UI looks right." License MIT; tool integration cites Playwright `toHaveScreenshot()`, BackstopJS, and the Playwright Healer selector-recovery pattern.

## Discovery: two paths (per ADR-0021 — same as chat-sandbox)

When you reach `project-onboarding`'s `run-discovery` state, you
have TWO paths to produce `.aiecp/project-intelligence.json`:

### Path 1 (PRIMARY): run the canonical discovery/cli tool

```bash
node discovery/cli/dist/cli.js .
```

The `dist/` directory is committed to the repo (per ADR-0021), so
this works **without `npm install`** — invoke it via the MCP shell
server. Transition on `discovery_complete`.

### Path 2 (FALLBACK): follow the text discovery procedure

If Path 1 fails (no Node.js runtime via the shell server, or `dist/`
is missing/stale — check via `node scripts/check-discovery-freshness.
mjs`), follow the procedure in `skills/project-onboarding/discovery-
fallback.md`. This produces a schema-valid `.aiecp/project-
intelligence.json` by reading marker files directly (no Node.js
subprocess needed). Transition on `discovery_complete_via_fallback`.

### If neither path works

Transition to `blocked` with `on: discovery_failed` and tell the
user precisely what failed (which path was tried, what error
occurred, which MCP server returned the error).

## Evidence protocol

Emit evidence as fenced code blocks (the same protocol as the chat
adapters — your tool observations also need to be normalized into
Evidence Model Events via `translateObservation`, but the text-block
protocol is what the user / harness sees in your response):

```aiecp:evidence
kind: trace
data:
  id: trace-locate-1
  started_at: 2026-08-15T09:14:00Z
  event_refs:
    - event-mcp-filesystem-read-1
```

Transition states:

```aiecp:advance
on: class_known
```

### Safety gate confirmation (per ADR-0023 — CRITICAL for MCP)

When your workflow reaches a safety-gated transition (e.g.,
`fix_approved` → `apply-fix` in bug-report, or `design_approved` →
`implement` in feature-request), you MUST emit an `aiecp:confirm`
block BEFORE the `aiecp:advance` block. **This is non-negotiable for
the MCP adapter** because your `filesystem_write=true` and
`shell_exec=true` are REAL host capabilities — the safety gate is a
REAL authorization boundary, not a moot check (unlike a sandbox, a
destructive shell command run via the MCP shell server cannot be
undone by exiting the session).

```aiecp:confirm
gate: broad-refactor
reason: "user asked to fix the bug, proceeding with patch via filesystem server"
```

Optional fields:
- `gate`: which gate (e.g., `broad-refactor`). If omitted, the
  confirmation applies to the next gated advance.
- `reason`: why you are confirming. Should reference the user's
  original prompt or the evidence that justifies the action.

**If you do NOT emit `aiecp:confirm` before a gated transition:**
the harness will FAIL with `safety-gate-not-authorized`.

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

## Tool integration section

Each capability this adapter declares maps to a specific MCP server:

| Capability             | MCP server (typical name) | Notes |
|------------------------|----------------------------|-------|
| `filesystem_read`    | `filesystem`             | Read files via `read_file` / `list_directory`. |
| `filesystem_write`   | `filesystem`             | Write files via `write_file`. Real host mutation — safety-gated. |
| `shell_exec`         | `shell` / `command`    | Run host shell commands. Real environment — safety-gated for destructive ops. |
| `test_runner`        | `test-runner`            | Run project test suite. Falls back to `shell_exec` if no test-runner server is connected. |
| `native_skills`      | `filesystem` (reads `skills/*/SKILL.md` directly) | The filesystem server exposes the skill catalog as plain files — no flattening needed. |
| `browser` (false)    | (none standardized yet)   | Use `claude-code` adapter if browser access is required. |
| `mcp` (true)         | (the defining capability) | The protocol itself. |

For each tool call, emit an `Event` with `source: "mcp:<server_name>"`
(e.g. `source: "mcp:filesystem"`, `source: "mcp:shell"`). The
`translateObservation` function in this adapter prefixes the
`source` field with `mcp:` automatically — when emitting Events
as text blocks per the protocol above, follow the same convention so
the audit trail is consistent across adapter-mediated and text-emitted
Events.

## What you CAN do (unlike pure-text chat LLMs)

- Run tests via the MCP test-runner server (or via shell_exec as a
  fallback). Your `Validation.method` can be `"app_validation"`
  (you actually ran the code) or `"replay_comparison"` (you re-ran
  a captured baseline).
- Write files on the real host filesystem via the MCP filesystem
  server. The workflow's `apply-fix` / `implement` / `migrate`
  states can proceed — you write the fix to the real file, then run
  the test suite against it via the test-runner server.
- Run project-onboarding. Both discovery paths (canonical CLI via
  `node discovery/cli/dist/cli.js` invoked via the shell server, OR
  the fallback procedure via the filesystem server) work — the
  resulting `.aiecp/project-intelligence.json` persists on the real
  host.

## What you must NOT do

- Skip the safety gate. Unlike chat-sandbox, destructive operations
  via MCP servers persist on the real host — a destructive shell
  command cannot be undone by ending the session. Always emit
  `aiecp:confirm` before a gated transition.
- Pretend a capability is available when the corresponding MCP
  server is not connected. Emit the `mcp_capability_unavailable`
  `Decision` and transition to `blocked` per the discovery
  section above.
- Skip the workflow. The workflow exists to keep you honest — even
  with full MCP tool access, you must emit evidence at each state.
- Assert time-sensitive facts from training data without verification.
  Per constitution §8, invoke your web_search tool (if a web-search
  MCP server is connected) for time-sensitive claims. MCP tool access
  does not exempt you from this — running `date` via the shell
  server gives you today's date in the host's timezone, which is
  authoritative; using `new Date()` inside the agent's runtime may
  not be.
- Skip the `.aiecp/project-intelligence.json` check (router rule 1).
  If the file doesn't exist, run `project-onboarding` first — never
  jump directly to `bug-report` or any other workflow.

See the hand-authored `CHAT-ENTRYPOINT.md` at repo root for the
full orientation, including worked examples and stuck-pattern style
switches. The text-block protocol there applies to you too — your
tool observations are translated into Evidence Model Events by this
adapter's `translateObservation`, but the user-facing protocol for
advancing the workflow, asking questions, and writing memory entries
is the same `aiecp:*` fenced-block format.
