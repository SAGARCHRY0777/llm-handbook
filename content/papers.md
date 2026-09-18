---
title: Research papers
slug: papers
module: reference
order: 91
status: live
level: reference
summary: The papers worth reading, the papers worth naming, and an honest split between the two.
---

# Research papers

Most reading lists are undifferentiated: fifty papers, no guidance, so you read
none of them. This one is sorted by **what you should actually do with each
paper**, because that is the decision you are making.

| Marker | Means |
|---|---|
| 📖 **Read it** | Sit down with it. The paper itself teaches something a summary cannot |
| 📄 **Skim it** | Read the abstract, figures and conclusion. Twenty minutes |
| 🏷️ **Name it** | Know what it established and why. Reading it adds little |

A caution before the list: **papers report results under their own conditions.**
A method that beat baselines on MS MARCO in 2023 may do nothing for your corpus.
Read them for mechanisms and for the shape of the trade-off, not for numbers to
quote.

---

## If you only read ten

In this order. This is roughly two weekends and it covers the mechanisms
underneath everything else.

| # | Paper | Why this one |
|---|---|---|
| 1 | 📖 *Attention Is All You Need* (2017) | The architecture. Everything refers back to it |
| 2 | 📖 *The Illustrated Transformer* — Alammar (not a paper) | Read alongside #1; the figures do what the prose cannot |
| 3 | 📖 *Chain-of-Thought Prompting* (2022) | Where reasoning-in-context came from |
| 4 | 📖 *Lost in the Middle* (2023) | Why long context is not the answer you hoped |
| 5 | 📖 *ReAct* (2022) | The agent loop, stated plainly |
| 6 | 📖 *Judging LLM-as-a-Judge* (2023) | Judge biases, and the validation step everyone skips |
| 7 | 📖 *LoRA* (2021) | How adaptation became cheap |
| 8 | 📖 *LLM.int8()* (2022) | Emergent outliers — why big models quantize badly |
| 9 | 📖 *PagedAttention / vLLM* (2023) | Why modern serving looks the way it does |
| 10 | 📖 *Precise Zero-Shot Dense Retrieval* — HyDE (2022) | Short, surprising, changes how you think about retrieval |

---

```sim
papertime
```

---

## Architecture & training

| Paper | Year | What it established | Do |
|---|---|---|---|
| **Attention Is All You Need** | 2017 | The transformer. Attention replaces recurrence | 📖 |
| **BERT** | 2018 | Bidirectional pretraining; the encoder lineage | 🏷️ |
| **GPT-3 / Language Models are Few-Shot Learners** | 2020 | In-context learning emerges with scale | 📄 |
| **Scaling Laws for Neural Language Models** | 2020 | Loss follows predictable power laws in compute, data, parameters | 📄 |
| **Training Compute-Optimal LLMs (Chinchilla)** | 2022 | Most models were badly undertrained on data | 📖 |
| **LLaMA** | 2023 | Small models trained far longer beat larger undertrained ones | 📄 |
| **RoFormer (RoPE)** | 2021 | Rotary position embeddings; relative position, extrapolable | 🏷️ |
| **GQA** | 2023 | Grouped-query attention; shrinks the KV cache | 🏷️ |
| **Switch Transformer** | 2021 | Sparse mixture-of-experts at scale | 🏷️ |

**Chinchilla is the one to actually read** in this section. It reframed the field
— the finding that parameter count had been over-weighted relative to training
tokens is why the useful small models exist at all.

---

## Prompting & reasoning

| Paper | Year | What it established | Do |
|---|---|---|---|
| **Chain-of-Thought Prompting** | 2022 | Intermediate reasoning steps improve multi-step tasks | 📖 |
| **Self-Consistency** | 2022 | Sample several reasoning paths, take the majority answer | 📄 |
| **Tree of Thoughts** | 2023 | Search over reasoning branches | 🏷️ |
| **Take a Step Back** | 2023 | Abstracting the question first improves retrieval and reasoning | 📄 |
| **Calibrate Before Use** | 2021 | Few-shot output is biased by example order and label distribution | 📖 |
| **Language Models Don't Always Say What They Think** | 2023 | Stated reasoning can be unfaithful to the actual computation | 📖 |

**The last one matters more than its citation count suggests.** It is the
evidence behind "chain-of-thought is not an explanation", and it is the paper to
cite when someone proposes showing CoT to a regulator.

---

## Retrieval & RAG

| Paper | Year | What it established | Do |
|---|---|---|---|
| **Dense Passage Retrieval (DPR)** | 2020 | Dense retrieval beats BM25 with the right training | 📄 |
| **RAG (Lewis et al.)** | 2020 | The name and the pattern | 🏷️ |
| **ColBERT** | 2020 | Late interaction: per-token vectors, MaxSim scoring | 📖 |
| **ColBERTv2** | 2021 | Made it storage-practical | 📄 |
| **HyDE / Precise Zero-Shot Dense Retrieval** | 2022 | Embed a hypothetical answer, not the question | 📖 |
| **Lost in the Middle** | 2023 | Recall degrades in the middle of long contexts | 📖 |
| **Self-RAG** | 2023 | Reflection tokens to critique retrieval and output | 📄 |
| **Corrective RAG (CRAG)** | 2024 | Grade retrieval, correct before generating | 📄 |
| **RAPTOR** | 2024 | Recursive summary trees over chunks | 📄 |
| **HNSW** | 2016 | The graph index nearly everything uses | 📖 |
| **Product Quantization** | 2011 | Vector compression for billion-scale search | 🏷️ |
| **Matryoshka Representation Learning** | 2022 | Embeddings truncatable to fewer dimensions | 📄 |
| **BEIR** | 2021 | Retrievers generalise worse across domains than benchmarks suggest | 📖 |

