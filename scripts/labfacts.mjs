/**
 * Lab facts — is the arithmetic right?
 *
 * `npm run check:labs` proves a lab mounts, responds and renders something.
 * It cannot tell you the number is wrong. Three labs in this repo passed that
 * gate while being confidently incorrect:
 *
 *   - a reasoning-budget lab whose metric was degenerate, so it always
 *     advised "think less" no matter what the data said
 *   - an injection filter whose examples scored 100% precision, demonstrating
 *     the opposite of the point the page makes
 *   - a reliability lab whose prose said retries were helping while its own
 *     table showed +0.0
 *
 * So this file pins what each lab should print at its default settings. The
 * expected values are RECOMPUTED here from first principles rather than
 * copied from the rendered page — that is the whole point. A constant lifted
 * out of the output pins today's bug; an independent implementation disagrees
 * with it.
 *
 *   node scripts/labfacts.mjs           check every lab that has facts
 *   node scripts/labfacts.mjs specdec   check one
 *
 * Adding a lab does not require adding facts, but the run prints which labs
 * have none so the gap stays visible instead of being assumed covered.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./browser.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DOCS = join(ROOT, "docs");
const CONTENT = join(ROOT, "content");

const n = (x) => x.toLocaleString("en-US"); // labs print grouped thousands

// ---------------------------------------------------------------------------
// Each entry: the page it lives on, and facts that must hold at the defaults.
// `want` is computed here. `has(text, want)` says whether the page shows it.
// ---------------------------------------------------------------------------
const FACTS = {
  // --- parallelism: bubble = (p-1)/(m+p-1), measured from the occupancy grid
  bubble: {
    page: "parallelism.html",
    facts: [
      {
        name: "bubble = (p−1)/(m+p−1) at p=8, m=4",
        want: () => (((8 - 1) / (4 + 8 - 1)) * 100).toFixed(1) + "%",
        has: (t, w) => t.includes(w),
      },
      {
        name: "grid measurement agrees with the closed form",
        want: () => "identical",
        has: (t, w) => t.includes(w),
      },
      {
        name: "grid is 8 stages × 11 steps = 88 device-steps",
        want: () => `${8 * (4 + 8 - 1)}`,
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- model-selection: cost/accepted flips the ranking
  pareto: {
    page: "model-selection.html",
    facts: [
      {
        name: "cheapest per accepted answer",
        want: () => {
          const IN = 2500, OUT = 400;
          const rows = [
            ["frontier-large", 15, 75, 0.94], ["frontier-small", 3, 15, 0.88],
            ["mid-tier", 0.8, 4, 0.79], ["small-fast", 0.25, 1.25, 0.61],
            ["open-7b", 0.05, 0.1, 0.44],
          ].map(([nm, ci, co, q]) => ({ nm, e: ((IN / 1e6) * ci + (OUT / 1e6) * co) / q }));
          rows.sort((a, b) => a.e - b.e);
          return rows[0].nm;
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- text2sql: exactly the two planted errors, and nothing valid
  sqlcheck: {
    page: "text2sql.html",
    facts: [
      { name: "finds the hallucinated column signup_date", want: () => "signup_date", has: (t, w) => t.includes(w) },
      { name: "finds the hallucinated column tier", want: () => "tier", has: (t, w) => t.includes(w) },
      { name: "reports exactly 2 bad references", want: () => "2 bad references", has: (t, w) => t.includes(w) },
      { name: "resolves the 8 valid identifiers", want: () => "resolved cleanly8", has: (t, w) => t.includes(w) },
    ],
  },

  // --- agents: p^n, and the note must not claim retries help when k=1
  reliability: {
    page: "agents.html",
    facts: [
      {
        name: "end-to-end = 0.95^20",
        want: () => (Math.pow(0.95, 20) * 100).toFixed(1) + "%",
        has: (t, w) => t.includes(w),
      },
      {
        name: "at k=1 the note says retries are off",
        want: () => "Retries are off",
        has: (t, w) => t.includes(w),
      },
      {
        name: "at k=1 retries recover nothing",
        want: () => "+0.0 points",
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- system-prompts: cache break-even
  promptcost: {
    page: "system-prompts.html",
    facts: [
      {
        name: "break-even = (write−1)/(write−read)",
        want: () => (((1.25 - 1) / (1.25 - 0.1)) * 100).toFixed(1) + "%",
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- guardrails: the defaults must demonstrate false positives
  injection: {
    page: "guardrails-and-security.html",
    facts: [
      {
        name: "the safe examples do trip the filter",
        want: () => "false alarm",
        has: (t, w) => t.includes(w),
      },
      {
        name: "precision is not a perfect 100%",
        want: () => "precision below 100%",
        has: (t) => !/precision\s*100%/.test(t),
      },
    ],
  },

  // --- graphrag: BFS reach, solved independently below
  hops: {
    page: "graphrag.html",
    facts: [
      {
        name: "2-hop reach from pump",
        want: () => {
          const adj = {};
          const link = (a, b) => { (adj[a] ??= []).push(b); (adj[b] ??= []).push(a); };
          [["pump","impeller"],["pump","motor"],["pump","seal"],["motor","bearing"],
           ["motor","winding"],["motor","controller"],["controller","firmware"],
           ["controller","sensor"],["sensor","calibration"],["sensor","telemetry"],
           ["seal","gasket"],["impeller","blade"],["bearing","lubricant"],
           ["telemetry","dashboard"],["firmware","release-notes"]].forEach(([a, b]) => link(a, b));
          const dist = { pump: 0 }, q = ["pump"];
          for (let i = 0; i < q.length; i++) {
            for (const v of adj[q[i]]) if (dist[v] === undefined) { dist[v] = dist[q[i]] + 1; q.push(v); }
          }
          const within = Object.values(dist).filter((d) => d <= 2).length;
          return `${within} of ${Object.keys(adj).length}`;
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- reasoning-models: the optimum must be INTERIOR, or the metric is broken
  thinkbudget: {
    page: "reasoning-models.html",
    facts: [
      {
        name: "optimum is an interior budget, not an endpoint",
        want: () => {
          const ANS = 600, P = 20 / 1e6, F = 0.5;
          const pts = [[0,0.41],[512,0.58],[2000,0.71],[6000,0.78],[16000,0.81],[32000,0.82]]
            .map(([b, a]) => ({ b, total: (b + ANS) * P + (1 - a) * F }));
          const best = pts.reduce((m, p) => (p.total < m.total ? p : m));
          if (best.b === pts[0].b || best.b === pts[pts.length - 1].b) {
            throw new Error("expected an interior optimum — the metric has gone degenerate again");
          }
          return `${n(best.b)} tokens`;
        },
        has: (t, w) => t.includes(w),
      },
      { name: "the note names the interior optimum", want: () => "optimum is in the middle", has: (t, w) => t.includes(w) },
    ],
  },

  // --- corrective-rag: band costs
  cragroute: {
    page: "corrective-rag.html",
    facts: [
      {
        name: "cost per 1k queries across the three branches",
        want: () => {
          const s = ("0.95 0.91 0.88 0.84 0.81 0.78 0.74 0.71 0.68 0.66 0.63 0.61 0.58 0.55 " +
            "0.52 0.49 0.46 0.42 0.38 0.34 0.29 0.24 0.19 0.12 0.07").split(/\s+/).map(Number);
          const c = s.filter((v) => v >= 0.7).length * 0.008
            + s.filter((v) => v >= 0.3 && v < 0.7).length * 0.045
            + s.filter((v) => v < 0.3).length * 0.07;
          return "$" + ((c / s.length) * 1000).toFixed(2);
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- market-and-business: break-even usage and who is past it
  unitecon: {
    page: "market-and-business.html",
    facts: [
      {
        name: "break-even = (price − fixed) / cost per request",
        want: () => n(Math.floor((20 - 2) / 0.03)),
        has: (t, w) => t.includes(w),
      },
      {
        name: "users above break-even",
        want: () => {
          const u = ("12 18 23 25 31 34 38 41 44 47 52 55 58 63 67 71 78 84 92 101 " +
            "115 134 158 190 240 310 420 580 870 1400").split(/\s+/).map(Number);
          return `${u.filter((x) => 20 - 2 - x * 0.03 < 0).length} of ${u.length}`;
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- orchestration: a second critical-path solver, written independently
  critpath: {
    page: "orchestration-frameworks.html",
    facts: [
      {
        name: "critical path length (longest path over the DAG)",
        want: () => `${n(solveDag().makespan)} ms`,
        has: (t, w) => t.includes(w),
      },
      {
        name: "sequential total (sum of durations)",
        want: () => `${n(solveDag().seq)} ms`,
        has: (t, w) => t.includes(w),
      },
      {
        name: "speedup ceiling = sequential / critical path",
        want: () => { const d = solveDag(); return (d.seq / d.makespan).toFixed(2) + "×"; },
        has: (t, w) => t.includes(w),
      },
      {
        name: "the named path is the actual longest one",
        want: () => "classify → web-search → merge → generate → guardrail",
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- reasoning-inference-optimization: speculative decoding optimum
  specdec: {
    page: "reasoning-inference-optimization.html",
    facts: [
      {
        name: "optimal draft length k",
        want: () => {
          const f = (a, k, c) => ((1 - a ** (k + 1)) / (1 - a)) / (1 + k * c);
          let best = { k: 0, s: 0 };
          for (let k = 1; k <= 16; k++) { const s = f(0.8, k, 0.1); if (s > best.s) best = { k, s }; }
          if (best.k <= 1 || best.k >= 16) throw new Error("optimum hit an endpoint — check the model");
          return `at k = ${best.k}`;
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "speedup at the optimum",
        want: () => {
          const f = (a, k, c) => ((1 - a ** (k + 1)) / (1 - a)) / (1 + k * c);
          let s = 0;
          for (let k = 1; k <= 16; k++) s = Math.max(s, f(0.8, k, 0.1));
          return s.toFixed(2) + "×";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "saturation ceiling 1/(1−α)",
        want: () => (1 / (1 - 0.8)).toFixed(2),
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- model-shape: KV arithmetic straight off a config.json
  config: {
    page: null,
    facts: [
      {
        name: "KV per token = 2 · layers · kv_heads · head_dim · dtype bytes",
        want: () => {
          const L = 32, kvh = 8, hd = 4096 / 32, bytes = 2;
          return (2 * L * kvh * hd * bytes) / 1024 + " KiB";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "KV at 32k context × 64 concurrent requests",
        want: () => {
          const perTok = 2 * 32 * 8 * (4096 / 32) * 2;
          return (((perTok * 32768 * 64) / 1073741824)).toFixed(2) + " GiB";
        },
        has: (t, w) => t.includes(w),
      },
      {
        // 8 KV heads against 32 attention heads is GQA, and it is the single
        // biggest lever on this page: without it the same config would need
        // four times the KV cache.
        name: "GQA cuts the KV cache fourfold against full multi-head",
        want: () => {
          const gqa = 2 * 32 * 8 * 128 * 2;
          const mha = 2 * 32 * 32 * 128 * 2;
          if (mha / gqa !== 4) throw new Error(`expected a 4x ratio, got ${mha / gqa}`);
          return gqa / 1024 + " KiB";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "the KV cache alone overflows an 80 GiB accelerator",
        want: () => {
          const total = (2 * 32 * 8 * 128 * 2 * 32768 * 64) / 1073741824;
          if (!(total > 80)) throw new Error(`expected an overflow at 80 GiB, got ${total.toFixed(2)}`);
          return total.toFixed(2) + " GiB";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "active parameters for this config",
        want: () => "8.0 B",
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- harness-and-loops: properties a loop must not violate
  agentloop: {
    page: null,
    facts: [
      {
        // The loop's step-by-step behaviour would have to be transcribed to
        // predict its exact ending, and a transcription proves nothing. What
        // is worth guarding is that its stopping conditions actually stop it:
        // a budget that can be overrun is not a budget.
        name: "token spend never exceeds the budget",
        want: () => "tokens spent ≤ budget",
        has: (t) => {
          const m = t.match(/tokens spent([\d,]+) of ([\d,]+)/);
          if (!m) return false;
          const spent = Number(m[1].replace(/,/g, "")), budget = Number(m[2].replace(/,/g, ""));
          return spent <= budget;
        },
      },
      {
        name: "progress never exceeds 100%",
        want: () => "progress ≤ 100%",
        has: (t) => {
          const m = t.match(/progress reached(\d+)%/);
          return !!m && Number(m[1]) <= 100;
        },
      },
      {
        name: "the run reports a definite outcome",
        want: () => "completed or stopped",
        has: (t) => /completed|stopped:/.test(t),
      },
    ],
  },

  // --- embeddings: the three metrics disagree on raw counts
  similarity: {
    page: null,
    facts: [
      {
        // The vectors are hashed character trigrams; copying that hash would
        // be a transcription. What is pinned is the panel's structural claim,
        // read back off the three headlines: on raw counts the three metrics
        // rank different documents first. If they ever agree, the corpus has
        // stopped demonstrating the point the page is making.
        name: "cosine, dot product and Euclidean do not all agree",
        want: () => "disagree",
        has: (t) => {
          const ranks = [...t.matchAll(/#(\d+)/g)].map((m) => m[1]).slice(0, 3);
          return ranks.length === 3 && new Set(ranks).size > 1;
        },
      },
      {
        // Euclidean on raw counts rewards the smallest vector: a near-empty
        // document sits at distance ~|query| from everything. "Pineapples."
        // is the shortest line in the corpus by a wide margin.
        name: "Euclidean ranks the shortest document first",
        want: () => "#4",
        has: (t) => {
          const ranks = [...t.matchAll(/#(\d+)/g)].map((m) => m[1]);
          return ranks[2] === "4";
        },
      },
      {
        name: "dot product does not pick the same document as cosine",
        want: () => "cosine ≠ dot",
        has: (t) => {
          const ranks = [...t.matchAll(/#(\d+)/g)].map((m) => m[1]);
          return ranks.length >= 2 && ranks[0] !== ranks[1];
        },
      },
    ],
  },

  // --- transformers: scaled dot-product attention
  attention: {
    page: null,
    facts: [
      {
        // The word vectors come from an LCG. Copying it here would be a
        // transcription, not a check, so what is pinned is the property that
        // must hold whatever the vectors are: softmax normalises each row.
        name: "every softmax row sums to exactly 1",
        want: () => (1).toFixed(6),
        has: (t, w) => t.includes(w),
      },
      {
        name: "the softmax is over positions, not a vocabulary",
        want: () => `over ${"the cat sat on the mat".split(" ").length} positions`,
        has: (t, w) => t.includes(w),
      },
      {
        name: "the causal first row is a single 1.00 — a token can only see itself",
        want: () => "1.00",
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- regression-gates: can a 200-item set see a 1-point drop?
  gate: {
    page: null,
    facts: [
      {
        name: "observed − baseline = −1.0 pts, 178/200 vs 180/200",
        want: () => "−1.0 pts",
        has: (t, w) => t.includes(w),
      },
      {
        name: "pooled two-proportion z gives this p-value",
        want: () => "= " + gateStats(200).pval.toFixed(3),
        has: (t, w) => t.includes(w),
      },
      {
        // The panel's instruction: read the interval, it straddles zero, so
        // the same system could have produced either score.
        name: "the 95% interval on the difference straddles zero",
        want: () => {
          const g = gateStats(200);
          if (!(g.lo <= 0 && g.hi >= 0)) {
            throw new Error(`interval [${g.lo.toFixed(4)}, ${g.hi.toFixed(4)}] does not contain 0`);
          }
          return "= " + g.pval.toFixed(3);
        },
        has: (t, w) => t.includes(w),
      },
      {
        // And: drag items to the top and it STILL contains zero. That is the
        // point of the lab -- the gate is unachievable at any size it offers.
        name: "it still straddles zero at the maximum 2000 items",
        want: () => {
          const g = gateStats(2000);
          if (!(g.lo <= 0 && g.hi >= 0)) {
            throw new Error(`at n=2000 the interval [${g.lo.toFixed(4)}, ${g.hi.toFixed(4)}] excludes 0 — the panel's claim no longer holds`);
          }
          return "= " + gateStats(200).pval.toFixed(3);
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- chunking: the fixed-window arithmetic and what overlap costs
  chunker: {
    page: null,
    facts: [
      {
        // Only the fixed-window half is reimplemented. The sentence splitter
        // is intricate (terminators, closing quotes, decimals like "3.5"), and
        // a second copy of it would be a transcription rather than a check --
        // so nothing here depends on it.
        name: "fixed chunk count from size 120 and overlap 30",
        want: () => n(chunkFixed(120, 30).count),
        has: (t, w) => t.includes(w),
      },
      {
        name: "measured duplication over the default document",
        want: () => chunkFixed(120, 30).dup.toFixed(3) + "×",
        has: (t, w) => t.includes(w),
      },
      {
        name: "C/(C−O) predicts a higher duplication than this short text shows",
        want: () => {
          const measured = chunkFixed(120, 30).dup;
          const predicted = 120 / (120 - 30);
          if (!(predicted > measured)) {
            throw new Error(`the closed form should exceed the measurement on a short text: ${predicted.toFixed(3)} vs ${measured.toFixed(3)}`);
          }
          return predicted.toFixed(3) + "×";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "more overlap stores more copies of the same text",
        want: () => {
          let prev = 0;
          for (const o of [0, 30, 60, 90]) {
            const d = chunkFixed(120, o).dup;
            if (d < prev) throw new Error(`overlap ${o} reduced duplication to ${d}`);
            prev = d;
          }
          return chunkFixed(120, 30).dup.toFixed(3) + "×";
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- tokenization: a real BPE merge loop over the default corpus
  tokenizer: {
    page: null,
    facts: [
      {
        name: "tokens for “the fat cat sat” after 18 merges",
        want: () => n(runBpe(18).tokens),
        has: (t, w) => t.includes(w),
      },
      {
        name: "more merges never produce more tokens",
        want: () => {
          let prev = Infinity;
          for (const m of [0, 4, 8, 12, 18, 30]) {
            const got = runBpe(m).tokens;
            if (got > prev) throw new Error(`${m} merges gave ${got} tokens, up from ${prev}`);
            prev = got;
          }
          return n(runBpe(18).tokens);
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "with no merges every character is its own token",
        want: () => {
          const chars = "the fat cat sat".replace(/\s+/g, "").length;
          const words = 4;
          const got = runBpe(0).tokens;
          if (got !== chars + words) {
            throw new Error(`0 merges should give ${chars} chars + ${words} end markers, got ${got}`);
          }
          return n(runBpe(18).tokens);
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- decoding: one step through temperature, top-k, top-p, min-p
  sampler: {
    page: null,
    facts: [
      {
        name: "candidates surviving the default filter chain",
        want: () => `${sampleStep().kept} / 12`,
        has: (t, w) => t.includes(w),
      },
      {
        // The panel tells the reader to drag temperature 0 -> 2 and watch
        // pre-filter entropy go from 0 to 3.27 bits over identical logits.
        name: "entropy before filtering is 0 bits at T=0 and 3.27 at T=2",
        want: () => {
          const cold = sampleStep("open", 0).entropyBefore;
          const hot = sampleStep("open", 2).entropyBefore;
          if (cold !== 0) throw new Error(`T=0 must be deterministic, got ${cold.toFixed(2)} bits`);
          if (hot.toFixed(2) !== "3.27") throw new Error(`panel says 3.27 bits at T=2, got ${hot.toFixed(2)}`);
          return sampleStep().entropyBefore.toFixed(2);
        },
        has: (t, w) => t.includes(w),
      },
      {
        // And to switch to the confident step, where top-k keeps ten that
        // top-p cuts to one. That contrast is the lab's point.
        name: "on the confident step top-k keeps 10 where top-p keeps 1",
        want: () => {
          const kOnly = sampleStep("sure", 1, 10, 1, 0).kept;
          const pOnly = sampleStep("sure", 1, 12, 0.95, 0).kept;
          if (kOnly !== 10 || pOnly !== 1) {
            throw new Error(`panel claims 10 vs 1, computed ${kOnly} vs ${pOnly}`);
          }
          return `${sampleStep().kept} / 12`;
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "filtering never raises entropy",
        want: () => {
          const s = sampleStep();
          if (s.entropyAfter > s.entropyBefore + 1e-9) {
            throw new Error(`filtering raised entropy: ${s.entropyBefore} -> ${s.entropyAfter}`);
          }
          return s.entropyAfter.toFixed(2) + " bits";
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- kv-cache: paged vs contiguous on the same pool and queue
  paged: {
    page: null,
    facts: [
      {
        name: "paged admits every request; contiguous admits pool ÷ max_seq_len",
        want: () => {
          const p = pagedAlloc();
          if (p.pagedAdmit !== 10 || p.contigAdmit !== 4) {
            throw new Error(`expected 10 / 4, computed ${p.pagedAdmit} / ${p.contigAdmit}`);
          }
          return `${p.pagedAdmit} / ${p.contigAdmit}`;
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "paged utilisation = live tokens ÷ slots committed",
        want: () => (pagedAlloc().pagedUtil * 100).toFixed(1) + "%",
        has: (t, w) => t.includes(w),
      },
      {
        name: "contiguous utilisation on the same pool",
        want: () => (pagedAlloc().contigUtil * 100).toFixed(1) + "%",
        has: (t, w) => t.includes(w),
      },
      {
        // The panel tells the reader to check this against the bound line:
        // internal waste is strictly below one block per request, whatever
        // the block size. That ceiling is the argument for fixed blocks.
        name: "internal waste stays under one block per request at every block size",
        want: () => {
          for (const B of [8, 16, 24, 32, 40, 48, 56, 64]) {
            const { waste, admitted } = pagedAlloc(B);
            if (waste >= admitted * B) {
              throw new Error(`waste ${waste} reached the ${admitted * B} bound at block ${B}`);
            }
          }
          return (pagedAlloc().pagedUtil * 100).toFixed(1) + "%";
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- long-context: the lost-in-the-middle shape the stated curve implies
  needle: {
    page: null,
    facts: [
      {
        name: "modelled recall at 128k, needle at 50%, 4 doublings past 8k",
        want: () => needleRecall(131072, 0.5).toFixed(2),
        has: (t, w) => t.includes(w),
      },
      {
        // The panel's headline claim, and the reason the lab exists: hiding
        // the needle at an end reports ~1.8x the honest average over depths.
        name: "an end-of-context needle reports ~1.8× the mean over all 11 depths",
        want: () => {
          const end = needleRecall(131072, 0);
          let sum = 0;
          for (let i = 0; i <= 10; i++) sum += needleRecall(131072, i / 10);
          const ratio = end / (sum / 11);
          if (ratio < 1.75 || ratio > 1.9) {
            throw new Error(`panel claims ~1.8x, computed ${ratio.toFixed(3)}`);
          }
          return needleRecall(131072, 0.5).toFixed(2);
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "with no dip and no decay the whole map reads 1.00",
        want: () => {
          for (const L of [4096, 131072, 524288]) {
            for (let i = 0; i <= 10; i++) {
              const v = needleRecall(L, i / 10, 0, 0);
              if (Math.abs(v - 1) > 1e-9) {
                throw new Error(`s=0 a=0 should give 1.00 everywhere, got ${v} at ${L}/${i * 10}%`);
              }
            }
          }
          return needleRecall(131072, 0.5).toFixed(2);
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "with no dip the column is flat across depths",
        want: () => {
          const flat = new Set();
          for (let i = 0; i <= 10; i++) flat.add(needleRecall(131072, i / 10, 0).toFixed(6));
          if (flat.size !== 1) throw new Error(`dip 0 should flatten the column, got ${flat.size} values`);
          return needleRecall(131072, 0.5).toFixed(2);
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- kv-reuse: a chained prefix hash hits up to the first differing block
  prefix: {
    page: null,
    facts: [
      {
        // Computed from token equality, not from the lab's hash. Identical
        // prefixes hash identically under ANY chained hash, so the number of
        // leading hits depends only on where the prompts first differ and the
        // block size -- which makes this independent of their mix() function.
        name: "hit rate = leading identical blocks ÷ total blocks",
        want: () => {
          const { hit, blocks } = prefixHit(4);
          return ((100 * hit) / blocks).toFixed(1) + "%";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "one changed word breaks exactly the block it falls in, not the ones before",
        want: () => {
          const { hit, firstDiff, blocks } = prefixHit(4);
          if (hit !== Math.floor(firstDiff / 4)) {
            throw new Error(`hits should run up to the differing block: hit=${hit}, diff at ${firstDiff}`);
          }
          if (hit === 0 || hit === blocks) throw new Error("expected a partial hit at the defaults");
          return ((100 * hit) / blocks).toFixed(1) + "%";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "a smaller block size recovers more of the prefix",
        want: () => {
          const four = prefixHit(4), one = prefixHit(1);
          if (!(one.hit / one.blocks > four.hit / four.blocks)) {
            throw new Error("block size 1 should hit a larger share than block size 4");
          }
          return ((100 * four.hit) / four.blocks).toFixed(1) + "%";
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- prompt-engineering: the validator catches all three planted defects
  schema: {
    page: null,
    facts: [
      {
        name: "three violations in the default response",
        want: () => "3 violations",
        has: (t, w) => t.includes(w),
      },
      {
        name: '"Positive" is rejected against the lowercase enum',
        want: () => "not in positive|neutral|negative",
        has: (t, w) => t.includes(w),
      },
      {
        name: "confidence 1.4 is caught above the maximum",
        want: () => "1.4 above maximum 1",
        has: (t, w) => t.includes(w),
      },
      {
        name: "the extra field is caught as not in the schema",
        want: () => "not in the schema",
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- serving-and-operations: M/M/1 at the knee
  queue: {
    page: null,
    facts: [
      {
        name: "ρ = λ/μ per replica = (6.8/4) / (800/400)",
        want: () => (6.8 / 4 / (800 / 400)).toFixed(2),
        has: (t, w) => t.includes(w),
      },
      {
        name: "time in system W = 1/(μ−λ), the panel's 3.3 s",
        want: () => {
          const mu = 800 / 400, lam = 6.8 / 4;
          return (1 / (mu - lam)).toFixed(2);
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "p95 total latency = ln(20)/(μ−λ)",
        want: () => {
          const mu = 800 / 400, lam = 6.8 / 4;
          return (Math.log(1 / 0.05) / (mu - lam)).toFixed(2);
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "adding a replica more than halves p95 — the panel says so",
        want: () => {
          const mu = 800 / 400;
          const p95 = (c) => Math.log(20) / (mu - 6.8 / c);
          if (!(p95(5) < p95(4) / 2)) {
            throw new Error(`a 5th replica should more than halve p95: ${p95(4).toFixed(2)} -> ${p95(5).toFixed(2)}`);
          }
          return (Math.log(20) / (mu - 6.8 / 4)).toFixed(2);
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "no steady state once ρ ≥ 1",
        want: () => {
          const mu = 800 / 400;
          if (6.8 / 1 / mu < 1) throw new Error("expected rho >= 1 at one replica");
          return (1 / (1 - 0.85)).toFixed(1); // W is this multiple of service time at the default
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- query-transformation: a vocabulary mismatch, not a ranking problem
  retrieve: {
    page: null,
    facts: [
      {
        // Pinned structurally rather than by score: the page's claim is that
        // the question as typed shares no term with the corpus, so no amount
        // of reranking helps. That is a property of the words, not of BM25's
        // parameters, so it holds whatever k1 and b the lab uses.
        name: "the question as typed shares no term with any document",
        want: () => {
          const tok = (s) => (s.toLowerCase().match(/[0-9a-z]+/g) || []);
          const corpus = [
            "Requests are rejected with status 429 when the token bucket is empty.",
            "The rate limiter uses a token bucket refilled at a steady rate per tenant.",
            "Latency rose after the cache was disabled during the migration.",
            "Backpressure is signalled upstream using Retry-After headers.",
            "The deployment pipeline runs integration tests before promoting a build.",
            "Connection pool exhaustion causes queueing and raises p99 latency.",
          ].map((d) => new Set(tok(d)));
          const asked = tok("why am I getting errors");
          const hits = corpus.filter((d) => asked.some((w) => d.has(w))).length;
          if (hits !== 0) throw new Error(`expected a total vocabulary miss, ${hits} doc(s) matched`);
          return "0 of 6";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "so nothing is retrieved at all",
        want: () => "no document shares a term",
        has: (t, w) => t.includes(w),
      },
      {
        name: "the rewrite does share vocabulary and retrieves",
        want: () => {
          const tok = (s) => (s.toLowerCase().match(/[0-9a-z]+/g) || []);
          const corpus = [
            "Requests are rejected with status 429 when the token bucket is empty.",
            "The rate limiter uses a token bucket refilled at a steady rate per tenant.",
          ].map((d) => new Set(tok(d)));
          const rewrite = tok("rate limit token bucket 429 rejected");
          if (!corpus.some((d) => rewrite.some((w) => d.has(w)))) {
            throw new Error("the rewrite should share vocabulary with the corpus");
          }
          return "top doc scores";
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- ensembles-and-routing: a cascade pays below 1 − cheap/strong
  cascade: {
    page: null,
    facts: [
      {
        name: "break-even escalation rate is 1 − cheap/strong, and nothing else",
        want: () => ((1 - 10 / 200) * 100).toFixed(1) + "%",
        has: (t, w) => t.includes(w),
      },
      {
        name: "cascade cost = cheap always + strong on the escalated share",
        want: () => (10 + 0.3 * 200).toFixed(1) + " ¢",
        has: (t, w) => t.includes(w),
      },
      {
        name: "saving against always using the strong model",
        want: () => {
          const cascade = 10 + 0.3 * 200;
          return (((200 - cascade) / 200) * 100).toFixed(0) + "% cheaper";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "blended accuracy is the escalation-weighted mix",
        want: () => ((0.7 * 0.92 + 0.3 * 0.97) * 100).toFixed(2) + "%",
        has: (t, w) => t.includes(w),
      },
      {
        name: "break-even is far above the default escalation rate",
        want: () => {
          const be = 1 - 10 / 200;
          if (!(be > 0.9)) throw new Error(`expected break-even above 90%, got ${be}`);
          return "95%";
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- numbers-to-know: the whiteboard estimate and the ÷100,000 shortcut
  envelope: {
    page: null,
    facts: [
      {
        name: "average QPS = daily requests ÷ 86,400",
        want: () => n(Math.round((50e6 * 40) / 86400)) + " avg",
        has: (t, w) => t.includes(w),
      },
      {
        name: "peak QPS at 3× average",
        want: () => n(Math.round(((50e6 * 40) / 86400) * 3)) + " peak",
        has: (t, w) => t.includes(w),
      },
      {
        name: "the ÷100,000 shortcut and its error",
        want: () => {
          const exact = (50e6 * 40) / 86400, short = (50e6 * 40) / 1e5;
          return n(short) + " QPS · " + (((short - exact) / exact) * 100).toFixed(1) + "% low";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "the shortcut under-promises rather than over-promises",
        want: () => {
          const exact = (50e6 * 40) / 86400, short = (50e6 * 40) / 1e5;
          if (short >= exact) throw new Error("the ÷100,000 shortcut must read low, not high");
          return "right kind of wrong";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "servers at peak, with one spare",
        want: () => n(Math.ceil(((50e6 * 40) / 86400) * 3 / 10000) + 1),
        has: (t, w) => t.includes(w),
      },
      {
        name: "cost per request from the two token prices",
        want: () => "$" + ((2000 * 3 + 400 * 15) / 1e6).toFixed(5),
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- training-methods: 12 bytes per parameter, and what LoRA removes
  ftmem: {
    page: null,
    facts: [
      {
        name: "full fine-tune = 12 bytes/param + overhead",
        want: () => ((8e9 * 12) / 1e9 + 20).toFixed(1),
        has: (t, w) => t.includes(w),
      },
      {
        name: "full does not fit in 80 GB but LoRA and QLoRA do",
        want: () => {
          const adapter = 32 * 4 * 2 * 16 * 4096;
          const full = (8e9 * 12) / 1e9 + 20;
          const lora = (8e9 * 2 + adapter * 12) / 1e9 + 20;
          const qlora = (8e9 * 0.5 + adapter * 12) / 1e9 + 20;
          if (!(full > 80 && lora <= 80 && qlora <= 80)) {
            throw new Error(`expected full>80>=lora>=qlora, got ${full.toFixed(1)}/${lora.toFixed(1)}/${qlora.toFixed(1)}`);
          }
          return "does not fit";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "LoRA total, with the frozen base at 2 bytes",
        want: () => {
          const adapter = 32 * 4 * 2 * 16 * 4096;
          return ((8e9 * 2 + adapter * 12) / 1e9 + 20).toFixed(1);
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "QLoRA total, with the frozen base at 0.5 bytes",
        want: () => {
          const adapter = 32 * 4 * 2 * 16 * 4096;
          return ((8e9 * 0.5 + adapter * 12) / 1e9 + 20).toFixed(1);
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- fine-tuning: LoRA parameter and memory arithmetic
  lora: {
    page: null,
    facts: [
      {
        name: "trainable params = L · Σ r(in+out) for q,k,v,o at d=4096, r=16, L=32",
        want: () => n(loraTrain(4096, 32, 16, ["q", "k", "v", "o"])),
        has: (t, w) => t.includes(w),
      },
      {
        name: "base is Llama-2-7B shaped (6.74B params, MLP width 11008)",
        want: () => {
          const base = loraBase(4096, 32);
          if (base < 6.7e9 || base > 6.8e9) throw new Error(`expected ~6.74B base, got ${base}`);
          return n(base + loraTrain(4096, 32, 16, ["q", "k", "v", "o"]));
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "trainable share of the whole model",
        want: () => {
          const base = loraBase(4096, 32);
          const train = loraTrain(4096, 32, 16, ["q", "k", "v", "o"]);
          return ((100 * train) / (base + train)).toFixed(3) + "%";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "adapter file at fp16 = 2 bytes per trainable param",
        want: () => {
          const bytes = loraTrain(4096, 32, 16, ["q", "k", "v", "o"]) * 2;
          return (bytes / 1048576).toFixed(1) + " MiB";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "base is this many times larger than the adapter",
        want: () => {
          const base = loraBase(4096, 32);
          return n(Math.floor(base / loraTrain(4096, 32, 16, ["q", "k", "v", "o"])));
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- quantization: the affine quantizer, and what one outlier costs
  quantize: {
    page: null,
    facts: [
      {
        name: "INT4 per-tensor RMSE on the default outlier vector",
        want: () => {
          const r = runQuantize(4, 16);
          return r.rmse.toFixed(4);
        },
        has: (t, w) => t.includes(w),
      },
      {
        // The lab's point: one weight 20x larger than the rest consumes the
        // range, so most of the tensor rounds onto the zero code and is gone.
        name: "most of the tensor is flattened to exactly zero",
        want: () => {
          const r = runQuantize(4, 16);
          if (r.dead < 8) throw new Error(`expected most weights dead, got ${r.dead}/16`);
          return `${r.dead} / 16`;
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "deleting the outlier collapses the error",
        want: () => {
          const withIt = runQuantize(4, 16).rmse;
          const without = runQuantize(4, 15, true).rmse;
          if (!(without < withIt / 10)) {
            throw new Error(`removing 9.20 should collapse RMSE: ${withIt.toFixed(4)} -> ${without.toFixed(4)}`);
          }
          return runQuantize(4, 16).rmse.toFixed(4); // the default render still shows the outlier case
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "per-block confines the damage to one block",
        want: () => {
          const tensor = runQuantize(4, 16).rmse;
          const block = runQuantize(4, 4).rmse;
          if (!(block < tensor)) {
            throw new Error(`per-block should beat per-tensor: ${block.toFixed(4)} vs ${tensor.toFixed(4)}`);
          }
          return runQuantize(4, 16).rmse.toFixed(4);
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- bias-and-explainability: the weighted mean that was once wrong
  segments: {
    page: null,
    facts: [
      {
        // This headline was 0.91 at one point while the segment table it sits
        // above summed to 0.9264. Pinning it is the whole reason this file
        // exists, so it is computed from the segments rather than recorded.
        name: "aggregate is the share-weighted mean of the segments",
        want: () => {
          const segs = [[0.78, 0.95], [0.15, 0.93], [0.05, 0.71], [0.02, 0.52]];
          const shareSum = segs.reduce((a, [s]) => a + s, 0);
          const agg = segs.reduce((a, [s, acc]) => a + s * acc, 0) / shareSum;
          return (agg * 100).toFixed(1) + "%";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "the aggregate passes a 90% gate while two segments fail it",
        want: () => {
          const segs = [[0.78, 0.95], [0.15, 0.93], [0.05, 0.71], [0.02, 0.52]];
          const agg = segs.reduce((a, [s, acc]) => a + s * acc, 0);
          const failing = segs.filter(([, acc]) => acc < 0.9).length;
          if (!(agg >= 0.9 && failing === 2)) {
            throw new Error(`expected a passing aggregate hiding 2 failures, got ${agg.toFixed(4)} / ${failing}`);
          }
          return "aggregate passes the gate";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "eval items per segment at n=2000",
        want: () => [0.78, 0.15, 0.05, 0.02].map((s) => String(Math.round(s * 2000))).join(" "),
        has: (t, w) => w.split(" ").every((v) => t.includes(v)),
      },
    ],
  },

  // --- model-shape: the roofline, for an 8B bf16 model on an H100 at batch 1
  roofline: {
    page: null,
    facts: [
      {
        name: "memory bound at batch 1",
        want: () => {
          const r = computeRoofline();
          if (r.bound !== "memory") throw new Error(`batch-1 decode must be memory bound, got ${r.bound}`);
          return "memory bound";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "arithmetic intensity = 2·B FLOP per byte of weights",
        want: () => computeRoofline().intensity.toFixed(1) + " FLOP/byte",
        has: (t, w) => t.includes(w),
      },
      {
        name: "machine balance = peak FLOP/s ÷ bandwidth",
        want: () => computeRoofline().balance.toFixed(1) + " FLOP/byte",
        has: (t, w) => t.includes(w),
      },
      {
        name: "compute utilisation is in the single-digit percents",
        want: () => {
          const u = computeRoofline().util;
          if (u > 5) throw new Error(`batch-1 decode should barely touch the ALUs, got ${u.toFixed(1)}%`);
          return u.toFixed(1) + "%";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "batch size that reaches the crossover",
        want: () => n(computeRoofline().crossover),
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- embeddings-and-vector-databases: BM25, scored independently below
  bm25: {
    page: null, // resolved from the fences at run time
    facts: [
      {
        name: "D1 wins at k1=1.2, b=0.75 — not the keyword-stuffed or padded doc",
        want: () => {
          const r = scoreBm25(1.2, 0.75);
          if (r[0].n !== 1) throw new Error(`expected D1 to win, got D${r[0].n}`);
          return "top score — D1";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "top score to three decimals",
        want: () => scoreBm25(1.2, 0.75)[0].score.toFixed(3),
        has: (t, w) => t.includes(w),
      },
      {
        name: "6 documents, average length 9.5 tokens",
        want: () => "6 · 9.5 tokens",
        has: (t, w) => t.includes(w),
      },
      {
        name: "pushing k1 to 3.5 hands first place to the keyword-stuffed D2",
        // The panel claims this; if saturation stops behaving, the claim is
        // wrong and the page is lying to the reader.
        want: () => {
          const r = scoreBm25(3.5, 0.75);
          if (r[0].n !== 2) throw new Error(`k1=3.5 should favour D2, got D${r[0].n}`);
          return "top score — D1"; // the DEFAULT render still shows D1
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "dragging b to 0 hands first place to the padded D3",
        want: () => {
          const r = scoreBm25(1.2, 0);
          if (r[0].n !== 3) throw new Error(`b=0 should favour D3, got D${r[0].n}`);
          return "top score — D1";
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- drift-detection: PSI, recomputed from the binning rule
  psi: {
    page: null,
    facts: [
      {
        name: "PSI total over the default baseline and current samples",
        want: () => "PSI = " + computePsi().total.toFixed(4),
        has: (t, w) => t.includes(w),
      },
      {
        name: "the shift is large enough to be called a major shift",
        want: () => {
          const { total } = computePsi();
          if (total < 0.25) throw new Error(`expected PSI >= 0.25, got ${total.toFixed(4)}`);
          return "major shift";
        },
        has: (t, w) => t.includes(w),
      },
      { name: "30 values in each sample", want: () => "30 / 30", has: (t, w) => t.includes(w) },
    ],
  },

  // --- caching: three eviction policies over the same trace
  cachesim: {
    page: null,
    facts: [
      {
        // LFU, not LRU. The default trace has a hot set plus a scan through
        // cold keys, and a scan is exactly what thrashes LRU -- it evicts the
        // hot set to make room for keys it will never see again, while LFU's
        // counters protect them. The lab's own note says LRU "wins on
        // locality and loses on a scan"; this is the losing case.
        name: "LFU wins on the default trace, because the scan thrashes LRU",
        want: () => {
          const r = runCache(3);
          const best = r.reduce((m, x) => (x.rate > m.rate ? x : m));
          if (best.name !== "LFU") throw new Error(`expected LFU to win, got ${best.name}`);
          return `${best.name} ${(best.rate * 100).toFixed(1)}%`;
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "27 requests, 12 distinct keys",
        want: () => `requests${CACHE_TRACE.length}distinct keys12`,
        has: (t, w) => t.includes(w),
      },
      {
        name: "every policy's hit rate",
        want: () => runCache(3).map((x) => (x.rate * 100).toFixed(1) + "%").join(" "),
        has: (t, w) => w.split(" ").every((v) => t.includes(v)),
      },
    ],
  },

  // --- synthetic-data: Jaccard over character shingles, every pair
  dedup: {
    page: null,
    facts: [
      {
        name: "8 pasted examples collapse to the computed distinct count",
        want: () => {
          const { groups, lines } = runDedup(0.6, 4);
          if (groups >= lines) throw new Error("expected some collapse at 60% / 4-char shingles");
          return `${groups} of ${lines}`;
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "all 28 pairs compared, not sampled",
        want: () => `${(8 * 7) / 2}  (all of them)`.replace(/\s+/g, " "),
        has: (t, w) => t.includes(w),
      },
      {
        name: "pairs above the threshold",
        want: () => String(runDedup(0.6, 4).dupPairs),
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- llm-as-a-judge: Cohen's kappa over the default 20 rated pairs
  kappa: {
    page: "llm-as-a-judge.html",
    facts: [
      {
        name: "κ = (p₀ − pₑ) / (1 − pₑ) over the 20 default pairs",
        want: () => {
          const pairs = [
            "pass pass","pass pass","pass pass","pass pass","pass pass",
            "pass pass","pass pass","pass fail","fail pass","fail fail",
            "pass pass","pass pass","pass pass","pass pass","pass fail",
            "fail pass","pass pass","pass pass","fail fail","pass pass",
          ].map((s) => s.split(" "));
          const n = pairs.length;
          const row = {}, col = {}, labels = new Set();
          let agree = 0;
          for (const [a, b] of pairs) {
            labels.add(a); labels.add(b);
            row[a] = (row[a] || 0) + 1;
            col[b] = (col[b] || 0) + 1;
            if (a === b) agree++;
          }
          const p0 = agree / n;
          let pe = 0;
          for (const L of labels) pe += ((row[L] || 0) / n) * ((col[L] || 0) / n);
          return "κ = " + ((p0 - pe) / (1 - pe)).toFixed(3);
        },
        has: (t, w) => t.includes(w),
      },
      { name: "raw agreement 80.0%", want: () => "80.0%", has: (t, w) => t.includes(w) },
      {
        name: "chance agreement is high enough to fire the lopsided-labels note",
        want: () => "Chance agreement is 68%",
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- anti-patterns: Wilson interval and the sample size the page's example needs
  evalsig: {
    page: "anti-patterns.html",
    facts: [
      {
        name: "A = 82% on 50 items, Wilson 95% interval",
        want: () => {
          const [lo, hi] = wilson(41, 50);
          return `[${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}]`;
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "the two intervals overlap, so the page's example is undecidable",
        want: () => {
          const a = wilson(41, 50), b = wilson(43, 50);
          if (!(a[1] >= b[0] && b[1] >= a[0])) {
            throw new Error("expected overlapping intervals at n=50 — the page's whole example");
          }
          return "cannot tell them apart";
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "items needed per arm for 0.82 vs 0.86 at 80% power",
        want: () => {
          const p1 = 0.82, p2 = 0.86, Z = 1.959964, ZB = 0.8416212;
          const pbar = (p1 + p2) / 2;
          const a = Z * Math.sqrt(2 * pbar * (1 - pbar));
          const b = ZB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
          return n(Math.ceil((a + b) ** 2 / (p2 - p1) ** 2));
        },
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- multimodal: the two published image formulas at 1536x1024
  imgtok: {
    page: "multimodal.html",
    facts: [
      {
        name: "Anthropic w×h/750 at 1536×1024",
        want: () => n(Math.round((1536 * 1024) / 750)),
        has: (t, w) => t.includes(w),
      },
      {
        // The page text is read with runs of whitespace collapsed to one
        // space, so the expectation is written that way too.
        name: "OpenAI resize then tile count",
        want: () => {
          const { w, h, tiles } = openaiTiles(1536, 1024);
          return `${w}×${h} → ${tiles} tiles`;
        },
        has: (t, w) => t.includes(w),
      },
      {
        name: "OpenAI 85 base + 170 per tile",
        want: () => n(85 + 170 * openaiTiles(1536, 1024).tiles),
        has: (t, w) => t.includes(w),
      },
    ],
  },

  // --- distillation-and-pruning: the page's sharpest claim, pinned
  sparsity: {
    page: "distillation-and-pruning.html",
    facts: [
      {
        name: "90% unstructured sparsity stored densely runs at 1.00×",
        want: () => "1.00×",
        has: (t, w) => t.includes(w),
      },
      {
        name: "and the memory does not shrink either (7B × 2 bytes = 14.0 GB both ways)",
        want: () => `${((7e9 * 2) / 1e9).toFixed(1)} GB`,
        // dense and as-stored are both 14.0 GB, so it must appear twice
        has: (t, w) => t.split(w).length - 1 >= 2,
      },
      { name: "speed gained is +0%", want: () => "+0%", has: (t, w) => t.includes(w) },
    ],
  },

  // --- system-design-walkthroughs: the back-of-envelope
  capacity: {
    page: "system-design-walkthroughs.html",
    facts: [
      {
        name: "average write QPS = DAU × writes ÷ 86400",
        want: () => n(Math.round((2000000 * 12) / 86400)),
        has: (t, w) => t.includes(w),
      },
      {
        name: "peak write QPS at 3× average",
        want: () => n(Math.round(((2000000 * 12) / 86400) * 3)),
        has: (t, w) => t.includes(w),
      },
    ],
  },
};

/** Standard normal CDF, Abramowitz & Stegun 26.2.17. |error| < 7.5e-8. */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 +
    t * (-1.821255978 + t * 1.330274429))));
  return Math.min(1, Math.max(0, z > 0 ? 1 - tail : tail));
}

