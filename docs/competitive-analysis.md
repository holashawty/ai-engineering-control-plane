# Competitive Analysis

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
| Agent interoperability          | 0 | 0 | 0 | 0 | 2 | 1 | **3** |
| Local execution                 | 2 | 2 | 2 | 3 | 2 | 2 | **3** |
| Cloud execution                 | 0 | 0 | 0 | 3 | 0 | 0 | **2** |
| Web-chat compatibility          | 1 | 1 | 1 | 1 | 2 | 2 | **3** |
| Security / safety gates         | 1 | 1 | 0 | 2 | 0 | 0 | **3** |
| Portability (multi-agent)       | 0 | 1 | 0 | 0 | 2 | 1 | **3** |
| Token efficiency                | 3 | 2 | 1 | 1 | 3 | 2 | **3** |
| Failure-mode modeling           | 1 | 0 | 0 | 1 | 0 | 0 | **3** |
| Evaluation harness              | 0 | 0 | 0 | 3 | 0 | 0 | **3** |

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
