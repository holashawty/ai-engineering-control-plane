# Test responses for `validate-chat-output.mjs`

This directory contains the test inputs for `scripts/validate-chat-output.mjs`.
Each `.md` file is a chat LLM's response (or a simulated one) that the validator
parses for `aiecp:*` fenced code blocks and validates against the Evidence
Model schemas.

## Files and their intent

| File | Source | Expected result | Why it's here |
|---|---|---|---|
| `chat-llm-simulated-bug-report.md` | Simulated (subagent) | PASS (25/25) | Proves the validator accepts well-formed chat output from a fresh LLM (not pre-baked) — see conversation log 2026-08-15. |
| `chat-sandbox-offline-onboarding-simulated.md` | Simulated (subagent) | PASS (23/23) | Proves the chat-sandbox adapter path works end-to-end without network (ADR-0020). |
| `chatgpt-live-test-5-shipping-fixed.md` | Real ChatGPT output (2026-08-15) | PASS (46/46) | Proves the validator accepts real ChatGPT output after the ADR-0020 chat-sandbox fixes were applied. |
| `grok-live-test-5-common-mistakes.md` | Real Grok output (2026-08-15) | **INTENTIONAL FAIL (0/5)** | Regression fixture. Header comment documents the 5 specific schema mistakes Grok made — `timestamp` instead of `ts`, `summary` instead of `what`/`why`, etc. The validator MUST detect all 5. If this fixture ever passes, the validator has regressed. |
| `grok-live-test-5-shipping-bare-aiecp.md` | Real Grok output (2026-08-15, pre-protocol) | 0 pass, 0 fail, 12 warnings | Early Grok test, before the `aiecp:evidence` colon:subkind protocol was standardized. Uses bare `aiecp` blocks which the validator warns about but does not count as fail (the warning is the contract enforcement, not the fail). Historical artifact — kept to prove the validator's warning path works. |
| `grok-shipping-test-2.md` | Real Grok output (2026-08-15, pre-protocol) | 0 pass, 0 fail, 13 warnings | Same as above — pre-protocol real output, kept as warning-path proof. |
| `grok-shipping-test.md` | Real Grok output (2026-08-15, pre-protocol) | 0 pass, 0 fail, 13 warnings | Same as above. |

## Which fails are intentional?

**Only `grok-live-test-5-common-mistakes.md` is an intentional-fail fixture.**
Its header comment (lines 1-15 of the file) explicitly says:
> "This file contains the SAME mistakes Grok made in a real live test
> (2026-08-15). It is a regression fixture: validate-chat-output.mjs
> must detect all these mistakes and --strict-hint must provide correct
> template references."

The other Grok files (`grok-live-test-5-shipping-bare-aiecp.md`,
`grok-shipping-test-2.md`, `grok-shipping-test.md`) are NOT intentional-fail
fixtures — they are pre-protocol real outputs that produce 0 pass / 0 fail /
N warnings. They are kept as historical artifacts and as proof that the
validator's warning path (not the fail path) catches the bare-`aiecp` format.

## How to add a new test response

1. Save the chat LLM's output as `<descriptive-name>.md` in this directory.
2. Add a row to the table above with source, expected result, and rationale.
3. If the file is an intentional-fail fixture, add a header comment to the
   file itself (see `grok-live-test-5-common-mistakes.md` lines 1-15 for the
   template) documenting what mistakes it contains and why the validator
   MUST detect them.

## Why the count-assertions script references this README

The auto-generated STATUS.md assertion table (produced by
`scripts/count-assertions.mjs --write`) shows:
> `validate-chat-output.mjs (test-responses/)` | 94 pass | 5 fail | see scripts/test-responses/README.md for which fixtures are intentional-fail regression cases

This README is the referenced documentation. Without it, a future reader
seeing "5 fail" might assume the harness is broken. The 5 fails are the
intentional regression fixture (`grok-live-test-5-common-mistakes.md`) and
are PASSING the contract "validator detects all 5 mistakes."
