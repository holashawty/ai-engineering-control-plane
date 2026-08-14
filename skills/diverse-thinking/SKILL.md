---
name: diverse-thinking
description: Use when an agent has tested 3+ root-cause candidates in systematic-debugging's diagnose state and all have been rejected, OR when an agent has spent >10 minutes on a problem without making verifiable progress, OR when an agent notices it is repeating the same style of analysis (Pattern → Hypothesis → Test) without success. Switches the agent to a different thinking style (analogical, inverse, first-principles, systems, lateral, adversarial, constraint-relaxation) to break out of cognitive loops. Not a debugging skill per se — a meta-skill that changes *how* the agent thinks, not *what* it analyzes.
license: MIT
allowed-tools: [filesystem_read, shell_exec]
---

# Diverse Thinking

## When to use this skill

Use when an agent is stuck — specifically when one of these signals
fires:

1. **Three-failure rule** (per `systematic-debugging`): three root-
   cause candidates have been tested and rejected in `diagnose`. The
   skill's three-failure rule escalates to "architectural
   conversation." This skill provides the *intermediate* step between
   "try a fourth hypothesis of the same shape" and "give up and ask a
   human" — change the thinking style and try again.

2. **Cognitive loop detected:** you notice your last 3 thoughts were
   variations of the same shape ("maybe it's X", "maybe it's Y",
   "maybe it's Z" — all "maybe it's" hypotheses, all from the same
   angle). The loop is the signal, not the failure. Stop and switch
   styles.

3. **Time without progress:** you have spent more than 10 minutes
   (or equivalent token budget) on a problem without emitting any
   new `Event`, `Decision`, or `Trace` that advances the workflow.
   "Thinking harder" in the same style is not progress — it is the
   definition of stuck.

4. **Asymmetric confidence:** your hypothesis feels right but you
   cannot find evidence for it, OR you have evidence but cannot form
   a hypothesis that explains it. The asymmetry is the signal — the
   mind is in a frame that doesn't match the problem.

**Don't use as a substitute for evidence:** this skill does not
generate evidence. It changes the angle from which you look for
evidence. You still emit `Event`/`Trace`/`Decision` entities per
`evidence-engineering`; you still cite real evidence; you still
respect `Expected`/`Actual`/`Validation`. What changes is *which*
evidence you look for and *how* you frame the hypothesis.

## The seven thinking styles

