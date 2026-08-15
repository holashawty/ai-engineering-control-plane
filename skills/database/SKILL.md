---
name: database
description: Use whenever a task touches database schema, queries, migrations, or data integrity. Ensures database changes are treated as first-class Evidence Model artifacts — schema migrations emit Decision entities with validated=false until behavioral verification confirms the migration is safe. Covers SQL/NoSQL/NewSQL equally. Distinct from testing (which runs test suites) — this skill covers the database-specific discipline — migration safety, query validation, index impact, connection pool management.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Database

## When to use this skill

Any time a task touches database schema, queries, migrations, or data
integrity — regardless of which workflow is running. This is a cross-
cutting domain skill: any workflow may cite it in its
`skills_required` list when the task touches the database domain
(`feature-request` adding a column, `change-request` rewriting a
query, `bug-report` diagnosing a data-integrity incident,
`refactor` extracting a repository, `performance-problem` adding an
index).

**Especially when:**

- A schema migration is being proposed, reviewed, or applied —
  including NoSQL index/validator changes and NewSQL schema changes,
  which are migrations even when the project does not call them that.
- A query is being changed (rewritten, parameterized, optimized) in a
  way that could alter result shape, cardinality, or latency.
- An index is being added or dropped — these are migrations of the
  query planner's behavior, not just of the schema.
- Connection pool / client configuration is being tuned — these are
  `Decision`s that affect concurrency, latency, and resource usage
  under load.
- A data-integrity constraint (foreign key, unique, check, document
  validator) is being added, dropped, or relaxed.

**Don't use as a substitute for `testing`:** that skill runs the
project's own test suite (per `project.test_system` from Project
Intelligence). This skill covers the database-specific discipline on
top of — not instead of — that test run. A migration that passes the
project's migration test suite is *necessary* but not *sufficient*;
this skill's procedure is what makes the difference between
"migration applied, tests green" and "migration verified safe."

**Don't use as a substitute for `behavioral-verification`:** that
skill confirms a specific behavioral claim against `Expected`. This
skill produces the database-specific `Expected`s, `Actual`s, and
`Trace`s that `behavioral-verification` consumes. The two compose:
this skill emits the evidence; `behavioral-verification` judges it.

## Procedure

### 1. Identify the database mechanism (stack-native, not assumed)

Read `.aiecp/project-intelligence.json` (per `skills/testing/SKILL.md`
step 1 — same stack-native discipline). The file's `project.test_system`
and `project.build_system` declare the toolchain; for databases, also
look for any `project.database_system` / `project.migration_system`
field if the discovery pipeline emits one. If neither the file nor
those fields exist, run `discovery/cli` first
(`node dist/cli.js <repo-path>`) rather than assuming Postgres /
MySQL / MongoDB / etc.

The mechanism varies by family — the discipline does not:

- **SQL (Postgres, MySQL, SQLite, etc.):** migrations are schema
  DDL; `EXPLAIN`/`EXPLAIN ANALYZE` is the plan inspector;
  constraints are FK / UNIQUE / CHECK / NOT NULL.
- **NoSQL (MongoDB, DynamoDB, Cassandra, etc.):** "migrations" are
  index creations, document validators, TTL rules, shard-key
  changes, and application-level schema evolution. `explain()` /
  `EXPLAIN` is still the plan inspector; constraints are document
  validators or application-enforced invariants.
- **NewSQL (CockroachDB, Spanner, TiDB, etc.):** migrations are
  SQL DDL but with distributed concerns (online schema change,
  shard redistribution, transactional DDL); `EXPLAIN` still works
  but plan inspection must account for distributed execution.

Record the identified mechanism as an `Event`
(`evidence/schema/event.schema.json`) of `kind: "observation"` with
`payload.database_system: "<identified system>"` and
`payload.migration_mechanism: "<alembic|prisma-migrate|mongo-index|…>"`.
This `Event` anchors every later step — never proceed without it.

### 2. Treat every migration as a `Decision` with `validated: false`

