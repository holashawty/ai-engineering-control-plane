import type { AgentAdapter, AgentCapabilities, RenderedFile, GenericObservation, CanonicalSources } from "../types.js";
import { redact } from "../redact.js";

// Capabilities per docs/portability.md portability matrix row for
// "Claude Code": native entrypoint CLAUDE.md, native Agent Skills
// support, low adapter complexity.
export const claudeCodeAdapter: AgentAdapter = {
  id: "claude-code",

  capabilities(): AgentCapabilities {
    return {
      filesystem_read: true,
      filesystem_write: true,
      shell_exec: true,
      test_runner: true,
      native_skills: true, // Claude Code reads SKILL.md natively — no flattening needed
      browser: true, // via Claude in Chrome / computer-use tooling
      mcp: true,
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

${canonical.agentsMdContent}

## Skills available natively in Claude Code

Claude Code reads Agent Skills (SKILL.md) natively — no flattening
required. The following skills are available in this repository:

${skillLines || "(no skills found)"}
`;

    return [{ path: "CLAUDE.md", content }];
  },

  translateObservation(obs: GenericObservation): Record<string, unknown> {
    // Claude Code's tool-use results (e.g. bash_tool output, file reads)
    // become Events. This mapping is intentionally simple for MVP scope —
    // richer per-tool-type mapping is future work (see adapters/agents/README.md).
    const toolName = String(obs.raw.tool ?? obs.raw.tool_name ?? "unknown_tool");
    return {
      id: `event-${obs.source}-${Date.parse(obs.timestamp)}`,
      trace_ref: obs.traceRef,
      ts: obs.timestamp,
      kind: mapKind(toolName, obs.raw),
      source: `claude-code:${toolName}`,
      payload: redact(obs.raw),
    };
  },
};

function mapKind(toolName: string, raw: Record<string, unknown>): string {
  if (toolName.includes("bash")) return "action";
  if (toolName.includes("view") || toolName.includes("read")) return "observation";
  if ("error" in raw) return "error";
  return "action";
}
