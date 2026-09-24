---
title: Harness & loop engineering
slug: harness-and-loops
module: agents
order: 43
status: live
level: advanced
summary: The model is the part you cannot change. The harness and the loop are the parts you can — and swapping the harness moves agentic scores as much as swapping the model does.
---

# Harness & loop engineering

> **The one sentence:** an agent is a model inside a harness running a loop, and
> on every published benchmark the harness and the loop move the score as much
> as the model does — so they deserve the same engineering attention, and almost
> never get it.

[Agents](agents.html) covers what an agent is and when to build one. This page
is about the software *around* the model: the tools it is given, the context it
is handed, the loop that drives it, and the guards that stop it. Anthropic names
this layer directly — Claude Code is described as "the agentic harness around
Claude: it provides the tools, context management, and execution environment
that turn a language model into a capable coding agent."

The reason it earns its own page: **this is the part you control.** You cannot
retrain the model. You can rewrite every other component, and the measured
effect of doing so is large.

---

## 1 · Diagram

```
  THE HARNESS IS EVERYTHING EXCEPT THE MODEL

  ┌──────────────────────────────────────────────────────────────┐
  │  HARNESS                                                     │
  │                                                              │
  │   system prompt ──┐                                          │
  │   tool schemas ───┤                                          │
  │   history ────────┼──► ┌───────────┐                         │
  │   tool results ───┘    │   MODEL   │  ◄── the part you       │
  │                        └─────┬─────┘      cannot change      │
  │                              │                               │
  │                       tool calls                             │
  │                              ▼                               │
  │   permissions ──► sandbox ──► execute ──► format result ──┐  │
  │                                                           │  │
  │   ┌───────────────────────────────────────────────────────┘  │
  │   │                                                          │
  │   └──► GUARDS: done? max steps? budget? no progress? ─────┐  │
  │                                                           │  │
  │        checkpoint · compact · log ◄───────────────────────┘  │
  └──────────────────────────────────────────────────────────────┘


  THE LOOP, AND THE ONLY FOUR WAYS IT ENDS

     model emits tool calls ──► execute ──► feed results back ──┐
              ▲                                                 │
              └─────────────────────────────────────────────────┘

     1. the model emits NO tool calls          ← the only clean exit
     2. a step/turn cap fires                  ← blunt, tells you nothing
     3. a budget cap fires                     ← the expensive one
     4. an error the loop cannot recover from

  Anthropic's Agent SDK types this honestly: a run ends as `success`,
  `error_max_turns`, `error_max_budget_usd`, `error_during_execution`,
  or `error_max_structured_output_retries`.
  Success is ONE OF FIVE outcomes, not the default.
```

---

```sim
harnessrun
```

---

## 2 · Design — the harness

### What is actually in one

The best empirical answer comes from reading source code rather than docs.
*Inside the Scaffold* (arXiv:2604.03515) surveys **13 open-source coding agents**
across three layers — control architecture, tool/environment interface, resource
management — and twelve dimensions. Two findings are worth carrying:

- **Tool counts range from 0 to 37.** Two systems solving the same class of task
  can differ by 37 tools.
- **11 of 13 compose multiple loop primitives** rather than using one control
  structure. The five observed: ReAct, generate-test-repair, plan-execute,
  multi-attempt retry, tree search.

So "the agent loop" is not one thing, and a harness is an enumerable list of
parts — each of which you can ablate and measure.

### The leverage is in the tools, and mostly in their descriptions

A tool definition is a prompt. The schema, the description, the parameter names
and above all the **error messages** are the model's entire view of your system.
An error that says `TypeError: NoneType` teaches nothing; one that says
`file not found — did you mean src/main.py?` changes the next action.

On tool count, the widely-repeated "accuracy collapses past 10–20 tools" has
numbers attached to it that are not traceable to any study. The underlying
effect is real and measured, just differently: **RAG-MCP** (arXiv:2505.03275)
varied the candidate pool from 1 to 100 with distractors drawn from a
4,400-server registry and found **>90% selection success at pools of 30 or
fewer**, degrading beyond. The problem is distractor load, not a magic ceiling.

### Permissions, sandboxing and checkpoints are harness components too

