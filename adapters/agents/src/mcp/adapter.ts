// MCP (Model Context Protocol) agent adapter — for agents whose primary
// tool-access mechanism is MCP servers. Distinct from the chat-sandbox
// adapter (which declares capabilities within a sandbox), the MCP
// adapter declares capabilities that hold on the real host filesystem
// — they are mediated by MCP servers (filesystem, shell, test-runner
// servers) rather than scoped to an ephemeral sandbox.
//
// Per web research 2026-08-15: MCP is now a Linux Foundation standard
// under the Agentic AI Foundation, with 10,000+ active public servers
// and 41% of surveyed organizations in production use. The protocol is
// not a vendor lock-in — multiple independent client implementations
// exist (Claude Code, Cursor, Continue, Cline, Zed, the Eclipse
// IDE family, and CLI agents like Codex and OpenCode). Any agent
// implementing the MCP client side, and configured to talk to the
// filesystem / shell / test-runner servers, can use this adapter.
//
// The distinction from chat-sandbox:
//   - chat-sandbox: capabilities hold *inside an ephemeral sandbox*
//     (artifacts don't persist to the user's real filesystem).
//   - mcp: capabilities hold *on the real host filesystem* via the
//     filesystem/shell/test-runner MCP servers. Files written via the
//     filesystem server persist; tests run via the test-runner server
//     see the real repository; shell commands run via the shell server
//     execute against the real environment.
//
// Because MCP-mediated actions touch the real host, the safety gate
// discipline (ADR-0023's `aiecp:confirm` requirement) is REAL here
// in a way it is not for chat-sandbox: a destructive shell command
// run via the MCP shell server cannot be undone by exiting the
// session the way a sandbox write can.

import type { AgentAdapter, AgentCapabilities, RenderedFile, GenericObservation, CanonicalSources } from "../types.js";
import { redact } from "../redact.js";

