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
})();