Per `constitution/constitution.md` §2 ("An AI-proposed change is a
`Decision` with `validated: false` until … `Validation` accepts it")
and `docs/evidence-model.md`'s AI-output validation pattern: every
schema migration, index change, constraint change, or pool
configuration change is a `Decision`
(`evidence/schema/decision.schema.json`) emitted with:

- `what: "db_migration:<migration_id>"` (or `db_query_change:`,
  `db_index_change:`, `db_pool_change:`)
- `why` — what the migration accomplishes and why the chosen approach
  beat alternatives (record at least one `alternatives` entry per
  `decision.schema.json`'s `alternatives` array)
- `validated: false` initially — flipped only by step 7's
  `Validation`
- `made_by: "agent"` for AI-proposed migrations; `made_by: "human"`
  if the migration is human-authored and the agent is verifying it
- `result: "pending"` until the `Validation` flips it to `"accepted"`

A migration that is applied to the database without this `Decision`
first being emitted is a process violation of this skill — even if
the migration is correct, the evidence chain is missing and a future
`regression` workflow cannot trace why the schema is the way it is.

### 3. Emit an `Expected` describing both forward behavior and safety

A migration's `Expected`
(`evidence/schema/expected.schema.json`) is not just "the new schema
works." It describes two separable properties:

- **Forward behavior** — `predicate_kind: "behavioral"` — what
  queries against the new schema return. `source_ref` points at the
  migration file, the design `Decision`, or an application spec.
- **Safety invariant** — `predicate_kind: "invariant"` — what must
  remain true across the migration: existing rows are preserved,
  nullable columns default correctly, foreign-key relationships
  remain satisfiable, the migration is reversible (or, if not, that
  a backup exists), no query plan regresses beyond an agreed
  threshold.

For irreversible migrations (`DROP COLUMN`, `ALTER TYPE`, `DROP
TABLE`), the `Expected` MUST additionally state an irreversibility
acknowledgement: an `alternatives` entry on the `Decision` recording
why a reversible alternative (rename-and-defer, soft-delete, etc.)
was rejected. An irreversible migration with no such acknowledgement
is a process violation.

### 4. Capture `Actual` from a representative execution

For each `Expected`, capture an `Actual`
(`evidence/schema/actual.schema.json`) by running the migration (and
the representative queries) against a non-production database — a
local dev DB, a CI snapshot, a Docker-compose instance, or a
snapshot restored for the purpose. The `Actual` records:

- `expected_ref` — pointing at the `Expected` from step 3.
- `observed_value` — the observed schema state, query result, or
  query plan, in the shape `predicate_kind` of the referenced
  `Expected` implies (a result set for `"behavioral"`, a boolean
  invariant check for `"invariant"`).
- `observation_ref` — pointing at the `Event` (`EXPLAIN` output,
  migration run output, snapshot diff) from which the observation
  was captured. `Actual` is never freestanding —
  `actual.schema.json` requires this field; a value typed from
  memory rather than observed is invalid.

For query changes specifically, the `Actual.observed_value` should
include the `EXPLAIN`/`explain()` plan *and* the observed latency
(over a representative input size, not just a 10-row dev fixture —
10-row fixtures hide N² blowups that surface only at production
scale).

### 5. Index changes get before/after `EXPLAIN` as their own `Trace`

Adding or dropping an index is a `Decision` that affects the query
planner, not just the schema. The planner's behavior change is the
*actual* migration — the index file is a side effect. Capture the
planner's behavior change as a `Trace`
(`evidence/schema/trace.schema.json`) with ordered `Event`s:

1. `Event` (`kind: "observation"`) — `EXPLAIN` for each query the
   index is intended to speed up, *before* the index exists.
2. `Event` (`kind: "action"`) — the index creation itself
   (`CREATE INDEX …` / `db.collection.createIndex(…)`).
3. `Event` (`kind: "observation"`) — `EXPLAIN` for the same queries
   *after* the index exists.
4. `Event` (`kind: "observation"`) — `EXPLAIN` for queries that
   should *not* be affected (write paths, unrelated SELECTs), to
   confirm the index did not slow them down beyond threshold.

Each `Event.source` records which adapter produced it
(`claude-code:shell_exec:psql`, `chat-sandbox:shell_exec:mongo`).
The `Trace.event_refs` array preserves order — order is significant
because the *delta* between before and after is the validation
signal.

### 6. Connection pool changes get an `Expected` under load

Pool configuration (max connections, idle timeout, statement
timeout, `statement_cache_size`, read replica routing) is a
`Decision` affecting concurrency, latency, and resource usage.
Validate it with `Expected.predicate_kind: "state_property"` — a
property of the system's state under load, not a one-shot behavior.
The `Actual.observed_value` is the observed behavior under a load
test (the project's own load-test tool if one exists; a simple
concurrent-call script if not). A pool change validated only by a
single-request test is invalid — single-request tests cannot surface
pool exhaustion, deadlock under concurrency, or replica-lag
behavior.

### 7. Emit the `Validation`, then hand off to `behavioral-verification`

Aggregate step 3's `Expected` and step 4's `Actual` into a
`Validation` (`evidence/schema/validation.schema.json`):

- `expected_ref` + `actual_ref` — the `Expected`/`Actual` pair.
- `method: "app_validation"` if the project's own migration test
  suite ran (per `skills/testing/SKILL.md`) AND the EXPLAIN / load
  check ran — `app_validation` is the project's external validator
  asserting the migration is safe.
- `method: "contract_validation"` if the validation is a schema
  invariant check (FK satisfiable, unique constraint satisfiable
  against existing data) — the schema *is* the contract.
- `method: "replay_comparison"` for irreversible migrations that
  were re-applied to a snapshot — see step 8.
- `method: "unit_test"` alone is **insufficient** for any migration,
  per the same logic as `behavioral-verification`: a passing
  migration test suite does not confirm the migration is safe in
  production, only that it applied cleanly in CI. A `Validation`
  with `method: "unit_test"` and no stronger evidence is a process
  violation of this skill.
- `decision_ref` — pointing at the step-2 `Decision`. The
  `Validation` is what flips `Decision.validated` from `false` to
  `true`.
- `result: "match"` only if forward behavior AND safety invariant
  both held; `"mismatch"` if either failed; `"inconclusive"` if the
  check could not be run (e.g., snapshot unavailable).

This `Validation` is then handed to `behavioral-verification`, which
judges whether the validation method was strong enough to close the
workflow's `verify` state. The two skills do not duplicate work:
this skill emits the database-specific evidence;
`behavioral-verification` decides whether the evidence is
sufficient.

### 8. Irreversible migrations require a `Replay` against a snapshot

For any migration marked irreversible in step 3 (DROP COLUMN, ALTER
TYPE, DROP TABLE, shard-key change, etc.), the `Validation.method`
MUST be `"replay_comparison"` — emit a `Replay`
(`evidence/schema/replay.schema.json`) that:

- `original_trace_ref` — points at the `Trace` from the dev-DB run.
- `replay_trace_ref` — points at a new `Trace` produced by applying
  the migration to a production-shaped snapshot (anonymized if it
  contains PII; never restore a raw production snapshot to a
  non-production environment without anonymization).
- `result: "matches_expected"` only if the snapshot-applied
  migration produces the same `Actual` as the dev-DB run AND no
  `divergence_from_original` is observed.
- `result: "diverges"` if the snapshot migration's behavior differs
  from the dev-DB run (e.g., the dev fixture had 10 rows and the
  snapshot has 10 million, and the migration deadlocks at scale).
  Transition back to the design state with `on: migration_unsafe_at_scale`.

An irreversible migration applied without a `Replay` is a process
violation — production data cannot be the test fixture for an
irreversible change.

## Tool integration

- `filesystem_read`: read existing migrations, schema files, ORM
  models, repository abstractions, and the project's
  `project-intelligence.json` to identify the database system. Also
  used to read prior `Decision`/`Expected`/`Actual` artifacts when
  building a reference chain.
- `filesystem_write`: write new migration files, schema changes, and
  the evidence JSON artifacts this skill emits (`Decision`,
  `Expected`, `Actual`, `Validation`, `Replay`). Target location for
  evidence artifacts follows `evidence-engineering`'s open question
  on storage location.
- `shell_exec`: run the project's migration tool (`alembic upgrade`,
  `prisma migrate deploy`, `psql -f migrations/…`, `mongo` shell
  scripts), run `EXPLAIN`/`explain()` for plan inspection, take and
  restore snapshots (`pg_dump`/`pg_restore`, `mongodump`/`mongorestore`,
  `mysqldump`), and run concurrent-call scripts for pool validation.
  Prefer one-shot, scriptable commands — the output must be
  replayable by a future `Replay` step.
- `test_runner`: run the project's migration test suite (per
  `project.test_system`). Many projects keep migration tests in a
  separate suite (`pytest migrations/`, `npm run test:migrations`) —
  detect and run that suite explicitly when it exists.

