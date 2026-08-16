# Contributing

This project is in Phase 0 (research + architecture proposal). Implementation
has not started. See `docs/implementation-roadmap.md` for the phased plan and
`DECISIONS.md` for the architecture decision log.

## Before contributing code

1. Read `docs/architecture.md` and `DECISIONS.md` to understand the
   layering and the SPEC/IMPL/OBS/DIAG/VERIFY separation — this separation
   is enforced and testable, not a suggestion.
2. Any new skill must follow the Agent Skills format (see `skills/README.md`
   once populated) and ship with a procedure, tool integration, validation,
   examples, and failure handling — not just a description.
3. Any change to the framework's own governance (`constitution/`) must be
   recorded as a new ADR in `DECISIONS.md`. Silent changes to constitution
   files will be rejected.
4. Any reused or adapted code from an upstream project must be recorded in
   `NOTICE` with its license.
5. **If you add or modify any test** (eval scenarios, e2e drivers, adapter
   self-tests, chat-output fixtures), you MUST regenerate the assertion
   table in `STATUS.md`:
   ```bash
   npm run count-assertions -- --write
   ```
   Then commit the regenerated `STATUS.md` together with your test changes.
   The table is delimited by `<!-- AUTO-GENERATED -->` markers and is
   verified by CI via `npm run count-assertions -- --check` — a stale table
   will fail the build. See ADR-0029 for the rationale (this replaces the
   prior hand-edited-count approach that drifted across 4 cycles).

## Reporting issues

Use GitHub Issues for bugs and proposals. For security issues, see
`SECURITY.md`.
