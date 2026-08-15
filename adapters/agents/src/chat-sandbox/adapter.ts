// Chat-with-sandbox adapter — for chat LLMs that have a sandboxed
// code execution environment (ChatGPT Code Interpreter / Advanced
// Data Analysis, Claude's code execution tool, Gemini's code
// execution, GLM-4.5+ with code execution, etc.).
//
// This adapter exists because the original chat adapter (commit
// ff4afbc) assumed ALL chat LLMs have zero capabilities — filesystem,
// shell, test_runner all false. This was proven wrong by a real
// ChatGPT session (2026-08-14) that correctly detected it should
// route to project-onboarding per workflows/_router.md rule 1
// (".aiecp/project-intelligence.json missing → project-onboarding
// first"), but couldn't proceed because the chat adapter declared
// filesystem_write=false. The framework's router was right, the
// chat LLM was right, but the adapter's capability model was wrong
// — it conflated "no real filesystem" with "no sandboxed code
// execution," which are different things.
//
// The distinction:
//   - chat-pure-text (the original `chat` adapter): no code execution
//     at all. All capabilities false. Can only read pasted text and
//     emit text. Must transition to blocked on
//     requires_filesystem_write_capability.
//   - chat-sandbox (THIS adapter): has a sandboxed Python (or other)
//     environment. Within the sandbox: can read files (filesystem_read
//     = true), run shell commands (shell_exec = true), run tests
//     (test_runner = true), and write artifacts (filesystem_write =
//     true). The artifacts persist within the sandbox for the
//     session's lifetime. This means the agent CAN drive
//     project-onboarding (which writes .aiecp/project-intelligence.json)
//     — the file just lives in the sandbox, not on the user's real
//     filesystem.
//
// Per docs/portability.md's adapter contract: every adapter declares
// its capabilities honestly. This adapter declares sandboxed
// capabilities — they're real within the sandbox, but the user
// should be aware that .aiecp/ artifacts written this way do NOT
// persist to the user's real filesystem unless the user manually
// copies them out.

import type { AgentAdapter, AgentCapabilities, RenderedFile, GenericObservation, CanonicalSources } from "../types.js";

