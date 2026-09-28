---
title: System prompts
slug: system-prompts
module: foundations
order: 7
status: live
level: intermediate
summary: What is actually in the context before your first token — measured from published prompts across two vendors — and why the leaked ones are mostly scaffolding you never inherit.
---

# System prompts

> **The one sentence:** the "system prompt" you read about in a leak and the
> system prompt you get from an API differ by more than two orders of magnitude,
> because almost all of the former is product scaffolding and tool definitions
> that a raw API call does not include.

[Prompt engineering](prompt-engineering.html) covers the techniques that survive
measurement. This page is about the artifact itself: what goes in it, in what
order, how long it should be, and how to read the published and extracted ones
without drawing the wrong conclusion.

Every figure below is a **file size in bytes** from a public corpus, chosen
because it is the one property of these documents that is objectively checkable
and reproducible. Divide by roughly 4 for a token estimate.

---

## 1 · Diagram

```
  WHAT THE MODEL SEES BEFORE YOUR FIRST TOKEN

  ┌──────────────────────────────────────────────────────────┐
  │  1. identity / role        "you are ..."                 │  small
  │  2. behavioural rules      tone, refusals, formatting    │  small
  │  3. product context        date, user tier, surface      │  small
  │  4. TOOL DEFINITIONS       one schema per tool  ────────►│  LARGE
  │  5. injected context       retrieved docs, memory        │  varies
  └──────────────────────────────────────────────────────────┘
                              │
                              ▼
                    then, finally, your message


  THE SAME MODEL, THREE WAYS  (bytes)

    published prompt        18,813   ← behaviour only
    extracted, no tools     49,660   ← + product scaffolding
    extracted, with tools  179,561   ← + tool schemas

              tools are 72% of what the model actually reads
```

---

## 2 · Design — "system prompt" means two different things

This is the distinction that makes everything else make sense, and almost every
online discussion of leaked prompts misses it.

| | **Published prompt** | **Extracted prompt** |
|---|---|---|
| Contains | Behavioural instructions | Instructions + tool schemas + product context |
| Source | The vendor, dated and versioned | Reconstructed by a user, undated |
| Verifiable | Yes | No |
| Claude Opus 4.6 | **18,813 B** | **179,561 B** |

**They differ by 9.5×, and both are honestly labelled.** The vendor publishes
the part that describes *behaviour*. The extracted file also captures the tool
definitions and product wiring that the deployed surface adds. Neither is lying;
they are measuring different objects.

So when someone says "Claude's system prompt is 180 KB", the accurate statement
is: *the Claude.ai product sends roughly 180 KB, of which under 11% is the
behavioural prompt Anthropic publishes.*

### The part nobody budgets for: tool definitions

The corpus contains the controlled comparison — the same model with and without
tools:

| Model | No tools | With tools | Tools' share |
|---|---|---|---|
| Claude Opus 4.6 | 49,660 B | 179,561 B | **72%** |
| Claude Sonnet 4.6 | 47,414 B | 174,341 B | **73%** |

Two independent models, the same answer. **Roughly three quarters of a deployed
system prompt is tool schemas**, which is the measured version of the claim in
[harness & loops](harness-and-loops.html) that a tool definition *is* a prompt.
Every tool you add is permanent context, paid on every request, before the user
says anything.

---

## 3 · The number that should change how you read leaks

API prompts and consumer-product prompts are not the same order of magnitude:

| Surface | Bytes | ≈ tokens |
|---|---|---|
| `gpt-5.5-pro-api` | 835 | ~210 |
| `gpt-5.5-api` | 862 | ~215 |
| `gpt-5.3-codex-api` | **194** | ~50 |
| `gpt-5.3-chat-api` | 2,200 | ~550 |
| `gpt-5.5-instant` (product) | 85,051 | ~21,000 |
| `gpt-5.5-thinking` (product) | 116,100 | ~29,000 |
| `gpt-5.6-sol` (product) | 127,131 | ~32,000 |

<div class="callout warn">

**The API gives you a nearly empty system prompt.** `gpt-5.5-api` at 862 bytes
against `gpt-5.5-thinking` at 116,100 is a **135× difference**, and the pattern
holds across every API/product pair in the corpus. Everything you have read
about a leaked ChatGPT or Claude.ai prompt — the personality rules, the
formatting conventions, the tool suite, the safety scaffolding — is **product
engineering you do not inherit when you call the API.**

That cuts both ways. You do not get their guardrails for free, and you are not
fighting their instructions either. The behaviour you get from a raw API call is
much closer to the model itself, which is why the same model can feel different
through two surfaces.

</div>

The surface variation *within* one vendor is nearly as wide: `claude-voice-mode`
is **1,085 B** while `claude-in-chrome` is **74,050 B** — a 68× spread driven
almost entirely by how many tools the surface exposes.

---

## 4 · How long should yours be?

The published Claude prompts form a clean time series on a consistent basis:

| Date | Model | Bytes |
|---|---|---|
| 2024-07-12 | Claude Opus 3 | 2,154 |
| 2025-05-22 | Claude Opus 4 | 10,863 |
| 2026-02-05 | Claude Opus 4.6 | 18,813 |
| 2026-09-22 | Claude Opus 5.5 | 27,216 |

**About 12.6× in twenty-six months**, and the growth is not decoration — it is
mostly accumulated edge cases, each one a behaviour someone had to specify after
observing it go wrong.

Two things follow for your own prompt:

- **Starting long is the mistake.** Those documents grew in response to observed
  failures. A 3,000-token prompt written before you have seen your system fail is
  guessing at which edge cases matter, and paying for the guess on every request.
