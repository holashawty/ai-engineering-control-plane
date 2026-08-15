---
name: backend
description: Use whenever a task touches API endpoints, service-layer logic, inter-service communication, or backend infrastructure. Ensures backend changes are verified by both unit tests AND contract validation (per behavioral-verification skill) — does the API actually honor its declared contracts? Covers REST/GraphQL/gRPC equally. Distinct from testing (which runs test suites) — this skill covers backend-specific discipline — API contract validation, error handling patterns, idempotency checking, rate-limit awareness.
license: MIT
allowed-tools: [filesystem_read, filesystem_write, shell_exec, test_runner]
---

# Backend

## When to use this skill

Any time a task touches API endpoints, service-layer logic, inter-
service communication, or backend infrastructure — regardless of
which workflow is running. This is a cross-cutting domain skill: any
workflow may cite it in its `skills_required` list when the task
touches the backend domain (`feature-request` adding an endpoint,
`change-request` modifying a response shape, `bug-report` diagnosing
a 500 spike, `refactor` extracting a service layer,
`performance-problem` reducing p99 latency).

**Especially when:**

- An API endpoint is being added, modified, or removed — including
  changes that "look the same" but alter response shape, status
  codes, headers, error semantics, or idempotency behavior.
- An inter-service call is being added or modified (a new upstream
  dependency, a timeout change, a retry-policy change, a circuit-
  breaker threshold change).
- An error-handling pattern is being changed (new error code,
  changed status code mapping, structured-vs-unstructured error
  body change, locale change in error messages).
- An idempotency key is being introduced, removed, or has its
  semantics changed (the same key now resolving to a different
  cached response, or the key's TTL changing).
- A rate-limit is being added, removed, or tuned (per-endpoint
  quota, per-user quota, 429-response semantics, `Retry-After`
  header behavior).
- A contract is being declared or modified (OpenAPI spec, GraphQL
  schema, gRPC `.proto`, JSON Schema for response bodies).

**Don't use as a substitute for `testing`:** that skill runs the
project's own test suite (per `project.test_system` — pytest, Jest,
Go testing, etc.). This skill covers the backend-specific discipline
on top of — not instead of — that test run. A green endpoint test
suite is *necessary* but not *sufficient*; tests assert what the
author thought to check, while this skill probes the contract,
operational, and resilience properties the author may not have
considered.

**Don't use as a substitute for `behavioral-verification`:** that
skill confirms a specific behavioral claim against `Expected` and
is the canonical place where `method: "contract_validation"` lives.
This skill produces the backend-specific `Expected`s, `Actual`s, and
`Trace`s that `behavioral-verification` consumes. The two compose:
this skill emits the evidence; `behavioral-verification` judges it.

## Procedure

### 1. Identify the API protocol (stack-native, not assumed)

Read `.aiecp/project-intelligence.json` (per `skills/testing/SKILL.md`
step 1 — same stack-native discipline). The file's `project.test_system`
and `project.build_system` declare the toolchain; for backends, also
look for an explicit `project.api_protocol` field if the discovery
pipeline emits one, and inspect the repository for contract
artifacts (`openapi.yaml`/`openapi.json`, `schema.graphql`,
`*.proto`, `asyncapi.yaml`). If the file does not exist, run
`discovery/cli` first (`node dist/cli.js <repo-path>`) rather than
assuming REST.

The mechanism varies by protocol — the discipline does not:

- **REST (OpenAPI):** endpoints are paths + methods; contracts are
  OpenAPI / Swagger specs; contract validation is `openapi-backend`,
  `dredd`, `prism`, `schemathesis`; idempotency is per-method
  (`GET`/`PUT`/`DELETE` are idempotent by HTTP semantics, `POST`/
  `PATCH` are not).
- **GraphQL:** endpoints are operations (queries, mutations,
  subscriptions); contracts are the GraphQL schema; contract
  validation is `graphql-shield`, schema-level directives,
  `apollo-server` response validation; idempotency is per-mutation
  and must be declared in the schema or service layer.
- **gRPC:** endpoints are service methods; contracts are `.proto`
  files; contract validation is `grpcurl` + `buf` breaking-change
  detection; idempotency is declared per-method in the `.proto`
  (`option idempotency_level = IDEMPOTENT`).
