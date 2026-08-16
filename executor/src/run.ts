import { StateMachine } from "./state-machine.js";
import { QuestionBudget } from "./question-budget.js";
import { EvidenceStore } from "./evidence-store.js";
import { enforceGate, GateDecision } from "./safety-gate.js";
import {
  WorkflowDefinition,
  AutonomyPolicy,
  DEFAULT_AUTONOMY_POLICY,
  RunEventLogEntry,
  WorkflowViolation,
} from "./types.js";

// Maps a workflow's declared safety_gate name (e.g. "broad-refactor") to
// the autonomy-policy capability it should be checked against. This
// mapping is intentionally explicit and small rather than clever, so a
// new gate requires a deliberate one-line addition, not inference.
const GATE_TO_CAPABILITY: Record<string, string> = {
  "broad-refactor": "edit_source",
  edit_source: "edit_source",
};

export interface WorkflowRunOptions {
  /** Directory for evidence/memory persistence. Defaults to `.aiecp/`
   * in the project root (per ADR-0024). E2e drivers may override
   * with a temp directory for test isolation. */
  runDir?: string;
  autonomyPolicy?: AutonomyPolicy;
}

export class WorkflowRun {
  readonly machine: StateMachine;
  readonly questions: QuestionBudget;
  readonly evidence: EvidenceStore;
  readonly log: RunEventLogEntry[] = [];
  private readonly policy: AutonomyPolicy;

  constructor(private readonly def: WorkflowDefinition, opts: WorkflowRunOptions) {
    this.machine = new StateMachine(def);
    this.questions = new QuestionBudget(def.question_economy);
    this.evidence = new EvidenceStore(opts.runDir ?? ".aiecp");
    this.policy = opts.autonomyPolicy ?? DEFAULT_AUTONOMY_POLICY;
  }

  get currentState(): string {
    return this.machine.currentState;
  }

  private recordLog(entry: Omit<RunEventLogEntry, "ts">) {
    this.log.push({ ts: new Date().toISOString(), ...entry });
  }

  /** Ask the user a question, subject to question-economy enforcement. */
  askQuestion(question: string): void {
    this.questions.request(this.machine.currentState, question);
    this.recordLog({ type: "question", detail: { state: this.machine.currentState, question } });
  }

  /** Emit an Evidence Model entity, validated against its schema. */
  async emitEvidence(kind: string, data: Record<string, unknown>): Promise<void> {
    await this.evidence.writeEvidence(kind, data);
    this.recordLog({ type: "evidence", detail: { store: "evidence", kind, id: data.id } });
  }

  /** Write a typed Memory entry, validated against its schema. */
  async writeMemory(type: string, data: Record<string, unknown>): Promise<void> {
    await this.evidence.writeMemory(type, data);
    this.recordLog({ type: "evidence", detail: { store: "memory", kind: type, id: data.id } });
  }

  /**
   * Advance the state machine on event `on`. If the *current* state has
   * a declared safety_gate (workflows/bug-report.sm.yaml
   * state_detail.<state>.safety_gate or the top-level safety_gates
   * list), the gate is checked before the transition is permitted.
   */
  advance(on: string): { newState: string; gateDecision?: GateDecision } {
    const fromState = this.machine.currentState;
    const gateBinding = this.def.safety_gates?.find((g) => g.state === fromState);

    let gateDecision: GateDecision | undefined;
    if (gateBinding) {
      const capability = GATE_TO_CAPABILITY[gateBinding.gate];
      if (!capability) {
        throw new WorkflowViolation(
          `workflow declares safety_gate "${gateBinding.gate}" at state ` +
            `"${fromState}" but no capability mapping exists for it in the executor`,
          "unmapped-safety-gate"
        );
      }
      gateDecision = enforceGate(this.policy, gateBinding.gate, capability);
      this.recordLog({
        type: "gate-check",
        detail: { state: fromState, gate: gateBinding.gate, capability, decision: gateDecision },
      });
      if (gateDecision === "requires-confirmation") {
        throw new WorkflowViolation(
          `transition from "${fromState}" is gated by "${gateBinding.gate}" ` +
            `(capability "${capability}") and requires explicit confirmation ` +
            `before proceeding — this run did not supply one`,
          "safety-gate-needs-confirmation"
        );
      }
    }

    const newState = this.machine.advance(on);
    this.recordLog({ type: "transition", detail: { from: fromState, to: newState, on } });
    return { newState, gateDecision };
  }

  /**
   * Same as advance(), but treats "requires-confirmation" as granted —
   * used only when the caller has already obtained explicit human
   * confirmation out-of-band. Never call this speculatively.
   */
  advanceWithConfirmation(on: string): { newState: string } {
    const fromState = this.machine.currentState;
    const gateBinding = this.def.safety_gates?.find((g) => g.state === fromState);
    if (gateBinding) {
      this.recordLog({
        type: "gate-check",
        detail: { state: fromState, gate: gateBinding.gate, decision: "confirmed-by-human" },
      });
    }
    const newState = this.machine.advance(on);
    this.recordLog({ type: "transition", detail: { from: fromState, to: newState, on } });
    return { newState };
  }

  isTerminal(): boolean {
    return this.machine.isTerminal();
  }
}
