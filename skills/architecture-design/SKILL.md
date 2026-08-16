---
name: architecture-design
description: "Use after project-planning — selects technology stack based on requirements and plan, designs system architecture (monolith/microservice/serverless), database schema, API contracts, and deployment topology. Can trigger plan_revision_needed if architectural constraints conflict with requirements (emit Decision with what: architecture_constraint_conflict — see step 7 for why this is encoded in the what-field rather than a separate boolean field, due to decision.schema.json's additionalProperties: false). Distinct from specification (which writes spec TEMPLATES); this skill makes architectural DECISIONS and writes contracts.md + invariants.md + architecture.md. Writes: specs/contracts.md + specs/invariants.md + specs/architecture.md (new). Reads: specs/requirements.md + specs/plan.md. Novel to AIECP; no upstream equivalent found in docs/research.md."
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec]
---

# Architecture Design

## When to use this skill

After `project-planning` has produced `specs/plan.md` and
`specs/tasks.md` and before `ux-design` (for large projects) or
the implementation workflows (`feature-request` / `change-request`
/ `bug-report`). This skill is the **technical-decision** layer:
it selects the stack, designs the system shape, the database
schema, the API contracts, and the deployment topology — and
records each as a Decision plus a spec-section that downstream
skills and workflows cite via `source_ref`.

**Distinct from `specification`** (per
`skills/specification/SKILL.md`): specification provides spec
TEMPLATES per ADR-0002 (the `specs/contracts.md` /
`specs/invariants.md` / `specs/state-machines.md` family) and
emits `Expected` entities. That skill is for the *form* — how to
author a behavioral contract, an invariant, a state-property
Expected. This skill is for the *content* — it FILLS
`contracts.md` and `invariants.md` with the actual architectural
contracts (the /items endpoint's request/response schema, the
"every persisted User has a non-null `created_at`" invariant).
The template says "fill in the parties, input/output schema,
invariants, failure modes"; this skill fills them. Per the file-
level contract: `specs/contracts.md` and `specs/invariants.md`
are WRITTEN by `architecture-design` and READ by `project-planning`
(the feedback loop that drives the LIVING PLAN rule).

**Distinct from `project-planning`** (per
`skills/project-planning/SKILL.md`): planning decomposes
requirements into phases and tasks. That skill produces the
SCHEDULE. This skill produces the TECHNICAL CONSTRAINTS that the
schedule must respect. The two feed each other: planning reads
contracts/invariants (when they exist from a prior architecture
run) as constraints; architecture reads plan (the tasks it must
make technically feasible). When architectural constraints
conflict with requirements, this skill emits a Decision with
`conflicts_with_requirements: true` — which the orchestrator's
`evaluate-result` detects and routes back to `project-planning`
via the `plan_revision_needed` transition. This is the feedback
loop that makes the planning + architecture pair a *living*
process rather than a waterfall.

**Distinct from `backend`** (per `skills/backend/SKILL.md`):
backend is a cross-cutting DOMAIN skill covering API contract
validation, error handling, idempotency, rate-limit awareness,
inter-service resilience — the discipline that applies *at
implementation time* when a workflow's `implement` / `migrate`
state touches backend code. That skill is for the *moment of
code change*. This skill is for the *moment of architectural
decision* — before any backend code is written, this skill
decides which framework, which database, which deployment shape.
Backend cites the contracts this skill writes; this skill writes
the contracts backend will later validate against.

**Distinct from `database`** (per `skills/database/SKILL.md`):
database is a cross-cutting DOMAIN skill covering migration
safety, query validation, index impact, connection-pool
management — the discipline that applies *at implementation time*
when a workflow touches database code. That skill is for the
*moment of code change*. This skill is for the *moment of schema
decision* — which database engine, which tables, which
relationships, which indexes. Database cites the schema this
skill writes; this skill writes the schema database will later
migrate safely.

## Procedure

### 1. Read specs/requirements.md + specs/plan.md

Open both files. This skill cannot proceed without them. If
either is missing, transition to blocked with the precise gap
"specs/<file>.md not found — run <predecessor-skill> first."
An architecture designed without requirements is a stack picked
in a vacuum; an architecture designed without a plan is a
design that ignores task boundaries and dependency ordering.

