---
name: tool-use-discipline
description: Use at every workflow state — forces the agent to invoke its available tools before answering from memory. The agent's own parametric knowledge is treated as a hypothesis to be verified, never as ground truth. Triggered specifically when the agent is about to assert a fact, write code, or propose a fix. Operationalizes forthcoming constitution §8 ('Tool use is mandatory, not optional'). Distinct from `evidence-engineering` (which is about emitting evidence correctly); this skill is about gathering evidence via tools before any conclusion is reached.
license: MIT
allowed-tools: [shell_exec, test_runner, filesystem_read]
---

# Tool Use Discipline

## When to use this skill

Use at every workflow state. This is a meta-skill that applies
across all states, not to a specific one. The trigger is internal:
the agent notices (or is told to notice) that it is about to assert
a fact, write code, or propose a fix *from memory* — without first
invoking a tool to verify the assertion.

**Especially when:**

- The agent's first instinct is to answer a question directly ("the
  latest version of X is Y") rather than search for it.
- The agent is about to write code without first reading the
  surrounding code or writing a failing test.
- The agent is about to diagnose a bug from memory of "similar code"
  rather than reading the actual code at the actual line.
- The agent is about to recommend an architectural pattern from
  training-data familiarity rather than reading the project's actual
  structure.

**Don't use as a substitute for `evidence-engineering`:** that skill
is about correctly emitting Evidence Model entities *once evidence
exists*. This skill is about *gathering* evidence via tools *before*
any conclusion is reached. The two compose: this skill decides *what
to verify*; `evidence-engineering` decides *how to record what was
verified*. Distinct from `recency-verification` (which handles the
time-sensitivity dimension specifically) and `quality-gate` (which
handles code-quality verification after code is written).

## Procedure

### 1. Inventory available tools

Before answering any user request, enumerate every tool the agent's
adapter declares (per `adapters/agents/<adapter>/adapter.ts`
`capabilities()`). The inventory is what is *actually available* in
this run — not what the agent "thinks" should be available.

For chat LLMs (`adapters/agents/src/chat/adapter.ts`): the chat
adapter declares `filesystem_read`, `filesystem_write`, `shell_exec`,
`test_runner`, `browser`, `mcp` all as `false` — chat LLMs follow
the `CHAT-ENTRYPOINT.md` text-encoding protocol instead. The
"tools" available to a chat LLM are the chat-host's paste-buffer,
web search (if the chat host has browsing), code execution (if the
chat host has a sandbox), and file upload (if the chat host supports
it). None of these are declared in `AgentCapabilities`; the chat
adapter explicitly opts out and the agent must work in
`method: "manual_review"` mode for evidence it cannot gather
directly.

For CLI agents (`adapters/agents/src/claude-code/adapter.ts`,
`adapters/agents/src/codex/adapter.ts`): `filesystem_read`,
`filesystem_write`, `shell_exec`, `test_runner`, `browser`, `mcp`
are declared per the adapter's actual capability row in
`docs/portability.md`.

Record the inventory as a `Trace` of `Event`s, one `Event` per
tool with `kind: "observation"` and `payload.available: true|false`.
This `Trace` is the ground truth the rest of the procedure consults
to decide whether a mandatory tool from step 3 is reachable.

### 2. Identify what the request needs

Classify the request into one of:

- **(a) Factual claim about external state** — library version, API
  behavior, current date, current syntax. The claim is about
  something outside the repository that could have changed since
  the agent's training data was collected.
- **(b) Code generation** — writing new code, refactoring existing
  code, or modifying code.
- **(c) Bug diagnosis** — explaining why something does not work.
- **(d) Architectural recommendation** — recommending how something
  should be structured, what library to use, what pattern to
  follow.
- **(e) Review or assessment** — judging code, a design, or a
  decision someone else made.

Each class has a *mandatory tool* per the table in step 3. If the
agent is about to skip the mandatory tool for the class identified,
emit a `Decision` with `what: "tool_use_skipped:<tool_name>"` and
`validated: false`. This is a process violation; the agent should
self-correct before proceeding (see step 5).

A request may span multiple classes — "rewrite this function so it
matches the latest passport.js API" is both (a) factual claim and
(b) code generation, with two mandatory tools each. Apply the
mandatory-tool table to every class the request touches, not just
the dominant one.

