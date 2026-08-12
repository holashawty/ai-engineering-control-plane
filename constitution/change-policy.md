# Change Policy

How `constitution/` itself may change. This file exists to make one
thing procedurally impossible: an agent quietly rewriting its own
governing rules.

## What counts as a constitution-layer change

Any edit to:
- `constitution/constitution.md`
- `constitution/engineering-principles.md`
- `constitution/safety-rules.md`
- `constitution/change-policy.md` (this file)
- `constitution/autonomy-policy.schema.json`
- Any schema under `evidence/schema/`, `memory/schemas/`, or
  `discovery/schema/`
- `DECISIONS.md` in any way other than appending a new ADR at the end

## Required procedure

1. The proposed change is written up as a new ADR appended to
   `DECISIONS.md`, following the existing ADR format (decision /
   alternatives / reason / tradeoffs / status).
2. The ADR explicitly states which constitution-layer file(s) it
   changes and links the diff.
3. The actual file change and the ADR are committed together, in the
   same commit or PR — never the file change alone, and never the ADR
   alone without the corresponding file change.
4. A human reviews and approves before merge. An agent may draft steps
   1–3; it may not self-approve step 4.

## What does NOT require this procedure

- Adding a new workflow `.sm.yaml`, skill `SKILL.md`, or stack/agent
  adapter — these are governed by their own layer's contract (Agent
  Skills format for skills, the workflow SM schema for workflows) and
  don't touch constitution-layer files.
- Updating `STATUS.md` — that file is explicitly a working log, not
  governance, and is expected to change frequently without an ADR.
- Fixing a typo or broken link in any `docs/*.md` file that doesn't
  change a rule's meaning.

## Rationale

See `DECISIONS.md` ADR-0008 ("Constitutional self-improvement only").
This file operationalizes that ADR into an actual checklist instead of
leaving it as a principle an agent has to remember unprompted.
