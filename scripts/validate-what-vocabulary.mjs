#!/usr/bin/env node
// scripts/validate-what-vocabulary.mjs
//
// Linter for Decision.what field vocabulary (per ADR-0026).
//
// Scans every Decision entity in a workflow run's evidence directory and
// warns on any `what` value that does not match a canonical pattern in
// evidence/vocabulary/decision-what.json. This is a SOFT linter:
//   - Warnings only, never errors. A Decision with an unknown `what` is
//     still schema-valid (decision.schema.json allows any string).
//   - The linter does NOT block workflow execution or test runs.
//   - Exit code 0 always (warnings go to stderr; CI does not fail).
//
// Why this exists:
//   The orchestrator's evaluate-result state detects architectural conflicts
//   by string-matching Decision.what === "architecture_constraint_conflict".
//   If a future skill emits "arch_conflict_with_req" (a plausible variant),
//   the orchestrator silently fails to detect the conflict — no
//   plan_revision_needed fires, the loop proceeds as if no conflict existed.
//   This linter surfaces such typos before they cause silent breakage.
//
// Usage:
//   node scripts/validate-what-vocabulary.mjs <run-dir>
//     Scans <run-dir>/evidence/decision/*.json
//
//   node scripts/validate-what-vocabulary.mjs --self-test
//     Runs a built-in self-test: feeds known-good and known-bad `what`
//     values through the matcher and verifies the matcher behaves correctly.
//
//   node scripts/validate-what-vocabulary.mjs --registry
//     Prints the registry summary (entry count, categories) without scanning.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const REGISTRY_PATH = join(REPO_ROOT, "evidence", "vocabulary", "decision-what.json");

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    console.error(`ERROR: vocabulary registry not found at ${REGISTRY_PATH}`);
    console.error("This file is required per ADR-0026. Run `git pull` or restore from commit history.");
    process.exit(2);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
}

function matchWhat(value, entries) {
  // Returns { matched: true, entry } on first match, { matched: false } if no entry matches.
  for (const entry of entries) {
    if (entry.pattern_type === "exact" && value === entry.pattern) {
      return { matched: true, entry };
    }
    if (entry.pattern_type === "regex") {
      const re = new RegExp(entry.pattern);
      if (re.test(value)) {
        return { matched: true, entry };
      }
    }
  }
  return { matched: false };
}

function scanRunDir(runDir) {
  const decisionDir = join(runDir, "evidence", "decision");
  if (!existsSync(decisionDir)) {
    console.error(`WARNING: no decision evidence directory at ${decisionDir}`);
    console.error("(if this run emitted no Decision entities, this is normal)");
    return { warnings: 0, scanned: 0 };
  }

  const files = readdirSync(decisionDir).filter(f => f.endsWith(".json"));
  let warnings = 0;
  let scanned = 0;
  const registry = loadRegistry();

  for (const f of files) {
    const path = join(decisionDir, f);
    let doc;
    try {
      doc = JSON.parse(readFileSync(path, "utf-8"));
    } catch (e) {
      console.error(`WARNING: could not parse ${path}: ${e.message}`);
      warnings++;
      continue;
    }
    if (typeof doc.what !== "string") {
      // Not a Decision, or schema-violating. Skip — schema validation is
      // a separate concern (discovery/cli validator handles it).
      continue;
    }
    scanned++;
    const result = matchWhat(doc.what, registry.entries);
    if (!result.matched) {
      console.error(
        `WARNING: Decision ${doc.id || "(no id)"} in ${f} has unrecognized \`what\` value: "${doc.what}".\n` +
        `  This may be a typo or a new vocabulary entry that needs to be registered in\n` +
        `  ${REGISTRY_PATH}.\n` +
        `  Suggested fix: if this is a new canonical value, add an entry to the registry\n` +
        `  AND ensure the consumer (orchestrator's evaluate-result, etc.) handles it.\n` +
        `  If this is a typo of an existing value, fix the emitter.`
      );
      warnings++;
    }
  }

  return { warnings, scanned };
}