Permission modes are a graded control surface, not a boolean — Claude Code ships
six (`default`, `acceptEdits`, `plan`, `dontAsk`, `auto`, `bypassPermissions`),
scoped per command (`"Bash(npm *)"`). A denial is fed back **as a tool result**,
so the model treats it as information and tries another route.

Checkpointing has a boundary worth naming: file snapshots before edits, and a
plaintext JSONL transcript of every message and tool result. But checkpoints
"only cover file changes" — actions against databases, APIs and deployments
cannot be undone. **Undo covers the filesystem, not the world**, which is
precisely why permissions exist as a separate component.

### How much does the harness actually move the number?

This is where the field is loudest and least careful, so here are the numbers
that survive checking.

<div class="callout warn">

**Three widely-quoted harness results do not mean what they are used to mean.**

- **SWE-agent's "3.8% → 12.5%"** is not a same-model ablation. The 3.8% is
  Claude 3 Opus with BM25 retrieval — the paper's cited previous best. Held at
  GPT-4 Turbo, the honest swing is **1.31% → 12.47%**, which is still a large
  harness effect, just a different comparison.
- **A "63.6-point spread" from one harness study** is an integration failure at
  the low end, not a harness-quality result.
- **A "7.8× harness-to-model variance ratio"** circulates as a measurement. It
  is not one; do not quote it.

</div>

The defensible figure: on **Terminal-Bench 2.1** (89 tasks, repeated trials,
published confidence intervals), the same model under different scaffolds spans
roughly **3–23 percentage points**:

| Model | Native harness | Standardised Terminus 2 | Gap |
|---|---|---|---|
| Gemini 3 Flash | 56.9% (Gemini CLI) | 54.2% | 2.7pp |
| Claude Opus 4.6 | 70.1% (Claude Code) | 63.8% | 6.3pp |
| GPT-5.3-Codex | 79.1% (Codex CLI) | 68.5% | 10.6pp |

That range is **comparable to or larger than the gap between adjacent frontier
models** — which is the real claim, and it is strong enough without inflation.
Note also the direction: it depends on model–harness *fit*, not on abstract
harness quality.

---

## 3 · Design — the loop

### The plain while-loop is the recommendation, not the shortcut

Anthropic defines agents as "LLMs using tools based on environmental feedback in
a loop" and says directly that "it's also common to include stopping conditions
(such as a maximum number of iterations) to maintain control." The load-bearing
requirement is that the agent **gain ground truth from the environment at every
step** — which is why a loop without real tool results is just a long prompt.

Four loop shapes, distinguished by *who owns the stop condition*:

| Shape | Triggered by | Stops when | Who decides "done" |
|---|---|---|---|
| **Turn-based** | a prompt | the model judges it finished | **the model** |
| **Goal-based** | a prompt + explicit criteria | criteria met, or cap | **a deterministic check** |
| **Time-based** | an interval | you stop it | you |
| **Proactive** | an event | criteria met | a deterministic check |

The distinction that matters is the last column. Anthropic's stated principle
for goal-based loops is that with explicit criteria "Claude doesn't have to make
a determination on what is 'good enough'" — e.g. *get the Lighthouse score to 90
or above, stop after 5 tries*. **Every stop condition you can make deterministic
is one the model cannot get wrong.**

### The framework defaults are not what you think

Three of four commonly-cited values are wrong. These were read from shipped
packages, not documentation:

| Framework | Commonly cited | Actually |
|---|---|---|
| **LangGraph** `recursion_limit` | 25 | **25 → 10,000 (v1.1.0) → 10,007 (v1.2.0+)** |
| **CrewAI** `max_iter` | 20 | **25** (and `LiteAgent.max_iterations` is 15) |
| **OpenAI Agents SDK** `DEFAULT_MAX_TURNS` | 10 | 10 ✓ (guard is strict `>`, so 10 errors on turn 11) |

<div class="callout bad">

**LangGraph's recursion limit is effectively gone and almost nobody has
noticed.** Every blog post and the docs still say 25; the shipped default is
10,007. A maintainer issue confirms the number was never intended as a safety
bound — only a placeholder for a sentinel — and notes a config-merge bug that
can silently reset it to 25. So the value is simultaneously effectively infinite
and unreliable. **Set it yourself.**

</div>

