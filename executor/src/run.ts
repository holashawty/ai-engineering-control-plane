import { StateMachine } from "./state-machine.js";
import { QuestionBudget } from "./question-budget.js";
import { EvidenceStore } from "./evidence-store.js";
import { enforceGate, checkCapability, GateDecision } from "./safety-gate.js";
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
//
// ADR-0034/0035 wiring sprint: added "human-approval-required" → "human_approval".
// This gate type is DIFFERENT from broad-refactor/edit_source:
//   - broad-refactor (edit_source): can be bypassed by advanceWithConfirmation()
//     (the agent confirmed; the user said "ok" via aiecp:confirm)
//   - human-approval-required (human_approval): CANNOT be bypassed by
//     advanceWithConfirmation() — requires advanceWithHumanApproval(),
//     which represents a real human approving out-of-band (e.g., via
//     --user-prompt on the CLI, or a manual review step).
const GATE_TO_CAPABILITY: Record<string, string> = {
  "broad-refactor": "edit_source",
  edit_source: "edit_source",
  "human-approval-required": "human_approval",
};

export interface WorkflowRunOptions {
  /** Directory for evidence/memory persistence. Defaults to `.aiecp/`
   * in the project root (per ADR-0024). E2e drivers may override
   * with a temp directory for test isolation. */
  runDir?: string;
  autonomyPolicy?: AutonomyPolicy;
  /** ADR-0030 / ADR-0035 (Phase 3): when true, child workflow commands
   *  invoked from the `execute-workflow` state (orchestrator) run inside
   *  the Docker sandbox via `executor/src/sandbox-runner.ts` —
   *  `--read-only --cap-drop=ALL --network=none`, with /workspace
   *  bind-mounted from `runDir`.
   *
   *  When false (default): commands run on the host directly (the
   *  current behavior; safety-gate.ts still gates them at the prompt
   *  level). When true: each command is wrapped in `runInSandbox()`,
   *  which auto-detects Docker availability and falls back to host
   *  execution with a LOUD WARNING if Docker is not installed.
   *
   *  WIRING NOTE (Phase 3 scope): this option is DECLARED and
   *  DOCUMENTED here, but the actual interception of every
   *  `execSync`/`spawnSync` call inside child workflows is a Phase
   *  3.5 follow-up. In Phase 3, the option is honored only by code
   *  that explicitly opts in (e.g. adapters/agents/src/chat-sandbox/
   *  adapter.ts and the e2e-sandbox driver). Wiring the sandbox into
   *  every workflow's command-execution paths requires touching every
   *  skill's shell-out sites — out of scope for this phase per
   *  roadmap-2026-pro.md Item 3. */
  sandbox?: boolean;
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
      // Use checkCapability (not enforceGate) so we can throw a SPECIFIC
      // violation for human-approval-required gates before enforceGate's
      // generic safety-gate-denied fires. ADR-0034/0035 wiring sprint.
      gateDecision = checkCapability(this.policy, capability);
      this.recordLog({
        type: "gate-check",
        detail: { state: fromState, gate: gateBinding.gate, capability, decision: gateDecision },
      });

      // ADR-0034/0035: human-approval-required gate gets a DIFFERENT
      // violation kind than broad-refactor. This lets the caller
      // distinguish "ask for confirmation" (aiecp:confirm) from
      // "ask for human approval" (real human out-of-band). The
      // default policy has human_approval: "deny", so this fires
      // every time a critical-risk gate is hit without prior approval.
      if (gateBinding.gate === "human-approval-required" && gateDecision === "denied") {
        throw new WorkflowViolation(
          `transition from "${fromState}" is gated by "human-approval-required" ` +
            `(capability "${capability}") and requires EXPLICIT HUMAN APPROVAL ` +
            `before proceeding — advanceWithConfirmation() is NOT sufficient for ` +
            `this gate; use advanceWithHumanApproval() after obtaining approval ` +
            `out-of-band (e.g., via --user-prompt on the CLI, or a manual review step)`,
          "safety-gate-needs-human-approval"
        );
      }

      if (gateDecision === "denied") {
        throw new WorkflowViolation(
          `safety gate "${gateBinding.gate}" denied: capability "${capability}" is ` +
            `set to deny in the active autonomy policy`,
          "safety-gate-denied"
        );
      }

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
   * confirmation out-of-band (e.g., the user sent aiecp:confirm).
   * Never call this speculatively.
   *
   * ADR-0034/0035: This method does NOT bypass "human-approval-required"
   * gates — those require advanceWithHumanApproval() (a stronger signal).
   * Calling advanceWithConfirmation() on a state gated by
   * human-approval-required will throw safety-gate-needs-human-approval.
   */
  advanceWithConfirmation(on: string): { newState: string } {
    const fromState = this.machine.currentState;
    const gateBinding = this.def.safety_gates?.find((g) => g.state === fromState);
    if (gateBinding) {
      if (gateBinding.gate === "human-approval-required") {
        throw new WorkflowViolation(
          `transition from "${fromState}" is gated by "human-approval-required" — ` +
            `advanceWithConfirmation() is NOT sufficient; use ` +
            `advanceWithHumanApproval() after obtaining explicit human ` +
            `approval out-of-band (e.g., via --user-prompt)`,
          "safety-gate-needs-human-approval"
        );
      }
      this.recordLog({
        type: "gate-check",
        detail: { state: fromState, gate: gateBinding.gate, decision: "confirmed-by-human" },
      });
    }
    const newState = this.machine.advance(on);
    this.recordLog({ type: "transition", detail: { from: fromState, to: newState, on } });
    return { newState };
  }

  /**
   * Bypasses ALL gates, including "human-approval-required". This is the
   * "nuclear option" — only call when a REAL HUMAN has approved the
   * transition out-of-band (e.g., the user reviewed the diff and typed
   * --user-prompt on the CLI, or a security officer signed off).
   *
   * ADR-0034/0035: This is the ONLY method that can bypass a
   * "human-approval-required" gate. advanceWithConfirmation() will throw.
   */
  advanceWithHumanApproval(on: string): { newState: string } {
    const fromState = this.machine.currentState;
    const gateBinding = this.def.safety_gates?.find((g) => g.state === fromState);
    if (gateBinding) {
      this.recordLog({
        type: "gate-check",
        detail: { state: fromState, gate: gateBinding.gate, decision: "human-approved" },
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
