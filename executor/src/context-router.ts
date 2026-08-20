// executor/src/context-router.ts
//
// ADR-0032 — JIT Context Injection.
//
// A `ContextRouter` that, given `(def, currentState)`, returns a MINIMAL
// context bundle: only the state's purpose, evidence kinds + their
// schema-required field names, safety gate (if any), the question
// budget for this state (if the workflow declares one), and a SLICE of
// each relevant skill (description + "When to use this skill" excerpt)
// — NOT the whole 5000-line upfront load described in
// `docs/roadmap-2026-pro.md` Item 1.
//
// Pure module: the only I/O is local `fs.readFileSync` calls (to read
// the evidence JSON Schemas and the skill SKILL.md frontmatter), same
// pattern as `evidence-store.ts`. No network, no async, no mutation.
//
// The skill filter is intentionally simple (substring match on the
// state name + each `-`/`_`-separated token, with word boundaries).
// This is NOT a semantic similarity search — it is a lexical pre-filter
// that lets the LLM agent skip skills that obviously don't apply to
// the current state. A future iteration (post-ADR-0032) may add
// embedding-based filtering; for now, lexical matching is cheap, pure,
// and easy to reason about.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as jsYaml from "js-yaml";
const yaml: any = (jsYaml as any).default || jsYaml;
import { WorkflowDefinition } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_SCHEMA_DIR = join(__dirname, "..", "..", "evidence", "schema");
const SKILLS_DIR = join(__dirname, "..", "..", "skills");

/** Mapping from evidence kind → schema filename. Mirrors evidence-store.ts. */
const EVIDENCE_KIND_TO_FILE: Record<string, string> = {
  incident: "incident.schema.json",
  trace: "trace.schema.json",
  event: "event.schema.json",
  decision: "decision.schema.json",
  expected: "expected.schema.json",
  actual: "actual.schema.json",
  validation: "validation.schema.json",
  replay: "replay.schema.json",
};

export interface RelevantSkill {
  name: string;
  /** Relative path from project root — e.g. `skills/systematic-debugging/SKILL.md`. */
  path: string;
  /** Full `description` field from the skill's YAML frontmatter. */
  description: string;
  /** First ~500 chars of the `## When to use this skill` section body. */
  when_to_use_excerpt: string;
}

export interface ContextBundle {
  workflow: string;
  state: string;
  /** From `state_detail.<state>.purpose` in the .sm.yaml. */
  state_purpose: string;
  /** From `state_detail.<state>.emits_evidence`. Empty array if none declared. */
  emits_evidence: string[];
  /** kind → `required` array from `evidence/schema/<kind>.schema.json`. */
  evidence_fields: Record<string, string[]>;
  /** From `state_detail.<state>.safety_gate`. Omitted if state declares none. */
  safety_gate?: string;
  /** Per-state question budget. Omitted if the workflow declares no `question_economy`. */
  question_budget?: { max: number; allowed: boolean };
  /** Filtered slice of `skills_required`, ranked by lexical relevance to `state`. */
  relevant_skills: RelevantSkill[];
  /** Conservative upper-bound line count if this bundle were serialized to text. */
  total_lines_estimate: number;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

/**
 * Read the `required` array for each evidence kind from its JSON Schema.
 * Returns `kind → required[]`. If a schema is missing or unparseable,
 * returns `kind → []` rather than throwing — a missing schema does not
 * block the bundle from being built (it just yields no field info).
 */
function readEvidenceFields(kinds: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const kind of kinds) {
    const file = EVIDENCE_KIND_TO_FILE[kind];
    if (!file) {
      result[kind] = [];
      continue;
    }
    const schemaPath = join(EVIDENCE_SCHEMA_DIR, file);
    if (!existsSync(schemaPath)) {
      result[kind] = [];
      continue;
    }
    try {
      const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
      const required: unknown = schema.required;
      if (Array.isArray(required) && required.every((r) => typeof r === "string")) {
        result[kind] = required as string[];
      } else {
        result[kind] = [];
      }
    } catch {
      result[kind] = [];
    }
  }
  return result;
}

/**
 * Parse a SKILL.md's YAML frontmatter + body. Returns null if the file
 * doesn't have a valid frontmatter block. Mirrors the lightweight YAML
 * frontmatter convention used across each `skills/<name>/SKILL.md` file.
 */
function parseSkillFrontmatter(raw: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  try {
    const fm = yaml.load(m[1]) as SkillFrontmatter;
    return { frontmatter: fm ?? {}, body: m[2] };
  } catch {
    return null;
  }
}

/**
 * Extract the body of the `## When to use this skill` section, stopping
 * at the next `## ` header. Returns "" if no such section exists.
 */