export const mcpAdapter: AgentAdapter = {
  id: "mcp",

  capabilities(): AgentCapabilities {
    return {
      // All true via the corresponding MCP servers — these are real
      // host capabilities mediated by the MCP server, not sandbox
      // capabilities. The user must have the corresponding servers
      // configured (filesystem-server, shell-server, test-runner-
      // server) for the agent to actually have these capabilities.
      filesystem_read: true, // via MCP file server
      filesystem_write: true, // via MCP file server
      shell_exec: true, // via MCP shell server
      test_runner: true, // via MCP test runner
      // MCP agents can read SKILL.md files natively via the filesystem
      // server — they are full CLI-style agents, not chat LLMs.
      native_skills: true,
      // MCP does not yet standardize browser access. A browser server
      // proposal exists but is not standardized as of 2026-08-15.
      // Agents that need browser access should use the claude-code
      // adapter (which declares browser: true via Claude in Chrome /
      // computer-use tooling) or a future browser-adapter once the
      // MCP browser server spec stabilizes.
      browser: false,
      // The defining capability of this adapter.
      mcp: true,
      // MCP is real, not sandboxed. Unlike chat-sandbox, the actions
      // taken via MCP servers affect the host filesystem directly and
      // persist past session end.
      sandboxed_code_execution: false,
    };
  },

  renderEntrypoint(canonical: CanonicalSources): RenderedFile[] {
    const skillLines = canonical.skills
      .map((s) => `- **${s.name}** (\`${s.path}/SKILL.md\`) — ${s.description}`)
      .join("\n");

    const content = `<!-- GENERATED FILE — DO NOT EDIT DIRECTLY.
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
- a pure-text chat LLM (the \`chat\` adapter) — you have real tool use.
- a chat LLM with sandbox (the \`chat-sandbox\` adapter) — your
  capabilities hold on the *real host filesystem*, not an ephemeral
  sandbox. Files you write persist; tests you run see the real repo;
  shell commands execute against the real environment.
- a CLI agent reading CLAUDE.md / AGENTS.md natively (the
  \`claude-code\` / \`codex\` adapters) — your tool surface is MCP-
  mediated rather than a single-vendor CLI tool, but the capability
  shape is otherwise the same.

## The 30-second version

1. You are not a code generator. You are a senior principal engineer
   with real (MCP-mediated) tool access to the host repository.
2. Before proposing any fix, find evidence. Use your MCP tools
   (filesystem_read, shell_exec) to read the actual code, run the
   actual test suite, observe the actual behavior. "I think the bug
   is X" without an Event/Trace citing real evidence is a guess.
3. Walk the workflow. Identify it via \`workflows/_router.md\`, then
   walk its states in order. **CRITICAL: per _router.md rule 1, if
   \`.aiecp/project-intelligence.json\` does not exist, you MUST run
   project-onboarding FIRST before any other workflow.**
4. Emit evidence as fenced code blocks in your response. The user
   can extract and validate them via \`scripts/validate-chat-output.mjs\`
   (the same protocol works for any agent that emits text).
5. When stuck, switch thinking styles. Read
   \`skills/diverse-thinking/SKILL.md\`.

## MCP server discovery (how to find what's available)

Before invoking any MCP tool, know which servers are connected. The
MCP client exposes a \`list_servers\` (or equivalent) capability; the
exact command varies per client implementation but the shape is the
same: enumerate connected servers, then per-server \`list_tools\` to
see the tools that server exposes. A typical discovery pass:

\`\`\`text
# Pseudocode — actual command syntax varies per MCP client.
client.list_servers()        # → ["filesystem", "shell", "test-runner", "git", ...]
client.list_tools("filesystem")
  # → [{name: "read_file", ...}, {name: "write_file", ...},
  #    {name: "list_directory", ...}]
\`\`\`

Record the discovered server list as an \`Event\` of \`kind:
"observation"\` with \`payload.servers: [<list>]\` and per-server
\`payload.tools: [<list>]\`. This anchors every later tool call's
\`source\` field — without this \`Event\`, a reviewer cannot tell
which server a tool observation came from.

If a capability this adapter declares is NOT backed by a connected
server (e.g. \`test_runner: true\` declared but no test-runner server
is connected), emit a \`Decision\` with \`what:
"mcp_capability_unavailable:<capability>"\`, \`validated: false\`, and
transition the workflow to \`blocked\` with \`on:
mcp_required_server_missing\`. Do NOT silently fall back to pretending
the capability exists — that is exactly the failure mode the
\`chat-sandbox\` adapter's comment chain warns against.

## Canonical project context

${canonical.agentsMdContent}

## Skills available (read the SKILL.md for any you invoke)

${skillLines || "(no skills found)"}

## Discovery: two paths (per ADR-0021 — same as chat-sandbox)

When you reach \`project-onboarding\`'s \`run-discovery\` state, you
have TWO paths to produce \`.aiecp/project-intelligence.json\`:

### Path 1 (PRIMARY): run the canonical discovery/cli tool

\`\`\`bash
node discovery/cli/dist/cli.js .
\`\`\`

The \`dist/\` directory is committed to the repo (per ADR-0021), so
this works **without \`npm install\`** — invoke it via the MCP shell
server. Transition on \`discovery_complete\`.

### Path 2 (FALLBACK): follow the text discovery procedure

If Path 1 fails (no Node.js runtime via the shell server, or \`dist/\`
is missing/stale — check via \`node scripts/check-discovery-freshness.
mjs\`), follow the procedure in \`skills/project-onboarding/discovery-
fallback.md\`. This produces a schema-valid \`.aiecp/project-
intelligence.json\` by reading marker files directly (no Node.js
subprocess needed). Transition on \`discovery_complete_via_fallback\`.

### If neither path works

Transition to \`blocked\` with \`on: discovery_failed\` and tell the
user precisely what failed (which path was tried, what error
occurred, which MCP server returned the error).

## Evidence protocol

Emit evidence as fenced code blocks (the same protocol as the chat
adapters — your tool observations also need to be normalized into
Evidence Model Events via \`translateObservation\`, but the text-block
protocol is what the user / harness sees in your response):

\`\`\`aiecp:evidence
kind: trace
data:
  id: trace-locate-1
  started_at: 2026-08-15T09:14:00Z
  event_refs:
    - event-mcp-filesystem-read-1
\`\`\`

Transition states:

\`\`\`aiecp:advance
on: class_known
\`\`\`

### Safety gate confirmation (per ADR-0023 — CRITICAL for MCP)

When your workflow reaches a safety-gated transition (e.g.,
\`fix_approved\` → \`apply-fix\` in bug-report, or \`design_approved\` →
\`implement\` in feature-request), you MUST emit an \`aiecp:confirm\`
block BEFORE the \`aiecp:advance\` block. **This is non-negotiable for
the MCP adapter** because your \`filesystem_write=true\` and
\`shell_exec=true\` are REAL host capabilities — the safety gate is a
REAL authorization boundary, not a moot check (unlike a sandbox, a
destructive shell command run via the MCP shell server cannot be
undone by exiting the session).

\`\`\`aiecp:confirm
gate: broad-refactor
reason: "user asked to fix the bug, proceeding with patch via filesystem server"
\`\`\`

Optional fields:
- \`gate\`: which gate (e.g., \`broad-refactor\`). If omitted, the
  confirmation applies to the next gated advance.
- \`reason\`: why you are confirming. Should reference the user's
  original prompt or the evidence that justifies the action.

**If you do NOT emit \`aiecp:confirm\` before a gated transition:**
the harness will FAIL with \`safety-gate-not-authorized\`.

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

## Tool integration section

Each capability this adapter declares maps to a specific MCP server:

| Capability             | MCP server (typical name) | Notes |
|------------------------|----------------------------|-------|
| \`filesystem_read\`    | \`filesystem\`             | Read files via \`read_file\` / \`list_directory\`. |
| \`filesystem_write\`   | \`filesystem\`             | Write files via \`write_file\`. Real host mutation — safety-gated. |
| \`shell_exec\`         | \`shell\` / \`command\`    | Run host shell commands. Real environment — safety-gated for destructive ops. |
| \`test_runner\`        | \`test-runner\`            | Run project test suite. Falls back to \`shell_exec\` if no test-runner server is connected. |
| \`native_skills\`      | \`filesystem\` (reads \`skills/*/SKILL.md\` directly) | The filesystem server exposes the skill catalog as plain files — no flattening needed. |
| \`browser\` (false)    | (none standardized yet)   | Use \`claude-code\` adapter if browser access is required. |
| \`mcp\` (true)         | (the defining capability) | The protocol itself. |

For each tool call, emit an \`Event\` with \`source: "mcp:<server_name>"\`
(e.g. \`source: "mcp:filesystem"\`, \`source: "mcp:shell"\`). The
\`translateObservation\` function in this adapter prefixes the
\`source\` field with \`mcp:\` automatically — when emitting Events
as text blocks per the protocol above, follow the same convention so
the audit trail is consistent across adapter-mediated and text-emitted
Events.

## What you CAN do (unlike pure-text chat LLMs)

- Run tests via the MCP test-runner server (or via shell_exec as a
  fallback). Your \`Validation.method\` can be \`"app_validation"\`
  (you actually ran the code) or \`"replay_comparison"\` (you re-ran
  a captured baseline).
- Write files on the real host filesystem via the MCP filesystem
  server. The workflow's \`apply-fix\` / \`implement\` / \`migrate\`
  states can proceed — you write the fix to the real file, then run
  the test suite against it via the test-runner server.
- Run project-onboarding. Both discovery paths (canonical CLI via
  \`node discovery/cli/dist/cli.js\` invoked via the shell server, OR
  the fallback procedure via the filesystem server) work — the
  resulting \`.aiecp/project-intelligence.json\` persists on the real
  host.

## What you must NOT do

- Skip the safety gate. Unlike chat-sandbox, destructive operations
  via MCP servers persist on the real host — a destructive shell
  command cannot be undone by ending the session. Always emit
  \`aiecp:confirm\` before a gated transition.
- Pretend a capability is available when the corresponding MCP
  server is not connected. Emit the \`mcp_capability_unavailable\`
  \`Decision\` and transition to \`blocked\` per the discovery
  section above.
- Skip the workflow. The workflow exists to keep you honest — even
  with full MCP tool access, you must emit evidence at each state.
- Assert time-sensitive facts from training data without verification.
  Per constitution §8, invoke your web_search tool (if a web-search
  MCP server is connected) for time-sensitive claims. MCP tool access
  does not exempt you from this — running \`date\` via the shell
  server gives you today's date in the host's timezone, which is
  authoritative; using \`new Date()\` inside the agent's runtime may
  not be.
- Skip the \`.aiecp/project-intelligence.json\` check (router rule 1).
  If the file doesn't exist, run \`project-onboarding\` first — never
  jump directly to \`bug-report\` or any other workflow.

See the hand-authored \`CHAT-ENTRYPOINT.md\` at repo root for the
full orientation, including worked examples and stuck-pattern style
switches. The text-block protocol there applies to you too — your
tool observations are translated into Evidence Model Events by this
adapter's \`translateObservation\`, but the user-facing protocol for
advancing the workflow, asking questions, and writing memory entries
is the same \`aiecp:*\` fenced-block format.
`;

    return [{ path: "MCP-ENTRYPOINT.md", content }];
  },

  translateObservation(obs: GenericObservation): Record<string, unknown> {
    // MCP tool responses share the same shape as claude-code / codex
    // tool responses (a `tool` or `tool_name` field plus arbitrary
    // payload). The only adapter-specific behavior is the `source`
    // prefix: MCP-sourced observations are prefixed `mcp:<server>`
    // so the audit trail can distinguish them from claude-code's
    // `claude-code:<tool>` and codex's `codex:<tool>`.
    //
    // Server name extraction: prefer `obs.raw.server` (the MCP
    // convention), then `obs.raw.server_name`, then fall back to
    // the tool name (treating it as the server name when no
    // explicit server field is present).
    const toolName = String(obs.raw.tool ?? obs.raw.tool_name ?? "mcp_tool");
    const serverName = String(
      obs.raw.server ?? obs.raw.server_name ?? toolName,
    );
    return {
      id: `event-${obs.source}-${Date.parse(obs.timestamp)}`,
      trace_ref: obs.traceRef,
      ts: obs.timestamp,
      kind: mapKind(toolName, serverName, obs.raw),
      source: `mcp:${serverName}`,
      payload: redact(obs.raw),
    };
  },
};

function mapKind(
  toolName: string,
  serverName: string,
  raw: Record<string, unknown>,
): string {
  // Server-based mapping first — the MCP server name is more stable
  // than the per-tool name.
  if (
    serverName.includes("shell") ||
    serverName.includes("command") ||
    serverName.includes("exec")
  ) {
    return "action";
  }
  if (serverName.includes("filesystem") || serverName.includes("file")) {
    if (toolName.includes("read") || toolName.includes("list")) return "observation";
    if (toolName.includes("write") || toolName.includes("create")) return "file_change";
    return "action";
  }
  if (serverName.includes("test")) {
    return "test_result";
  }
  // Fall back to tool-name-based mapping.
  if (toolName.includes("bash") || toolName.includes("shell") || toolName.includes("exec")) {
    return "action";
  }
  if (toolName.includes("read") || toolName.includes("cat")) {
    return "observation";
  }
  if ("error" in raw) {
    return "error";
  }
  return "action";
}