## Validation

This skill is considered successful for a given database change only
if:

- Every migration / query change / index change / pool change is
  emitted as a `Decision` (`evidence/schema/decision.schema.json`)
  with `validated: false` initially, `result: "pending"`, and at
  least one `alternatives` entry recording a rejected approach.
- Every `Decision` has a paired `Expected`
  (`evidence/schema/expected.schema.json`) describing both forward
  behavior (`predicate_kind: "behavioral"`) AND safety invariant
  (`predicate_kind: "invariant"`). For irreversible migrations, the
  `Expected` additionally acknowledges irreversibility.
- Every `Expected` has a paired `Actual`
  (`evidence/schema/actual.schema.json`) with `observation_ref`
  pointing at a real `Event` — never a value typed from memory.
- Index changes have a before/after `EXPLAIN` `Trace`
  (`evidence/schema/trace.schema.json`) with at least 4 ordered
  `Event`s (before / create / after / unrelated-queries-unchanged).
- Pool changes have an `Expected` with `predicate_kind:
  "state_property"` validated under concurrent load, not a
  single-request test.
- Irreversible migrations have a `Replay`
  (`evidence/schema/replay.schema.json`) with `result:
  "matches_expected"` against a production-shaped snapshot.
- The final `Validation` (`evidence/schema/validation.schema.json`)
  has `method` of `"app_validation"`, `"contract_validation"`, or
  `"replay_comparison"` — never `"unit_test"` alone for a migration.
  The `decision_ref` points at the step-2 `Decision`, and the
  `Decision.validated` is flipped to `true` only by this `Validation`.

