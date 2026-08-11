# Security Policy

## Reporting a vulnerability

If you discover a security issue in this repository (the framework itself,
its generated entrypoints, or its evidence/memory tooling), please open a
private security advisory or contact the maintainers directly rather than
filing a public issue.

## Handling secrets

- Never commit credentials (tokens, API keys, passwords, private keys) to
  this repository, in code, configuration, or documentation.
- If a secret is accidentally exposed anywhere (commit history, issue,
  chat log, CI log), rotate/revoke it immediately at the source (e.g. the
  provider's token management page) and remove it from history.
- `.aiecp/policy.local.yaml` (if used) is git-ignored by default because it
  may contain locally pre-authorized, potentially sensitive automation
  scopes.

## Scope of this document

See `docs/security-model.md` for the framework's full threat model,
including credential handling, destructive-operation safety gates, AI
output validation, supply-chain considerations, and memory-poisoning
mitigations.
