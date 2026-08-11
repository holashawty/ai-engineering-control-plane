# Security Model

## Threats

1. **Credential leakage into prompts, code, or committed files.**
   Mitigation: a pre-flight scanner that rejects prompts, commits, and
   generated files containing high-entropy strings matching known secret
   patterns (API keys, tokens, private keys). Any credential provided to
   an agent for a task must never be echoed back into logs, generated
   documentation, or version-controlled files.
2. **Silent constitution mutation** by the agent. Mitigation: ADR-0008 —
   framework governance changes are ADRs, never silent edits.
3. **Destructive operations** (prod mutation, irreversible migration,
   broad refactor). Mitigation: safety gates (ADR-0011).
4. **AI output treated as truth.** Mitigation: validation pipeline (AI
   proposes → app validates → behavioral contract validates →
   accept/reject).
5. **Supply chain risk from vendored skills.** Mitigation: signed skill
   manifests; pinned SHAs; NOTICE + license audit per skill before
   vendoring.
6. **Sandbox escape** when running agent-generated code. Mitigation:
   execution isolation delegated to the runtime adapter (OpenHands
   sandbox / Docker / VM) — the framework itself does not execute
   untrusted code directly.
7. **Memory poisoning** via adversarial input. Mitigation: memory entries
   are validated, scoped, and revocable; high-stakes entries require
   confirmation before being written.
8. **Indirect prompt injection** via repository content. Mitigation:
   repository content is treated as *untrusted data*; agent actions
   triggered by repo content go through the same safety gates as
   user-triggered actions.

## Safety gate policy

`constitution/safety-rules.md` enumerates operation classes with
required authorization:

- `prod-mutation` → explicit human confirmation + audit log
- `irreversible-migration` → explicit human confirmation + dry-run
  evidence
- `credential-access` → explicit human confirmation + scoped token
- `broad-refactor` (>N files or >M LOC) → plan + dry-run + confirmation
- `security-sensitive-change` (auth, crypto, secrets, perms) → plan +
  review
- `dependency-add/upgrade` → license + CVE check
- `force-push` / `branch-deletion` → forbidden by default
- `shell-exec` outside allowlist → blocked

## Pre-authorized policy file

A `.aiecp/policy.local.yaml` (git-ignored by default, optionally
committed for teams with explicit review) can pre-authorize scoped
operations to reduce friction without weakening the model. It must never
contain literal credentials — only capability grants and scopes;
credentials themselves are resolved at execution time from the
environment (e.g. env vars, a secret manager) and are never written to
disk by the framework.

## Autonomy levels (see also ADR-0014)

Destructive-operation safety gates above are the *floor*. Above that
floor, every project declares an explicit autonomy policy:

```yaml
autonomy:
  default: 3   # L0 Observe .. L5 Autonomous engineering with safety gates

allow:
  read_repository: true
  edit_source: true
  run_tests: true
  install_dependencies: ask
  database_migration: ask
  production_deploy: deny
  delete_files: scoped
```

No workflow may exceed the declared autonomy level for a given
capability, regardless of what the workflow definition itself requests.
