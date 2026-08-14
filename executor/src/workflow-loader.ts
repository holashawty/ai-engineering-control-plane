import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { WorkflowDefinition, WorkflowViolation } from "./types.js";
import { StateMachine } from "./state-machine.js";

export function loadWorkflow(path: string): WorkflowDefinition {
  const raw = readFileSync(path, "utf-8");
  const def = yaml.load(raw) as WorkflowDefinition;

  if (!def || typeof def !== "object" || !def.workflow || !def.states || !def.transitions) {
    throw new WorkflowViolation(
      `"${path}" does not look like a valid workflow definition (missing workflow/states/transitions)`,
      "malformed-workflow"
    );
  }

  const problems = StateMachine.validateDefinition(def);
  if (problems.length > 0) {
    throw new WorkflowViolation(
      `workflow "${def.workflow}" failed structural validation:\n- ${problems.join("\n- ")}`,
      "malformed-workflow"
    );
  }

  return def;
}
