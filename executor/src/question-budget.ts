import { QuestionEconomy, WorkflowViolation } from "./types.js";

/**
 * Enforces workflows/bug-report.sm.yaml's question_economy block:
 * questions may only be asked in allowed_states, and never more than
 * max_questions total in one run. Per constitution/constitution.md §4,
 * exceeding this is a constitution violation, not a stylistic choice —
 * so this throws rather than warns.
 */
export class QuestionBudget {
  private asked = 0;

  constructor(private readonly policy: QuestionEconomy | undefined) {}

  /** Call before actually asking the user something. */
  request(currentState: string, question: string): void {
    if (!this.policy) return; // workflow declared no question_economy — unrestricted (not recommended, but not this class's job to complain)

    if (!this.policy.allowed_states.includes(currentState)) {
      throw new WorkflowViolation(
        `question economy violation: attempted to ask a question in state ` +
          `"${currentState}", which is not in allowed_states ` +
          `[${this.policy.allowed_states.join(", ")}]. Question was: "${question}"`,
        "question-economy-wrong-state"
      );
    }

    if (this.asked >= this.policy.max_questions) {
      throw new WorkflowViolation(
        `question economy violation: max_questions (${this.policy.max_questions}) ` +
          `already reached for this run. Additional question was: "${question}"`,
        "question-economy-exceeded"
      );
    }

    this.asked += 1;
  }

  get count(): number {
    return this.asked;
  }
}