A migration applied to production without this evidence chain —
even a correct migration — is a process violation of this skill,
because the `regression` workflow cannot trace why the schema is the
way it is, and a future change cannot know whether the migration's
invariants still hold.

## Examples

**Happy path (add nullable column, reversible):** `feature-request`
workflow adds a `users.email_verified_at TIMESTAMPTZ NULL` column to
a Postgres project — step 1 identifies `database_system: "postgres"`,
`migration_mechanism: "alembic"` — step 2 emits `Decision` with
`what: "db_migration:add_email_verified_at"`, `validated: false`,
`alternatives: [{option: "default to NOW()",
rejected_because: "backfills verification time on existing rows
that were never verified"}]` — step 3 emits `Expected` with forward
behavior (`predicate_kind: "behavioral"`,
`predicate: "SELECT email_verified_at FROM users WHERE id=? returns
null for pre-existing rows, the verification timestamp for newly-
verified rows"`) and safety invariant (`predicate_kind: "invariant"`,
`predicate: "existing rows preserved; nullable column accepts null;
no FK or unique constraint added"`) — step 4 captures `Actual` by
running `alembic upgrade head` on the dev DB and querying a pre-
existing row (observed_value: `null`) — step 7 emits `Validation`
with `method: "app_validation"`, `result: "match"`, `decision_ref`
flipping the `Decision.validated` to `true` — hand off to
`behavioral-verification`, which confirms the validation method is
sufficient. Migration committed with the evidence chain attached.

**Failure mode (irreversible migration caught by snapshot `Replay`):**
`change-request` workflow drops a `users.legacy_status` column that
the team believes is unused — step 2 emits `Decision` with
`what: "db_migration:drop_legacy_status"`, marks it irreversible in
step 3 with `Expected` acknowledging irreversibility and an
`alternatives` entry (`{option: "rename to deprecated_legacy_status
and defer drop for one release",
rejected_because: "schema audit shows no references in 90 days"}`) —
step 4 dev-DB run produces `Actual` with `observed_value:
"migration applied, no queries fail"` because the dev fixture has
no data depending on `legacy_status` — step 8's required `Replay`
against a production-shaped snapshot reveals a quarterly batch job
(`Event` of `kind: "observation"`, captured by `EXPLAIN` on the
job's query against the snapshot) that references `legacy_status`
and would fail — `Replay.result: "diverges"`,
`divergence_from_original: "dev fixture has 0 rows touching
legacy_status; snapshot has 48,217 rows from quarterly batch job
that references the dropped column"` — `Validation.result:
"mismatch"`, `method: "replay_comparison"` — workflow transitions
back to design with `on: migration_unsafe_at_scale`. Without this
skill, the DROP COLUMN migration would have shipped on the strength
of the clean dev-DB run and the green migration test suite, and
the quarterly batch job would have failed in production three
months later.

**NoSQL coverage (MongoDB index change):** A MongoDB project adds
a compound index on `{tenant_id: 1, created_at: -1}` to speed up a
dashboard query — step 5's required `Trace` captures
`db.collection.find({tenant_id}).sort({created_at: -1}).explain()`
before (collscan, ~1200ms over the dev fixture) and after (ixscan
on the compound index, ~8ms) plus `EXPLAIN` for the unrelated write
path (`db.collection.insertOne(…)`) to confirm the index did not
slow writes beyond threshold (observed write latency rose from 4ms
to 5ms, within threshold) — `Validation.method: "app_validation"`,
`result: "match"`. The discipline is identical to the SQL case —
the migration mechanism (MongoDB's `createIndex`) is different, the
evidence shape is not.
