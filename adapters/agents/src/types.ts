// Implements the "Adapter contract" from docs/portability.md.
// One adapter per agent; each declares its own capabilities rather
// than the orchestrator assuming uniform support (docs/portability.md
// "Failure modes: Capability mismatch").

export interface AgentCapabilities {
  filesystem_read: boolean;
  filesystem_write: boolean;
  shell_exec: boolean;
  test_runner: boolean;
  /** true = fully native Agent Skills support, "partial" = some support
   * with caveats, false = none (skills must be flattened into the
   * entrypoint by render_entrypoint instead). */
  native_skills: boolean | "partial";
  browser: boolean;
  mcp: boolean;
  /** true = this agent has a sandboxed code execution environment
   * (e.g. ChatGPT's Code Interpreter / Advanced Data Analysis,
   * Claude's code execution tool, Gemini's code execution). When
   * true, filesystem_read/write/shell_exec/test_runner may all be
   * true *within the sandbox* — the agent can actually run code,
   * read files in the sandbox, and write artifacts there. When
   * false, those capabilities reflect the agent's *real* filesystem
   * (false for pure chat LLMs, true for CLI agents like Claude
   * Code/Codex). The distinction matters because a chat-with-
   * sandbox agent can drive project-onboarding (which writes
   * .aiecp/project-intelligence.json) inside its sandbox, while a
   * pure chat LLM cannot.
   *
   * Per ADR-0020 (forthcoming): chat LLMs are NOT all the same.
   * The original chat adapter (commit ff4afbc) assumed all chat
   * LLMs have zero capabilities — this was proven wrong by a real
   * ChatGPT session that correctly detected it should route to
   * project-onboarding but couldn't proceed because the adapter
   * declared filesystem_write=false. The sandboxed_code_execution
   * flag fixes this. */
  sandboxed_code_execution?: boolean;
}

export interface RenderedFile {
  path: string; // relative to host repo root, e.g. "CLAUDE.md"
  content: string;
}

export interface GenericObservation {
  /** Raw, agent-native shape — varies per adapter. This is intentionally
   * loose; translate_observation's job is to normalize it. */
  raw: Record<string, unknown>;
  timestamp: string;
  traceRef: string;
  source: string;
}

export interface AgentAdapter {
  readonly id: string;

  capabilities(): AgentCapabilities;

  /** Produce this agent's native entrypoint file(s) from the canonical
   * agents/AGENTS.md + skills/*\/SKILL.md sources. Per ADR-0006, this
   * output must be idempotent — running it twice on unchanged input
   * produces byte-identical output — and it must NEVER be hand-edited
   * downstream; only regenerated. */
  renderEntrypoint(canonical: CanonicalSources): RenderedFile[];

  /** Normalize a raw, agent-native observation into an Evidence Model
   * Event (evidence/schema/event.schema.json shape). Validated by the
   * caller against the real schema — this function's only job is the
   * mapping. */
  translateObservation(obs: GenericObservation): Record<string, unknown>;
}

export interface SkillSummary {
  name: string;
  description: string;
  path: string; // relative path to the skill's directory
}

export interface CanonicalSources {
  agentsMdContent: string;
  skills: SkillSummary[];
}