- **Async / event-driven (Kafka, RabbitMQ, SQS):** endpoints are
  topic/queue subscriptions; contracts are the event schema
  (Avro, JSON Schema, Protobuf); contract validation is schema
  registry + consumer-side validation; idempotency is consumer-
  side deduplication.

Record the identified protocol as an `Event`
(`evidence/schema/event.schema.json`) of `kind: "observation"` with
`payload.api_protocol: "<rest|graphql|grpc|async>"` and
`payload.contract_artifact: "<path-to-openapi-or-proto-or-schema>"`.
This `Event` anchors every later step — never proceed without it.

### 2. Treat every endpoint change as a `Decision` with `validated: false`

Per `constitution/constitution.md` §2 and `docs/evidence-model.md`'s
AI-output validation pattern: every endpoint addition, modification,
or removal; every inter-service call addition or modification; every
error-handling pattern change; every idempotency-key change; every
rate-limit change is a `Decision`
(`evidence/schema/decision.schema.json`) emitted with:

- `what: "api_change:<endpoint_id>:<change_kind>"` where
  `change_kind` is one of `add`, `modify`, `remove`,
  `contract_change`, `error_semantics_change`,
  `idempotency_change`, `rate_limit_change`,
  `interservice_call_change`.
- `why` — what the change accomplishes for callers, and why the
  chosen approach beat alternatives (at least one `alternatives`
  entry per `decision.schema.json`'s `alternatives` array). For
  breaking changes, the `alternatives` MUST include a non-breaking
  option (`/v2/` parallel endpoint, additive-only change, etc.)
  with a recorded reason for rejection.
- `validated: false` initially — flipped only by step 9's
  `Validation`.
- `made_by: "agent"` for AI-proposed changes; `made_by: "human"`
  if the change is human-authored and the agent is verifying it.
- `result: "pending"` until the `Validation` flips it to `"accepted"`.

An endpoint change shipped without this `Decision` first being
emitted is a process violation of this skill — even if the change
is correct, a future `regression` workflow cannot trace why a
caller's integration broke, and a downstream service cannot know
whether the contract it depended on still holds.

### 3. Emit an `Expected` for contract AND operational invariants

An API change's `Expected`
(`evidence/schema/expected.schema.json`) covers *four* separable
properties — collapsing them into one is the failure mode this
skill exists to prevent:

- **Contract behavior** — `predicate_kind: "behavioral"` — what
  the endpoint returns for valid inputs, including status code,
  response shape, headers, and pagination/cursor semantics. The
  `source_ref` points at the contract artifact (`openapi.yaml#/
  paths/~1users~1{id}`, `schema.graphql#Mutation.updateUser`,
  `users.proto#UserService.GetUser`).
- **Contract invariant** — `predicate_kind: "invariant"` — what
  must remain true across every call: response always validates
  against the declared schema, required fields are never null,
  error responses always include a stable error code, content
  negotiation (`Accept`/`Content-Type`) is honored.
- **Error semantics invariant** — `predicate_kind: "invariant"` —
  what must remain true across every error path: 4xx for caller
  faults, 5xx for server faults, structured error body with stable
  error code + actionable message + correlation id, no internal
  detail leakage in production. `source_ref` points at the
  project's error-handling contract or RFC 9457 (`application/
  problem+json`).
- **Operational state property** — `predicate_kind:
  "state_property"` — what must be true across the system's state:
  idempotency (same request twice yields same result without
  duplicate side effects), rate-limit enforcement (429 with
  `Retry-After` when the limit is exceeded), inter-service
  resilience (timeouts bounded, retries bounded, circuit breaker
  opens after N consecutive failures).

For breaking changes, the `Expected` MUST additionally state a
breaking-change acknowledgement: an `alternatives` entry on the
`Decision` recording why a non-breaking alternative (versioned
endpoint, additive-only change, deprecation window) was rejected.
A breaking change with no such acknowledgement is a process
violation — production callers cannot be the test fixture for a
breaking change.

### 4. Capture `Actual` via contract validation against the running endpoint

For each `Expected`, capture an `Actual`
(`evidence/schema/actual.schema.json`) by exercising the running
endpoint (in the project's test runner via a contract-validation
tool, in a Docker-compose stack via direct HTTP/gRPC calls, or
against a local dev server) and recording the observed status code,
response body, headers, and timing. The `Actual` records:

- `expected_ref` — pointing at the `Expected` from step 3.
- `observed_value` — the observed status code, response body
  (validated against the declared schema), headers, and observed
  latency, in the shape `predicate_kind` of the referenced
  `Expected` implies.
- `observation_ref` — pointing at the `Event` (HTTP request/
  response transcript, GraphQL operation log, gRPC frame trace)
  from which the observation was captured. `Actual` is never
  freestanding — `actual.schema.json` requires this field; a value
  typed from memory rather than observed is invalid.

Group all per-scenario `Event`s under a single `Trace`
(`evidence/schema/trace.schema.json`) with `source:
"test_runner"` (if exercised via the project's test runner) or
`source: "agent_adapter"` (if exercised via `shell_exec` with
`curl`/`grpcurl`/`gh api graphql`). Order is significant — the
trace should read: happy path request, happy path response, error
path request, error path response, idempotency retry, rate-limit
exceeded, …

### 5. Run contract validation against the declared contract

This step is *not* optional — the description of this skill
explicitly invokes `behavioral-verification`'s `contract_validation`
method. Use the project's own contract-validation tool (per step 1's
identification — `prism`, `schemathesis`, `openapi-backend`,
`buf`, `graphql-shield`) to assert that every observed response
from step 4 actually validates against the declared contract. Each
contract assertion becomes an `Event` of `kind: "test_result"` with
`payload.exit_code: 0|non-zero`, `payload.violations: [...]`.

A green test suite that does not exercise the declared contract is
insufficient — tests assert what the author thought the endpoint
does; contract validation asserts what the endpoint actually
*commits to* by the contract it declared. The two diverge most often
when:

- The contract says a field is required, the implementation omits
  it for some inputs (and no test exercises that input).
- The contract says `422` for validation errors, the implementation
  returns `400` (and no test asserts the status code, only the
  response body).
- The contract declares an enum of `[active, inactive]`, the
  implementation returns `"pending"` for a state the contract
  doesn't model (a contract drift bug — the contract needs
  updating, or the implementation needs fixing; both are valid
  findings, but the drift must be surfaced, not silently shipped).

Each contract violation is a separate `Actual` referencing the
`Expected` (contract behavior) it violated. Aggregate them into a
per-endpoint `Validation` in step 9.

### 6. Error semantics checked across every error path

For every error path the endpoint can produce (validation error,
unauthorized, forbidden, not-found, conflict, unprocessable,
rate-limited, upstream-timeout, upstream-5xx, internal-server-error),
emit a separate `Expected` (error semantics invariant) and `Actual`
(observed error response). The `Actual.observed_value` records:

- The observed status code (must match the declared contract).
- The observed error body shape (must validate against the
  project's error contract — RFC 9457 `application/problem+json`
  if declared, otherwise the project's own structured error
  shape).
- Whether the error message is actionable (tells the caller what to
  *do*, not just what went wrong — "input must be a non-empty
  string, got ''" not "invalid input").
- Whether a correlation id is present (so the caller can reference
  the failure when contacting support).
- Whether internal detail (stack trace, internal hostname, raw
  SQL error message) is leaked in the response body (it must not
  be, in any non-development environment).

A single error path that does not match the declared contract
yields `result: "mismatch"` for the entire endpoint — error paths
are not polish items; they are the paths callers hit when something
is already wrong, and a confusing error response compounds the
problem rather than helping.

### 7. Idempotency checking

For mutations (POST, PUT, PATCH in REST; mutations in GraphQL;
non-idempotent methods in gRPC), validate idempotency:

- If the endpoint accepts an idempotency key (`Idempotency-Key`
  header, `idempotency_key` field), submit the same request twice
  with the same key and confirm the second response matches the
  first (same status, same body, same side effects — no duplicate
  database rows, no duplicate charges, no duplicate emails sent).
- If the endpoint does not accept an idempotency key, document
  whether the operation is idempotent by HTTP semantics (`PUT` to
  a specific resource is idempotent; `POST` to a collection is
  not). If the operation is non-idempotent and a key is not
  accepted, callers retrying after a network timeout risk
  duplicates — that is a contract finding, not a defect, but it
  must be surfaced to the contract owner.

Capture each idempotency check as an `Event` of `kind:
"observation"` with `payload.idempotent: true|false`,
`payload.duplicate_side_effects_observed: <list>`. A mutation
claiming idempotency that produces duplicate side effects is a
process violation of this skill — the contract is wrong, the
implementation is wrong, or the test fixture is too small to
surface the duplicate; all three require a fix.

### 8. Rate-limit awareness and inter-service resilience

For rate-limited endpoints, validate the 429 path: exceed the limit
and confirm the response is `429` with a `Retry-After` header (or
the project's chosen throttling convention). A rate limit that
returns `500` instead of `429` is a contract violation — the caller
cannot distinguish "I am being rate-limited" from "the server is
broken," and will not back off correctly.

For inter-service calls (the endpoint calls another service),
validate resilience:

- **Timeouts are bounded** — every outbound call has an explicit
  timeout (no infinite-wait default). Capture the configured
  timeout as an `Event` of `kind: "observation"`,
  `payload.timeout_ms: <value>`. An unbounded outbound call is a
  process violation — under upstream-slow conditions, the inbound
  request will pile up with no release, and the service will
  exhaust its connection pool.
- **Retries are bounded** — every retry policy has a max-attempts
  bound and a backoff. An unbounded retry loop is the "thundering
  herd" failure mode that takes down upstream services during
  incidents.
- **Circuit breaker** — if the project uses a circuit breaker
  (Hystrix, Resilience4j, `opossum`, `circuit-breaker-js`, custom),
  validate the breaker opens after the configured threshold and
  returns a fast-fail response (503 with `Retry-After`, or a
  fallback response) rather than queuing requests.

These checks are `predicate_kind: "state_property"` `Expected`s
validated under load (concurrent calls + artificial upstream
slowness) — a single-request test cannot surface timeout,
retry-storm, or circuit-breaker behavior.

### 9. Emit the `Validation`, then hand off to `behavioral-verification`

Aggregate step 3's `Expected`s and step 4's `Actual`s (per scenario)
plus step 5's contract-validation results into a `Validation`
(`evidence/schema/validation.schema.json`):

- `expected_ref` + `actual_ref` — the `Expected`/`Actual` pair
  for the primary contract behavior.
- `method: "contract_validation"` if the project's own contract-
  validation tool ran (step 5) AND every error path was checked
  (step 6) AND idempotency was checked (step 7) AND rate-limit
  + resilience were checked (step 8). This is the canonical
  method this skill exists to make routine.
- `method: "app_validation"` if the endpoint was exercised end-
  to-end via the project's integration test suite (a weaker
  validation than contract validation, because integration tests
  do not assert contract conformance — only "this call returned
  this response in this test environment"). Acceptable when no
  contract-validation tool exists in the project's toolchain, but
  record the absence as a gap in the `Validation.evidence_refs`.
- `method: "manual_review"` only for chat LLMs without
  `shell_exec`/`test_runner` — the chat LLM mentally simulates
  each scenario. As with `frontend`, chat LLMs should be
  especially cautious about claiming "no contract violations" from
  mental simulation.
- `method: "unit_test"` alone is **insufficient** for any API
  change, per the same logic as `behavioral-verification`: a
  passing endpoint unit test does not confirm contract conformance,
  error semantics, idempotency, or resilience under load.
- `decision_ref` — pointing at the step-2 `Decision`. The
  `Validation` is what flips `Decision.validated` from `false` to
  `true`.
- `result: "match"` only if contract behavior AND contract invariant
  AND error semantics AND operational state property all held
  across every scenario. A single failing path yields `result:
  "mismatch"`.

This `Validation` is then handed to `behavioral-verification`, which
judges whether the validation method was strong enough to close the
workflow's `verify` state. `behavioral-verification` is the canonical
home of `method: "contract_validation"`; this skill is what produces
the evidence that earns it.

## Tool integration

- `filesystem_read`: read existing endpoint definitions, contract
  artifacts (`openapi.yaml`, `schema.graphql`, `*.proto`), service-
  layer code, error-handling middleware, idempotency-key stores,
  rate-limit configuration, inter-service client code, and the
  project's `project-intelligence.json` to identify the API
  protocol. Also used to read prior `Decision`/`Expected`/`Actual`
  artifacts when building a reference chain.
- `filesystem_write`: write new endpoint code, contract changes
  (OpenAPI spec updates, GraphQL schema migrations, `.proto`
  updates), and the evidence JSON artifacts this skill emits
  (`Decision`, `Expected`, `Actual`, `Validation`). Contract
  artifacts updated without a paired `Decision` are a process
  violation — the contract is the spec callers depend on, and a
  silent contract change is exactly the failure mode this skill
  exists to prevent.
- `shell_exec`: run the project's contract-validation tool
  (`prism validate`, `schemathesis run`, `openapi-backend
  validate`, `buf breaking`), exercise the running endpoint via
  `curl`/`grpcurl`/`gh api graphql`, run integration tests, and
  run load tests for resilience validation. Prefer one-shot,
  scriptable commands — the output must be replayable by a future
  `Replay` step.
- `test_runner`: structured execution of integration tests via the
  project's test runner. Preferred over raw `shell_exec` when the
  adapter exposes structured test results (pass/fail per case, not
  raw text) — per `docs/portability.md` adapter `capabilities()`.
  Falls back to `shell_exec` for contract validation, idempotency
  retry, and load tests that do not fit the test runner's shape.

**For chat LLMs without `shell_exec`/`test_runner`:** this skill
is still usable, but every `Actual.observed_value` is the chat
LLM's mental simulation of the endpoint response, not observed
output. The `Validation.method` is `"manual_review"`, and the
simulation `Event`s contain the LLM's predicted status code,
response body, and error semantics — reviewable, not reproducible.
Chat LLMs should be especially cautious about claiming "the
contract is honored" or "the endpoint is idempotent" from mental
simulation — contract drift and idempotency bugs are precisely the
failures that look correct in a single happy-path mental run and
break under concurrent retry.

## Validation

This skill is considered successful for a given API change only if:

- Every endpoint / inter-service / error-handling / idempotency /
  rate-limit change is emitted as a `Decision`
  (`evidence/schema/decision.schema.json`) with `validated: false`
  initially, `result: "pending"`, and at least one `alternatives`
  entry recording a rejected approach. Breaking changes must
  additionally record why a non-breaking alternative was rejected.
- Every `Decision` has paired `Expected`s
  (`evidence/schema/expected.schema.json`) covering contract
  behavior (`predicate_kind: "behavioral"`), contract invariant
  (`predicate_kind: "invariant"`), error semantics invariant
  (`predicate_kind: "invariant"`), and operational state property
  (`predicate_kind: "state_property"`).
- Every `Expected` has a paired `Actual`
  (`evidence/schema/actual.schema.json`) with `observation_ref`
  pointing at a real `Event` (HTTP transcript, GraphQL log, gRPC
  trace) — never a value typed from memory.
- All per-scenario `Event`s are grouped under a single `Trace`
  (`evidence/schema/trace.schema.json`) preserving order.
- Contract validation (step 5) ran against the declared contract
  artifact — skipping contract validation is a process violation
  of this skill's own description.
- Every error path (step 6) was checked, not just the happy path.
- Idempotency (step 7) was checked for every mutation, with the
  observed duplicate-side-effects count recorded.
- Rate-limit (step 8) was checked by actually exceeding the limit
  and confirming the 429 + `Retry-After` path.
- Inter-service resilience (step 8) was checked for bounded
  timeouts, bounded retries, and circuit-breaker behavior.
- The final `Validation`
  (`evidence/schema/validation.schema.json`) has `method` of
  `"contract_validation"`, `"app_validation"`, or
  `"manual_review"` (chat LLMs only) — never `"unit_test"` alone
  for an API change.
- No breaking change ships without a paired contract-artifact
  update (OpenAPI/GraphQL/proto) and the breaking-change
  acknowledgement in the `Decision.alternatives`.

An endpoint change shipped without this evidence chain — even a
"trivial" status code change (e.g., `200` → `201` for a create
endpoint, which is correct but breaks every caller that asserted
`res.status === 200`) — is a process violation of this skill,
because production callers cannot be the test fixture for a
contract change, and a downstream service that breaks at 3am
cannot tell the team why its integration suddenly returns 4xx.

## Examples

**Happy path (add `GET /v1/users/{id}/memberships`, REST + OpenAPI):**
`feature-request` workflow adds a new endpoint to list a user's
memberships — step 1 identifies `api_protocol: "rest"`,
`contract_artifact: "openapi.yaml#/paths"`,
`contract_validation_tool: "schemathesis"` — step 2 emits
`Decision` with `what: "api_change:GET_users_id_memberships:add"`,
`validated: false`, `alternatives: [{option: "embed memberships in
GET /v1/users/{id} response",
rejected_because: "memberships are large and rarely needed; embedding
them would force every caller to fetch them"}]` — step 3 emits four
`Expected`s: contract behavior (`predicate_kind: "behavioral"`,
`predicate: "GET /v1/users/{id}/memberships returns 200 with array
of membership objects for valid user id; 404 for unknown user id;
401 for unauthenticated"`, `source_ref: "openapi.yaml#/paths/~1v1~1users~1{id}~1memberships"`),
contract invariant (`predicate_kind: "invariant"`,
`predicate: "response body always validates against Membership[]
schema; pagination cursor present when result count exceeds page_size"`),
error semantics (`predicate_kind: "invariant"`,
`predicate: "404 response includes RFC 9457 problem+json with
type, title, status, detail; correlation id in headers"`), and
operational (`predicate_kind: "state_property"`,
`predicate: "GET is idempotent by HTTP semantics; rate-limited at
100 req/min per user with 429+Retry-After when exceeded"`) — step
4 captures `Actual` via `schemathesis run` against the running
endpoint (50 generated requests, 0 contract violations) — step 5
contract validation: 0 violations — step 6 error paths: 404
returns `application/problem+json` with correlation id — step 7
idempotency: GET is idempotent by HTTP semantics, confirmed by
schemathesis — step 8 rate-limit: exceeding 100 req/min yields
429 + `Retry-After: 60` — step 9 emits `Validation` with
`method: "contract_validation"`, `result: "match"`, `decision_ref`
flipping `Decision.validated` to `true`. Endpoint ships.

**Failure mode (breaking change caught by contract validation):**
`change-request` workflow modifies `POST /v1/users` to add a
required `email` field to the request body — step 2 emits
`Decision` with `what: "api_change:POST_users:contract_change"`,
marks it breaking, with `alternatives: [{option: "make email
optional in v1, required in v2",
rejected_because: "v1 callers can submit empty email which is
semantically invalid; prefer fail-fast"}]` — step 3 emits
`Expected` for contract behavior (`predicate: "POST /v1/users
without email returns 422 with problem+json detailing the missing
field"`) — step 4 captures `Actual`: schemathesis generates
requests without `email` and the endpoint returns `400` (not
`422` as the OpenAPI spec declares) and a plain-text error body
(not `application/problem+json`) — step 5 contract validation:
2 violations found — step 6 error semantics: response body is
plain text "email is required" with no correlation id — step 9
emits `Validation` with `result: "mismatch"`, `method:
"contract_validation"`,
`evidence_refs` listing the 2 violation `Event`s — workflow
transitions back to `migrate` with `on: contract_violation`.
Without this skill, the breaking change would have shipped
with a green test suite (the test fixture always passed `email`),
and real callers hitting the new contract would have received
the wrong status code and a body they couldn't parse —
breaking every error-handling integration downstream.

**gRPC coverage (modify `UserService.GetUser` response shape):**
A `.proto` change adds a `deleted_at` field to the `User`
message — the discipline applies identically: step 1 identifies
`api_protocol: "grpc"`, `contract_artifact: "users.proto"`,
`contract_validation_tool: "buf"` — step 2 emits `Decision` with
`what: "api_change:UserService.GetUser:contract_change"` — step 5
runs `buf breaking` against the previous `.proto` to confirm the
change is additive (it is — adding a field is non-breaking for
Protobuf wire compatibility) — step 9 emits `Validation` with
`method: "contract_validation"`, `result: "match"`. The protocol
changes; the evidence shape does not.

**Idempotency bug caught by retry simulation:** A `POST /v1/charges`
endpoint claims idempotency via `Idempotency-Key` header — step 7
submits the same charge request twice with the same key — observed:
two distinct charge records created in the database (the
idempotency cache had a 60-second TTL but the test fixture's
second request landed at 61 seconds) — `Actual.observed_value:
"duplicate side effect observed; expected 1 charge, found 2"` —
`Validation.result: "mismatch"`, `method: "contract_validation"` —
workflow transitions back to `migrate` with `on:
idempotency_broken`. Without this skill, the idempotency claim
would have shipped on the strength of a single-request happy-path
test, and a real caller retrying after a network timeout would
have charged the customer twice.