Each style is a *deliberate* cognitive stance, not a personality.
Pick the one most different from what you have been doing. If you
have been doing forward causal analysis ("X caused Y because Z"),
pick inverse or lateral. If you have been doing bottom-up ("I see
this symptom, what caused it"), pick top-down or systems. The point
is to change frame, not to find the "right" style.

### 1. First-principles thinking

**Stance:** Strip away every assumption about how the system works.
Rebuild the mental model from the irreducible facts.

**Procedure:**
1. List every assumption you are making about the system (it is
   running, the network is up, the database is consistent, the user
   is who they say they are, the test reflects reality).
2. For each assumption, ask: how do I *know* this? What `Event` in
   my evidence confirms it?
3. For assumptions with no confirming `Event`: stop assuming them.
   Either confirm them (emit an `Event` proving the assumption) or
   drop them and re-derive what the system could be doing without
   them.
4. From the remaining confirmed facts, re-derive what could produce
   the observed symptom. The new hypothesis will be different from
   your prior ones because it is built on fewer assumptions.

**Use when:** you have been building hypotheses on top of each other
(hypothesis B assumes hypothesis A was right, even though A was
rejected). The stack of assumptions is hiding the real cause.

**Don't use when:** the system is genuinely complex and you don't
have time to rebuild the model — first-principles is expensive.

### 2. Inverse thinking (work backward from the symptom)

**Stance:** Instead of asking "what could cause this symptom?", ask
"if I wanted to *produce* this symptom on purpose, what would I
do?" Then check whether the system is doing that thing.

**Procedure:**
1. State the symptom as a desired outcome: "I want to make this
   endpoint return 500."
2. Brainstorm ways to produce it: "I would crash the DB connection,
   or I would pass a null where the handler expects a string, or I
   would exhaust the connection pool, or I would trigger an unhandled
   promise rejection."
3. For each "how I would produce it" path, check the system: is it
   doing this? Look for `Event`s that match.
4. The path that matches is a candidate — emit it as a `Decision`
   with `validated: false` and test it.

**Use when:** forward causal analysis keeps producing the same
candidates. Inverting the question forces you to consider paths you
wouldn't have generated forward.

**Don't use when:** the symptom is too vague to invert ("it's slow
sometimes" doesn't invert well; "endpoint returns 500" does).

### 3. Analogical thinking (find a similar solved problem)

**Stance:** Some other system, in some other domain, has solved a
problem shaped like this one. Find it, understand its solution, and
map the solution back.

**Procedure:**
1. Abstract the problem: "I have a system that produces output X
   under condition Y but should produce Z." Strip the domain
   specifics.
2. Search your memory (or use web search if available) for systems
   that have solved a structurally similar problem: distributed
   systems consistency, user-input validation, race-condition
   avoidance, state-machine transition errors.
3. For each candidate analogy, ask: what was the root cause in
   that system? What was the fix?
4. Map the root cause back to your system: is there an analog of
   the same structural flaw? If yes, emit it as a candidate.

**Use when:** you are too close to the domain and can't see the
structure. A fresh analogy makes the structure visible.

**Don't use when:** the problem is genuinely novel — analogies can
mislead by suggesting solutions that don't fit.

### 4. Systems thinking (look for the loop, not the cause)

**Stance:** The bug isn't in any one component — it's in the feedback
loop between components. Stop looking for "the cause" and start
looking for "the loop."

**Procedure:**
1. Draw (mentally or on paper) every component involved in the
   symptom and every data flow between them.
2. For each flow, ask: is there feedback? Does the output of
   component B affect the input of component A?
3. Look for loops where the feedback is positive (amplifying) when
   it should be negative (damping), or vice versa.
4. Look for delays in the loop — does component B react to a state
   that component A has already moved past?
5. The bug is likely in the loop's timing or polarity, not in any
   single component.

**Use when:** the symptom is intermittent, load-dependent, or
"only happens in production." These are signatures of feedback-loop
bugs, not single-component bugs.

**Don't use when:** the symptom is deterministic and reproducible
with a single call — that's a single-component bug, not a system
bug.

### 5. Lateral thinking (change the problem)

**Stance:** The bug is well-defined because you defined it. Redefine
it. The redefinition may make the bug disappear or reveal it as a
symptom of a different bug.

**Procedure:**
1. State the problem as you currently understand it: "X is wrong
   because Y."
2. Challenge the framing: is X actually wrong? Maybe X is correct and
   Y is wrong. Maybe both are correct and the bug is in the
   assumption that they should be consistent.
3. Restate the problem from a different observer's view: the user's,
   the operator's, the dependency service's, the test's. Each view
   may make the "bug" disappear or reveal a different bug.
4. Pick the framing that produces the most actionable hypothesis.

**Use when:** you are confident in your analysis but can't find
evidence — the framing may be wrong, not the analysis.

**Don't use when:** the symptom is clearly defined and reproducible
— lateral thinking here is just denial.

### 6. Adversarial thinking (assume the system is hostile)

**Stance:** Stop assuming the system is cooperating. Assume
*something* in the system is actively trying to make this fail —
what would it do, and where would it hide?

**Procedure:**
1. List every component that touches the failing path.
2. For each, ask: "If this component were malicious, what would it
   do to produce the observed symptom *while looking innocent*?"
3. Look for components that *could* do this — they have the power
   (capability to affect the symptom) and the opportunity (the
   timing matches).
4. The component that has power + opportunity + a plausible motive
   (e.g., a recent change, a configuration drift, a resource
   exhaustion) is your candidate.

**Use when:** every "cooperative" hypothesis has been rejected. The
bug exists, so something is producing it; if no component is
innocently producing it, one is producing it in a way that hides
itself.

**Don't use when:** the system is simple enough that no component
*could* hide — adversarial thinking in a 2-component system is just
paranoia.

### 7. Constraint-relaxation thinking (which constraint is wrong?)

**Stance:** You are operating under constraints you didn't question.
One of them is wrong. Find it.

**Procedure:**
1. List every constraint you are respecting: "I can't modify X
   because it's a dependency," "I can't change the test because it's
   a contract," "I can't reproduce because I don't have production
   data," "I can't deploy because CI is broken."
2. For each, ask: is this constraint actually true, or am I assuming
   it?
3. For constraints that are actually assumptions: relax them. What
   would you do if you *could* modify the dependency? What would
   you do if you *could* reproduce with production data?
4. The relaxed-constraint solution often reveals the actual
   constraint that's blocking you, which is usually different from
   the constraint you were respecting.

**Use when:** you keep saying "I can't do X" and that's blocking
progress. The "can't" is often a habit, not a fact.

**Don't use when:** the constraints are real and respecting them is
correct — relaxing them produces unsafe solutions.

## Procedure (meta)

1. **Detect that you are stuck** (per "When to use this skill"
   above). The detection itself is the first step — without it, you
   will keep doing the same thing harder, which is the failure mode
   this skill exists to prevent.

2. **Identify the style you have been using.** Most debugging is
   forward causal (Pattern → Hypothesis → Test) — if that's what
   you've been doing, that's the style to leave.

3. **Pick the style most different from your current one.** If
   you've been doing forward causal, pick inverse or systems. If
   you've been doing bottom-up, pick top-down or lateral. The point
   is to change frame, not to find the "right" style.

4. **Apply the style for at least one full pass** — don't abandon
   it after one try. A new style takes time to produce results
   because it forces you to look at different evidence.

5. **Emit a `Decision` recording the style switch.** Per ADR-0008,
   this is a proposal (`validated: false`) — the style switch is
   not itself a fix, just a change of approach. The `Decision.what`
   should be `diverse-thinking:switched_to_<style>` and the `why`
   should cite the signal that triggered the switch (which
   hypothesis was rejected, how long was spent, etc.).

6. **If the new style produces a candidate:** emit it as a normal
   `Decision` with `validated: false` and test it via
   `systematic-debugging`'s Phase 3 procedure. The thinking style
   produced the candidate; the debugging discipline tests it.

7. **If the new style produces no candidate after a full pass:**
   pick a different style and try again. **After three styles have
   been tried and produced no candidate**, escalate to architectural
   conversation (per `systematic-debugging`'s three-failure rule) —
   the problem may genuinely require human input or a redesign.

## Tool integration

- `filesystem_read`: read the existing `Trace`/`Event`/`Decision`
  entities from the current run to identify which style you've been
  using (the `Decision.what` strings reveal the pattern).
- `shell_exec`: run any probe the new thinking style suggests
  (e.g., adversarial thinking may suggest "what if I deliberately
  trigger the failure condition to see what happens?").

## Validation

This skill is considered successful for a given run only if:

- A `Decision` was emitted recording the style switch, with the
  signal that triggered it.
- At least one new candidate `Decision` was emitted after the
  switch (even if it was later rejected).
- If three styles were tried and all failed to produce a candidate,
  an escalation `Decision` was emitted requesting human input or
  redesign — *not* a fourth silent retry.

## Why this skill exists

LLMs have thinking styles the way humans do — patterns of analysis
that feel productive and become defaults. The default style for
debugging is forward causal (look at the symptom, hypothesize a
cause, test it). This works for most bugs. It fails for the bugs
this framework exists to handle: the architectural ones, the timing
ones, the ones where the symptom is real but every "obvious" cause
is wrong.

When a human debugs such a bug, they instinctively switch styles —
they go for a walk (lateral), they explain it to a rubber duck
(first-principles), they ask "what if I wanted this to happen?"
(inverse). LLMs don't instinctively switch styles; they iterate the
same style harder, which produces diminishing returns and
eventually hallucination.

**This skill makes the style switch explicit and procedural.** It
does not guarantee a solution — some bugs genuinely require human
input. What it guarantees is that the agent does not get stuck in a
cognitive loop producing the same kind of hypothesis over and over.
After this skill runs, either a new candidate has been generated, or
the agent has honestly escalated. Both outcomes are correct; the
only incorrect outcome is silent loop.

## Examples

**Three-failure → inverse:** "session token occasionally issued for
the wrong user" → 3 forward-causal candidates (session store key
collision, cookie race, load-balancer affinity) all rejected →
this skill fires → inverse thinking: "if I wanted to produce this
symptom on purpose, I would share session state between two users
who happened to be assigned the same session ID by a hash collision"
→ check: is the session ID generated by hashing something that
could collide? → yes, hash of (user_id + timestamp), and two users
with adjacent IDs at the same millisecond produce the same hash →
new candidate, tested, confirmed. The forward-causal style never
would have generated this candidate because it kept looking for
"what's wrong with the session store" rather than "what would make
the wrong session."

**Loop detected → systems:** "endpoint sometimes returns 200,
sometimes 500, no apparent trigger" → after 3 forward-causal
attempts ("maybe DB is down? maybe memory? maybe timeout?") → loop
detected → systems thinking → draw the components: client →
load-balancer → 3 app servers → DB → cache → look for loops → find
that the cache invalidation is fire-and-forget, and under load the
invalidation queue backs up, so app server A reads stale cache
while app server B has already invalidated → candidate: cache
invalidation is a feedback loop with a delay under load → tested,
confirmed. Forward-causal couldn't find this because no single
component is wrong — the bug is in the timing of the loop.

**Asymmetric confidence → first-principles:** "tests pass in CI but
fail locally, and I'm sure the code is right" → high confidence in
code, no evidence for why CI differs → first-principles: list
assumptions (same Node version, same OS, same env vars, same
timezone) → check each → discover CI runs in UTC, local runs in
Europe/Berlin, and a date-comparison test depends on timezone →
candidate confirmed. Forward-causal never asked "what do I *know*
about the difference between CI and local?" — it assumed the
difference was in the code.