function extractWhenToUse(body: string): string {
  const m = body.match(/^##\s+When to use this skill\s*\r?\n([\s\S]*?)(?=^##\s)/m);
  if (m) return m[1].trim();
  // No following ## header — take the rest of the body after the section header.
  const m2 = body.match(/^##\s+When to use this skill\s*\r?\n([\s\S]*)$/m);
  if (m2) return m2[1].trim();
  return "";
}

/**
 * Derive lexical match candidates from a state name.
 *   `propose-fix` → `["propose-fix", "propose", "fix"]`
 *   `locate-evidence` → `["locate-evidence", "locate", "evidence"]`
 * Short tokens (< 3 chars) are dropped to avoid spurious matches on
 * things like "do" or "to". The full state name is always kept (it
 * appears verbatim in many skill `When to use` sections, surrounded by
 * backticks).
 */
function deriveStateVerbs(stateName: string): string[] {
  const tokens = stateName
    .split(/[-_]/)
    .filter((t) => t.length >= 3);
  return Array.from(new Set([stateName, ...tokens]));
}

/**
 * Lexical match: does `text` contain any of `verbs` as a word (case-
 * insensitive, word-boundary aware)? Word boundary here means "non-
 * letter on both sides" — hyphens, backticks, quotes, spaces, and
 * start/end-of-string all count as boundaries, so the state name
 * `apply-fix` matches the literal token `fix` inside the text
 * "`apply-fix` states".
 *
 * No stemming is performed: "report" does NOT match "reported". This
 * is intentional — see ADR-0032 §"What does NOT change" for why the
 * filter is deliberately lexical rather than semantic.
 */
function textMentionsAny(text: string, verbs: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return verbs.some((v) => {
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i");
    return re.test(lower);
  });
}

/**
 * Read each skill in `skills_required` from disk, parse its
 * frontmatter + When-to-use section, and include it in the bundle iff
 * its description OR When-to-use section lexically mentions the state
 * name (or any token derived from it). Missing skill files are
 * silently skipped (a malformed `skills_required` entry shouldn't
 * block bundle construction — same fail-soft posture as
 * `readEvidenceFields`).
 */
function readRelevantSkills(
  skillsRequired: string[] | undefined,
  currentState: string,
): RelevantSkill[] {
  if (!skillsRequired || skillsRequired.length === 0) return [];
  const verbs = deriveStateVerbs(currentState);
  const result: RelevantSkill[] = [];
  for (const skillName of skillsRequired) {
    const skillMdPath = join(SKILLS_DIR, skillName, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;
    const raw = readFileSync(skillMdPath, "utf-8");
    const parsed = parseSkillFrontmatter(raw);
    if (!parsed) continue;
    const description = parsed.frontmatter.description ?? "";
    const whenToUse = extractWhenToUse(parsed.body);
    const haystack = `${description}\n${whenToUse}`;
    if (textMentionsAny(haystack, verbs)) {
      result.push({
        name: skillName,
        path: `skills/${skillName}/SKILL.md`,
        description,
        when_to_use_excerpt: whenToUse.slice(0, 500),
      });
    }
  }
  return result;
}

/**
 * Conservative line-count estimate for the serialized bundle. Used by
 * ADR-0032's regression assertion that each bundle is well under 500
 * lines (the "96% per-state savings" target from `docs/roadmap-2026-
 * pro.md` Item 1). The estimate is intentionally generous (rounds up
 * multi-line fields, assumes 80 chars per line for long strings) so
 * the actual rendered bundle will always be SMALLER than this number.
 */
function estimateLines(bundle: Omit<ContextBundle, "total_lines_estimate">): number {
  let total = 0;
  total += bundle.state_purpose.split(/\r?\n/).length;
  total += bundle.emits_evidence.length;
  for (const [, fields] of Object.entries(bundle.evidence_fields)) {
    total += 1 + fields.length; // 1 line for the kind + 1 per required field
  }
  if (bundle.safety_gate) total += 1;
  if (bundle.question_budget) total += 2;
  for (const sk of bundle.relevant_skills) {
    // 3 metadata lines (name, path, "description:" header) + ceil(len/80)
    // lines for each of description and when_to_use_excerpt.
    total += 3;
    total += Math.ceil(sk.description.length / 80);
    total += Math.ceil(sk.when_to_use_excerpt.length / 80);
  }
  return total;
}

/**
 * Build a minimal JIT context bundle for `(def, currentState)`. Reads:
 *   - `def.state_detail[currentState]` for purpose / emits_evidence /
 *     safety_gate
 *   - `def.skills_required` filtered by lexical relevance to the state
 *   - `def.question_economy.allowed_states` for the per-state budget
 *   - `evidence/schema/<kind>.schema.json` for each emitted kind's
 *     `required` array
 *
 * Pure except for the four `readFileSync` calls above. No state, no
 * async, no side effects.
 *
 * Throws if `currentState` is not in `def.states` (a state-machine
 * invariant violation — the caller has a bug, not the workflow).
 */
export function buildContextBundle(
  def: WorkflowDefinition,
  currentState: string,
): ContextBundle {
  if (!def.states.includes(currentState)) {
    throw new Error(
      `buildContextBundle: state "${currentState}" is not in workflow ` +
        `"${def.workflow}" states [${def.states.join(", ")}]`,
    );
  }

  const detail = def.state_detail?.[currentState];
  const statePurpose = (detail?.purpose ?? "").trim();
  const emitsEvidence = detail?.emits_evidence ?? [];
  const safetyGate = detail?.safety_gate;

  const evidenceFields = readEvidenceFields(emitsEvidence);
  const relevantSkills = readRelevantSkills(def.skills_required, currentState);

  let questionBudget: { max: number; allowed: boolean } | undefined;
  if (def.question_economy) {
    questionBudget = {
      max: def.question_economy.max_questions,
      allowed: def.question_economy.allowed_states.includes(currentState),
    };
  }

  const partial = {
    workflow: def.workflow,
    state: currentState,
    state_purpose: statePurpose,
    emits_evidence: emitsEvidence,
    evidence_fields: evidenceFields,
    safety_gate: safetyGate,
    question_budget: questionBudget,
    relevant_skills: relevantSkills,
  };
  return { ...partial, total_lines_estimate: estimateLines(partial) };
}