function selfTest() {
  const registry = loadRegistry();
  let pass = 0, fail = 0;
  function check(label, cond) {
    if (cond) { console.log(`  OK   ${label}`); pass++; }
    else { console.log(`  FAIL ${label}`); fail++; }
  }

  console.log("=== ADR-0026 vocabulary linter self-test ===\n");

  // Known-good values (drawn from the registry's examples)
  const knownGood = [
    "architecture_constraint_conflict",
    "architecture_ok",
    "architecture_designed",
    "plan_created",
    "workflow_routed:bug-report",
    "workflow_routed:feature-request",
    "child_workflow_outcome:bug-report:report",
    "child_workflow_outcome:architecture-design:report",
    "goal_decomposition:bug-report(x);feature-request(y)",
    "goal_evaluation:achieved",
    "goal_evaluation:plan_revision_limit_reached",
    "project_scale:small",
    "project_scale:medium",
    "project_scale:large",
    "plan_revised:phase1-complete",
    "ai_proposal:apply_patch",
    "ai_proposal:apply_patch_to_items_handler",
    "design:add_tag_filtering",
    "assessment:clean",
    "bottleneck:n_plus_one_query_in_get_items",
    "mitigation:add_auth_check",
    "routing_candidate:bug-report",
    "api_change:GET_users_id_memberships:add",
    "db_migration:add_email_verified_at",
    "ui_change:SaveButton:add",
    "ui_snapshot_update:SaveButton:default-rendered",
    "self_heal:login.spec.ts:renders-button:button.primary→button.primary[role=submit]",
    "self_heal:...",
    "tool_use_skipped",
    "tool_use_skipped:test_runner",
    "acceptance:proceed",
    "acceptance:proceed_with_feature_request",
    "regression_recorded",
    "requirements_gathered",
    "project_scaffolded",
    "ux_designed",
    "root_cause_candidate:off_by_one",
    "recency_unverifiable",
    "self_heal_failed",
    "self_heal_unavailable",
    "fact_verified_via_tool:web_search",
    // ADR-0034/0035 wiring sprint
    "fast_path_applied",
    "risk_classified:trivial",
    "risk_classified:low",
    "risk_classified:medium",
    "risk_classified:high",
    "risk_classified:critical",
  ];

  // Known-bad values (the typos / drift the linter exists to catch)
  const knownBad = [
    // The motivating case from ADR-0026: a plausible variant of
    // architecture_constraint_conflict that would silently break
    // the orchestrator's evaluate-result matcher.
    "architecture_conflict_with_req",
    "arch_constraint_conflict",
    "architecture-conflict",  // hyphen vs underscore
    // Wrong casing
    "Architecture_Constraint_Conflict",
    "ARCHITECTURE_CONSTRAINT_CONFLICT",
    // Missing colon sections
    "workflow_routed",  // missing :<name>
    "workflow_routedbug-report",  // missing colon
    "goal_evaluation",  // missing :<outcome>
    "goal_evaluation:achive",  // typo
    "goal_evaluation:plan_revision_needed_but_retry",  // non-canonical outcome
    "project_scale:huge",  // not a canonical scale
    "project_scale:",  // missing value
    "plan_revised",  // missing :<reason>
    "ai_proposal:",  // missing suffix
    "design:",  // missing suffix
    "child_workflow_outcome:bug-report",  // missing :<outcome>
    "child_workflow_outcome:bug-report:maybe",  // non-canonical outcome
    "api_change:",  // missing <endpoint_id>:<change_kind>
    // Random unknowns
    "some_random_value",
    "fix_applied",  // historically seen in a Grok fixture — would be flagged
    "",
  ];

  console.log("Known-good values (should all match):");
  for (const v of knownGood) {
    const r = matchWhat(v, registry.entries);
    check(`"${v}"`, r.matched);
  }

  console.log("\nKnown-bad values (should all FAIL to match):");
  for (const v of knownBad) {
    const r = matchWhat(v, registry.entries);
    check(`"${v}" does NOT match`, !r.matched);
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) {
    console.error("SELF-TEST FAILED");
    process.exit(1);
  }
  console.log("SELF-TEST PASSED");
}

function printRegistrySummary() {
  const registry = loadRegistry();
  console.log(`Registry version: ${registry.version}`);
  console.log(`Last updated: ${registry.last_updated}`);
  console.log(`Total entries: ${registry.entries.length}`);
  const byType = {};
  const byCategory = {};
  for (const e of registry.entries) {
    byType[e.pattern_type] = (byType[e.pattern_type] || 0) + 1;
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  }
  console.log("\nBy pattern_type:");
  for (const [k, v] of Object.entries(byType)) console.log(`  ${k}: ${v}`);
  console.log("\nBy category:");
  for (const [k, v] of Object.entries(byCategory)) console.log(`  ${k}: ${v}`);
}

// ---- main ----

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.log(`Usage:
  node scripts/validate-what-vocabulary.mjs <run-dir>
    Scans <run-dir>/evidence/decision/*.json for unrecognized Decision.what values.
    Exit code 0 always (soft linter — warnings only).

  node scripts/validate-what-vocabulary.mjs --self-test
    Runs the built-in self-test (known-good + known-bad values).

  node scripts/validate-what-vocabulary.mjs --registry
    Prints the registry summary without scanning.

  node scripts/validate-what-vocabulary.mjs --help
    This message.`);
  process.exit(0);
}

if (args[0] === "--self-test") {
  selfTest();
} else if (args[0] === "--registry") {
  printRegistrySummary();
} else {
  const runDir = args[0];
  if (!existsSync(runDir)) {
    console.error(`ERROR: run-dir ${runDir} does not exist`);
    process.exit(2);
  }
  const result = scanRunDir(runDir);
  console.log(`Scanned ${result.scanned} Decision entities, found ${result.warnings} unrecognized \`what\` values.`);
  if (result.warnings > 0) {
    console.log("(warnings above are SOFT — workflow execution is not blocked. See ADR-0026 for rationale.)");
  }
}
