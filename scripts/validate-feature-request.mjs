// Structural validation: confirms feature-request.sm.yaml parses as
// valid YAML AND passes the executor's StateMachine.validateDefinition
// (every transition's from/to is in states[], every terminal_state is
// in states[], no non-terminal state is a dead end). Reuses the real
// executor code — does not re-implement the validator.
//
// This script is intentionally separate from the e2e driver
// (executor/examples/e2e-feature-request/drive-run.mjs) because the
// two answer different questions:
//   - validate-feature-request.mjs: "is the YAML structurally sound?"
//   - drive-run.mjs:                "can a real run walk every state
//                                   and emit valid evidence at each?"

import { loadWorkflow } from "../executor/dist/workflow-loader.js";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";

const path = "workflows/feature-request.sm.yaml";
const raw = readFileSync(path, "utf-8");

const parsed = yaml.load(raw);
console.log("YAML parsed OK.");
console.log("  workflow:", parsed.workflow);
console.log("  schema_version:", parsed.schema_version);
console.log("  states:", parsed.states.length, "states");
console.log("  transitions:", parsed.transitions.length, "transitions");
console.log("  terminal_states:", parsed.terminal_states);
console.log("  initial_state:", parsed.initial_state);
console.log("  safety_gates:", JSON.stringify(parsed.safety_gates));
console.log("  question_economy:", JSON.stringify(parsed.question_economy));
console.log("  skills_required:", parsed.skills_required);
console.log("  capabilities_required:", parsed.capabilities_required);
console.log("");

// loadWorkflow runs StateMachine.validateDefinition internally — if
// it returns without throwing, structural validation passed:
//   - every transition's `from` and `to` is in states[]
//   - every terminal_state is in states[]
//   - no non-terminal state is a dead end (every state has >=1 outgoing)
const def = loadWorkflow(path);
console.log("loadWorkflow() structural validation: PASS");
console.log("");

// Walk the state machine and confirm every state is reachable from
// the initial state. validateDefinition does NOT check reachability
// (a state with no incoming transition still has an outgoing one,
// so it passes the dead-end check while being unreachable).
const reachable = new Set([def.initial_state]);
const frontier = [def.initial_state];
while (frontier.length > 0) {
  const s = frontier.shift();
  for (const t of def.transitions) {
    if (t.from === s && !reachable.has(t.to)) {
      reachable.add(t.to);
      frontier.push(t.to);
    }
  }
}
const unreachable = def.states.filter((s) => !reachable.has(s));
if (unreachable.length > 0) {
  console.log("UNREACHABLE states:", unreachable);
  process.exit(1);
} else {
  console.log("All states reachable from initial_state:", def.initial_state);
}

// Confirm every non-terminal state has at least one outgoing transition
// (validateDefinition already enforces this, but show it explicitly so
// a future regression is visible at a glance).
for (const s of def.states) {
  if (def.terminal_states.includes(s)) continue;
  const out = def.transitions.filter((t) => t.from === s);
  if (out.length === 0) {
    console.log("DEAD END:", s);
    process.exit(1);
  }
}
console.log("No dead-end non-terminal states.");
console.log("");
console.log("=== feature-request.sm.yaml structural validation: PASS ===");
