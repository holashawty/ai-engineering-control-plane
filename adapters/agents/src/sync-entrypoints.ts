import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { AgentAdapter, CanonicalSources, SkillSummary, RenderedFile } from "./types.js";

/** Reads agents/AGENTS.md + all skills/*\/SKILL.md frontmatter from a
 * repo root. This is the single source sync-entrypoints reads from —
 * per ADR-0006, nothing downstream of this function should ever be
 * hand-edited. */
export function loadCanonicalSources(repoRoot: string): CanonicalSources {
  const agentsMdPath = join(repoRoot, "agents", "AGENTS.md");
  if (!existsSync(agentsMdPath)) {
    throw new Error(`canonical entrypoint not found at ${agentsMdPath}`);
  }
  const agentsMdContent = readFileSync(agentsMdPath, "utf-8");

  const skillsDir = join(repoRoot, "skills");
  const skills: SkillSummary[] = [];
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir)) {
      const skillPath = join(skillsDir, entry);
      if (!statSync(skillPath).isDirectory()) continue;
      const skillMdPath = join(skillPath, "SKILL.md");
      if (!existsSync(skillMdPath)) continue; // e.g. _shared/ has no SKILL.md
      const content = readFileSync(skillMdPath, "utf-8");
      const match = content.match(/^---\n([\s\S]*?)\n---\n/);
      if (!match) continue;
      const fm = yaml.load(match[1]) as { name?: string; description?: string };
      if (!fm?.name || !fm?.description) continue;
      skills.push({ name: fm.name, description: fm.description, path: `skills/${entry}` });
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return { agentsMdContent, skills };
}

/** Runs one adapter's renderEntrypoint against the canonical sources. */
export function renderForAdapter(adapter: AgentAdapter, canonical: CanonicalSources): RenderedFile[] {
  return adapter.renderEntrypoint(canonical);
}

/** Runs all given adapters and returns a map of adapter id -> rendered files. */
export function syncAll(repoRoot: string, adapters: AgentAdapter[]): Record<string, RenderedFile[]> {
  const canonical = loadCanonicalSources(repoRoot);
  const out: Record<string, RenderedFile[]> = {};
  for (const adapter of adapters) {
    out[adapter.id] = renderForAdapter(adapter, canonical);
  }
  return out;
}
