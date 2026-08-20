---
name: vibe-antidote-qa
description: Use during verification, code-review, and quality-gate states to eliminate superficial 'vibe coding' bugs (tests pass in CLI but app crashes or behaves unpredictably in end-user hands). Audits and fixes state machine invariants, race conditions, double-click spam, memory leaks, unhandled promise rejections, and applies property-based fuzz testing. Distinct from testing (which runs basic assertions); this skill attacks runtime brittleness.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Vibe-Antidote QA & Resilience Engine

## When to use this skill

During the `verify`, `quality-gate`, and `code-review` states of any workflow, and especially before declaring `goal_achieved` in `--yarat` or `--geliştir` runs.

### The Problem It Solves: The "Vibe Coder Illusion"
A common failure mode of AI coding agents is producing code that looks clean, has green unit tests for happy paths, but breaks immediately in real user hands:
- Fast double-clicking a button triggers two conflicting API requests or duplicate records.
- Disconnecting Wi-Fi produces a frozen white screen instead of an offline banner or cached view.
- Rapidly navigating between pages causes state mutations on unmounted components (memory leaks).
- Edge-case inputs (null, extreme numbers, emoji strings, empty collections) crash state reducers.

This skill is the **Principal QA & Chaos Engineering layer** of AIECP. It systematically audits against 6 Vibe-Coding Vulnerabilities and injects bulletproof resilience.

---

## 6 Vibe-Coding Vulnerability Audits

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       6 VIBE-CODING VULNERABILITY AUDITS                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. [INVARIANT AUDIT]    State combinations that should be mathematically   │
│                         impossible (e.g. Loading=true AND Data=null).       │
│ 2. [CONCURRENCY AUDIT]  Double-click spam, out-of-order async responses,   │
│                         missing request cancellation.                       │
│ 3. [LIFECYCLE AUDIT]    Uncleaned event listeners, intervals, sockets on    │
│                         unmount.                                            │
│ 4. [RESILIENCE AUDIT]   Graceful degradation when network/backend is down.  │
│ 5. [BOUNDARY AUDIT]     Empty collections, nulls, long strings, unicode.    │
│ 6. [PROPERTY FUZZING]   Randomized input generation (fast-check/Hypothesis).│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Audit 1: State Machine & Invariant Enforcement
* **Rule:** Explicit Finite State Machine (FSM) over independent booleans.
* **Anti-Pattern:** `const [isLoading, setIsLoading] = useState(false); const [isError, setIsError] = useState(false); const [data, setData] = useState(null);` (Allows 8 states, 4 of which are invalid).
* **Fix:** Use tagged unions / discriminated states:
  ```typescript
  type ViewState<T> =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; data: T }
    | { status: 'error'; error: string };
  ```

---

### Audit 2: Race Conditions & Action Debouncing
* **Rule:** All mutating user actions (Submit, Purchase, Goal, Delete) must be idempotent or debounced.
* **Checks:**
  1. Buttons automatically disable and show spinner while async action is in flight.
  2. Search inputs debounce network calls (300ms delay).
  3. Subsequent navigation aborts previous pending fetch requests via `AbortController`.

---

### Audit 3: Memory Leaks & Teardown
* **Rule:** Every subscription, interval, timer, or DOM event listener must have an explicit teardown.
* **Checks:**
  1. `useEffect` / `mounted` lifecycle returns cleanup function:
     ```typescript
     useEffect(() => {
       const timer = setInterval(tick, 1000);
       return () => clearInterval(timer);
     }, []);
     ```
  2. Canvas animation loops (`requestAnimationFrame`) cancel on component unmount (`cancelAnimationFrame`).
  3. Audio contexts and sound nodes are closed when tearing down.

---

### Audit 4: Graceful Degradation & Offline Fallbacks
* **Rule:** When the network, backend, or third-party service fails, the app must degrade gracefully, never crash.
* **Checks:**
  1. Top-level and widget-level React / Vue Error Boundaries prevent white-screen crashes.
  2. Third-party integrations (Stripe, AI endpoints, external APIs) have mock fallbacks so the UI remains fully interactive in sandbox or offline mode.
  3. Local storage failures (e.g. private browsing quota exceeded) are caught with in-memory fallbacks.

---

### Audit 5: Edge-Case & Boundary Hardening
* **Rule:** Test UI rendering against:
  - Empty lists (Does the empty state render with an action button?).
  - Extremely long names/strings (Does text truncate or wrap with ellipsis without breaking flex layout?).
  - Special characters & emoji (Does it render without HTML escaping bugs?).
  - Extreme values ($0.00, negative balance, 999,999,999 items).

---

### Audit 6: Property-Based Fuzzing
* **Rule:** Apply property-based testing (`fast-check` for TS/JS, `Hypothesis` for Python) on core business algorithms.
* **Example (fast-check in TypeScript):**
  ```typescript
  import fc from 'fast-check';
  import { calculateCartTotal } from './cart';

  test('Cart total is never negative and respects discounts for any inputs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ price: fc.float({ min: 0, max: 10000 }), qty: fc.integer({ min: 1, max: 100 }) })),
        fc.float({ min: 0, max: 1 }),
        (items, discount) => {
          const total = calculateCartTotal(items, discount);
          return total >= 0 && Number.isFinite(total);
        }
      )
    );
  });
  ```

---

## Procedure

1. **Scan Codebase for Vibe-Coding Smells:** Run grep/AST search for unhandled promise rejections, uncleaned intervals, and unconstrained boolean state flags.
2. **Execute Property & Boundary Probes:** Run fuzz tests and verify empty/extreme state rendering.
3. **Remediate Findings:** Apply state unions, abort controllers, error boundaries, and debounce guards.
4. **Emit Evidence:** Emit `Decision(what: "vibe_audit_passed")` with evidence refs pointing to test and verification outputs. If critical vulnerabilities were found and fixed, emit `Decision(what: "vibe_defect_fixed:<defect_type>")`.
