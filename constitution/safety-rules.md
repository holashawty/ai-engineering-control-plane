# Constitutional Safety Rules & Execution Boundaries

**Authority:** Derived from Constitution §3 (Safety & Non-Delegable Operations) and governed by `autonomy-policy.schema.json` (ADR-0014), ADR-0030, ADR-0035, and ADR-0043.
**Enforcement:** Enforced physically at runtime via `RuntimePolicyGateway` (`executor/src/runtime-gateway.ts`) and verified in state machines prior to state transitions.

---

## 1. Non-Delegable Operations (Forbidden without Human Token)

An AI agent, regardless of its autonomy level or claimed confidence, is strictly forbidden from autonomously executing:

1. **Remote Repository Destruction:** Force-pushing (`git push --force`, `git push -f`, `git push +<branch>`), deleting remote branches, or rewriting shared repository history.
2. **Persistent Infrastructure Mutation:** Deployments to production environments (`terraform apply`, `kubectl apply`, `helm upgrade`, `aws s3 sync`, `npm publish`) without an explicit out-of-band `humanApprovalToken`.
3. **Database Schema & Data Destruction:** Unconfirmed DDL/DML dropping databases, schemas, or tables (`DROP DATABASE`, `DROP TABLE`, `TRUNCATE TABLE`).
4. **Secret & Credential Inspection:** Direct reading or exfiltration of sensitive credential stores (`.env*`, `id_rsa*`, `*.pem`, `*.key`, `/etc/shadow`, `credentials.json`).
5. **Host Filesystem Annihilation:** Recursive deletions targeting system root or parent directories (`rm -rf /`, `rmdir /s /q c:\`, `format c:`).

---

## 2. Confirmation Protocol (`aiecp:confirm`)

1. **Broad Refactors:** Any code modification exceeding the active policy threshold (default: 50 lines of code or >3 files) requires explicit human confirmation via `advanceWithConfirmation()` or user token `aiecp:confirm`.
2. **Sensitive Governance Files:** Modifications to `constitution/`, `DECISIONS.md`, or root security policies require confirmation before writes are permitted.
3. **Silent Bypass Prohibition:** The agent cannot generate its own confirmation token or self-approve a blocked operation. The token must originate from external user input.

---

## 3. Physical Gate Bindings & Runtime Interception

All tool invocations (`filesystem_write`, `shell_exec`, `db_mutation`, `secret_access`) must pass through the `RuntimePolicyGateway`:

```
┌────────────────────────────────────────────────────────┐
│                   TOOL INVOCATION                      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
          ┌──────────────────────────────────┐
          │     RuntimePolicyGateway.ts      │
          ├──────────────────────────────────┤
          │ 1. Regex Tokenized Normalization │
          │ 2. Autonomy Policy Capability    │
          │ 3. State Machine Safety Gate     │
          │ 4. Cryptographic Merkle Ledger   │
          └────────────────┬─────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
     [ALLOW]           [CONFIRM]         [BLOCKED]
        │                  │                 │
  Execute Tool      Require Token       Throw Error
```

---

## 4. Cryptographic Audit Integrity

Every gate evaluation produces an immutable audit record chained via SHA-256 (`prevHash -> currentHash`). Any tampering or post-hoc alteration of audit records invalidates `verifyAuditChain()`, triggering immediate security alert.