Extract from `specs/requirements.md`:

- The MVP scope and user stories (the architecture must support
  exactly the in-scope capabilities, no more — over-engineering
  for hypothetical Phase-3 needs violates the minimal-fix
  principle).
- The personas (an enterprise-persona architecture needs SSO,
  audit logs, multi-tenancy; a single-hobbyist-persona
  architecture does not).
- The monetization model (subscription → auth + tier boundary in
  the architecture; one-time-purchase → license-key validation;
  free → neither).
- The scale dimension (single-user → embedded SQLite is fine;
  public-internet-scale → connection pooling, caching, rate
  limiting).

Extract from `specs/plan.md`:

- The phases (the architecture must be viable for Phase 1 MVP
  AND extensible to Phase 2+ without a rewrite — a "Phase 1
  only" architecture that breaks at Phase 2 is a planning bug
  this skill must catch).
- The tasks (each task names a file path — the architecture's
  module boundaries must align with the task boundaries, or the
  plan's independent-testability rule (project-planning step 6)
  is violated).
- The dependency graph (the critical path — the architecture
  should not introduce a new critical-path dependency; if it
  does, that is a `conflicts_with_requirements` trigger).

### 2. Select tech stack

Under `## Technology Stack` in `specs/architecture.md`, name:

- **Language + version** — e.g., Python 3.11, TypeScript 5.4,
  Rust 1.75, Go 1.22. Cite the source: if the repo is existing,
  cite `.aiecp/project-intelligence.json`'s `project.stack`; if
  greenfield, cite the requirement that drove the choice (e.g.,
  "Python per the 'data-heavy + CSV export' requirement signal;
  the plan's Task 1.4 schedule calculation is well-supported by
  Python's `datetime` stdlib").
- **Framework** — e.g., FastAPI, Express, Actix, Next.js. Name
  the alternative considered and rejected (per the Decision's
  `alternatives` array): "FastAPI vs. Flask — chose FastAPI for
  native async + Pydantic validation; rejected Flask because
  the /items endpoint's expected p95 latency (<200ms per
  requirements) benefits from async I/O for the photo-storage
  sub-request."
- **Database** — e.g., PostgreSQL 16, SQLite 3.45, MongoDB 7.
  Name the alternative considered and rejected with a CONCRETE
  reason (not "MongoDB is bad"): "PostgreSQL vs. MongoDB — chose
  PostgreSQL because the Plant entity has a strict schema (name,
  species, watering_frequency_days) and the /schedule endpoint
  needs relational joins; rejected MongoDB because the
  document-model adds no value for this schema and removes
  transactional guarantees the watering-log needs."
- **Deployment** — e.g., Docker + Fly.io, Vercel, bare-metal +
  systemd, serverless (AWS Lambda). Name the alternative
  rejected: "Fly.io vs. Vercel — chose Fly.io because the
  PostgreSQL dependency requires a persistent process; Vercel's
  serverless model would require an external DB connection per
  invocation, adding ~50ms cold-start latency per request."

Per `constitution/constitution.md` §8 ("Tool use is mandatory")
and `skills/recency-verification/SKILL.md`: if the stack choice
depends on a time-sensitive claim (a framework's current
version, a cloud provider's current free-tier terms, a library's
current maintenance status), INVOKE the verification tool (web
search / fetch the framework's docs) before asserting it. A
stack choice based on training-data memory of "FastAPI is at
0.95" when FastAPI is actually at 0.115 (a real drift) produces
an architecture that targets a non-existent API. Emit a
`recency_unverifiable` Decision and transition to blocked if
the claim cannot be verified in the current environment.

### 3. Design system architecture

Under `## System Architecture` in `specs/architecture.md`, name:

- **Pattern** — monolith / microservice / serverless / modular-
  monolith. The default is **modular monolith** unless a
  requirement genuinely forces otherwise (genuine forcing
  functions: separate teams owning separate deploy cadences,
  separate scaling profiles for different modules, regulatory
  isolation). A greenfield MVP starting as microservices without
  a forcing function is over-engineering.
- **Module boundaries** — one paragraph per module, naming its
  responsibility and its public interface (the functions/classes
  other modules may call). Module boundaries MUST align with the
  task boundaries in `specs/tasks.md` (project-planning step 6
  — each module is independently testable). If they don't align,
  either revise the plan (conflict) or revise the module boundary
  (preferred).
- **Data flow** — a text/ASCII diagram showing how a request
  traverses the system: client → load balancer → app → cache →
  database → response. For a modular monolith with no cache, this
  is a 3-line diagram; for a microservice system, it can span a
  page. The diagram's purpose is to surface hidden cross-module
  dependencies the task graph did not capture.

### 4. Design database schema

Under `## Database Schema` in `specs/architecture.md`, name:

- **Tables/collections** — one block per table, with columns,
  types, constraints (NOT NULL, UNIQUE, CHECK, FK). Use the
  target database's DDL idiom (PostgreSQL `CREATE TABLE`,
  MongoDB collection-shape JSON).
