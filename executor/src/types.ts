// Shapes matching workflows/bug-report.sm.yaml. Kept intentionally
// permissive (not a 1:1 schema) since the .sm.yaml format itself has no
// JSON Schema yet — that's tracked as an open item in STATUS.md.

export interface Transition {
  from: string;
  to: string;
  on: string;
}

export interface StateDetail {
  purpose?: string;
  emits_evidence?: string[];
  reads_memory?: string[];
  writes_memory?: string[];
  safety_gate?: string;
}

export interface SafetyGateBinding {
  state: string;
  gate: string;
}

export interface QuestionEconomy {
  max_questions: number;
  allowed_states: string[];
  rule?: string;
}

export interface WorkflowDefinition {
  workflow: string;
  schema_version: string;
  description?: string;
  states: string[];
  initial_state: string;
  terminal_states: string[];
  transitions: Transition[];
  state_detail?: Record<string, StateDetail>;
  skills_required?: string[];
  capabilities_required?: string[];
  safety_gates?: SafetyGateBinding[];
  question_economy?: QuestionEconomy;
}

export interface AutonomyPolicy {
  autonomy: { default: number };
  allow: Record<string, boolean | "ask" | "deny" | "scoped">;
  broad_refactor_threshold?: { max_files?: number; max_loc?: number };
}

/** Default policy used when a run doesn't supply its own — deliberately
 * conservative (safety-first), never used to grant more than a caller
 * asks for. See constitution/autonomy-policy.schema.json. */
export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
  autonomy: { default: 2 },
  allow: {
    read_repository: true,
    edit_source: "ask",
    run_tests: true,
    install_dependencies: "ask",
    database_migration: "deny",
    production_deploy: "deny",
    delete_files: "scoped",
    credential_access: "deny",
    force_push: "deny",
    branch_deletion: "deny",
    // ADR-0034/0035: human-approval-required gate maps to this capability.
    // Default "deny" — critical-risk work NEVER auto-approves; requires
    // explicit advanceWithHumanApproval() call from a real human.
    human_approval: "deny",
  },
  broad_refactor_threshold: { max_files: 10, max_loc: 300 },
};

export interface EvidenceEmission {
  kind: string; // "incident" | "trace" | "event" | "decision" | "expected" | "actual" | "validation" | "replay"
  id: string;
  data: Record<string, unknown>;
}

export interface RunEventLogEntry {
  ts: string;
  type: "transition" | "question" | "evidence" | "gate-check" | "blocked";
  detail: Record<string, unknown>;
}

export class WorkflowViolation extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "WorkflowViolation";
  }
}