Frameworks also disagree on what *happens* at exhaustion — raise, hand off to an
error handler, or spend one more model call to force a final answer. Three
shipped behaviours, three different contracts. Know which one you have, because
it decides whether exhaustion is an exception or a plausible-looking answer.

### The failure modes, measured

**MAST** (arXiv:2503.13657) annotated 1,600+ traces across 7 frameworks with
inter-annotator κ=0.88. Loop control accounts for roughly **a third of all
observed failures**:

- Step repetition — **15.7%**
- Unaware of termination conditions — **12.4%**
- Premature termination — **6.2%**

And unbounded loops are a real defect class in shipped code. *When Agents Do Not
Stop* (arXiv:2607.01641) scanned **6,549 agent repositories** and confirmed 68
infinite-loop failures. The two leading causes are the uncomfortable ones:

- **retry-feedback-without-bound — 25.0%**
- **tool-call-iteration-without-bound — 23.5%**

**Error recovery is the leading cause of infinite loops.** The code you wrote to
handle failure is the code that fails to stop. Impact was overwhelmingly
economic: 95.6% cost exhaustion, 95.6% model denial-of-service.

### The guard worth building

Caps stop on *exhaustion*. Only one common guard stops for a *reason*:
**no-progress detection**. Track whether the task state actually advanced; if it
has not in *N* steps, stop. The lab below makes the difference concrete — on an
unsolvable task the budget guard spends the entire allowance to reach 32%, while
a no-progress window of 3 stops at 6 steps for a third of the tokens.

Watch for **oscillation** specifically: A→B→A→B defeats any guard that only
compares against the immediately previous action.

---

## 4 · Experiment

Run a loop and watch a guard decide the bill. Set the task to *impossible* with
the no-progress window at 0, then move the window to 3 — same agent, same task,
and the cost falls by roughly three times because the loop noticed it was not
getting anywhere.

```lab
agentloop
```

---

## 5 · Depth — context is the other half

### Everything accumulates

The window "does not reset between turns within a session. Everything
accumulates" — system prompt, tool schemas, history, tool inputs **and tool
outputs**. Tool results are usually the largest consumer: one 50k-token API
response can dominate a whole trajectory.

### Models degrade long before the limit

This is measured, not folklore. **Chroma's context-rot study** tested 18
frontier models across 8 input lengths and found degradation at *every*
increment — including on trivial retrieval and text-replication tasks.
**LOCA-bench** (arXiv:2602.07962) isolates it cleanly by varying only how much
environment description the same task requires:

| Model | 8K | 32K | 96K | 256K |
|---|---|---|---|---|
| Claude-4.5-Opus | 96.0 | 84.0 | 45.3 | **14.7** |
| GPT-5.2-Medium | 72.0 | 60.0 | 44.0 | **21.3** |
| Gemini-3-Flash *(1,050K window)* | 64.0 | 40.0 | 32.0 | **17.3** |

Note the third row: a model with a **million-token window** loses three quarters
of its accuracy by 256K. **Window size is not working memory.**

<div class="callout note">

**The counterintuitive one.** Chroma found models perform *worse* when
surrounding context has coherent logical flow, and that randomly shuffling
sentences **consistently improves performance** — across all 18 models and every
configuration. Coherent filler distracts more than incoherent filler. This
quietly undermines the instinct to hand agents tidy narrative context, and
nobody appears to have followed up on why.

</div>

### Compaction has the weakest evidence of anything here

Compaction — summarise the history, continue — is the flagship technique, now
shipped as a server-side API feature. It is also the least supported:

- **Plain FIFO truncation matched or beat summary-based compaction** on
  AppWorld's 147 stateful tasks (arXiv:2608.06503).
- **LOCA-bench measured compaction *reducing* accuracy** for GPT-5.2-Medium at
  128K: 38.7 → 36.0.
- Anthropic's own cookbook measured what it costs: over 8 documents (~329K
  tokens), after compaction **3/3 high-level facts survived and 0/3 obscure
  specifics did**.

Worse than the average loss is the *variance*: compaction turns reliably-solved
tasks into intermittently-solved ones. Pass@2 (solved at least once in two runs)
holds up while **Pass² (solved in both runs) collapses** — which is the
definition of flakiness.

Two practical consequences. Put durable rules in a file that is re-injected every
request rather than trusting them to survive a summary. And watch for
**compaction thrashing**: if one tool output is large enough to refill the window
immediately after each summary, auto-compaction gives up and errors.