/**
 * The two-proportion test behind the gate: a pooled z for the p-value and a
 * Wald interval on the difference, at 90% baseline against 89% observed.
 */
function gateStats(items, basePct = 90, obsPct = 89, zc = 1.959964) {
  const x0 = Math.round((basePct / 100) * items);
  const x1 = Math.round((obsPct / 100) * items);
  const p0 = x0 / items, p1 = x1 / items, d = p1 - p0;
  const pool = (x0 + x1) / (2 * items);
  const sePool = Math.sqrt((2 * pool * (1 - pool)) / items);
  const z = sePool > 0 ? d / sePool : 0;
  const seDiff = Math.sqrt((p0 * (1 - p0)) / items + (p1 * (1 - p1)) / items);
  return {
    d,
    pval: Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))),
    lo: d - zc * seDiff,
    hi: d + zc * seDiff,
  };
}

/**
 * Fixed-window chunking over the lab's default document: a window of C
 * characters advancing by C−O, with the last window clipped to the end.
 * Duplication is characters stored divided by characters of source.
 */
const CHUNK_DOC =
  "The maximum operating temperature is 810 °C. Above this, the seal " +
  "degrades within hours and the unit must be taken offline.\n\n" +
  "Inspection is quarterly. Replace the seal if any discolouration is " +
  "visible around the flange. The log stays with the unit for its whole " +
  "service life.";

