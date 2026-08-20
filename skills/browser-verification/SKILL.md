---
name: browser-verification
description: Use when validating web, mobile web, or 2D canvas interfaces via closed-loop headless browser execution. Runs scripts/browser-verifier.mjs to launch headless Playwright/Chromium, inspect DOM nodes, capture runtime console errors, test layout responsive viewports, and audit accessibility tags (a11y). Emits structured Validation evidence to evidence/validation/.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Browser Verification Skill (Closed-Loop Sensory Testing)

## When to use this skill

During the `test`, `verify`, and `quality-gate` states of any frontend, fullstack web, or game application.
This skill eliminates the "Blind Agent Gap" (where an AI generates code that compiles but throws runtime JavaScript errors or breaks in the browser).

---

## Capabilities & Automated Checks

1. **Console & Page Error Detection:** Captures unhandled exceptions (`Uncaught TypeError`, undefined property access) and `console.error` logs.
2. **Broken Asset Auditing:** Detects 404/500 HTTP failures on images, fonts, scripts, and stylesheets.
3. **Viewport & Layout Overflow Check:** Verifies responsive meta tags (`<meta name="viewport">`) and checks mobile rendering.
4. **Accessibility (a11y) Baseline:** Audits images missing `alt` attributes and interactive buttons missing accessible text or `aria-label`.

---

## Execution Protocol

Run the automated verification script:

```bash
node scripts/browser-verifier.mjs <target-url-or-local-port>
```

### Example:
```bash
# 1. Start local dev server in background
npm run dev &

# 2. Run closed-loop browser verifier
node scripts/browser-verifier.mjs http://localhost:3000

# 3. Inspect generated Validation evidence
cat .aiecp/evidence/validation/val-browser-*.json
```

---

## Invariant Rules
- A verification report with **CRITICAL** or **HIGH** severity issues must block the `quality_gate_passed` transition.
- All detected issues must be diagnosed and resolved before terminal release.