### Tool optimizations — the half of the loop that is not the model

§5 established that tool results are usually the largest consumer of the
context window. They are also usually the largest consumer of *wall clock*: the
GPU sits idle while a tool call goes to a database, an API or a sandbox. Both
facts have the same shape — the expensive part of an agent loop is often not
inference — and there is a small, practical literature on each.

| Technique | What it overlaps or removes | Catch |
|---|---|---|
| **Multi-tool parallel execution** | Independent calls in one turn run concurrently instead of serially | Only sound when the calls do not depend on each other; the model must be able to *emit* several at once, which not every tool-calling format allows |
| **Tool execution pipelining** | Runs a tool while the next step's prefill proceeds | Needs the tool result not to change what gets prefilled — true for appends, false for anything that rewrites history |
| **Speculative tool execution** | Starts the likely call before the model finishes emitting it | Same bet as [speculative decoding](decoding.html), and the same failure mode: a wrong guess wastes the work. **Only safe for reads.** Speculatively executing a write is an unrecoverable side effect |
| **Disaggregated tool execution** | Moves tool work onto separate infrastructure from the GPU | The same phase-splitting argument as disaggregated prefill: do not hold an accelerator while waiting on a database |
| **Tool token reduction / concise tool output** | Shrinks the result before it enters context | The cheapest and most reliable of the five |

**Start with the last row.** The others are latency optimisations with real
correctness conditions attached; truncating, projecting or summarising a tool
result before it lands in the window costs nothing and attacks the constraint
that §5 showed actually degrades agents. A 50k-token API response that could
have been ten fields is both the context problem and the bill.

The ordering matters because of what the numbers say: a loop is bounded by
context degradation long before it is bounded by tool latency, so the technique
that shortens the transcript beats the technique that overlaps the wait.

### False success is the failure mode nobody instruments

*From Confident Closing to Silent Failure* (arXiv:2606.09863) measured this over
**9,876 τ²-bench and 1,879 AppWorld trajectories**: agents declaring success
without achieving it accounts for **45–48% of all failures** — and it is nearly
undetectable by the LLM-judge monitoring most teams deploy, because the agent's
own report is fluent and confident.

The defence is not a better judge. It is **checking the environment**: did the
file change, does the record exist, do the tests pass.

### Evaluate the outcome, not the path

Anthropic: "Don't grade the path the agent took, grade what it produced." A
suite requiring *tool A → B → C* fails an agent that found a better route.
LangChain says the same in nearly the same words.

**And yet the most widely shipped trajectory tooling defaults to exact-path
matching** — Google ADK's `tool_trajectory_avg_score` defaults to EXACT match at
threshold 1.0. Adopt the default and you ship a suite that punishes improvement.

Two more numbers for eval design:

- **Reliability compounds downward.** A 75%-per-trial agent is ~42% reliable
  over three trials (0.75³). τ-bench's pass^k makes this explicit: GPT-4o solves
  <50% at pass¹ and **<25% at pass⁸** on retail.
- **Every major agent benchmark audited was fully gameable.** Berkeley RDI's
  scanner scored **100% on Terminal-Bench, SWE-bench Verified and SWE-bench
  Pro without solving a single task** — via a `conftest.py` pytest hook, a
  binary wrapper trojan, a container parser overwrite. Treat leaderboard
  positions as claims about harnesses, not capabilities.

---

## 6 · Depth — when to add agents instead

The honest summary of a noisy debate.

**The pro case, precisely stated.** Anthropic reported a multi-agent research
system outperforming single-agent Opus 4 by **90.2%** — on an *internal* eval,
on a task shaped for parallel search. Real, but not a general result.

**The strongest counter-evidence.** Tran & Kiela (arXiv:2604.02460) ran the
controlled experiment across 3 model families, 2 benchmarks, 5 multi-agent
architectures and 6 token budgets: **under matched token budgets the multi-agent
advantage largely disappears** — single agents match or beat every architecture
tested.

**And the same paper contains the best argument *for* sub-agents.** Its proof
holds only under *perfect context utilisation*. Once context is degraded — which
§5 says it always is — multi-agent becomes competitive. **Context isolation is
the real case for sub-agents**, not parallelism.

