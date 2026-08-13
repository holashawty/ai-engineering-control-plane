import { WorkflowDefinition, WorkflowViolation } from "./types.js";

export class StateMachine {
  private current: string;
  readonly history: Array<{ from: string; to: string; on: string }> = [];

  constructor(private readonly def: WorkflowDefinition) {
    if (!def.states.includes(def.initial_state)) {
      throw new WorkflowViolation(
        `initial_state "${def.initial_state}" is not in states[]`,
        "malformed-workflow"
      );
    }
    this.current = def.initial_state;
  }

  get currentState(): string {
    return this.current;
  }

  isTerminal(): boolean {
    return this.def.terminal_states.includes(this.current);
  }

  /** Returns the set of transitions valid from the current state. */
  availableTransitions() {
    return this.def.transitions.filter((t) => t.from === this.current);
  }

  /**
   * Advance the machine on event `on`. Throws WorkflowViolation if no
   * transition matches — the executor must never silently stay put or
   * guess a transition, per constitution/engineering-principles.md
   * ("when in doubt about scope, narrow").
   */
  advance(on: string): string {
    if (this.isTerminal()) {
      throw new WorkflowViolation(
        `cannot advance: workflow already in terminal state "${this.current}"`,
        "already-terminal"
      );
    }
    const match = this.def.transitions.find(
      (t) => t.from === this.current && t.on === on
    );
    if (!match) {
      throw new WorkflowViolation(
        `no transition from "${this.current}" on event "${on}" — ` +
          `valid events here: ${this.availableTransitions().map((t) => t.on).join(", ") || "(none, dead end)"}`,
        "invalid-transition"
      );
    }
    this.history.push({ from: this.current, to: match.to, on });
    this.current = match.to;
    return this.current;
  }

  /** Structural validation of the workflow definition itself. */
  static validateDefinition(def: WorkflowDefinition): string[] {
    const problems: string[] = [];
    for (const t of def.transitions) {
      if (!def.states.includes(t.from)) problems.push(`transition references unknown state "${t.from}"`);
      if (!def.states.includes(t.to)) problems.push(`transition references unknown state "${t.to}"`);
    }
    for (const s of def.terminal_states) {
      if (!def.states.includes(s)) problems.push(`terminal_states references unknown state "${s}"`);
    }
    // Every non-terminal state should have at least one outgoing transition,
    // or it's a silent dead end.
    for (const s of def.states) {
      if (def.terminal_states.includes(s)) continue;
      if (!def.transitions.some((t) => t.from === s)) {
        problems.push(`state "${s}" is non-terminal but has no outgoing transitions (dead end)`);
      }
    }
    return problems;
  }
}