export const chatSandboxAdapter: AgentAdapter = {
  id: "chat-sandbox",

  capabilities(): AgentCapabilities {
    return {
      // Within the sandbox, all of these are TRUE — the agent can
      // actually run code, read files, write artifacts, and run
      // tests. The sandbox is a real (if ephemeral) environment.
      filesystem_read: true,
      filesystem_write: true,
      shell_exec: true,
      test_runner: true,
      // Chat LLMs still cannot read SKILL.md files natively in the
      // chat UI — they must be told to read them via shell_exec
      // inside the sandbox. So native_skills stays false.
      native_skills: false,
      // No browser inside the typical sandbox (unless the host
      // explicitly provides one — rare).
      browser: false,
      // MCP is not typically available in chat sandboxes.
      mcp: false,
      // The defining capability of this adapter.
      sandboxed_code_execution: true,
    };
  },

  renderEntrypoint(canonical: CanonicalSources): RenderedFile[] {
    const skillLines = canonical.skills
      .map((s) => `- **${s.name}** (\`${s.path}/SKILL.md\`) — ${s.description}`)
      .join("\n");

    const content = `<!-- GENERATED FILE — DO NOT EDIT DIRECTLY.
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
3. Walk the workflow. Identify it via \`workflows/_router.md\`, then
   walk its states in order. **CRITICAL: per _router.md rule 1, if
   \`.aiecp/project-intelligence.json\` does not exist, you MUST run
   project-onboarding FIRST before any other workflow.** This is
   not optional — the other workflows depend on the memory entries
   that project-onboarding writes.
4. Emit evidence as fenced code blocks in your response. The user
   can extract and validate them via \`scripts/validate-chat-output.mjs\`.
5. When stuck, switch thinking styles. Read
   \`skills/diverse-thinking/SKILL.md\`.

## Canonical project context

${canonical.agentsMdContent}

## Skills available (read the SKILL.md for any you invoke)

${skillLines || "(no skills found)"}

## Discovery: two paths (per ADR-0021 — CRITICAL for offline sandboxes)

When you reach \`project-onboarding\`'s \`run-discovery\` state, you
have TWO paths to produce \`.aiecp/project-intelligence.json\`:

### Path 1 (PRIMARY): run the canonical discovery/cli tool

\`\`\`bash
node discovery/cli/dist/cli.js .
\`\`\`

The \`dist/\` directory is committed to the repo (per ADR-0021), so
this works **without \`npm install\`** — even in an offline sandbox.
This is the preferred path because it uses the canonical detector
pipeline. Transition on \`discovery_complete\`.

### Path 2 (FALLBACK): follow the text discovery procedure

If Path 1 fails (no Node.js runtime in your sandbox, or \`dist/\`
is missing/stale — check via
\`node scripts/check-discovery-freshness.mjs\`), follow the procedure
in \`skills/project-onboarding/discovery-fallback.md\`. This produces
a schema-valid \`.aiecp/project-intelligence.json\` by reading marker
files directly (no Node.js subprocess needed). Transition on
\`discovery_complete_via_fallback\`.

The fallback procedure sets \`discovery_method:
"chat-sandbox-fallback-procedure"\` in the produced JSON so the
audit trail distinguishes it from canonical-CLI-produced Project
Intelligence.

### If neither path works

Transition to \`blocked\` with \`on: discovery_failed\` and tell
the user precisely what failed (which path was tried, what error
occurred).

## Evidence protocol

Emit evidence as fenced code blocks:

\`\`\`aiecp:evidence
kind: trace
data:
  id: trace-locate-1
  started_at: 2026-08-14T10:32:00Z
  event_refs:
    - event-grep-result
\`\`\`

Transition states:

\`\`\`aiecp:advance
on: class_known
\`\`\`

### Safety gate confirmation (per ADR-0023 — IMPORTANT)

When your workflow reaches a safety-gated transition (e.g.,
\`fix_approved\` → \`apply-fix\` in bug-report, or \`design_approved\` →
\`implement\` in feature-request), you MUST emit an \`aiecp:confirm\`
block BEFORE the \`aiecp:advance\` block. This is because your
chat-sandbox adapter has \`filesystem_write=true\` (per ADR-0020) —
you CAN actually write files, so the safety gate is a REAL
authorization boundary, not a moot check.

The \`aiecp:confirm\` block tells the harness (and the user) that
you are explicitly authorizing the gated action:

\`\`\`aiecp:confirm
gate: broad-refactor
reason: "user asked to fix the bug, proceeding with patch"
\`\`\`

Optional fields:
- \`gate\`: which gate (e.g., \`broad-refactor\`). If omitted, the
  confirmation applies to the next gated advance.
- \`reason\`: why you are confirming. Should reference the user's
  original prompt or the evidence that justifies the action.

**If you do NOT emit \`aiecp:confirm\` before a gated transition:**
the harness will FAIL with \`safety-gate-not-authorized\`. The user
can also authorize via the \`--user-prompt\` argument (if their
original prompt contained authorization keywords like "fix",
"düzelt", "apply", "uygula"), but emitting \`aiecp:confirm\` yourself
is the cleaner, more explicit approach.

**When to emit \`aiecp:confirm\`:** before every \`aiecp:advance\`
that crosses a safety gate. The workflow's \`.sm.yaml\` declares
which states have gates (look for \`safety_gates:\` in the workflow
definition). For \`bug-report\`, the gated transitions are
\`fix_approved\` (at \`propose-fix\`) and \`fix_applied\` (at
\`apply-fix\`).

Ask questions (subject to question_economy):

\`\`\`aiecp:question
text: "Is this affecting all users or a subset?"
\`\`\`

Write memory entries:

\`\`\`aiecp:memory
type: known-failure
data:
  id: mem-known-failure-...
  ...
\`\`\`

## What you CAN do (unlike pure-text chat LLMs)

- Run tests via shell_exec in the sandbox. Your \`Validation.method\`
  can be \`"app_validation"\` (you actually ran the code) or
  \`"replay_comparison"\` (you re-ran a captured baseline).
- Write files in the sandbox. The workflow's \`apply-fix\` /
  \`implement\` / \`migrate\` states can proceed — you write the
  fix to a file in the sandbox, then run the test suite against it.
- Run project-onboarding. Both discovery paths (canonical CLI via
  \`node discovery/cli/dist/cli.js\`, OR the fallback procedure)
  work in your sandbox — the resulting
  \`.aiecp/project-intelligence.json\` lives in the sandbox.

## What you must NOT do

- Pretend artifacts persist to the user's real filesystem. They don't.
  At the \`report\` state, tell the user explicitly which files they
  need to copy out of your sandbox to persist the work.
- Skip the workflow. The workflow exists to keep you honest — even
  with code execution, you must emit evidence at each state.
- Assert time-sensitive facts from training data without verification.
  Per constitution §8, you must invoke your web_search tool (if
  available) for time-sensitive claims. Code execution does not
  exempt you from this — running \`python -c "import datetime;
  print(datetime.date.today())"\` in the sandbox gives you today's
  date in the sandbox's timezone, which may differ from the user's.
- Skip the \`.aiecp/project-intelligence.json\` check (router rule 1).
  If the file doesn't exist, you MUST run \`project-onboarding\`
  first — never jump directly to \`bug-report\` or any other workflow.

See the hand-authored \`CHAT-ENTRYPOINT.md\` at repo root for the
full orientation, including worked examples and stuck-pattern style
switches. The pure-text protocol there applies to you too, except
where this file explicitly overrides it (you have code execution).
`;

    return [{ path: "CHAT-ENTRYPOINT-SANDBOX.md", content }];
  },

  translateObservation(obs: GenericObservation): Record<string, unknown> {
    // Chat-sandbox agents CAN produce raw tool observations (shell
    // output, file reads) — unlike pure-text chat LLMs. We normalize
    // them the same way claude-code does, since the sandbox is
    // effectively a shell environment.
    const toolName = String(obs.raw.tool ?? obs.raw.tool_name ?? "sandbox_tool");
    return {
      id: `event-${obs.source}-${Date.parse(obs.timestamp)}`,
      trace_ref: obs.traceRef,
      ts: obs.timestamp,
      kind: mapKind(toolName, obs.raw),
      source: `chat-sandbox:${toolName}`,
      payload: obs.raw,
    };
  },
};

function mapKind(toolName: string, raw: Record<string, unknown>): string {
  if (toolName.includes("bash") || toolName.includes("shell") || toolName.includes("python")) return "action";
  if (toolName.includes("read") || toolName.includes("cat")) return "observation";
  if ("error" in raw) return "error";
  return "action";
}