**The critique everyone quotes has been superseded by its own author.**
Cognition's *Don't Build Multi-Agents* is widely cited as a flat prohibition.
Walden Yan published *Multi-Agents: What's Actually Working* in April 2026,
revising rather than retracting: **writes stay single-threaded, and additional
agents contribute intelligence rather than actions.** That single-writer
principle is the actual resolution — anyone quoting the 2025 essay as a
prohibition is quoting a superseded version of its author's position.

**The cost, correctly stated.** Anthropic's ladder: agents use ~**4× more tokens
than chat**, multi-agent ~**15× more than chat**. So multi-agent is about
**3.75× a single agent** — the 15× figure is against *chat* and is routinely
misquoted as being against single-agent. Per-subagent fixed context overhead
measures around **54,000 tokens** before any work happens. (A viral 436K figure
was retracted by its own author as a caching artifact.)

**And it can be strongly negative.** Kim et al. (arXiv:2512.08296) report
relative performance versus single-agent ranging from **+80.8% on decomposable
financial reasoning to −70.0% on sequential planning**, with diminishing returns
once a single agent already handles the task.

| Failure | Looks like | Actual cause |
|---|---|---|
| Loop never terminates | Bill spikes, no output | Retry-with-feedback has no bound — the top cause in 6,549 repos |
| Agent reports success, nothing happened | Fluent summary, unchanged system | False success: 45–48% of failures; check the environment, not the report |
| Works in demo, flaky in production | Passes once, fails on repeat | pass¹ is not reliability; measure pass^k |
| Great benchmark score, poor real use | Leaderboard says otherwise | Benchmarks are gameable and score the harness |
| Degrades on long tasks | Fine early, wrong later | Context rot — degradation starts far below the window limit |
| Compaction made it worse | Intermittent failures appear | Compaction trades average quality for variance; Pass² collapses |
| Multi-agent cost 4× for no gain | More agents, same results | Matched-budget advantage is near zero unless context isolation is the point |
| Eval punishes a better agent | Smarter route marked wrong | Exact-path trajectory matching — check your ADK defaults |

---

## 7 · From each seat

| Seat | What harness and loop engineering means here |
|---|---|
| **User** | Whether the thing finishes, and whether "done" means done. False success is invisible to them, which is why it is your problem. |
| **Coder** | Your error messages are prompts. Write them for the model: what failed, and what to try instead. Then set your own iteration cap — the framework default is either 10 or 10,007 and neither was chosen for you. |
| **Tester** | Grade the end state, never the path. Measure pass^k, not pass@1. And verify against the environment, because 45–48% of failures are the agent confidently telling you it worked. |
| **System designer** | Budget caps stop on exhaustion; no-progress guards stop for a reason. Build the second. Tool results are the largest context consumer — decide what happens to a 50k-token response before one arrives. |
| **Architect** | Harness choice moves benchmark scores as much as model choice. It is a first-class design decision, and unlike the model it is entirely yours. Prefer one good loop; add sub-agents for context isolation, not for parallelism. |
| **CEO** | The cheapest reliability work is not a better model — it is bounded loops and outcome verification. An unbounded retry is a bill with no ceiling, and it is the single most common agent defect in open-source code. |
| **Market** | Agentic leaderboards measure the harness as much as the model, and every major one audited was scoreable at 100% without doing the task. Ask what scaffold produced the number. |

---

## 8 · Interview questions

**"Your agent's bill spiked 40× overnight with no code change. Where do you look?"**
An unbounded retry loop, almost certainly. It is the largest documented class of
infinite agentic loops — retry-with-feedback and tool-call iteration without a
bound account for roughly half of confirmed cases across 6,549 scanned
repositories, and the impact is overwhelmingly cost exhaustion rather than a
crash. Check whether your framework's iteration cap is what you think: LangGraph's
went from 25 to 10,007 while every blog post still says 25.

**"How do you know an agent actually completed the task?"**
Not from its own report — false success accounts for 45–48% of failures and is
nearly undetectable by LLM judges, because the summary is fluent and confident.
Verify against the environment: the file changed, the record exists, the tests
pass. Grade the end state, not the path, and never require a fixed tool sequence
or you fail agents that found a better route.

