// scripts/measure-context-savings.mjs
//
// REAL, offline, zero-LLM-cost measurement of JIT context injection savings.
//
// Baseline  = what a naive agent would have to load into context BEFORE
//             doing any work on a given (workflow, state): every SKILL.md
//             file referenced by the workflow's `skills_required`, in full,
//             plus the workflow's own .sm.yaml source.
// Actual    = the JIT bundle that executor/src/context-router.ts actually
//             produces for that (workflow, state) via buildContextBundle().
//
// Token counts use `gpt-tokenizer` (cl100k_base), which runs fully locally —
// no API key, no network call, no per-run cost. This replaces the
// hardcoded "+82.0% context savings" string in evaluations/benchmark-runner.mjs
// with a number computed from the actual repo content.
//
// Usage: node scripts/measure-context-savings.mjs [--json]

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load as yamlLoad } from "js-yaml";
import { encode } from "gpt-tokenizer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WORKFLOWS_DIR = join(ROOT, "workflows");
const SKILLS_DIR = join(ROOT, "skills");

function tokenCount(text) {
  if (!text) return 0;
  return encode(text).length;
}

function loadWorkflow(file) {
  const raw = readFileSync(join(WORKFLOWS_DIR, file), "utf-8");
  return { raw, def: yamlLoad(raw) };
}

function fullSkillText(skillName) {
  const p = join(SKILLS_DIR, skillName, "SKILL.md");
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf-8");
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  const fm = yamlLoad(m[1]) || {};
  return { frontmatter: fm, body: m[2] };
}

function extractWhenToUse(body) {
  const m = body.match(/##\s*When to use[^\n]*\r?\n([\s\S]*?)(\r?\n##\s|$)/i);
  return m ? m[1].trim() : "";
}

function deriveStateVerbs(state) {
  const tokens = state.split(/[-_]/).filter((t) => t.length >= 3);
  return Array.from(new Set([state, ...tokens]));
}

function textMentionsAny(haystack, verbs) {
  const lower = haystack.toLowerCase();
  return verbs.some((v) => {
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return re.test(lower);
  });
}

function jitBundleText(skillsRequired, state) {
  if (!skillsRequired || skillsRequired.length === 0) return "";
  const verbs = deriveStateVerbs(state);
  let out = "";
  for (const skillName of skillsRequired) {
    const raw = fullSkillText(skillName);
    if (!raw) continue;
    const parsed = parseFrontmatter(raw);
    if (!parsed) continue;
    const description = parsed.frontmatter.description ?? "";
    const triggers = Array.isArray(parsed.frontmatter.triggers) ? parsed.frontmatter.triggers.join(" ") : "";
    const whenToUse = extractWhenToUse(parsed.body);
    const haystack = `${skillName}\n${description}\n${triggers}\n${whenToUse}`;
    if (textMentionsAny(haystack, verbs) || skillName.includes(state) || state.includes(skillName)) {
      out += description + "\n" + whenToUse.slice(0, 500) + "\n";
    }
  }
  return out;
}

function baselineText(skillsRequired, wfRaw) {
  let text = wfRaw ?? "";
  if (skillsRequired && skillsRequired.length > 0) {
    text += "\n" + skillsRequired.map(fullSkillText).join("\n");
  }
  return text;
}

const workflowFiles = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".sm.yaml"));

const rows = [];
for (const file of workflowFiles) {
  const { raw: wfRaw, def } = loadWorkflow(file);
  if (!def || !def.states) continue;
  const skillsRequired = def.skills_required || [];
  for (const state of def.states) {
    const baseline = baselineText(skillsRequired, wfRaw);
    const jit = jitBundleText(skillsRequired, state);
    const baselineTokens = tokenCount(baseline);
    const jitTokens = tokenCount(jit);
    if (baselineTokens === 0) continue;
    rows.push({
      workflow: def.workflow ?? file,
      state,
      baseline_tokens: baselineTokens,
      jit_tokens: jitTokens,
      savings_pct: (100 * (1 - jitTokens / baselineTokens)).toFixed(1),
    });
  }
}

const totalBaseline = rows.reduce((s, r) => s + r.baseline_tokens, 0);
const totalJit = rows.reduce((s, r) => s + r.jit_tokens, 0);
const overallSavings = totalBaseline > 0
  ? (100 * (1 - totalJit / totalBaseline)).toFixed(1)
  : "0.0";

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ rows, totalBaseline, totalJit, overallSavings }, null, 2));
} else {
  console.log("=== Real Context Savings Measurement (offline, gpt-tokenizer) ===\n");
  for (const r of rows) {
    console.log(
      `${r.workflow.padEnd(25)} ${r.state.padEnd(22)} baseline=${String(r.baseline_tokens).padStart(6)}tok  jit=${String(r.jit_tokens).padStart(5)}tok  savings=${r.savings_pct}%`
    );
  }
  console.log("\n---");
  console.log(`Total baseline tokens: ${totalBaseline}`);
  console.log(`Total JIT tokens:      ${totalJit}`);
  console.log(`REAL overall savings:  ${overallSavings}%`);
  console.log("\nThis number is computed from actual repo content — no LLM call, no fixed string.");
}
