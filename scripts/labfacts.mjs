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
  const { page: file, facts } = FACTS[lab];
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
