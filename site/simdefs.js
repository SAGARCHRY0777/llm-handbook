/**
 * simdefs.js — the simulations themselves. The player lives in sims.js.
 *
 * Each definition registers into window.__SIMS and is drawn with the helper
 * exposed as window.__SIM_D. Definitions are independent blocks: adding a new
 * sim never touches an existing one, and never touches the build.
 *
 * The rule, inherited from labs.js and one dimension harder here:
 *   THE FRAMES MUST BE THE REAL MECHANISM, IN THE REAL ORDER.
 * Every number on screen is computed from a stated configuration, not typed in
 * to look plausible. If a mechanism has no genuine time axis, it gets a lab
 * instead — a fake timeline over a static formula teaches motion that is not
 * there.
 */
(function () {
  "use strict";
  var S = window.__SIMS;
  if (!S) return;

  // ======================================================================
  // SIM · kvcache  (kv-cache.md)
  // The cache filling token by token, against the recompute it replaces.
  // Config is a real GQA model shape; every MiB below comes from the formula
  //   bytes/token = 2 (K and V) x layers x kv_heads x head_dim x dtype_bytes
  // = 2 x 32 x 8 x 128 x 2 = 131,072 B = 128 KiB per token. Nothing rounded
  // into place: the figures are recomputed here the same way the page states.
  // ======================================================================
  var L = 32, KVH = 8, HD = 128, DT = 2;
  var BYTES_PER_TOK = 2 * L * KVH * HD * DT;          // 131,072
  var KIB_PER_TOK = BYTES_PER_TOK / 1024;             // 128
  var PROMPT = 8;
  var SHAPE = L + " layers · " + KVH + " KV heads · d_head " + HD + " · fp16";

  function mib(tokens) { return (tokens * KIB_PER_TOK) / 1024; }

  // --- scenario 1: the cache fills -------------------------------------
  function growth() {
    var steps = [{
      caption: "Empty cache. The prompt has not been read yet — press Play.",
      tok: 0, newTok: 0, passes: 0, mode: "grow",
    }];
    steps.push({
      caption: "<b>Prefill.</b> All " + PROMPT + " prompt tokens go through the model once, " +
        "in parallel. Every layer writes its K and V for every token — that is " +
        PROMPT + " × " + KIB_PER_TOK + " KiB = <b>" + mib(PROMPT).toFixed(2) + " MiB</b> of cache " +
        "bought with one forward pass.",
      tok: PROMPT, newTok: PROMPT, passes: PROMPT, mode: "grow", flag: "ok",
    });
    for (var t = 1; t <= 6; t++) {
      var tok = PROMPT + t;
      steps.push({
        caption: "<b>Decode step " + t + ".</b> One new token. Only <i>its</i> K and V are " +
          "computed and appended — " + KIB_PER_TOK + " KiB. The other " + (tok - 1) +
          " tokens are read straight from the cache, never recomputed.",
        tok: tok, newTok: 1, passes: PROMPT + t, mode: "grow",
        flag: t >= 5 ? "warn" : "ok",
      });
    }
    steps[steps.length - 1].caption =
      "<b>Done.</b> " + (PROMPT + 6) + " tokens cached, <b>" + mib(PROMPT + 6).toFixed(2) +
      " MiB</b>, built from " + (PROMPT + 6) + " token-passes. The cache grew <i>linearly</i> — " +
      "and it will keep growing for as long as the sequence does. That growth is the whole " +
      "reason the rest of this page exists.";
    return { id: "grow", label: "Cache growth", steps: steps };
  }

  // --- scenario 2: what it costs to not have one ------------------------
  function recompute() {
    var steps = [{
      caption: "Same model, cache switched off. Watch what each new token now costs.",
      tok: 0, newTok: 0, passes: 0, mode: "recompute",
    }];
    var cum = PROMPT;
    steps.push({
      caption: "<b>Prefill.</b> " + PROMPT + " tokens processed. Identical so far — the " +
        "first pass has to happen either way.",
      tok: PROMPT, newTok: PROMPT, passes: cum, mode: "recompute", flag: "ok",
    });
    for (var t = 1; t <= 6; t++) {
      var tok = PROMPT + t;
      cum += tok;
      steps.push({
        caption: "<b>Decode step " + t + ".</b> With no cache there is nothing to read back, " +
          "so all <b>" + tok + "</b> tokens are pushed through all " + L + " layers again just to " +
          "produce one. Token-passes so far: <b>" + cum + "</b> against " + (PROMPT + t) +
          " with a cache.",
        tok: tok, newTok: tok, passes: cum, mode: "recompute",
        flag: t >= 3 ? "bad" : "warn",
      });
    }
    steps[steps.length - 1].caption =
      "<b>" + cum + " token-passes against " + (PROMPT + 6) + ".</b> " +
      (cum / (PROMPT + 6)).toFixed(1) + "× the compute for the same 6 tokens — and the ratio " +
      "widens with every step, because recompute is quadratic in sequence length where the " +
      "cache is linear. You are trading memory for that curve.";
    return { id: "recompute", label: "No cache (recompute)", steps: steps };
  }

  // --- scenario 3: capping it with a window -----------------------------
  function window_() {
    var W = 8;
    var steps = [{
      caption: "Same generation, but the cache is capped at a sliding window of " + W +
        " tokens. Memory stops growing — the question is what that costs.",
      tok: 0, newTok: 0, passes: 0, mode: "window", win: W, evicted: 0,
    }];
    steps.push({
      caption: "<b>Prefill.</b> " + PROMPT + " tokens, exactly filling the window.",
      tok: PROMPT, newTok: PROMPT, passes: PROMPT, mode: "window", win: W, evicted: 0, flag: "ok",
    });
    for (var t = 1; t <= 6; t++) {
      var total = PROMPT + t;
      var ev = Math.max(0, total - W);
      steps.push({
        caption: "<b>Decode step " + t + ".</b> Token " + total + " is appended and the oldest " +
          "entry is dropped. Cache holds <b>" + Math.min(total, W) + "</b> tokens — flat at <b>" +
          mib(W).toFixed(2) + " MiB</b> — but <b>" + ev + "</b> " +
          (ev === 1 ? "token is" : "tokens are") + " now unreachable. Attention cannot see what " +
          "was evicted.",
        tok: total, newTok: 1, passes: total, mode: "window", win: W, evicted: ev,
        flag: ev > 3 ? "bad" : ev > 0 ? "warn" : "ok",
      });
    }
    steps[steps.length - 1].caption =
      "<b>Memory is bounded; the context is not intact.</b> The cache sat at " +
      mib(W).toFixed(2) + " MiB instead of climbing to " + mib(PROMPT + 6).toFixed(2) +
      " MiB, and 6 of the earliest tokens — including the start of the prompt — are gone. " +
      "Dropping the very first tokens is unusually destructive, which is the finding behind " +
      "<i>attention sinks</i>: keep the first few, slide the rest.";
    return { id: "window", label: "Sliding window", steps: steps };
  }

  S["kvcache"] = {
    title: "Watch the KV cache fill, and price the alternative",
    note: "Three runs of the same " + PROMPT + "-token prompt on a " + SHAPE +
      " model. Every figure is computed from that shape, not typed in: at " +
      "2 × layers × KV-heads × head_dim × 2 bytes, one token costs exactly <b>" +
      KIB_PER_TOK + " KiB</b> of cache. Compare the tabs — the cache is not an optimisation " +
      "you add, it is the thing that makes decoding linear instead of quadratic.",
    interval: 1250,
    scenarios: [growth(), recompute(), window_()],

    draw: function (step, d, ctx) {
      var cached = step.mode === "window" ? Math.min(step.tok, step.win) : step.tok;
      var mem = mib(cached);
      var cap = mib(PROMPT + 6);                 // full-run size, used as the gauge scale
      var pct = cap ? (mem / cap) * 100 : 0;

      // one cell per token slot; evicted slots stay visible but greyed
      var cells = [];
      for (var k = 0; k < step.tok; k++) {
        var evicted = step.mode === "window" && k < (step.evicted || 0);
        var fresh = k >= step.tok - step.newTok;
        cells.push({
          label: String(k + 1),
          flag: evicted ? "idle" : fresh ? (step.mode === "recompute" ? "warn" : "ok") : undefined,
          title: evicted
            ? "token " + (k + 1) + " — evicted, no longer attendable"
            : "token " + (k + 1) + " — K and V cached, " + KIB_PER_TOK + " KiB",
        });
      }
      if (!cells.length) cells.push({ label: "—", flag: "idle", title: "cache empty" });

      var recomputing = step.mode === "recompute";
      var nodeFlag = recomputing && step.newTok > 1 ? "bad"
        : step.mode === "window" && step.evicted ? "warn"
        : step.tok ? "ok" : "idle";

      return d.flow([
        d.stack([
          d.big(step.tok || "—", "tokens seen"),
          d.dots({ n: step.newTok, label: "computed this step", flag: recomputing && step.newTok > 1 ? "bad" : undefined }),
        ]),
        d.node({
          title: "KV cache",
          status: step.tok === 0 ? "EMPTY" : recomputing ? "BYPASSED" : "LIVE",
          statusFlag: nodeFlag,
          badge: "fp16",
          meta: SHAPE,
          flag: nodeFlag,
          gauges: [{
            label: "cache memory",
            pct: pct,
            value: mem.toFixed(2) + " MiB",
            flag: step.mode === "window" ? "warn" : step.tok ? "ok" : "idle",
          }],
          body: d.cells(cells, { label: "token slots", dense: step.tok > 10 }),
          rows: [
            { label: "cached tokens", value: String(cached) },
            {
              label: "computed this step",
              value: step.newTok + (step.newTok === 1 ? " token" : " tokens"),
              flag: recomputing && step.newTok > 1 ? "bad" : "ok",
            },
          ],
        }),
        d.stack([
          d.stat({
            label: "token-passes",
            value: String(step.passes),
            sub: "cumulative",
            flag: recomputing && step.passes > PROMPT + 2 ? "bad" : "ok",
          }),
          d.stat({
            label: step.mode === "window" ? "evicted" : "memory",
            value: step.mode === "window"
              ? String(step.evicted || 0)
              : mem.toFixed(2) + " MiB",
            sub: step.mode === "window" ? "unreachable" : String(KIB_PER_TOK) + " KiB/token",
            flag: step.mode === "window" && step.evicted ? "warn" : undefined,
          }),
        ]),
      ]);
    },
  };

  // >>> SPLICED SIMS

  // ====================================================================
  // ======================================================================
  // SIM · agentturn  (agents.md)
  // One frame per iteration of the tool-calling loop, with all four budgets
  // draining underneath it. The page's thesis is that every hard problem in
  // agents is a loop-control problem, so the loop itself is the mechanism and
  // the loop iteration is the time axis.
  //
  // CONFIG — every figure on screen is computed from these. Nothing typed in.
  //   budget        the page's Budget dataclass verbatim:
  //                 max_steps 8 · max_tokens 40,000 · max_seconds 120 · max_cost $0.50
  //   transcript    T0 = 1,000 tok (system prompt + four tool schemas + goal)
  //   model turn    120 tok out for a tool call, 250 tok for the final answer
  //   observations  600 tok tool result · 40 tok ack
  //                 25 tok "400 Bad Request" · 60 tok corrective error
  //   latency       3.0 s per model turn, 2.0 s per EXECUTED tool call
  //                 (a schema-invalid call never reaches the tool, so it costs
  //                  no tool latency — which is why the clock never saves you)
  //   price         frontier tier from numbers-to-know.md, $3/M in, $15/M out
  //                 cost = (in x 3 + out x 15) / 1e6
  //   reliability   0.95 per step, the page's figure; trajectory p = 0.95^steps
  //
  // The per-turn prefill is the WHOLE transcript, re-read every step. That is
  // the page's depth point — prompt growth costs quadratically — and here it is
  // arithmetic rather than a claim: the billed input is the sum of transcript
  // lengths, not the final transcript length.
  // ======================================================================
  var agentturn_MAX_STEPS = 8;
  var agentturn_MAX_TOKENS = 40000;
  var agentturn_MAX_SECONDS = 120;
  var agentturn_MAX_COST = 0.50;

  var agentturn_T0 = 1000;          // system prompt + four tool schemas + goal
  var agentturn_CALL_OUT = 120;     // model output that carries one tool call
  var agentturn_ANSWER_OUT = 250;   // model output for the final answer
  var agentturn_OBS_RESULT = 600;   // a real tool result
  var agentturn_OBS_ACK = 40;       // a write acknowledgement
  var agentturn_OBS_GENERIC = 25;   // "400 Bad Request"
  var agentturn_OBS_FIXABLE = 60;   // the specific, corrective error
  var agentturn_GEN_S = 3.0;
  var agentturn_TOOL_S = 2.0;
  var agentturn_IN_PRICE = 3;       // $ per 1M input tokens
  var agentturn_OUT_PRICE = 15;     // $ per 1M output tokens
  var agentturn_STEP_P = 0.95;      // the page's per-step reliability

  function agentturn_cost(cin, cout) {
    return (cin * agentturn_IN_PRICE + cout * agentturn_OUT_PRICE) / 1e6;
  }
  function agentturn_num(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function agentturn_money(c) { return "$" + c.toFixed(4); }
  function agentturn_pct(part, whole) { return (part / whole) * 100; }
  function agentturn_pctFlag(p) { return p >= 100 ? "bad" : p >= 75 ? "warn" : "ok"; }
  function agentturn_pctTxt(part, whole) { return Math.round(agentturn_pct(part, whole)) + "%"; }

  /**
   * The one accounting engine. Each scenario supplies only the turns — what the
   * model asked for and what came back — and every budget figure is derived
   * here, identically, so the three runs are comparable by construction.
   */
  function agentturn_drive(idleCaption, turns, opts) {
    opts = opts || {};
    var transcript = agentturn_T0;
    var cin = 0, cout = 0, secs = 0;
    var steps = [{
      caption: idleCaption,
      step: 0, prefill: 0, out: 0, obs: 0,
      transcript: transcript, cin: 0, cout: 0, cost: 0, secs: 0,
      tool: "no call yet", call: "waiting for the first model turn",
      verdict: "IDLE", verdictFlag: "idle",
      state: "READY", outcome: "not started", outcomeFlag: "idle",
      rel: opts.rel ? 1 : undefined,
    }];

    for (var k = 0; k < turns.length; k++) {
      var t = turns[k];
      var prefill = transcript;                       // the whole history, again
      var out = t.answer ? agentturn_ANSWER_OUT : agentturn_CALL_OUT;
      cin += prefill;
      cout += out;
      secs += agentturn_GEN_S + (t.exec ? agentturn_TOOL_S : 0);
      transcript += out + (t.obs || 0);

      var n = k + 1;
      // The page's guard runs BEFORE the model call, so a run that used its last
      // step stops on re-entry rather than after the call that used it.
      var stopped = !t.answer && n >= agentturn_MAX_STEPS;
      steps.push({
        caption: "",
        flag: t.flag,
        step: n,
        tool: t.tool, call: t.call,
        verdict: t.verdict, verdictFlag: t.verdictFlag,
        obs: t.obs || 0, obsText: t.obsText, obsFlag: t.obsFlag,
        prefill: prefill, out: out,
        transcript: transcript,
        cin: cin, cout: cout,
        cost: agentturn_cost(cin, cout),
        secs: secs,
        rel: opts.rel ? Math.pow(agentturn_STEP_P, n) : undefined,
        state: t.answer ? "ANSWERED" : stopped ? "BUDGET EXHAUSTED" : "LOOPING",
        stop: stopped ? "step limit (" + agentturn_MAX_STEPS + ")" : null,
        outcome: t.outcome, outcomeFlag: t.outcomeFlag,
      });
    }
    return steps;
  }

  var agentturn_GOAL =
    "Goal: find the seal tolerance for turbine 7, record it on the open work " +
    "order, and close the order.";
  var agentturn_BUDGET_LINE =
    "Budget fresh: " + agentturn_MAX_STEPS + " steps · " +
    agentturn_num(agentturn_MAX_TOKENS) + " tokens · " + agentturn_MAX_SECONDS +
    " s · $" + agentturn_MAX_COST.toFixed(2) + ". Transcript starts at " +
    agentturn_num(agentturn_T0) + " tokens.";

  var agentturn_GEN_TOTAL = null;   // filled by the first scenario, read by the second

  // --- scenario 1: the error message teaches nothing ---------------------
  function agentturn_generic() {
    var BADCALL = 'get_work_orders(date="03/04/25")';
    var turns = [];
    for (var k = 0; k < agentturn_MAX_STEPS; k++) {
      turns.push({
        tool: "get_work_orders",
        call: BADCALL,
        verdict: "REJECTED BY SCHEMA",
        verdictFlag: "bad",
        obs: agentturn_OBS_GENERIC,
        obsText: "400 Bad Request",
        obsFlag: "bad",
        exec: false,                        // validation failed: the tool never ran
        outcome: "0 of 2 facts",
        outcomeFlag: "bad",
        flag: k === 0 ? "warn" : "bad",
      });
    }
    var steps = agentturn_drive(
      agentturn_GOAL + " " + agentturn_BUDGET_LINE +
      " This runtime returns whatever the validator raised.", turns);

    var s;
    s = steps[1];
    s.caption = "<b>Step 1.</b> The model calls <i>get_work_orders</i> with date " +
      "03/04/25. Argument validation fails before the tool runs — the schema wants " +
      "YYYY-MM-DD. The runtime appends what it got: <i>400 Bad Request</i>, " +
      agentturn_OBS_GENERIC + " tokens that name neither the field nor the format.";
    s = steps[2];
    s.caption = "<b>Step 2.</b> The model re-reads the transcript — now " +
      agentturn_num(s.prefill) + " tokens — and finds nothing in it about what was " +
      "wrong. So it makes the identical call. Identical rejection. Note the prefill: " +
      "the entire history is re-processed to produce 120 tokens.";
    s = steps[3];
    s.caption = "<b>Step 3.</b> Third identical call. The transcript now holds three " +
      "copies of the same uninformative string. Run cost " + agentturn_money(s.cost) +
      " — " + agentturn_pctTxt(s.cost, agentturn_MAX_COST) + " of the cost budget. " +
      "A failing loop is <i>cheap</i>, and that is precisely the problem.";
    s = steps[4];
    s.caption = "<b>Step 4.</b> Half the step budget gone. Read the other three " +
      "gauges: tokens " + agentturn_pctTxt(s.cin + s.cout, agentturn_MAX_TOKENS) +
      ", wall clock " + agentturn_pctTxt(s.secs, agentturn_MAX_SECONDS) + ", cost " +
      agentturn_pctTxt(s.cost, agentturn_MAX_COST) + ". Three of the four budgets are " +
      "healthy and the run is already dead.";
    s = steps[5];
    s.caption = "<b>Step 5.</b> The model is not malfunctioning. It is doing the only " +
      "thing the observation supports: the error says a request was bad, not which " +
      "field or what format, so nothing distinguishes attempt 5 from attempt 1.";
    s = steps[6];
    s.caption = "<b>Step 6.</b> A schema-invalid call never reaches the tool, so there " +
      "is no tool latency in this loop at all — each iteration is one model turn, " +
      agentturn_GEN_S.toFixed(1) + " s. Elapsed " + s.secs.toFixed(0) + " s of " +
      agentturn_MAX_SECONDS + ". The wall-clock budget will not save this run either.";
    s = steps[7];
    s.caption = "<b>Step 7.</b> One step left. Nothing in the runtime is broken: " +
      "validation worked, the guard is enforced, the loop is bounded. The single " +
      "defect in the whole system is a " + agentturn_OBS_GENERIC + "-token error string.";
    s = steps[8];
    agentturn_GEN_TOTAL = { tokens: s.cin + s.cout, cost: s.cost };
    s.caption = "<b>Guard fires: " + s.stop + ".</b> Eight identical calls, " +
      agentturn_num(s.cin + s.cout) + " tokens, " + agentturn_money(s.cost) + ", " +
      s.secs.toFixed(0) + " s — and zero facts retrieved. Tokens peaked at " +
      agentturn_pctTxt(s.cin + s.cout, agentturn_MAX_TOKENS) + ", time at " +
      agentturn_pctTxt(s.secs, agentturn_MAX_SECONDS) + ", cost at " +
      agentturn_pctTxt(s.cost, agentturn_MAX_COST) + ": <b>only the step limit ended " +
      "this</b>. A generic error is not a small quality issue — it is the difference " +
      "between a failed step and a successful retry, and here it consumed the run.";
    return { id: "generic", label: "Generic errors", steps: steps };
  }

  // --- scenario 2: the same mistake, an error that teaches ---------------
  function agentturn_corrective() {
    var turns = [
      {
        tool: "get_work_orders", call: 'get_work_orders(date="03/04/25")',
        verdict: "REJECTED BY SCHEMA", verdictFlag: "warn",
        obs: agentturn_OBS_FIXABLE,
        obsText: "invalid date format, expected YYYY-MM-DD, got 03/04/25",
        obsFlag: "warn", exec: false,
        outcome: "0 of 2 facts", outcomeFlag: "warn", flag: "warn",
      },
      {
        tool: "get_work_orders", call: 'get_work_orders(date="2025-04-03")',
        verdict: "EXECUTED", verdictFlag: "ok",
        obs: agentturn_OBS_RESULT, obsText: "1 open order: WO-4471, unit T7",
        obsFlag: "ok", exec: true,
        outcome: "1 of 2 facts", outcomeFlag: "ok", flag: "ok",
      },
      {
        tool: "search_engine_manuals",
        call: 'search_engine_manuals(query="T7 seal tolerance", year_from=2019)',
        verdict: "EXECUTED", verdictFlag: "ok",
        obs: agentturn_OBS_RESULT, obsText: "3 matching sections, 2021 revision",
        obsFlag: "ok", exec: true,
        outcome: "2 of 2 facts", outcomeFlag: "ok", flag: "ok",
      },
      {
        tool: "update_work_order",
        call: 'update_work_order(id="WO-4471", field="tolerance_note")',
        verdict: "REVERSIBLE · EXECUTED", verdictFlag: "ok",
        obs: agentturn_OBS_ACK, obsText: "ok, revision 2", obsFlag: "ok", exec: true,
        outcome: "recorded", outcomeFlag: "ok", flag: "ok",
      },
      {
        tool: "close_work_order", call: 'close_work_order(id="WO-4471")',
        verdict: "IRREVERSIBLE · APPROVED", verdictFlag: "warn",
        obs: agentturn_OBS_ACK, obsText: "approved by user, closed", obsFlag: "ok",
        exec: true,
        outcome: "closed", outcomeFlag: "ok", flag: "warn",
      },
      {
        answer: true, tool: "model turn", call: "no tool calls — final answer",
        verdict: "DONE", verdictFlag: "ok", obs: 0,
        obsText: "status: ok", obsFlag: "ok", exec: false,
        outcome: "goal met", outcomeFlag: "ok", flag: "ok",
      },
    ];
    var steps = agentturn_drive(
      agentturn_GOAL + " " + agentturn_BUDGET_LINE +
      " Identical run to the first tab, with one change: the validator's message " +
      "is passed through in full.", turns);

    var s;
    s = steps[1];
    s.caption = "<b>Step 1.</b> The same first mistake as the other tab, rejected the " +
      "same way. The difference is the observation: <i>expected YYYY-MM-DD, got " +
      "03/04/25</i>. " + agentturn_OBS_FIXABLE + " tokens instead of " +
      agentturn_OBS_GENERIC + " — " + (agentturn_OBS_FIXABLE - agentturn_OBS_GENERIC) +
      " extra tokens, carrying the field, the expected format and the value seen.";
    s = steps[2];
    s.caption = "<b>Step 2.</b> The model reformats and retries. One open order comes " +
      "back, " + agentturn_num(agentturn_OBS_RESULT) + " tokens of it. The failed step " +
      "became a successful retry, which is the entire return on those " +
      (agentturn_OBS_FIXABLE - agentturn_OBS_GENERIC) + " tokens.";
    s = steps[3];
    s.caption = "<b>Step 3.</b> Second tool, no overlap with the first: the manual " +
      "search covers procedures and tolerances and its description says it does " +
      "<i>not</i> cover work orders. Non-overlapping tools are why this selection was " +
      "unambiguous. Prefill is now " + agentturn_num(s.prefill) + " tokens and still " +
      "growing with every observation.";
    s = steps[4];
    s.caption = "<b>Step 4.</b> A write — but a reversible one, so it executes " +
      "directly with a per-tool timeout. " + agentturn_TOOL_S.toFixed(1) + " s of tool " +
      "latency lands on the wall clock; elapsed " + s.secs.toFixed(0) + " s.";
    s = steps[5];
    s.caption = "<b>Step 5.</b> Closing the order is <b>irreversible</b>, so the runtime " +
      "stops and asks a human — gated on reversibility, not on the model's " +
      "confidence. A model that is 99% sure is wrong one time in a hundred, and this " +
      "action has no acceptable failure rate. (The human's own thinking time is not " +
      "on the agent's clock here; in production the wall-clock budget must allow for it.)";
    s = steps[6];
    s.caption = "<b>Step 6.</b> No tool calls in the reply, so the loop returns " +
      "status <i>ok</i> with the answer. Six steps of eight, " +
      agentturn_pctTxt(s.cin + s.cout, agentturn_MAX_TOKENS) + " of the token budget, " +
      agentturn_pctTxt(s.cost, agentturn_MAX_COST) + " of the money.";
    var g = agentturn_GEN_TOTAL;
    steps[6].caption +=
      " <b>Against the generic run: " + agentturn_num(s.cin + s.cout) + " tokens and " +
      agentturn_money(s.cost) + " here, " + agentturn_num(g.tokens) + " and " +
      agentturn_money(g.cost) + " there</b> — the same nickel, and only one of them " +
      "answered. Tool-error quality, not model choice, decided that.";
    return { id: "corrective", label: "Corrective errors", steps: steps };
  }

  // --- scenario 3: nothing is wrong, the task is simply long -------------
  function agentturn_longtask() {
    var calls = [
      ['get_work_orders(date="2025-04-03")', "get_work_orders", "1 order, unit T7"],
      ['get_work_orders(date="2025-04-10")', "get_work_orders", "2 orders, units T7, T9"],
      ['get_work_orders(date="2025-04-17")', "get_work_orders", "1 order, unit T7"],
      ['get_sensor_window(unit="T7", days=14)', "get_sensor_window", "14d vibration series"],
      ['search_engine_manuals(query="T7 seal procedure", year_from=2019)', "search_engine_manuals", "4 sections"],
      ['search_engine_manuals(query="T7 vibration tolerance", year_from=2019)', "search_engine_manuals", "2 sections"],
      ['get_work_orders(date="2025-04-24")', "get_work_orders", "1 order, unit T7"],
      ['get_sensor_window(unit="T9", days=14)', "get_sensor_window", "14d vibration series"],
    ];
    var turns = [];
    for (var k = 0; k < calls.length; k++) {
      turns.push({
        tool: calls[k][1], call: calls[k][0],
        verdict: "EXECUTED", verdictFlag: "ok",
        obs: agentturn_OBS_RESULT, obsText: calls[k][2], obsFlag: "ok", exec: true,
        outcome: (k + 1) + " of 10 sub-steps",
        outcomeFlag: k >= 6 ? "warn" : "ok",
        flag: k >= 6 ? "warn" : "ok",
      });
    }
    var steps = agentturn_drive(
      "New goal: reconcile the maintenance log for turbine 7 across three systems. " +
      "It decomposes into <b>10</b> tool calls. Same budget, same tools, and every " +
      "single call below is valid and succeeds. Trajectory p = 0.95 per step, the " +
      "page's figure.", turns, { rel: true });

    var s;
    s = steps[1];
    s.caption = "<b>Step 1.</b> A clean, valid call with a real result. Trajectory " +
      "probability 0.95<sup>1</sup> = " + s.rel.toFixed(3) + " — the chance that " +
      "everything so far was right.";
    s = steps[2];
    s.caption = "<b>Step 2.</b> Still clean. 0.95<sup>2</sup> = " + s.rel.toFixed(3) +
      ". Prefill this turn is " + agentturn_num(s.prefill) + " tokens: the " +
      agentturn_num(agentturn_OBS_RESULT) + "-token result from step 1 is now part of " +
      "every future prompt.";
    s = steps[3];
    s.caption = "<b>Step 3.</b> 0.95<sup>3</sup> = " + s.rel.toFixed(3) +
      " — the page's <i>0.86 at three steps</i>, recomputed. One step in seven ends " +
      "with the trajectory already wrong, and nothing on any gauge shows it.";
    s = steps[4];
    s.caption = "<b>Step 4.</b> " + s.rel.toFixed(3) + ". Billed input has reached " +
      agentturn_num(s.cin) + " tokens to carry a transcript of only " +
      agentturn_num(s.transcript) + " — the history is re-read every step, so prompt " +
      "growth costs quadratically even though nothing about the model changed.";
    s = steps[5];
    s.caption = "<b>Step 5.</b> 0.95<sup>5</sup> = " + s.rel.toFixed(3) +
      " — the page's <i>0.77 at five steps</i>. Halfway through the task, and the " +
      "likeliest single failure is no longer a bug but accumulated arithmetic.";
    s = steps[6];
    s.caption = "<b>Step 6.</b> " + s.rel.toFixed(3) + ". Token budget at " +
      agentturn_pctTxt(s.cin + s.cout, agentturn_MAX_TOKENS) + " and climbing faster " +
      "than the step count, because each step adds " +
      agentturn_num(agentturn_OBS_RESULT + agentturn_CALL_OUT) + " tokens that every " +
      "later step pays for again.";
    s = steps[7];
    s.caption = "<b>Step 7.</b> " + s.rel.toFixed(3) + ". One step of budget left and " +
      "three sub-steps of work remaining. No error has occurred; the run is simply " +
      "longer than its bound.";
    s = steps[8];
    var p10 = Math.pow(agentturn_STEP_P, 10);
    var p20 = Math.pow(agentturn_STEP_P, 20);
    var seg4 = Math.pow(agentturn_STEP_P, 4), seg3 = Math.pow(agentturn_STEP_P, 3);
    // decomposition: 10 steps as 4+3+3, each segment verified and retried once
    var dec = (1 - Math.pow(1 - seg4, 2)) * Math.pow(1 - Math.pow(1 - seg3, 2), 2);
    s.caption = "<b>Guard fires: " + s.stop + ", two calls short.</b> The runtime " +
      "returns status <i>budget_exhausted</i> with what it did and what remains — the " +
      "flow's node P, which matters as much as the answer. Tokens " +
      agentturn_num(s.cin + s.cout) + " of " + agentturn_num(agentturn_MAX_TOKENS) +
      " (" + agentturn_pctTxt(s.cin + s.cout, agentturn_MAX_TOKENS) + "), of which " +
      agentturn_num(s.cin) + " is re-prefill of a " + agentturn_num(s.transcript) +
      "-token transcript. <b>And raising max_steps to 10 is the wrong fix:</b> " +
      "0.95<sup>10</sup> = " + p10.toFixed(3) + ", 0.95<sup>20</sup> = " +
      p20.toFixed(3) + ". Split the same 10 steps into 4 + 3 + 3 bounded runs with a " +
      "verification checkpoint that catches a bad segment and retries it once, and " +
      "the arithmetic becomes (1 − (1 − 0.95<sup>4</sup>)²)·(1 − (1 − 0.95<sup>3</sup>)²)² = " +
      dec.toFixed(3) + " against " + p10.toFixed(3) + ". Shortening the chain is the " +
      "only lever that moves this number.";
    return { id: "long", label: "The task is long", steps: steps };
  }

  var agentturn_S1 = agentturn_generic();      // runs first: stashes its totals
  var agentturn_S2 = agentturn_corrective();   // reads them for the comparison
  var agentturn_S3 = agentturn_longtask();

  S["agentturn"] = {
    title: "Run the loop until something stops it",
    note: "One goal, one tool set, one budget — the page's <i>Budget</i> dataclass " +
      "exactly: <b>" + agentturn_MAX_STEPS + " steps · " +
      agentturn_num(agentturn_MAX_TOKENS) + " tokens · " + agentturn_MAX_SECONDS +
      " s · $" + agentturn_MAX_COST.toFixed(2) + "</b>. The transcript starts at " +
      agentturn_num(agentturn_T0) + " tokens (system prompt + four tool schemas + " +
      "goal); a tool call costs " + agentturn_CALL_OUT + " output tokens, a tool " +
      "result " + agentturn_OBS_RESULT + ", a corrective error " + agentturn_OBS_FIXABLE +
      ", <i>400 Bad Request</i> " + agentturn_OBS_GENERIC + ". Money is the handbook's " +
      "frontier tier: (in × $" + agentturn_IN_PRICE + " + out × $" + agentturn_OUT_PRICE +
      ") / 1e6. Each turn re-reads the whole transcript, so the billed input is the " +
      "sum of its lengths, not its final length. Three tabs, one loop: what changes " +
      "is the quality of one error message, and the length of the task.",
    interval: 1250,
    scenarios: [agentturn_S1, agentturn_S2, agentturn_S3],

    draw: function (step, d, ctx) {
      var tokens = step.cin + step.cout;
      var pStep = agentturn_pct(step.step, agentturn_MAX_STEPS);
      var pTok = agentturn_pct(tokens, agentturn_MAX_TOKENS);
      var pSec = agentturn_pct(step.secs, agentturn_MAX_SECONDS);
      var pCost = agentturn_pct(step.cost, agentturn_MAX_COST);

      var stateFlag = step.state === "ANSWERED" ? "ok"
        : step.state === "BUDGET EXHAUSTED" ? "bad"
        : step.step ? "warn" : "idle";

      var col1 = d.stack([
        d.big(step.step ? String(step.step) : "—", "loop step"),
        d.stat({
          label: "progress",
          value: step.outcome,
          sub: step.stop || (step.state === "ANSWERED" ? "status: ok" : "in the loop"),
          flag: step.outcomeFlag,
        }),
      ]);

      var runtime = d.node({
        title: "Agent runtime",
        status: step.state,
        statusFlag: stateFlag,
        badge: "bounded loop",
        meta: "guard runs before every model call",
        flag: stateFlag,
        gauges: [
          {
            label: "steps", pct: pStep,
            value: step.step + " / " + agentturn_MAX_STEPS,
            flag: agentturn_pctFlag(pStep),
          },
          {
            label: "tokens", pct: pTok,
            value: agentturn_num(tokens) + " / " + agentturn_num(agentturn_MAX_TOKENS),
            flag: agentturn_pctFlag(pTok),
          },
          {
            label: "wall clock", pct: pSec,
            value: step.secs.toFixed(0) + "s / " + agentturn_MAX_SECONDS + "s",
            flag: agentturn_pctFlag(pSec),
          },
          {
            label: "cost", pct: pCost,
            value: agentturn_money(step.cost) + " / $" + agentturn_MAX_COST.toFixed(2),
            flag: agentturn_pctFlag(pCost),
          },
        ],
        rows: [
          { label: "transcript", value: agentturn_num(step.transcript) + " tok" },
          {
            label: "prefill billed",
            value: agentturn_num(step.cin) + " tok",
            flag: step.cin > step.transcript * 3 ? "warn" : undefined,
          },
        ],
      });

      var body = d.mono(step.call, step.step ? undefined : "idle");
      if (step.obsText) body += d.mono("← " + step.obsText, step.obsFlag);

      var tool = d.node({
        title: step.tool,
        status: step.verdict,
        statusFlag: step.verdictFlag,
        badge: step.obs ? agentturn_num(step.obs) + " tok obs" : "no obs",
        meta: step.step ? "turn " + step.step : "not called",
        flag: step.verdictFlag,
        body: body,
        rows: [
          { label: "prefill this turn", value: agentturn_num(step.prefill) + " tok" },
          { label: "model output", value: agentturn_num(step.out) + " tok" },
        ],
      });

      var extra = "";
      if (step.rel !== undefined) {
        extra += d.bar({
          label: "trajectory p",
          pct: step.rel * 100,
          value: step.rel.toFixed(3),
          flag: step.rel >= 0.85 ? "ok" : step.rel >= 0.7 ? "warn" : "bad",
        });
        extra += d.note(
          "0.95<sup>" + step.step + "</sup> = " + step.rel.toFixed(3) +
          " — the probability that <i>every</i> step so far was correct. No budget " +
          "gauge measures this, and no budget limit bounds it.",
          step.rel >= 0.85 ? undefined : step.rel >= 0.7 ? "warn" : "bad");
      } else {
        extra += d.note(
          "Billed this turn: " + agentturn_num(step.prefill) + " in + " +
          agentturn_num(step.out) + " out. Run total (" + agentturn_num(step.cin) +
          " × $" + agentturn_IN_PRICE + " + " + agentturn_num(step.cout) + " × $" +
          agentturn_OUT_PRICE + ") / 1e6 = " + agentturn_money(step.cost) + ".");
      }

      return d.stack([d.flow([col1, runtime, tool]), extra]);
    },
  };

  // ====================================================================
  // ======================================================================
  // SIM · decodestep  (decoding.md)
  // One decoding step, in the order the sampler actually applies things:
  //   logits -> temperature -> softmax -> top-k -> top-p -> renormalise -> draw
  // Every probability below is computed here by real softmax over the stated
  // logit vector; nothing is a typed-in percentage. The sampler's random draw
  // is pinned to u = 0.37 so the three tabs differ only by their settings.
  // ======================================================================
  var decodestep_TOK = [" Paris", " the", " a", " located", " one", " now", " home", " famous"];
  var decodestep_LOGITS = [8.2, 7.6, 7.1, 6.4, 5.9, 5.2, 4.1, 3.3];
  var decodestep_U = 0.37;

  function decodestep_softmax(logits, T) {
    var i, mx = -Infinity, scaled = [];
    for (i = 0; i < logits.length; i++) {
      scaled.push(T > 0 ? logits[i] / T : logits[i]);
      if (scaled[i] > mx) mx = scaled[i];
    }
    var sum = 0, ex = [];
    for (i = 0; i < scaled.length; i++) { ex.push(Math.exp(scaled[i] - mx)); sum += ex[i]; }
    var p = [];
    for (i = 0; i < ex.length; i++) p.push(ex[i] / sum);
    return p;
  }

  // Returns the full pipeline state for one setting, stage by stage.
  function decodestep_run(T, topK, topP) {
    var i;
    var greedy = T === 0;
    var probs = decodestep_softmax(decodestep_LOGITS, greedy ? 1 : T);

    var order = [];
    for (i = 0; i < probs.length; i++) order.push(i);
    order.sort(function (a, b) { return probs[b] - probs[a]; });

    // top-k
    var keptK = {};
    for (i = 0; i < order.length; i++) if (!topK || i < topK) keptK[order[i]] = true;

    // top-p over the k-survivors, in descending order
    var keptP = {}, cum = 0;
    for (i = 0; i < order.length; i++) {
      var idx = order[i];
      if (!keptK[idx]) continue;
      keptP[idx] = true;
      cum += probs[idx];
      if (topP && cum >= topP) break;             // smallest set reaching p
    }

    // renormalise over survivors
    var mass = 0;
    for (i = 0; i < probs.length; i++) if (keptP[i]) mass += probs[i];
    var renorm = [];
    for (i = 0; i < probs.length; i++) renorm.push(keptP[i] ? probs[i] / mass : 0);

    // draw
    var pick;
    if (greedy) {
      pick = order[0];
    } else {
      var acc = 0;
      pick = order[0];
      for (i = 0; i < order.length; i++) {
        var j = order[i];
        if (!keptP[j]) continue;
        acc += renorm[j];
        if (decodestep_U <= acc) { pick = j; break; }
      }
    }
    return {
      probs: probs, order: order, keptK: keptK, keptP: keptP,
      renorm: renorm, pick: pick, greedy: greedy, mass: mass,
      T: T, topK: topK, topP: topP,
    };
  }

  function decodestep_scenario(id, label, T, topK, topP, blurb) {
    var r = decodestep_run(T, topK, topP);
    var nK = 0, nP = 0, i;
    for (i = 0; i < decodestep_TOK.length; i++) { if (r.keptK[i]) nK++; if (r.keptP[i]) nP++; }
    var top = r.order[0];

    var steps = [
      { stage: 0, r: r, caption: blurb + " Press Play to walk the sampler." },
      {
        stage: 1, r: r,
        caption: "<b>Raw logits.</b> The model's actual output: one unbounded score per " +
          "vocabulary entry — about 100k of them, of which these 8 carry nearly all the mass. " +
          "They are not probabilities yet and do not sum to anything.",
      },
      {
        stage: 2, r: r,
        caption: r.greedy
          ? "<b>Temperature 0.</b> There is no division to do — T = 0 is a special case meaning " +
            "<i>take the argmax</i>, not \"divide by zero\". Every later stage is a no-op."
          : "<b>Divide by T = " + T + ".</b> " + (T < 1
            ? "T below 1 spreads the logits apart, which will sharpen the distribution."
            : "T above 1 pulls the logits together, which will flatten the distribution.") +
            " Nothing is discarded here — only rescaled.",
        flag: r.greedy ? "ok" : undefined,
      },
      {
        stage: 3, r: r,
        caption: "<b>Softmax.</b> Scores become a distribution summing to 1. " +
          decodestep_TOK[top].trim() + " now holds <b>" + (r.probs[top] * 100).toFixed(1) +
          "%</b> of the mass.",
      },
      {
        stage: 4, r: r,
        caption: r.topK
          ? "<b>Top-k = " + r.topK + ".</b> Keep the " + r.topK + " highest and drop the rest " +
            "outright — a fixed cut that ignores how the mass is actually shaped. " +
            (decodestep_TOK.length - nK) + " candidates discarded."
          : "<b>Top-k off.</b> No fixed cut. The page's advice: use top-p and leave top-k alone " +
            "unless you have a specific reason.",
        flag: r.topK ? "warn" : undefined,
      },
      {
        stage: 5, r: r,
        caption: r.greedy
          ? "<b>Top-p is a no-op at T = 0.</b> The argmax already decided it."
          : "<b>Top-p = " + r.topP + " (nucleus).</b> Walk down the sorted list until the " +
            "cumulative mass first reaches " + r.topP + ", and keep exactly that set — <b>" +
            nP + "</b> token" + (nP === 1 ? "" : "s") + ". This adapts to the distribution: " +
            "a confident step keeps one candidate, an uncertain step keeps many.",
        flag: "warn",
      },
      {
        stage: 6, r: r,
        caption: "<b>Renormalise.</b> The survivors held " + (r.mass * 100).toFixed(1) +
          "% of the original mass; they are rescaled to sum to 1 so the draw is well-formed.",
      },
      {
        stage: 7, r: r,
        caption: r.greedy
          ? "<b>Emitted " + decodestep_TOK[r.pick].trim() + ".</b> Deterministic given these " +
            "logits — but <i>not</i> reproducible in general: batching changes float reduction " +
            "order, so near-ties can flip between runs. Temperature 0 lowers variance, it does " +
            "not remove it."
          : "<b>Drew u = " + decodestep_U + " → emitted " + decodestep_TOK[r.pick].trim() +
            ".</b> Walk the survivors' cumulative probability until it passes u. Same logits and " +
            "same draw as the other tabs — only the settings differ, and they changed the answer.",
        flag: "ok",
      },
    ];
    return { id: id, label: label, steps: steps };
  }

  S["decodestep"] = {
    title: "Turn a distribution into one token, stage by stage",
    note: "The model has just scored the continuation of <i>“The capital of France is…”</i>. " +
      "These are the 8 candidates that matter out of roughly 100k. Every probability is " +
      "computed here by real softmax over the logit vector shown — and the sampler's random " +
      "draw is pinned at <b>u = 0.37</b> across all three tabs, so any difference in the " +
      "emitted token comes from the settings alone.",
    interval: 1400,
    scenarios: [
      decodestep_scenario("greedy", "T = 0 (greedy)", 0, 0, 0,
        "Temperature 0: the extraction and classification setting."),
      decodestep_scenario("balanced", "T = 0.7, top-p 0.95", 0.7, 0, 0.95,
        "Temperature 0.7 with nucleus sampling: the chat default."),
      decodestep_scenario("hot", "T = 1.5, top-p 0.95", 1.5, 0, 0.95,
        "Temperature 1.5: flattened, for when you want range rather than accuracy."),
    ],

    draw: function (step, d, ctx) {
      var r = step.r, st = step.stage, i;
      var showProb = st >= 3;
      var applyK = st >= 4 && r.topK;
      var applyP = st >= 5 && !r.greedy;
      var useRenorm = st >= 6;

      var rows = [];
      for (i = 0; i < r.order.length; i++) {
        var idx = r.order[i];
        var cutK = applyK && !r.keptK[idx];
        var cutP = applyP && !r.keptP[idx];
        var dead = cutK || cutP;
        var picked = st >= 7 && idx === r.pick;
        var p = useRenorm ? r.renorm[idx] : r.probs[idx];

        rows.push(d.bar({
          label: decodestep_TOK[idx],
          pct: showProb ? p * 100 : (r.probs[idx] * 100),
          value: !showProb
            ? (st >= 2 && !r.greedy
                ? (decodestep_LOGITS[idx] / r.T).toFixed(2)
                : decodestep_LOGITS[idx].toFixed(1))
            : dead ? "cut" : (p * 100).toFixed(1) + "%",
          flag: picked ? "ok" : dead ? "bad" : showProb ? undefined : "warn",
        }));
      }

      var stageNames = ["ready", "logits", "÷ T", "softmax", "top-k", "top-p", "renormalise", "sample"];
      var chips = [];
      for (i = 1; i < stageNames.length; i++) {
        chips.push({
          label: stageNames[i],
          flag: i < st ? "ok" : i === st ? "warn" : undefined,
        });
      }

      return d.stack([
        d.flow([
          d.big(st >= 7 ? decodestep_TOK[r.pick].trim() : "—", "emitted", st >= 7 ? "ok" : undefined),
          d.stat({
            label: "temperature",
            value: r.greedy ? "0" : String(r.T),
            sub: r.greedy ? "argmax" : r.T < 1 ? "sharpen" : "flatten",
          }),
          d.stat({
            label: "candidates live",
            value: String(
              st < 4 ? decodestep_TOK.length
                : (function () { var n = 0; for (var k = 0; k < decodestep_TOK.length; k++) {
                    if ((!applyK || r.keptK[k]) && (!applyP || r.keptP[k])) n++; } return n; })()
            ),
            sub: "of " + decodestep_TOK.length + " shown",
          }),
          d.stat({
            label: "draw",
            value: r.greedy ? "n/a" : String(decodestep_U),
            sub: r.greedy ? "deterministic" : "fixed across tabs",
          }),
        ]),
        d.pills(chips),
        d.stack(rows),
      ]);
    },
  };

  // ====================================================================
  // ======================================================================
  // SIM · driftwatch  (drift-detection.md)
  // The detector loop running window by window: a reference, a current
  // window, PSI, and the persistence rule that decides whether anyone gets
  // paged. Three tabs are the SAME traffic through three detectors.
  //
  // CONFIG — every figure on screen is computed from this, none typed in:
  //   signal        retrieval top-1 cosine similarity ~ Normal(mu_t, 0.07)
  //   window        1,000 requests (sized by volume, not by clock)
  //   reference     frozen at validation, mu = 0.784
  //   mu_t          0.780 + 0.003*(-1)^(t+1)            weekly seasonality
  //                       - 0.030 if t = 2              a crawl that failed once
  //                       - 0.013 * max(0, t - 3)       corpus re-indexing stops
  //   bins          10; edges are the REFERENCE deciles, found by bisection on
  //                 its CDF, outer edges -inf / +inf   (the page's psi())
  //   PSI           sum (cur - ref) * ln(cur / ref), both shares floored 1e-4
  //   bands         <0.1 none | 0.1-0.25 moderate | >0.25 significant
  //   threshold     0.10, persistence k = 3   (the page's PersistentDetector)
  //   no-docs rate  share of the window under the 0.70 relevance floor,
  //                 = Phi((0.70 - mu_t) / 0.07)
  // ======================================================================
  var driftwatch_SD = 0.07;
  var driftwatch_MU_REF = 0.784;
  var driftwatch_BASE = 0.780;
  var driftwatch_SEASON = 0.003;
  var driftwatch_SPIKE = 0.030;
  var driftwatch_DECAY = 0.013;
  var driftwatch_FREEZE = 3;          // corpus stops being re-indexed after week 3
  var driftwatch_BINS = 10;
  var driftwatch_N = 1000;
  var driftwatch_THRESH = 0.10;
  var driftwatch_K = 3;
  var driftwatch_FLOOR = 0.70;        // retrieval relevance floor
  var driftwatch_WEEKS = 7;

  // --- the maths the page's two functions need --------------------------
  // Abramowitz & Stegun 7.1.26; enough precision for decile edges.
  function driftwatch_erf(x) {
    var s = x < 0 ? -1 : 1;
    var a = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * a);
    var y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return s * y;
  }
  function driftwatch_cdf(x, mu) {
    return 0.5 * (1 + driftwatch_erf((x - mu) / (driftwatch_SD * Math.SQRT2)));
  }
  // quantile by bisection — the edges are computed, never typed
  function driftwatch_q(p, mu) {
    var lo = mu - 6 * driftwatch_SD, hi = mu + 6 * driftwatch_SD, mid = mu;
    for (var i = 0; i < 60; i++) {
      mid = (lo + hi) / 2;
      if (driftwatch_cdf(mid, mu) < p) lo = mid; else hi = mid;
    }
    return mid;
  }
  function driftwatch_edges(mu) {
    var e = [];
    for (var i = 1; i < driftwatch_BINS; i++) e.push(driftwatch_q(i / driftwatch_BINS, mu));
    return e;                                  // BINS-1 inner edges; outer are +-inf
  }
  function driftwatch_fracs(edges, mu) {
    var f = [], prev = 0, c;
    for (var i = 0; i < edges.length; i++) {
      c = driftwatch_cdf(edges[i], mu);
      f.push(c - prev);
      prev = c;
    }
    f.push(1 - prev);
    return f;
  }
  // The page's psi(), term for term, including the 1e-4 floor that stops one
  // empty bin from dominating an otherwise fine score.
  function driftwatch_psi(ref, cur) {
    var floor = 1e-4, s = 0, r, c;
    for (var i = 0; i < ref.length; i++) {
      r = ref[i] < floor ? floor : ref[i];
      c = cur[i] < floor ? floor : cur[i];
      s += (c - r) * Math.log(c / r);
    }
    return s;
  }
  function driftwatch_mu(t) {
    var season = (t % 2 === 1 ? 1 : -1) * driftwatch_SEASON;
    return driftwatch_BASE + season -
      (t === 2 ? driftwatch_SPIKE : 0) -
      driftwatch_DECAY * Math.max(0, t - driftwatch_FREEZE);
  }
  function driftwatch_nodocs(mu) { return driftwatch_cdf(driftwatch_FLOOR, mu); }
  function driftwatch_sigmas(mu) { return (driftwatch_MU_REF - mu) / driftwatch_SD; }

  // --- one traffic stream, scored two ways ------------------------------
  var driftwatch_REF_EDGES = driftwatch_edges(driftwatch_MU_REF);
  var driftwatch_REF_FRACS = driftwatch_fracs(driftwatch_REF_EDGES, driftwatch_MU_REF);

  function driftwatch_stream() {
    var weeks = [], t, mu, prevMu, e, pf, cf;
    for (t = 1; t <= driftwatch_WEEKS; t++) {
      mu = driftwatch_mu(t);
      prevMu = t === 1 ? driftwatch_MU_REF : driftwatch_mu(t - 1);
      e = driftwatch_edges(prevMu);            // rolling: edges move with the data
      pf = driftwatch_fracs(e, prevMu);
      cf = driftwatch_fracs(e, mu);
      weeks.push({
        t: t,
        mu: mu,
        prevMu: prevMu,
        frozenCur: driftwatch_fracs(driftwatch_REF_EDGES, mu),
        psiFrozen: driftwatch_psi(driftwatch_REF_FRACS,
          driftwatch_fracs(driftwatch_REF_EDGES, mu)),
        rollRef: pf,
        rollCur: cf,
        psiRoll: driftwatch_psi(pf, cf),
        nodocs: driftwatch_nodocs(mu)
      });
    }
    return weeks;
  }
  var driftwatch_WK = driftwatch_stream();
  var driftwatch_REF_NODOCS = driftwatch_nodocs(driftwatch_MU_REF);

  function driftwatch_pct(x) { return (x * 100).toFixed(1) + "%"; }

  // --- the state machine from the page's UML ----------------------------
  // Calibrating -> Stable -> Suspect -> Alerting, streak reset on recovery.
  function driftwatch_state(streak, k) {
    if (streak >= k) return "ALERTING";
    return streak > 0 ? "SUSPECT" : "STABLE";
  }

  // --- scenario builder --------------------------------------------------
  function driftwatch_run(mode, label, k, idleCap, caps, verdict) {
    var rolling = mode === "rolling";
    var steps = [{
      caption: idleCap,
      mode: mode, k: k, week: 0, state: "CALIBRATING", streak: 0, psi: 0,
      ref: driftwatch_REF_FRACS, cur: driftwatch_REF_FRACS,
      mu: driftwatch_MU_REF, nodocs: driftwatch_REF_NODOCS,
      hist: [], flag: "idle"
    }];
    var streak = 0, hist = [], i, w, psi, breach, state;
    for (i = 0; i < driftwatch_WK.length; i++) {
      w = driftwatch_WK[i];
      psi = rolling ? w.psiRoll : w.psiFrozen;
      breach = psi > driftwatch_THRESH;
      streak = breach ? streak + 1 : 0;
      state = driftwatch_state(streak, k);
      hist = hist.concat([{ psi: psi, breach: breach, state: state }]);
      steps.push({
        caption: caps[i](w, psi, streak, state),
        mode: mode, k: k, week: w.t, state: state, streak: streak, psi: psi,
        psiOther: rolling ? w.psiFrozen : null,
        ref: rolling ? w.rollRef : driftwatch_REF_FRACS,
        cur: rolling ? w.rollCur : w.frozenCur,
        refMu: rolling ? w.prevMu : driftwatch_MU_REF,
        mu: w.mu, nodocs: w.nodocs, hist: hist,
        flag: state === "ALERTING" ? "bad" : state === "SUSPECT" ? "warn" : "ok"
      });
    }
    var lastStep = steps[steps.length - 1];
    steps.push({
      caption: verdict,
      mode: mode, k: k, week: driftwatch_WEEKS, state: lastStep.state === "ALERTING" ? "TRIAGE" : lastStep.state,
      streak: lastStep.streak, psi: lastStep.psi, psiOther: lastStep.psiOther,
      ref: lastStep.ref, cur: lastStep.cur, refMu: lastStep.refMu,
      mu: lastStep.mu, nodocs: lastStep.nodocs, hist: hist, verdict: true,
      flag: lastStep.state === "ALERTING" ? "ok" : "bad"
    });
    return { id: mode, label: label, steps: steps };
  }

  // --- scenario 1: frozen reference, k = 3 ------------------------------
  function driftwatch_frozen() {
    var caps = [
      function (w, psi, streak, state) {
        return "<b>Week 1.</b> The window is binned on the <i>reference's</i> deciles — 10.0% per " +
          "bin by construction — and its shares are compared to those. &mu; is " + w.mu.toFixed(3) +
          " against the frozen " + driftwatch_MU_REF.toFixed(3) + ", so PSI = <b>" + psi.toFixed(3) +
          "</b>, far under the 0.10 band. <b>STABLE.</b>";
      },
      function (w, psi, streak, state) {
        return "<b>Week 2 — an overnight crawl failed.</b> &mu; drops " + driftwatch_SPIKE.toFixed(3) +
          " in a single window and PSI jumps to <b>" + psi.toFixed(3) + "</b>, " +
          (psi > 0.25 ? "into the page's <i>significant</i> band" : "over the 0.10 threshold") +
          ". Nobody is paged: this is breach <b>" + streak + " of " + driftwatch_K +
          "</b>. <b>SUSPECT.</b>";
      },
      function (w, psi, streak, state) {
        return "<b>Week 3.</b> The crawl recovered on its own. &mu; is back to " + w.mu.toFixed(3) +
          " and PSI falls to <b>" + psi.toFixed(3) + "</b>, so the streak resets to 0. " +
          "<b>That reset is the whole value of the Suspect state</b> — one bad window is a Monday, " +
          "not a trend, and a k=1 detector has already woken someone for it.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 4 — re-indexing stops.</b> From here &mu; decays " + driftwatch_DECAY.toFixed(3) +
          " a week. PSI = <b>" + psi.toFixed(3) + "</b>: " +
          (psi >= 0.1 ? "already moderate" : "moderate on the way up but still under the 0.10 threshold") +
          ". " + (psi >= 0.1 ? "Breach " + streak + " of " + driftwatch_K + "." :
          "Nothing fires, and nothing should — this is what a detector looks like while it is still right.");
      },
      function (w, psi, streak, state) {
        return "<b>Week 5.</b> PSI = <b>" + psi.toFixed(3) + "</b>, over threshold. Breach <b>" +
          streak + " of " + driftwatch_K + "</b>. The drift is monotone now rather than a spike — " +
          "but the detector cannot know that from one window, which is exactly why it waits.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 6.</b> PSI = <b>" + psi.toFixed(3) + "</b>. Breach <b>" + streak + " of " +
          driftwatch_K + "</b> and still no page. The price of persistence is two windows of " +
          "detection latency; what it buys is an alert people still read in month three.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 7. ALERTING.</b> PSI = <b>" + psi.toFixed(3) + "</b>, streak " + streak +
          " of " + driftwatch_K + ". Retrieval similarity has fallen <b>" +
          driftwatch_sigmas(w.mu).toFixed(2) + "&sigma;</b> below the distribution this system was " +
          "validated on, and queries with nothing above the " + driftwatch_FLOOR.toFixed(2) +
          " relevance floor have gone from " + driftwatch_pct(driftwatch_REF_NODOCS) + " to <b>" +
          driftwatch_pct(w.nodocs) + "</b>.";
      }
    ];
    var last = driftwatch_WK[driftwatch_WEEKS - 1];
    return driftwatch_run("frozen", "Frozen reference · k=3", driftwatch_K,
      "Seven 1,000-request windows are queued behind a reference frozen at validation time. " +
        "Nothing has been compared yet — press Play.",
      caps,
      "<b>Triage before remedy.</b> The model was never touched — the weights are the ones " +
        "validated in week 0. What moved is the <i>corpus</i>: retrieval similarity is down " +
        driftwatch_sigmas(last.mu).toFixed(2) + "&sigma; and the no-relevant-document rate has gone " +
        driftwatch_pct(driftwatch_REF_NODOCS) + " &rarr; " + driftwatch_pct(last.nodocs) +
        ". So the remedy is re-index and re-embed, not retrain: a retrain costs weeks and fixes " +
        "nothing here. Then the confirmed failures go into the golden set, which is the ratchet " +
        "that stops this drift surprising you twice.");
  }

  // --- scenario 2: rolling reference ------------------------------------
  function driftwatch_rolling() {
    var caps = [
      function (w, psi, streak, state) {
        return "<b>Week 1.</b> Same code, one change: the reference is now the <i>previous</i> " +
          "window, and the bin edges are recomputed from it. Week 1 is still scored against " +
          "week 0, so PSI = <b>" + psi.toFixed(3) + "</b> — identical to the frozen tab.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 2.</b> The failed crawl shows up here too: PSI(w1&rarr;w2) = <b>" +
          psi.toFixed(3) + "</b>. Breach " + streak + " of " + driftwatch_K + ". So far the two " +
          "detectors agree.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 3.</b> And the <i>recovery</i> registers as drift as well — PSI(w2&rarr;w3) = <b>" +
          psi.toFixed(3) + "</b>, because the window moved back. A rolling reference reacts to every " +
          "change of direction, in both directions, while the frozen detector reads " +
          w.psiFrozen.toFixed(3) + " on this same window and correctly calls it normal.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 4.</b> Re-indexing stops, but week on week &mu; moves only " +
          Math.abs(w.mu - w.prevMu).toFixed(3) + ". PSI = <b>" + psi.toFixed(3) + "</b> — " +
          (psi > driftwatch_THRESH ? "still over threshold" : "under threshold, streak reset") +
          ". The frozen detector reads " + w.psiFrozen.toFixed(3) + " on the same data.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 5.</b> PSI = <b>" + psi.toFixed(3) + "</b>: <i>no meaningful shift</i>, says " +
          "the band. The frozen detector reads " + w.psiFrozen.toFixed(3) + " and has started its " +
          "streak. The gap between those two numbers is the drift being normalised away.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 6.</b> PSI = <b>" + psi.toFixed(3) + "</b> against last week; " +
          w.psiFrozen.toFixed(3) + " against validation. Every week resembles the week before it, " +
          "because that is the only thing it is being compared to.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 7.</b> Final window: PSI = <b>" + psi.toFixed(3) + "</b>, state <b>" + state +
          "</b>. This detector has never reached " + driftwatch_K + " consecutive breaches and is " +
          "reporting a healthy system, on traffic the frozen detector scores at " +
          w.psiFrozen.toFixed(3) + ".";
      }
    ];
    var last = driftwatch_WK[driftwatch_WEEKS - 1];
    return driftwatch_run("rolling", "Rolling reference", driftwatch_K,
      "The same seven windows and the same PSI code — but the reference is last week's window " +
        "instead of the frozen validation window.",
      caps,
      "<b>A rolling reference normalises slow drift away one window at a time.</b> The final " +
        "window reads <b>" + last.psiRoll.toFixed(3) + "</b> here and <b>" + last.psiFrozen.toFixed(3) +
        "</b> against validation — the same data, " + (last.psiFrozen / last.psiRoll).toFixed(0) +
        "&times; apart. Retrieval similarity is " + driftwatch_sigmas(last.mu).toFixed(2) +
        "&sigma; down and the no-docs rate has gone " + driftwatch_pct(driftwatch_REF_NODOCS) +
        " &rarr; " + driftwatch_pct(last.nodocs) + ", invisibly. Gradual drift is exactly the drift " +
        "this detector cannot see, and exactly the drift you most want to catch. Freeze the " +
        "reference at validation time and store it.");
  }

  // --- scenario 3: no persistence (k = 1) -------------------------------
  function driftwatch_hair() {
    var caps = [
      function (w, psi, streak, state) {
        return "<b>Week 1.</b> Frozen reference, correct measure, one difference: this detector " +
          "alerts on a single breach. PSI = <b>" + psi.toFixed(3) + "</b>. Quiet, so far.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 2 — first page.</b> The failed crawl puts PSI at <b>" + psi.toFixed(3) +
          "</b> and with k=1 that is an <b>ALERT</b> at once. Someone is woken, and the reflex " +
          "fires: re-index everything.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 3 — and it looks fixed.</b> PSI = <b>" + psi.toFixed(3) + "</b>. The crawl " +
          "had already recovered on its own, but the remediation gets the credit. That false " +
          "attribution is the expensive part: the team now believes the alert is actionable and " +
          "the fix is cheap.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 4.</b> The corpus quietly stops being re-indexed. PSI = <b>" + psi.toFixed(3) +
          "</b> — " + (psi > driftwatch_THRESH ? "another page" : "under threshold, no page") +
          ". Nothing distinguishes this window from the noise a fortnight ago.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 5 — the alert that mattered.</b> PSI = <b>" + psi.toFixed(3) + "</b>, and the " +
          "detector pages again. It is right this time. It is also the " +
          "second page in four weeks from a channel whose last alert resolved itself.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 6.</b> PSI = <b>" + psi.toFixed(3) + "</b>. Another page. The dashboard has " +
          "been amber more often than green, so the thread is muted and the alert is filed as " +
          "'known noisy'.";
      },
      function (w, psi, streak, state) {
        return "<b>Week 7.</b> PSI = <b>" + psi.toFixed(3) + "</b> — " + driftwatch_sigmas(w.mu).toFixed(2) +
          "&sigma; of real, sustained, remediable drift, arriving in a channel nobody reads any more. " +
          "The detector is working perfectly and the system is failing.";
      }
    ];
    return driftwatch_run("hair", "No persistence · k=1", 1,
      "Same frozen reference, same PSI, persistence removed: k = 1, alert on any single breach.",
      caps,
      "<b>Four alerts, and only the last three were the same real thing.</b> The week-2 page was a " +
        "crawl that healed itself; with k=" + driftwatch_K + " it would never have been sent, and " +
        "the first page would have been week " + (driftwatch_WEEKS) + " — two windows later, and " +
        "believed. Alert fatigue is a design failure, not a discipline failure: cut the signals to " +
        "the ones you would act on, require k consecutive breaches, and enforce act-or-widen so " +
        "every alert either changes something or moves the threshold.");
  }

  S["driftwatch"] = {
    title: "Run the drift detector, window by window",
    note: "One signal — retrieval top-1 cosine similarity — over seven <b>" +
      driftwatch_N.toLocaleString("en-US") + "-request</b> windows, sized by volume rather than by " +
      "clock. The world moves on a stated schedule: &mu;<sub>t</sub> = " + driftwatch_BASE.toFixed(3) +
      " &plusmn; " + driftwatch_SEASON.toFixed(3) + " seasonality, &minus;" + driftwatch_SPIKE.toFixed(3) +
      " in week 2 when a crawl failed, then &minus;" + driftwatch_DECAY.toFixed(3) +
      "/week once re-indexing stops after week " + driftwatch_FREEZE + "; windows are Normal(&mu;<sub>t</sub>, " +
      driftwatch_SD.toFixed(2) + "). The ten bin edges are the <i>reference's</i> deciles, located by " +
      "bisection on its CDF, and PSI is the page's formula with both shares floored at 1e-4. " +
      "Threshold <b>0.10</b>, persistence <b>k = " + driftwatch_K + "</b>. The three tabs are the " +
      "same traffic through three detectors.",
    interval: 1500,
    scenarios: [driftwatch_frozen(), driftwatch_rolling(), driftwatch_hair()],

    draw: function (step, d, ctx) {
      var refCells = [], curCells = [], i, delta;
      for (i = 0; i < step.ref.length; i++) {
        refCells.push({
          label: (step.ref[i] * 100).toFixed(0),
          title: "bin " + (i + 1) + " — reference share " + driftwatch_pct(step.ref[i])
        });
        delta = step.cur[i] - step.ref[i];
        curCells.push({
          label: (step.cur[i] * 100).toFixed(0),
          flag: delta > 0.04 ? "bad" : delta > 0.015 ? "warn" : delta < -0.03 ? "idle" : undefined,
          title: "bin " + (i + 1) + " — " + driftwatch_pct(step.cur[i]) + " now vs " +
            driftwatch_pct(step.ref[i]) + " in the reference (" +
            (delta >= 0 ? "+" : "") + (delta * 100).toFixed(1) + " pts)"
        });
      }

      var lane = [];
      for (i = 0; i < driftwatch_WEEKS; i++) {
        var h = step.hist[i];
        if (!h) {
          lane.push({ label: "·", flag: "idle", title: "week " + (i + 1) + " — not yet observed" });
        } else {
          lane.push({
            label: h.psi.toFixed(2),
            flag: h.state === "ALERTING" ? "bad" : h.breach ? "warn" : "ok",
            title: "week " + (i + 1) + " — PSI " + h.psi.toFixed(3) + ", " + h.state
          });
        }
      }

      var stateFlag = step.state === "ALERTING" ? "bad"
        : step.state === "TRIAGE" ? "ok"
        : step.state === "SUSPECT" ? "warn"
        : step.state === "CALIBRATING" ? "idle" : "ok";
      var psiPct = (step.psi / 0.25) * 100;      // 0.25 = the page's "significant" band
      var rolling = step.mode === "rolling";

      return d.stack([
        d.flow([
          d.stack([
            d.big(step.week ? "wk " + step.week : "—", "current window"),
            d.stat({
              label: "μ retrieval sim",
              value: step.mu.toFixed(3),
              sub: step.week ? driftwatch_sigmas(step.mu).toFixed(2) + "σ below reference" : "reference",
              flag: driftwatch_sigmas(step.mu) > 0.5 ? "bad" : driftwatch_sigmas(step.mu) > 0.25 ? "warn" : "ok"
            })
          ]),
          d.node({
            title: rolling ? "reference = last window" : "reference window",
            status: rolling ? "ROLLING" : "FROZEN",
            statusFlag: rolling ? "bad" : "ok",
            badge: driftwatch_BINS + " bins",
            meta: "μ " + (step.refMu === undefined ? driftwatch_MU_REF : step.refMu).toFixed(3) +
              " · edges = its own deciles",
            flag: rolling ? "warn" : "ok",
            body: d.cells(refCells, { label: "reference share per bin, %" })
          }),
          d.node({
            title: "current window · " + driftwatch_N.toLocaleString("en-US") + " requests",
            status: step.state,
            statusFlag: stateFlag,
            badge: "PSI",
            meta: "binned on the reference's edges, never re-binned",
            flag: stateFlag,
            gauges: [{
              label: "PSI vs 0.25 band",
              pct: psiPct,
              value: step.psi.toFixed(3),
              flag: step.psi > 0.25 ? "bad" : step.psi > driftwatch_THRESH ? "warn" : "ok"
            }],
            body: d.cells(curCells, { label: "current share per bin, %" }),
            rows: [
              {
                label: "breach streak",
                value: step.streak + " / " + step.k,
                flag: step.streak >= step.k ? "bad" : step.streak ? "warn" : "ok"
              },
              {
                label: "no relevant doc (<" + driftwatch_FLOOR.toFixed(2) + ")",
                value: driftwatch_pct(step.nodocs),
                flag: step.nodocs > 0.25 ? "bad" : step.nodocs > 0.18 ? "warn" : "ok"
              }
            ]
          }),
          d.stack([
            d.stat({
              label: "detector",
              value: step.state,
              sub: "k = " + step.k,
              flag: stateFlag
            }),
            step.psiOther !== null && step.psiOther !== undefined
              ? d.stat({
                  label: "if reference were frozen",
                  value: step.psiOther.toFixed(3),
                  sub: step.psiOther > driftwatch_THRESH ? "over threshold" : "under threshold",
                  flag: step.psiOther > 0.25 ? "bad" : step.psiOther > driftwatch_THRESH ? "warn" : "ok"
                })
              : d.stat({
                  label: "band",
                  value: step.psi > 0.25 ? "significant" : step.psi > driftwatch_THRESH ? "moderate" : "none",
                  sub: "<0.1 · 0.1–0.25 · >0.25",
                  flag: step.psi > 0.25 ? "bad" : step.psi > driftwatch_THRESH ? "warn" : "ok"
                })
          ])
        ]),
        d.lane({ label: "PSI by window", cells: lane }),
        d.note(
          step.verdict
            ? "<b>Decide, then write it down.</b> Retrain, re-embed, widen a threshold, or do " +
              "nothing with a reason — every alert ends in a change or a documented non-change."
            : step.week === 0
              ? "Reference deciles give 10.0% per bin by construction. Everything that follows is " +
                "the current window's shares moving out of those fixed bins."
              : "PSI = Σ (cur − ref) · ln(cur / ref) over the " + driftwatch_BINS +
                " reference bins; the shares above are what that sum is reading.",
          step.verdict ? "ok" : undefined
        )
      ]);
    }
  };

  // ====================================================================
  // ======================================================================
  // SIM · gaterun  (regression-gates.md)
  // One pull request, run through the gate's checks in the gate's order,
  // under three policies. The frames are the stages of §3's flow:
  //   run -> per-item scores -> aggregate -> provenance -> floor ->
  //   bucket floor -> max regression -> exit code.
  //
  // CONFIG — one ledger, everything else derived from it:
  //   dataset     100 frozen items in 5 buckets
  //   thresholds  primary_floor 0.70 · max_regression 0.06 · bucket_floor 0.50
  //               (the page's Thresholds dataclass, §5)
  //   baseline    primary 0.92 · corpus b962a80f · dataset 1c640984  (§1)
  //   this run    primary 0.89 · paraphrase 0.75 -> 0.38             (§1)
  //
  // The bucket ledger below is the ONLY input. It is chosen so that the four
  // figures the page publishes fall out of it exactly:
  //     92/100 = 0.92    89/100 = 0.89    6/8 = 0.75    3/8 = 0.375 -> 0.38
  // Everything else on screen — the delta, the Wilson interval, the McNemar
  // fixed/broken counts, the ids of the items that flipped, the number of
  // green merges that walk the score to the floor — is computed here from
  // that ledger. Nothing is typed in to look plausible.
  // ======================================================================
  var gaterun_T = { floor: 0.70, allow: 0.06, bucket: 0.50 };

  // name, items, correct at baseline, correct this run
  var gaterun_BUCKETS = [
    { name: "factual",    n: 40, base: 39, cand: 40 },
    { name: "multi-hop",  n: 24, base: 21, cand: 22 },
    { name: "paraphrase", n:  8, base:  6, cand:  3 },
    { name: "negation",   n: 16, base: 15, cand: 13 },
    { name: "tables",     n: 12, base: 11, cand: 11 }
  ];

  var gaterun_HASH = {
    corpusBase: "b962a80f", corpusRun: "4f0c31d7",   // digests, not measurements
    dataset: "1c640984"
  };

  function gaterun_id(i) {
    return "rag-" + (i < 10 ? "00" : i < 100 ? "0" : "") + i;
  }

  /** The per-item ledger the buckets are an aggregate OF. Ids run in bucket
   *  order; within a bucket the first `base`/`cand` items are the passes, so
   *  the flips land on the boundary and every id below is computed. */
  function gaterun_items() {
    var out = [], id = 1, i, j, b;
    for (i = 0; i < gaterun_BUCKETS.length; i++) {
      b = gaterun_BUCKETS[i];
      for (j = 0; j < b.n; j++) {
        out.push({
          id: gaterun_id(id), bucket: b.name,
          base: j < b.base ? 1 : 0,
          cand: j < b.cand ? 1 : 0
        });
        id++;
      }
    }
    return out;
  }

  /** Discordant pairs over the SAME items — the page's mcnemar_counts. */
  function gaterun_mcnemar(items) {
    var fixed = [], broken = [], k;
    for (k = 0; k < items.length; k++) {
      if (items[k].cand > items[k].base) fixed.push(items[k]);
      else if (items[k].cand < items[k].base) broken.push(items[k]);
    }
    return { fixed: fixed, broken: broken };
  }

  /** Wilson score interval at 95% — the interval the page's report prints. */
  function gaterun_wilson(x, n) {
    var z = 1.959964, z2 = z * z, p = x / n;
    var den = 1 + z2 / n;
    var c = (p + z2 / (2 * n)) / den;
    var h = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / den;
    return { lo: c - h, hi: c + h, width: 2 * h };
  }

  function gaterun_sum(key) {
    var t = 0, i;
    for (i = 0; i < gaterun_BUCKETS.length; i++) t += gaterun_BUCKETS[i][key];
    return t;
  }
  function gaterun_ids(list) {
    return list.map(function (it) { return it.id; }).join(", ");
  }

  var gaterun_ITEMS = gaterun_items();
  var gaterun_N     = gaterun_sum("n");                 // 100
  var gaterun_XB    = gaterun_sum("base");              // 92
  var gaterun_XC    = gaterun_sum("cand");              // 89
  var gaterun_PB    = gaterun_XB / gaterun_N;           // 0.92
  var gaterun_PC    = gaterun_XC / gaterun_N;           // 0.89
  var gaterun_CI    = gaterun_wilson(gaterun_XC, gaterun_N);
  var gaterun_DELTA = gaterun_PC - gaterun_PB;          // -0.03
  var gaterun_MC    = gaterun_mcnemar(gaterun_ITEMS);   // 2 fixed, 5 broken
  var gaterun_PARA  = gaterun_BUCKETS[2];               // the bucket that dies

  // How far a policy of "floor + allowance, baseline rewritten on green" can
  // walk downhill, one legal step of this exact size at a time.
  var gaterun_DROP  = gaterun_PB - gaterun_PC;                               // 0.03
  var gaterun_WALK  = Math.ceil((gaterun_PB - gaterun_T.floor) / gaterun_DROP);
  var gaterun_LAST  = gaterun_PB - (gaterun_WALK - 1) * gaterun_DROP;

  function gaterun_pct(x) { return (x * 100).toFixed(1); }

  // --- the stages, shared by all three policies -------------------------
  // k: 0 idle · 1 run · 2 score · 3 aggregate · 4 provenance · 5 floor
  //    6 bucket floor · 7 max regression · 8 verdict
  function gaterun_scenario(mode) {
    var refuse = mode === "corpus";       // corpus hash moved: no comparison
    var blind  = mode === "headline";     // no per-bucket policy, auto-baseline
    var s = [];

    s.push({
      k: 0, mode: mode,
      caption: blind
        ? "The same pull request, gated the way most teams gate first: a floor and an " +
          "allowance on the headline number, and a green run writes the new baseline back " +
          "automatically. Committed baseline <b>primary " + gaterun_PB.toFixed(4) + "</b>."
        : refuse
        ? "The same pull request — but it re-chunks the corpus as well, 512 tokens to 800. " +
          "Same dataset, same scorers, same three-check policy as the middle tab. One hash moves."
        : "A pull request changes the prompt. The committed baseline is <b>primary " +
          gaterun_PB.toFixed(4) + "</b> over " + gaterun_N + " frozen items and the policy is the " +
          "page's three checks: floor " + gaterun_T.floor.toFixed(2) + ", allowance " +
          gaterun_T.allow.toFixed(2) + ", bucket floor " + gaterun_T.bucket.toFixed(2) + "."
    });

    s.push({
      k: 1, mode: mode, flag: "idle",
      caption: "<b>CI runs the frozen dataset.</b> " + gaterun_N + " items in " +
        gaterun_BUCKETS.length + " buckets, temperature 0, pinned model <i>version</i>, frozen " +
        "corpus, cached embeddings. The flakiness controls exist so that a move in the score " +
        "means a change in the system rather than a change in the weather." +
        (refuse ? " The dataset is the same " + gaterun_N + " items; the passages behind them are not." : "")
    });

    s.push({
      k: 2, mode: mode, flag: "warn",
      caption: "<b>Scorers return per-item results:</b> " + gaterun_XC + " of " + gaterun_N +
        " pass. Per-item is the level that gets stored, as rows over time and never as an " +
        "aggregate — six months from now the only question that matters is <i>when did this item " +
        "start failing</i>, and an average cannot answer it." +
        (refuse ? " Identical to the other tabs on purpose: watch how much of what the gate says " +
          "about this ledger survives the next frame." : "")
    });

    s.push({
      k: 3, mode: mode, flag: "warn",
      caption: "<b>Aggregated.</b> primary = " + gaterun_XC + "/" + gaterun_N + " = <b>" +
        gaterun_PC.toFixed(4) + "</b>, 95% Wilson interval <b>" + gaterun_CI.lo.toFixed(4) + "–" +
        gaterun_CI.hi.toFixed(4) + "</b> — a band " + gaterun_pct(gaterun_CI.width) + " points " +
        "wide. Hold that width: the delta this gate is about to measure is smaller than it." +
        (blind ? " The bucket table is computed and written into the report too. Watch what reads it." : "")
    });

    s.push({
      k: 4, mode: mode, flag: refuse ? "bad" : "ok",
      caption: refuse
        ? "<b>Provenance: corpus " + gaterun_HASH.corpusBase + " &ne; " + gaterun_HASH.corpusRun +
          ".</b> The two runs did not measure the same thing, so <b>the gate refuses to compare</b>. " +
          "Nothing that moved can be attributed to the prompt change rather than to the re-chunk, " +
          "and saying otherwise would be a lie with a number attached."
        : "<b>Provenance first.</b> corpus " + gaterun_HASH.corpusBase + " = " +
          gaterun_HASH.corpusBase + ", dataset " + gaterun_HASH.dataset + " = " +
          gaterun_HASH.dataset + ". Same measurement, so a comparison means something. This check " +
          "comes first because every check after it is an inference about a <i>difference</i> " +
          "between two runs."
    });

    s.push({
      k: 5, mode: mode, flag: "ok",
      caption: "<b>Check 1 — absolute floor.</b> " + gaterun_PC.toFixed(4) + " &ge; " +
        gaterun_T.floor.toFixed(2) + ", pass. It catches slow decay across many individually " +
        "acceptable PRs and is blind to a fall from excellent to merely-above-floor, which is " +
        "what this run is." +
        (refuse ? " Floors need no baseline, which is why they are still enforced after a refusal — " +
          "the weakest of the three checks is the only one that survives one." : "")
    });

    s.push({
      k: 6, mode: mode, flag: blind ? "warn" : "bad",
      caption: blind
        ? "<b>Check 2 — not configured.</b> paraphrase is sitting in the report at <b>" +
          (gaterun_PARA.cand / gaterun_PARA.n).toFixed(4) + "</b> and no policy line reads it. " +
          "The check that would have fired is the one that was never written, and it is the " +
          "highest-value of the three."
        : "<b>Check 2 — per-bucket floor.</b> paraphrase " + gaterun_PARA.cand + "/" +
          gaterun_PARA.n + " = <b>" + (gaterun_PARA.cand / gaterun_PARA.n).toFixed(4) +
          "</b>, below " + gaterun_T.bucket.toFixed(2) + ". <b>Fail.</b> An " + gaterun_PARA.n +
          "-item bucket went " + (gaterun_PARA.base / gaterun_PARA.n).toFixed(2) + " &rarr; " +
          (gaterun_PARA.cand / gaterun_PARA.n).toFixed(2) + " and this is the only check in the " +
          "policy that can see it."
    });

    s.push({
      k: 7, mode: mode, flag: refuse ? "warn" : "ok",
      caption: refuse
        ? "<b>Check 3 — not computed.</b> The " + gaterun_DELTA.toFixed(4) + " the middle tab " +
          "printed is gone, and it should be: it would attribute a difference to this PR when the " +
          "measurement itself moved underneath it. Refusing to produce the number is the feature."
        : "<b>Check 3 — max regression.</b> delta = " + gaterun_PC.toFixed(4) + " &minus; " +
          gaterun_PB.toFixed(4) + " = <b>" + gaterun_DELTA.toFixed(4) + "</b>, inside the " +
          gaterun_T.allow.toFixed(2) + " allowance, pass. Paired over the same " + gaterun_N +
          " items it is <b>" + gaterun_MC.fixed.length + " fixed, " + gaterun_MC.broken.length +
          " broken</b> — the net of &minus;" + (gaterun_MC.broken.length - gaterun_MC.fixed.length) +
          " items hides movement in both directions, and the baseline " + gaterun_PB.toFixed(4) +
          " sits inside this run's own interval. The aggregate genuinely cannot see this."
    });

    s.push({
      k: 8, mode: mode, flag: blind ? "bad" : "ok",
      caption: blind
        ? "<b>exit 0. Merged</b> — and the green run rewrites the baseline to " +
          gaterun_PC.toFixed(4) + ", so the next PR's allowance is measured from here. " +
          (gaterun_WALK - 1) + " more merges of exactly this size leave primary at " +
          gaterun_LAST.toFixed(4) + ", still legal; the " + gaterun_WALK + "th is the first that " +
          "is not. Every individual run looks fine. That is what <i>quality walks downhill</i> " +
          "means, and it is why re-baselining has to be a commit somebody signs."
        : refuse
        ? "<b>exit 1</b>, for the bucket floor alone, with the note <i>corpus changed: comparison " +
          "skipped, re-baseline deliberately</i>. Same run, same " + gaterun_XC + "/" + gaterun_N +
          ", and the honest output is strictly smaller than the middle tab's: two absolute checks " +
          "and no delta. Re-baseline on purpose in a reviewed commit and the next run compares again."
        : "<b>exit 1.</b> Two of the three checks passed and the build is red anyway, on the check " +
          "most teams do not have. The comment names items rather than a number — <b>" +
          gaterun_ids(gaterun_MC.broken) + "</b> — because that is the part a reviewer actually " +
          "reads. Nothing here rewrites " + gaterun_PB.toFixed(4) + ": accepting a quality change " +
          "is a decision somebody signs off on."
    });

    return {
      id: mode,
      label: blind ? "Headline gate" : refuse ? "Corpus edited" : "Three checks",
      steps: s
    };
  }

  S["gaterun"] = {
    title: "Run one pull request through the gate, three times",
    note: "A " + gaterun_N + "-item frozen set in " + gaterun_BUCKETS.length + " buckets, " +
      "gated at floor <b>" + gaterun_T.floor.toFixed(2) + "</b>, allowance <b>" +
      gaterun_T.allow.toFixed(2) + "</b>, bucket floor <b>" + gaterun_T.bucket.toFixed(2) +
      "</b>. One ledger of per-item results drives all three tabs, and it is the page's own run: " +
      gaterun_XB + "/" + gaterun_N + " = " + gaterun_PB.toFixed(2) + " at baseline, " +
      gaterun_XC + "/" + gaterun_N + " = " + gaterun_PC.toFixed(2) + " now, paraphrase " +
      (gaterun_PARA.base / gaterun_PARA.n).toFixed(2) + " &rarr; " +
      (gaterun_PARA.cand / gaterun_PARA.n).toFixed(2) + ". The Wilson interval, the delta, the " +
      "McNemar counts and the flipped item ids are all computed from that ledger. <b>The same run " +
      "reaches three different verdicts</b> — the difference is entirely policy.",
    interval: 1400,
    scenarios: [gaterun_scenario("headline"), gaterun_scenario("gated"), gaterun_scenario("corpus")],

    draw: function (step, d, ctx) {
      var k = step.k, mode = step.mode;
      var refuse = mode === "corpus", blind = mode === "headline";
      var i;

      // ---- the item grid: results, then flips ---------------------------
      var cells = [];
      for (i = 0; i < gaterun_ITEMS.length; i++) {
        var it = gaterun_ITEMS[i];
        var flipped = it.cand !== it.base;
        var flag, title;
        if (k < 2) {
          flag = "idle";
          title = it.id + " · " + it.bucket + " · not scored yet";
        } else if (k >= 8) {
          flag = !flipped ? "idle" : it.cand > it.base ? "ok" : "bad";
          title = it.id + " · " + it.bucket + " · " +
            (!flipped ? "unchanged" : it.cand > it.base ? "fixed by this PR" : "broken by this PR");
        } else {
          flag = it.cand ? "ok" : "bad";
          title = it.id + " · " + it.bucket + " · this run " + (it.cand ? "pass" : "FAIL") +
            " · baseline " + (it.base ? "pass" : "fail");
        }
        cells.push({ label: "", flag: flag, title: title });
      }

      // ---- bucket gauges, once there is something to aggregate ----------
      var gauges = [];
      if (k >= 3) {
        for (i = 0; i < gaterun_BUCKETS.length; i++) {
          var b = gaterun_BUCKETS[i];
          var score = b.cand / b.n;
          var under = score < gaterun_T.bucket;
          gauges.push({
            label: b.name + " · " + b.cand + "/" + b.n,
            pct: score * 100,
            value: score.toFixed(2),
            flag: k < 6 ? undefined : under ? (blind ? "warn" : "bad") : "ok"
          });
        }
      }

      // ---- the checks, appended in the order the gate applies them ------
      var rows = [];
      if (k >= 4) {
        rows.push({
          label: "provenance · corpus + dataset hash",
          value: refuse ? "corpus moved — refuse to compare" : "match, comparable",
          flag: refuse ? "bad" : "ok"
        });
      }
      if (k >= 5) {
        rows.push({
          label: "floor · primary >= " + gaterun_T.floor.toFixed(2),
          value: gaterun_PC.toFixed(4) + "  pass",
          flag: "ok"
        });
      }
      if (k >= 6) {
        rows.push({
          label: "bucket floor · every bucket >= " + gaterun_T.bucket.toFixed(2),
          value: blind
            ? "not configured"
            : "paraphrase " + (gaterun_PARA.cand / gaterun_PARA.n).toFixed(4) + "  FAIL",
          flag: blind ? "warn" : "bad"
        });
      }
      if (k >= 7) {
        rows.push({
          label: "max regression · delta >= -" + gaterun_T.allow.toFixed(2),
          value: refuse
            ? "skipped — different measurement"
            : gaterun_DELTA.toFixed(4) + "  pass",
          flag: refuse ? "warn" : "ok"
        });
      }

      var failed = (!blind && k >= 6);
      var status =
        k === 0 ? "IDLE" :
        k === 1 ? "RUNNING" :
        k === 2 ? "SCORED" :
        k === 3 ? "AGGREGATED" :
        k === 4 ? (refuse ? "COMPARISON REFUSED" : "COMPARABLE") :
        k === 5 ? "CHECK 1 OF 3" :
        k === 6 ? (blind ? "CHECK 2 NOT CONFIGURED" : "CHECK 2 OF 3") :
        k === 7 ? (refuse ? "CHECK 3 SKIPPED" : "CHECK 3 OF 3") :
        failed ? "FAIL · exit 1" : "PASS · exit 0";
      var nodeFlag = k === 0 ? "idle" : failed ? "bad" : k >= 4 && refuse ? "warn" : "ok";

      return d.flow([
        d.stack([
          d.big(k >= 3 ? gaterun_PC.toFixed(4) : "—", "primary · this run",
            k < 3 ? "idle" : failed ? "bad" : "ok"),
          d.stat({
            label: "committed baseline",
            value: (blind && k >= 8) ? gaterun_PC.toFixed(4) : gaterun_PB.toFixed(4),
            sub: (blind && k >= 8) ? "auto-rewritten by a green run" : "a reviewed commit",
            flag: (blind && k >= 8) ? "bad" : undefined
          })
        ]),
        d.node({
          title: "gate",
          status: status,
          statusFlag: nodeFlag,
          badge: "n=" + gaterun_N,
          meta: blind
            ? "floor " + gaterun_T.floor.toFixed(2) + " · allowance " + gaterun_T.allow.toFixed(2) +
              " · no bucket policy · baseline auto-updates"
            : "floor " + gaterun_T.floor.toFixed(2) + " · allowance " + gaterun_T.allow.toFixed(2) +
              " · bucket floor " + gaterun_T.bucket.toFixed(2),
          flag: nodeFlag,
          gauges: gauges,
          rows: rows,
          body: k === 0
            ? d.mono("baseline.json   primary " + gaterun_PB.toFixed(4) + "   corpus " +
                gaterun_HASH.corpusBase + "   dataset " + gaterun_HASH.dataset)
            : d.cells(cells, {
                label: k >= 8 ? "per item · flips only" : "per item · " + gaterun_N + " frozen items",
                dense: true
              })
        }),
        d.stack([
          d.stat({
            label: "95% interval",
            value: k >= 3 ? gaterun_CI.lo.toFixed(2) + "–" + gaterun_CI.hi.toFixed(2) : "—",
            sub: k >= 3 ? gaterun_pct(gaterun_CI.width) + " points wide" : "Wilson, n=" + gaterun_N,
            flag: k >= 3 ? "warn" : undefined
          }),
          d.stat({
            label: "paired, same items",
            value: (k >= 7 && !refuse)
              ? gaterun_MC.fixed.length + " fixed / " + gaterun_MC.broken.length + " broken"
              : "—",
            sub: refuse && k >= 7 ? "not comparable" : "McNemar discordant pairs",
            flag: (k >= 7 && !refuse) ? "warn" : undefined
          }),
          d.stat({
            label: "exit code",
            value: k >= 8 ? (failed ? "1" : "0") : "—",
            sub: k >= 8 ? (failed ? "build red" : "merged") : "not decided",
            flag: k < 8 ? undefined : failed ? "bad" : blind ? "bad" : "ok"
          })
        ])
      ]);
    }
  };

  // ====================================================================
  // ======================================================================
  // SIM · harnessrun  (harness-and-loops.md)
  // One model, one task, three harnesses. The model is the part you cannot
  // change, so WHAT IT TRIES is identical in every tab up to the point the
  // harness itself changes the model's options; only the loop around it
  // differs — who owns "done", which guards exist, and whether anything
  // checks the environment at the end.
  //
  // COST MODEL — every token on screen is produced by this, none typed in:
  //   base re-sent on EVERY request = system prompt 1,200
  //                                 + 6 tool schemas x 320
  //                                 = 3,120 tokens
  //   each turn appends to the transcript: assistant message 320 tokens
  //                                      + the tool result
  //   tool result = 1,400 tokens normally, or 50,000 when deploy_status
  //                 fails — the page's own example of one API response
  //                 dominating a whole trajectory
  //   billed(turn k) = (3,120 + transcript before k) + 320 out
  // The transcript is therefore charged again on every later turn, which is
  // why the bill is quadratic in turns even when nothing is happening.
  //   context window = 200,000 tokens.
  //
  // GUARDS, in the order a driver evaluates them:
  //   done? -> max turns -> token budget -> no-progress window
  // Caps are the page's: OpenAI Agents SDK DEFAULT_MAX_TURNS = 10 with a
  // strict ">" (10 errors on turn 11); LangGraph's shipped recursion_limit
  // = 10,007.
  // ======================================================================
  var harnessrun_SYS = 1200;
  var harnessrun_NTOOLS = 6;
  var harnessrun_SCHEMA = 320;
  var harnessrun_BASE = harnessrun_SYS + harnessrun_NTOOLS * harnessrun_SCHEMA; // 3,120
  var harnessrun_OUT = 320;          // assistant message per turn
  var harnessrun_OK = 1400;          // an ordinary tool result
  var harnessrun_DUMP = 50000;       // the failing deploy_status payload
  var harnessrun_WIN = 200000;       // context window
  var harnessrun_SDKCAP = 10;        // OpenAI Agents SDK DEFAULT_MAX_TURNS
  var harnessrun_LGCAP = 10007;      // LangGraph shipped recursion_limit
  var harnessrun_BUDGET = 250000;    // the only tab that sets one
  var harnessrun_NPW = 3;            // no-progress window
  var harnessrun_SUITE = 5;          // tests in the deterministic check

  function harnessrun_n(x) {
    var s = String(Math.round(x)), out = "", c = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s.charAt(i) + out;
      c++;
      if (c % 3 === 0 && i > 0) out = "," + out;
    }
    return out;
  }

  // What the model tries on turn k. Turns 1-4 are the same everywhere; from
  // turn 5 the only route to the last failing test runs through a tool that
  // is down, and it returns the same 50,000-token payload every time.
  function harnessrun_act(k) {
    if (k === 1) return { tool: "run_tests", ok: true, tests: 1, act: "progress" };
    if (k === 2) return { tool: "edit_file parser.py", ok: true, tests: 3, act: "progress" };
    if (k === 3) return { tool: "edit_file parser.py", ok: true, tests: 4, act: "progress" };
    if (k === 4) return { tool: "edit_file parser.py", ok: true, tests: 4, act: "repeat" };
    return {
      tool: "deploy_status" + (k > 5 ? " (retry " + (k - 5) + ")" : ""),
      ok: false, tests: 4, act: "error",
    };
  }

  // The loop driver's accounting. quitAt = the turn on which the model emits
  // no tool calls (so there is no tool result to append).
  function harnessrun_walk(n, quitAt) {
    var hist = 0, cum = 0, prev = 0, since = 0, rows = [];
    for (var k = 1; k <= n; k++) {
      var a = harnessrun_act(k);
      var quit = quitAt === k;
      var inTok = harnessrun_BASE + hist;
      var billed = inTok + harnessrun_OUT;
      cum += billed;
      var res = quit ? 0 : (a.ok ? harnessrun_OK : harnessrun_DUMP);
      hist += harnessrun_OUT + res;
      var moved = !quit && a.tests > prev;
      since = moved ? 0 : since + 1;
      if (!quit) prev = a.tests;
      rows.push({
        turn: k, tool: quit ? null : a.tool, act: quit ? "stop" : a.act,
        inTok: inTok, res: res, billed: billed, cum: cum,
        tests: prev, since: since, nextIn: harnessrun_BASE + hist,
      });
    }
    return rows;
  }

  // Cumulative bill after n turns of the same trajectory — used to price the
  // caps that never fire in six turns.
  function harnessrun_cumAt(n) {
    var hist = 0, cum = 0;
    for (var k = 1; k <= n; k++) {
      cum += harnessrun_BASE + hist + harnessrun_OUT;
      hist += harnessrun_OUT + (harnessrun_act(k).ok ? harnessrun_OK : harnessrun_DUMP);
    }
    return cum;
  }

  var harnessrun_MARK = { progress: "+", repeat: "=", error: "!", stop: "▪" };
  var harnessrun_MFLAG = { progress: "ok", repeat: "warn", error: "bad", stop: "ok" };

  function harnessrun_marks(rows, upto) {
    var cells = [];
    for (var i = 0; i < rows.length && i < upto; i++) {
      var r = rows[i];
      cells.push({
        label: harnessrun_MARK[r.act] + r.turn,
        flag: harnessrun_MFLAG[r.act],
        title: "turn " + r.turn + ": " + (r.tool || "no tool calls") +
          " · " + harnessrun_n(r.billed) + " tokens billed · " +
          r.tests + "/" + harnessrun_SUITE + " passing",
      });
    }
    return cells;
  }

  // One rendered frame for one executed turn.
  function harnessrun_turn(rows, k, cfg, caption, flag) {
    var r = rows[k - 1];
    return {
      caption: caption, flag: flag, phase: "turn",
      turn: r.turn, tool: r.tool, act: r.act, inTok: r.inTok, res: r.res,
      billed: r.billed, cum: r.cum, tests: r.tests, since: r.since,
      nextIn: r.nextIn, marks: harnessrun_marks(rows, k),
      cap: cfg.cap, capName: cfg.capName, budget: cfg.budget, npw: cfg.npw,
      owner: cfg.owner, harness: cfg.harness,
    };
  }

  // --- tab 1: turn-based — the model decides when it is done --------------
  function harnessrun_turnbased() {
    var cfg = {
      cap: harnessrun_SDKCAP, capName: "max_turns 10",
      budget: 0, npw: 0, owner: "the model",
      harness: "turn-based",
    };
    var rows = harnessrun_walk(5, 5);
    var s = [{
      caption: "A turn-based loop: the prompt is <i>make the 5 failing tests pass</i>, " +
        "the model decides when it is finished, and nothing verifies the result. " +
        "Same model and same task in all three tabs — only the harness changes.",
      phase: "idle", turn: 0, marks: [], cap: cfg.cap, capName: cfg.capName,
      budget: cfg.budget, npw: cfg.npw, owner: cfg.owner, harness: cfg.harness,
      tests: 0, cum: 0, since: 0,
    }];
    s.push(harnessrun_turn(rows, 1, cfg,
      "<b>Turn 1.</b> <code>run_tests</code> — ground truth read from the environment, " +
      "which is the load-bearing requirement of an agent loop. <b>1 of 5</b> passing. " +
      "The request cost " + harnessrun_n(harnessrun_BASE) + " tokens: system prompt " +
      harnessrun_n(harnessrun_SYS) + " + " + harnessrun_NTOOLS + " tool schemas × " +
      harnessrun_SCHEMA + ". The transcript is still empty and it is already the whole bill.", "ok"));
    s.push(harnessrun_turn(rows, 2, cfg,
      "<b>Turn 2.</b> Edits <code>parser.py</code>, reruns: <b>3 of 5</b>. This request was " +
      harnessrun_n(rows[1].inTok) + " tokens — base plus turn 1's transcript. Everything " +
      "accumulates, and every turn pays for all of it again.", "ok"));
    s.push(harnessrun_turn(rows, 3, cfg,
      "<b>Turn 3.</b> <b>4 of 5</b>. Three turns, three real gains, " +
      harnessrun_n(rows[2].cum) + " tokens billed so far. This is what a loop looks like " +
      "when the environment is answering.", "ok"));
    s.push(harnessrun_turn(rows, 4, cfg,
      "<b>Turn 4.</b> Another edit to the same file; the suite still reads <b>4 of 5</b>. " +
      "Nothing moved. A turn-based loop has no counter for that — the only thing watching " +
      "is the model.", "warn"));
    s.push(harnessrun_turn(rows, 5, cfg,
      "<b>Turn 5 — the model emits no tool calls.</b> That is exit 1 of 4 and the only clean " +
      "one; the Agent SDK types it <code>success</code>. It returns a fluent summary: " +
      "“Fixed the parser — the suite should be green.” " + harnessrun_n(rows[4].cum) +
      " tokens, 5 turns of a 10-turn cap, no guard ever fired.", "warn"));
    s.push({
      caption: "<b>Nobody ran the suite.</b> It is still <b>4 of 5</b>. The agent declared " +
        "success and the harness had nothing that could contradict it — the failure mode " +
        "measured at <b>45–48% of all failures</b> over ~11,700 trajectories, and nearly " +
        "invisible to an LLM judge because the report is fluent and confident. The defence " +
        "is not a better judge, it is a test run: <b>verification cost 0 model tokens and " +
        "changed the answer.</b>",
      flag: "bad", phase: "verify", turn: 5, tool: null, act: "stop",
      cum: rows[4].cum, tests: 4, claimed: harnessrun_SUITE, since: rows[4].since,
      marks: harnessrun_marks(rows, 5), cap: cfg.cap, capName: cfg.capName,
      budget: cfg.budget, npw: cfg.npw, owner: cfg.owner, harness: cfg.harness,
      outcome: "success (reported)",
    });
    return { id: "turnbased", label: "Turn-based · model decides", steps: s };
  }

  // --- tab 2: the retry that has no bound ---------------------------------
  function harnessrun_unbounded() {
    var cfg = {
      cap: harnessrun_LGCAP, capName: "recursion_limit 10,007",
      budget: 0, npw: 0, owner: "a deterministic check",
      harness: "goal-based, unbounded retry",
    };
    var rows = harnessrun_walk(8, 0);
    var proj = harnessrun_cumAt(harnessrun_LGCAP);
    var s = [{
      caption: "Same model, same task, but the prompt now carries an explicit criterion — " +
        "<i>all 5 tests pass</i> — so the model does not get to call it done. The error " +
        "handler retries with feedback, and nobody bounded it.",
      phase: "idle", turn: 0, marks: [], cap: cfg.cap, capName: cfg.capName,
      budget: cfg.budget, npw: cfg.npw, owner: cfg.owner, harness: cfg.harness,
      tests: 0, cum: 0, since: 0,
    }];
    s.push(harnessrun_turn(rows, 1, cfg,
      "<b>Turn 1.</b> <code>run_tests</code>: <b>1 of 5</b>. Identical to the first tab — " +
      "the model is the part you cannot change, so the opening is the same everywhere.", "ok"));
    s.push(harnessrun_turn(rows, 2, cfg,
      "<b>Turn 2.</b> <b>3 of 5</b>, " + harnessrun_n(rows[1].billed) + " tokens billed.", "ok"));
    s.push(harnessrun_turn(rows, 3, cfg,
      "<b>Turn 3.</b> <b>4 of 5</b>. Four turns in, the whole run has cost " +
      harnessrun_n(rows[2].cum) + " tokens. Remember that figure.", "ok"));
    s.push(harnessrun_turn(rows, 4, cfg,
      "<b>Turn 4.</b> Edit, rerun, still <b>4 of 5</b> — and here the criterion changes the " +
      "model's behaviour: told exactly what “done” means, it does not stop at turn 5 " +
      "the way the first tab did. That divergence <i>is</i> the harness.", "warn"));
    s.push(harnessrun_turn(rows, 5, cfg,
      "<b>Turn 5.</b> The last test needs the deploy to be green, so the model calls " +
      "<code>deploy_status</code>. It 500s and returns a <b>" + harnessrun_n(harnessrun_DUMP) +
      "-token</b> JSON error payload. The turn itself cost only " + harnessrun_n(rows[4].billed) +
      " tokens — <b>the payload is free on the turn it arrives, and charged on every turn " +
      "after it.</b>", "bad"));
    s.push(harnessrun_turn(rows, 6, cfg,
      "<b>Turn 6 — retry 1.</b> The 500 was fed back as a tool result, so the model tries " +
      "again. The request is now <b>" + harnessrun_n(rows[5].inTok) + "</b> tokens. The retry " +
      "handler has no bound, which is the largest documented cause of infinite agent loops: " +
      "<b>retry-feedback-without-bound, 25.0%</b> of 68 confirmed cases across 6,549 scanned " +
      "repositories.", "bad"));
    s.push(harnessrun_turn(rows, 7, cfg,
      "<b>Turn 7 — retry 2.</b> " + harnessrun_n(rows[6].inTok) + " tokens in, another " +
      harnessrun_n(harnessrun_DUMP) + " out. Cumulative <b>" + harnessrun_n(rows[6].cum) +
      "</b> against " + harnessrun_n(rows[3].cum) + " after the four turns that actually did " +
      "something. Nothing is happening and the cost is <i>accelerating</i>.", "bad"));
    s.push({
      caption: "<b>Turn 8 — retry 3.</b> This request was " + harnessrun_n(rows[7].inTok) +
        " tokens, " + Math.round((rows[7].inTok / harnessrun_WIN) * 100) + "% of a " +
        harnessrun_n(harnessrun_WIN) + "-token window; the next is " +
        harnessrun_n(rows[7].nextIn) + " and does not fit. Auto-compaction fires — and the " +
        "next tool result is another " + harnessrun_n(harnessrun_DUMP) + "-token payload that " +
        "refills a quarter of the window immediately. That is <b>compaction thrashing</b>, and " +
        "it ends in an error, not a recovery. The loop has reached <b>none of the four exits</b>; " +
        "its only remaining bound is the framework default, and LangGraph's shipped " +
        "<code>recursion_limit</code> is <b>10,007</b> — which on this cost model authorises <b>" +
        harnessrun_n(proj) + " input tokens</b> (" + (proj / 1e12).toFixed(1) + " trillion). " +
        "<b>An unbounded retry is a bill with no ceiling.</b>",
      flag: "bad", phase: "turn", turn: 8, tool: rows[7].tool, act: "error",
      inTok: rows[7].inTok, res: rows[7].res, billed: rows[7].billed, cum: rows[7].cum,
      tests: rows[7].tests, since: rows[7].since, nextIn: rows[7].nextIn,
      marks: harnessrun_marks(rows, 8), cap: cfg.cap, capName: cfg.capName,
      budget: cfg.budget, npw: cfg.npw, owner: cfg.owner, harness: cfg.harness,
      overflow: true,
    });
    return { id: "unbounded", label: "Unbounded retry", steps: s };
  }

  // --- tab 3: goal-based, with the guard that stops for a reason ----------
  function harnessrun_guarded() {
    var cfg = {
      cap: harnessrun_SDKCAP, capName: "max_turns 10",
      budget: harnessrun_BUDGET, npw: harnessrun_NPW,
      owner: "a deterministic check",
      harness: "goal-based + no-progress " + harnessrun_NPW,
    };
    var rows = harnessrun_walk(8, 0);
    var stop = rows[5];                       // the run is cut entering turn 7
    var budgetStop = rows[7];                 // where the budget cap alone would land
    var capStop = harnessrun_cumAt(harnessrun_SDKCAP);
    var s = [{
      caption: "Same explicit criterion as the middle tab — <i>all 5 tests pass</i>, checked " +
        "by running the suite — plus three guards the driver evaluates before each turn: " +
        "max_turns 10, a " + harnessrun_n(harnessrun_BUDGET) + "-token budget, and a " +
        "no-progress window of " + harnessrun_NPW + ".",
      phase: "idle", turn: 0, marks: [], cap: cfg.cap, capName: cfg.capName,
      budget: cfg.budget, npw: cfg.npw, owner: cfg.owner, harness: cfg.harness,
      tests: 0, cum: 0, since: 0,
    }];
    s.push(harnessrun_turn(rows, 1, cfg,
      "<b>Turn 1.</b> <code>run_tests</code>: <b>1 of 5</b>. The check that owns " +
      "“done” is the same command the agent just ran — which is the point. " +
      "No-progress counter resets to 0.", "ok"));
    s.push(harnessrun_turn(rows, 2, cfg,
      "<b>Turn 2.</b> <b>3 of 5</b>. The counter measures the <i>environment</i>, not the " +
      "model's opinion of itself, so it cannot be talked into a reset.", "ok"));
    s.push(harnessrun_turn(rows, 3, cfg,
      "<b>Turn 3.</b> <b>4 of 5</b>, " + harnessrun_n(rows[2].cum) + " tokens. Three " +
      "consecutive gains.", "ok"));
    s.push(harnessrun_turn(rows, 4, cfg,
      "<b>Turn 4.</b> Still <b>4 of 5</b>. First turn that moved nothing — " +
      "<b>no-progress 1 of " + harnessrun_NPW + "</b>. The counter is the only thing in this " +
      "loop that noticed.", "warn"));
    s.push(harnessrun_turn(rows, 5, cfg,
      "<b>Turn 5.</b> <code>deploy_status</code> 500s with its " +
      harnessrun_n(harnessrun_DUMP) + "-token payload. <b>No-progress 2 of " + harnessrun_NPW +
      "</b>. Identical to the middle tab so far — same model, same turns, same bill of " +
      harnessrun_n(rows[4].cum) + ".", "warn"));
    s.push(harnessrun_turn(rows, 6, cfg,
      "<b>Turn 6 — retry 1.</b> " + harnessrun_n(rows[5].inTok) + "-token request, another " +
      "500. <b>No-progress 3 of " + harnessrun_NPW + "</b>. The window is full; the next guard " +
      "check will not let turn 7 start.", "warn"));
    s.push({
      caption: "<b>Top of turn 7 — guards run before the model does.</b> done? " +
        stop.tests + " of " + harnessrun_SUITE + ", no. max turns? 6 of " + harnessrun_SDKCAP +
        ", no. budget? " + harnessrun_n(stop.cum) + " of " + harnessrun_n(harnessrun_BUDGET) +
        ", no. no-progress? <b>" + harnessrun_NPW + " of " + harnessrun_NPW + " — fires.</b> " +
        "Stopped at <b>6 turns for " + harnessrun_n(stop.cum) + " tokens</b>. Every guard above " +
        "it would have let the run continue; this is the only one that stopped for a " +
        "<i>reason</i> rather than on exhaustion.",
      flag: "warn", phase: "guard", turn: 7, tool: null, act: "stop",
      cum: stop.cum, tests: stop.tests, since: stop.since, inTok: 0, res: 0,
      nextIn: stop.nextIn, marks: harnessrun_marks(rows, 6),
      cap: cfg.cap, capName: cfg.capName, budget: cfg.budget, npw: cfg.npw,
      owner: cfg.owner, harness: cfg.harness, fired: "no progress",
      outcome: "stopped: no progress",
    });
    s.push({
      caption: "<b>Checked against the environment, not the report:</b> " + stop.tests +
        " of " + harnessrun_SUITE + " passing, <code>deploy_status</code> is down, and that is " +
        "what the run returns — a truthful failure in " + harnessrun_n(stop.cum) + " tokens. " +
        "Left to the budget cap alone the same six turns would have run to turn 8 and " +
        harnessrun_n(budgetStop.cum) + " tokens (" + (budgetStop.cum / stop.cum).toFixed(1) +
        "×) — and note it <i>overshoots its own cap by " +
        harnessrun_n(budgetStop.cum - harnessrun_BUDGET) + " tokens</i>, because a budget " +
        "guard cannot stop a request it has already sent. <b>Caps stop when the money or the " +
        "turns run out; only the no-progress guard stops because the task is not moving.</b>",
      flag: "ok", phase: "verify", turn: 6, tool: null, act: "stop",
      cum: stop.cum, tests: stop.tests, claimed: stop.tests, since: stop.since,
      marks: harnessrun_marks(rows, 6), cap: cfg.cap, capName: cfg.capName,
      budget: cfg.budget, npw: cfg.npw, owner: cfg.owner, harness: cfg.harness,
      outcome: "stopped: no progress",
      compare: [
        ["no-progress window " + harnessrun_NPW, "turn 6", harnessrun_n(stop.cum), stop.tests + " of 5"],
        ["budget cap " + harnessrun_n(harnessrun_BUDGET), "turn 8", harnessrun_n(budgetStop.cum), stop.tests + " of 5"],
        ["SDK max_turns " + harnessrun_SDKCAP + " (raises on 11)", "turn 10", harnessrun_n(capStop), stop.tests + " of 5"],
        ["LangGraph default", "turn " + harnessrun_n(harnessrun_LGCAP), harnessrun_n(harnessrun_cumAt(harnessrun_LGCAP)), stop.tests + " of 5"],
      ],
    });
    return { id: "guarded", label: "Goal-based + no-progress 3", steps: s };
  }

  S["harnessrun"] = {
    title: "Run the same agent under three harnesses",
    note: "One model, one task — <i>make the 5 failing tests pass</i> — and three loops " +
      "around it. Every token is computed from one cost model: <b>" +
      harnessrun_n(harnessrun_BASE) + " tokens</b> of system prompt (" +
      harnessrun_n(harnessrun_SYS) + ") plus " + harnessrun_NTOOLS + " tool schemas (×" +
      harnessrun_SCHEMA + ") are re-sent on <i>every</i> request; each turn appends a " +
      harnessrun_OUT + "-token assistant message plus its tool result — " +
      harnessrun_n(harnessrun_OK) + " tokens normally, <b>" + harnessrun_n(harnessrun_DUMP) +
      "</b> when <code>deploy_status</code> fails, this page's own example of one response " +
      "dominating a trajectory. Guards are checked in driver order: done? → max turns → " +
      "budget → no-progress. Compare the tabs: the model never changes.",
    interval: 1400,
    scenarios: [harnessrun_turnbased(), harnessrun_unbounded(), harnessrun_guarded()],

    draw: function (step, d, ctx) {
      var idle = step.phase === "idle";
      var ctxUsed = step.phase === "turn" && step.inTok ? step.inTok : (step.nextIn || 0);
      var ctxPct = (ctxUsed / harnessrun_WIN) * 100;

      // --- what the model emitted this frame ------------------------------
      var emitted = idle ? "waiting"
        : step.phase === "guard" ? "not called"
        : step.phase === "verify" ? "loop exited"
        : step.act === "stop" ? "no tool calls"
        : "1 tool call";
      var modelFlag = idle ? "idle"
        : step.act === "stop" && step.phase === "turn" ? "warn"
        : step.act === "error" ? "bad"
        : step.phase === "turn" ? "ok" : "idle";

      // --- guards, in the order the driver checks them --------------------
      var doneRow = {
        label: "1 · done?",
        value: step.owner === "the model"
          ? (step.act === "stop" && step.phase !== "idle" ? "model says yes" : "model says no")
          : step.tests + " of " + harnessrun_SUITE + " passing",
        flag: step.phase === "verify" && step.claimed && step.claimed > step.tests ? "bad"
          : step.act === "stop" && step.phase === "turn" ? "warn" : undefined,
      };
      var turnRow = {
        label: "2 · max turns",
        value: (step.turn || 0) + " / " + harnessrun_n(step.cap),
        flag: step.cap === harnessrun_LGCAP ? "bad" : undefined,
      };
      var budgetRow = {
        label: "3 · token budget",
        value: step.budget
          ? harnessrun_n(step.cum || 0) + " / " + harnessrun_n(step.budget)
          : "none set",
        flag: step.budget ? ((step.cum || 0) >= step.budget ? "bad" : "ok") : "bad",
      };
      var npRow = {
        label: "4 · no-progress",
        value: step.npw
          ? (step.since || 0) + " / " + step.npw
          : "not built",
        flag: step.npw
          ? ((step.since || 0) >= step.npw ? "bad" : (step.since ? "warn" : "ok"))
          : "bad",
      };
      var guardStatus = step.fired ? "FIRED: " + step.fired
        : idle ? "armed"
        : step.phase === "verify" ? (step.outcome || "exited")
        : "all passing";

      // --- the transcript, turn by turn -----------------------------------
      var marks = step.marks && step.marks.length
        ? step.marks
        : [{ label: "—", flag: "idle", title: "no turns yet" }];

      var body = d.cells(marks, { label: "turns · + gained ground, = moved nothing, ! tool error", dense: marks.length > 8 }) +
        d.bar({
          label: "this request vs " + harnessrun_n(harnessrun_WIN) + " window",
          pct: ctxPct,
          value: harnessrun_n(ctxUsed) + " tok",
          flag: ctxPct >= 100 ? "bad" : ctxPct > 70 ? "warn" : ctxPct ? "ok" : "idle",
        });

      var flow = d.flow([
        d.stack([
          d.big(step.turn || "—", "turn"),
          d.dots({
            n: Math.round((step.res || 0) / 2000),
            label: step.res ? harnessrun_n(step.res) + " tokens returned" : "no tool result",
            flag: step.res >= harnessrun_DUMP ? "bad" : undefined,
          }),
        ]),
        d.node({
          title: "harness · " + step.harness,
          status: emitted,
          statusFlag: modelFlag,
          badge: step.capName,
          meta: harnessrun_NTOOLS + " tools · " + harnessrun_n(harnessrun_BASE) +
            " tok re-sent per request · “done” owned by " + step.owner,
          flag: modelFlag,
          body: body,
          rows: [
            { label: "tool called", value: step.tool || (idle ? "—" : "none") },
            {
              label: "billed this turn",
              value: step.phase === "turn" && step.billed
                ? harnessrun_n(step.inTok) + " in + " + harnessrun_OUT + " out"
                : "0 — no model call",
              flag: step.phase === "turn" && step.inTok > 50000 ? "bad" : undefined,
            },
          ],
        }),
        d.node({
          title: "loop guards (check order)",
          status: guardStatus,
          statusFlag: step.fired ? "warn" : idle ? "idle" : step.phase === "verify" && step.claimed && step.claimed > step.tests ? "bad" : "ok",
          flag: step.fired ? "warn" : undefined,
          rows: [doneRow, turnRow, budgetRow, npRow],
        }),
        d.stack([
          d.stat({
            label: "tokens billed",
            value: harnessrun_n(step.cum || 0),
            sub: "cumulative",
            flag: (step.cum || 0) > 200000 ? "bad" : (step.cum || 0) > 60000 ? "warn" : "ok",
          }),
          d.stat({
            label: step.phase === "verify" ? "environment says" : "deterministic check",
            value: (step.tests || 0) + " / " + harnessrun_SUITE,
            sub: step.phase === "verify" && step.claimed && step.claimed > step.tests
              ? "agent claimed " + step.claimed + " / " + harnessrun_SUITE
              : "tests passing",
            flag: step.phase === "verify"
              ? (step.claimed && step.claimed > step.tests ? "bad" : "ok")
              : undefined,
          }),
        ]),
      ]);

      var tail = "";
      if (step.phase === "turn" && step.inTok) {
        tail = d.mono("POST /messages  in=" + harnessrun_n(step.inTok) +
          "  out=" + harnessrun_OUT + "  result=" + harnessrun_n(step.res) +
          "  cumulative=" + harnessrun_n(step.cum),
          step.res >= harnessrun_DUMP ? "bad" : undefined);
      } else if (step.phase === "guard") {
        tail = d.mono("guard check @ turn " + step.turn + ": done=no  turns=" +
          (step.turn - 1) + "/" + step.cap + "  budget=ok  no_progress=" +
          step.since + "/" + step.npw + " -> STOP", "warn");
      } else if (step.phase === "verify") {
        tail = d.mono("$ pytest -q   ->  " + step.tests + " passed, " +
          (harnessrun_SUITE - step.tests) + " failed",
          step.claimed && step.claimed > step.tests ? "bad" : "ok");
      }
      if (step.overflow) {
        tail = d.mono("next request " + harnessrun_n(step.nextIn) + " > window " +
          harnessrun_n(harnessrun_WIN) + "  -> auto-compact -> next tool result " +
          harnessrun_n(harnessrun_DUMP) + " -> compact again", "bad");
      }
      if (step.compare) {
        tail += d.table(["stop rule", "stops at", "tokens billed", "end state"], step.compare);
      }

      return tail ? d.stack([flow, tail]) : flow;
    },
  };

  // ====================================================================
  // ======================================================================
  // SIM · judgeloop  (llm-as-a-judge.md)
  // The §3 loop actually run: rubric → hand labels → judge → Cohen's kappa →
  // iterate the rubric → deploy → the vendor bumps the model version → back
  // to the agreement check. Plus the pairwise order-swap from §6.
  //
  // CONFIG — everything on screen is recomputed from this, nothing is typed in
  //   calibration set  60 items (the page says hand-label 50–100)
  //   human labels     item i is GROUNDED unless i % 4 === 3
  //                    → 45 grounded / 15 ungrounded, 75% prevalence; an
  //                      imbalanced set, which is where raw agreement lies
  //   a rubric version is stated as two counts and nothing else:
  //                    c = how many of the 15 ungrounded answers it CATCHES
  //                    f = how many of the 45 grounded answers it FALSE-ALARMS
  //                    The specific items are picked by a stride coprime with
  //                    the list length, so hits scatter instead of blocking.
  //   kappa            the page's own cohens_kappa(), ported to ES5:
  //                      observed = agreement / n
  //                      expected = p(both true) + p(both false)
  //                      kappa    = (observed − expected) / (1 − expected)
  //   pairwise tab     20 A/B pairs; B is genuinely better on 11, A on 9.
  //                    Position bias = 15%, the midpoint of the page's stated
  //                    10–20 point band → 3 of 20 pairs are decided by order
  //                    alone, at indices (2 + 7k) mod 20.
  //
  // The four rubric versions land at κ = 0.22 / 0.59 / 0.77 / 0.50 — inside
  // the bands the page's own rubric table predicts. That is a consequence of
  // (c, f), not an assertion: change c or f and every figure moves.
  // ======================================================================
  var judgeloop_N = 60;

  function judgeloop_buildHuman() {
    var a = [], i;
    for (i = 0; i < judgeloop_N; i++) a.push(i % 4 !== 3);
    return a;
  }
  var judgeloop_HUMAN = judgeloop_buildHuman();

  function judgeloop_indices(want) {
    var a = [], i;
    for (i = 0; i < judgeloop_N; i++) if (judgeloop_HUMAN[i] === want) a.push(i);
    return a;
  }
  var judgeloop_GND = judgeloop_indices(true);    // 45 grounded answers
  var judgeloop_UNG = judgeloop_indices(false);   // 15 ungrounded answers

  // Pick k members of a list, spread by a stride coprime with its length so
  // the judge's catches and false alarms scatter through the grid instead of
  // forming a block. 7 is coprime with 15, 13 with 45.
  function judgeloop_pick(list, k, stride) {
    var out = [], n = list.length, i;
    for (i = 0; i < k && i < n; i++) out.push(list[(i * stride) % n]);
    return out;
  }

  // A rubric version produces one verdict per item. Default verdict is
  // "grounded" — a judge only fails an item when something in the rubric
  // gives it grounds to.
  function judgeloop_run(rub) {
    var v = [], i;
    for (i = 0; i < judgeloop_N; i++) v.push(true);
    var caught = judgeloop_pick(judgeloop_UNG, rub.c, 7);
    var alarms = judgeloop_pick(judgeloop_GND, rub.f, 13);
    for (i = 0; i < caught.length; i++) v[caught[i]] = false;
    for (i = 0; i < alarms.length; i++) v[alarms[i]] = false;
    return v;
  }

  // Cohen's kappa, ported straight from the page's cohens_kappa(), with the
  // confusion cells kept so the disagreements stay inspectable.
  function judgeloop_kappa(human, model) {
    var n = human.length, i, agree = 0, sh = 0, sm = 0;
    var tp = 0, tn = 0, missed = 0, alarm = 0;
    for (i = 0; i < n; i++) {
      if (human[i] === model[i]) agree++;
      if (human[i]) sh++;
      if (model[i]) sm++;
      if (human[i] && model[i]) tp++;
      else if (!human[i] && !model[i]) tn++;
      else if (!human[i] && model[i]) missed++;   // ungrounded answer waved through
      else alarm++;                               // grounded answer failed
    }
    var observed = agree / n;
    var ph = sh / n, pm = sm / n;
    var expected = ph * pm + (1 - ph) * (1 - pm);
    return {
      n: n, agree: agree, observed: observed, expected: expected,
      kappa: expected < 1 ? (observed - expected) / (1 - expected) : 1,
      tp: tp, tn: tn, missed: missed, alarm: alarm,
      passed: sm, failed: n - sm, verdicts: model
    };
  }

  // The rubric versions. (c, f) is the entire model of each judge.
  var judgeloop_RUB = {
    v1: {
      tag: "v1", c: 5, f: 6,
      text: "“Rate the quality 1–10.” Pass at ≥ 7."
    },
    yes: {
      tag: "—", c: 0, f: 0,
      text: "Control: a judge that answers “grounded” to everything."
    },
    v2: {
      tag: "v2", c: 10, f: 4,
      text: "“Rate helpfulness 1–5” with an anchor written for each level."
    },
    v3: {
      tag: "v3", c: 12, f: 2,
      text: "“Is every claim in the answer supported by the context? yes/no.”"
    },
    v3b: {
      tag: "v3", c: 9, f: 5,
      text: "v3 unchanged — scored by the vendor’s new model version."
    }
  };

  function judgeloop_score(key) {
    return judgeloop_kappa(judgeloop_HUMAN, judgeloop_run(judgeloop_RUB[key]));
  }
  var judgeloop_S_V1 = judgeloop_score("v1");
  var judgeloop_S_YES = judgeloop_score("yes");
  var judgeloop_S_V2 = judgeloop_score("v2");
  var judgeloop_S_V3 = judgeloop_score("v3");
  var judgeloop_S_V3B = judgeloop_score("v3b");

  // The kappa scale, read the way the page insists it be read.
  function judgeloop_band(k) {
    if (k < 0.4) return { label: "NOISE", flag: "bad", text: "below 0.4 — not measuring your construct" };
    if (k < 0.6) return { label: "REPORT IT", flag: "warn", text: "0.4–0.6 — usable only if the kappa travels with the number" };
    if (k < 0.8) return { label: "GATE-ABLE", flag: "ok", text: "above 0.6 — you can gate a pull request on it" };
    return { label: "SUSPICIOUS", flag: "warn", text: "above 0.8 is rare — ask whether the task needed an LLM" };
  }

  function judgeloop_pct(x) { return (x * 100).toFixed(1) + "%"; }

  // The §3 flow, as a strip of stage pills.
  var judgeloop_STAGES = ["1 rubric", "2 label 60", "3 run judge", "4 kappa", "5 iterate", "6 at scale", "H re-check"];
  function judgeloop_stagePills(cur, skipped) {
    var out = [], i, j, sk;
    for (i = 0; i < judgeloop_STAGES.length; i++) {
      sk = false;
      if (skipped) for (j = 0; j < skipped.length; j++) if (skipped[j] === i) sk = true;
      out.push({
        label: judgeloop_STAGES[i],
        flag: sk ? "bad" : i < cur ? "ok" : i === cur ? "warn" : "idle"
      });
    }
    return out;
  }

  // --- scenario 1: the two-hour build, shipped --------------------------
  function judgeloop_ship() {
    var v1 = judgeloop_RUB.v1, s1 = judgeloop_S_V1, sy = judgeloop_S_YES;
    var steps = [{
      caption: "60 candidate answers and their contexts. No rubric, no labels, " +
        "nothing measured yet — press Play and build the judge the way it usually gets built.",
      show: "empty", res: s1, rub: null, stage: 0, skipped: []
    }];
    steps.push({
      caption: "<b>Write the rubric.</b> " + v1.text + " It is an adjective on a scale: nothing " +
        "in it names a specific, checkable event, so every item is a judgement call.",
      show: "empty", res: s1, rub: v1, stage: 0, skipped: [], flag: "warn"
    });
    steps.push({
      caption: "<b>Run it over all " + judgeloop_N + ".</b> The judge passes <b>" + s1.passed +
        "</b> and fails <b>" + s1.failed + "</b>. Two hours of work and the pipeline is green. " +
        "Note what has <i>not</i> happened: no human has looked at any of these.",
      show: "verdicts", res: s1, rub: v1, stage: 2, skipped: [1], flag: "warn"
    });
    steps.push({
      caption: "<b>Ship it.</b> The dashboard reports the pass rate: " + s1.passed + "/" +
        judgeloop_N + " = <b>" + judgeloop_pct(s1.passed / judgeloop_N) + "</b>. This is the 0.83 " +
        "in the first paragraph of the page — a number with a decimal point and no instrument " +
        "behind it.",
      show: "verdicts", res: s1, rub: v1, stage: 5, skipped: [1, 3, 4], flag: "bad"
    });
    steps.push({
      caption: "<b>“How do you know it is right?”</b> The skipped step, done late: hand-label " +
        "the same " + judgeloop_N + " items. <b>" + judgeloop_GND.length + "</b> grounded, <b>" +
        judgeloop_UNG.length + "</b> not — the “!” cells. A " +
        judgeloop_pct(judgeloop_GND.length / judgeloop_N) + " prevalence, which is the detail that " +
        "is about to matter.",
      show: "labels", res: s1, rub: v1, stage: 1, skipped: [], flag: "warn"
    });
    steps.push({
      caption: "<b>Raw agreement.</b> Judge and human give the same verdict on <b>" + s1.agree +
        "/" + judgeloop_N + " = " + judgeloop_pct(s1.observed) + "</b>. That reads like agreement. " +
        "It hides <b>" + s1.missed + "</b> ungrounded answers waved through (red) and <b>" + s1.alarm +
        "</b> good answers failed (amber).",
      show: "scored", res: s1, rub: v1, stage: 3, skipped: [], flag: "warn", hideKappa: true
    });
    steps.push({
      caption: "<b>The control that settles it.</b> Swap in a judge that answers “grounded” " +
        "to everything and never reads a word. It scores <b>" + judgeloop_pct(sy.observed) +
        "</b> raw agreement — <i>higher</i> than the rubric that was actually trying. Raw " +
        "percentage on an imbalanced set is not evidence.",
      show: "scored", res: sy, rub: judgeloop_RUB.yes, stage: 3, skipped: [], flag: "bad", hideKappa: true
    });
    steps.push({
      caption: "<b>Kappa corrects for the agreement you would get by chance.</b> The do-nothing " +
        "judge scores <b>" + sy.kappa.toFixed(2) + "</b> — the honest answer for something that " +
        "learned nothing. Rubric v1 scores <b>" + s1.kappa.toFixed(2) + "</b>, also below 0.4, also " +
        "noise. The shipped " + judgeloop_pct(s1.passed / judgeloop_N) + " was never a measurement; " +
        "it was the judge agreeing with itself.",
      show: "scored", res: sy, rub: judgeloop_RUB.yes, stage: 3, skipped: [], flag: "bad"
    });
    return { id: "ship", label: "Ship the first rubric", steps: steps };
  }

  // --- scenario 2: the loop, run in order --------------------------------
  function judgeloop_loop() {
    var s1 = judgeloop_S_V1, s2 = judgeloop_S_V2, s3 = judgeloop_S_V3, sb = judgeloop_S_V3B;
    var steps = [{
      caption: "The same " + judgeloop_N + " items. This time the flow runs in the order the page " +
        "gives it, and the rubric is the thing that changes — never the labels.",
      show: "empty", res: s1, rub: null, stage: 0, skipped: []
    }];
    steps.push({
      caption: "<b>Step 2 — label by hand.</b> " + judgeloop_N + " items read and judged by a " +
        "person: <b>" + judgeloop_GND.length + "</b> grounded, <b>" + judgeloop_UNG.length +
        "</b> not. Tedious, and it is the whole point: this set is the ruler every rubric below " +
        "gets measured against.",
      show: "labels", res: s1, rub: null, stage: 1, skipped: [], flag: "ok"
    });
    steps.push({
      caption: "<b>Rubric v1 — κ = " + s1.kappa.toFixed(2) + ".</b> " +
        judgeloop_pct(s1.observed) + " raw agreement, but only " + s1.tn + " of " +
        judgeloop_UNG.length + " ungrounded answers caught. " + judgeloop_band(s1.kappa).text +
        ". Rewrite the <i>prompt</i> — moving the labels to match the judge is circular.",
      show: "scored", res: s1, rub: judgeloop_RUB.v1, stage: 4, skipped: [], flag: "bad"
    });
    steps.push({
      caption: "<b>Rubric v2 — κ = " + s2.kappa.toFixed(2) + ".</b> Anchors written for " +
        "each level pull the catch rate from " + s1.tn + " to <b>" + s2.tn + "</b> of " +
        judgeloop_UNG.length + " and cut false alarms from " + s1.alarm + " to " + s2.alarm +
        ". " + judgeloop_band(s2.kappa).text + ".",
      show: "scored", res: s2, rub: judgeloop_RUB.v2, stage: 4, skipped: [], flag: "warn"
    });
    steps.push({
      caption: "<b>Rubric v3 — κ = " + s3.kappa.toFixed(2) + ".</b> The rubric now names " +
        "the <i>failure</i>, not the virtue, and it is decidable: " + s3.tn + " of " +
        judgeloop_UNG.length + " caught, " + s3.alarm + " false " +
        (s3.alarm === 1 ? "alarm" : "alarms") + ". " + judgeloop_band(s3.kappa).text + ". " +
        "Same model, same items — the rubric carried all of that.",
      show: "scored", res: s3, rub: judgeloop_RUB.v3, stage: 4, skipped: [], flag: "ok"
    });
    steps.push({
      caption: "<b>Only now, run it at scale</b> — and tiered, or the bill kills it: " +
        "deterministic scorers on every push, the judge nightly over the full set, judge plus a " +
        "human sample at release. The κ of <b>" + s3.kappa.toFixed(2) +
        "</b> is printed beside every score it produces.",
      show: "scored", res: s3, rub: judgeloop_RUB.v3, stage: 5, skipped: [], flag: "ok"
    });
    steps.push({
      caption: "<b>The vendor bumps the model version.</b> The rubric did not change, the labels " +
        "did not change, the " + judgeloop_N + " items did not change. Re-running the agreement " +
        "check is the edge from H back to C that everybody forgets.",
      show: "scored", res: sb, rub: judgeloop_RUB.v3b, stage: 6, skipped: [], flag: "warn"
    });
    steps.push({
      caption: "<b>κ " + s3.kappa.toFixed(2) + " → " + sb.kappa.toFixed(2) +
        ".</b> Raw agreement barely moved — " + judgeloop_pct(s3.observed) + " to " +
        judgeloop_pct(sb.observed) + ", a dip you would call noise — while kappa fell straight " +
        "through the 0.6 gate. The instrument is no longer calibrated: the gate comes off, the " +
        "trend line gets annotated at this date, and the judge is re-baselined as a reviewed diff.",
      show: "scored", res: sb, rub: judgeloop_RUB.v3b, stage: 6, skipped: [], flag: "bad"
    });
    return { id: "loop", label: "Calibrate the rubric", steps: steps };
  }

  // --- scenario 3: pairwise, and the order it was asked in ---------------
  // 20 pairs. B is genuinely better on the first 11, A on the last 9.
  // Position bias 15% (midpoint of the page's 10–20 points) → 3 pairs are
  // decided by whichever answer was presented first.
  var judgeloop_PAIRS = 20;
  var judgeloop_TRUE_B = 11;
  var judgeloop_BIAS_PCT = 15;
  var judgeloop_BIAS_N = Math.round(judgeloop_PAIRS * judgeloop_BIAS_PCT / 100);

  function judgeloop_biasSet() {
    var a = [], i;
    for (i = 0; i < judgeloop_PAIRS; i++) a.push(false);
    for (i = 0; i < judgeloop_BIAS_N; i++) a[(2 + i * 7) % judgeloop_PAIRS] = true;
    return a;
  }
  var judgeloop_BIASED = judgeloop_biasSet();

  function judgeloop_truth() {
    var a = [], i;
    for (i = 0; i < judgeloop_PAIRS; i++) a.push(i < judgeloop_TRUE_B ? "B" : "A");
    return a;
  }
  var judgeloop_TRUTH = judgeloop_truth();

  // A pass over all 20 pairs with `first` presented first. On a bias-sensitive
  // pair the judge picks whatever it read first; otherwise it picks correctly.
  function judgeloop_pass(first) {
    var a = [], i;
    for (i = 0; i < judgeloop_PAIRS; i++) {
      a.push(judgeloop_BIASED[i] ? first : judgeloop_TRUTH[i]);
    }
    return a;
  }
  var judgeloop_P1 = judgeloop_pass("A");   // A shown first
  var judgeloop_P2 = judgeloop_pass("B");   // order swapped

  function judgeloop_reconcile() {
    var a = [], i;
    for (i = 0; i < judgeloop_PAIRS; i++) {
      a.push(judgeloop_P1[i] === judgeloop_P2[i] ? judgeloop_P1[i] : "=");
    }
    return a;
  }
  var judgeloop_REC = judgeloop_reconcile();

  function judgeloop_tally(verdicts) {
    var t = { A: 0, B: 0, tie: 0 }, i;
    for (i = 0; i < verdicts.length; i++) {
      if (verdicts[i] === "A") t.A++;
      else if (verdicts[i] === "B") t.B++;
      else t.tie++;
    }
    return t;
  }
  var judgeloop_T1 = judgeloop_tally(judgeloop_P1);
  var judgeloop_T2 = judgeloop_tally(judgeloop_P2);
  var judgeloop_TR = judgeloop_tally(judgeloop_REC);

  var judgeloop_PSTAGES = ["20 pairs", "A first", "tally", "swap order", "tally", "reconcile"];
  function judgeloop_ppills(cur) {
    var out = [], i;
    for (i = 0; i < judgeloop_PSTAGES.length; i++) {
      out.push({ label: judgeloop_PSTAGES[i], flag: i < cur ? "ok" : i === cur ? "warn" : "idle" });
    }
    return out;
  }

  function judgeloop_pairwise() {
    var t1 = judgeloop_T1, t2 = judgeloop_T2, tr = judgeloop_TR;
    var steps = [{
      caption: "A different shape of judge. <b>" + judgeloop_PAIRS + " pairs</b>: the old prompt " +
        "(A) against the new one (B), same question each time. Models are poor at absolute " +
        "calibration and good at comparison, so this is the question you should be asking.",
      mode: "pairwise", verdicts: null, stage: 0, reveal: false
    }];
    steps.push({
      caption: "<b>Pass 1.</b> Every pair presented with <b>A first</b>, B second. One call per " +
        "pair, temperature 0, reason before verdict.",
      mode: "pairwise", verdicts: judgeloop_P1, stage: 1, reveal: false, flag: "warn"
    });
    steps.push({
      caption: "<b>Pass 1 says A.</b> A wins <b>" + t1.A + "/" + judgeloop_PAIRS + " = " +
        judgeloop_pct(t1.A / judgeloop_PAIRS) + "</b>, B wins " + t1.B + ". Read as written, the " +
        "new prompt is worse and the change gets reverted.",
      mode: "pairwise", verdicts: judgeloop_P1, stage: 2, reveal: false, flag: "bad"
    });
    steps.push({
      caption: "<b>Pass 2 — same pairs, order swapped.</b> Identical answers, identical rubric, " +
        "identical model. The only thing that changed is which one the judge read first. This " +
        "second pass is the cheap, mandatory control.",
      mode: "pairwise", verdicts: judgeloop_P2, stage: 3, reveal: false, flag: "warn"
    });
    steps.push({
      caption: "<b>Pass 2 says B.</b> B wins <b>" + t2.B + "/" + judgeloop_PAIRS + " = " +
        judgeloop_pct(t2.B / judgeloop_PAIRS) + "</b>, A wins " + t2.A + ". The same experiment has " +
        "now produced both conclusions. One of these two numbers was going into a pull request.",
      mode: "pairwise", verdicts: judgeloop_P2, stage: 4, reveal: false, flag: "bad"
    });
    steps.push({
      caption: "<b>Where they disagree is the bias.</b> <b>" + tr.tie + " of " + judgeloop_PAIRS +
        "</b> pairs — " + judgeloop_pct(tr.tie / judgeloop_PAIRS) + " — changed answer with " +
        "nothing but the order, squarely inside the 10–20 point band the literature reports. " +
        "You cannot see which ones from a single pass.",
      mode: "pairwise", verdicts: judgeloop_P2, stage: 5, reveal: true, flag: "bad"
    });
    steps.push({
      caption: "<b>Reconcile: count a pair only where both orders agree.</b> The " + tr.tie +
        " order-sensitive pairs become ties. What survives is <b>B " + tr.B + ", A " + tr.A +
        ", " + tr.tie + " ties</b>.",
      mode: "pairwise", verdicts: judgeloop_REC, stage: 5, reveal: true, flag: "warn"
    });
    steps.push({
      caption: "<b>A margin of " + Math.abs(tr.B - tr.A) + " pair in " + judgeloop_PAIRS +
        ".</b> Both single-pass runs claimed a clear winner in opposite directions; the swap says " +
        "there is no evidence of one either way. The swap doubles your judge bill and it is the " +
        "difference between a result and a coin flip — if a pairwise number is quoted without " +
        "it, assume it was not done.",
      mode: "pairwise", verdicts: judgeloop_REC, stage: 5, reveal: true, flag: "ok"
    });
    return { id: "pair", label: "Pairwise + order swap", steps: steps };
  }

  // --- drawing ----------------------------------------------------------
  function judgeloop_cellTitle(step, i) {
    var human = judgeloop_HUMAN[i] ? "grounded" : "UNGROUNDED";
    if (step.show === "empty") return "item " + (i + 1) + " — unjudged, unlabelled";
    if (step.show === "labels") return "item " + (i + 1) + " — human: " + human;
    var v = step.res.verdicts[i] ? "grounded" : "not grounded";
    if (step.show === "verdicts") return "item " + (i + 1) + " — judge: " + v + " (no label to check it against)";
    return "item " + (i + 1) + " — human: " + human + " / judge: " + v +
      (judgeloop_HUMAN[i] === step.res.verdicts[i] ? " — agree" :
        (!judgeloop_HUMAN[i] ? " — MISSED, ungrounded answer waved through" : " — false alarm"));
  }

  function judgeloop_drawKappa(step, d) {
    var res = step.res, cells = [], i, lbl, fl, agree;
    for (i = 0; i < judgeloop_N; i++) {
      lbl = ""; fl = "idle";
      if (step.show === "verdicts") {
        lbl = res.verdicts[i] ? "" : "F";
        fl = res.verdicts[i] ? "idle" : "warn";
      } else if (step.show === "labels") {
        lbl = judgeloop_HUMAN[i] ? "" : "!";
        fl = undefined;
      } else if (step.show === "scored") {
        lbl = judgeloop_HUMAN[i] ? "" : "!";
        agree = judgeloop_HUMAN[i] === res.verdicts[i];
        fl = agree ? "ok" : (!judgeloop_HUMAN[i] ? "bad" : "warn");
      }
      cells.push({ label: lbl, flag: fl, title: judgeloop_cellTitle(step, i) });
    }

    var scored = step.show === "scored";
    var showK = scored && !step.hideKappa;
    var band = showK ? judgeloop_band(res.kappa) : null;

    var gauges = [];
    if (scored) {
      gauges.push({
        label: "raw agreement", pct: res.observed * 100,
        value: res.agree + "/" + judgeloop_N + " · " + judgeloop_pct(res.observed),
        flag: "warn"
      });
      gauges.push({
        label: "Cohen’s κ", pct: showK ? Math.max(0, res.kappa) * 100 : 0,
        value: showK ? res.kappa.toFixed(2) : "not computed",
        flag: showK ? band.flag : "idle"
      });
    }

    var rows = [];
    if (step.show === "labels" || scored) {
      rows.push({ label: "human: grounded / not", value: judgeloop_GND.length + " / " + judgeloop_UNG.length });
    }
    if (step.show === "verdicts" || scored) {
      rows.push({ label: "judge: passed / failed", value: res.passed + " / " + res.failed });
    }
    if (scored) {
      rows.push({
        label: "ungrounded caught", value: res.tn + " of " + judgeloop_UNG.length,
        flag: res.tn === judgeloop_UNG.length ? "ok" : res.tn === 0 ? "bad" : "warn"
      });
      rows.push({ label: "waved through (missed)", value: String(res.missed), flag: res.missed ? "bad" : "ok" });
      rows.push({ label: "false alarms", value: String(res.alarm), flag: res.alarm ? "warn" : "ok" });
    }

    var status = step.show === "empty" ? "UNLABELLED"
      : step.show === "verdicts" ? "JUDGED, UNCHECKED"
      : step.show === "labels" ? "CALIBRATION SET"
      : showK ? band.label : "AGREEMENT ONLY";
    var sflag = step.show === "empty" ? "idle"
      : step.show === "verdicts" ? "bad"
      : step.show === "labels" ? "ok"
      : showK ? band.flag : "warn";

    var headline = showK ? res.kappa.toFixed(2) : "—";
    var right = [];
    right.push(d.stat({
      label: "rubric", value: step.rub ? step.rub.tag : "—",
      sub: step.show === "empty" ? "not written" : "pinned model version", flag: step.rub ? undefined : "idle"
    }));
    if (scored) {
      right.push(d.stat({
        label: "chance agreement", value: judgeloop_pct(res.expected),
        sub: "what κ subtracts", flag: "warn"
      }));
      right.push(d.stat({
        label: "disagreements", value: String(res.missed + res.alarm),
        sub: res.missed + " missed · " + res.alarm + " false alarm",
        flag: res.missed + res.alarm > 10 ? "bad" : res.missed + res.alarm ? "warn" : "ok"
      }));
    }

    var body = d.flow([
      d.stack([
        d.big(headline, "Cohen’s κ", showK ? band.flag : "idle"),
        d.pill(showK ? band.label : "not measured", showK ? band.flag : "idle")
      ]),
      d.node({
        title: "calibration set · " + judgeloop_N + " items",
        status: status, statusFlag: sflag,
        badge: step.rub ? step.rub.tag : "no rubric",
        meta: step.rub ? step.rub.text : "a rubric has not been written yet",
        flag: sflag,
        gauges: gauges,
        body: d.cells(cells, {
          label: step.show === "verdicts"
            ? "judge verdicts — “F” = failed. No labels exist to check them against."
            : "“!” = human says UNGROUNDED (" + judgeloop_UNG.length + " of " + judgeloop_N + ")",
          dense: true
        }),
        rows: rows
      }),
      d.stack(right)
    ]);

    var derivation = scored
      ? "kappa = (observed " + res.observed.toFixed(4) + " − expected " + res.expected.toFixed(4) +
        ") / (1 − " + res.expected.toFixed(4) + ") = " +
        (res.observed - res.expected).toFixed(4) + " / " + (1 - res.expected).toFixed(4) +
        " = " + res.kappa.toFixed(4)
      : "expected = p(both grounded) + p(both not) — needs human labels, which do not exist yet";

    return d.stack([
      d.pills(judgeloop_stagePills(step.stage, step.skipped)),
      body,
      d.mono(derivation, scored ? (showK ? judgeloop_band(res.kappa).flag : "warn") : "idle")
    ]);
  }

  function judgeloop_drawPair(step, d) {
    var v = step.verdicts, cells = [], i, lbl, fl, ttl;
    for (i = 0; i < judgeloop_PAIRS; i++) {
      if (!v) {
        lbl = "?"; fl = "idle"; ttl = "pair " + (i + 1) + " — not judged yet";
      } else if (v[i] === "=") {
        lbl = "="; fl = "warn";
        ttl = "pair " + (i + 1) + " — the two orders disagreed, scored as a tie";
      } else {
        lbl = v[i];
        fl = step.reveal && judgeloop_BIASED[i] ? "bad" : "ok";
        ttl = "pair " + (i + 1) + " — judge picked " + v[i] +
          (step.reveal && judgeloop_BIASED[i] ? " (this pair flipped when the order was swapped)" : "");
      }
      cells.push({ label: lbl, flag: fl, title: ttl });
    }

    var t = v ? judgeloop_tally(v) : { A: 0, B: 0, tie: 0 };
    var lead = t.B > t.A ? "B" : t.A > t.B ? "A" : "—";
    var decided = t.A + t.B;

    var gauges = [
      { label: "A wins", pct: (t.A / judgeloop_PAIRS) * 100, value: t.A + "/" + judgeloop_PAIRS, flag: t.A > t.B ? "warn" : "idle" },
      { label: "B wins", pct: (t.B / judgeloop_PAIRS) * 100, value: t.B + "/" + judgeloop_PAIRS, flag: t.B > t.A ? "warn" : "idle" },
      { label: "ties (orders disagreed)", pct: (t.tie / judgeloop_PAIRS) * 100, value: String(t.tie), flag: t.tie ? "bad" : "idle" }
    ];

    var order = step.stage === 0 ? "—"
      : step.verdicts === judgeloop_P1 ? "A presented first"
      : step.verdicts === judgeloop_P2 ? "B presented first"
      : "both orders, agreement only";

    return d.stack([
      d.pills(judgeloop_ppills(step.stage)),
      d.flow([
        d.stack([
          d.big(v ? (decided ? lead : "—") : "—", "leading", step.stage >= 5 ? "warn" : v ? "bad" : "idle"),
          d.pill(order, step.stage >= 5 ? "ok" : "warn")
        ]),
        d.node({
          title: judgeloop_PAIRS + " pairwise comparisons",
          status: step.stage === 0 ? "UNJUDGED" : step.stage >= 5 ? "RECONCILED" : "ONE ORDER ONLY",
          statusFlag: step.stage === 0 ? "idle" : step.stage >= 5 ? "ok" : "bad",
          badge: "swap control",
          meta: "B is genuinely better on " + judgeloop_TRUE_B + " of " + judgeloop_PAIRS +
            "; " + judgeloop_BIAS_N + " pairs (" + judgeloop_BIAS_PCT + "%) are decided by order alone",
          flag: step.stage >= 5 ? "ok" : step.stage === 0 ? "idle" : "bad",
          gauges: gauges,
          body: d.cells(cells, { label: "verdict per pair" }),
          rows: [
            { label: "pairs counted", value: decided + " of " + judgeloop_PAIRS, flag: decided === judgeloop_PAIRS ? "ok" : "warn" },
            { label: "margin", value: decided ? Math.abs(t.B - t.A) + " pair" + (Math.abs(t.B - t.A) === 1 ? "" : "s") : "—", flag: Math.abs(t.B - t.A) <= 2 ? "warn" : undefined },
            { label: "judge calls made", value: String((step.stage >= 3 ? 2 : step.stage >= 1 ? 1 : 0) * judgeloop_PAIRS) }
          ]
        }),
        d.stack([
          d.stat({ label: "A", value: String(t.A), sub: "wins", flag: t.A > t.B ? "warn" : undefined }),
          d.stat({ label: "B", value: String(t.B), sub: "wins", flag: t.B > t.A ? "warn" : undefined }),
          d.stat({ label: "ties", value: String(t.tie), sub: "order-sensitive", flag: t.tie ? "bad" : "ok" })
        ])
      ]),
      d.mono(
        "pass1 A=" + judgeloop_T1.A + " B=" + judgeloop_T1.B +
        "   pass2 A=" + judgeloop_T2.A + " B=" + judgeloop_T2.B +
        "   agreed-only A=" + judgeloop_TR.A + " B=" + judgeloop_TR.B + " tie=" + judgeloop_TR.tie,
        step.stage >= 5 ? "ok" : "idle"
      )
    ]);
  }

  S["judgeloop"] = {
    title: "Calibrate a judge, or ship a number with a decimal point",
    note: "One calibration set of <b>" + judgeloop_N + " items</b>, hand-labelled: item <i>i</i> is " +
      "grounded unless <i>i</i> mod 4 = 3, giving <b>" + judgeloop_GND.length + " grounded / " +
      judgeloop_UNG.length + " not</b> — a " + judgeloop_pct(judgeloop_GND.length / judgeloop_N) +
      " prevalence, imbalanced the way a real golden set is. Each rubric version is stated as two " +
      "numbers only: how many of the " + judgeloop_UNG.length + " ungrounded answers it catches, and " +
      "how many of the " + judgeloop_GND.length + " grounded ones it wrongly fails. Every confusion " +
      "cell, percentage and kappa below is then recomputed from those verdict arrays with the page’s " +
      "own <code>cohens_kappa</code>. The third tab runs " + judgeloop_PAIRS + " pairwise comparisons " +
      "twice with the order swapped, at the " + judgeloop_BIAS_PCT + "% position bias that is the " +
      "midpoint of the reported 10–20 point band.",
    interval: 1350,
    scenarios: [judgeloop_ship(), judgeloop_loop(), judgeloop_pairwise()],

    draw: function (step, d, ctx) {
      if (step.mode === "pairwise") return judgeloop_drawPair(step, d);
      return judgeloop_drawKappa(step, d);
    }
  };

  // ====================================================================
  // ======================================================================
  // SIM · layerflow  (transformers.md)
  // A token's path through the stack, on a real published shape (Llama-3-8B):
  //   d_model 4096 · 32 heads · 8 KV heads · head_dim 128 · d_ff 14336
  //   32 layers · vocab 128256
  // Parameter counts are multiplied out here, not quoted:
  //   attn  = Wq 4096x4096 + Wk 4096x1024 + Wv 4096x1024 + Wo 4096x4096
  //   mlp   = 3 x 4096 x 14336            (SwiGLU: gate, up, down)
  //   total = 32 x (attn + mlp) + 2 x 128256 x 4096  -> 8.03B, which is the
  //   number the model is named after. If the arithmetic below did not land
  //   there, the arithmetic would be wrong.
  // ======================================================================
  var layerflow_D = 4096, layerflow_H = 32, layerflow_KVH = 8, layerflow_HD = 128;
  var layerflow_FF = 14336, layerflow_L = 32, layerflow_V = 128256;
  var layerflow_KVD = layerflow_KVH * layerflow_HD;                 // 1024

  var layerflow_WQ = layerflow_D * layerflow_D;                     // 16,777,216
  var layerflow_WK = layerflow_D * layerflow_KVD;                   //  4,194,304
  var layerflow_WV = layerflow_D * layerflow_KVD;                   //  4,194,304
  var layerflow_WO = layerflow_D * layerflow_D;                     // 16,777,216
  var layerflow_ATTN = layerflow_WQ + layerflow_WK + layerflow_WV + layerflow_WO;
  var layerflow_MLP = 3 * layerflow_D * layerflow_FF;               // 176,160,768
  var layerflow_LAYER = layerflow_ATTN + layerflow_MLP;             // 218,103,808
  var layerflow_EMB = layerflow_V * layerflow_D;                    // 525,336,576
  var layerflow_TOTAL = layerflow_L * layerflow_LAYER + 2 * layerflow_EMB;

  var layerflow_HBM = 3.35e12;        // H100 SXM, bytes/sec — the published figure
  var layerflow_BYTES = 2;            // bf16

  function layerflow_b(n) { return (n / 1e9).toFixed(2) + "B"; }
  function layerflow_m(n) { return (n / 1e6).toFixed(1) + "M"; }

  // --- scenario 1: inside one layer ------------------------------------
  function layerflow_one() {
    var S = [
      ["idle", "A single token, already embedded: one vector of " + layerflow_D +
        " numbers. Press Play to push it through <b>one</b> of the 32 layers.", 0, "x  [4096]"],
      ["RMSNorm", "<b>RMSNorm.</b> Rescale the vector to unit root-mean-square. Cheap — " +
        layerflow_D + " parameters, no matrix — but it is what keeps 32 layers of residual " +
        "addition numerically stable.", layerflow_D, "x̂  [4096]"],
      ["Q/K/V", "<b>Project to Q, K, V.</b> Q gets all " + layerflow_H + " heads (" +
        layerflow_D + " wide); K and V get only <b>" + layerflow_KVH + "</b> (" + layerflow_KVD +
        " wide) — that is grouped-query attention, and it is why K and V cost a quarter of Q. " +
        layerflow_m(layerflow_WQ + layerflow_WK + layerflow_WV) + " parameters.",
        layerflow_WQ + layerflow_WK + layerflow_WV, "Q[4096] K[1024] V[1024]"],
      ["RoPE", "<b>Rotary position embedding.</b> Rotate Q and K by an angle set by absolute " +
        "position. No parameters at all — position enters as a rotation, which is why the " +
        "relative offset between two tokens survives the dot product.", 0, "Q,K rotated"],
      ["attention", "<b>Attention.</b> QKᵀ → scale → causal mask → softmax → weight V. " +
        "This is the only step whose cost depends on <i>sequence length</i> rather than on " +
        "model width — and it holds no parameters of its own.", 0, "attn out [4096]"],
      ["Wo + add", "<b>Output projection, then add the residual.</b> " +
        layerflow_m(layerflow_WO) + " parameters. The residual add is what lets gradients " +
        "reach layer 1 at all.", layerflow_WO, "x + attn  [4096]"],
      ["RMSNorm", "<b>Second RMSNorm.</b> Pre-norm placement: normalise going <i>into</i> the " +
        "MLP, never on the residual stream itself.", layerflow_D, "x̂  [4096]"],
      ["SwiGLU", "<b>SwiGLU MLP.</b> Three matrices — gate and up both " + layerflow_D + "→" +
        layerflow_FF + ", down back again. <b>" + layerflow_m(layerflow_MLP) + "</b> parameters: " +
        (layerflow_MLP / layerflow_LAYER * 100).toFixed(0) + "% of the layer. Attention gets the " +
        "attention; the MLP gets the parameters.", layerflow_MLP, "h [14336] → [4096]"],
      ["add", "<b>Add the residual, and the layer is done.</b> " +
        layerflow_m(layerflow_LAYER) + " parameters touched — and this happens " + layerflow_L +
        " more times before a single logit exists.", 0, "x' [4096]"],
    ];
    var steps = [], cum = 0;
    for (var i = 0; i < S.length; i++) {
      cum += S[i][2];
      steps.push({
        mode: "one", stage: S[i][0], caption: S[i][1], cum: cum, shape: S[i][3],
        idx: i, total: S.length - 1,
        flag: i === 0 ? undefined : i === S.length - 1 ? "ok" : S[i][2] > 1e8 ? "warn" : undefined,
      });
    }
    return { id: "one", label: "Inside one layer", steps: steps };
  }

  // --- scenario 2: the whole stack --------------------------------------
  function layerflow_stack() {
    var groups = [[1, 1], [2, 8], [9, 16], [17, 24], [25, 32]];
    var steps = [{
      mode: "stack", caption: "A token id, nothing more. Press Play to run the full stack.",
      done: 0, cum: 0, label: "token id",
    }];
    steps.push({
      mode: "stack",
      caption: "<b>Embedding lookup.</b> Row " + "<i>id</i>" + " of a " + layerflow_V + "×" +
        layerflow_D + " table — <b>" + layerflow_m(layerflow_EMB) + "</b> parameters, but only " +
        "one row is read. A lookup, not a matmul.",
      done: 0, cum: layerflow_EMB, label: "embed",
    });
    for (var g = 0; g < groups.length; g++) {
      var a = groups[g][0], b = groups[g][1], n = b - a + 1;
      steps.push({
        mode: "stack",
        caption: n === 1
          ? "<b>Layer 1.</b> " + layerflow_m(layerflow_LAYER) + " parameters. Every later layer " +
            "is structurally identical — same shapes, different weights."
          : "<b>Layers " + a + "–" + b + ".</b> " + n + " more identical blocks, " +
            layerflow_b(n * layerflow_LAYER) + " parameters. Nothing new happens architecturally; " +
            "depth is the whole mechanism.",
        done: b, cum: layerflow_EMB + b * layerflow_LAYER, label: "layers 1–" + b,
        flag: b === 32 ? "warn" : undefined,
      });
    }
    steps.push({
      mode: "stack",
      caption: "<b>Final RMSNorm, then the LM head.</b> A " + layerflow_D + "×" + layerflow_V +
        " projection — <b>" + layerflow_m(layerflow_EMB) + "</b> parameters — turning one vector " +
        "into " + layerflow_V.toLocaleString("en-US") + " logits. Total: <b>" +
        layerflow_b(layerflow_TOTAL) + "</b>, which is what the “8B” in the name refers to.",
      done: 32, cum: layerflow_TOTAL, label: "logits", flag: "ok",
    });
    return { id: "stack", label: "The whole stack", steps: steps };
  }

  // --- scenario 3: why decode is memory-bound ---------------------------
  function layerflow_mem() {
    var bytes = layerflow_TOTAL * layerflow_BYTES;
    var secs = bytes / layerflow_HBM;
    var toks = 1 / secs;
    var S = [
      ["Generating one token. The compute is trivial — the <i>traffic</i> is not.", 0],
      ["<b>Every weight is read.</b> Decoding one token touches all <b>" +
        layerflow_b(layerflow_TOTAL) + "</b> parameters. Not some of them — a dense model has " +
        "no way to skip a layer.", 1],
      ["<b>In bf16 that is " + (bytes / 1e9).toFixed(2) + " GB</b> pulled from HBM, " +
        "for one token.", 2],
      ["<b>H100 SXM reads at 3.35 TB/s.</b> " + (bytes / 1e9).toFixed(2) + " GB ÷ 3.35 TB/s = <b>" +
        (secs * 1000).toFixed(2) + " ms</b> just to move the weights.", 3],
      ["<b>That is a ceiling of about " + toks.toFixed(0) + " tokens/second</b> at batch size 1 — " +
        "before a single multiply is counted. The arithmetic itself is roughly " +
        (2 * layerflow_TOTAL / 1e9).toFixed(0) + " GFLOP, which an H100 finishes in well under a " +
        "tenth of that time.", 4],
      ["<b>So decode is memory-bound, and that changes what helps.</b> The fix is not more FLOPs. " +
        "It is reading fewer bytes (quantisation) or amortising the same read across more " +
        "sequences (batching) — which is exactly why both of those pages exist.", 5],
    ];
    var steps = [];
    for (var i = 0; i < S.length; i++) {
      steps.push({
        mode: "mem", caption: S[i][0], phase: S[i][1],
        bytes: bytes, secs: secs, toks: toks,
        flag: i === 0 ? undefined : i >= 4 ? "bad" : "warn",
      });
    }
    return { id: "mem", label: "Why decode is memory-bound", steps: steps };
  }

  S["layerflow"] = {
    title: "Push one token through the stack",
    note: "A real published shape — <b>Llama-3-8B</b>: d_model 4096, 32 heads, 8 KV heads, " +
      "head_dim 128, d_ff 14336, 32 layers, vocab 128,256. Every parameter count below is " +
      "multiplied out from those seven numbers, and they add to <b>8.03B</b> — the figure the " +
      "model is named after. That is the check: if the arithmetic did not land on 8B, it would " +
      "be wrong.",
    interval: 1400,
    scenarios: [layerflow_one(), layerflow_stack(), layerflow_mem()],

    draw: function (step, d, ctx) {
      if (step.mode === "mem") {
        var p = step.phase;
        return d.stack([
          d.flow([
            d.big(p >= 1 ? layerflow_b(layerflow_TOTAL) : "—", "weights read", p >= 1 ? "warn" : undefined),
            d.stat({ label: "bytes / token", value: p >= 2 ? (step.bytes / 1e9).toFixed(2) + " GB" : "—",
                     sub: "bf16", flag: p >= 2 ? "warn" : undefined }),
            d.stat({ label: "HBM", value: p >= 3 ? "3.35 TB/s" : "—", sub: "H100 SXM" }),
            d.stat({ label: "time / token", value: p >= 3 ? (step.secs * 1000).toFixed(2) + " ms" : "—",
                     sub: "memory alone", flag: p >= 3 ? "bad" : undefined }),
            d.stat({ label: "ceiling", value: p >= 4 ? step.toks.toFixed(0) + " tok/s" : "—",
                     sub: "batch 1", flag: p >= 4 ? "bad" : undefined }),
          ]),
          d.stack([
            d.bar({ label: "memory time", pct: p >= 3 ? 100 : 0,
                    value: p >= 3 ? (step.secs * 1000).toFixed(2) + " ms" : "—", flag: "bad" }),
            d.bar({ label: "compute time", pct: p >= 4 ? 2 : 0,
                    value: p >= 4 ? "~0.1 ms" : "—", flag: "ok" }),
          ]),
          p >= 5
            ? d.note("Two levers, and neither is a faster multiplier: <b>read fewer bytes</b> " +
                "(quantisation) or <b>share the read</b> (batching).", "warn")
            : d.note("The bar that matters is the one you cannot shorten with more FLOPs."),
        ]);
      }

      if (step.mode === "stack") {
        var cells = [];
        for (var i = 1; i <= layerflow_L; i++) {
          cells.push({
            label: "",
            flag: i <= step.done ? "ok" : "idle",
            title: "layer " + i + " · " + layerflow_m(layerflow_LAYER) + " params",
          });
        }
        return d.stack([
          d.flow([
            d.big(layerflow_b(step.cum), "parameters touched", step.done === 32 ? "ok" : undefined),
            d.stat({ label: "layers done", value: step.done + " / " + layerflow_L,
                     flag: step.done === layerflow_L ? "ok" : step.done ? "warn" : undefined }),
            d.stat({ label: "at", value: step.label, sub: "stage" }),
            d.stat({ label: "of total", value: (step.cum / layerflow_TOTAL * 100).toFixed(0) + "%",
                     sub: layerflow_b(layerflow_TOTAL) }),
          ]),
          d.cells(cells, { label: "the 32 transformer blocks", dense: true }),
          d.bar({ label: "parameters", pct: step.cum / layerflow_TOTAL * 100,
                  value: layerflow_b(step.cum), flag: step.done === 32 ? "ok" : "warn" }),
        ]);
      }

      // scenario 1 — inside one layer
      var names = ["in", "RMSNorm", "Q/K/V", "RoPE", "attention", "Wo + add", "RMSNorm", "SwiGLU", "add"];
      var chips = [];
      for (var k = 1; k < names.length; k++) {
        chips.push({ label: names[k], flag: k < step.idx ? "ok" : k === step.idx ? "warn" : undefined });
      }
      return d.stack([
        d.flow([
          d.big(step.shape, "residual stream"),
          d.stat({ label: "params so far", value: layerflow_m(step.cum), sub: "this layer",
                   flag: step.cum > 1e8 ? "warn" : undefined }),
          d.stat({ label: "layer total", value: layerflow_m(layerflow_LAYER), sub: "× 32 blocks" }),
          d.stat({ label: "MLP share", value: (layerflow_MLP / layerflow_LAYER * 100).toFixed(0) + "%",
                   sub: "of the layer", flag: "warn" }),
        ]),
        d.pills(chips),
        d.stack([
          d.bar({ label: "attention", pct: layerflow_ATTN / layerflow_LAYER * 100,
                  value: layerflow_m(layerflow_ATTN), flag: step.idx >= 2 && step.idx <= 5 ? "warn" : undefined }),
          d.bar({ label: "MLP", pct: layerflow_MLP / layerflow_LAYER * 100,
                  value: layerflow_m(layerflow_MLP), flag: step.idx >= 7 ? "warn" : undefined }),
        ]),
      ]);
    },
  };

  // ====================================================================
  // ======================================================================
  // SIM · pipebubble  (parallelism.md)
  // Pipeline parallelism, played on its real time axis.
  // P stages, M microbatches. Stage s starts microbatch m at time t = m + s,
  // so the run takes M + P - 1 steps, the grid holds P x (M+P-1) slots, and
  // exactly M x P of them do work. Idle = P(P-1), so
  //   bubble = P(P-1) / (P(M+P-1)) = (P-1) / (M+P-1)
  // which is the formula the page states. Every figure below is counted off
  // the grid the sim actually draws, not asserted.
  // ======================================================================
  var pipebubble_P = 4;

  function pipebubble_frac(M) {
    return (pipebubble_P - 1) / (M + pipebubble_P - 1);
  }

  function pipebubble_scenario(M, label, id) {
    var T = M + pipebubble_P - 1;                 // total time steps
    var steps = [{
      caption: "Four pipeline stages, <b>" + M + "</b> microbatch" + (M === 1 ? "" : "es") +
        ". Nothing has started — press Play and watch the diagonal fill.",
      t: -1, M: M, T: T,
    }];
    for (var t = 0; t < T; t++) {
      var busy = 0;
      for (var s = 0; s < pipebubble_P; s++) {
        var m = t - s;
        if (m >= 0 && m < M) busy++;
      }
      var warming = t < pipebubble_P - 1;
      var draining = t > M - 1;
      var why = warming
        ? "Stages below the diagonal have not been handed anything yet — this is the <b>fill</b>."
        : draining
        ? "The last microbatch has passed the early stages, so they have nothing left — this is the <b>drain</b>."
        : "Every stage is busy. This is the only region that scales.";
      steps.push({
        caption: "<b>t = " + t + ".</b> " + busy + " of " + pipebubble_P + " stages working, " +
          (pipebubble_P - busy) + " idle. " + why,
        t: t, M: M, T: T,
        flag: busy === pipebubble_P ? "ok" : busy <= 1 ? "bad" : "warn",
      });
    }
    var idle = pipebubble_P * (pipebubble_P - 1);
    var total = pipebubble_P * T;
    steps[steps.length - 1].caption =
      "<b>Run complete in " + T + " steps.</b> " + (M * pipebubble_P) + " of " + total +
      " GPU-slots did work; <b>" + idle + "</b> were bubble. That is <b>" +
      (pipebubble_frac(M) * 100).toFixed(1) + "%</b> idle — and it matches " +
      "(P−1)/(M+P−1) = 3/" + (M + 3) + " exactly, because the bubble is always the " +
      "same " + idle + " slots however long you make the run. More microbatches do not " +
      "shrink the bubble; they dilute it.";
    return { id: id, label: label, steps: steps };
  }

  S["pipebubble"] = {
    title: "Fill the pipeline, and watch the bubble get diluted",
    note: "Four pipeline stages on four GPUs. A microbatch enters stage 0, then moves " +
      "down one stage per step, so stage <i>s</i> starts microbatch <i>m</i> at time " +
      "<i>t = m + s</i>. Every percentage below is <b>counted off the grid you are " +
      "looking at</b> — busy slots against total slots — and then checked against the " +
      "page's formula (P−1)/(M+P−1). Compare the three tabs: the bubble never gets " +
      "smaller, it just stops being most of the run.",
    interval: 900,
    scenarios: [
      pipebubble_scenario(1, "1 microbatch", "m1"),
      pipebubble_scenario(4, "4 microbatches", "m4"),
      pipebubble_scenario(8, "8 microbatches", "m8"),
    ],

    draw: function (step, d, ctx) {
      var M = step.M, T = step.T, now = step.t;
      var lanes = [];
      var busyNow = 0, doneSlots = 0;

      for (var s = 0; s < pipebubble_P; s++) {
        var cells = [];
        for (var t = 0; t < T; t++) {
          var m = t - s;
          var works = m >= 0 && m < M;
          var past = t < now, present = t === now;
          if (works && t <= now) doneSlots++;
          if (works && present) busyNow++;
          cells.push({
            label: works ? String(m + 1) : "",
            flag: !works
              ? (t <= now ? "bad" : "idle")          // bubble, once reached
              : present ? "warn"                      // executing right now
              : past ? "ok"                           // finished
              : "idle",                               // scheduled
            title: works
              ? "t=" + t + " · stage " + s + " · microbatch " + (m + 1)
              : "t=" + t + " · stage " + s + " · idle (bubble)",
          });
        }
        lanes.push(d.lane({ label: "GPU " + s, cells: cells }));
      }

      var reached = now < 0 ? 0 : (now + 1) * pipebubble_P;
      var idleSoFar = reached - doneSlots;
      var pct = reached ? (idleSoFar / reached) * 100 : 0;
      var finalPct = pipebubble_frac(M) * 100;

      return d.stack([
        d.flow([
          d.big(now < 0 ? "—" : "t=" + now, "time step"),
          d.stat({
            label: "stages busy",
            value: busyNow + " / " + pipebubble_P,
            sub: now < 0 ? "not started" : "this step",
            flag: busyNow === pipebubble_P ? "ok" : busyNow <= 1 ? "bad" : "warn",
          }),
          d.stat({
            label: "idle so far",
            value: pct.toFixed(0) + "%",
            sub: idleSoFar + " of " + reached + " slots",
            flag: pct > 50 ? "bad" : pct > 25 ? "warn" : "ok",
          }),
          d.stat({
            label: "bubble at end",
            value: finalPct.toFixed(1) + "%",
            sub: "(P−1)/(M+P−1)",
            flag: finalPct > 50 ? "bad" : finalPct > 25 ? "warn" : "ok",
          }),
        ]),
        d.stack(lanes),
        d.note(
          "Green finished · amber executing now · <span style=\"opacity:.6\">grey</span> " +
          "not yet scheduled · red is bubble — a GPU that had nothing to do and never " +
          "gets that time back.",
        ),
      ]);
    },
  };

  // ====================================================================
  // ======================================================================
  // SIM · quantpipe  (quantization.md)
  // The post-training quantization pipeline, in the order the page lists it:
  // pick the target → weight-only or not → calibrate → quantize → evaluate →
  // compare what you did not do → deploy and measure. The stages are the
  // frames, because the stages are the mechanism.
  //
  // CONFIG — every figure is computed from these, using the page's own
  // functions, and nothing is typed in:
  //   model              7B, FP16 checkpoint
  //   bandwidth          2.0 TB/s HBM            (the page's decode_ceiling default)
  //   overhead           0.18                    (the page's memory_footprint default)
  //   card               16 GB VRAM              (stated config: what we must fit in)
  //   arithmetic         312 TFLOP/s bf16 dense  (stated config: the A100-class
  //                      partner to the 2 TB/s above — needed only for the batch
  //                      roofline, which the page describes but does not tabulate)
  //   calibration        256 samples             (the page's calibration_samples n)
  //   outlier threshold  6.7B parameters         (the page's emergent-outlier result)
  //
  //   weights_GB   = params_B × bits/8
  //   footprint_GB = weights_GB × (1 + 0.18)
  //   ceiling      = bandwidth / bytes_per_pass                  [the page's formula]
  //   read_ms      = weights_bytes / bandwidth
  //   compute_ms   = batch × 2 × params / FLOP_s     (2 FLOPs per weight: one
  //                  multiply, one add — the only added derivation, stated here)
  //   step_ms      = max(read_ms, compute_ms)   → tok/s = batch / step_s
  // That max() is the whole of section 3's K→L branch: above the crossover
  // batch the weight read is amortised and quantization stops buying speed.
  // ======================================================================
  var quantpipe_PB = 7;                 // params, billions
  var quantpipe_BW = 2.0;               // TB/s
  var quantpipe_OVER = 0.18;            // KV + activations + framework slack
  var quantpipe_CARD = 16;              // GB of VRAM
  var quantpipe_FLOPS = 312e12;         // bf16 dense FLOP/s
  var quantpipe_CAL = 256;              // calibration samples
  var quantpipe_OUTLIER = 6.7;          // B params, emergent outlier threshold
  var quantpipe_STAGES = [
    "pick target", "weight-only?", "calibrate", "quantize",
    "evaluate", "compare", "deploy",
  ];

  function quantpipe_weights(bits, pb) {
    return (pb === undefined ? quantpipe_PB : pb) * (bits / 8);        // GB
  }
  function quantpipe_foot(bits, pb) {
    return quantpipe_weights(bits, pb) * (1 + quantpipe_OVER);         // GB
  }
  function quantpipe_readMs(bits) {
    return (quantpipe_weights(bits) * 1e9) / (quantpipe_BW * 1e12) * 1000;
  }
  function quantpipe_computeMs(batch) {
    return (batch * 2 * quantpipe_PB * 1e9) / quantpipe_FLOPS * 1000;
  }
  function quantpipe_stepMs(bits, batch) {
    var r = quantpipe_readMs(bits), c = quantpipe_computeMs(batch);
    return r > c ? r : c;
  }
  function quantpipe_tps(bits, batch) {
    return batch / (quantpipe_stepMs(bits, batch) / 1000);
  }
  function quantpipe_crossover(bits) {                 // batch where compute = read
    return quantpipe_readMs(bits) / quantpipe_computeMs(1);
  }
  function quantpipe_label(bits) { return bits === 16 ? "FP16" : "INT" + bits; }

  /** The precision table of section 2, computed rather than transcribed. */
  function quantpipe_table(d) {
    var rows = [], list = [16, 8, 4], i;
    for (i = 0; i < list.length; i++) {
      var b = list[i];
      rows.push([
        quantpipe_label(b),
        quantpipe_weights(b).toFixed(1) + " GB",
        quantpipe_foot(b).toFixed(1) + " GB",
        quantpipe_tps(b, 1).toFixed(0) + " tok/s",
      ]);
    }
    return d.table(["precision", "weights", "+18%", "ceiling @b1"], rows);
  }

  /** The comparison people forget to run — weights only, as the page states it. */
  function quantpipe_alts(d) {
    return d.table(["option", "weights", "the page's verdict"], [
      ["13B @ INT4", quantpipe_weights(4, 13).toFixed(1) + " GB", "often worse than the next row"],
      ["7B @ FP16", quantpipe_weights(16, 7).toFixed(1) + " GB", "stronger on structured output"],
      ["13B @ INT8", quantpipe_weights(8, 13).toFixed(1) + " GB", "usually the best of the three"],
    ]);
  }

  /** What degrades first, in the page's stated order. */
  function quantpipe_checks(d, tested) {
    var names = [
      "long-context recall", "structured output / JSON validity",
      "multi-step reasoning", "rare languages & jargon",
    ];
    var out = "", i;
    for (i = 0; i < names.length; i++) {
      out += d.row(
        (i + 1) + " · " + names[i],
        tested ? "measured" : "not measured",
        tested ? "ok" : "bad"
      );
    }
    return out;
  }

  /** The roofline picture: which term sets the pace at this batch size. */
  function quantpipe_roof(d, bits, batch) {
    var r16 = quantpipe_readMs(16), rq = quantpipe_readMs(bits);
    var c = quantpipe_computeMs(batch);
    var scale = Math.max(r16, rq, c);
    return d.bar({
      label: "FP16 weight read", pct: (r16 / scale) * 100,
      value: r16.toFixed(2) + " ms", flag: "bad",
    }) + d.bar({
      label: quantpipe_label(bits) + " weight read", pct: (rq / scale) * 100,
      value: rq.toFixed(2) + " ms", flag: "ok",
    }) + d.bar({
      label: "arithmetic @ batch " + batch, pct: (c / scale) * 100,
      value: c.toFixed(2) + " ms", flag: c > rq ? "warn" : undefined,
    });
  }

  /** Shared frames 1–6: the pipeline before it reaches the meter. */
  function quantpipe_head(scen) {
    var bad = scen === "gate";
    var f = [];

    f.push({
      st: 1, bits: 16, batch: scen === "batch" ? 128 : 1, body: "table", flag: "warn",
      caption: "<b>1 · Pick the target.</b> Driven by the memory arithmetic, not by what sounds " +
        "impressive: " + quantpipe_PB + "B × bits/8 gives " + quantpipe_weights(16).toFixed(1) +
        " / " + quantpipe_weights(8).toFixed(1) + " / " + quantpipe_weights(4).toFixed(1) +
        " GB of weights, and ×1.18 for KV and slack puts FP16 at <b>" + quantpipe_foot(16).toFixed(1) +
        " GB</b> against a " + quantpipe_CARD + " GB card. INT4 lands at " + quantpipe_foot(4).toFixed(1) +
        " GB. Target chosen: <b>INT4</b>." +
        (scen === "batch" ? " Note the second effect — 4× less weight memory is VRAM freed for batch." : ""),
    });

    f.push({
      st: 2, bits: 16, batch: scen === "batch" ? 128 : 1, body: "outlier", flag: "ok",
      caption: "<b>2 · Weight-only or weight+activation?</b> This model is " + quantpipe_PB +
        "B, which is above the <b>" + quantpipe_OUTLIER + "B</b> threshold where transformers develop " +
        "emergent outlier features — activation dimensions running 10–100× larger than the rest. " +
        "Quantize those naively and the scale collapses everything else into two levels. " +
        "<b>Weight-only INT4</b>: most of the bandwidth win, far less of the risk.",
    });

    f.push({
      st: 3, bits: 16, batch: scen === "batch" ? 128 : 1, body: "cal",
      cal: bad ? "wiki" : "prod", flag: bad ? "bad" : "ok",
      caption: bad
        ? "<b>3 · Gather calibration data.</b> " + quantpipe_CAL + " samples pulled from a generic " +
          "web-text corpus, because it was already on disk. The quantizer decides which weights " +
          "matter by watching activations <i>on this data</i> — so it is about to optimise for a " +
          "distribution nobody serves. This is the step people rush, and it decides the result."
        : "<b>3 · Gather calibration data.</b> " + quantpipe_CAL + " samples drawn from real traffic " +
          "and stratified by intent — the page's <code>calibration_samples(n=" + quantpipe_CAL +
          ")</code>. Representativeness beats volume: a few hundred of the right samples beat " +
          "thousands of the wrong ones, because this is what the quantizer watches to decide which " +
          "weights matter.",
    });

    f.push({
      st: 4, bits: 4, batch: scen === "batch" ? 128 : 1, body: "shrink", flag: "ok",
      caption: "<b>4 · Run the quantizer.</b> AWQ, layer by layer, minutes not hours: every weight " +
        "becomes a 4-bit code plus a per-group scale. Weights " + quantpipe_weights(16).toFixed(1) +
        " GB → <b>" + quantpipe_weights(4).toFixed(1) + " GB</b>, footprint " +
        quantpipe_foot(16).toFixed(1) + " → " + quantpipe_foot(4).toFixed(1) + " GB — it now fits the " +
        quantpipe_CARD + " GB card with room to spare. Nothing about the multiply changed: the " +
        "weights are dequantized to FP16 <i>inside the kernel</i> as they are read.",
    });

    f.push({
      st: 5, bits: 4, batch: scen === "batch" ? 128 : 1, body: "checks",
      tested: !bad, flag: bad ? "bad" : "ok",
      caption: bad
        ? "<b>5 · Evaluate.</b> Perplexity moved by +0.1 and the gate passed. That is the acceptance " +
          "test everybody uses and it is the wrong one — a 0.1 perplexity increase can hide a large " +
          "drop in a specific capability, and none of the four capabilities that degrade first were " +
          "measured at all."
        : "<b>5 · Evaluate on your task.</b> The regression suite runs on the quantized checkpoint, " +
          "gated on task metrics rather than perplexity, and specifically on the four things that " +
          "degrade before perplexity notices — in the order the page ranks them. JSON validity and " +
          "tool-call accuracy are the ones that break first in production.",
    });

    f.push({
      st: 6, bits: 4, batch: scen === "batch" ? 128 : 1, body: "alts",
      flag: bad ? "bad" : "warn",
      caption: bad
        ? "<b>6 · Compare the alternatives — skipped.</b> Nobody checked whether a smaller model at " +
          "higher precision would have done the job, so there is no baseline to attribute the " +
          "production regression against when it arrives."
        : "<b>6 · Compare against what you did not do.</b> Weights only: 13B @ INT4 is " +
          quantpipe_weights(4, 13).toFixed(1) + " GB, 7B @ FP16 is " + quantpipe_weights(16, 7).toFixed(1) +
          " GB, 13B @ INT8 is " + quantpipe_weights(8, 13).toFixed(1) + " GB. \"Big model, aggressive " +
          "quantization\" is not automatically better than \"smaller model, gentle quantization\" — " +
          "and the 13B @ INT8 row is the one teams skip.",
    });
    return f;
  }

  /** Scenario 1 — the engineered path, measured where the win actually is. */
  function quantpipe_batch1() {
    var steps = [{
      st: 0, bits: 16, batch: 1, body: "table", flag: "bad",
      caption: "An FP16 " + quantpipe_PB + "B checkpoint: <b>" + quantpipe_weights(16).toFixed(1) +
        " GB</b> of weights, <b>" + quantpipe_foot(16).toFixed(1) + " GB</b> with the 18% overhead, " +
        "against a " + quantpipe_CARD + " GB card. It does not fit — and every one of those " +
        quantpipe_weights(16).toFixed(1) + " GB crosses the memory bus <i>for every single token</i>. " +
        "Press Play.",
    }];
    steps = steps.concat(quantpipe_head("b1"));
    steps.push({
      st: 7, bits: 4, batch: 1, body: "roof", flag: "ok",
      caption: "<b>7 · Deploy and measure.</b> At batch 1 the weight read is " +
        quantpipe_readMs(4).toFixed(2) + " ms against " + quantpipe_computeMs(1).toFixed(2) +
        " ms of arithmetic — still overwhelmingly bandwidth-bound, so the compression ratio <i>is</i> " +
        "the speedup: " + quantpipe_tps(16, 1).toFixed(0) + " → <b>" + quantpipe_tps(4, 1).toFixed(0) +
        " tok/s</b>, exactly <b>" + (quantpipe_tps(4, 1) / quantpipe_tps(16, 1)).toFixed(1) +
        "×</b>. The maths did not get faster; there is simply " +
        (quantpipe_weights(16) / quantpipe_weights(4)).toFixed(0) + "× less to carry. <b>That is the " +
        "entire mechanism of this page — and note it is the interactive, single-user case, which is " +
        "where the win is largest.</b>",
    });
    return { id: "b1", label: "INT4 · batch 1", steps: steps };
  }

  /** Scenario 2 — the same weights on a busy server. The expected 4× evaporates. */
  function quantpipe_batch128() {
    var B = 128;
    var steps = [{
      st: 0, bits: 16, batch: B, body: "table", flag: "warn",
      caption: "The same FP16 checkpoint, but this box serves a queue: <b>batch " + B + "</b>. The " +
        "memory arithmetic is identical — " + quantpipe_foot(16).toFixed(1) + " GB, " +
        quantpipe_weights(16).toFixed(1) + " GB read per forward pass — and the team expects the same " +
        (quantpipe_weights(16) / quantpipe_weights(4)).toFixed(0) + "× it read about. Press Play.",
    }];
    steps = steps.concat(quantpipe_head("batch"));
    steps.push({
      st: 7, bits: 4, batch: B, body: "roof", flag: "bad",
      caption: "<b>7 · Deploy and measure — " + (quantpipe_tps(4, B) / quantpipe_tps(16, B)).toFixed(2) +
        "×, not " + (quantpipe_weights(16) / quantpipe_weights(4)).toFixed(0) + "×.</b> One weight read " +
        "now serves " + B + " sequences, so the read is amortised: arithmetic costs " +
        quantpipe_computeMs(B).toFixed(2) + " ms against an INT4 read of " +
        quantpipe_readMs(4).toFixed(2) + " ms. The step is set by <i>compute</i>, not bytes — " +
        quantpipe_tps(16, B).toFixed(0) + " → " + quantpipe_tps(4, B).toFixed(0) + " tok/s.",
    });
    steps.push({
      st: 7, bits: 4, batch: B, body: "cross", flag: "warn",
      caption: "<b>The diagnosis, in one number: the crossover batch.</b> Compute per token is " +
        quantpipe_computeMs(1).toFixed(3) + " ms, so INT4 stops being bandwidth-bound at batch " +
        quantpipe_readMs(4).toFixed(2) + " / " + quantpipe_computeMs(1).toFixed(3) + " = <b>" +
        quantpipe_crossover(4).toFixed(0) + "</b> (FP16 holds out to " + quantpipe_crossover(16).toFixed(0) +
        "). At " + B + " you are far past it. <b>Quantization did not fail — it was never the " +
        "bottleneck at this batch size.</b> It still bought you " +
        (quantpipe_foot(16) - quantpipe_foot(4)).toFixed(1) + " GB of VRAM, which buys batch, which " +
        "is where your throughput actually came from. Measure at your real batch size, not at 1.",
    });
    return { id: "b128", label: "Same weights · batch 128", steps: steps };
  }

  /** Scenario 3 — it ships, it is fast, and it is quietly worse. */
  function quantpipe_gate() {
    var steps = [{
      st: 0, bits: 16, batch: 1, body: "table", flag: "warn",
      caption: "Same " + quantpipe_PB + "B checkpoint, same " + quantpipe_CARD + " GB card, a deadline. " +
        "This run takes the two shortcuts the page names most often: calibration data that was " +
        "already lying around, and perplexity as the acceptance test.",
    }];
    steps = steps.concat(quantpipe_head("gate"));
    steps.push({
      st: 7, bits: 4, batch: 1, body: "fail", flag: "bad",
      caption: "<b>7 · Deployed — and every meter is green.</b> " + quantpipe_foot(4).toFixed(1) +
        " GB, " + quantpipe_tps(4, 1).toFixed(0) + " tok/s, " +
        (quantpipe_tps(4, 1) / quantpipe_tps(16, 1)).toFixed(1) + "×, perplexity +0.1. In production " +
        "the capabilities degrade in the page's order: long-context recall first, then structured " +
        "output — the page's own example is a model that has <b>quietly lost 5% JSON validity</b>, " +
        "which is a production incident that no benchmark on the dashboard can see. <b>Perplexity is " +
        "the wrong acceptance test, and calibration on the wrong distribution is invisible until " +
        "traffic finds it. The eval suite is the only thing standing between you and a model that is " +
        "worse and still sounds completely confident.</b>",
    });
    return { id: "gate", label: "Perplexity gate (fails)", steps: steps };
  }

  S["quantpipe"] = {
    title: "Run the quantization pipeline, then measure the thing you changed",
    note: "A " + quantpipe_PB + "B FP16 checkpoint through the page's PTQ pipeline, one stage per " +
      "frame, onto a " + quantpipe_CARD + " GB card at " + quantpipe_BW + " TB/s. Memory and ceilings " +
      "come from the page's own functions — <code>params × bits/8</code>, <code>× 1.18</code>, " +
      "<code>bandwidth / bytes_per_pass</code>. The batch roofline needs one figure the page " +
      "describes but does not tabulate, so it is stated here: <b>312 TFLOP/s</b> bf16, with 2 FLOPs " +
      "per weight, giving <code>step = max(read_ms, batch × 2P / FLOPs)</code>. Compare the first " +
      "two tabs: identical weights, identical arithmetic, " +
      (quantpipe_tps(4, 1) / quantpipe_tps(16, 1)).toFixed(1) + "× against " +
      (quantpipe_tps(4, 128) / quantpipe_tps(16, 128)).toFixed(2) + "×.",
    interval: 1400,

    scenarios: [quantpipe_batch1(), quantpipe_batch128(), quantpipe_gate()],

    draw: function (step, d, ctx) {
      var bits = step.bits, batch = step.batch;
      var foot = quantpipe_foot(bits);
      var fits = foot <= quantpipe_CARD;
      var quantized = bits !== 16;

      // ---- the pipeline itself, as a lane of stages -----------------------
      var cells = [], i;
      for (i = 0; i < quantpipe_STAGES.length; i++) {
        var n = i + 1;
        cells.push({
          label: String(n),
          flag: n < step.st ? "ok" : n === step.st ? (step.flag === "bad" ? "bad" : "warn") : undefined,
          title: n + " · " + quantpipe_STAGES[i],
        });
      }

      // ---- stage-specific body --------------------------------------------
      var body;
      if (step.body === "table") {
        body = quantpipe_table(d);
      } else if (step.body === "outlier") {
        body = d.row("model size", quantpipe_PB + "B", "warn") +
          d.row("outlier threshold", quantpipe_OUTLIER + "B", "warn") +
          d.row("activations", "left in FP16", "ok") +
          d.row("weights", "INT4, per-group scales", "ok");
      } else if (step.body === "cal") {
        body = d.mono(
          "calibration_samples(logs, n=" + quantpipe_CAL + ")  →  " +
          (step.cal === "wiki" ? "generic web text" : "production traffic, stratified by intent"),
          step.cal === "wiki" ? "bad" : "ok"
        ) + d.row("samples", String(quantpipe_CAL), "ok") +
          d.row("distribution", step.cal === "wiki" ? "not the one you serve" : "the one you serve",
            step.cal === "wiki" ? "bad" : "ok");
      } else if (step.body === "shrink") {
        body = d.bar({
          label: "FP16 weights", pct: 100,
          value: quantpipe_weights(16).toFixed(1) + " GB", flag: "bad",
        }) + d.bar({
          label: "INT4 weights",
          pct: (quantpipe_weights(4) / quantpipe_weights(16)) * 100,
          value: quantpipe_weights(4).toFixed(1) + " GB", flag: "ok",
        }) + d.note("Dequantized to FP16 <i>in-kernel</i>, block by block, as it is read — the " +
          "matmul is unchanged. The saving is entirely bytes on the bus.", "ok");
      } else if (step.body === "checks") {
        body = quantpipe_checks(d, step.tested) +
          d.note(step.tested
            ? "Gated on task metrics. Perplexity is not in this list on purpose."
            : "Gate: perplexity +0.1 — passed. None of the four was measured.",
            step.tested ? "ok" : "bad");
      } else if (step.body === "alts") {
        body = quantpipe_alts(d);
      } else if (step.body === "cross") {
        body = d.bar({
          label: "crossover batch · INT4",
          pct: (quantpipe_crossover(4) / quantpipe_crossover(16)) * 100,
          value: quantpipe_crossover(4).toFixed(0), flag: "warn",
        }) + d.bar({
          label: "crossover batch · FP16", pct: 100,
          value: quantpipe_crossover(16).toFixed(0), flag: "ok",
        }) + d.bar({
          label: "you are serving at", pct: 100,
          value: "batch " + batch, flag: "bad",
        });
      } else if (step.body === "fail") {
        body = quantpipe_checks(d, false) +
          d.mono("perplexity +0.1 · gate PASSED · JSON validity −5 points, unmeasured", "bad");
      } else {
        body = quantpipe_roof(d, bits, batch) +
          d.row("step time", quantpipe_stepMs(bits, batch).toFixed(2) + " ms",
            quantpipe_computeMs(batch) > quantpipe_readMs(bits) ? "warn" : "ok") +
          d.row("bound by",
            quantpipe_computeMs(batch) > quantpipe_readMs(bits) ? "arithmetic" : "memory bandwidth",
            quantpipe_computeMs(batch) > quantpipe_readMs(bits) ? "bad" : "ok");
      }

      var speed = quantized ? quantpipe_tps(bits, batch) / quantpipe_tps(16, batch) : 1;

      return d.stack([
        d.lane({
          label: "PTQ",
          cells: cells,
        }),
        d.flow([
          d.stack([
            d.big(quantpipe_weights(bits).toFixed(1) + " GB", "read per token",
              quantized ? "ok" : "bad"),
            d.dots({
              n: Math.round(quantpipe_weights(bits) * 2),          // 2 dots per GB read
              label: "bytes on the bus",
              flag: quantized ? undefined : "bad",
            }),
          ]),
          d.node({
            title: step.st === 0 ? "checkpoint" : quantpipe_STAGES[step.st - 1],
            status: step.st === 0 ? "FP16" : step.st >= 7 ? "SERVING" : "STAGE " + step.st,
            statusFlag: step.flag === "bad" ? "bad" : step.st === 0 ? "idle" : "ok",
            badge: quantized ? quantpipe_label(bits) + " weight-only" : "FP16",
            meta: quantpipe_PB + "B · batch " + batch + " · " + quantpipe_BW + " TB/s · " +
              quantpipe_CARD + " GB card",
            flag: step.flag === "bad" ? "bad" : quantized ? "ok" : "warn",
            gauges: [{
              label: "VRAM footprint (weights × 1.18)",
              pct: (foot / quantpipe_CARD) * 100,
              value: foot.toFixed(1) + " GB of " + quantpipe_CARD + " GB",
              flag: fits ? "ok" : "bad",
            }],
            body: body,
            rows: [
              { label: "fits the card", value: fits ? "yes" : "no", flag: fits ? "ok" : "bad" },
              {
                label: "decode ceiling @ batch 1",
                value: quantpipe_tps(bits, 1).toFixed(0) + " tok/s",
                flag: quantized ? "ok" : "warn",
              },
            ],
          }),
          d.stack([
            d.stat({
              label: "throughput",
              value: quantpipe_tps(bits, batch).toFixed(0),
              sub: "tok/s at batch " + batch,
              flag: quantized ? "ok" : "warn",
            }),
            d.stat({
              label: "vs FP16",
              value: quantized ? speed.toFixed(2) + "×" : "—",
              sub: quantized
                ? (speed > 3 ? "bandwidth-bound" : "compute-bound")
                : "baseline",
              flag: !quantized ? undefined : speed > 3 ? "ok" : "bad",
            }),
          ]),
        ]),
      ]);
    },
  };

  // ====================================================================
// ======================================================================
// SIM · queryrewrite   (content/query-transformation.md)
//
// THE TIME AXIS: one question crossing the transformation pipeline of §3
// and §4 — route, generate a hypothetical, embed, retrieve once per
// variant, dedupe on chunk id, fuse by rank, hand over the top-k. Those
// are the real stages in the real order; nothing is added for motion.
//
// CONFIG — every figure on screen is computed from this, none typed in:
//
//   corpus        7 passages, text verbatim in queryrewrite_CORPUS below.
//
//   similarity    cosine over binary content-word bags,
//                     sim(A,B) = |A ∩ B| / sqrt(|A| · |B|)
//                 content word = lowercase alphabetic run of length > 3,
//                 minus the stoplist below. This is cruder than a dense
//                 embedding and it is a real computation, run here — and
//                 it exhibits precisely the asymmetry the page is about:
//                 a question shares almost no vocabulary with its answer.
//
//   retrieval     each variant returns its top 3 passages scoring > 0.
//                 A passage sharing no term is not a candidate at all.
//
//   router        the page's needs_transformation(): words = tokens of
//                 length > 3 (no stoplist — the page's own rule);
//                 transform when len(words) < 4 OR overlap with the
//                 corpus vocabulary < 0.3.
//
//   fusion        the page's rrf_fuse(): score = Σ 1/(60 + rank) over the
//                 variant lists, damping = 60. Ranks only, never scores.
//
//   latency       the page's §6 figures: a 600 ms transformation
//                 generation against a 2,000 ms p95 budget → 30 %.
//
//   variant cost  the page's §2 table: HyDE = 1 LLM call + 1 retrieval,
//                 multi-query = 1 LLM call + N retrievals.
// ======================================================================

var queryrewrite_STOP = ("that this with when from them than they have been does into your " +
  "what which then also only such each very much like will most some more over just both " +
  "same other where while these those must should could would before after because there " +
  "their were").split(" ");

var queryrewrite_K = 60;        // RRF damping, the constant from Cormack et al.
var queryrewrite_TOPN = 3;      // candidates kept per variant
var queryrewrite_GEN_MS = 600;  // §6: the transformation generation
var queryrewrite_P95_MS = 2000; // §6: the p95 budget it is spent from

// --- the index ---------------------------------------------------------
var queryrewrite_CORPUS = [
  { id: "planner/seq-scan", gold: "a",
    text: "The query planner picks a sequential scan when it estimates most rows will match, " +
          "because reading the whole table beats random index lookups at that selectivity." },
  { id: "planner/statistics",
    text: "Planner row estimates come from table statistics. After a bulk load the statistics " +
          "are stale, so run ANALYZE to refresh them before blaming the index." },
  { id: "support/slow-ticket",
    text: "Users report that the application feels slow. Slow responses should be investigated " +
          "promptly and escalated to the on-call engineer." },
  { id: "halberd/ingest", gold: "c",
    text: "Halberd ingest drains at two thousand events per second. When producers exceed that " +
          "rate a backlog forms and end-to-end latency climbs until the queue empties." },
  { id: "runtime/pool-exhaustion",
    text: "Connection pool exhaustion looks like a slow service: every pooled connection is held " +
          "by a long transaction, so new requests wait for one to be returned." },
  { id: "guide/perf-method",
    text: "Performance work begins with measurement. Find the slow component first, then change " +
          "one thing at a time and measure again." },
  { id: "docs/dashboard",
    text: "The dashboard documentation explains how to read the latency panel, the throughput " +
          "panel and the error-rate panel." }
];

// --- tokenisers --------------------------------------------------------
// bag(): content words, used for similarity.
function queryrewrite_bag(text) {
  var raw = String(text).toLowerCase().split(/[^a-z]+/);
  var seen = {}, out = [];
  for (var i = 0; i < raw.length; i++) {
    var w = raw[i];
    if (w.length <= 3) continue;
    if (queryrewrite_STOP.indexOf(w) >= 0) continue;
    if (seen["#" + w]) continue;
    seen["#" + w] = 1;
    out.push(w);
  }
  return out;
}

// words(): the page's router tokeniser — length > 3, stoplist NOT applied.
function queryrewrite_words(text) {
  var raw = String(text).toLowerCase().split(/[^a-z]+/);
  var seen = {}, out = [];
  for (var i = 0; i < raw.length; i++) {
    var w = raw[i];
    if (w.length <= 3 || seen["#" + w]) continue;
    seen["#" + w] = 1;
    out.push(w);
  }
  return out;
}

(function () {
  for (var i = 0; i < queryrewrite_CORPUS.length; i++) {
    queryrewrite_CORPUS[i].bag = queryrewrite_bag(queryrewrite_CORPUS[i].text);
  }
})();

// corpus vocabulary the router compares against
var queryrewrite_VOCAB = (function () {
  var seen = {}, out = [];
  for (var i = 0; i < queryrewrite_CORPUS.length; i++) {
    var ws = queryrewrite_words(queryrewrite_CORPUS[i].text);
    for (var j = 0; j < ws.length; j++) {
      if (!seen["#" + ws[j]]) { seen["#" + ws[j]] = 1; out.push(ws[j]); }
    }
  }
  return out;
})();

// --- the retriever -----------------------------------------------------
function queryrewrite_cos(a, b) {
  if (!a.length || !b.length) return 0;
  var n = 0;
  for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) n++;
  return n / Math.sqrt(a.length * b.length);
}

function queryrewrite_shared(a, b) {
  var out = [];
  for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) out.push(a[i]);
  return out;
}

// score every passage, ranked, zeros included — the "what the index saw" view
function queryrewrite_scoreAll(text) {
  var q = queryrewrite_bag(text), out = [];
  for (var i = 0; i < queryrewrite_CORPUS.length; i++) {
    var p = queryrewrite_CORPUS[i];
    out.push({
      id: p.id, i: i, gold: p.gold,
      score: queryrewrite_cos(q, p.bag),
      shared: queryrewrite_shared(q, p.bag)
    });
  }
  out.sort(function (x, y) { return y.score - x.score || x.i - y.i; });
  for (var r = 0; r < out.length; r++) out[r].rank = r + 1;
  return out;
}

// what a retriever actually returns: top N with score > 0
function queryrewrite_search(text) {
  var all = queryrewrite_scoreAll(text), out = [];
  for (var i = 0; i < all.length && out.length < queryrewrite_TOPN; i++) {
    if (all[i].score > 0) out.push({ id: all[i].id, score: all[i].score, rank: out.length + 1, gold: all[i].gold });
  }
  return out;
}

function queryrewrite_rankOf(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].rank;
  return 0;                              // 0 = not retrieved at all
}

// --- the router: the page's needs_transformation(), computed -----------
function queryrewrite_router(q) {
  var words = queryrewrite_words(q);
  var hit = 0;
  for (var i = 0; i < words.length; i++) if (queryrewrite_VOCAB.indexOf(words[i]) >= 0) hit++;
  var overlap = words.length ? hit / words.length : 0;
  return {
    query: q, words: words, hit: hit, overlap: overlap,
    shortTest: words.length < 4,
    overlapTest: words.length ? overlap < 0.3 : true,
    transform: !words.length || words.length < 4 || overlap < 0.3
  };
}

// --- the page's rrf_fuse(), computed -----------------------------------
function queryrewrite_rrf(lists) {
  var acc = {}, order = [], i, j;
  for (i = 0; i < lists.length; i++) {
    for (j = 0; j < lists[i].results.length; j++) {
      var r = lists[i].results[j], key = "#" + r.id;
      if (!acc[key]) { acc[key] = { id: r.id, score: 0, ranks: [], gold: r.gold }; order.push(key); }
      acc[key].score += 1 / (queryrewrite_K + r.rank);
      acc[key].ranks.push({ variant: lists[i].label, rank: r.rank });
    }
  }
  var out = [];
  for (i = 0; i < order.length; i++) out.push(acc[order[i]]);
  out.sort(function (x, y) { return y.score - x.score; });
  for (i = 0; i < out.length; i++) out[i].rank = i + 1;
  return out;
}

function queryrewrite_slots(lists) {
  var n = 0;
  for (var i = 0; i < lists.length; i++) n += lists[i].results.length;
  return n;
}

function queryrewrite_f3(x) { return x.toFixed(3); }

// ======================================================================
// The three runs. All texts are the scenario's input; every number below
// is derived from them by the functions above.
// ======================================================================
var queryrewrite_QA = "why is it slow?";
var queryrewrite_HYDE_A =
  "The query planner picks a sequential scan whenever it estimates most rows will match, so " +
  "the index is skipped and the whole table is read end to end. Row estimates come from table " +
  "statistics, which go stale after a bulk load.";
var queryrewrite_MULTI_A = [
  "sequential scan chosen instead of index lookup",
  "stale table statistics after bulk load",
  "planner row estimates and selectivity"
];
var queryrewrite_DECLINED = "sequential scan versus index scan on large tables";

var queryrewrite_QC = "why is halberd ingest slow";
var queryrewrite_HYDE_C =
  "Halberd slows down when the service is under-provisioned. Typical causes are insufficient " +
  "memory, an undersized connection pool and long transactions holding resources; profile the " +
  "application, increase the worker count and add caching.";

// --- scenario 1: retrieve with the raw question ------------------------
function queryrewrite_raw() {
  var q = queryrewrite_QA;
  var bag = queryrewrite_bag(q);
  var route = queryrewrite_router(q);
  var scored = queryrewrite_scoreAll(q);
  var list = queryrewrite_search(q);
  var gold = null, i;
  for (i = 0; i < scored.length; i++) if (scored[i].gold === "a") gold = scored[i];
  var goldRank = queryrewrite_rankOf(list, gold.id);

  var steps = [{
    view: "query", query: q, bag: bag, label: "original", tokenised: false,
    caption: "A " + queryrewrite_CORPUS.length + "-passage index, and a four-word question. " +
      "This run retrieves with the question exactly as typed — press Play."
  }];

  steps.push({
    view: "query", query: q, bag: bag, label: "original", flag: "warn",
    caption: "<b>Tokenise.</b> Of four words, <b>" + bag.length + "</b> survives the " +
      "length-and-stoplist filter: <i>" + bag.join(", ") + "</i>. That single term is the " +
      "entire signal the retriever has to match on."
  });

  steps.push({
    view: "router", route: route, declined: queryrewrite_router(queryrewrite_DECLINED),
    flag: "warn",
    caption: "<b>The router would have said transform.</b> " + route.words.length +
      " word" + (route.words.length === 1 ? "" : "s") + " of length &gt; 3, so " +
      "<code>len(words) &lt; 4</code> is <b>true</b> and the heuristic returns <b>" +
      route.transform + "</b> in microseconds. This run ignores it and retrieves raw, " +
      "which is the baseline everything else is measured against."
  });

  steps.push({
    view: "score", scored: scored, probe: q, probeLabel: "the question", flag: "bad",
    caption: "<b>Score every passage.</b> Cosine over content-word bags. The passage that " +
      "actually answers the question — <i>" + gold.id + "</i> — scores <b>" +
      queryrewrite_f3(gold.score) + "</b>: it shares <b>zero</b> content words with the " +
      "question. The three passages that do score share exactly one word, <i>slow</i>."
  });

  steps.push({
    view: "lists", lists: [{ label: "original", results: list }], flag: "bad",
    caption: "<b>The candidate pool.</b> " + list.length + " passages clear a non-zero score, " +
      "and all " + list.length + " of them are generic prose <i>about slowness</i> — a support " +
      "ticket, a pool-exhaustion note, a tuning method. Not one of them contains the answer."
  });

  steps.push({
    view: "final", fused: queryrewrite_rrf([{ label: "original", results: list }]),
    goldId: gold.id, goldRank: goldRank, flag: "bad",
    caption: "<b>Top-k handed to the generator.</b> The answer passage is <b>not in it</b> — " +
      "rank <b>" + (goldRank || "—") + "</b>, because a retriever cannot rank what it never " +
      "scored. Everything downstream — reranking, fusion, a bigger context window — is now " +
      "arranging passages that do not contain the answer."
  });

  steps.push({
    view: "final", fused: queryrewrite_rrf([{ label: "original", results: list }]),
    goldId: gold.id, goldRank: goldRank, flag: "bad",
    caption: "<b>This is the asymmetry, measured.</b> Question and answer were written by " +
      "different people for different purposes: similarity <b>" + queryrewrite_f3(gold.score) +
      "</b> between them, against <b>" + queryrewrite_f3(scored[0].score) + "</b> for a " +
      "passage that merely repeats the asker's own word. Embeddings reward text that " +
      "<i>looks alike</i>, and a question does not look like its own answer. Swap the tab."
  });

  return { id: "raw", label: "Raw query", steps: steps };
}

// --- scenario 2: HyDE + multi-query, fused -----------------------------
function queryrewrite_hyde() {
  var q = queryrewrite_QA;
  var route = queryrewrite_router(q);
  var hyBag = queryrewrite_bag(queryrewrite_HYDE_A);
  var hyScored = queryrewrite_scoreAll(queryrewrite_HYDE_A);
  var qScored = queryrewrite_scoreAll(q);

  var lists = [{ label: "original", results: queryrewrite_search(q) },
               { label: "hyde", results: queryrewrite_search(queryrewrite_HYDE_A) }];
  var i;
  for (i = 0; i < queryrewrite_MULTI_A.length; i++) {
    lists.push({ label: "multi-" + i, results: queryrewrite_search(queryrewrite_MULTI_A[i]) });
  }

  var gold = null, goldQ = null;
  for (i = 0; i < hyScored.length; i++) if (hyScored[i].gold === "a") gold = hyScored[i];
  for (i = 0; i < qScored.length; i++) if (qScored[i].gold === "a") goldQ = qScored[i];

  var slots = queryrewrite_slots(lists);
  var fused = queryrewrite_rrf(lists);
  var unique = fused.length;
  var pct = (queryrewrite_GEN_MS / queryrewrite_P95_MS) * 100;
  var llmCalls = 2;                       // §2 table: HyDE 1 call, multi-query 1 call
  var retrievals = lists.length;          // one per variant

  var steps = [{
    view: "query", query: q, bag: queryrewrite_bag(q), label: "original",
    caption: "Same question, same index. This run rewrites before it retrieves."
  }];

  steps.push({
    view: "router", route: route, declined: queryrewrite_router(queryrewrite_DECLINED),
    flag: "ok",
    caption: "<b>Route first.</b> The heuristic runs on both tests: <code>len(words)=" +
      route.words.length + " &lt; 4</code> → <b>true</b>, and <code>overlap=" +
      route.overlap.toFixed(2) + " &lt; 0.3</code> → <b>" + route.overlapTest + "</b>. " +
      "The length test fires, so this query is transformed. The second row shows a query the " +
      "router <i>declines</i> — that one retrieves fine as written and pays for nothing."
  });

  steps.push({
    view: "gen", probe: queryrewrite_HYDE_A, bag: hyBag, genMs: queryrewrite_GEN_MS,
    budget: queryrewrite_P95_MS, pct: pct, flag: "warn",
    caption: "<b>HyDE: hallucinate an answer, deliberately.</b> No retrieval, no grounding — " +
      "the model writes a passage that <i>looks like</i> documentation. It costs <b>" +
      queryrewrite_GEN_MS + " ms</b> of a <b>" + queryrewrite_P95_MS + " ms</b> p95 budget, " +
      "<b>" + pct.toFixed(0) + "%</b> spent before retrieval has begun, and it is serial: " +
      "you cannot search until it finishes."
  });

  steps.push({
    view: "variants", lists: lists, llmCalls: llmCalls, retrievals: retrievals, flag: "ok",
    caption: "<b>Multi-query too.</b> One more call returns " + queryrewrite_MULTI_A.length +
      " paraphrases in document vocabulary, not the asker's. The pipeline now holds <b>" +
      lists.length + " variants</b> for <b>" + llmCalls + " LLM calls</b> and <b>" +
      retrievals + " retrievals</b> — and the original is still one of them, always."
  });

  steps.push({
    view: "score", scored: hyScored, probe: queryrewrite_HYDE_A, probeLabel: "the hypothetical",
    flag: "ok",
    caption: "<b>Embed the fake answer, not the question.</b> Against the question, <i>" +
      gold.id + "</i> scored <b>" + queryrewrite_f3(goldQ.score) + "</b>. Against the " +
      "hypothetical it scores <b>" + queryrewrite_f3(gold.score) + "</b> on <b>" +
      gold.shared.length + "</b> shared terms — <i>" + gold.shared.slice(0, 6).join(", ") +
      "</i>. Nothing about the index changed. The probe changed shape."
  });

  steps.push({
    view: "lists", lists: lists, flag: "ok",
    caption: "<b>Five retrievals, five ranked lists.</b> They are independent, so they run in " +
      "parallel — the " + queryrewrite_GEN_MS + " ms generation was the only serial cost. " +
      "Note the original's list: still the same three generic passages. It is not pulling its " +
      "weight here; it is the floor for the runs where it does."
  });

  steps.push({
    view: "dedupe", lists: lists, slots: slots, unique: unique, flag: "warn",
    caption: "<b>Deduplicate on chunk id, before fusing.</b> " + slots + " retrieved slots " +
      "collapse to <b>" + unique + "</b> distinct passages. Skip this and the same passage " +
      "takes three of your top-k slots — the fusion then counts a duplicate as agreement."
  });

  steps.push({
    view: "rrf", fused: fused, lists: lists, flag: "ok",
    caption: "<b>Fuse by rank, never by score.</b> The variants are different queries so their " +
      "score scales are not comparable, but ranks always are: <code>Σ 1/(60 + rank)</code>. " +
      "<i>" + fused[0].id + "</i> places in <b>" + fused[0].ranks.length + "</b> of " +
      lists.length + " lists and totals <b>" + fused[0].score.toFixed(5) + "</b>; a passage " +
      "that topped exactly one list cannot catch it."
  });

  steps.push({
    view: "final", fused: fused, goldId: gold.id, goldRank: 1, lists: lists, flag: "ok",
    caption: "<b>Rank " + queryrewrite_rankOf(fused, gold.id) + ", from unretrievable.</b> " +
      "The hypothetical was factually unchecked and is now discarded — it was never shown to " +
      "anyone and its content was never used. Only its <i>shape</i> mattered: written in the " +
      "register of an answer, it landed near real answers. Cost: " + llmCalls + " calls and " +
      queryrewrite_GEN_MS + " ms on the critical path, which is why the router in frame 1 " +
      "exists."
  });

  return { id: "hyde", label: "HyDE + multi-query", steps: steps };
}

// --- scenario 3: HyDE on an entity the model has no prior for ----------
function queryrewrite_unknown() {
  var q = queryrewrite_QC;
  var qList = queryrewrite_search(q);
  var hyBag = queryrewrite_bag(queryrewrite_HYDE_C);
  var hyScored = queryrewrite_scoreAll(queryrewrite_HYDE_C);
  var hyList = queryrewrite_search(queryrewrite_HYDE_C);
  var lists = [{ label: "original", results: qList }, { label: "hyde", results: hyList }];
  var fused = queryrewrite_rrf(lists);
  var i, gold = null;
  for (i = 0; i < hyScored.length; i++) if (hyScored[i].gold === "c") gold = hyScored[i];

  var rawRank = queryrewrite_rankOf(qList, gold.id);
  var hydeRank = queryrewrite_rankOf(hyList, gold.id);
  var fusedRank = queryrewrite_rankOf(fused, gold.id);
  var margin = fused.length > 1 ? fused[0].score - fused[1].score : 0;
  var hyOnly = queryrewrite_rrf([{ label: "hyde", results: hyList }]);

  var steps = [{
    view: "query", query: q, bag: queryrewrite_bag(q), label: "original",
    caption: "A different question, about a product name the model has never seen. The same " +
      "pipeline, and the failure the page warns about."
  }];

  steps.push({
    view: "score", scored: queryrewrite_scoreAll(q), probe: q, probeLabel: "the question",
    flag: "ok",
    caption: "<b>The raw query is unusually strong here.</b> <i>halberd</i> and <i>ingest</i> " +
      "are rare, discriminative terms, so the question alone ranks <i>" + gold.id +
      "</i> at <b>rank " + rawRank + "</b> with score <b>" +
      queryrewrite_f3(queryrewrite_scoreAll(q)[0].score) + "</b>. Keep that number."
  });

  steps.push({
    view: "gen", probe: queryrewrite_HYDE_C, bag: hyBag, genMs: queryrewrite_GEN_MS,
    budget: queryrewrite_P95_MS, pct: (queryrewrite_GEN_MS / queryrewrite_P95_MS) * 100,
    flag: "warn",
    caption: "<b>HyDE generates anyway — and it has no prior.</b> With nothing known about " +
      "Halberd the model writes confident, generic operations prose: memory, connection pools, " +
      "worker counts. <b>" + hyBag.length + "</b> content words, and the real system's " +
      "vocabulary — queue, backlog, producers, drain rate — appears nowhere in it."
  });

  steps.push({
    view: "score", scored: hyScored, probe: queryrewrite_HYDE_C, probeLabel: "the hypothetical",
    flag: "bad",
    caption: "<b>A generic probe retrieves generic passages.</b> The hypothetical tops out on " +
      "<i>" + hyScored[0].id + "</i> at <b>" + queryrewrite_f3(hyScored[0].score) +
      "</b>, while the passage that actually answers the question falls to <b>" +
      queryrewrite_f3(gold.score) + "</b> — one shared term, the product name. HyDE has not " +
      "failed loudly; it has failed <i>silently</i>, returning plausible neighbours."
  });

  steps.push({
    view: "lists", lists: lists, flag: "warn",
    caption: "<b>Two lists, pulling opposite ways.</b> Raw query: <i>" + gold.id +
      "</i> at rank <b>" + rawRank + "</b>. HyDE: rank <b>" + (hydeRank || "—") +
      "</b>, behind two passages about entirely different systems. This is the moment the " +
      "page's rule earns itself — <i>keep both</i>."
  });

  steps.push({
    view: "rrf", fused: fused, lists: lists, flag: "warn",
    caption: "<b>Fusion holds the line, barely.</b> RRF puts <i>" + fused[0].id +
      "</i> first at <b>" + fused[0].score.toFixed(5) + "</b> against <b>" +
      fused[1].score.toFixed(5) + "</b> — a margin of <b>" + margin.toFixed(6) +
      "</b>. The raw query's rank-1 vote is the only thing keeping the answer on top; HyDE's " +
      "list is voting for noise."
  });

  steps.push({
    view: "final", fused: hyOnly, goldId: gold.id, goldRank: queryrewrite_rankOf(hyOnly, gold.id),
    lists: [{ label: "hyde", results: hyList }], flag: "bad",
    caption: "<b>The counterfactual: HyDE alone.</b> Drop the raw query — the thing every " +
      "tutorial implies you can do — and the top-2 is <i>" + hyOnly[0].id + "</i> and <i>" +
      hyOnly[1].id + "</i>. The answer sits at rank <b>" +
      queryrewrite_rankOf(hyOnly, gold.id) + "</b> in a top-k that a shorter cut would have " +
      "thrown away, and the generator would ground a confident answer in the wrong system."
  });

  steps.push({
    view: "final", fused: fused, goldId: gold.id, goldRank: fusedRank, lists: lists, flag: "warn",
    caption: "<b>HyDE's hallucination is the mechanism; its ignorance is the flaw.</b> On a " +
      "familiar topic the fake answer moved the target passage from unretrievable to rank 1. " +
      "On an unfamiliar entity it moved it from rank " + rawRank + " to rank " +
      (hydeRank || "—") + ". You cannot tell which case you are in at query time — so retrieve " +
      "with the raw query too, always, and let RRF decide. The raw query is the floor."
  });

  return { id: "unknown", label: "Unknown entity", steps: steps };
}

// ======================================================================
S["queryrewrite"] = {
  title: "Rewrite the question, then watch what the index returns",
  note: "One question, three runs, over the same " + queryrewrite_CORPUS.length +
    "-passage index. Similarity is computed here, not asserted: cosine over binary " +
    "content-word bags (<code>|A∩B| / √(|A|·|B|)</code>, words longer than three characters, " +
    "stoplist removed). It is cruder than a dense embedding and it shows the same asymmetry — " +
    "a question shares almost no vocabulary with its own answer. Routing uses the page's " +
    "<code>needs_transformation</code> heuristic, fusion uses its <code>rrf_fuse</code> at " +
    "damping <b>" + queryrewrite_K + "</b>, and the latency figures are the page's " +
    queryrewrite_GEN_MS + " ms generation against a " + queryrewrite_P95_MS + " ms p95 budget.",
  interval: 1500,
  scenarios: [queryrewrite_raw(), queryrewrite_hyde(), queryrewrite_unknown()],

  draw: function (step, d, ctx) {
    var i, j, html;

    // ---- shared: the index card, scored or idle -----------------------
    function indexCard(scored, title, statusText, statusFlag) {
      var bars = [], max = 0;
      for (var a = 0; a < scored.length; a++) if (scored[a].score > max) max = scored[a].score;
      for (var b = 0; b < scored.length; b++) {
        var s = scored[b];
        bars.push(d.bar({
          label: s.id,
          pct: max ? (s.score / max) * 100 : 0,
          value: queryrewrite_f3(s.score),
          flag: s.gold ? (s.score > 0 ? "ok" : "bad") : (s.score > 0 ? undefined : "idle")
        }));
      }
      return d.node({
        title: title,
        status: statusText,
        statusFlag: statusFlag,
        badge: "cosine",
        meta: queryrewrite_CORPUS.length + " passages · " + queryrewrite_VOCAB.length +
          " vocabulary terms",
        flag: statusFlag,
        body: bars.join("")
      });
    }

    function bagCells(bag, label) {
      var cells = [];
      for (var a = 0; a < bag.length; a++) cells.push({ label: bag[a], title: "content word" });
      if (!cells.length) cells.push({ label: "—", flag: "bad", title: "no content words" });
      return d.cells(cells, { label: label, dense: bag.length > 12 });
    }

    // ---- view: the query, tokenised -----------------------------------
    if (step.view === "query") {
      return d.flow([
        d.stack([
          d.big(step.bag.length, "content words"),
          d.mono("“" + step.query + "”")
        ]),
        d.node({
          title: "query bag",
          status: step.tokenised === false ? "NOT TOKENISED" : "TOKENISED",
          statusFlag: step.tokenised === false ? "idle" : (step.bag.length < 2 ? "warn" : "ok"),
          badge: "len > 3",
          meta: step.tokenised === false ? "awaiting the tokeniser" : "stoplist removed",
          flag: step.tokenised === false ? "idle" : (step.bag.length < 2 ? "warn" : undefined),
          body: step.tokenised === false
            ? d.note("Every word still in play — the filter has not run yet.")
            : bagCells(step.bag, "what the retriever will match on")
        }),
        d.stack([
          d.stat({ label: "index", value: String(queryrewrite_CORPUS.length), sub: "passages" }),
          d.stat({ label: "vocabulary", value: String(queryrewrite_VOCAB.length), sub: "terms" })
        ])
      ]);
    }

    // ---- view: the router ---------------------------------------------
    if (step.view === "router") {
      var rows = [];
      var pair = [step.route, step.declined];
      for (i = 0; i < pair.length; i++) {
        var r = pair[i];
        rows.push([
          "“" + r.query + "”",
          String(r.words.length),
          r.overlap.toFixed(2),
          r.transform ? "TRANSFORM" : "retrieve raw"
        ]);
      }
      return d.stack([
        d.flow([
          d.big(step.route.words.length, "words, len > 3"),
          d.node({
            title: "needs_transformation()",
            status: step.route.transform ? "TRANSFORM" : "PASS THROUGH",
            statusFlag: step.route.transform ? "warn" : "ok",
            badge: "microseconds",
            meta: "no model call",
            flag: step.route.transform ? "warn" : "ok",
            rows: [
              { label: "len(words) < 4", value: String(step.route.shortTest),
                flag: step.route.shortTest ? "warn" : "ok" },
              { label: "overlap with corpus vocab", value: step.route.overlap.toFixed(2) },
              { label: "overlap < 0.3", value: String(step.route.overlapTest),
                flag: step.route.overlapTest ? "warn" : "ok" }
            ],
            body: bagCells(step.route.words, "router tokens (no stoplist — the page's rule)")
          }),
          d.stat({
            label: "verdict", value: step.route.transform ? "rewrite" : "as written",
            sub: step.route.transform ? "pay a generation" : "pay nothing",
            flag: step.route.transform ? "warn" : "ok"
          })
        ]),
        d.table(["query", "words", "overlap", "router verdict"], rows),
        d.note("The router is the part teams skip, and skipping it is why transformation " +
          "pipelines get abandoned: a generation on every request, including the ones that " +
          "were already fine.")
      ]);
    }

    // ---- view: the generator writing a hypothetical --------------------
    if (step.view === "gen") {
      return d.stack([
        d.flow([
          d.stack([
            d.big(step.genMs + " ms", "generation, serial"),
            d.gauge({
              label: "p95 budget spent before retrieval",
              pct: step.pct,
              value: step.pct.toFixed(0) + "% of " + step.budget + " ms",
              flag: "warn"
            })
          ]),
          d.node({
            title: "generator LLM",
            status: "NO RETRIEVAL",
            statusFlag: "warn",
            badge: "plausibility, not truth",
            meta: "output is never shown to the user",
            flag: "warn",
            body: d.mono(step.probe) + bagCells(step.bag, "the probe's content words")
          }),
          d.stat({
            label: "probe terms", value: String(step.bag.length),
            sub: "vs the question's", flag: "ok"
          })
        ]),
        d.note("It is a <b>search probe shaped like an answer</b>, not an answer. Its facts are " +
          "never checked because its facts are never used.")
      ]);
    }

    // ---- view: scoring the corpus --------------------------------------
    if (step.view === "score") {
      return d.stack([
        d.flow([
          d.mono("probe: " + step.probe.slice(0, 96) + (step.probe.length > 96 ? " …" : "")),
          indexCard(step.scored, "vector index", "SCORED", step.flag === "bad" ? "bad" : "ok"),
          d.stack([
            d.stat({
              label: "top score", value: queryrewrite_f3(step.scored[0].score),
              sub: step.scored[0].id
            }),
            d.stat({
              label: "non-zero", value: String((function () {
                var n = 0;
                for (var a = 0; a < step.scored.length; a++) if (step.scored[a].score > 0) n++;
                return n;
              })()),
              sub: "of " + step.scored.length + " passages"
            })
          ])
        ]),
        d.note("Scored against <b>" + d.esc(step.probeLabel) + "</b>. Green marks the passage " +
          "that actually answers the question.")
      ]);
    }

    // ---- view: the variant fan-out --------------------------------------
    if (step.view === "variants") {
      var pills = [];
      for (i = 0; i < step.lists.length; i++) {
        pills.push({
          label: step.lists[i].label,
          flag: step.lists[i].label === "original" ? "ok" :
            step.lists[i].label === "hyde" ? "warn" : undefined
        });
      }
      return d.stack([
        d.flow([
          d.big(step.lists.length, "variants"),
          d.node({
            title: "variant set",
            status: "FANNED OUT",
            statusFlag: "ok",
            badge: step.llmCalls + " LLM calls",
            meta: step.retrievals + " retrievals, run in parallel",
            flag: "ok",
            body: d.pills(pills),
            rows: [
              { label: "HyDE", value: "1 call + 1 retrieval" },
              { label: "multi-query", value: "1 call + " + queryrewrite_MULTI_A.length + " retrievals" },
              { label: "original", value: "0 calls + 1 retrieval", flag: "ok" }
            ]
          }),
          d.stat({ label: "serial cost", value: queryrewrite_GEN_MS + " ms", sub: "the generation", flag: "warn" })
        ]),
        d.note("Cost from the page's technique table. The retrievals are independent, so only " +
          "the generation is on the critical path.")
      ]);
    }

    // ---- view: the ranked lists ------------------------------------------
    if (step.view === "lists") {
      var lanes = [];
      for (i = 0; i < step.lists.length; i++) {
        var cells = [];
        for (j = 0; j < step.lists[i].results.length; j++) {
          var res = step.lists[i].results[j];
          cells.push({
            label: String(res.rank) + " " + res.id,
            flag: res.gold ? "ok" : undefined,
            title: res.id + " — similarity " + queryrewrite_f3(res.score)
          });
        }
        if (!cells.length) cells.push({ label: "nothing scored", flag: "bad" });
        lanes.push(d.lane({ label: step.lists[i].label, cells: cells }));
      }
      return d.stack([
        d.flow([
          d.big(queryrewrite_slots(step.lists), "retrieved slots"),
          d.node({
            title: "ranked lists",
            status: step.lists.length + (step.lists.length === 1 ? " VARIANT" : " VARIANTS"),
            statusFlag: step.flag === "bad" ? "bad" : "ok",
            badge: "top " + queryrewrite_TOPN + " each",
            meta: "score > 0 only",
            flag: step.flag === "bad" ? "bad" : undefined,
            body: lanes.join("")
          })
        ]),
        d.note("Each lane is one variant's result list, best first.")
      ]);
    }

    // ---- view: dedupe ------------------------------------------------------
    if (step.view === "dedupe") {
      var raw = [], seen = {}, uniq = [];
      for (i = 0; i < step.lists.length; i++) {
        for (j = 0; j < step.lists[i].results.length; j++) {
          var id = step.lists[i].results[j].id;
          var dup = !!seen["#" + id];
          raw.push({ label: id, flag: dup ? "bad" : "ok", title: dup ? "duplicate chunk id" : "first sighting" });
          if (!dup) { seen["#" + id] = 1; uniq.push({ label: id, flag: "ok" }); }
        }
      }
      return d.stack([
        d.flow([
          d.big(step.slots, "slots retrieved"),
          d.node({
            title: "dedupe on chunk id",
            status: step.slots + " → " + step.unique,
            statusFlag: "warn",
            badge: "before fusing",
            meta: (step.slots - step.unique) + " duplicates removed",
            flag: "warn",
            body: d.cells(raw, { label: "every retrieved slot (red = already seen)", dense: true }) +
              d.cells(uniq, { label: "distinct passages entering the fusion", dense: true })
          }),
          d.big(step.unique, "distinct passages", "ok")
        ]),
        d.note("Dedupe <b>before</b> RRF, not after: an undeduplicated passage votes for itself " +
          "several times and the fusion reads that as agreement.")
      ]);
    }

    // ---- view: RRF ----------------------------------------------------------
    if (step.view === "rrf") {
      var head = ["passage"], rrows = [];
      for (i = 0; i < step.lists.length; i++) head.push(step.lists[i].label);
      head.push("Σ 1/(60+rank)");
      for (i = 0; i < step.fused.length; i++) {
        var f = step.fused[i], row = [f.id];
        for (j = 0; j < step.lists.length; j++) {
          var rk = queryrewrite_rankOf(step.lists[j].results, f.id);
          row.push(rk ? String(rk) : "—");
        }
        row.push(f.score.toFixed(5));
        rrows.push(row);
      }
      var gauges = [];
      for (i = 0; i < step.fused.length && i < 4; i++) {
        gauges.push({
          label: step.fused[i].id,
          pct: (step.fused[i].score / step.fused[0].score) * 100,
          value: step.fused[i].score.toFixed(5),
          flag: step.fused[i].gold ? "ok" : undefined
        });
      }
      return d.stack([
        d.flow([
          d.big(step.lists.length, "lists fused"),
          d.node({
            title: "rrf_fuse(damping = " + queryrewrite_K + ")",
            status: "RANKS ONLY",
            statusFlag: "ok",
            badge: "never raw scores",
            meta: "score scales are not comparable across variants; ranks are",
            flag: "ok",
            gauges: gauges
          })
        ]),
        d.table(head, rrows),
        d.note("A passage placing well for several phrasings beats one placing first for " +
          "exactly one — because a single phrasing placing something first is often luck.")
      ]);
    }

    // ---- view: the final top-k ------------------------------------------------
    var tk = [];
    for (i = 0; i < step.fused.length; i++) {
      tk.push({
        label: (i + 1) + " · " + step.fused[i].id,
        flag: step.fused[i].id === step.goldId ? "ok" : (i < 3 ? "warn" : "idle"),
        title: "RRF " + step.fused[i].score.toFixed(5)
      });
    }
    return d.stack([
      d.flow([
        d.big(step.goldRank ? "rank " + step.goldRank : "absent", "the answer passage",
          step.goldRank === 1 ? "ok" : step.goldRank ? "warn" : "bad"),
        d.node({
          title: "top-k context",
          status: step.goldRank === 1 ? "ANSWER AT 1" : step.goldRank ? "ANSWER BURIED" : "NO ANSWER",
          statusFlag: step.goldRank === 1 ? "ok" : step.goldRank ? "warn" : "bad",
          badge: "handed to the generator",
          meta: step.fused.length + " candidates after fusion",
          flag: step.goldRank === 1 ? "ok" : step.goldRank ? "warn" : "bad",
          body: d.cells(tk, { label: "fused ordering" })
        }),
        d.stat({
          label: "grounding",
          value: step.goldRank === 1 ? "correct" : step.goldRank ? "at risk" : "impossible",
          sub: step.goldRank ? "answer is in the pool" : "answer never retrieved",
          flag: step.goldRank === 1 ? "ok" : step.goldRank ? "warn" : "bad"
        })
      ]),
      d.note("Transformation moves <b>recall</b> — whether the passage is in the pool at all. " +
        "A reranker cannot fix an empty pool.")
    ]);
  }
};

  // ====================================================================
  // ======================================================================
  // SIM · sparsekernel  (kernel-and-attention-optimization.md)
  //
  // One request crossing the two layers that sit under the serving stack.
  // Layer 1 decides WHICH attention scores are computed at all; layer 2
  // decides WHAT INSTRUCTIONS compute the survivors. The frames are the
  // stages of that crossing in the order of the page's §4 UML:
  //
  //   select -> Morton layout -> block attention -> softmax exp ->
  //   accumulate -> KV bytes -> tally
  //
  // CONFIG — everything on screen is computed from these. Nothing is typed in.
  //
  //   WORK MODEL (the page's own §5 code, verbatim in shape):
  //     prefill pairs = p*p/2, multiplied by sparsity
  //     decode  pairs = p*g + g*g/2, NOT multiplied — decode is already
  //                     linear, so sparsity buys bandwidth there, not compute
  //   SHAPES (the page's own SHAPES table):
  //     doc analysis 64,000 / 1,000      chat turn 600 / 400
  //   SPARSITY = 0.10                    the page's "@10% sparse" column
  //
  //   KERNEL RATES, all derived from FlashAttention-4's reported figures:
  //     FA4      = 1605 TFLOP/s BF16 on B200            (reported)
  //     peak     = 1605 / 0.71   ~ 2261 TFLOP/s         (from "≈71% util")
  //     cuDNN    = 1605 / 1.3    ~ 1235 TFLOP/s         (from "1.3x cuDNN")
  //     Triton   = 1605 / 2.7    ~  594 TFLOP/s         (from "2.7x Triton")
  //     — the three divide back to 71% / 55% / 26% of that peak, which is the
  //       consistency check that the derivation is the page's own arithmetic.
  //   ACCUMULATE: BF16 : FP32 matrix throughput on GB200 = 28 : 1 (page)
  //     BF16x9 = 28/9 of the native FP32 path, BF16x6 = 28/6.
  //
  //   The ONE number here the page does not state is the KV block size, 128
  //   tokens. It is a tile-size config choice, it is labelled as such, and it
  //   only sets how the block grid is DRAWN — no reported result depends on it.
  //
  // Baseline for every speedup: dense attention on the cuDNN 9.13 path.
  //   speedup = (dense work / this work) x (this kernel rate / cuDNN rate)
  // ======================================================================
  var sparsekernel_SPARSITY = 0.10;
  var sparsekernel_BLOCK = 128;
  var sparsekernel_FA4_TF = 1605;
  var sparsekernel_FA4_UTIL = 0.71;
  var sparsekernel_VS_CUDNN = 1.3;
  var sparsekernel_VS_TRITON = 2.7;
  var sparsekernel_BF16_FP32 = 28;

  var sparsekernel_PEAK_TF = sparsekernel_FA4_TF / sparsekernel_FA4_UTIL;
  var sparsekernel_CUDNN_TF = sparsekernel_FA4_TF / sparsekernel_VS_CUDNN;
  var sparsekernel_TRITON_TF = sparsekernel_FA4_TF / sparsekernel_VS_TRITON;
  var sparsekernel_X9 = sparsekernel_BF16_FP32 / 9;
  var sparsekernel_X6 = sparsekernel_BF16_FP32 / 6;

  /** The page's attn_cost(), in query-key pair units. */
  function sparsekernel_cost(p, g, sparsity) {
    var prefill = (p * p / 2) * sparsity;     // the quadratic term — sparsity hits here
    var decode = p * g + g * g / 2;           // already linear — untouched
    return { prefill: prefill, decode: decode, total: prefill + decode };
  }

  /** 2.11e9 — the page prints its table this way, and 2,112,500,000 teaches less. */
  function sparsekernel_sci(n) {
    if (!n) return "0";
    var e = Math.floor(Math.log(n) / Math.LN10);
    var m = n / Math.pow(10, e);
    if (m >= 9.995) { m = m / 10; e = e + 1; }
    return m.toFixed(2) + "e" + e;
  }

  /** Deterministic scatter: which coarse cells the selector kept. */
  function sparsekernel_picked(i, n, k) { return ((i * 31) % n) < k; }

  /**
   * Build one run. o = { id, label, p, g, sparse, fa4 }
   * Every derived figure is computed once here and carried on every frame, so
   * draw() never invents anything it was not handed.
   */
  function sparsekernel_run(o) {
    var dense = sparsekernel_cost(o.p, o.g, 1);
    var work = sparsekernel_cost(o.p, o.g, o.sparse ? sparsekernel_SPARSITY : 1);

    var blocks = Math.ceil(o.p / sparsekernel_BLOCK);
    var selBlocks = o.sparse
      ? Math.max(1, Math.round(blocks * sparsekernel_SPARSITY))
      : blocks;

    // the grid is a MAP of those blocks — at 500 blocks one cell is ten of them
    var perCell = Math.ceil(blocks / 50);
    var cellN = Math.ceil(blocks / perCell);
    var selCells = 0, i;
    for (i = 0; i < cellN; i++) {
      if (!o.sparse || sparsekernel_picked(i, cellN, Math.max(1, Math.round(cellN * sparsekernel_SPARSITY)))) selCells++;
    }

    var rate = o.fa4 ? sparsekernel_FA4_TF : sparsekernel_CUDNN_TF;
    var workGain = dense.total / work.total;              // layer 1
    var rateGain = rate / sparsekernel_CUDNN_TF;          // layer 2
    var speed = workGain * rateGain;                      // the composition
    var prefillShare = dense.prefill / dense.total * 100; // the column that decides everything

    var c = {
      p: o.p, g: o.g, sparse: o.sparse, fa4: o.fa4,
      dense: dense, work: work,
      blocks: blocks, selBlocks: selBlocks, perCell: perCell,
      cellN: cellN, selCells: selCells,
      rate: rate, workGain: workGain, rateGain: rateGain, speed: speed,
      prefillShare: prefillShare,
      tiny: blocks < 20,                                  // a prompt too short to select over
      accum: o.fa4 ? sparsekernel_X9 : 1
    };

    var pct = Math.round(sparsekernel_SPARSITY * 100);
    var steps = [];

    // ---- 0 · idle ------------------------------------------------------
    steps.push({
      stage: 0, cfg: c, name: "at the door",
      caption: "A <b>" + d_fmt(o.p) + "</b>-token prompt with " + d_fmt(o.g) +
        " tokens to generate, about to cross the stack. " +
        (o.sparse ? "Sparse selection on, FlashAttention-4, BF16x9 accumulate."
                  : "Dense attention, cuDNN 9.13, native FP32 accumulate.") +
        " Press play and watch which arithmetic survives each layer."
    });

    // ---- 1 · layer 1: selection ---------------------------------------
    steps.push({
      stage: 1, cfg: c, name: o.sparse ? "index branch selects" : "no selector",
      flag: o.sparse ? "warn" : undefined,
      caption: o.sparse
        ? "<b>Layer 1 · the selector runs first.</b> A lightweight index branch scores " +
          "block summaries and keeps the top " + pct + "% per GQA group: <b>" +
          d_fmt(c.selBlocks) + " of " + d_fmt(c.blocks) + "</b> KV blocks. Attention over " +
          "those will be <i>exact</i> — what you lose is whatever the selector failed to " +
          "select, so the failure mode is retrieval, and perplexity cannot see it." +
          (c.tiny ? " Note the size: " + d_fmt(o.p) + " tokens is only " + c.blocks +
            " blocks of " + sparsekernel_BLOCK + ", so a " + pct +
            "% selection is barely expressible. The run below still grants the paper its " +
            pct + "%." : "")
        : "<b>Layer 1 · nothing selects.</b> Dense attention scores every query against " +
          "every key, so all " + d_fmt(c.blocks) + " KV blocks are in play. The prefill " +
          "triangle alone is p²/2 = <b>" + sparsekernel_sci(c.dense.prefill) +
          "</b> query-key pairs. Nothing is skipped — and nothing can be missed."
    });

    // ---- 2 · layer 1: making the selection addressable -----------------
    steps.push({
      stage: 2, cfg: c, name: o.sparse ? "Morton / Z-order" : "already contiguous",
      caption: o.sparse
        ? "<b>Selection produces scatter, and scatter is the worst shape for a GPU.</b> " +
          "Morton order interleaves the index bits so those " + d_fmt(c.selBlocks) +
          " blocks become consecutive addresses spread across memory banks. Selection " +
          "alone would not be fast; this is the step that makes it fast."
        : "<b>Nothing to gather.</b> Dense attention walks the cache in order, so there " +
          "is no scattered set for Z-order to fix here. Its other job — swizzling to " +
          "avoid shared-memory bank conflicts inside the tile — still applies."
    });

    // ---- 3 · layer 1: the work is now countable ------------------------
    steps.push({
      stage: 3, cfg: c, name: "block attention",
      flag: o.sparse ? "ok" : undefined,
      caption: "<b>Attention runs, and only now is the work countable.</b> Prefill " +
        sparsekernel_sci(c.work.prefill) + " + decode " + sparsekernel_sci(c.work.decode) +
        " = <b>" + sparsekernel_sci(c.work.total) + " pairs</b>, against " +
        sparsekernel_sci(c.dense.total) + " dense — <b>" + c.workGain.toFixed(1) +
        "×</b> less work. At this shape prefill is <b>" + c.prefillShare.toFixed(0) +
        "%</b> of the dense total, and sparsity multiplies <i>only</i> that term: the " +
        "decode " + sparsekernel_sci(c.work.decode) + " is identical in both columns." +
        (c.prefillShare < 50
          ? " With prefill under half the work, the ceiling is already set before the " +
            "selector has done anything clever."
          : "")
    });

    // ---- 4 · layer 2: the exponential ---------------------------------
    steps.push({
      stage: 4, cfg: c, name: o.fa4 ? "polynomial exp (FA4)" : "MUFU.EX2 (SFU)",
      flag: o.fa4 ? "ok" : "warn",
      caption: o.fa4
        ? "<b>Layer 2 · FlashAttention-4 stops using the special function unit.</b> " +
          "exp() becomes a polynomial evaluated on the FMA/tensor-core path — more " +
          "arithmetic, on the hardware that has arithmetic to spare. Reported: <b>" +
          sparsekernel_FA4_TF + " TFLOP/s</b> BF16 on B200 at ≈" +
          Math.round(sparsekernel_FA4_UTIL * 100) + "% utilisation, " +
          sparsekernel_VS_CUDNN + "× cuDNN 9.13 and " + sparsekernel_VS_TRITON +
          "× Triton. Those three figures imply a peak of " +
          sparsekernel_PEAK_TF.toFixed(0) + " TFLOP/s — which is the bar below."
        : "<b>Layer 2 · softmax needs exp(), and it goes to the SFU.</b> MUFU.EX2: one " +
          "instruction per element on a unit whose throughput stayed roughly flat while " +
          "tensor-core throughput doubled per generation. Softmax used to be the bit " +
          "between the two matmuls; on Blackwell it is the constraint. This path achieves " +
          sparsekernel_CUDNN_TF.toFixed(0) + " TFLOP/s — " +
          (sparsekernel_CUDNN_TF / sparsekernel_PEAK_TF * 100).toFixed(0) + "% of peak."
    });

    // ---- 5 · layer 2: the accumulate ----------------------------------
    steps.push({
      stage: 5, cfg: c, name: o.fa4 ? "BF16x9 accumulate" : "native FP32",
      flag: o.fa4 ? "ok" : "warn",
      caption: o.fa4
        ? "<b>The same trade, one level down.</b> Split each FP32 matrix into BF16 " +
          "pieces, take all nine cross products, accumulate in FP32: nine multiplies at " +
          "1/" + sparsekernel_BF16_FP32 + "th the cost each = <b>" +
          sparsekernel_X9.toFixed(2) + "×</b> the native FP32 path. BF16x6 drops three " +
          "cross products for " + sparsekernel_X6.toFixed(2) +
          "× — and is correct only while exponents stay in roughly [-110, 111]. That " +
          "conditional correctness is a category of bug, not a setting."
        : "<b>Accumulating in native FP32.</b> On GB200, FP32 matrix throughput is " +
          "1/" + sparsekernel_BF16_FP32 + "th of BF16, so this runs on the narrow unit " +
          "while the wide one waits. Nine BF16 multiplies would reconstruct the same " +
          "accuracy at " + sparsekernel_X9.toFixed(2) + "× the speed — that is BF16x9, " +
          "and it arrived as a CUDA 12.9 library, not as an instruction."
    });

    // ---- 6 · layer 3: the bytes did not move --------------------------
    steps.push({
      stage: 6, cfg: c, name: "KV bytes",
      flag: o.sparse ? "warn" : undefined,
      caption: o.sparse
        ? "<b>Layer 3 · nothing here got smaller.</b> All " + d_fmt(o.p + o.g) +
          " tokens still have K and V resident: the selector chose which blocks to " +
          "<i>read</i>, not which to <i>store</i>. Sparsity bought prefill latency and " +
          "therefore TTFT. It bought no concurrency, because the cache is exactly the " +
          "size it was — faster, not cheaper."
        : "<b>Layer 3 · the cache is full and every byte of it is read.</b> All " +
          d_fmt(o.p + o.g) + " tokens are resident and dense attention touches all of " +
          "them. This is the layer the KV cache page owns; note that sparse attention " +
          "would not shrink it either."
    });

    // ---- 7 · the tally -------------------------------------------------
    steps.push({
      stage: 7, cfg: c, name: "tally",
      flag: c.speed >= 5 ? "ok" : c.speed > 1.05 ? "warn" : undefined,
      caption: !o.sparse && !o.fa4
        ? "<b>Baseline: " + sparsekernel_sci(c.work.total) + " pairs at " +
          c.rate.toFixed(0) + " TFLOP/s.</b> Nothing here is broken — it is simply what a " +
          "team has after upgrading the GPU generation and not the attention kernel. " +
          "Every multiple on the other tabs is measured against this run."
        : c.speed >= 5
          ? "<b>" + c.speed.toFixed(1) + "× against dense on cuDNN 9.13</b> = " +
            c.workGain.toFixed(1) + "× less work (layer 1) × " + c.rateGain.toFixed(1) +
            "× the kernel rate (layer 2). The two layers compose because they answer " +
            "different questions — <i>which</i> arithmetic runs, and <i>how</i>. Note " +
            "which half you own: the " + c.rateGain.toFixed(1) +
            "× was a dependency bump, the " + c.workGain.toFixed(1) +
            "× was a checkpoint property you chose, plus a retrieval risk you now have " +
            "to gate with a needle probe."
          : "<b>" + c.speed.toFixed(1) + "×, and " + c.rateGain.toFixed(1) +
            " of it was free.</b> The kernel upgrade delivered " + c.rateGain.toFixed(1) +
            "×; the sparse attention you took a retrieval-failure risk for delivered " +
            c.workGain.toFixed(1) + "×, because prefill is only " +
            c.prefillShare.toFixed(0) + "% of the work at " + d_fmt(o.p) +
            " tokens. The paper said 10× because the paper benchmarked at 128K. " +
            "Compute your prefill share <i>before</i> adopting anything in §2."
    });

    return { id: o.id, label: o.label, steps: steps };
  }

  // d.fmt is only reachable inside draw(); the builders need the same commas.
  function d_fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  S["sparsekernel"] = {
    title: "Walk one prompt down the two layers under the stack",
    note: "The same request three ways, on the page's own shapes. Attention work is " +
      "counted with the page's §5 formula — prefill <b>p²/2</b> scaled by sparsity, decode " +
      "<b>p·g + g²/2</b> never scaled — at the page's 10% sparsity. Kernel rates are " +
      "derived from FlashAttention-4's reported <b>1605 TFLOP/s</b> BF16 on B200 at ≈71% " +
      "utilisation, 1.3× cuDNN 9.13 and 2.7× Triton, and the accumulate figures from the " +
      "page's <b>28:1</b> BF16:FP32 matrix-throughput ratio on GB200. The only number not " +
      "from the page is the 128-token KV block, a tile-size choice that sets how the grid " +
      "is drawn and nothing else.",
    interval: 1400,
    scenarios: [
      sparsekernel_run({ id: "dense", label: "Dense · cuDNN 9.13", p: 64000, g: 1000, sparse: false, fa4: false }),
      sparsekernel_run({ id: "sparse", label: "Sparse · FA4 · BF16x9", p: 64000, g: 1000, sparse: true, fa4: true }),
      sparsekernel_run({ id: "chat", label: "Same stack, chat turn", p: 600, g: 400, sparse: true, fa4: true })
    ],

    draw: function (step, d, ctx) {
      var c = step.cfg;
      var st = step.stage;
      var i;

      // ---- which of the page's four stack layers we are inside ----------
      var layer = st === 0 || st === 7 ? 0 : st <= 3 ? 1 : st <= 5 ? 2 : 3;
      var pills = d.pills([
        { label: "1 · which scores", flag: layer === 1 ? "ok" : "idle" },
        { label: "2 · how to compute", flag: layer === 2 ? "ok" : "idle" },
        { label: "3 · bytes moved", flag: layer === 3 ? "ok" : "idle" },
        { label: "4 · whether to run", flag: "idle" }
      ]);

      var left = d.stack([
        st >= 7
          ? d.big(c.speed.toFixed(1) + "×", "vs dense · cuDNN", c.speed >= 5 ? "ok" : c.speed > 1.05 ? "warn" : "idle")
          : d.big(d.fmt(c.p), "prompt tokens"),
        pills
      ]);

      // ---- the body of the component card changes with the stage --------
      var body, status, statusFlag, gauges = [];

      if (st === 0 || st === 1 || st === 2) {
        // the block map: selected vs skipped, scattered (st 1) then gathered (st 2)
        var cells = [];
        var nSel = Math.max(1, Math.round(c.cellN * sparsekernel_SPARSITY));
        for (i = 0; i < c.cellN; i++) {
          var on = !c.sparse || (st === 2 ? i < c.selCells : sparsekernel_picked(i, c.cellN, nSel));
          cells.push({
            label: "",
            flag: st === 0 ? "idle" : on ? "ok" : "idle",
            title: (on ? "selected — exact attention runs here" : "not selected — invisible to this query") +
              " · ≈" + c.perCell + " block" + (c.perCell === 1 ? "" : "s") + " of " + sparsekernel_BLOCK + " tokens"
          });
        }
        body = d.cells(cells, {
          label: (st === 2 && c.sparse ? "after Z-order — contiguous" : "KV blocks") +
            " · 1 cell ≈ " + c.perCell + " block" + (c.perCell === 1 ? "" : "s") + " of " + sparsekernel_BLOCK,
          dense: c.cellN > 12
        });
        status = st === 0 ? "IDLE" : c.sparse ? "TOP-" + Math.round(sparsekernel_SPARSITY * 100) + "%" : "ALL BLOCKS";
        statusFlag = st === 0 ? "idle" : c.sparse ? "warn" : undefined;
        gauges = [{
          label: "blocks attendable",
          pct: c.selBlocks / c.blocks * 100,
          value: d.fmt(c.selBlocks) + " / " + d.fmt(c.blocks),
          flag: c.sparse ? "warn" : "ok"
        }];
      } else if (st === 3) {
        // work, in pair units, as a share of the dense total
        body = d.stack([
          d.bar({ label: "dense total", pct: 100, value: sparsekernel_sci(c.dense.total), flag: "idle" }),
          d.bar({
            label: "prefill (p²/2 × " + (c.sparse ? sparsekernel_SPARSITY : 1) + ")",
            pct: c.work.prefill / c.dense.total * 100,
            value: sparsekernel_sci(c.work.prefill), flag: "ok"
          }),
          d.bar({
            label: "decode (p·g + g²/2)", pct: c.work.decode / c.dense.total * 100,
            value: sparsekernel_sci(c.work.decode), flag: "warn"
          })
        ]);
        status = c.workGain.toFixed(1) + "× LESS WORK";
        statusFlag = c.workGain > 1.05 ? "ok" : "idle";
        gauges = [{
          label: "prefill share of dense work", pct: c.prefillShare,
          value: c.prefillShare.toFixed(0) + "%", flag: c.prefillShare > 80 ? "ok" : "bad"
        }];
      } else if (st === 4) {
        // achieved attention-kernel rate, against the peak the page's own ratios imply
        body = d.stack([
          d.bar({
            label: "Triton", pct: sparsekernel_TRITON_TF / sparsekernel_PEAK_TF * 100,
            value: sparsekernel_TRITON_TF.toFixed(0) + " TF/s", flag: "idle"
          }),
          d.bar({
            label: "cuDNN 9.13 · MUFU.EX2", pct: sparsekernel_CUDNN_TF / sparsekernel_PEAK_TF * 100,
            value: sparsekernel_CUDNN_TF.toFixed(0) + " TF/s", flag: c.fa4 ? "idle" : "warn"
          }),
          d.bar({
            label: "FlashAttention-4 · polynomial", pct: sparsekernel_FA4_TF / sparsekernel_PEAK_TF * 100,
            value: sparsekernel_FA4_TF + " TF/s", flag: c.fa4 ? "ok" : "idle"
          }),
          d.mono(c.fa4 ? "exp(x) -> polynomial on FMA / tensor cores"
                       : "exp(x) -> MUFU.EX2 on the special function unit", c.fa4 ? "ok" : "warn")
        ]);
        status = c.fa4 ? "POLYNOMIAL" : "SFU BOUND";
        statusFlag = c.fa4 ? "ok" : "warn";
        gauges = [{
          label: "utilisation of implied peak (" + sparsekernel_PEAK_TF.toFixed(0) + " TF/s)",
          pct: c.rate / sparsekernel_PEAK_TF * 100,
          value: (c.rate / sparsekernel_PEAK_TF * 100).toFixed(0) + "%",
          flag: c.fa4 ? "ok" : "warn"
        }];
      } else if (st === 5) {
        // FP32-accurate matmul: one native multiply, or N cheap ones
        body = d.stack([
          d.bar({ label: "native FP32", pct: 1 / sparsekernel_X6 * 100, value: "1.00×", flag: c.fa4 ? "idle" : "warn" }),
          d.bar({
            label: "BF16x9 · 9 MMAs, FP32 accumulate", pct: sparsekernel_X9 / sparsekernel_X6 * 100,
            value: sparsekernel_X9.toFixed(2) + "×", flag: c.fa4 ? "ok" : "idle"
          }),
          d.bar({
            label: "BF16x6 · conditionally correct", pct: 100,
            value: sparsekernel_X6.toFixed(2) + "×", flag: "bad"
          }),
          d.mono("BF16 : FP32 matrix throughput on GB200 = " + sparsekernel_BF16_FP32 + " : 1")
        ]);
        status = c.fa4 ? "BF16x9" : "FP32 UNITS";
        statusFlag = c.fa4 ? "ok" : "warn";
        gauges = [{
          label: "FP32-accurate matmul rate", pct: c.accum / sparsekernel_X6 * 100,
          value: c.accum.toFixed(2) + "×", flag: c.fa4 ? "ok" : "warn"
        }];
      } else if (st === 6) {
        // residency is untouched by everything above it
        var res = [];
        for (i = 0; i < 24; i++) {
          res.push({ label: "", flag: "ok", title: "K and V resident — stored regardless of what the selector read" });
        }
        body = d.stack([
          d.cells(res, { label: "KV residency · " + d.fmt(c.p + c.g) + " tokens, all of them", dense: true }),
          d.row("read this prefill", c.sparse ? Math.round(sparsekernel_SPARSITY * 100) + "% of blocks" : "100% of blocks", c.sparse ? "ok" : undefined),
          d.row("stored", "100% of tokens", c.sparse ? "warn" : undefined)
        ]);
        status = "FULL SIZE";
        statusFlag = c.sparse ? "warn" : "idle";
      } else {
        // the composition
        body = d.table(
          ["", "dense · cuDNN", "this run"],
          [
            ["attention work", sparsekernel_sci(c.dense.total) + " pairs", sparsekernel_sci(c.work.total) + " pairs"],
            ["kernel rate", sparsekernel_CUDNN_TF.toFixed(0) + " TF/s", c.rate.toFixed(0) + " TF/s"],
            ["layer 1 gain", "1.0×", c.workGain.toFixed(1) + "×"],
            ["layer 2 gain", "1.0×", c.rateGain.toFixed(1) + "×"],
            ["composed", "1.0×", c.speed.toFixed(1) + "×"]
          ]
        );
        status = c.speed.toFixed(1) + "× TOTAL";
        statusFlag = c.speed >= 5 ? "ok" : c.speed > 1.05 ? "warn" : "idle";
      }

      var node = d.node({
        title: "Stage " + (st || 0) + " · " + step.name,
        status: status, statusFlag: statusFlag,
        badge: c.sparse ? "sparse" : "dense",
        meta: d.fmt(c.p) + " prompt · " + d.fmt(c.g) + " generated",
        flag: statusFlag === "bad" ? "bad" : statusFlag,
        gauges: gauges, body: body
      });

      var right = d.stack([
        d.stat({
          label: "attention work",
          value: st >= 3 ? sparsekernel_sci(c.work.total) : "—",
          sub: st >= 3 ? "dense " + sparsekernel_sci(c.dense.total) : "query·key pairs",
          flag: st >= 3 ? (c.workGain > 1.05 ? "ok" : undefined) : "idle"
        }),
        d.stat({
          label: "kernel rate",
          value: st >= 4 ? c.rate.toFixed(0) : "—",
          sub: st >= 4 ? "TFLOP/s BF16" : "TFLOP/s BF16",
          flag: st >= 4 ? (c.fa4 ? "ok" : "warn") : "idle"
        }),
        d.stat({
          label: "vs dense · cuDNN",
          value: st >= 7 ? c.speed.toFixed(1) + "×" : "—",
          sub: st >= 7 ? c.workGain.toFixed(1) + "× work · " + c.rateGain.toFixed(1) + "× rate" : "composed at the end",
          flag: st >= 7 ? (c.speed >= 5 ? "ok" : c.speed > 1.05 ? "warn" : "idle") : "idle"
        })
      ]);

      return d.stack([
        d.flow([left, node, right]),
        d.note(
          st <= 3
            ? "Layer 1 — <b>which scores get computed at all.</b> Sparsity attacks the quadratic prefill term and nothing else."
            : st <= 5
              ? "Layer 2 — <b>what instructions compute them.</b> Both moves here are the same trade: when one unit doubles and its neighbours do not, migrate work toward the fast unit even at the cost of doing more of it."
              : "Layer 3 — <b>how many bytes move.</b> Neither layer above touches it, which is why sparse attention cuts latency without cutting cost.",
          st <= 3 ? undefined : st <= 5 ? "ok" : "warn"
        )
      ]);
    }
  };

  // ====================================================================
  // ======================================================================
  // SIM · synthgen  (synthetic-data.md)
  // The eval-set generation pipeline draining stage by stage — the page's own
  // flow: enumerate the taxonomy -> generate backwards -> dedupe at 0.9 ->
  // verify by construction -> add surface noise -> human-review a sample ->
  // ship v0 -> see what it actually measures.
  //
  // CONFIG (everything on screen is computed from these, nothing is typed in):
  //   chunks        = 100
  //   CATEGORIES    = the six buckets in the page's dict
  //   per_chunk     = 2                      (the page's generate_eval_items)
  //   seeds         = chunks x categories                     = 600
  //   candidates    = seeds x per_chunk                       = 1,200
  //   dedupe        = drop above 0.9 cosine similarity
  //   review sample = 50                     (the page's UML: "sample of 50")
  //   collapse rate = 50 distinct per 1,000 items  <- the page's own measured
  //                   symptom of an unseeded run, Depth table, row 1
  //   surface forms = well-formed + the five the page names (typos, lowercase,
  //                   terse, over-long, jargon) = 6, assigned round-robin
  //
  // Two derived quantities do the teaching:
  //   COLLISION SURFACE = fraction of item PAIRS that share a generation seed.
  //     Near-duplicates can only come from items that were asked for together,
  //     so this is the surface dedupe has to police. pairs(n) = n(n-1)/2.
  //   DISTINCT FLOOR    = for a seeded run, at least one distinct question per
  //     seed survives, because different chunks are different passages.
  // ======================================================================
  var SYNTHGEN_CHUNKS = 100;
  var SYNTHGEN_CATS = ["lookup", "comparison", "multi_hop", "paraphrase", "ambiguous", "unanswerable"];
  var SYNTHGEN_PER_CHUNK = 2;
  var SYNTHGEN_THRESH = 0.9;
  var SYNTHGEN_SAMPLE = 50;
  var SYNTHGEN_COLLAPSE_N = 50;      // page: "1,000 items, ~50 distinct questions"
  var SYNTHGEN_COLLAPSE_D = 1000;
  var SYNTHGEN_FORMS = ["well-formed", "typos", "lowercase", "terse", "over-long", "jargon"];

  var SYNTHGEN_SEEDS = SYNTHGEN_CHUNKS * SYNTHGEN_CATS.length;        // 600
  var SYNTHGEN_CAND = SYNTHGEN_SEEDS * SYNTHGEN_PER_CHUNK;            // 1,200

  function synthgen_pairs(n) { return (n * (n - 1)) / 2; }

  var SYNTHGEN_ALLPAIRS = synthgen_pairs(SYNTHGEN_CAND);              // 719,400
  var SYNTHGEN_SEEDPAIRS = SYNTHGEN_SEEDS * synthgen_pairs(SYNTHGEN_PER_CHUNK);  // 600
  var SYNTHGEN_SURFACE_BACK = (SYNTHGEN_SEEDPAIRS / SYNTHGEN_ALLPAIRS) * 100;    // 0.083%
  var SYNTHGEN_DISTINCT_FWD =
    Math.round(SYNTHGEN_CAND * SYNTHGEN_COLLAPSE_N / SYNTHGEN_COLLAPSE_D);       // 60
  var SYNTHGEN_DROPPABLE_FWD = SYNTHGEN_CAND - SYNTHGEN_DISTINCT_FWD;            // 1,140
  var SYNTHGEN_KEPT_BACK = SYNTHGEN_SEEDS;                            // 600, the floor
  var SYNTHGEN_PER_BUCKET = SYNTHGEN_KEPT_BACK / SYNTHGEN_CATS.length;           // 100
  var SYNTHGEN_PER_FORM = SYNTHGEN_KEPT_BACK / SYNTHGEN_FORMS.length;            // 100

  var SYNTHGEN_STAGES = ["tax", "gen", "dedupe", "verify", "surface", "review", "ship", "measure"];
  var SYNTHGEN_STAGE_LONG = [
    "enumerate the taxonomy yourself",
    "generate",
    "deduplicate by embedding, drop above " + SYNTHGEN_THRESH,
    "verify: does the reference actually answer it?",
    "add surface noise",
    "human-review a sample of " + SYNTHGEN_SAMPLE,
    "ship as v0 — explicitly a bootstrap",
    "what the set actually measures",
  ];

  var SYNTHGEN_STATUS = ["TAXONOMY", "GENERATED", "DEDUPED", "VERIFIED", "SURFACE", "REVIEWED", "SHIPPED v0", "MEASURED"];

  function synthgen_pct(a, b) { return b ? (a / b) * 100 : 0; }

  // Each scenario walks the same eight stages; only the verdicts differ.
  function synthgen_scenario(id, label, idleCaption, build) {
    var steps = [{
      stage: -1, marks: [], items: 0, distinct: null, verifiable: 0, reviewed: 0,
      forms: 0, seeds: 0, buckets: null, provenance: "—",
      calc: SYNTHGEN_CHUNKS + " chunks · " + SYNTHGEN_CATS.length + " categories · per_chunk = " + SYNTHGEN_PER_CHUNK,
      caption: idleCaption,
    }];
    var marks = [];
    build(function (stage, verdict, s) {
      marks[stage] = verdict;
      s.stage = stage;
      s.marks = marks.slice();
      s.flag = verdict;
      steps.push(s);
    });
    return { id: id, label: label, steps: steps };
  }

  // --- scenario 1: backwards generation, every stage run -----------------
  function synthgen_back() {
    return synthgen_scenario("back", "Backwards + verify",
      "A corpus of " + SYNTHGEN_CHUNKS + " chunks and no eval set. The first move is not " +
      "“write me some questions” — press Play.",
      function (push) {
        push(0, "ok", {
          items: 0, distinct: null, verifiable: 0, reviewed: 0, forms: 0,
          seeds: SYNTHGEN_SEEDS, buckets: null, provenance: "—",
          calc: SYNTHGEN_CHUNKS + " × " + SYNTHGEN_CATS.length + " = " + SYNTHGEN_SEEDS + " seeds",
          caption: "<b>You</b> enumerate the buckets, not the model. Six categories × " +
            SYNTHGEN_CHUNKS + " chunks gives <b>" + SYNTHGEN_SEEDS + " distinct seeds</b>, one prompt " +
            "each. This is the step that makes every later number possible: “varied questions” " +
            "is one seed, and one seed is one mode.",
        });
        push(1, "ok", {
          items: SYNTHGEN_CAND, distinct: null, verifiable: SYNTHGEN_CAND, reviewed: 0, forms: 0,
          seeds: SYNTHGEN_SEEDS, buckets: null, provenance: "synthetic",
          calc: SYNTHGEN_SEEDS + " seeds × per_chunk " + SYNTHGEN_PER_CHUNK + " = " +
            SYNTHGEN_CAND + " candidates",
          caption: "<b>Generate backwards.</b> Each call hands the model a chunk and asks for " +
            SYNTHGEN_PER_CHUNK + " questions <i>that chunk answers</i>. The reference existed before " +
            "the question did, so all <b>" + SYNTHGEN_CAND + "</b> candidates are verifiable by " +
            "construction — nothing was hunted for afterwards.",
        });
        push(2, "ok", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: 0, forms: 0, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic",
          calc: SYNTHGEN_SEEDPAIRS + " of " + SYNTHGEN_ALLPAIRS + " item pairs share a seed = " +
            SYNTHGEN_SURFACE_BACK.toFixed(3) + "% collision surface",
          caption: "<b>Dedupe at " + SYNTHGEN_THRESH + ".</b> Two items can only be near-duplicates " +
            "if they were asked for together, so the surface dedupe has to police is just the " +
            "within-seed pairs: <b>" + SYNTHGEN_SEEDPAIRS + " of " + SYNTHGEN_ALLPAIRS + " pairs</b>, " +
            SYNTHGEN_SURFACE_BACK.toFixed(3) + "%. Even in the worst case — both questions in " +
            "every call collapsing into one — <b>" + SYNTHGEN_KEPT_BACK + "</b> distinct items " +
            "survive, one per seed. That floor is what the seeding bought.",
        });
        push(3, "ok", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: 0, forms: 0, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic",
          calc: (SYNTHGEN_PER_BUCKET * (SYNTHGEN_CATS.length - 1)) + " span-in-chunk checks + " +
            SYNTHGEN_PER_BUCKET + " span-is-NONE checks",
          caption: "<b>Verify.</b> Five buckets are checked by asking whether the quoted span " +
            "appears verbatim in the referenced chunk — <b>" +
            (SYNTHGEN_PER_BUCKET * (SYNTHGEN_CATS.length - 1)) + "</b> items. The " +
            "<i>unanswerable</i> bucket is checked the opposite way: keep it only if the span is " +
            "NONE — <b>" + SYNTHGEN_PER_BUCKET + "</b> items. Failures are discarded, never " +
            "repaired; a repair preserves the misunderstanding in a tidier form.",
        });
        push(4, "ok", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: 0, forms: SYNTHGEN_FORMS.length, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic",
          calc: SYNTHGEN_KEPT_BACK + " ÷ " + SYNTHGEN_FORMS.length + " forms = " +
            SYNTHGEN_PER_FORM + " items per surface form",
          caption: "<b>Surface noise.</b> The items are spread round-robin across all six forms — " +
            SYNTHGEN_PER_FORM + " each of well-formed, typo’d, lowercase, terse, over-long and " +
            "jargon-heavy. This is the step everyone skips, and the one that matters most: real " +
            "users write badly and synthetic users do not.",
        });
        push(5, "ok", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: SYNTHGEN_SAMPLE, forms: SYNTHGEN_FORMS.length, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic",
          calc: SYNTHGEN_SAMPLE + " of " + SYNTHGEN_KEPT_BACK + " read by a human = " +
            synthgen_pct(SYNTHGEN_SAMPLE, SYNTHGEN_KEPT_BACK).toFixed(1) + "%",
          caption: "<b>Human review.</b> Fifty items, about an hour, " +
            synthgen_pct(SYNTHGEN_SAMPLE, SYNTHGEN_KEPT_BACK).toFixed(1) + "% of the set — and it " +
            "tells you whether the other " + (SYNTHGEN_KEPT_BACK - SYNTHGEN_SAMPLE) + " are worth " +
            "anything. If the sample is bad you revise the taxonomy and regenerate; you do not " +
            "patch the items.",
        });
        push(6, "ok", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: SYNTHGEN_SAMPLE, forms: SYNTHGEN_FORMS.length, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic × " + SYNTHGEN_KEPT_BACK + " · logged × 0",
          calc: "every item tagged provenance=synthetic, version=v0",
          caption: "<b>Ship v0.</b> " + SYNTHGEN_KEPT_BACK + " items, " + SYNTHGEN_PER_BUCKET +
            " per bucket, every one verified and every one tagged <code>synthetic</code>. The tag is " +
            "the cheap decision that lets you split the score later; retrofitting “where did this " +
            "item come from” is impossible.",
        });
        push(7, "ok", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: SYNTHGEN_SAMPLE, forms: SYNTHGEN_FORMS.length, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic × " + SYNTHGEN_KEPT_BACK + " · logged × 0",
          calc: SYNTHGEN_KEPT_BACK + " items / " + SYNTHGEN_KEPT_BACK + " distinct questions = " +
            synthgen_pct(SYNTHGEN_KEPT_BACK, SYNTHGEN_KEPT_BACK).toFixed(0) + "% coverage",
          caption: "<b>" + SYNTHGEN_KEPT_BACK + " items measuring " + SYNTHGEN_KEPT_BACK +
            " questions.</b> Verified, diverse, messy, provenance-tagged — and still synthetic, " +
            "which means it is still the centre of the distribution. This is a good <i>bootstrap</i>, " +
            "not a good <i>measurement</i>: the job from here is the ratchet — every real logged " +
            "failure becomes a permanent case, and the synthetic share falls.",
        });
      });
  }

  // --- scenario 2: forward generation, unseeded, nothing filtered --------
  function synthgen_fwd() {
    var BATCH = 50;                                   // the page's "ask for fifty questions"
    var CALLS = SYNTHGEN_CAND / BATCH;                // 24 identical calls
    return synthgen_scenario("fwd", "Forward, unseeded",
      "Same corpus, same budget, the obvious approach: ask the model for questions and find " +
      "the references afterwards.",
      function (push) {
        push(0, "bad", {
          items: 0, distinct: null, verifiable: 0, reviewed: 0, forms: 0,
          seeds: 1, buckets: null, provenance: "—",
          calc: "1 prompt shape, repeated → 1 seed",
          caption: "<b>No taxonomy.</b> The prompt says “write varied questions about this " +
            "corpus”. You have delegated the failure categories to the model, which does not " +
            "know them — and every call is now the <b>same seed</b>. Seeds: <b>1</b>, against " +
            SYNTHGEN_SEEDS + " on the other tab.",
        });
        push(1, "bad", {
          items: SYNTHGEN_CAND, distinct: null, verifiable: 0, reviewed: 0, forms: 1,
          seeds: 1, buckets: null, provenance: "synthetic",
          calc: CALLS + " calls × " + BATCH + " questions = " + SYNTHGEN_CAND + " candidates, references hunted after",
          caption: "<b>Generate forwards.</b> " + CALLS + " calls of " + BATCH + " gives the same " +
            "<b>" + SYNTHGEN_CAND + "</b> candidates — the volume is identical. But the question " +
            "came first and the reference was retrieved afterwards, so every reference is a guess " +
            "dressed as ground truth. Verifiable by construction: <b>0</b>.",
        });
        push(2, "bad", {
          items: SYNTHGEN_CAND, distinct: SYNTHGEN_DISTINCT_FWD, verifiable: 0, reviewed: 0, forms: 1,
          seeds: 1, buckets: null, provenance: "synthetic",
          calc: SYNTHGEN_ALLPAIRS + " of " + SYNTHGEN_ALLPAIRS + " pairs share a seed = 100% collision surface",
          caption: "<b>Dedupe skipped</b> — and this is where the damage hides. One seed means " +
            "<b>all " + SYNTHGEN_ALLPAIRS + "</b> item pairs are collision candidates. At the page’s " +
            "measured collapse rate of " + SYNTHGEN_COLLAPSE_N + " distinct per " +
            SYNTHGEN_COLLAPSE_D + " items, these " + SYNTHGEN_CAND + " items are <b>" +
            SYNTHGEN_DISTINCT_FWD + "</b> questions in " + SYNTHGEN_CAND + " costumes. Dedupe would " +
            "have dropped " + SYNTHGEN_DROPPABLE_FWD + " of them. Not running it does not make them " +
            "distinct — it makes the collapse invisible.",
        });
        push(3, "bad", {
          items: SYNTHGEN_CAND, distinct: SYNTHGEN_DISTINCT_FWD, verifiable: 0, reviewed: 0, forms: 1,
          seeds: 1, buckets: null, provenance: "synthetic",
          calc: "0 of " + SYNTHGEN_CAND + " items have a reference known before the question",
          caption: "<b>Verification has nothing to stand on.</b> The span check compares the answer " +
            "to a chunk that was <i>retrieved because it looked right</i>. Passing it proves the " +
            "retrieval was self-consistent, not that the item is correct. <b>0 of " + SYNTHGEN_CAND +
            "</b> items are verified; the stage runs green and means nothing.",
        });
        push(4, "bad", {
          items: SYNTHGEN_CAND, distinct: SYNTHGEN_DISTINCT_FWD, verifiable: 0, reviewed: 0, forms: 1,
          seeds: 1, buckets: null, provenance: "synthetic",
          calc: SYNTHGEN_CAND + " of " + SYNTHGEN_CAND + " items well-formed = 1 of " +
            SYNTHGEN_FORMS.length + " surface forms",
          caption: "<b>No surface noise.</b> Every one of the " + SYNTHGEN_CAND + " questions is " +
            "grammatical, complete and politely phrased. Surface-form coverage: <b>1 of " +
            SYNTHGEN_FORMS.length + "</b>. Your users produce the other five.",
        });
        push(5, "bad", {
          items: SYNTHGEN_CAND, distinct: SYNTHGEN_DISTINCT_FWD, verifiable: 0, reviewed: 0, forms: 1,
          seeds: 1, buckets: null, provenance: "synthetic",
          calc: "0 of " + SYNTHGEN_CAND + " items read by a human",
          caption: "<b>Review skipped.</b> Nobody has read a single item. The hour that would have " +
            "exposed all of the above was the cheapest hour available and it is the one that got cut.",
        });
        push(6, "bad", {
          items: SYNTHGEN_CAND, distinct: SYNTHGEN_DISTINCT_FWD, verifiable: 0, reviewed: 0, forms: 1,
          seeds: 1, buckets: null, provenance: "untagged",
          calc: SYNTHGEN_CAND + " items shipped, untagged",
          caption: "<b>Ship.</b> <b>" + SYNTHGEN_CAND + " items</b> — twice the other tab’s " +
            SYNTHGEN_KEPT_BACK + ". It looks like the better set. There is no unanswerable bucket, " +
            "because no bucket was ever named, so the set rewards answering everything.",
        });
        push(7, "bad", {
          items: SYNTHGEN_CAND, distinct: SYNTHGEN_DISTINCT_FWD, verifiable: 0, reviewed: 0, forms: 1,
          seeds: 1, buckets: null, provenance: "untagged",
          calc: SYNTHGEN_DISTINCT_FWD + " distinct / " + SYNTHGEN_CAND + " items = " +
            synthgen_pct(SYNTHGEN_DISTINCT_FWD, SYNTHGEN_CAND).toFixed(1) + "% coverage",
          caption: "<b>" + SYNTHGEN_CAND + " items measuring " + SYNTHGEN_DISTINCT_FWD +
            " questions — " + synthgen_pct(SYNTHGEN_DISTINCT_FWD, SYNTHGEN_CAND).toFixed(1) +
            "% coverage, none verified, all well-formed.</b> The bigger set measures ten times less " +
            "than the smaller one. Item count is not coverage, and a score computed over this is a " +
            "score over " + SYNTHGEN_DISTINCT_FWD + " questions reported to three decimal places.",
        });
      });
  }

  // --- scenario 3: the good pipeline with the two steps that get cut ----
  function synthgen_clean() {
    return synthgen_scenario("clean", "Clean, unreviewed",
      "Backwards generation done properly — then the two stages that always get cut for time. " +
      "Watch what stays green.",
      function (push) {
        push(0, "ok", {
          items: 0, distinct: null, verifiable: 0, reviewed: 0, forms: 0,
          seeds: SYNTHGEN_SEEDS, buckets: null, provenance: "—",
          calc: SYNTHGEN_CHUNKS + " × " + SYNTHGEN_CATS.length + " = " + SYNTHGEN_SEEDS + " seeds",
          caption: "Taxonomy enumerated by hand, six buckets, <b>" + SYNTHGEN_SEEDS +
            "</b> seeds. Identical to the first tab — this run does the hard part right.",
        });
        push(1, "ok", {
          items: SYNTHGEN_CAND, distinct: null, verifiable: SYNTHGEN_CAND, reviewed: 0, forms: 0,
          seeds: SYNTHGEN_SEEDS, buckets: null, provenance: "synthetic",
          calc: SYNTHGEN_SEEDS + " × " + SYNTHGEN_PER_CHUNK + " = " + SYNTHGEN_CAND + " candidates",
          caption: "Backwards generation: <b>" + SYNTHGEN_CAND + "</b> candidates, every reference " +
            "known before its question. Still identical.",
        });
        push(2, "ok", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: 0, forms: 0, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic",
          calc: SYNTHGEN_SURFACE_BACK.toFixed(3) + "% collision surface → floor of " +
            SYNTHGEN_KEPT_BACK + " distinct",
          caption: "Dedupe at " + SYNTHGEN_THRESH + " over a " + SYNTHGEN_SURFACE_BACK.toFixed(3) +
            "% collision surface. <b>" + SYNTHGEN_KEPT_BACK + "</b> distinct items, guaranteed.",
        });
        push(3, "ok", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: 0, forms: 0, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic",
          calc: SYNTHGEN_KEPT_BACK + " of " + SYNTHGEN_KEPT_BACK + " verified by construction",
          caption: "Verified: <b>" + SYNTHGEN_KEPT_BACK + " of " + SYNTHGEN_KEPT_BACK +
            "</b>, including " + SYNTHGEN_PER_BUCKET + " unanswerable items with no reference at " +
            "all. Every automatic check this pipeline can run has now passed.",
        });
        push(4, "bad", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: 0, forms: 1, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic",
          calc: SYNTHGEN_KEPT_BACK + " of " + SYNTHGEN_KEPT_BACK + " well-formed = 1 of " +
            SYNTHGEN_FORMS.length + " surface forms",
          caption: "<b>Surface noise cut.</b> The items ship as the model wrote them: " +
            SYNTHGEN_KEPT_BACK + " grammatical, complete, well-spelled questions. Coverage of " +
            "surface form drops from <b>" + SYNTHGEN_FORMS.length + " of " + SYNTHGEN_FORMS.length +
            "</b> to <b>1 of " + SYNTHGEN_FORMS.length + "</b> — and no metric in this pipeline " +
            "can see that, because well-formed questions verify perfectly.",
        });
        push(5, "bad", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: 0, forms: 1, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic",
          calc: "0 of " + SYNTHGEN_KEPT_BACK + " read by a human",
          caption: "<b>Review cut.</b> An hour saved. The sample of " + SYNTHGEN_SAMPLE +
            " is the only stage in this pipeline that could have noticed that every question reads " +
            "like a textbook, and it did not run.",
        });
        push(6, "warn", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: 0, forms: 1, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic × " + SYNTHGEN_KEPT_BACK + " · logged × 0",
          calc: SYNTHGEN_KEPT_BACK + " items · " + SYNTHGEN_KEPT_BACK + " distinct · " +
            SYNTHGEN_KEPT_BACK + " verified",
          caption: "<b>Ship v0.</b> On paper this is the best set on the page: " +
            SYNTHGEN_KEPT_BACK + " items, " + SYNTHGEN_KEPT_BACK + " distinct questions, " +
            SYNTHGEN_KEPT_BACK + " verified references, six balanced buckets. Every number the " +
            "pipeline computes is perfect.",
        });
        push(7, "bad", {
          items: SYNTHGEN_KEPT_BACK, distinct: SYNTHGEN_KEPT_BACK, verifiable: SYNTHGEN_KEPT_BACK,
          reviewed: 0, forms: 1, seeds: SYNTHGEN_SEEDS,
          buckets: SYNTHGEN_PER_BUCKET, provenance: "synthetic × " + SYNTHGEN_KEPT_BACK + " · logged × 0",
          calc: "coverage 100% of questions · 1 of " + SYNTHGEN_FORMS.length + " surface forms · 0 reviewed",
          caption: "<b>And it scores 0.95 and ships broken.</b> Distinct: perfect. Verified: perfect. " +
            "Surface form: <b>1 of " + SYNTHGEN_FORMS.length + "</b>. The set is the centre of the " +
            "distribution rendered immaculately, and the failures live in the tail it never sampled. " +
            "The two stages that cost an hour are the two that connect a synthetic set to reality — " +
            "which is why the only real fix is node K: replace it with logged queries as they arrive.",
        });
      });
  }

  S["synthgen"] = {
    title: "Run the synthetic eval-set pipeline three ways",
    note: "One corpus, three runs. Config: <b>" + SYNTHGEN_CHUNKS + " chunks</b>, the page’s " +
      "<b>" + SYNTHGEN_CATS.length + " categories</b>, <b>per_chunk = " + SYNTHGEN_PER_CHUNK +
      "</b> — so " + SYNTHGEN_CHUNKS + " × " + SYNTHGEN_CATS.length + " = " + SYNTHGEN_SEEDS +
      " seeds and " + SYNTHGEN_SEEDS + " × " + SYNTHGEN_PER_CHUNK + " = <b>" + SYNTHGEN_CAND +
      " candidates</b>, dedupe above " + SYNTHGEN_THRESH + ", a human sample of " + SYNTHGEN_SAMPLE +
      ". Two derived quantities carry the argument: the <b>collision surface</b> — the share of " +
      "the " + SYNTHGEN_ALLPAIRS + " item pairs that share a generation seed, since only those can be " +
      "near-duplicates — and the page’s own measured collapse rate of <b>" +
      SYNTHGEN_COLLAPSE_N + " distinct questions per " + SYNTHGEN_COLLAPSE_D + " items</b> for an " +
      "unseeded run. Watch the item count and the coverage move in opposite directions.",
    interval: 1400,
    scenarios: [synthgen_back(), synthgen_fwd(), synthgen_clean()],

    draw: function (step, d, ctx) {
      var i;

      // the pipeline lane — the time axis, one cell per stage
      var lane = [];
      for (i = 0; i < SYNTHGEN_STAGES.length; i++) {
        var v = step.marks[i];
        lane.push({
          label: SYNTHGEN_STAGES[i],
          flag: v ? v : "idle",
          title: SYNTHGEN_STAGE_LONG[i] + (v ? "" : " — not reached"),
        });
      }

      // bucket composition: six named buckets, or one undifferentiated pile
      var cells = [];
      if (step.buckets) {
        for (i = 0; i < SYNTHGEN_CATS.length; i++) {
          cells.push({
            label: SYNTHGEN_CATS[i] + " " + step.buckets,
            flag: SYNTHGEN_CATS[i] === "unanswerable" ? "warn" : "ok",
            title: step.buckets + " items in the " + SYNTHGEN_CATS[i] + " bucket",
          });
        }
      } else if (step.items) {
        cells.push({
          label: "unlabelled × " + d.fmt(step.items),
          flag: "bad",
          title: "no taxonomy was enumerated, so the items carry no bucket",
        });
      } else {
        cells.push({ label: "—", flag: "idle", title: "nothing generated yet" });
      }

      var covPct = step.distinct === null ? 0 : synthgen_pct(step.distinct, step.items);
      var verPct = synthgen_pct(step.verifiable, step.items);
      var formPct = synthgen_pct(step.forms, SYNTHGEN_FORMS.length);

      var nodeFlag = step.stage < 0 ? "idle" : step.flag;

      return d.stack([
        d.lane({ label: "pipeline", cells: lane }),
        d.flow([
          d.stack([
            d.big(step.items ? d.fmt(step.items) : "—", "items in hand", step.flag === "bad" ? "warn" : undefined),
            d.dots({
              n: step.seeds ? Math.max(1, Math.min(60, Math.round(step.seeds / 10))) : 0,
              label: step.seeds ? d.fmt(step.seeds) + " seeds" : "no seeds yet",
              flag: step.seeds === 1 ? "bad" : step.seeds ? "ok" : undefined,
            }),
          ]),
          d.node({
            title: "Eval set v0",
            status: step.stage < 0 ? "EMPTY" : SYNTHGEN_STATUS[step.stage],
            statusFlag: nodeFlag,
            badge: "provenance: " + step.provenance,
            meta: SYNTHGEN_CHUNKS + " chunks · " + SYNTHGEN_CATS.length + " categories · per_chunk " + SYNTHGEN_PER_CHUNK,
            flag: nodeFlag,
            gauges: [
              {
                label: "distinct questions",
                pct: covPct,
                value: step.distinct === null ? "not measured" : d.fmt(step.distinct) + " (" + covPct.toFixed(1) + "%)",
                flag: step.distinct === null ? "idle" : covPct >= 50 ? "ok" : "bad",
              },
              {
                label: "verified by construction",
                pct: verPct,
                value: d.fmt(step.verifiable) + " (" + verPct.toFixed(0) + "%)",
                flag: step.items === 0 ? "idle" : verPct >= 100 ? "ok" : "bad",
              },
              {
                label: "surface forms covered",
                pct: formPct,
                value: step.forms + " of " + SYNTHGEN_FORMS.length,
                flag: step.forms === 0 ? "idle" : step.forms === SYNTHGEN_FORMS.length ? "ok" : "bad",
              },
            ],
            body: d.cells(cells, { label: "buckets", dense: false }),
            rows: [
              { label: "generation seeds", value: d.fmt(step.seeds), flag: step.seeds === 1 ? "bad" : undefined },
              {
                label: "human-reviewed",
                value: d.fmt(step.reviewed) + " of " + d.fmt(step.items),
                flag: step.reviewed ? "ok" : step.stage >= 5 ? "bad" : undefined,
              },
            ],
          }),
          d.stack([
            d.stat({
              label: "coverage",
              value: step.distinct === null ? "—" : covPct.toFixed(1) + "%",
              sub: "distinct / items",
              flag: step.distinct === null ? undefined : covPct >= 50 ? "ok" : "bad",
            }),
            d.stat({
              label: "reviewed",
              value: d.fmt(step.reviewed),
              sub: "of " + SYNTHGEN_SAMPLE + " sampled",
              flag: step.stage >= 5 ? (step.reviewed ? "ok" : "bad") : undefined,
            }),
          ]),
        ]),
        d.mono(step.calc, step.flag),
      ]);
    },
  };

  // ====================================================================
  // ======================================================================
  // SIM · termtour  (glossary.md)
  // One request crossing the stack, and the glossary section that governs
  // each stage of it. The page's own opening claim is the mechanism:
  //   "Terms are grouped by where they belong rather than alphabetically,
  //    because that is how they are used."
  // So the time axis is a real request — tokenize, retrieve, prefill,
  // decode, call a tool, serve, evaluate, bill — and the glossary's eight
  // tables are exactly what it touches, one per stage, in that order.
  //
  // CONFIG — every figure below is computed from these, never typed in:
  //   census        the page's own eight tables, 104 entries, counted here
  //   vocabulary    32k - 200k (page)          -> spread 200000/32000
  //   hybrid lists  BM25 ranks D1=1, D2=40, D3=5 | dense D1=30, D2=2, D3=6
  //                 fused with the page's RRF, 1/(k+rank) summed, k=60
  //   attention     quadratic in context, MLP linear (page), 4096 -> 8192
  //   speculative   2-3x faster, output mathematically identical (page)
  //   tools         4 registered, 1 needed by this request
  //   prefix cache  1,800-token system prompt x 1,000 requests/day
  //   golden set    n=50, p=0.80, z=1.96 -> Wilson half-width in points
  //   batch API     roughly half price (page); nightly eval, 30 nights
  // ======================================================================

  // --- the page's eight tables, transcribed. Counts are never typed: every
  // --- census figure below is an array length or a sum of array lengths.
  var termtour_ARCH = ["Transformer", "Self-attention", "Query / Key / Value",
    "Multi-head attention", "KV cache", "GQA", "MQA", "FlashAttention", "RoPE",
    "ALiBi", "MoE", "Decoder-only", "Encoder-only", "Logits", "Prefill", "Decode"];
  var termtour_TOKN = ["Token", "BPE", "Vocabulary", "Special tokens",
    "Glitch token", "Context window"];
  var termtour_DEC = ["Temperature", "Top-k", "Top-p / nucleus", "Greedy decoding",
    "Beam search", "Frequency / presence penalty", "Speculative decoding",
    "Constrained decoding", "Logprobs"];
  var termtour_RAG = ["RAG", "Chunk", "Overlap", "Small-to-big", "Embedding",
    "Bi-encoder", "Cross-encoder", "Late interaction / ColBERT", "ANN", "HNSW",
    "IVF / PQ", "Hybrid retrieval", "BM25", "RRF", "Reranking", "HyDE",
    "Query transformation", "Corrective RAG", "Self-RAG", "Retrieval ceiling"];
  var termtour_EVAL = ["Golden set", "Baseline", "Gate", "hit@k", "recall@k",
    "MRR", "nDCG", "Groundedness", "LLM-as-judge", "Cohen's kappa", "Position bias",
    "Verbosity bias", "Wilson interval", "McNemar / paired comparison", "Drift",
    "Covariate drift", "Concept drift", "PSI", "Disaggregation"];
  var termtour_OPT = ["Quantization", "PTQ / QAT", "GPTQ / AWQ", "Outlier features",
    "Distillation", "Pruning", "Structured / 2:4 sparsity", "Continuous batching",
    "PagedAttention", "TTFT", "TPOT", "Prefix caching", "Load shedding", "Backpressure"];
  var termtour_AGENT = ["Agent", "ReAct", "Tool / function calling", "Trajectory",
    "MCP", "LoRA", "QLoRA", "Catastrophic forgetting", "RLHF / DPO",
    "Prompt injection", "Indirect injection", "Dual-LLM pattern", "Least privilege",
    "Denial of wallet"];
  var termtour_BIZ = ["Contribution margin", "Build vs buy", "Moat", "Batch API",
    "Shadow mode", "Canary"];

  function termtour_set(arr) {
    var m = {}, i;
    for (i = 0; i < arr.length; i++) m[arr[i]] = true;
    return m;
  }

  // --- the page's RRF, run for real: 1/(k + rank), summed across systems ---
  var termtour_K = 60;
  var termtour_DOCS = ["D1", "D2", "D3"];
  var termtour_BM25 = { D1: 1, D2: 40, D3: 5 };
  var termtour_DENSE = { D1: 30, D2: 2, D3: 6 };

  function termtour_rrf() {
    var out = [], i, name;
    for (i = 0; i < termtour_DOCS.length; i++) {
      name = termtour_DOCS[i];
      out.push({
        doc: name,
        score: 1 / (termtour_K + termtour_BM25[name]) + 1 / (termtour_K + termtour_DENSE[name]),
      });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  // the naive fusion a one-line definition permits: trust the best single rank
  function termtour_bestSingle() {
    var best = null, i, r;
    for (i = 0; i < termtour_DOCS.length; i++) {
      r = Math.min(termtour_BM25[termtour_DOCS[i]], termtour_DENSE[termtour_DOCS[i]]);
      if (!best || r < best.rank) best = { doc: termtour_DOCS[i], rank: r };
    }
    return best;
  }

  // --- Wilson score interval, half-width in percentage points -------------
  function termtour_wilson(p, n, z) {
    var z2 = z * z;
    var denom = 1 + z2 / n;
    return ((z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) * 100;
  }

  var termtour_FUSED = termtour_rrf();
  var termtour_SINGLE = termtour_bestSingle();
  var termtour_SPREAD = 200000 / 32000;                       // 6.25x
  var termtour_CTX1 = 4096, termtour_CTX2 = 8192;
  var termtour_ATTN = Math.pow(termtour_CTX2 / termtour_CTX1, 2);   // 4x
  var termtour_MLP = termtour_CTX2 / termtour_CTX1;                 // 2x
  var termtour_SPEC_LO = 2, termtour_SPEC_HI = 3;                   // page: 2-3x
  var termtour_TOOLS = 4, termtour_TOOLS_USED = 1;
  var termtour_SYSTOK = 1800, termtour_RPD = 1000;
  var termtour_PREFIX = termtour_SYSTOK * termtour_RPD;             // 1,800,000
  var termtour_N = 50, termtour_P = 0.80, termtour_Z = 1.96;
  var termtour_HALF = termtour_wilson(termtour_P, termtour_N, termtour_Z);
  var termtour_MOVE = 4;                                            // page: "a 4-point move"
  var termtour_NIGHTS = 30;
  var termtour_CALLS = termtour_N * termtour_NIGHTS;                // 1,500
  var termtour_BATCH = 0.5;                                         // page: roughly half price

  // --- the eight stages, in the order a request actually touches them -----
  var termtour_STAGES = [
    {
      stage: "Tokenize", section: "Tokenization", terms: termtour_TOKN,
      pivot: "Vocabulary",
      defn: "the fixed set of tokens, typically 32k-200k",
      matters: "coupled to the model; counting with the wrong tokenizer gives wrong estimates",
      fig: { label: "vocab spread", value: termtour_SPREAD.toFixed(2) + "×", sub: "200k ÷ 32k" },
      useSay: "The prompt is counted with <b>this model's</b> tokenizer before a single budget is " +
        "set. The page's own range says why: vocabularies run 32k–200k, a spread of <b>" +
        termtour_SPREAD.toFixed(2) + "×</b>, so a count taken from the wrong one is not a " +
        "rounding error.",
      defnSay: "You can define <i>Vocabulary</i> — “the fixed set of tokens, typically " +
        "32k–200k” — and that sentence does not tell you it is coupled to the model. " +
        "The count is taken with whatever tokenizer was already installed, and across a " +
        termtour_SPREAD.toFixed(2) + "× spread the budget is wrong from token zero.",
    },
    {
      stage: "Retrieve", section: "Retrieval & RAG", terms: termtour_RAG,
      pivot: "RRF",
      defn: "reciprocal rank fusion, 1/(k+rank) summed",
      matters: "fuses by rank because scores from different systems are not comparable",
      fig: { label: "fused winner", value: termtour_FUSED[0].doc, sub: termtour_FUSED[0].score.toFixed(4) + " at k=" + termtour_K },
      useSay: "BM25 and the dense retriever disagree: D1 is BM25 rank " + termtour_BM25.D1 +
        " and dense rank " + termtour_DENSE.D1 + "; D3 is " + termtour_BM25.D3 + " and " +
        termtour_DENSE.D3 + ". Fused at k=" + termtour_K + ", D3 scores 1/" +
        (termtour_K + termtour_BM25.D3) + " + 1/" + (termtour_K + termtour_DENSE.D3) + " = <b>" +
        termtour_FUSED[0].score.toFixed(4) + "</b> against D1's " +
        termtour_FUSED[termtour_FUSED.length - 1].score.toFixed(4) +
        ". The document both systems liked moderately outranks the one a single system loved.",
      defnSay: "RRF's definition <i>is</i> its formula, which reads like an implementation detail. " +
        "Without the second line you take the best single rank instead — that puts <b>" +
        termtour_SINGLE.doc + "</b> first on the strength of one rank-" + termtour_SINGLE.rank +
        " vote, while the other system had it at rank " + termtour_DENSE.D1 + ".",
    },
    {
      stage: "Prefill", section: "Architecture & model internals", terms: termtour_ARCH,
      pivot: "Transformer",
      defn: "neural architecture built on self-attention",
      matters: "two costs in different places: attention is quadratic in context, the MLP holds most of the weights",
      fig: { label: "attention cost", value: termtour_ATTN + "×", sub: "at " + termtour_MLP + "× context" },
      useSay: "Prefill is where attention's shape shows up on the clock. Raising context " +
        termtour_CTX1 + " → " + termtour_CTX2 + " is " + termtour_MLP +
        "× the tokens, so the MLP does " + termtour_MLP + "× the work — but attention " +
        "is quadratic, (" + termtour_CTX2 + "/" + termtour_CTX1 + ")² = <b>" + termtour_ATTN +
        "×</b>. Time-to-first-token is planned against the " + termtour_ATTN + ", not the " +
        termtour_MLP + ".",
      defnSay: "“Neural architecture built on self-attention” is true and completely inert. " +
        "It does not say the two costs sit in different places, so the context limit is doubled as " +
        "a config change and prefill comes back " + termtour_ATTN + "× slower instead of " +
        termtour_MLP + "×.",
    },
    {
      stage: "Decode", section: "Decoding", terms: termtour_DEC,
      pivot: "Speculative decoding",
      defn: "draft model proposes, large model verifies",
      matters: "2-3x faster with mathematically identical output, so no re-evaluation needed",
      fig: {
        label: "decode time", sub: "1/" + termtour_SPEC_LO + " … 1/" + termtour_SPEC_HI + " of TPOT",
        value: (100 / termtour_SPEC_LO).toFixed(0) + "–" + (100 / termtour_SPEC_HI).toFixed(1) + "%",
      },
      useSay: "Speculative decoding goes on. The page's " + termtour_SPEC_LO + "–" +
        termtour_SPEC_HI + "× puts per-token decode time at 100/" + termtour_SPEC_LO + " = " +
        (100 / termtour_SPEC_LO).toFixed(0) + "% down to 100/" + termtour_SPEC_HI + " = " +
        (100 / termtour_SPEC_HI).toFixed(1) + "% of baseline — and because the output is " +
        "<b>mathematically identical</b>, no quality re-run is scheduled. That clause is worth weeks.",
      defnSay: "“Draft model proposes, large model verifies” sounds like an approximation, " +
        "so a full quality re-evaluation is booked before rollout. The second line says the output " +
        "is mathematically identical: the re-evaluation was never needed, and the " +
        (100 / termtour_SPEC_HI).toFixed(1) + "% decode time waited for it.",
    },
    {
      stage: "Call a tool", section: "Agents, adaptation & safety", terms: termtour_AGENT,
      pivot: "Least privilege",
      defn: "tools can do only what is needed",
      matters: "bounds the blast radius when injection succeeds — and assume it will",
      fig: {
        label: "tool surface", sub: termtour_TOOLS_USED + " of " + termtour_TOOLS + " tools",
        value: ((termtour_TOOLS_USED / termtour_TOOLS) * 100).toFixed(0) + "%",
      },
      useSay: "This request needs " + termtour_TOOLS_USED + " of the " + termtour_TOOLS +
        " registered tools, so the credential it runs under exposes " + termtour_TOOLS_USED + "/" +
        termtour_TOOLS + " = <b>" + ((termtour_TOOLS_USED / termtour_TOOLS) * 100).toFixed(0) +
        "%</b> of the tool surface. Injection is assumed to succeed; this fraction is what decides " +
        "what happens when it does.",
      defnSay: "“Tools can do only what is needed” reads as hygiene, so it goes on the " +
        "backlog and the agent keeps all " + termtour_TOOLS + " credentials — tool surface " +
        "100%. The second line is the one that changes the schedule: it bounds the blast radius " +
        "when injection succeeds, and you are to assume it will.",
    },
    {
      stage: "Serve", section: "Optimization & serving", terms: termtour_OPT,
      pivot: "Prefix caching",
      defn: "reusing computation for a shared prompt prefix",
      matters: "often the largest single cost lever on a stable system prompt",
      fig: {
        label: "prefill saved", sub: termtour_SYSTOK + " tok × " + termtour_RPD + " req",
        value: (termtour_PREFIX / 1e6).toFixed(1) + "M",
      },
      useSay: "The " + termtour_SYSTOK + "-token system prompt is byte-identical on every request, " +
        "so prefix caching stops re-prefilling it: " + termtour_SYSTOK + " × " + termtour_RPD +
        " = <b>" + d_fmt_termtour(termtour_PREFIX) + "</b> prefill tokens a day that are never " +
        "computed a second time.",
      defnSay: "“Reusing computation for a shared prompt prefix” sounds like a tidy-up, so " +
        "it queues behind a model swap. The second line calls it the largest single cost lever on a " +
        "stable system prompt — " + (termtour_PREFIX / 1e6).toFixed(1) +
        "M tokens of prefill a day, still being paid for.",
    },
    {
      stage: "Evaluate", section: "Evaluation", terms: termtour_EVAL,
      pivot: "Wilson interval",
      defn: "confidence interval for a proportion",
      matters: "at n=50, ±8-11 points — which is why a 4-point move is not evidence",
      fig: {
        label: "wilson half-width", sub: "n=" + termtour_N + ", p=" + termtour_P.toFixed(2) + ", z=" + termtour_Z,
        value: "±" + termtour_HALF.toFixed(1) + " pts",
      },
      useSay: "The nightly run comes back " + termtour_MOVE + " points up. Computing Wilson at p=" +
        termtour_P.toFixed(2) + ", n=" + termtour_N + ", z=" + termtour_Z + " gives <b>±" +
        termtour_HALF.toFixed(1) + " points</b> — inside the page's stated ±8–11 — " +
        "so a " + termtour_MOVE + "-point move is reported as no evidence of change. The interval " +
        "was the finding, not the delta.",
      defnSay: "“Confidence interval for a proportion” is a correct definition that lets a " +
        termtour_MOVE + "-point gain be announced in standup. Actually computing it — ±" +
        termtour_HALF.toFixed(1) + " points at n=" + termtour_N + " — says " + termtour_MOVE +
        " points is indistinguishable from noise.",
    },
    {
      stage: "Bill", section: "Business", terms: termtour_BIZ,
      pivot: "Batch API",
      defn: "asynchronous processing at reduced price",
      matters: "roughly half price where latency permits",
      fig: {
        label: "eval priced like", sub: d_fmt_termtour(termtour_CALLS) + " calls/month",
        value: d_fmt_termtour(termtour_CALLS * termtour_BATCH),
      },
      useSay: "The nightly eval is " + termtour_N + " items × " + termtour_NIGHTS +
        " nights = " + d_fmt_termtour(termtour_CALLS) + " judge calls a month. Nothing about a " +
        "nightly job needs low latency, so it moves to the Batch API at roughly half price and is " +
        "billed like <b>" + d_fmt_termtour(termtour_CALLS * termtour_BATCH) + "</b>.",
      defnSay: "“Asynchronous processing at reduced price” never says how much, so the eval " +
        "stays on the synchronous API and " + d_fmt_termtour(termtour_CALLS) + " calls a month are " +
        "paid at full rate instead of " + d_fmt_termtour(termtour_CALLS * termtour_BATCH) + ".",
    },
  ];

  // local number formatter (the d helper is only available inside draw)
  function d_fmt_termtour(n) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  // --- census, computed from the arrays above -----------------------------
  var termtour_ALPHA = (function () {
    var all = [], i, j;
    for (i = 0; i < termtour_STAGES.length; i++) {
      for (j = 0; j < termtour_STAGES[i].terms.length; j++) all.push(termtour_STAGES[i].terms[j]);
    }
    return all.sort(function (a, b) {
      var x = a.toLowerCase(), y = b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
  })();
  var termtour_TOTAL = termtour_ALPHA.length;                       // 104
  var termtour_SLICE = Math.ceil(termtour_TOTAL / termtour_STAGES.length);  // 13

  function termtour_idle(mode, caption) {
    return {
      mode: mode, caption: caption, held: [], stageNo: 0,
      cum: 0, matched: 0, section: "", stage: "", flag: "idle",
    };
  }

  // --- scenario 1: the glossary's own grouping, used as the request path ---
  function termtour_useRun() {
    var steps = [termtour_idle("use",
      "One request, eight stages, and the glossary's eight tables laid against them. " +
      "Press Play: at each stage the section that governs it is the section you are holding.")];
    var cum = 0;
    for (var i = 0; i < termtour_STAGES.length; i++) {
      var st = termtour_STAGES[i];
      cum += st.terms.length;
      steps.push({
        mode: "use", stageNo: i + 1, stage: st.stage, section: st.section,
        held: st.terms, pivot: st.pivot, matched: st.terms.length, cum: cum,
        fig: st.fig, flag: "ok",
        derive: "<b>" + st.pivot + "</b> — " + st.defn + ". <i>What matters:</i> " + st.matters + ".",
        caption: "<b>Stage " + (i + 1) + " · " + st.stage + ".</b> The request enters <b>" +
          st.section + "</b>: " + st.terms.length + " terms, every one of them live right now. " +
          st.useSay + " Terms in hand when needed: <b>" + cum + " / " + termtour_TOTAL + "</b>.",
      });
    }
    steps[steps.length - 1].caption =
      "<b>Eight stages, eight sections, " + termtour_TOTAL + " of " + termtour_TOTAL +
      " terms in hand at the moment each was needed.</b> That is the whole reason the page is " +
      "grouped by where terms belong rather than alphabetically: the grouping <i>is</i> the request " +
      "path. A section is a stage, and every term in it is a decision waiting at that stage.";
    return { id: "use", label: "Grouped by use", steps: steps };
  }

  // --- scenario 2: definitions only — column two without column three -----
  function termtour_defnRun() {
    var steps = [termtour_idle("defn",
      "Same request, same eight sections in hand — but only the middle column. You can define " +
      "every term correctly. Watch what the definitions decide.")];
    var cum = 0;
    for (var i = 0; i < termtour_STAGES.length; i++) {
      var st = termtour_STAGES[i];
      cum += st.terms.length;
      steps.push({
        mode: "defn", stageNo: i + 1, stage: st.stage, section: st.section,
        held: st.terms, pivot: st.pivot, matched: st.terms.length, cum: cum,
        settled: 0, fig: st.fig, flag: i >= 4 ? "bad" : "warn",
        derive: "<b>" + st.pivot + "</b> — definition held, consequence missing. The second " +
          "column would have said: <i>" + st.matters + "</i>.",
        caption: "<b>Stage " + (i + 1) + " · " + st.stage + ".</b> All " + st.terms.length +
          " <b>" + st.section + "</b> terms are in hand and every definition is right. " + st.defnSay +
          " Decisions settled by a definition: <b>0 of " + (i + 1) + "</b>.",
      });
    }
    steps[steps.length - 1].caption =
      "<b>" + termtour_TOTAL + " terms held, every definition correct, 0 of " +
      termtour_STAGES.length + " decisions settled.</b> The first line tells you what a term is; " +
      "the second tells you what it does to you — the trap, the consequence, the reason it " +
      "exists. That second column is the page. A term you can define but not act on is a term you " +
      "cannot yet explain to a sceptical interviewer.";
    return { id: "defn", label: "Definitions only", steps: steps };
  }

  // --- scenario 3: read A-Z instead — the terms are there, just not here ---
  function termtour_alphaRun() {
    var steps = [termtour_idle("alpha",
      "Same request. This time the glossary is read alphabetically: by stage k you are " +
      termtour_SLICE + "·k terms into the A–Z list. Whether the term you need is in " +
      "your hands is now down to its first letter.")];
    var cum = 0;
    for (var i = 0; i < termtour_STAGES.length; i++) {
      var st = termtour_STAGES[i];
      var start = i * termtour_SLICE;
      var held = termtour_ALPHA.slice(start, Math.min(start + termtour_SLICE, termtour_TOTAL));
      var need = termtour_set(st.terms);
      var hit = 0, j;
      for (j = 0; j < held.length; j++) if (need[held[j]]) hit++;
      cum += hit;
      var pivotHeld = need[st.pivot] && termtour_ALPHA.indexOf(st.pivot) >= start &&
        termtour_ALPHA.indexOf(st.pivot) < start + termtour_SLICE;
      steps.push({
        mode: "alpha", stageNo: i + 1, stage: st.stage, section: st.section,
        held: held, needSet: need, pivot: st.pivot, matched: hit, cum: cum,
        fig: st.fig, flag: hit === 0 ? "bad" : "warn",
        derive: "Holding A–Z terms " + (start + 1) + "–" +
          Math.min(start + termtour_SLICE, termtour_TOTAL) + ": <i>" + held[0] + " … " +
          held[held.length - 1] + "</i>. This stage needed <b>" + st.section + "</b> (" +
          st.terms.length + " terms); " + hit + " of them are in the slice.",
        caption: "<b>Stage " + (i + 1) + " · " + st.stage + ".</b> You are holding terms " +
          (start + 1) + "–" + Math.min(start + termtour_SLICE, termtour_TOTAL) + " of the " +
          "alphabet (<i>" + held[0] + "</i> … <i>" + held[held.length - 1] + "</i>). The stage " +
          "needs the " + st.terms.length + " <b>" + st.section + "</b> terms; <b>" + hit +
          "</b> of them happen to be in this slice" +
          (pivotHeld ? ", and <i>" + st.pivot + "</i> is one of them."
            : " — <i>" + st.pivot + "</i>, the term that decides this stage, is not.") +
          " Running total in hand when needed: <b>" + cum + " / " + termtour_TOTAL + "</b>.",
      });
    }
    var chance = termtour_TOTAL / termtour_STAGES.length;
    steps[steps.length - 1].caption =
      "<b>" + cum + " of " + termtour_TOTAL + " terms were in hand at the moment they were " +
      "needed — " + ((cum / termtour_TOTAL) * 100).toFixed(0) + "%.</b> Chance alone predicts " +
      chance.toFixed(0) + " (each slice is " + termtour_SLICE + " of " + termtour_TOTAL +
      " terms), and that is exactly the finding: a term's first letter carries no information about " +
      "when you will need it. Same " + termtour_TOTAL + " terms, same request, wrong order.";
    return { id: "alpha", label: "Read A–Z instead", steps: steps };
  }

  S["termtour"] = {
    title: "Walk one request through the glossary",
    note: "The page's eight tables against the eight stages of one request. Config, and every " +
      "number is computed from it: the census is the page's own <b>" + termtour_TOTAL +
      "</b> entries (counted here, not typed); vocabularies 32k–200k; hybrid ranks BM25 " +
      "D1=1, D2=40, D3=5 and dense D1=30, D2=2, D3=6 fused with the page's RRF at k=" + termtour_K +
      "; context " + termtour_CTX1 + "→" + termtour_CTX2 + " against quadratic attention; " +
      "speculative decoding " + termtour_SPEC_LO + "–" + termtour_SPEC_HI + "×; " +
      termtour_TOOLS + " tools registered and " + termtour_TOOLS_USED + " needed; a " +
      termtour_SYSTOK + "-token system prompt over " + d_fmt_termtour(termtour_RPD) +
      " requests/day; a golden set of n=" + termtour_N + " at p=" + termtour_P.toFixed(2) +
      "; " + termtour_NIGHTS + " nightly eval runs at roughly half price on the Batch API.",
    interval: 1500,
    scenarios: [termtour_useRun(), termtour_defnRun(), termtour_alphaRun()],

    draw: function (step, d, ctx) {
      var i, t, f, cells = [];
      for (i = 0; i < step.held.length; i++) {
        t = step.held[i];
        if (step.mode === "alpha") {
          f = step.needSet && step.needSet[t] ? "ok" : "idle";
        } else if (step.mode === "defn") {
          f = t === step.pivot ? "warn" : undefined;
        } else {
          f = t === step.pivot ? "ok" : undefined;
        }
        cells.push({
          label: t,
          flag: f,
          title: step.mode === "alpha"
            ? (step.needSet && step.needSet[t]
              ? t + " — needed at this stage, and in hand"
              : t + " — in hand, belongs to another stage")
            : t === step.pivot
              ? t + " — the term this stage turns on"
              : t + " — live at this stage",
        });
      }
      if (!cells.length) cells.push({ label: "—", flag: "idle", title: "no stage entered yet" });

      var pct = (step.cum / termtour_TOTAL) * 100;
      var nodeFlag = step.stageNo === 0 ? "idle" : step.flag;

      var head = d.flow([
        d.stack([
          d.big(step.stageNo ? step.stageNo + "/" + termtour_STAGES.length : "—", "request stage"),
          d.stat({
            label: "in hand / needed",
            value: step.stageNo ? step.matched + " of " + step.held.length : "—",
            sub: step.mode === "alpha" ? "of the A–Z slice" : "of the section",
            flag: step.mode === "alpha" ? (step.matched ? "warn" : "bad") : "ok",
          }),
        ]),
        d.node({
          title: step.stageNo ? step.stage : "request",
          status: step.stageNo ? (step.mode === "alpha" ? "MISMATCHED"
            : step.mode === "defn" ? "UNDECIDED" : "DECIDED") : "IDLE",
          statusFlag: nodeFlag,
          badge: step.stageNo ? step.section : "not started",
          meta: step.stageNo ? "decided by: " + step.pivot : "press play",
          flag: nodeFlag,
          gauges: [{
            label: "terms in hand when needed",
            pct: pct,
            value: step.cum + " / " + termtour_TOTAL,
            flag: step.mode === "use" ? "ok" : step.mode === "defn" ? "warn" : "bad",
          }],
          rows: [
            { label: "section size", value: step.stageNo ? step.held.length + " terms" : "—" },
            {
              label: step.mode === "defn" ? "decisions settled" : "needed terms held",
              value: step.mode === "defn"
                ? "0 of " + step.stageNo
                : step.stageNo ? step.matched + " of " + (step.mode === "alpha"
                  ? termtour_STAGES[step.stageNo - 1].terms.length : step.held.length) : "—",
              flag: step.mode === "use" ? "ok" : "bad",
            },
          ],
        }),
        step.stageNo ? d.stat({
          label: step.fig.label,
          value: step.fig.value,
          sub: step.fig.sub,
          flag: step.mode === "use" ? "ok" : step.mode === "defn" ? "bad" : "idle",
        }) : d.stat({ label: "figure", value: "—", sub: "nothing computed yet", flag: "idle" }),
      ]);

      var grid = d.cols([
        d.node({
          title: step.stageNo ? step.section : "the glossary",
          badge: step.stageNo
            ? (step.mode === "alpha" ? "A–Z slice " + step.stageNo : "section " + step.stageNo)
            : String(termtour_TOTAL) + " terms",
          meta: step.mode === "alpha"
            ? "green = needed here, faded = belongs to another stage"
            : "green = the term this stage turns on",
          flag: nodeFlag,
          body: d.cells(cells, { label: "terms in hand" }),
        }),
      ]);

      return d.stack([
        head,
        grid,
        d.note(step.derive || "Eight sections, " + termtour_TOTAL +
          " terms, one request. Press Play.",
          step.stageNo ? step.flag : "idle"),
      ]);
    },
  };

  // ====================================================================
  // ======================================================================
  // SIM · tokenwalk  (content/tokenization.md)
  // The §3 pipeline run end to end — normalise → pre-tokenize → BPE merges →
  // integer ids → special tokens → model → return trip — three times, over
  // three inputs that come out the other side in three different states.
  //
  // CONFIG, and where every figure on screen comes from:
  //   · The text, the 7 pieces and the 7 ids of scenario 1 are the page's §1
  //     diagram verbatim:  "The immune system fights viruses."
  //       ["The"," immune"," system"," fights"," virus","es","."]
  //       [791, 30248, 1887, 28533, 16989, 288, 13]
  //   · Scenario 2's split is the page's §1 strawberry split ["str","aw","berry"].
  //   · Scenario 3's token counts are the page's §5 measured run:
  //       English 11 · Hindi 29 · Japanese 18 · Tamil 47
  //   · EVERYTHING ELSE IS COMPUTED HERE, from the strings themselves:
  //     character counts, code points, UTF-8 byte counts (tokenwalk_utf8),
  //     whitespace word counts, chars/token, pieces/word, which pre-token
  //     fragmented into how many pieces (tokenwalk_group), letter counts per
  //     piece, and every ×English ratio (n / 11).
  //   · Two constants are stated configuration, NOT page measurements:
  //       SPECIAL = 2      the page names BOS and EOS; two tokens of chat frame
  //       LIMIT   = 8,000  used only for the effective-window arithmetic
  // ======================================================================
  var tokenwalk_SPECIAL = 2;
  var tokenwalk_LIMIT = 8000;

  // stage rail — the §3 flow, in order
  var tokenwalk_STAGES = ["norm", "split", "merge", "ids", "+spec", "model", "back"];
  var tokenwalk_NAMES = [
    "normalise",
    "pre-tokenize",
    "apply BPE merges",
    "map to integer ids",
    "add special tokens",
    "model",
    "return trip",
  ];

  // --- the page's own data ---------------------------------------------
  var tokenwalk_S1 = "The immune system fights viruses.";
  var tokenwalk_PRE1 = ["The", " immune", " system", " fights", " viruses", "."];
  var tokenwalk_TOK1 = ["The", " immune", " system", " fights", " virus", "es", "."];
  var tokenwalk_ID1 = [791, 30248, 1887, 28533, 16989, 288, 13];

  var tokenwalk_SB = "strawberry";
  var tokenwalk_SBTOK = ["str", "aw", "berry"];

  var tokenwalk_EN = "The immune system defends the body against disease.";
  var tokenwalk_TA = "நோய் எதிர்ப்பு அமைப்பு உடலை நோய்களிலிருந்து பாதுகாக்கிறது.";
  var tokenwalk_N_EN = 11;      // page §5
  var tokenwalk_N_TA = 47;      // page §5
  var tokenwalk_LANGS = [
    { name: "English", n: 11 },
    { name: "Hindi", n: 29 },
    { name: "Japanese", n: 18 },
    { name: "Tamil", n: 47 },
  ];

  // --- computation ------------------------------------------------------
  /** UTF-8 byte length, computed from code units. ASCII 1, most scripts 3. */
  function tokenwalk_utf8(s) {
    var n = 0, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  /** Code points, so surrogate pairs count once. */
  function tokenwalk_cp(s) {
    var n = 0, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      n++;
      if (c >= 0xd800 && c <= 0xdbff) i++;
    }
    return n;
  }
  function tokenwalk_words(s) { return s.replace(/^\s+|\s+$/g, "").split(/\s+/).length; }
  function tokenwalk_count(s, ch) {
    var n = 0, i;
    for (i = 0; i < s.length; i++) if (s.charAt(i) === ch) n++;
    return n;
  }
  /** Walk the token list against the pre-token list: which pre-token split? */
  function tokenwalk_group(pre, toks) {
    var out = [], ti = 0, i, acc, g;
    for (i = 0; i < pre.length; i++) {
      acc = ""; g = [];
      while (ti < toks.length && acc !== pre[i]) { acc += toks[ti]; g.push(toks[ti]); ti++; }
      out.push(g);
    }
    return out;
  }
  /** Make the leading space visible — the page's "hello" vs " hello" point. */
  function tokenwalk_vis(s) { return s.replace(/ /g, "␣"); }

  function tokenwalk_cells(list, flagOf, titleOf) {
    var out = [], i;
    for (i = 0; i < list.length; i++) {
      out.push({
        label: tokenwalk_vis(list[i]),
        flag: flagOf ? flagOf(i, list[i]) : undefined,
        title: titleOf ? titleOf(i, list[i]) : undefined,
      });
    }
    return out;
  }
  function tokenwalk_blanks(n, flag, title) {
    var out = [], i;
    for (i = 0; i < n; i++) out.push({ label: "", flag: flag, title: title + " " + (i + 1) + " of " + n });
    return out;
  }
  function tokenwalk_nums(list, flag) {
    var out = [], i;
    for (i = 0; i < list.length; i++) out.push({ label: String(list[i]), flag: flag, title: "row " + list[i] + " of the embedding table" });
    return out;
  }

  // derived once, used in captions
  var tokenwalk_C1 = tokenwalk_cp(tokenwalk_S1);                       // 33
  var tokenwalk_B1 = tokenwalk_utf8(tokenwalk_S1);                     // 33
  var tokenwalk_W1 = tokenwalk_words(tokenwalk_S1);                    // 5
  var tokenwalk_G1 = tokenwalk_group(tokenwalk_PRE1, tokenwalk_TOK1);
  var tokenwalk_SPLIT1 = (function () {
    var n = 0, i;
    for (i = 0; i < tokenwalk_G1.length; i++) if (tokenwalk_G1[i].length > 1) n++;
    return n;
  })();                                                                 // 1
  var tokenwalk_CEN = tokenwalk_cp(tokenwalk_EN);                      // 51
  var tokenwalk_CTA = tokenwalk_cp(tokenwalk_TA);                      // 58
  var tokenwalk_BEN = tokenwalk_utf8(tokenwalk_EN);                    // 51
  var tokenwalk_BTA = tokenwalk_utf8(tokenwalk_TA);                    // 162
  var tokenwalk_WEN = tokenwalk_words(tokenwalk_EN);                   // 8
  var tokenwalk_WTA = tokenwalk_words(tokenwalk_TA);                   // 6
  var tokenwalk_RATIO = tokenwalk_N_TA / tokenwalk_N_EN;               // 4.27

  function tokenwalk_step(o) { return o; }

  // --- scenario 1: the page's §1 sentence, all the way through ----------
  function tokenwalk_clean() {
    var chpt = (tokenwalk_C1 / tokenwalk_TOK1.length);
    var wpt = (tokenwalk_W1 / tokenwalk_TOK1.length);
    var billed = tokenwalk_TOK1.length + tokenwalk_SPECIAL;
    var S = [];

    S.push(tokenwalk_step({
      stage: 0,
      caption: "A sentence about to be handed to a model. It will never arrive as a sentence — press Play.",
      views: [{ label: "raw text", cells: [{ label: tokenwalk_S1, flag: "idle" }] }],
      stats: [{ label: "characters", value: String(tokenwalk_C1), sub: "nothing tokenized yet", flag: "idle" }],
    }));

    S.push(tokenwalk_step({
      stage: 1, flag: "ok",
      caption: "<b>Normalise.</b> " + tokenwalk_C1 + " characters, " + tokenwalk_C1 +
        " Unicode code points, " + tokenwalk_B1 + " UTF-8 bytes — all three agree, because every " +
        "character here is ASCII. Remember that they agree; it is the reason the bug at the end of " +
        "this pipeline never fires in English.",
      views: [{ label: "normalised", cells: [{ label: tokenwalk_S1, flag: "ok" }] }],
      stats: [
        { label: "characters", value: String(tokenwalk_C1) },
        { label: "UTF-8 bytes", value: String(tokenwalk_B1), sub: (tokenwalk_B1 / tokenwalk_C1).toFixed(1) + " bytes/char" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 2, flag: "ok",
      caption: "<b>Pre-tokenize.</b> Split on whitespace and punctuation: <b>" + tokenwalk_PRE1.length +
        "</b> pieces. Note where the spaces went — the leading space is <i>part of</i> the piece. " +
        "<i>␣immune</i> and <i>immune</i> are different entries in the vocabulary, which is why a " +
        "prompt template that adds or strips one space changes the tokenization.",
      views: [{ label: tokenwalk_PRE1.length + " pre-tokens", cells: tokenwalk_cells(tokenwalk_PRE1, function () { return "ok"; }, function (i, s) { return "pre-token " + (i + 1) + ": " + JSON.stringify(s); }) }],
      stats: [
        { label: "pre-tokens", value: String(tokenwalk_PRE1.length) },
        { label: "whitespace words", value: String(tokenwalk_W1) },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 3, flag: "ok",
      caption: "<b>Apply the learned merges.</b> " + (tokenwalk_PRE1.length - tokenwalk_SPLIT1) + " of the " +
        tokenwalk_PRE1.length + " pre-tokens are single vocabulary entries. " + tokenwalk_SPLIT1 +
        " is not: <i>␣viruses</i> was not frequent enough in the training corpus to earn its own row, " +
        "so it breaks into <i>␣virus</i> + <i>es</i>. <b>" + tokenwalk_PRE1.length + " pre-tokens → " +
        tokenwalk_TOK1.length + " tokens.</b>",
      views: [{
        label: tokenwalk_TOK1.length + " tokens", cells: tokenwalk_cells(tokenwalk_TOK1, function (i) {
          return (i === 4 || i === 5) ? "warn" : "ok";
        }, function (i, s) { return "token " + (i + 1) + ": " + JSON.stringify(s); }),
      }],
      stats: [
        { label: "tokens", value: String(tokenwalk_TOK1.length) },
        { label: "fragmented", value: tokenwalk_SPLIT1 + " of " + tokenwalk_PRE1.length, sub: "pre-tokens that split", flag: "warn" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 4, flag: "ok",
      caption: "<b>Map to integers.</b> This is the step the whole page is about: the text is now gone. " +
        "<b>791</b> means <i>row 791 of the embedding table</i> — it is not a quantity, and it is not " +
        "larger than 790 in any sense the model can use. Everything downstream operates on these " +
        tokenwalk_ID1.length + " numbers and nothing else.",
      views: [{ label: "token ids", cells: tokenwalk_nums(tokenwalk_ID1, "ok") }],
      mono: "[" + tokenwalk_ID1.join(", ") + "]",
      stats: [
        { label: "integers in", value: String(tokenwalk_ID1.length) },
        { label: "characters visible", value: "0", sub: "of " + tokenwalk_C1, flag: "warn" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 5, flag: "ok",
      caption: "<b>Special tokens, then the local guard.</b> BOS and EOS bracket the content: <b>" +
        tokenwalk_TOK1.length + " + " + tokenwalk_SPECIAL + " = " + billed + "</b> ids actually sent. " +
        "Your counter said " + tokenwalk_TOK1.length + "; the bill says " + billed +
        ". Against a " + d_fmtInt(tokenwalk_LIMIT) + "-token limit that leaves " +
        d_fmtInt(tokenwalk_LIMIT - billed) + " free, so the request is cleared here — locally, in " +
        "microseconds, before a penny of prefill is spent.",
      views: [{
        label: billed + " ids sent",
        cells: [{ label: "BOS", flag: "warn", title: "special token" }]
          .concat(tokenwalk_nums(tokenwalk_ID1, "ok"))
          .concat([{ label: "EOS", flag: "warn", title: "special token" }]),
      }],
      stats: [
        { label: "billed ids", value: String(billed), sub: "+" + tokenwalk_SPECIAL + " special" },
        { label: "budget left", value: d_fmtInt(tokenwalk_LIMIT - billed), sub: "of " + d_fmtInt(tokenwalk_LIMIT), flag: "ok" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 6, flag: "ok",
      caption: "<b>The model.</b> " + billed + " integers in. It has no access to the " + tokenwalk_C1 +
        " characters, the " + tokenwalk_W1 + " words, or a single letter. Measured on this sentence the " +
        "rules of thumb hold: <b>" + chpt.toFixed(2) + " chars/token</b> against the page's ≈4, and <b>" +
        wpt.toFixed(2) + " words/token</b> against ≈0.75. Hold on to those two numbers — the next two " +
        "tabs break both of them.",
      views: [{ label: "what the model receives", cells: tokenwalk_nums(tokenwalk_ID1, "ok") }],
      stats: [
        { label: "chars / token", value: chpt.toFixed(2), sub: "rule of thumb ≈4" },
        { label: "words / token", value: wpt.toFixed(2), sub: "rule of thumb ≈0.75" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 7, flag: "ok",
      caption: "<b>The return trip, and it is clean.</b> Concatenating the " + tokenwalk_TOK1.length +
        " pieces reproduces the original " + tokenwalk_C1 + " characters exactly — the translation is " +
        "lossless. And because every token here is made of whole 1-byte characters, decoding one token " +
        "at a time during streaming is safe. <b>That is the takeaway, and it is a trap:</b> this pipeline " +
        "is perfect on English ASCII, so an English test suite certifies a tokenizer layer that has not " +
        "been exercised at all. The other two tabs are the same seven stages on inputs that do exercise it.",
      views: [{ label: "detokenized", cells: [{ label: tokenwalk_TOK1.join(""), flag: "ok" }] }],
      stats: [
        { label: "round trip", value: "lossless", sub: tokenwalk_C1 + " → " + tokenwalk_C1 + " chars", flag: "ok" },
        { label: "stream-safe", value: "yes", sub: "1 byte per character", flag: "ok" },
      ],
    }));
    return { id: "clean", label: "English prose", steps: S };
  }

  // --- scenario 2: the strawberry problem, mechanically ------------------
  function tokenwalk_count_() {
    var total = tokenwalk_count(tokenwalk_SB, "r");
    var per = [], i;
    for (i = 0; i < tokenwalk_SBTOK.length; i++) per.push(tokenwalk_count(tokenwalk_SBTOK[i], "r"));
    var perTxt = [];
    for (i = 0; i < tokenwalk_SBTOK.length; i++) perTxt.push(tokenwalk_SBTOK[i] + "=" + per[i]);
    var pos = [];
    for (i = 0; i < tokenwalk_SB.length; i++) if (tokenwalk_SB.charAt(i) === "r") pos.push(i + 1);
    var billed = tokenwalk_SBTOK.length + tokenwalk_SPECIAL;
    var S = [];

    S.push(tokenwalk_step({
      stage: 0,
      caption: "The famous one. The model is about to be asked how many <b>r</b>s are in <i>strawberry</i>. " +
        "Watch the same seven stages and notice exactly where the answer becomes unavailable.",
      views: [{ label: "raw text", cells: [{ label: tokenwalk_SB, flag: "idle" }] }],
      stats: [{ label: "characters", value: String(tokenwalk_SB.length), flag: "idle" }],
    }));

    S.push(tokenwalk_step({
      stage: 1, flag: "ok",
      caption: "<b>Normalise.</b> " + tokenwalk_SB.length + " characters. The <b>r</b>s are at positions " +
        pos.join(", ") + " — <b>" + total + "</b> of them. At this instant the question is trivially " +
        "answerable: the information is right there in the string.",
      views: [{
        label: "characters", cells: tokenwalk_cells(tokenwalk_SB.split(""), function (i, c) {
          return c === "r" ? "warn" : "ok";
        }, function (i, c) { return "character " + (i + 1) + ": " + c; }),
      }],
      stats: [
        { label: "characters", value: String(tokenwalk_SB.length) },
        { label: "r's present", value: String(total), sub: "at " + pos.join(", "), flag: "ok" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 2, flag: "ok",
      caption: "<b>Pre-tokenize.</b> No whitespace, no punctuation, so there is nothing to split on: one " +
        "pre-token. All " + tokenwalk_SB.length + " characters still intact, all " + total + " <b>r</b>s " +
        "still addressable.",
      views: [{ label: "1 pre-token", cells: [{ label: tokenwalk_SB, flag: "ok" }] }],
      stats: [
        { label: "pre-tokens", value: "1" },
        { label: "r's present", value: String(total), flag: "ok" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 3, flag: "warn",
      caption: "<b>Apply the learned merges — and this is the stage that ends it.</b> <i>strawberry</i> is " +
        "not one vocabulary entry; it becomes <b>" + tokenwalk_SBTOK.length + "</b> pieces: " +
        tokenwalk_SBTOK.join(" · ") + ". The <b>r</b>s survive the split arithmetically (" +
        perTxt.join(", ") + ", total " + total + ") — but they survive inside <i>strings</i>, and the " +
        "strings are what the next stage throws away.",
      views: [{
        label: tokenwalk_SBTOK.length + " tokens", cells: tokenwalk_cells(tokenwalk_SBTOK, function (i) {
          return per[i] ? "warn" : "ok";
        }, function (i, s) { return JSON.stringify(s) + " contains " + per[i] + " r"; }),
      }],
      stats: [
        { label: "tokens", value: String(tokenwalk_SBTOK.length), sub: "from " + tokenwalk_SB.length + " chars" },
        { label: "r's per token", value: per.join(" / "), sub: "sums to " + total, flag: "warn" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 4, flag: "bad",
      caption: "<b>Map to integers, and the letters are gone.</b> Three rows of the embedding table. " +
        "<i>berry</i> is one row — not b, e, r, r, y. There is no operation the model can perform on that " +
        "row that returns a letter, because the row is a learned vector, not a spelling. " +
        "(The handbook prints real ids only for the §1 sentence; inventing three here would teach you " +
        "something false, so the boxes stay blank. The <i>count</i> is the part that matters.)",
      views: [{ label: tokenwalk_SBTOK.length + " ids", cells: tokenwalk_blanks(tokenwalk_SBTOK.length, "bad", "opaque row index") }],
      stats: [
        { label: "integers in", value: String(tokenwalk_SBTOK.length) },
        { label: "letters visible", value: "0", sub: "of " + tokenwalk_SB.length, flag: "bad" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 5, flag: "warn",
      caption: "<b>Special tokens and the guard.</b> " + tokenwalk_SBTOK.length + " + " + tokenwalk_SPECIAL +
        " = " + billed + " ids, against a " + d_fmtInt(tokenwalk_LIMIT) + "-token limit. Every check in the " +
        "§4 diagram passes cleanly. <b>Nothing here is detectably wrong</b> — length was never the problem, " +
        "and no validation you can write at this layer would flag it.",
      views: [{
        label: billed + " ids sent",
        cells: [{ label: "BOS", flag: "warn" }]
          .concat(tokenwalk_blanks(tokenwalk_SBTOK.length, "bad", "opaque row index"))
          .concat([{ label: "EOS", flag: "warn" }]),
      }],
      stats: [
        { label: "billed ids", value: String(billed) },
        { label: "guard", value: "PASS", sub: "length is fine", flag: "ok" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 6, flag: "bad",
      caption: "<b>The model, being asked to count.</b> It holds " + billed + " integers. The quantity it " +
        "is being asked for — " + total + " — was a property of a string that stopped existing two stages " +
        "ago. It is not being asked a hard question; it is being asked to perceive something it has no " +
        "sense organ for.",
      views: [{ label: "what the model receives", cells: tokenwalk_blanks(tokenwalk_SBTOK.length, "bad", "opaque row index") }],
      stats: [
        { label: "r's perceivable", value: "0", sub: "of " + total + " present", flag: "bad" },
        { label: "chars / token", value: (tokenwalk_SB.length / tokenwalk_SBTOK.length).toFixed(2), sub: "rule of thumb ≈4" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 7, flag: "bad",
      caption: "<b>It will still answer — and that is the dangerous part.</b> A model can get this right " +
        "by <i>recalling</i> that <i>strawberry</i> is spelled with " + total + " <b>r</b>s, a memorised " +
        "fact about the world, which is why bigger models score better and why the failure looks like " +
        "stupidity rather than blindness. <b>The takeaway: this is not a reasoning failure, it is a " +
        "representation failure, and no amount of prompting fixes it.</b> The fix is to change the " +
        "representation — give it the characters as a tool call, or spell the word out in the prompt.",
      views: [{ label: "the counted thing", cells: tokenwalk_cells(tokenwalk_SB.split(""), function (i, c) { return c === "r" ? "bad" : "idle"; }, function (i, c) { return c; }) }],
      stats: [
        { label: "present in text", value: String(total) + " r", flag: "idle" },
        { label: "reachable by model", value: "0", sub: "destroyed at stage 3", flag: "bad" },
      ],
    }));
    return { id: "count", label: "“how many r’s?”", steps: S };
  }

  // --- scenario 3: the same meaning in another script --------------------
  function tokenwalk_cost() {
    var nEN = tokenwalk_N_EN, nTA = tokenwalk_N_TA;
    var billedEN = nEN + tokenwalk_SPECIAL, billedTA = nTA + tokenwalk_SPECIAL;
    var fitEN = Math.floor(tokenwalk_LIMIT / billedEN);
    var fitTA = Math.floor(tokenwalk_LIMIT / billedTA);
    var perWordEN = nEN / tokenwalk_WEN, perWordTA = nTA / tokenwalk_WTA;
    var S = [];

    function two(a, b) { return [a, b]; }

    S.push(tokenwalk_step({
      stage: 0,
      caption: "Two sentences that mean the same thing. The page measured them with the same tokenizer: " +
        "English <b>" + nEN + "</b> tokens, Tamil <b>" + nTA + "</b>. Watch which stage produces that gap.",
      views: two(
        { label: "English · raw", cells: [{ label: tokenwalk_EN, flag: "idle" }] },
        { label: "Tamil · raw", cells: [{ label: tokenwalk_TA, flag: "idle" }] }
      ),
      stats: [{ label: "tokens", value: "—", sub: "not yet tokenized", flag: "idle" }],
    }));

    S.push(tokenwalk_step({
      stage: 1, flag: "ok",
      caption: "<b>Normalise.</b> English: " + tokenwalk_CEN + " code points, " + tokenwalk_BEN +
        " UTF-8 bytes — 1.00 byte per character. Tamil: " + tokenwalk_CTA + " code points, <b>" +
        tokenwalk_BTA + "</b> bytes — " + (tokenwalk_BTA / tokenwalk_CTA).toFixed(2) + " bytes per " +
        "character, because Tamil lives outside the one-byte range. Nothing has gone wrong yet; the two " +
        "texts are the same size to within " + (tokenwalk_CTA / tokenwalk_CEN).toFixed(2) + "×.",
      views: two(
        { label: "English · " + tokenwalk_CEN + " chars / " + tokenwalk_BEN + " bytes", cells: [{ label: tokenwalk_EN, flag: "ok" }] },
        { label: "Tamil · " + tokenwalk_CTA + " chars / " + tokenwalk_BTA + " bytes", cells: [{ label: tokenwalk_TA, flag: "ok" }] }
      ),
      stats: [
        { label: "chars", value: tokenwalk_CEN + " vs " + tokenwalk_CTA, sub: "EN vs TA" },
        { label: "bytes/char", value: (tokenwalk_BEN / tokenwalk_CEN).toFixed(2) + " vs " + (tokenwalk_BTA / tokenwalk_CTA).toFixed(2), flag: "warn" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 2, flag: "ok",
      caption: "<b>Pre-tokenize.</b> Split on whitespace: English <b>" + tokenwalk_WEN +
        "</b> words, Tamil <b>" + tokenwalk_WTA + "</b>. Tamil says the same thing in <i>fewer</i>, longer " +
        "words — agglutination packs what English spreads over prepositions and articles. On a word count " +
        "Tamil is the more efficient language here.",
      views: two(
        { label: "English · " + tokenwalk_WEN + " words", cells: tokenwalk_cells(tokenwalk_EN.split(/\s+/), function () { return "ok"; }) },
        { label: "Tamil · " + tokenwalk_WTA + " words", cells: tokenwalk_cells(tokenwalk_TA.split(/\s+/), function () { return "ok"; }) }
      ),
      stats: [
        { label: "words", value: tokenwalk_WEN + " vs " + tokenwalk_WTA, sub: "EN vs TA" },
        { label: "advantage", value: "Tamil", sub: "fewer words for the same meaning", flag: "ok" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 3, flag: "bad",
      caption: "<b>Apply the learned merges — and the gap opens here, in one stage.</b> English: " +
        tokenwalk_WEN + " words → " + nEN + " tokens, <b>" + perWordEN.toFixed(2) + "</b> pieces per " +
        "word. Tamil: " + tokenwalk_WTA + " words → " + nTA + " tokens, <b>" + perWordTA.toFixed(2) +
        "</b> pieces per word — <b>" + (perWordTA / perWordEN).toFixed(1) + "× the fragmentation</b>. " +
        "The merges were learned from a corpus dominated by English, so English words earned their own " +
        "rows and Tamil words did not. Nothing here is a Tamil property; it is a corpus property.",
      views: two(
        { label: "English · " + nEN + " tokens", cells: tokenwalk_blanks(nEN, "ok", "token") },
        { label: "Tamil · " + nTA + " tokens", cells: tokenwalk_blanks(nTA, "bad", "token") }
      ),
      dense: true,
      stats: [
        { label: "tokens", value: nEN + " vs " + nTA, sub: (nTA / nEN).toFixed(2) + "×", flag: "bad" },
        { label: "pieces / word", value: perWordEN.toFixed(2) + " vs " + perWordTA.toFixed(2), sub: (perWordTA / perWordEN).toFixed(1) + "× more fragmented", flag: "bad" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 4, flag: "bad",
      caption: "<b>Map to integers.</b> The same meaning is now <b>" + nEN + "</b> integers or <b>" + nTA +
        "</b> integers depending on which language the user happens to speak. Per character it inverts the " +
        "efficiency rule of thumb: English " + (tokenwalk_CEN / nEN).toFixed(1) + " chars/token, Tamil " +
        (tokenwalk_CTA / nTA).toFixed(1) + " — close to one token per character.",
      views: two(
        { label: "English · " + nEN + " ids", cells: tokenwalk_blanks(nEN, "ok", "id") },
        { label: "Tamil · " + nTA + " ids", cells: tokenwalk_blanks(nTA, "bad", "id") }
      ),
      dense: true,
      stats: [
        { label: "chars / token", value: (tokenwalk_CEN / nEN).toFixed(1) + " vs " + (tokenwalk_CTA / nTA).toFixed(1), sub: "rule of thumb ≈4", flag: "bad" },
        { label: "ratio", value: tokenwalk_RATIO.toFixed(2) + "×", sub: "Tamil ÷ English", flag: "bad" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 5, flag: "bad",
      caption: "<b>Special tokens, then the guard — where it turns into money.</b> " + billedEN +
        " ids against " + billedTA + ". In a " + d_fmtInt(tokenwalk_LIMIT) + "-token window that is <b>" +
        fitEN + "</b> of these sentences in English and <b>" + fitTA + "</b> in Tamil: the window is " +
        (fitEN / fitTA).toFixed(2) + "× smaller for identical content. (Slightly less than the " +
        tokenwalk_RATIO.toFixed(2) + "× content ratio, because the " + tokenwalk_SPECIAL +
        " special tokens are a fixed overhead that does not scale.)",
      views: two(
        { label: "English · " + billedEN + " billed", cells: tokenwalk_blanks(billedEN, "ok", "billed id") },
        { label: "Tamil · " + billedTA + " billed", cells: tokenwalk_blanks(billedTA, "bad", "billed id") }
      ),
      dense: true,
      stats: [
        { label: "fits in " + d_fmtInt(tokenwalk_LIMIT), value: fitEN + " vs " + fitTA, sub: (fitEN / fitTA).toFixed(2) + "× smaller window", flag: "bad" },
        { label: "billed ids", value: billedEN + " vs " + billedTA, flag: "bad" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 6, flag: "bad",
      caption: "<b>The model, and the bill.</b> Billing is per token, so the Tamil user pays <b>" +
        tokenwalk_RATIO.toFixed(2) + "×</b> for the same sentence. Across the page's four measured " +
        "languages the ratios come out at " + (29 / 11).toFixed(1) + "×, " + (18 / 11).toFixed(1) +
        "× and " + (47 / 11).toFixed(1) + "× English. And the third consequence is the one you " +
        "cannot see on an invoice: heavily fragmented text is harder to model, so the quality is lower too.",
      views: two(
        { label: "English · " + billedEN, cells: tokenwalk_blanks(billedEN, "ok", "billed id") },
        { label: "Tamil · " + billedTA, cells: tokenwalk_blanks(billedTA, "bad", "billed id") }
      ),
      dense: true,
      table: true,
      stats: [
        { label: "price, same meaning", value: tokenwalk_RATIO.toFixed(2) + "×", flag: "bad" },
        { label: "effective window", value: "1 / " + (fitEN / fitTA).toFixed(2), flag: "bad" },
      ],
    }));

    S.push(tokenwalk_step({
      stage: 7, flag: "bad",
      caption: "<b>The return trip, and the bug the first tab could never show you.</b> Every Tamil " +
        "character is " + (tokenwalk_BTA / tokenwalk_CTA).toFixed(2) + " UTF-8 bytes on average; in " +
        "byte-level BPE a token boundary need not land on a character boundary, so decoding token by " +
        "token during streaming can emit half a character — mojibake, until you buffer. English, at " +
        (tokenwalk_BEN / tokenwalk_CEN).toFixed(2) + " bytes per character, <i>cannot</i> produce it. " +
        "<b>The takeaway is one sentence: the same meaning costs " + tokenwalk_RATIO.toFixed(2) +
        "× more, fits in a window " + (fitEN / fitTA).toFixed(2) + "× smaller, is modelled worse, " +
        "and carries a decoding bug — and all four are invisible to a test suite written in English.</b>",
      views: two(
        { label: "English · 1 byte per char", cells: [{ label: "safe to decode per token", flag: "ok" }] },
        { label: "Tamil · " + (tokenwalk_BTA / tokenwalk_CTA).toFixed(2) + " bytes per char", cells: [{ label: "a token may end mid-character", flag: "bad" }] }
      ),
      table: true,
      stats: [
        { label: "UTF-8 bytes", value: tokenwalk_BEN + " vs " + tokenwalk_BTA, sub: "same meaning", flag: "bad" },
        { label: "stream-safe", value: "yes / no", sub: "buffer until valid", flag: "bad" },
      ],
    }));
    return { id: "cost", label: "Same meaning, Tamil", steps: S };
  }

  // thousands separator without relying on the helper's decimal formatting
  function d_fmtInt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  S["tokenwalk"] = {
    title: "Run the tokenizer pipeline, three inputs, seven stages",
    note: "The seven stages are the page's §3 flow, in order. <b>Scenario 1 is the page's §1 " +
      "diagram verbatim</b> — its sentence, its seven pieces, its seven ids; scenario 2 uses the page's " +
      "<i>strawberry</i> split; scenario 3 uses the page's §5 measured counts (English 11 · Hindi 29 " +
      "· Japanese 18 · Tamil 47). Every other figure is computed here from the strings themselves — " +
      "characters, UTF-8 bytes, words, pieces per word, chars per token, and every ratio. Two numbers are " +
      "stated configuration rather than measurement: <b>+2 special tokens</b> (BOS and EOS) and an <b>" +
      d_fmtInt(tokenwalk_LIMIT) + "-token limit</b>, used only for the window arithmetic.",
    interval: 1400,
    scenarios: [tokenwalk_clean(), tokenwalk_count_(), tokenwalk_cost()],

    draw: function (step, d, ctx) {
      var i;

      // stage rail — the §3 pipeline, with the current stage lit
      var rail = [];
      for (i = 0; i < tokenwalk_STAGES.length; i++) {
        rail.push({
          label: tokenwalk_STAGES[i],
          flag: step.stage > i + 1 ? "ok" : step.stage === i + 1 ? (step.flag || "ok") : "idle",
          title: (i + 1) + ". " + tokenwalk_NAMES[i],
        });
      }

      // the representation right now, one lane per text being tracked
      var lanes = [];
      for (i = 0; i < step.views.length; i++) {
        lanes.push(d.lane({ label: step.views[i].label, cells: step.views[i].cells }));
      }

      var stats = [];
      for (i = 0; i < step.stats.length; i++) stats.push(d.stat(step.stats[i]));

      var stageName = step.stage === 0 ? "IDLE" : tokenwalk_NAMES[step.stage - 1].toUpperCase();

      var body = lanes.join("");
      if (step.mono) body += d.mono(step.mono, "ok");

      var core = d.flow([
        d.stack([
          d.big(step.stage === 0 ? "—" : step.stage + "/" + tokenwalk_STAGES.length, "stage", step.flag),
          d.dots({ n: step.views.length === 2 ? 2 : 1, label: "texts in flight" }),
        ]),
        d.node({
          title: "BPE tokenizer",
          status: stageName,
          statusFlag: step.flag || "idle",
          badge: "byte-level BPE",
          meta: "vocabulary learned from an English-dominated corpus",
          flag: step.flag || "idle",
          body: body,
        }),
        d.stack(stats),
      ]);

      var tail = "";
      if (step.table) {
        var rows = [];
        for (i = 0; i < tokenwalk_LANGS.length; i++) {
          rows.push([
            tokenwalk_LANGS[i].name,
            String(tokenwalk_LANGS[i].n),
            (tokenwalk_LANGS[i].n / tokenwalk_N_EN).toFixed(1) + "×",
          ]);
        }
        tail = d.table(["Language (page §5)", "Tokens", "× English"], rows);
      }

      return d.stack([d.lane({ label: "§3 pipeline", cells: rail }), core, tail]);
    },
  };

})();