- **Every line should have a story.** If you cannot name the failure a sentence
  prevents, it is a candidate for deletion. That is the only reliable pressure
  against monotonic growth, because each individual addition always looks cheap.

The cost is real and compounding — see
[prompt engineering §6](prompt-engineering.html) on what a long prompt costs per
request, and [KV reuse](kv-reuse.html) on why a *stable* prefix is worth far
more than a short one. A 20,000-token system prompt that never changes is
cheaper than a 2,000-token one that varies per user, because the first is a
cache hit and the second is not.

### Ordering

Put the **invariant** parts first and the **variable** parts last. Prefix
caching matches on an exact prefix, so a date or a user name near the top
invalidates everything after it. Identity → rules → tools → product context →
retrieved content → user message, in that order, is both the conventional
structure and the cache-optimal one.

---

## 5 · Depth — reading an extracted prompt without being fooled

Extracted prompts are useful evidence and unreliable fact. The corpus makes both
halves visible.

**They are not reproducible.** No capture date, no model build, no method. The
repository's own README invites contributors to open a PR "if you got a
different result", which is a fair admission that two extractions of the same
model can disagree. Treat any single file as one observation, not a
specification.

**Implausible sizes are a signal.** One entry in the corpus,
`claude-projects-thread-claude.md`, is **533,064 bytes** — roughly 133,000
tokens, most of a context window, for something labelled a system prompt. The
likely explanation is that the capture includes conversation or project content
rather than only the prompt. When a figure fails a sanity check, the extraction
is the thing to doubt.

**Prefer the dated ones.** The corpus separates a versioned `official/` folder
from the extracted files, and where a vendor publishes its own prompts, those
are strictly better: dated, attributable, and stable enough to cite.

**What extracted prompts are genuinely good for** is the thing no published
prompt shows you: the *shape* of a deployed one. How tools are described, where
refusal language sits, how much space product context takes, what gets repeated.
Fifty of them side by side is real evidence about structure, and structure is
robust to any individual file being slightly wrong.

---

## 6 · From each seat

| Seat | What this means here |
|---|---|
| **User** | Never sees it, and it shapes everything — including why the same model feels different in two apps. |
| **Coder** | Your tool schemas are ~72% of the prompt. Writing a tool description badly is the same mistake as writing the prompt badly, and costs the same tokens. |
| **Tester** | The prompt is an input. Version it, diff it, and re-run your evals when it changes — a prompt edit is a deploy. |
| **System designer** | Order by volatility: invariant first, per-request last. That single decision determines whether prefix caching works at all. |
| **Architect** | Calling the API means building the scaffolding yourself. The 135× gap between an API prompt and a product prompt is the work the product team did that you now own. |
| **CEO** | It is paid on every request, forever. A 20k-token prompt at a million requests a day is a permanent line item, and the fix is deletion, not a discount. |
| **Market** | "Leaked system prompt" headlines almost always describe product scaffolding, not a model. The interesting comparison is between surfaces, not vendors. |

---

## 7 · Interview questions

**"How long should a system prompt be?"**
Shorter than you think, and it will grow anyway. Published Claude prompts went
from ~2 KB to ~27 KB in two years, and that growth came from specified edge
cases rather than design. Start with what you can justify, add only in response
to an observed failure, and keep the order stable so it caches. A long stable
prompt beats a short volatile one on cost.

**"Does the API give me the same system prompt as the chat product?"**
No, and the gap is enormous — around 862 bytes against 116,000 for one recent
OpenAI pair, roughly 135×. Consumer products ship extensive scaffolding: tools,
personality, formatting, safety layers. Through the API you inherit none of it,
which means neither their guardrails nor their constraints. That is the main
reason the same model behaves differently through two surfaces.

**"Where does most of a deployed system prompt go?"**
Tool definitions. The same Claude model measured with and without tools is
49,660 versus 179,561 bytes — tools are about 72% of it, and the figure
reproduces on a second model. Adding a tool is a permanent context cost, paid
before the user has said anything.

**"How would you order a system prompt?"**
By volatility, invariant first. Identity, rules and tool schemas do not change;
the date, the user and retrieved documents do. Prefix caching matches on an
exact prefix, so one variable token near the top invalidates the cache for
everything below it — which turns an ordering preference into a measurable bill.

---

## Stop condition

You are done with this page when you can:

- State the difference between a published and an extracted system prompt, and why they differ by ~10×
- Say what fraction of a deployed prompt is tool definitions, and why that matters for adding tools
- Explain why an API call and a chat product behave differently with the same model
- Order a system prompt by volatility, and say what that buys
- Read a leaked prompt as evidence of structure rather than as a specification

---

## Sources worth reading

- **Anthropic's published system prompts** — dated and versioned in the release notes. Where a vendor publishes its own, that is the citable source.
- **[asgeirtj/system_prompts_leaks](https://github.com/asgeirtj/system_prompts_leaks)** — the corpus every measurement on this page comes from. CC0. Useful as evidence of *shape* across ~50 systems; its extracted entries are undated reconstructions and should be read as observations, not specifications. Note that it separates a versioned `official/` folder, which is the half to trust.
- **[Prompt engineering](prompt-engineering.html)** for the techniques that go inside the document, and **[KV reuse](kv-reuse.html)** for why a stable prefix is worth more than a short one.

Related: [Harness & loops](harness-and-loops.html) — the system prompt is one
component of a harness, and tool schemas are another ·
[Guardrails & security](guardrails-and-security.html) for why instructions in a
prompt are not a security boundary · [Caching](caching.html) for what a stable
prefix is worth in money.