### 3. Mandatory tool table (the heart of this skill)

The table below maps each request class to the tool whose invocation
is mandatory before the request can be answered. The "why" column
explains the failure mode the mandatory tool prevents — read it
before deciding the mandatory tool "doesn't apply this time."

| Request class | Mandatory tool | Why |
|---|---|---|
| Library/framework version claim | `web_search` (if available) | Training data is 1-2 years stale; the current version may have breaking changes the agent does not know about |
| Syntax/API claim | `web_search` (if available) + `shell_exec` (try compiling/running a snippet) | The agent may "remember" deprecated syntax that no longer compiles |
| "Current date is..." | `shell_exec: date` (CLI) or `web_search: today's date` (chat) | The agent's training cutoff is not "today"; asserting today's date from memory is hallucination by definition |
| Code generation | `filesystem_read` (read the surrounding code for context) + `test_runner` (write a failing test first per TDD) | Code without reading its surroundings violates the project's conventions; code without tests is a hypothesis, not a deliverable |
| Bug diagnosis | `shell_exec` (run reproduction) + `filesystem_read` (read the actual code, not memory of similar code) | Per `systematic-debugging` Phase 1 ("Evidence before explanation"); memory-based diagnosis is a guess |
| Architectural recommendation | `filesystem_read` (read the actual project structure) + `web_search` (check current best practices, since they evolve) | "Best practice" from 2024 may be deprecated in 2026; an architectural recommendation that does not consult the actual project is generic to the point of useless |
| Review/assessment | `filesystem_read` (read the actual diff) + `shell_exec` (run any linters/formatters the project has) | Reviewing from memory of "what the diff probably says" is hallucinated review; reviewing without running linters is half a review |

If a mandatory tool is not available (per the step-1 inventory),
the workflow must transition to `blocked` with `on: tool_unavailable`
rather than proceeding without the mandatory tool. Proceeding
without is the failure mode this skill exists to prevent.

### 4. Tool invocation evidence

Every tool invocation emits an `Event` (`evidence/schema/event.
schema.json`) with:

- `kind: "action"` (the agent did something — `event.schema.json`'s
  `kind` enum includes `action` for exactly this case)
- `source: "<adapter_id>:<tool_name>"` (e.g. `claude-code:shell_exec`,
  `chat:web_search`, `codex:test_runner`)
- `payload` containing the tool's input and output, redacted per
  `evidence-engineering` step 4 (no raw secret values; long outputs
  truncated to the meaningful prefix)

Every tool *skipped* when mandatory per step 3 emits a `Decision`
(`evidence/schema/decision.schema.json`) with:

- `what: "tool_use_skipped:<tool_name>"`
- `validated: false`
- `result: "rejected"`
- `why` — the reason the agent skipped (e.g. "no tool available",
  "agent defaulted to memory-based answer")

The agent must then either invoke the tool (and update the
`Decision` to `result: "accepted"` with an `evidence_refs` entry
pointing at the resulting `Event`) or transition to `blocked` with
`on: tool_unavailable`. A `Decision` left in `result: "rejected"`
state is a process violation that must not be carried silently into
the workflow's `report` state.

### 5. Self-correction loop

If the agent catches itself about to answer from memory when a
mandatory tool exists, it must:

1. **Stop.** Do not emit the memory-based answer.
2. **Emit the `tool_use_skipped:<tool_name>` `Decision`** with
   `validated: false`, `result: "rejected"`.
3. **Invoke the tool.** Emit the tool-result `Event` of
   `kind: "action"`.
4. **Revise the answer** based on the tool's output.
5. **If the revised answer differs from the memory-based answer**
   (it often does), record the difference in the `Decision.why`
   field — the difference is the value this skill provides.

The revised answer is the one that goes into the workflow's
subsequent state or final `report`. The original memory-based
answer is discarded; it was a hypothesis, not a deliverable.

## Tool integration

- **`shell_exec`**: invoked for `date` (current date), `git log`
  (recent changes), `git diff` (actual code state), `npm test` /
  `pytest` / equivalent (test runs), `npx tsc --noEmit` (type
  checks), and project-specific linters (`npm run lint`,
  `ruff check .`, `golangci-lint run`). One-shot, scriptable
  commands preferred — the output must be replayable by a future
  `Replay` step.