function chunkFixed(C, O) {
  const N = CHUNK_DOC.length;
  const step = Math.max(10, C - O);
  let stored = 0, count = 0;
  for (let q = 0; q < N; q += step) {
    stored += Math.min(N, q + C) - q;
    count++;
    if (q + C >= N) break;
  }
  return { count, dup: stored / N, chars: N };
}

/**
 * Byte-pair encoding, trained on the lab's default corpus and used to encode
 * its default test string. Written from the algorithm: start from characters
 * plus an end-of-word marker, repeatedly merge the most frequent adjacent
 * pair, stop when nothing occurs twice.
 */
const BPE_CORPUS = "the cat sat on the mat. the cat ate the rat. that cat is a fat cat.";
const BPE_TEST = "the fat cat sat";

function runBpe(maxMerges) {
  let vocab = new Map();
  for (const w of BPE_CORPUS.toLowerCase().match(/\S+/g)) {
    const key = w.split("").join(" ") + " </w>";
    vocab.set(key, (vocab.get(key) || 0) + 1);
  }
  const merges = [];
  for (let step = 0; step < maxMerges; step++) {
    const pairs = new Map();
    for (const [word, count] of vocab) {
      const sym = word.split(" ");
      for (let i = 0; i < sym.length - 1; i++) {
        const p = `${sym[i]} ${sym[i + 1]}`;
        pairs.set(p, (pairs.get(p) || 0) + count);
      }
    }
    let best = null, bestN = 0;
    for (const [p, c] of pairs) if (c > bestN) { bestN = c; best = p; }
    if (!best || bestN < 2) break;
    merges.push(best);
    const joined = best.replace(" ", "");
    const next = new Map();
    for (const [word, count] of vocab) {
      const nw = ` ${word} `.split(` ${best} `).join(` ${joined} `).trim();
      next.set(nw, (next.get(nw) || 0) + count);
    }
    vocab = next;
  }

  let tokens = 0;
  for (const w of BPE_TEST.toLowerCase().match(/\S+/g)) {
    const sym = w.split("").concat(["</w>"]);
    for (const pair of merges) {
      const [a, b] = pair.split(" ");
      for (let i = 0; i < sym.length - 1; i++) {
        if (sym[i] === a && sym[i + 1] === b) { sym.splice(i, 2, a + b); i--; }
      }
    }
    tokens += sym.length;
  }
  return { tokens, merges: merges.length };
}

