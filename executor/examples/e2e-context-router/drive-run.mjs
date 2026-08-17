// ADR-0032 e2e driver: JIT Context Injection.
//
// Loads `workflows/bug-report.sm.yaml`, walks every state in
// `def.states`, and asserts that `buildContextBundle(def, state)`
// returns a minimal bundle that:
//   - Has a non-empty `state_purpose` (proves state_detail was read).
//   - Has `emits_evidence` matching the YAML's state_detail.
//   - Has `evidence_fields` keyed by each emitted kind, with values
//     equal to the JSON Schema's `required` array.
//   - Has `relevant_skills` that is either non-empty (proves the
//     filter found a matching skill) OR explicitly empty (proves the
//     filter correctly excluded all skills for that state — verified
//     by re-deriving the verbs and asserting no skill text contains
//     any of them).
//   - Has `total_lines_estimate` < 500 (proves the JIT saving target
//     from `docs/roadmap-2026-pro.md` Item 1 is met for every state).
//
// Cross-cutting:
//   - The `report` state's bundle is asserted to be SMALLER than the
//     whole `skills/systematic-debugging/SKILL.md` file (proves we're
//     slicing skills, not loading whole skill files).
//   - Per-state assertions for safety_gate, question_budget, and
//     specific skill inclusion (e.g. `verify` state bundle must
//     include `behavioral-verification`).
//
// Target: >= 40 assertions across all 12 bug-report states.

import { loadWorkflow } from "../../dist/workflow-loader.js";
import { buildContextBundle } from "../../dist/context-router.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const BUG_REPORT_YAML = join(REPO_ROOT, "workflows", "bug-report.sm.yaml");
const SYSTEMATIC_DEBUGGING_SKILL = join(REPO_ROOT, "skills", "systematic-debugging", "SKILL.md");

