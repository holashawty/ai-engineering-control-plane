import type { AgentAdapter, AgentCapabilities, RenderedFile, GenericObservation, CanonicalSources } from "../types.js";
import { redact } from "../redact.js";

// Capabilities per docs/portability.md portability matrix row for
// "Codex": native entrypoint AGENTS.md, partial Agent Skills support,
// low adapter complexity. Per docs/research.md's verification pass,
// spec-kit itself now ships a root AGENTS.md and an optional
// "agent skills" install mode — Codex reading AGENTS.md natively is
// well-established, not a AIECP-specific assumption.
export const codexAdapter: AgentAdapter = {
  id: "codex",

  capabilities(): AgentCapabilities {
    return {
      filesystem_read: true,
      filesystem_write: true,
      shell_exec: true,
      test_runner: true,
      native_skills: "partial", // reads SKILL.md-shaped content but with narrower support than Claude Code — see docs/portability.md
      browser: false,
      mcp: true,
      sandboxed_code_execution: false, // Codex uses the real fs/shell, not a sandbox
    };
  },

  renderEntrypoint(canonical: CanonicalSources): RenderedFile[] {
    // Unlike Claude Code, Codex reads AGENTS.md natively — this repo's
    // own agents/AGENTS.md (the canonical source) already IS a valid
    // Codex entrypoint, per ADR-0006's design. This adapter's
    // renderEntrypoint is therefore near-identity: it appends a skills
    // index (since native_skills is only "partial") rather than
    // generating an entirely separate file the way claude-code does.
    const skillLines = canonical.skills
      .map((s) => `- **${s.name}** (\`${s.path}/SKILL.md\`) — ${s.description}`)
      .join("\n");

    const content = `${canonical.agentsMdContent}

## Skills index (Codex has partial native Agent Skills support)

Codex's Agent Skills support is partial as of this adapter's last
verification (docs/portability.md). The skill descriptions below are
inlined here as a fallback in case native SKILL.md discovery doesn't
pick up everything; the authoritative source is always the individual
\`skills/*/SKILL.md\` files.

${skillLines || "(no skills found)"}
`;

    // AGENTS.md is written directly (not CLAUDE.md) — this is
    // deliberately the same filename as the canonical source, since
    // Codex reads that file natively at the repo root.
    return [{ path: "AGENTS.md", content }];
  },

  translateObservation(obs: GenericObservation): Record<string, unknown> {
    const toolName = String(obs.raw.tool ?? obs.raw.tool_name ?? "unknown_tool");
    return {
      id: `event-${obs.source}-${Date.parse(obs.timestamp)}`,
      trace_ref: obs.traceRef,
      ts: obs.timestamp,
      kind: mapKind(toolName, obs.raw),
      source: `codex:${toolName}`,
      payload: redact(obs.raw),
    };
  },
};

function mapKind(toolName: string, raw: Record<string, unknown>): string {
  if (toolName.includes("shell") || toolName.includes("exec")) return "action";
  if (toolName.includes("read") || toolName.includes("cat")) return "observation";
  if ("error" in raw) return "error";
  return "action";
}