/**
 * One decoding step over the lab's fixed logits: softmax at temperature,
 * then top-k, then top-p (keeping the token that crosses p), then min-p as a
 * fraction of the peak. Written from the definitions, in that order.
 */
const SAMPLER_LOGITS = {
  open: [3.2, 2.85, 2.6, 1.9, 1.65, 1.3, 0.95, 0.6, 0.2, -0.3, -0.85, -2.4],
  sure: [9.1, 3.2, 2.4, 2.1, 1.6, 1.4, 1.1, 0.8, 0.4, 0.1, -0.6, -2.1],
};

function sampleStep(step = "open", T = 1, K = 10, P = 0.95, M = 0.08) {
  const L = SAMPLER_LOGITS[step];
  const n = L.length;
  const best = L.indexOf(Math.max(...L));
  const entropy = (ps) => {
    let hh = 0;
    for (const p of ps) if (p > 0) hh -= p * Math.log2(p);
    return hh;
  };

  let p0;
  if (T <= 0) {
    p0 = L.map((_, i) => (i === best ? 1 : 0));
  } else {
    const ex = L.map((v) => Math.exp((v - L[best]) / T));
    const s = ex.reduce((a, v) => a + v, 0);
    p0 = ex.map((v) => v / s);
  }

  const order = [...L.keys()].sort((a, b) => p0[b] - p0[a] || L[b] - L[a] || a - b);
  const cut = new Array(n).fill(false);
  if (T <= 0) for (let i = 1; i < n; i++) cut[order[i]] = true;
  for (let i = K; i < n; i++) cut[order[i]] = true;

  let kMass = 0;
  for (let i = 0; i < n; i++) if (!cut[i]) kMass += p0[i];
  if (P < 1 && kMass > 0) {
    let cum = 0, full = false;
    for (const id of order) {
      if (cut[id]) continue;
      if (full) { cut[id] = true; continue; }
      cum += p0[id] / kMass;
      if (cum >= P) full = true;            // keep the token that CROSSES p
    }
  }
  const thr = M * p0[order[0]];
  for (let i = 0; i < n; i++) if (!cut[i] && p0[i] < thr) cut[i] = true;

  const survivors = p0.filter((_, i) => !cut[i]);
  const mass = survivors.reduce((a, v) => a + v, 0);
  return {
    kept: survivors.length,
    entropyBefore: entropy(p0),
    entropyAfter: mass ? entropy(survivors.map((v) => v / mass)) : 0,
  };
}

