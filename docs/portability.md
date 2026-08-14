# Portability

## Three independent dimensions

1. **Engineering methodology** (this framework) — agent- and
   environment-agnostic.
2. **Agent** (Claude, Codex, Gemini, OpenHands, Cursor, Windsurf,
   Copilot, Z.ai, OpenCode, …) — varies in tool-calling, context-window,
   native skills support, memory.
3. **Execution environment** (web chat, local terminal, IDE, cloud agent,
   CI, self-hosted) — varies in filesystem access, sandboxing, network.

AIECP must produce the **same project intelligence** across all three.

## Portability matrix (initial, to be re-verified live)

| Agent        | Native entrypoint                 | Skills native?      | Adapter complexity |
|--------------|------------------------------------|:---:|---|
| Claude Code  | `CLAUDE.md`                        | yes (Agent Skills)  | low    |
| Codex        | `AGENTS.md`                        | partial             | low    |
| Gemini       | `GEMINI.md` + context files        | no                  | medium |
| OpenHands    | `config.toml` + system prompt      | no                  | medium |
| Cursor       | `.cursor/rules/*.mdc`              | partial             | medium |
| Windsurf     | `.windsurfrules`                   | no                  | medium |
| Copilot      | `.github/copilot-instructions.md`  | no                  | low    |
| Z.ai         | system prompt + files              | no                  | medium |
| OpenCode     | `AGENTS.md` + skills               | yes                 | low    |

## Adapter contract

Each agent adapter must implement:

- `render_entrypoint(canonical) -> fileset` — produce native files from
  canonical sources.
- `render_skill(skill) -> optional_fileset` — for agents with native
  skill support; otherwise merge into the entrypoint.
- `translate_action(action) -> agent_native_call` — map canonical actions
  to agent-native tool calls.
- `translate_observation(raw) -> evidence.Event` — normalize agent-native
  observations into Evidence Model events.
- `capabilities()` — declare which capabilities the agent supports (file
  read/write, shell, browser, MCP, etc.). Workflow SMs degrade
  gracefully when capabilities are missing.

## Environment separation

The framework never assumes a specific environment. It declares
*requirements* (e.g. "needs filesystem write", "needs reproducible test
execution") and the adapter/runtime satisfies them or refuses the
workflow.

## Failure modes

- **Drift:** an agent vendor changes its entrypoint format →
  `sync-entrypoints` must be re-run; a CI check verifies entrypoints
  match canonical sources.
- **Capability mismatch:** the agent can't run a step → the workflow SM
  transitions to `blocked:missing-capability` and surfaces a precise
  gap, not a vague failure.
- **Context-window exhaustion:** progressive disclosure is mandatory;
  skills must declare a token budget and refuse to load if exceeded.