- **`test_runner`**: invoked for any code-generation request,
  TDD-style — write a failing test first, then write code that
  makes it pass. A code change without a test is a `Decision` with
  `validated: false` that no `Validation` will ever flip.
- **`filesystem_read`**: invoked before any architectural
  recommendation to read the actual project structure rather than
  guessing; invoked before any code generation to read the
  surrounding code for conventions; invoked before any review to
  read the actual diff rather than memory of "what the diff
  probably says."

## Validation

This skill is considered successful for a given run only if:

- Every request class in step 3 that applied to the run has at
  least one `Event` of `kind: "action"` proving the mandatory tool
  was invoked. The `Event.source` must reference the mandatory tool
  by name (e.g. `claude-code:shell_exec` for a current-date check).
- No `Decision` with `what: "tool_use_skipped:<tool_name>"` is left
  in `result: "rejected"` state. Either the tool was later invoked
  (and the Decision updated to `result: "accepted"` with an
  `evidence_refs` entry pointing at the resulting `Event`), or the
  workflow transitioned to `blocked` with `on: tool_unavailable`.
- For chat LLMs (which have no `shell_exec` or `filesystem_read`):
  every mandatory-tool requirement that cannot be met transitions
  the workflow to `blocked` with `on: tool_unavailable` and a
  precise gap statement. The agent does NOT silently answer from
  memory just because it has no tools — that is exactly the failure
  mode this skill exists to prevent.

## Examples

**Happy path:** User asks "what's the latest version of React?" →
agent's first instinct is to answer from memory ("React 18, I
think") → this skill fires → step 1 inventory shows `web_search`
available in the chat host → step 2 classifies as (a) factual claim
about external state → step 3 mandatory tool for "Library/framework
version claim" is `web_search` → agent invokes `web_search` with
query `"latest React version 2026"` → result: "React 19.x released
2025-12" → agent revises answer from "React 18" to "React 19.x" →
emits `Event` of `kind: "action"`, `source: "chat:web_search"`,
`payload.query: "latest React version 2026"`,
`payload.result_summary: "React 19.x released 2025-12"` → emits
`Decision` with `what: "fact_verified_via_tool:web_search"`,
`validated: true`, `result: "accepted"`. Without this skill, the
agent would have shipped a stale answer that misleads the user into
writing React 18 code in a React 19 world.

**Failure mode:** User asks "rewrite this function" → agent's first
instinct is to write the new code → this skill fires → step 2
classifies as (b) code generation → step 3 mandatory tools are
`test_runner` (TDD: failing test first) and `filesystem_read`
(surrounding context) → agent skips both and starts writing code →
step 4 emits `Decision` with `what: "tool_use_skipped:test_runner"`,
`validated: false`, `result: "rejected"` → step 5 self-correction
loop fires → agent must either invoke `test_runner` (write the
failing test) and `filesystem_read` (read the surrounding code), or
transition to `blocked` with `on: tool_use_skipped`. Without this
skill, the agent would have shipped untested code as a deliverable,
and the workflow's `verify` state would have nothing concrete to
validate against (no test, no expected behavior assertion).

## Why this skill exists (read this before skipping it)

LLMs, including very capable ones, suffer from a specific failure
mode: they conflate "I have seen this pattern in training data"
with "I know this is currently true." For static facts (the
Pythagorean theorem, the syntax of `for` loops in Python) the
conflation is harmless — the fact has not changed. For anything
time-sensitive — library versions, API behaviors, current best
practices, syntax in actively-evolving languages, today's date —
it produces hallucinations that look authoritative.

This skill exists to make the agent treat its own memory as a
hypothesis and verify it via tools before asserting it as fact.
The cost is one extra tool call per claim; the benefit is not
shipping stale-wrong answers. Operationalizes the forthcoming
constitution §8 ("Tool use is mandatory, not optional") at the
procedure layer; complements `recency-verification` (which handles
the time-sensitivity dimension specifically) and `quality-gate`
(which handles code-quality verification after code is written).