**BEIR is the sobering one.** It shows retrieval methods that dominate one
benchmark falling behind BM25 on out-of-domain data — which is the honest
argument for hybrid retrieval and for evaluating on your own corpus.

---

## Evaluation

| Paper | Year | What it established | Do |
|---|---|---|---|
| **Judging LLM-as-a-Judge (MT-Bench, Chatbot Arena)** | 2023 | Judge viability, and position/verbosity/self-enhancement bias | 📖 |
| **RAGAS** | 2023 | Reference-free RAG metrics | 📄 |
| **HELM** | 2022 | Multi-metric holistic evaluation, not a single score | 📄 |
| **Model Cards for Model Reporting** | 2019 | Disaggregated reporting as a norm | 📖 |
| **Inherent Trade-Offs in Fair Classification** | 2017 | Fairness criteria cannot all hold simultaneously | 📖 |
| **Learning under Concept Drift: A Review** | 2019 | Drift taxonomy and detection methods | 📄 |

**Chouldechova (2017) and Kleinberg et al. (2016)** are the fairness
impossibility results. Short, mathematical, and they settle an argument that
otherwise recurs forever in product meetings.

---

## Efficiency & serving

| Paper | Year | What it established | Do |
|---|---|---|---|
| **LLM.int8()** | 2022 | Emergent outlier features above ~6.7B parameters | 📖 |
| **GPTQ** | 2022 | Accurate one-shot 4-bit post-training quantization | 📄 |
| **AWQ** | 2023 | Activation-aware weight quantization | 📄 |
| **SmoothQuant** | 2022 | Shift difficulty from activations to weights | 📄 |
| **QLoRA** | 2023 | Fine-tuning a 4-bit base with adapters | 📖 |
| **FlashAttention** | 2022 | IO-aware attention; same maths, far less memory traffic | 📖 |
| **PagedAttention / vLLM** | 2023 | KV cache paging; the modern serving design | 📖 |
| **Orca** | 2022 | Iteration-level (continuous) batching | 📄 |
| **Speculative Decoding** | 2022–23 | Draft-and-verify; faster with identical output | 📄 |
| **The Lottery Ticket Hypothesis** | 2018 | Sparse subnetworks that train as well as the whole | 🏷️ |
| **SparseGPT** | 2023 | One-shot pruning of large models | 📄 |
| **Are Sixteen Heads Really Better than One?** | 2019 | Many attention heads are removable | 📄 |
| **The Unreasonable Ineffectiveness of the Deeper Layers** | 2024 | Depth pruning often beats width pruning | 📄 |

---

## Agents, tools & adaptation

| Paper | Year | What it established | Do |
|---|---|---|---|
| **ReAct** | 2022 | Interleaved reasoning and acting | 📖 |
| **Reflexion** | 2023 | Verbal self-critique between attempts | 📄 |
| **Toolformer** | 2023 | Models learning when to call tools | 🏷️ |
| **LoRA** | 2021 | Low-rank adaptation of frozen weights | 📖 |
| **InstructGPT / RLHF** | 2022 | Preference alignment as a training stage | 📖 |
| **Direct Preference Optimization (DPO)** | 2023 | Preference optimisation without a reward model | 📄 |
| **Constitutional AI** | 2022 | AI feedback against written principles | 📄 |
| **LIMA** | 2023 | 1,000 curated examples beat far larger noisy sets | 📖 |
| **Not What You've Signed Up For** | 2023 | Indirect prompt injection via retrieved content | 📖 |

**LIMA is the one to read if you are about to fine-tune.** It is the strongest
published argument that data curation, not volume, is the work.

---

## How to read one of these efficiently

Most papers do not need a linear read. A method that works:

1. **Abstract, then figures.** The figures usually carry the contribution. If
   you cannot tell what the paper claims after the figures, the abstract was
   badly written, not you.
2. **Conclusion before the method.** It tells you what to look for.
3. **Method section only if you need the mechanism.** Often you do not.
4. **Skip the related work** unless you are surveying the field.
5. **Read the limitations section.** It is the most honest part of most papers
   and the fastest route to knowing whether it applies to you.
6. **Check the baselines.** A large improvement over a weak baseline is a weak
   result, and this is where over-claiming hides.

Twenty minutes per paper on that method covers far more ground than two hours
of linear reading, and retains more.

---

## Staying current without drowning

Papers are a poor way to track a fast field — by publication, results are months
old. More useful:

| Source | What it is good for |
|---|---|
| **Model and API changelogs** | What actually changed in the thing you depend on |
| **vLLM, llama.cpp, PEFT release notes** | What is now practical, not merely published |
| **Anthropic / OpenAI engineering docs** | Prompting and tool-use guidance from people with the logs |
| **Simon Willison's blog** | The clearest sustained coverage of injection and practical LLM engineering |
| **BEIR, MTEB, ANN-Benchmarks leaderboards** | Comparable numbers across methods |
| **Conference proceedings** (NeurIPS, ICML, ACL, EMNLP) | Depth, once a year, when you have time |

**A discipline worth adopting:** when a paper or release seems relevant, write
one line in your own notes saying what you would *change* because of it. If you
cannot write that line, you did not need the paper — and this is also the habit
that turns reading into something you can talk about.

---

## An honest caveat

Citations here are given by title, primary author and year so you can find them.
**Verify details before quoting a specific number or author list** — venues,
author orders and reported figures are exactly the kind of detail that is easy
to get subtly wrong, and being confidently wrong about a paper in an interview
is worse than not having read it.

The safe form is: *"the LLM.int8 paper showed that above roughly seven billion
parameters, a small number of activation dimensions become extreme outliers,
which is why naive INT8 breaks."* That is the mechanism, it is what matters, and
it does not depend on a number you half-remember.
