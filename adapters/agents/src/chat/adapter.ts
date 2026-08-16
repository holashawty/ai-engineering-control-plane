// Chat LLM adapter (pure-text) — implements the same AgentAdapter
// contract as claude-code and codex, but for chat-based LLMs that
// have NO tool use (no Code Interpreter, no sandboxed execution).
// Examples: ChatGPT without Code Interpreter, Claude chat without
// code execution tool, Gemini chat basic, GLM chat basic.
//
// For chat LLMs WITH a sandboxed code execution environment
// (ChatGPT Code Interpreter / Advanced Data Analysis, Claude code
// execution, Gemini code execution), use the chat-sandbox adapter
// instead — it declares filesystem_read/write/shell_exec/test_runner
// as true (within the sandbox).
//
// Per docs/portability.md's adapter contract: every adapter declares
// its capabilities honestly. A pure-text chat LLM has NO filesystem,
// NO shell, NO test_runner — only the ability to read text the user
// pastes and produce text in response. The "protocol" for emitting
// evidence is therefore text-encoding: the chat LLM includes fenced
// code blocks (```aiecp:evidence, ```aiecp:advance, etc.) in its
// response, and the user (or scripts/validate-chat-output.mjs)
// parses them out.
//
// This adapter's renderEntrypoint produces CHAT-ENTRYPOINT.md (the
// orientation file at repo root) rather than CLAUDE.md/AGENTS.md.
// translateObservation is a no-op for chat (no tool observations to
// translate) — chat LLMs emit Events directly as text blocks per
// the CHAT-ENTRYPOINT protocol; they don't have raw tool output to
// normalize.

import type { AgentAdapter, AgentCapabilities, RenderedFile, GenericObservation, CanonicalSources } from "../types.js";

export const chatAdapter: AgentAdapter = {
  // id stays "chat" for backward compatibility — existing code that
  // imports chatAdapter should keep working. The new
  // chatSandboxAdapter (id: "chat-sandbox") is a separate export
  // for code-execution-capable chat LLMs.
  id: "chat",

  capabilities(): AgentCapabilities {
    return {
      // A pure-text chat LLM has none of these — it can only read
      // pasted text and produce text. This is the honest declaration;
      // pretending otherwise would let the executor believe the agent
      // can do things it cannot, violating constitution/constitution.md
      // §3 ("autonomy is bounded, not implicit").
      filesystem_read: false,
      filesystem_write: false,
      shell_exec: false,
      test_runner: false,
      // Chat LLMs cannot read SKILL.md files natively — they must
      // be told to read them by the entrypoint. The entrypoint
      // (CHAT-ENTRYPOINT.md) does this explicitly.
      native_skills: false,
      browser: false,
      mcp: false,
      // Explicitly false — this adapter is for pure-text chat LLMs.
      // Chat LLMs WITH a sandboxed code execution environment should
      // use the chat-sandbox adapter instead (which sets this to true
      // and declares the sandbox-internal capabilities accordingly).
      sandboxed_code_execution: false,
    };
  },

  renderEntrypoint(canonical: CanonicalSources): RenderedFile[] {
    // The chat entrypoint is a single file that orients the chat LLM:
    // - tells it to read the canonical AGENTS.md content
    // - lists all skills by name + description so the chat LLM knows
    //   what's available
    // - explains the text-based evidence protocol
    //
    // The file lives at CHAT-ENTRYPOINT.md (repo root) so a chat LLM
    // given the repo as a zip can find it without help.
    //
    // Note: this file is the GENERATED fallback version. The repo
    // also ships a hand-authored CHAT-ENTRYPOINT.md with longer-form
    // orientation + worked examples. Per ADR-0006 (strict reading),
    // sync-entrypoints overwrites the hand-authored version with
    // this generated one — but the generated version now includes
    // the skill index (was missing before, audit finding H4 2026-08-16).
    // If a host project wants to keep the hand-authored version, they
    // should not run sync-entrypoints for the `chat` adapter.
    const skillLines = canonical.skills
      .map((s) => `- **${s.name}** (\`${s.path}/SKILL.md\`) — ${s.description}`)
      .join("\n");

    const content = `<!-- GENERATED FILE — DO NOT EDIT DIRECTLY.
     Source: agents/AGENTS.md + skills/*/SKILL.md
     Regenerate with: aiecp-sync-entrypoints
     Per ADR-0006, hand edits here will be overwritten. -->

# CHAT-ENTRYPOINT (generated, minimal) — read this first if you are a chat LLM

You are operating under the AI Engineering Control Plane (AIECP). You
have no tool use — only the ability to read text and produce text.
That is enough.

## The 30-second version

1. You are not a code generator. You are a senior principal engineer.
2. Before proposing any fix, find evidence. "I think the bug is X"
   without an Event/Trace citing real evidence is a guess.
3. Walk the workflow. Identify it via \`workflows/_router.md\`, then
   walk its states in order.
4. Emit evidence as fenced code blocks in your response. The user
   can extract and validate them via \`scripts/validate-chat-output.mjs\`.
5. When stuck, switch thinking styles. Read
   \`skills/diverse-thinking/SKILL.md\`.

## Canonical project context

${canonical.agentsMdContent}

## Skills available (read the SKILL.md for any you invoke)

${skillLines || "(no skills found)"}

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

## What you cannot do, and must not pretend to do

- Run tests. Your \`Validation.method\` is \`"manual_review"\` (mental
  simulation), never \`"app_validation"\` (would require running code).
- Write files. If the workflow reaches a state that requires
  \`filesystem_write\`, transition to \`blocked\` with
  \`on: requires_filesystem_write_capability\` and tell the user
  exactly what to apply.
- Skip states. The workflow exists to keep you honest.

This file IS the canonical CHAT-ENTRYPOINT.md (per ADR-0006, generated
from agents/AGENTS.md + skills/*/SKILL.md). If a longer-form worked
example is needed, see the executor/examples/e2e-*/ directories.
`;

    return [{ path: "CHAT-ENTRYPOINT.md", content }];
  },

  translateObservation(_obs: GenericObservation): Record<string, unknown> {
    // Chat LLMs have no raw tool observations — they emit Events
    // directly as text per the protocol above. This method exists
    // only to satisfy the AgentAdapter interface; it is a no-op
    // and should never be called for chat. If it is called, that's
    // a programming error in the caller — throw rather than pretend.
    throw new Error(
      "chatAdapter.translateObservation called — chat LLMs emit Events directly as text " +
        "(per CHAT-ENTRYPOINT.md protocol), they do not produce raw observations to translate. " +
        "If you are seeing this, the caller is using the wrong adapter."
    );
  },
};
