# Competitive Analysis

> **Verification status (2026-08-11):** The narrative facts underlying
> this matrix were spot-checked in `docs/research.md` (licenses,
> architecture claims, persona names, CLI language). The 0–3 scores
> below were **not** independently re-derived from live repo behavior —
> they were carried over from the original training-knowledge pass.
> Two corrections are noted below where verification surfaced a
> concrete reason to revise a score; everything else should be treated
> as directional until spot-checked against current repo behavior,
> per `docs/research.md`'s verification summary.

## Matrix (0 = absent, 1 = weak, 2 = adequate, 3 = strong)

| Capability                      | superpowers | spec-kit | BMAD | OpenHands | anthropics/skills | vercel/skills | **AIECP (target)** |
|---------------------------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Architecture model              | 0 | 1 | 2 | 2 | 0 | 0 | **3** |
| Constitution / rules            | 0 | 2 | 1 | 0 | 0 | 0 | **3** |
| Skills (progressive disclosure) | 3 | 0 | 1 | 0 | 3 | 2 | **3** |
| Workflow orchestration          | 1 | 2 | 2 | 1 | 0 | 0 | **3** |
| Context engineering             | 1 | 1 | 2 | 1 | 0 | 0 | **3** |
| Project onboarding              | 0 | 0 | 1 | 0 | 0 | 0 | **3** |
| Requirements / specification    | 1 | 3 | 2 | 0 | 0 | 0 | **3** |
| Planning                        | 2 | 3 | 2 | 0 | 0 | 1 | **3** |
| Implementation discipline       | 1 | 2 | 1 | 2 | 0 | 1 | **3** |
| Testing integration             | 1 | 1 | 1 | 2 | 0 | 1 | **3** |
| Systematic debugging            | 3 | 0 | 0 | 1 | 0 | 0 | **3** |
| Behavioral verification         | 0 | 0 | 0 | 0 | 0 | 0 | **3** |
| Memory (typed)                  | 0 | 0 | 1 | 1 | 0 | 0 | **3** |
| Self-correction                 | 1 | 0 | 0 | 1 | 0 | 0 | **3** |
| Repository adaptation           | 1 | 0 | 0 | 0 | 0 | 1 | **3** |
| Tool usage standardization      | 1 | 1 | 1 | 3 | 0 | 1 | **3** |
| Agent interoperability †        | 2 | 2 | 0 | 1 | 2 | 1 | **3** |
| Local execution                 | 2 | 2 | 2 | 3 | 2 | 2 | **3** |
| Cloud execution                 | 0 | 0 | 0 | 3 | 0 | 0 | **2** |
| Web-chat compatibility          | 1 | 1 | 1 | 1 | 2 | 2 | **3** |
| Security / safety gates         | 1 | 1 | 0 | 2 | 0 | 0 | **3** |
| Portability (multi-agent)       | 0 | 1 | 0 | 0 | 2 | 1 | **3** |
| Token efficiency                | 3 | 2 | 1 | 1 | 3 | 2 | **3** |
| Failure-mode modeling           | 1 | 0 | 0 | 1 | 0 | 0 | **3** |
| Evaluation harness              | 0 | 0 | 0 | 3 | 0 | 0 | **3** |

† **Corrected 2026-08-11.** Original scores were `superpowers=0`,
`spec-kit=0`, `OpenHands=0`. Live verification found: superpowers now
runs natively across ~10 coding agents (Claude Code, Codex, Cursor,
Factory Droid, Gemini CLI, GitHub Copilot CLI, Kimi Code, OpenCode, Pi,
and more) — raised to 2. spec-kit documents 30+ supported AI coding
agent integrations — raised to 2. OpenHands added Agent-Client Protocol
(ACP) support, letting it delegate to Claude Code/Codex/Gemini instead
of only running its own agent — raised to 1 (still narrower than the
other two; ACP support is newer and less central to its identity than
its own agent runtime). No other rows in this table have been
independently re-verified against live repo behavior yet.

## Where each system wins (and we should not compete)

- **spec-kit** owns the spec→plan→tasks flow. We *adopt* it; we don't
  reinvent it.
- **anthropics/skills** owns the skill format. We *adopt* it.
- **OpenHands** owns the runtime. We *integrate* with it via an adapter;
  we don't ship a competing runtime.
- **superpowers** owns the debugging-skill quality bar. We use it as a
  reference.
- **BMAD** owns persona separation. We borrow the *ownership* concept and
  drop the personas.

## Where AIECP differentiates

1. **Evidence Model** — none of the above have it.
2. **Decision Trace** — none have it as a first-class artifact.
3. **Behavioral Verification layer** — universally absent.
4. **Typed Memory taxonomy with validation** — universally weak.
5. **Detector-driven Project Discovery across 11+ stacks** — universally
   shallow.
6. **Constitutional, version-controlled self-improvement** — universally
   absent or unsafe.
7. **AI-output validation pattern as a framework primitive** —
   universally absent.
