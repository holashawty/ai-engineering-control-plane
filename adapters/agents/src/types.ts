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