let passed = 0, failed = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  OK   ${label}`); passed++; }
  else { console.log(`  FAIL ${label} — ${detail}`); failed++; }
}

// Mirrors the verbs the context-router derives from a state name, so
// the driver can independently verify "this state SHOULD have empty
// relevant_skills because no skill text contains any verb".
function deriveStateVerbs(stateName) {
  const tokens = stateName.split(/[-_]/).filter((t) => t.length >= 3);
  return Array.from(new Set([stateName, ...tokens]));
}
function textMentionsAny(text, verbs) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return verbs.some((v) => {
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i");
    return re.test(lower);
  });
}

// Expected emits_evidence per state, transcribed from bug-report.sm.yaml
// state_detail.<state>.emits_evidence. Used for cross-checking the
// bundle's value against the source of truth.
const EXPECTED_EMITS = {
  intake: [],
  classify: ["incident"],
  "locate-evidence": ["event", "trace"],
  reproduce: ["trace", "event"],
  diagnose: ["decision", "expected", "actual", "validation"],
  "propose-fix": ["decision"],
  "apply-fix": ["event"],
  verify: ["expected", "actual", "validation"],
  "regression-protect": [],
  replay: ["replay"],
  report: [],
  blocked: [],
};

function scenario() {
  const def = loadWorkflow(BUG_REPORT_YAML);
  console.log(`=== ADR-0032 JIT Context Router e2e (${def.states.length} states) ===\n`);

  // --- Top-level shape assertions on buildContextBundle ---
  const firstBundle = buildContextBundle(def, def.initial_state);
  check("buildContextBundle returns an object", typeof firstBundle === "object" && firstBundle !== null);
  check("bundle.workflow matches def.workflow", firstBundle.workflow === def.workflow);
  check("bundle.state matches the requested state", firstBundle.state === def.initial_state);
  check("bundle.relevant_skills is an array", Array.isArray(firstBundle.relevant_skills));
  check("bundle.evidence_fields is an object", typeof firstBundle.evidence_fields === "object");
  check("bundle.total_lines_estimate is a positive number",
    typeof firstBundle.total_lines_estimate === "number" && firstBundle.total_lines_estimate > 0);

  // --- Per-state assertions ---
  console.log("\n--- Per-state bundle assertions ---");
  const bundles = {};
  for (const state of def.states) {
    const b = buildContextBundle(def, state);
    bundles[state] = b;

    // 1. state_purpose non-empty
    check(`[${state}] state_purpose is non-empty`,
      b.state_purpose.length > 0,
      `got: ${JSON.stringify(b.state_purpose).slice(0, 80)}`);

    // 2. emits_evidence matches YAML
    const expected = EXPECTED_EMITS[state];
    check(`[${state}] emits_evidence matches YAML state_detail`,
      JSON.stringify(b.emits_evidence.slice().sort()) === JSON.stringify((expected || []).slice().sort()),
      `got: ${JSON.stringify(b.emits_evidence)}, expected: ${JSON.stringify(expected)}`);

    // 3. evidence_fields has one entry per emitted kind
    check(`[${state}] evidence_fields has one entry per emitted kind`,
      Object.keys(b.evidence_fields).length === b.emits_evidence.length,
      `got keys: ${Object.keys(b.evidence_fields).join(",")}`);

    // 4. relevant_skills is array (always true by construction, but documents the contract)
    check(`[${state}] relevant_skills is an array`,
      Array.isArray(b.relevant_skills));

    // 5. total_lines_estimate < 500 (JIT saving target)
    check(`[${state}] total_lines_estimate < 500 (got ${b.total_lines_estimate})`,
      b.total_lines_estimate < 500,
      `got ${b.total_lines_estimate}`);

    // 6. The relevant_skills list is consistent with the verb filter:
    //    every skill in the list has full-text that mentions a state verb,
    //    AND every skill NOT in the list has full-text that mentions none.
    //    (Uses the FULL When-to-use section re-read from disk, not the
    //    bundle's 500-char excerpt — because the verb may legitimately
    //    appear past the 500-char cap, and the router's matcher uses
    //    the full section text.)
    const verbs = deriveStateVerbs(state);
    const allSkills = def.skills_required || [];
    const included = new Set(b.relevant_skills.map((s) => s.name));
    let consistencyOk = true;
    let consistencyDetail = "";
    // Helper: read a skill's full description + When-to-use section text.
    function readFullSkillText(skillName) {
      const skillMdPath = join(REPO_ROOT, "skills", skillName, "SKILL.md");
      try {
        const raw = readFileSync(skillMdPath, "utf-8");
        const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (!fmMatch) return null;
        const fm = fmMatch[1];
        const fmDesc = (fm.match(/^description:\s*(.+?)$/m) || [])[1] || "";
        const body = fmMatch[2];
        const wMatch = body.match(/^##\s+When to use this skill\s*\r?\n([\s\S]*?)(?=^##\s)/m);
        const wText = wMatch ? wMatch[1] : "";
        return `${fmDesc}\n${wText}`;
      } catch {
        return null;
      }
    }
    // For INCLUDED skills: verify full text mentions a verb.
    for (const sk of b.relevant_skills) {
      const fullText = readFullSkillText(sk.name);
      if (fullText === null) continue; // can't verify, skip
      if (!textMentionsAny(fullText, verbs)) {
        consistencyOk = false;
        consistencyDetail = `skill "${sk.name}" is in the bundle but its full text mentions no verb from ${JSON.stringify(verbs)}`;
        break;
      }
    }
    // For EXCLUDED skills: verify none of them mention the verb.
    // (Independent re-implementation of the router's check — a bug in
    // the router would still be caught.)
    if (consistencyOk) {
      for (const skillName of allSkills) {
        if (included.has(skillName)) continue;
        const fullText = readFullSkillText(skillName);
        if (fullText === null) continue;
        if (textMentionsAny(fullText, verbs)) {
          consistencyOk = false;
          consistencyDetail = `skill "${skillName}" mentions a verb from ${JSON.stringify(verbs)} but was NOT included`;
          break;
        }
      }
    }
    check(`[${state}] relevant_skills is consistent with verb filter (non-empty OR explicitly empty)`,
      consistencyOk, consistencyDetail);
  }

  // --- Specific state assertions: safety_gate ---
  console.log("\n--- safety_gate assertions ---");
  check("[propose-fix] bundle.safety_gate is set",
    typeof bundles["propose-fix"].safety_gate === "string" && bundles["propose-fix"].safety_gate.length > 0,
    `got: ${bundles["propose-fix"].safety_gate}`);
  check("[propose-fix] safety_gate mentions 'broad-refactor'",
    (bundles["propose-fix"].safety_gate || "").includes("broad-refactor"));
  check("[apply-fix] bundle.safety_gate is set",
    typeof bundles["apply-fix"].safety_gate === "string" && bundles["apply-fix"].safety_gate.length > 0,
    `got: ${bundles["apply-fix"].safety_gate}`);
  check("[apply-fix] safety_gate mentions 'edit_source'",
    (bundles["apply-fix"].safety_gate || "").includes("edit_source"));
  check("[intake] bundle.safety_gate is undefined (no gate declared)",
    bundles.intake.safety_gate === undefined);
  check("[verify] bundle.safety_gate is undefined (no gate declared)",
    bundles.verify.safety_gate === undefined);

  // --- Specific state assertions: question_budget ---
  console.log("\n--- question_budget assertions ---");
  check("[classify] question_budget.allowed === true (only allowed state)",
    bundles.classify.question_budget && bundles.classify.question_budget.allowed === true);
  check("[classify] question_budget.max === 1 (per bug-report.sm.yaml)",
    bundles.classify.question_budget && bundles.classify.question_budget.max === 1);
  check("[intake] question_budget.allowed === false (not in allowed_states)",
    bundles.intake.question_budget && bundles.intake.question_budget.allowed === false);
  check("[verify] question_budget.allowed === false",
    bundles.verify.question_budget && bundles.verify.question_budget.allowed === false);
  check("[diagnose] question_budget.allowed === false",
    bundles.diagnose.question_budget && bundles.diagnose.question_budget.allowed === false);

  // --- Specific state assertions: evidence_fields (required-field extraction) ---
  console.log("\n--- evidence_fields (JSON Schema `required`) assertions ---");
  check("[classify].evidence_fields.incident includes 'severity'",
    bundles.classify.evidence_fields.incident.includes("severity"),
    `got: ${JSON.stringify(bundles.classify.evidence_fields.incident)}`);
  check("[classify].evidence_fields.incident includes 'status'",
    bundles.classify.evidence_fields.incident.includes("status"));
  check("[diagnose].evidence_fields.decision includes 'what'",
    bundles.diagnose.evidence_fields.decision.includes("what"),
    `got: ${JSON.stringify(bundles.diagnose.evidence_fields.decision)}`);
  check("[diagnose].evidence_fields.decision includes 'validated'",
    bundles.diagnose.evidence_fields.decision.includes("validated"));
  check("[diagnose].evidence_fields has keys for decision/expected/actual/validation",
    ["decision", "expected", "actual", "validation"].every(
      (k) => Array.isArray(bundles.diagnose.evidence_fields[k]) && bundles.diagnose.evidence_fields[k].length > 0
    ));
  check("[locate-evidence].evidence_fields has keys for event/trace",
    ["event", "trace"].every(
      (k) => Array.isArray(bundles["locate-evidence"].evidence_fields[k])
    ));
  check("[replay].evidence_fields.replay includes 'original_trace_ref'",
    bundles.replay.evidence_fields.replay.includes("original_trace_ref"),
    `got: ${JSON.stringify(bundles.replay.evidence_fields.replay)}`);

  // --- Specific state assertions: relevant_skills inclusion ---
  console.log("\n--- relevant_skills inclusion assertions ---");
  check("[verify] bundle includes 'behavioral-verification'",
    bundles.verify.relevant_skills.some((s) => s.name === "behavioral-verification"),
    `got: ${bundles.verify.relevant_skills.map((s) => s.name).join(", ")}`);
  check("[apply-fix] bundle includes 'quality-gate'",
    bundles["apply-fix"].relevant_skills.some((s) => s.name === "quality-gate"),
    `got: ${bundles["apply-fix"].relevant_skills.map((s) => s.name).join(", ")}`);
  check("[propose-fix] bundle includes 'systematic-debugging' (mentions 'fix')",
    bundles["propose-fix"].relevant_skills.some((s) => s.name === "systematic-debugging"));
  check("[reproduce] bundle includes 'testing'",
    bundles.reproduce.relevant_skills.some((s) => s.name === "testing"));
  check("[regression-protect] bundle includes 'testing'",
    bundles["regression-protect"].relevant_skills.some((s) => s.name === "testing"));
  check("[locate-evidence] bundle includes 'systematic-debugging'",
    bundles["locate-evidence"].relevant_skills.some((s) => s.name === "systematic-debugging"));
  check("[diagnose] bundle includes 'systematic-debugging'",
    bundles.diagnose.relevant_skills.some((s) => s.name === "systematic-debugging"));
  check("[replay] bundle includes 'evidence-engineering' (Replay entity in description)",
    bundles.replay.relevant_skills.some((s) => s.name === "evidence-engineering"));

  // --- Known-empty states (no skill text mentions the state verb) ---
  // `intake` and `classify` are the two states for which no skill's
  // description or `When to use` section mentions the state name or any
  // token derived from it — so the bundle's relevant_skills MUST be
  // empty for these two, proving the filter doesn't over-match.
  console.log("\n--- relevant_skills explicit-empty assertions ---");
  check("[intake] bundle.relevant_skills is empty (no skill mentions 'intake')",
    bundles.intake.relevant_skills.length === 0,
    `got: ${bundles.intake.relevant_skills.map((s) => s.name).join(", ")}`);
  check("[classify] bundle.relevant_skills is empty (no skill mentions 'classify')",
    bundles.classify.relevant_skills.length === 0,
    `got: ${bundles.classify.relevant_skills.map((s) => s.name).join(", ")}`);

  // --- Lexical filter is intentionally permissive (lexically, not semantically) ---
  // Per ADR-0032 §"What does NOT change", the filter is a lexical pre-filter.
  // The `report` state's token "report" appears in `bug-report.sm.yaml`
  // references inside several skills' When-to-use sections — so the filter
  // correctly identifies them as plausibly relevant. This is a known
  // over-match that a future semantic filter (post-ADR-0032) would refine.
  console.log("\n--- lexical-filter permissiveness assertions ---");
  check("[report] bundle is non-empty (skills mention 'bug-report' which contains 'report')",
    bundles.report.relevant_skills.length > 0,
    `got: ${bundles.report.relevant_skills.map((s) => s.name).join(", ")}`);
  check("[report] bundle includes at least one skill whose text mentions 'bug-report'",
    bundles.report.relevant_skills.some((sk) =>
      `${sk.description}\n${sk.when_to_use_excerpt}`.toLowerCase().includes("bug-report")),
    `got: ${bundles.report.relevant_skills.map((s) => s.name).join(", ")}`);
  // `blocked` state — recency-verification description mentions
  // "transition to `blocked`" as the failure path when no web search is
  // available. That's a real, semantically-correct match.
  check("[blocked] bundle includes 'recency-verification' (mentions transition to 'blocked')",
    bundles.blocked.relevant_skills.some((s) => s.name === "recency-verification"),
    `got: ${bundles.blocked.relevant_skills.map((s) => s.name).join(", ")}`);

  // --- Skill slice format assertions ---
  console.log("\n--- skill slice format assertions ---");
  const verifySkills = bundles.verify.relevant_skills;
  if (verifySkills.length > 0) {
    const sk = verifySkills[0];
    check("[verify] first relevant_skill has a non-empty name", sk.name.length > 0);
    check("[verify] first relevant_skill.path is relative (no leading / or drive)",
      !sk.path.startsWith("/") && !/^[A-Za-z]:/.test(sk.path));
    check("[verify] first relevant_skill.path starts with 'skills/'",
      sk.path.startsWith("skills/"));
    check("[verify] first relevant_skill.description is non-empty",
      sk.description.length > 0);
    check("[verify] first relevant_skill.when_to_use_excerpt is non-empty",
      sk.when_to_use_excerpt.length > 0);
    check("[verify] first relevant_skill.when_to_use_excerpt is capped at 500 chars",
      sk.when_to_use_excerpt.length <= 500);
  } else {
    check("[verify] has at least one relevant_skill", false, "no skills returned");
  }

  // --- Cross-cutting: report bundle is SMALLER than the whole systematic-debugging SKILL.md ---
  console.log("\n--- JIT slicing assertions (proves we don't load whole skill files) ---");
  const skillMdLines = readFileSync(SYSTEMATIC_DEBUGGING_SKILL, "utf-8").split(/\r?\n/).length;
  check(`systematic-debugging/SKILL.md is ${skillMdLines} lines (sanity)`,
    skillMdLines > 100, `got ${skillMdLines}`);
  check(`[report] bundle total_lines_estimate (${bundles.report.total_lines_estimate}) < ` +
    `systematic-debugging/SKILL.md line count (${skillMdLines})`,
    bundles.report.total_lines_estimate < skillMdLines,
    `got ${bundles.report.total_lines_estimate} >= ${skillMdLines}`);

  // --- Aggregate: every bundle is well under the 5000-line upfront load ---
  console.log("\n--- aggregate JIT savings assertions ---");
  const maxEstimate = Math.max(...def.states.map((s) => bundles[s].total_lines_estimate));
  const sumEstimate = def.states.reduce((sum, s) => sum + bundles[s].total_lines_estimate, 0);
  check(`max bundle estimate (${maxEstimate}) is < 500`,
    maxEstimate < 500, `got ${maxEstimate}`);
  check(`sum of all ${def.states.length} bundle estimates (${sumEstimate}) is < 5000 (the upfront-load target)`,
    sumEstimate < 5000, `got ${sumEstimate}`);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("E2E DRIVER FAILED");
    process.exit(1);
  }
  console.log("E2E DRIVER PASSED");
}

try {
  scenario();
} catch (e) {
  console.error(`\nE2E DRIVER FAILED WITH UNCAUGHT ERROR: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
}