/**
 * Paged vs contiguous allocation over the lab's default queue. Paged takes
 * ceil(tokens/block) blocks; contiguous reserves max_seq_len per request
 * whether it is used or not. Both get the same 2048-slot pool.
 */
const PAGED_REQS = [37, 250, 8, 512, 96, 140, 61, 200, 19, 430];

function pagedAlloc(block = 16, pool = 2048, maxSeq = 512) {
  const valid = PAGED_REQS.filter((t) => t <= maxSeq);
  const poolBlocks = Math.floor(pool / block);
  let used = 0, admitted = 0, live = 0;
  for (const t of valid) {
    const need = Math.ceil(t / block);
    if (used + need > poolBlocks) break;
    used += need; admitted++; live += t;
  }
  const committed = used * block;
  const contigAdmit = Math.min(valid.length, Math.floor(pool / maxSeq));
  const contigLive = valid.slice(0, contigAdmit).reduce((a, t) => a + t, 0);
  return {
    pagedAdmit: admitted,
    contigAdmit,
    pagedUtil: committed ? live / committed : 0,
    contigUtil: contigAdmit ? contigLive / (contigAdmit * maxSeq) : 0,
    waste: committed - live,
    admitted,
  };
}

/**
 * The lab's recall model, stated as a formula rather than copied:
 *   shrink = 1 / (1 + decay · doublings past the trained length)
 *   dip    = min(1, severity · (2 − shrink))        // deepens with length
 *   recall = shrink · (1 − dip · sin(π · depth))    // sin is 0 at both ends
 * Defaults: trained at 8k, severity 0.55, decay 0.20.
 */
