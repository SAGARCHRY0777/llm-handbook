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
