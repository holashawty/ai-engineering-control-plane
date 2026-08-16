# Contributing

This project is in **Phase 2 (Core)** — the MVP vertical slice is complete:
all 15 workflows are implemented as runnable `.sm.yaml` files and proven
end-to-end, 35 skills are authored, and 5 agent adapters are wired up.
See `STATUS.md` for the live assertion count table (953 pass / 5 fail as of
2026-08-16), `docs/archive/implementation-roadmap.md` for the phased plan, and
`DECISIONS.md` for the architecture decision log (29 ADRs).

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