function needleRecall(len, depth, severity = 0.55, decay = 0.2, trained = 8192) {
  const doublings = Math.max(0, Math.log(len / trained) / Math.LN2);
  const shrink = 1 / (1 + decay * doublings);
  const dip = Math.min(1, severity * (2 - shrink));
  let w = Math.sin(Math.PI * depth);
  if (!(w > 1e-12)) w = 0;                 // sin(π) is 1.2e-16, not 0
  return Math.min(1, Math.max(0, shrink * (1 - dip * w)));
}

/**
 * How much of prompt B a chained prefix cache can serve. Derived from token
 * equality alone: identical prefixes hash identically under any chained hash,
 * so the leading hit count depends only on where the two prompts first differ
 * and the block size. That makes this independent of the lab's hash function
 * rather than a transcription of it.
 */
const PREFIX_A = "You are a support agent for Acme Cloud. Always cite the policy section. " +
  "Never invent prices. --- Question: how do I rotate an API key for tenant 42?";
const PREFIX_B = "You are a support agent for Acme Cloud. Always cite the policy section. " +
  "Never invent prices. --- Question: how do I revoke an API key for tenant 42?";

function prefixHit(blockSize) {
  const a = PREFIX_A.match(/\S+/g), b = PREFIX_B.match(/\S+/g);
  let firstDiff = 0;
  while (firstDiff < a.length && firstDiff < b.length && a[firstDiff] === b[firstDiff]) firstDiff++;
  const blocks = Math.ceil(a.length / blockSize);
  // A block counts only when both sides have a full one, as the lab requires.
  let hit = 0;
  while (
    (hit + 1) * blockSize <= firstDiff &&
    (hit + 1) * blockSize <= a.length &&
    (hit + 1) * blockSize <= b.length
  ) hit++;
  return { hit, blocks, firstDiff };
}