- **Relationships** — FK references, join tables for many-to-
  many, cascade rules (ON DELETE RESTRICT vs. CASCADE — the
  choice is an architectural decision, not a default).
- **Indexes** — one line per index, naming the column(s) and
  the query it optimizes. An index without a named query is
  speculative; do not add speculative indexes (they slow writes
  for reads that may never happen).
- **Migration strategy** — how schema changes will be applied
  (Alembic for Python/SQLAlchemy, Prisma Migrate for Node,
  goose for Go). Cite `skills/database/SKILL.md`'s migration-
  safety discipline: every migration is a Decision with
  `validated: false` until verified, irreversible migrations
  require a `Replay` against a production-shaped snapshot.

If the schema conflicts with a requirement (e.g., the
requirements need a "soft delete" but the schema's FK cascade
rules would hard-delete), this is a `conflicts_with_requirements`
trigger — see step 7.

### 5. Design API contracts

In `specs/contracts.md`, write one `### CONTRACT-N: <name>` block
per API endpoint (REST route, GraphQL operation, gRPC method,
async-event topic). Each contract block contains (per
`specs/contracts.template.md`'s structure):

- **Parties** — who calls whom (e.g., "Web frontend → Backend
  API").
- **Method + path** — `GET /items`, `POST /waterings`, etc.
- **Request schema** — headers, query params, body (with
  types).
- **Response schema** — status codes, body (with types), error
  shapes.
- **Invariants** — cross-cutting contracts the endpoint honors
  (idempotency: "POST /waterings with the same `client_request_id`
  returns the existing watering, does not create a duplicate").
- **Failure modes** — the error paths (400 for bad input, 401
  for unauth, 409 for conflict, 429 for rate-limit, 500 for
  internal). Each failure mode is testable per
  `skills/backend/SKILL.md`'s "every error path checked" rule.

Emit one `Expected` per contract (per `specification` skill
step 3) with `predicate_kind: "behavioral"` and `source_ref:
"specs/contracts.md#CONTRACT-N"`. The `predicate` is the
human- and machine-checkable statement: "GET /items?tag=a
returns 200 with a JSON array of items having tag a, sorted by
`created_at` descending, paginated 50 at a time." A predicate
like "items endpoint works" is not checkable; rewrite it.

### 6. Design deployment topology

Under `## Deployment Topology` in `specs/architecture.md`, name:

- **Environments** — local / dev / staging / production (or a
  subset; a weekend MVP may have only local + production, and
  that is fine if named explicitly).
- **Containers** — Dockerfile(s), base images, multi-stage
  build strategy. If no containers (a bare-metal deploy), name
  that explicitly.
- **CI/CD** — GitHub Actions / GitLab CI / CircleCI / Jenkins.
  Name the pipeline stages: lint → test → build → deploy. The
  `quality-gate` skill runs at the lint+test stage boundary;
  `behavioral-verification` runs at the test stage.
- **Secrets management** — env vars, vault, secrets manager.
  Per `evidence-engineering` step 4's redaction rule: never
  write a secret value into `specs/architecture.md` — name the
  secret's *identifier* ("DATABASE_URL from Fly.io secrets"),
  not its value.

### 7. CHECK: do architectural constraints conflict with requirements?

This is the **conflict-detection step** — the structural feature
that makes this skill part of a feedback loop rather than a
waterfall. Walk through each requirement (from
`specs/requirements.md`) and each architectural decision (from
steps 2-6), checking for conflicts. A conflict is any case where
honoring the architectural constraint would VIOLATE a requirement,
or honoring a requirement would VIOLATE an architectural
constraint.

Common conflict patterns:

- **Scale vs. simplicity** — requirements say "single-user,
  weekend MVP" but the architecture selected a microservice
  pattern with 4 deployable services. Conflict: the architecture
  over-engineers the requirement.
- **Cost vs. capability** — requirements say "free / no
  monetization" but the architecture selected a paid cloud
  service (S3, Stripe, Twilio). Conflict: the architecture
  violates the cost constraint.
- **Offline vs. cloud** — requirements say "must work offline"
  but the architecture selected a cloud-only database (e.g.,
  PlanetScale). Conflict: the architecture cannot satisfy the
  offline requirement.
- **Auth vs. friction** — requirements say "no signup, just
  open the app" but the architecture selected a multi-tenant
  model requiring auth. Conflict: the architecture imposes
  friction the requirement forbids.
- **Schema vs. capability** — requirements say "users can edit
  past waterings" but the schema's audit-log design makes edits
  impossible (append-only). Conflict: the schema forbids the
  capability.

**If a conflict is found:** emit a `Decision` with:

- `what: "architecture_constraint_conflict"` — the canonical
  what-field for a conflict.
- `conflicts_with_requirements: true` — **NOTE: this field is
  NOT in `decision.schema.json`'s required properties.** The
  schema's `additionalProperties: false` means this field CANNOT
  be added to the Decision entity as persisted. Instead, encode
  the conflict flag in the `what` field (`what:
  "architecture_constraint_conflict"`) and the conflict reason
  in the `why` field. The orchestrator's `evaluate-result` state
  detects the conflict by matching on `what:
  "architecture_constraint_conflict"` (a string prefix match),
  not by reading a `conflicts_with_requirements` boolean. This
  keeps the Evidence Model schema-stable while still supporting
  the conflict-detection feedback loop. The task spec's
  `conflicts_with_requirements: true` notation is a logical
  description of the Decision's *meaning*, not a literal JSON
  field.
- `why` — naming the specific conflict: which requirement
  (cite `specs/requirements.md#<section>`), which architectural
  constraint (cite `specs/architecture.md#<section>` or
  `specs/contracts.md#CONTRACT-N`), and why they cannot coexist.
- `conflict_reason: "<one-sentence>"` — encoded in the `why`
  field's first sentence for machine-parseability.
- `validated: false`, `result: "pending"`.
- `alternatives` — naming at least one architectural alternative
  that WOULD satisfy the requirement, and why it was rejected
  (e.g., "alternative: SQLite instead of PostgreSQL for offline
  support — rejected because the /waterings endpoint's expected
  write rate (100/day) is well within SQLite's capacity but the
  schema's `JSONB` column for photo metadata would require
  PostgreSQL's JSONB ops; if the requirement's offline constraint
  is non-negotiable, the photo-metadata JSONB usage must be re-
  scoped to Phase 2").

This Decision triggers the orchestrator's `evaluate-result →
route on: plan_revision_needed` transition → `route` selects
`project-planning` → the plan is revised to account for the
conflict (e.g., re-scope the conflicting requirement to Phase 2,
or add a spike task to evaluate an alternative stack).

**If NO conflict is found:** emit a `Decision` with:

- `what: "architecture_designed"` — the canonical what-field
  for a successful architecture run.
- `why` — one paragraph summarizing the stack + architecture +
  schema + contracts + topology.
- `validated: false` — the architecture is a proposal, not a
  verified outcome. It becomes `validated: true` only when
  downstream `feature-request` / `change-request` workflows
  implement against it and `behavioral-verification` confirms
  the implementation honors the contracts and invariants.
- `result: "pending"`.
- `made_by: "agent"`.
- `evidence_refs` — pointing at (a) the `requirements_gathered`
  Decision, (b) the `plan_created` Decision, (c) any `recency-
  verification` Events if a stack-version claim was verified.
- `alternatives` — naming at least one rejected stack
  alternative per stack component (language, framework,
  database, deployment), with the rejection reason.

The `Decision.trace_ref` MUST point at the `Trace` wrapping the
inspection events (reading requirements + plan, any web-search
events for recency verification).

### 8. Write specs/contracts.md + specs/invariants.md + specs/architecture.md

Write three files:

- `specs/architecture.md` (NEW file, not in the original ADR-0002
  family — added by this skill as the home for stack + system-
  architecture + database-schema + deployment-topology decisions).
  This file is the architectural analogue of `specs/plan.md`:
  where the plan is the schedule, the architecture is the
  technical context the schedule executes within.
- `specs/contracts.md` (filled from `specs/contracts.template.md`
  — do NOT modify the template; fill an instance).
- `specs/invariants.md` (filled from `specs/invariants.template.md`).
  Each invariant becomes an `Expected` with `predicate_kind:
  "invariant"` per `specification` step 4.

If any of these files already exist (a prior architecture-design
run), APPEND new sections rather than overwriting — per ADR-0002
"spec evolves." Prior contracts/invariants are historical
artifacts that downstream `Expected` entities may reference via
`source_ref`; overwriting would dangle them.

## Tool integration

- **`filesystem_read`**: read `specs/requirements.md` (required
  input), `specs/plan.md` (required input), `specs/contracts.md`
  and `specs/invariants.md` (if they exist from a prior run —
  append, don't overwrite), `.aiecp/project-intelligence.json`
  (if the repo is existing — the discovered stack constrains the
  architecture: you cannot choose MongoDB if the repo is already
  PostgreSQL without a migration plan). Also read prior
  `Decision`/`Trace` artifacts for the evidence chain.
- **`filesystem_write`**: write `specs/architecture.md`,
  `specs/contracts.md`, `specs/invariants.md`. All writes are to
  `specs/`, never to source code. For revisions driven by
  `plan_revision_needed`, append a `## Architecture Revision —
  <date>` section.
- **`shell_exec`**: invoke version probes (`python --version`,
  `node --version`, `psql --version`, `docker --version`) to
  verify the chosen stack's runtime is available in the current
  environment. Invoke web-search / fetch tools (if available
  via the adapter) for `recency-verification` of stack-version
  claims, cloud-provider free-tier terms, and library maintenance
  status. Per `constitution/constitution.md` §8, these probes are
  MANDATORY for time-sensitive claims — do not assert "FastAPI
  0.115" from memory; verify it.

## Validation

This skill is considered successful for a given run only if:

- `specs/requirements.md` and `specs/plan.md` were both read.
  If either was missing, the skill transitioned to blocked with
  a precise gap.
- `specs/architecture.md` contains all four sections: Technology
  Stack, System Architecture, Database Schema, Deployment
  Topology. Each section names concrete choices, not placeholders.
- `specs/contracts.md` contains at least one `### CONTRACT-N`
  block per MVP API endpoint. Each contract has request schema,
  response schema, invariants, and failure modes.
- `specs/invariants.md` contains at least one invariant block
  for each cross-cutting property the architecture guarantees
  (e.g., "every persisted entity has `created_at` and
  `updated_at` timestamps").
- The tech stack selection cites a concrete requirement signal
  for each choice (not "we picked FastAPI because it's popular")
  AND names a rejected alternative with a concrete rejection
  reason.
- Recency verification was invoked for any time-sensitive stack
  claim (framework version, cloud free-tier terms, library
  maintenance status). Unverifiable claims emitted a
  `recency_unverifiable` Decision and transitioned to blocked
  rather than being asserted from memory.
- The conflict-detection step (step 7) ran explicitly: either a
  conflict was found and a `what:
  "architecture_constraint_conflict"` Decision was emitted
  (triggering the orchestrator's `plan_revision_needed` loop),
  OR no conflict was found and a `what: "architecture_designed"`
  Decision was emitted. The two outcomes are mutually exclusive
  for a single run.
- A `Decision` was emitted with `validated: false`,
  `result: "pending"`, `evidence_refs` pointing at the
  `requirements_gathered` and `plan_created` Decisions, and
  `alternatives` naming at least one rejected stack alternative
  per component.
- No question was asked during this skill's execution —
  architecture-design is a decision activity, not an elicitation.
  If a genuine ambiguity in the requirements is discovered, emit
  a `conflicts_with_requirements` Decision and let the
  orchestrator route back to `project-planning`; do NOT ask the
  user (the question budget belongs to `requirements-gathering`).

## Examples

**Happy path (no conflict):** `requirements-gathering` produced
a plant-tracking web app (4 user stories, single hobbyist
persona, free/no-monetization, weekend timeline).
`project-planning` produced a 2-phase plan with 6 tasks. →
Step 1 reads both files. → Step 2 selects: Python 3.11 (citing
the data-heavy + CSV export signal), FastAPI (citing the
<200ms p95 latency requirement + native async), SQLite (citing
the single-user + weekend-timeline signal + the "no external
DB service" cost constraint from the free/no-monetization
model), Fly.io deployment (citing the Docker + persistent-
process requirement for SQLite). Each choice has a rejected
alternative with a concrete reason. → Step 3 designs a modular
monolith with 3 modules (plants, waterings, photos) aligned to
the plan's task boundaries. → Step 4 designs a 2-table schema
(Plant, WateringEvent) with a FK from WateringEvent.plant_id to
Plant.id, ON DELETE CASCADE. → Step 5 writes 4 contracts in
`specs/contracts.md` (POST /plants, GET /plants/{id}, POST /
waterings, GET /plants/{id}/schedule). → Step 6 names local +
production environments, Dockerfile, GitHub Actions CI. → Step 7
checks conflicts: none found (SQLite satisfies the offline
constraint, Fly.io free tier satisfies the cost constraint, the
schema's CASCADE rule matches the "user can delete a plant and
its waterings" implicit requirement). → Emits Decision with
`what: "architecture_designed"`, `validated: false`. → Step 8
writes the 3 files.

**Conflict path (triggers plan_revision_needed):** Same setup,
but Step 2 selects PostgreSQL on Fly.io + S3 for photo storage.
Step 7 checks conflicts: the S3 free tier requires a credit card
(per a recency-verified web search), which conflicts with the
"free / no-monetization" requirement. → Emits Decision with
`what: "architecture_constraint_conflict"`, `why`: "S3 free
tier requires credit card (verified 2026-08-15 via
docs.aws.amazon.com/s3/free-tier); this conflicts with the
'free / no-monetization' constraint in
specs/requirements.md#monetization. Either re-scope photo
storage to local filesystem (Phase 1) + S3 migration (Phase 2),
or relax the no-credit-card constraint." → The orchestrator's
`evaluate-result` detects the `architecture_constraint_conflict`
what-field → transitions to `route` on `plan_revision_needed` →
`project-planning` revises the plan to use local filesystem
for MVP photos + a Phase-2 S3 migration task. →
`architecture-design` re-runs against the revised plan and (if
the local-filesystem choice has no further conflicts) emits
`what: "architecture_designed"`.

**Failure mode (3 conflicts → plan_revision_limit_reached):**
After 3 plan revisions (S3 conflict → local-fs conflict because
the plan's photo-volume estimate exceeds Fly.io's disk free tier
→ third revision proposes deferring photos to Phase 2, but that
removes US-4 from MVP, violating the requirements' MVP scope),
the 4th `plan_revision_needed` triggers. This skill does NOT
emit a 4th architecture. Instead it emits a Decision noting "3
architectural conflicts have not produced a viable design within
the requirements' constraints. The conflict is structural: the
requirements specify (a) photo upload in MVP, (b) free/no-
monetization, (c) no credit-card-required services, and no
combination of free-tier storage providers satisfies all three
as of <date> per recency-verification." The orchestrator
transitions to `blocked` on `plan_revision_limit_reached`. This
mirrors `systematic-debugging`'s three-failure rule: three
rejected architectural candidates is the empirical signal that
the problem is structural (the requirements are mutually
unsatisfiable), not local. Without the limit, the loop would
produce a 5th, 6th, 7th architecture — the failure mode the
`plan_revision_limit_reached` transition exists to prevent.