**"Would you grade the agent's trajectory?"**
Use it to diagnose, not to score. Both Anthropic and LangChain warn against
requiring tool A → B → C — yet Google ADK's trajectory scorer defaults to exact
match at threshold 1.0, so the default configuration punishes a smarter agent.
If you score trajectory at all, score properties like recovery-after-error, not
path equality.

**"A million-token context window means I don't need retrieval or compaction."**
No. Degradation starts far below the limit: on LOCA-bench a model with a
1,050K window falls from 64% to 17% accuracy between 8K and 256K of environment
description. And compaction is not the obvious fix — plain FIFO truncation
matched or beat summary compaction on AppWorld, and compaction's real cost is
variance: Pass@2 holds while Pass² collapses.

**"When is a multi-agent system worth it?"**
When you need context isolation, not when you want parallelism. Under matched
token budgets the multi-agent advantage largely disappears; the durable argument
is that each sub-agent gets a clean window, which matters exactly because context
degrades. The current best principle is Cognition's revised one: writes stay
single-threaded, extra agents contribute intelligence rather than actions. And
price it — multi-agent is ~3.75× a single agent, not the 15× that gets quoted
(15× is against chat).

**"Same model, different harness — how much does it matter?"**
Comparable to changing models. On Terminal-Bench 2.1 the same model under
different scaffolds spans roughly 3–23 percentage points. Be careful with the
famous numbers, though: SWE-agent's "3.8% → 12.5%" changes both model and
scaffold — held at GPT-4 Turbo the honest figure is 1.31% → 12.47%.

---

## Stop condition

You are done with this page when you can:

- List what a harness contains, and name which parts you would ablate first
- Explain why the plain while-loop is the recommendation rather than the shortcut
- Say which stop conditions fire on exhaustion and which fire for a reason
- Name the leading cause of infinite agent loops, and why it is ironic
- Explain why window size is not working memory, with a number
- State compaction's real cost — variance, not just average quality
- Say why an agent's own success report is not evidence
- Give the honest case for and against sub-agents, and price both

---

## Sources worth reading

- **Harness anatomy** — [*Inside the Scaffold: A Source-Code Taxonomy of Coding Agent Architectures*](https://arxiv.org/abs/2604.03515) (2026) — 13 agents read at source level; the best answer to "what is in a harness".
- **The loop** — [*Building Effective AI Agents*](https://www.anthropic.com/engineering/building-effective-agents) for the definition, and the [Agent SDK loop docs](https://code.claude.com/docs/en/agent-sdk/agent-loop) for the five typed termination outcomes.
- **Loop failures** — [MAST](https://arxiv.org/abs/2503.13657) for the 1,600-trace failure taxonomy, and [*When Agents Do Not Stop*](https://arxiv.org/abs/2607.01641) for infinite loops across 6,549 repositories.
- **False success** — [*From Confident Closing to Silent Failure*](https://arxiv.org/abs/2606.09863) — 45–48% of failures, measured over ~11,700 trajectories.
- **Context rot** — [Chroma's *Context Rot*](https://www.trychroma.com/research/context-rot) (18 models, including the shuffling result) and [LOCA-bench](https://arxiv.org/abs/2602.07962) for degradation by environment size.
- **Compaction** — [*Toward Reliable Context Compression for Long-Horizon Agents*](https://arxiv.org/abs/2608.06503) — the paper that finds FIFO truncation competitive with summarisation.
- **Multi-agent, both sides** — [Tran & Kiela](https://arxiv.org/abs/2604.02460) for the matched-budget result, Cognition's *Don't Build Multi-Agents* **and** its April 2026 revision, and [Kim et al.](https://arxiv.org/abs/2512.08296) for +80.8% to −70.0%.
- **Eval** — [τ-bench](https://arxiv.org/abs/2406.12045) for pass^k, and the Agentic Benchmark Checklist for how construction flaws move scores by up to 100% relative.

Related: [Agents](agents.html) for whether to build one ·
[Guardrails & security](guardrails-and-security.html) for the adversarial side of
the same loop · [Regression gates](regression-gates.html) for turning these evals
into merge decisions · [Reasoning inference optimization](reasoning-inference-optimization.html)
for the token budget the loop spends · [Orchestration frameworks](orchestration-frameworks.html)
for the libraries whose defaults this page keeps correcting.