/**
 * LoRA shapes, from the Llama-2 architecture the lab models: an untied
 * lm_head, four square attention projections, and a 3-matrix MLP whose width
 * is 8d/3 rounded up to a multiple of 256.
 */
const LORA_VOCAB = 32000;
const mlpWidth = (d) => Math.ceil(Math.ceil((8 * d) / 3) / 256) * 256;

function loraBase(d, L) {
  const m = mlpWidth(d);
  return 2 * LORA_VOCAB * d + L * (4 * d * d + 3 * d * m + 2 * d) + d;
}

function loraTrain(d, L, r, names) {
  const m = mlpWidth(d);
  const shape = (name) =>
    name === "gate" || name === "up" ? [m, d] : name === "down" ? [d, m] : [d, d];
  return L * names.reduce((s, name) => {
    const [a, b] = shape(name);
    return s + r * (a + b);
  }, 0);
}

/**
 * The affine quantizer, from the definition rather than the lab's code:
 *   scale = (max − min) / qmax     with 0 forced into the range
 *   zp    = round(−min / scale)
 *   q     = clamp(round(w/scale) + zp, 0, qmax)
 *   ŵ     = scale · (q − zp)
 * `blockSize` of 16 is per-tensor for this vector; `drop` removes the outlier.
 */
const QUANT_WEIGHTS = [
  0.12, -0.35, 0.44, -0.08, 0.21, -0.51, 0.33, 9.2,
  -0.17, 0.06, 0.29, -0.42, 0.15, -0.23, 0.38, -0.11,
];

function runQuantize(bits, blockSize, drop = false) {
  const vals = drop ? QUANT_WEIGHTS.filter((v) => v !== 9.2) : QUANT_WEIGHTS.slice();
  const qmax = 2 ** bits - 1;
  const deq = [];
  for (let s = 0; s < vals.length; s += blockSize) {
    const seg = vals.slice(s, s + blockSize);
    const mn = Math.min(0, ...seg), mx = Math.max(0, ...seg);
    let scale = (mx - mn) / qmax;
    if (!(scale > 0)) scale = 1;
    const zp = Math.min(qmax, Math.max(0, Math.round(-mn / scale)));
    for (const w of seg) {
      const q = Math.min(qmax, Math.max(0, Math.round(w / scale) + zp));
      deq.push(scale * (q - zp));
    }
  }
  let sq = 0, dead = 0;
  for (let i = 0; i < vals.length; i++) {
    const e = vals[i] - deq[i];
    sq += e * e;
    if (vals[i] !== 0 && deq[i] === 0) dead++;
  }
  return { rmse: Math.sqrt(sq / vals.length), dead, n: vals.length };
}

/**
 * The roofline for one decode step: read every weight once, do 2 FLOPs per
 * parameter per sequence. Defaults are an 8B bf16 model on an H100 SXM
 * (3350 GB/s, 990 TFLOP/s dense) at batch 1.
 */
function computeRoofline(params = 8e9, bytesPerWeight = 2, batch = 1, bwGBs = 3350, flopsTFs = 990) {
  const bytes = params * bytesPerWeight;
  const flop = 2 * params * batch;
  const BW = bwGBs * 1e9, FL = flopsTFs * 1e12;
  const memTime = bytes / BW, compTime = flop / FL;
  const slowest = Math.max(memTime, compTime);
  return {
    bytes,
    intensity: flop / bytes,
    balance: FL / BW,
    bound: memTime >= compTime ? "memory" : "compute",
    util: (compTime / slowest) * 100,
    tps: batch / slowest,
    crossover: Math.max(1, Math.ceil(FL / BW / 2)),
  };
}

/**
 * BM25 over the lab's default corpus, from the textbook formula:
 *   idf  = ln(1 + (N − df + 0.5) / (df + 0.5))
 *   score = Σ idf · f(k1+1) / (f + k1(1 − b + b·|D|/avgdl))
 * Independent of the lab's implementation, so a slipped term shows up.
 */
const BM25_DOCS = [
  "the cat sat on the mat",
  "cat cat cat cat cat cat cat cat",
  "the dog chased the cat around the garden while the mat stayed rolled up in the hall cupboard for weeks",
  "the mat is a flat piece of woven fabric",
  "the dog barked at the postman",
  "the weather forecast for the weekend is dry",
];

function scoreBm25(k1, b) {
  const tok = (s) => s.toLowerCase().match(/[0-9a-z]+/g) || [];
  const docs = BM25_DOCS.map((text, i) => {
    const t = tok(text);
    const tf = {};
    for (const w of t) tf[w] = (tf[w] || 0) + 1;
    return { n: i + 1, tf, len: t.length };
  });
  const N = docs.length;
  const avgdl = docs.reduce((a, d) => a + d.len, 0) / N;
  const terms = [...new Set(tok("the cat mat"))];
  const idf = {};
  for (const w of terms) {
    const df = docs.filter((d) => d.tf[w]).length;
    idf[w] = Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }
  return docs
    .map((d) => {
      const K = k1 * (1 - b + (b * d.len) / avgdl);
      let score = 0;
      for (const w of terms) {
        const f = d.tf[w] || 0;
        if (f) score += ((f * (k1 + 1)) / (f + K)) * idf[w];
      }
      return { n: d.n, score };
    })
    .sort((a, c) => c.score - a.score);
}

