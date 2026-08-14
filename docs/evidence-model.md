# Evidence Model

## Core entities (semantic contract)

| Entity | Definition | Required keys |
|---|---|---|
| Incident | "Something diverged from expected." | id, observed_at, environment_fingerprint, expected_ref, actual_ref, severity |
| Trace | Ordered events during an execution. | id, incident_ref?, events[], started_at, ended_at |
| Event | A single observed occurrence. | id, trace_ref, ts, kind, payload, source |
| Decision | A choice made by agent or system at a fork. | id, trace_ref, what, why, evidence_refs[], alternatives[], result, validated |
| State Transition | System moved from state A to B. | id, trace_ref, from, to, trigger, invariant_refs[] |
| Contract | A declared contract between components. | id, parties, input_schema, output_schema, invariants[] |
| Invariant | A property that must always hold. | id, scope, predicate, validation_ref |
| Expected | What the system should produce. | id, contract_ref?, invariant_ref?, spec_ref, predicate |
| Actual | What the system did produce. | id, expected_ref, observed_value, observation_ref |
| Validation | Did actual match expected? | id, expected_ref, actual_ref, result, method, evidence_refs[] |
| Environment Fingerprint | Reproducibility context. | id, runtime, versions, env_vars(redacted), git_commit, os, arch |
| Reproduction | Steps to reproduce an incident. | id, incident_ref, steps, environment_fingerprint_ref, deterministic |
| Replay | Re-execution of a reproduction. | id, reproduction_ref, environment_fingerprint_ref, result, divergence_from_original |
| Regression | A previously-fixed incident recurring. | id, incident_ref, original_fix_ref, current_evidence_ref |

Note: `environment_fingerprint.env_vars` is always stored redacted — no
raw secret values are ever captured into evidence artifacts.

## The debugging chain (mapped to entities)

```
Observed Behavior → Incident
        ↓
Evidence → Trace + Events + Environment Fingerprint
        ↓
Expected Behavior → Expected (+ Contract/Invariant refs)
        ↓
Mismatch → Validation (result: mismatch)
        ↓
First Invalid Decision / State → Decision or State Transition (root cause candidate)
        ↓
Root Cause → Decision (validated=true, root_cause=true)
        ↓
Minimal Fix → patch + State Transition
        ↓
Regression Protection → Invariant + Regression entry + Validation
        ↓
Replay → Replay (divergence_from_original = none)
        ↓
Verification → Validation (result: match)
```

## AI output validation (mapped)

```
AI proposes → Decision (what=ai_proposal, validated=false)
        ↓
application validates → Validation (method=app_validation)
        ↓
behavioral contract validates → Validation (method=contract_validation)
        ↓
accept / reject → Decision.validated updated; on reject, Decision.result = rejected + reason
```

## Serialization

Default: JSON. Schemas in `evidence/schema/*.schema.json`. Other
serializations are adapters (see ADR-0012).

## Validation status

This model is novel — no upstream prior art was found (see
`docs/research.md`). Each entity must be validated against at least 3
real bug scenarios before Phase 5 (Engineering Skills) begins, per
ADR-0004 and the risk register in `docs/implementation-roadmap.md`.