/** PSI over the lab's two default samples, binned into 5 equal-count buckets. */
function computePsi() {
  const nums = (s) => s.split(/\s+/).map(Number).filter(Number.isFinite);
  const B = nums("12 15 14 13 16 11 14 15 13 12 14 16 15 13 14 12 15 14 13 16 14 15 13 14 12 16 15 14 13 15");
  const C = nums("14 17 16 15 18 14 17 19 16 15 18 20 17 16 19 15 18 17 16 21 18 17 16 19 15 20 18 17 16 19");
  const k = 5;
  const sorted = B.slice().sort((x, y) => x - y);
  const edges = [];
  for (let i = 1; i < k; i++) edges.push(sorted[Math.floor((i / k) * sorted.length)]);
  const bin = (v) => {
    for (let j = 0; j < edges.length; j++) if (v < edges[j]) return j;
    return k - 1;
  };
  const bc = Array(k).fill(0), cc = Array(k).fill(0);
  for (const v of B) bc[bin(v)]++;
  for (const v of C) cc[bin(v)]++;
  let total = 0;
  for (let i = 0; i < k; i++) {
    const pb = Math.max(bc[i] / B.length, 1e-4);
    const pc = Math.max(cc[i] / C.length, 1e-4);
    total += (pc - pb) * Math.log(pc / pb);
  }
  return { total, nB: B.length, nC: C.length };
}

/**
 * The three eviction policies over the lab's default trace. This is a
 * reimplementation rather than a cross-check -- there is no second way to
 * define LRU -- so its value is catching a behaviour change in a refactor,
 * not catching a wrong formula.
 */
const CACHE_TRACE = "a b c a b c a b c d e f g h i a b c a b c j k l a b c".split(" ");

function runCache(cap) {
  const one = (policy) => {
    const store = [], freq = {};
    let hits = 0;
    for (const key of CACHE_TRACE) {
      const at = store.indexOf(key);
      if (at >= 0) {
        hits++;
        if (policy === "lru") { store.splice(at, 1); store.push(key); }
        freq[key] = (freq[key] || 0) + 1;
        continue;
      }
      freq[key] = (freq[key] || 0) + 1;
      if (store.length >= cap) {
        if (policy === "lfu") {
          let worst = 0;
          for (let j = 1; j < store.length; j++) {
            if ((freq[store[j]] || 0) < (freq[store[worst]] || 0)) worst = j;
          }
          store.splice(worst, 1);
        } else store.shift();           // FIFO and LRU both drop the front
      }
      store.push(key);
    }
    return hits / CACHE_TRACE.length;
  };
  return [
    { name: "LRU", rate: one("lru") },
    { name: "LFU", rate: one("lfu") },
    { name: "FIFO", rate: one("fifo") },
  ];
}

/** Jaccard over character shingles for every pair, then union-find grouping. */
const DEDUP_LINES = [
  "How do I reset my password?",
  "How can I reset my password?",
  "How do I reset the password?",
  "What is the refund policy?",
  "Can you explain the refund policy?",
  "My order has not arrived yet",
  "Where is my order, it has not arrived",
  "How do I change my email address?",
];

function runDedup(threshold, k) {
  const shingle = (s) => {
    const t = s.toLowerCase().replace(/\s+/g, " ").trim();
    const set = new Set();
    for (let i = 0; i + k <= t.length; i++) set.add(t.slice(i, i + k));
    return set;
  };
  const sets = DEDUP_LINES.map(shingle);
  const parent = DEDUP_LINES.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  let dupPairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      let inter = 0;
      for (const g of sets[i]) if (sets[j].has(g)) inter++;
      const union = sets[i].size + sets[j].size - inter;
      if (union && inter / union >= threshold) {
        dupPairs++;
        const a = find(i), b = find(j);
        if (a !== b) parent[a] = b;
      }
    }
  }
  const roots = new Set(DEDUP_LINES.map((_, i) => find(i)));
  return { groups: roots.size, lines: DEDUP_LINES.length, dupPairs };
}

/**
 * OpenAI's image tiling: fit 2048 on the long side, then 768 on the short,
 * then count 512px tiles. Reimplemented from the published rule so a changed
 * threshold in the lab shows up as a disagreement.
 */
function openaiTiles(width, height) {
  let w = width, h = height;
  if (Math.max(w, h) > 2048) {
    const s = 2048 / Math.max(w, h);
    w = Math.round(w * s); h = Math.round(h * s);
  }
  if (Math.min(w, h) > 768) {
    const s = 768 / Math.min(w, h);
    w = Math.round(w * s); h = Math.round(h * s);
  }
  return { w, h, tiles: Math.ceil(w / 512) * Math.ceil(h / 512) };
}

/**
 * Wilson score interval for a proportion, at two-sided 95%. Written from the
 * formula rather than lifted from the lab, so a changed z or a slipped term
 * makes the two disagree. The normal approximation is wrong at the sample
 * sizes eval sets actually run at, which is the lab's point.
 */
function wilson(k, total) {
  const p = k / total, z = 1.959964, z2 = z * z;
  const d = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / d;
  const half = (z / d) * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** The critpath default pipeline, solved here so the lab has something to disagree with. */
function solveDag() {
  const S = {
    classify: [120, []], embed: [180, []], retrieve: [240, ["embed"]],
    "web-search": [900, ["classify"]], rerank: [160, ["retrieve"]],
    "expand-query": [140, ["classify"]], retrieve2: [240, ["expand-query"]],
    merge: [40, ["rerank", "retrieve2", "web-search"]],
    generate: [800, ["merge"]], guardrail: [110, ["generate"]],
  };
  const fin = {};
  const visit = (k) => {
    if (fin[k] !== undefined) return fin[k];
    const [d, deps] = S[k];
    return (fin[k] = (deps.length ? Math.max(...deps.map(visit)) : 0) + d);
  };
  Object.keys(S).forEach(visit);
  return {
    makespan: Math.max(...Object.values(fin)),
    seq: Object.values(S).reduce((a, [d]) => a + d, 0),
  };
}

// -- which page is each lab fenced on --------------------------------------
// Looked up rather than hardcoded, so moving a lab to another page does not
// need an edit here. An entry may still pin `page` explicitly.
const fencedOn = new Map();
for (const file of readdirSync(CONTENT).filter((f) => f.endsWith(".md"))) {
  const lines = readFileSync(join(CONTENT, file), "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "```lab" && lines[i + 1]) {
      fencedOn.set(lines[i + 1].trim(), file.replace(/\.md$/, ".html"));
    }
  }
}

// -- run --------------------------------------------------------------------
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const names = Object.keys(FACTS).filter((k) => !only.length || only.includes(k));
if (!names.length) {
  console.error(`No lab with facts matched: ${only.join(", ")}`);
  process.exit(1);
}

const browser = await launch();
const page = await browser.newPage();
const failures = [];
let checked = 0;

for (const lab of names) {
  const { facts } = FACTS[lab];
  const file = FACTS[lab].page || fencedOn.get(lab);
  if (!file) {
    console.error(`${lab.padEnd(12)} NO FENCE — nothing in content/ mounts this lab`);
    failures.push(lab);
    continue;
  }
  if (!existsSync(join(DOCS, file))) {
    console.error(`${lab.padEnd(12)} docs/${file} missing — run 'npm run build' first.`);
    failures.push(lab);
    continue;
  }
  await page.goto(pathToFileURL(join(DOCS, file)).href, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 400));
  const text = await page.evaluate((l) => {
    const host = document.querySelector(`.lab[data-lab="${l}"]`);
    return host ? host.querySelector(".lab__out").textContent.replace(/\s+/g, " ") : null;
  }, lab);

  if (text === null) {
    console.error(`${lab.padEnd(12)} NOT ON PAGE (docs/${file})`);
    failures.push(lab);
    continue;
  }

  for (const f of facts) {
    checked++;
    let want, ok, err = "";
    try {
      want = f.want();
      ok = f.has(text, want);
    } catch (e) {
      ok = false;
      err = `  (${e.message})`;
    }
    if (ok) {
      console.log(`${lab.padEnd(12)} ok     ${f.name}`);
    } else {
      console.error(`${lab.padEnd(12)} WRONG  ${f.name}${err}`);
      console.error(`${" ".repeat(19)}expected to find: ${want}`);
      console.error(`${" ".repeat(19)}in: ${text.slice(0, 140)}`);
      failures.push(`${lab}: ${f.name}`);
    }
  }
}

await browser.close();

// Which labs have no pinned arithmetic. Not a failure — most labs have
// nothing numeric worth pinning — but worth printing so "the labs are
// checked" never gets read as "every lab's maths is checked".
const allLabs = new Set();
for (const file of readdirSync(CONTENT).filter((f) => f.endsWith(".md"))) {
  const lines = readFileSync(join(CONTENT, file), "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "```lab" && lines[i + 1]) allLabs.add(lines[i + 1].trim());
  }
}
const unpinned = [...allLabs].filter((l) => !FACTS[l]).sort();

console.log(`\n${allLabs.size - unpinned.length}/${allLabs.size} labs have pinned arithmetic.`);
if (unpinned.length) console.log(`no facts yet: ${unpinned.join(", ")}`);

if (failures.length) {
  console.error(`\nFAILED — ${failures.length} of ${checked} fact(s) wrong`);
  process.exit(1);
}
console.log(`ok — ${checked} fact(s) verified`);
