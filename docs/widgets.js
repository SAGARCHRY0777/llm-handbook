/**
 * widgets.js — the interactive version of the arithmetic.
 *
 * Every widget here is the live twin of a Python block already on the same
 * page. That is the design rule and it is worth stating: the reader can move a
 * slider to build intuition, then read the code to see exactly how the number
 * was produced, and the two must agree. A widget that disagrees with the code
 * beside it is worse than no widget.
 *
 * Deliberately dependency-free and progressive: the markup the build emits is
 * a labelled fallback paragraph, replaced here only if JavaScript runs. With
 * JS off the page still carries the code block, which is the real content.
 *
 * Adding one: write a definition, register it in WIDGETS, and put a
 * ```widget <name> fence in the markdown.
 */
(function () {
  "use strict";

  var GiB = 1024 * 1024 * 1024;

  // --- small formatting helpers ------------------------------------------
  function fmt(n, digits) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: digits === undefined ? 0 : digits,
      maximumFractionDigits: digits === undefined ? 0 : digits
    });
  }
  function bytes(b) {
    if (b >= GiB) return fmt(b / GiB, 2) + " GiB";
    if (b >= 1024 * 1024) return fmt(b / (1024 * 1024), 1) + " MiB";
    if (b >= 1024) return fmt(b / 1024, 0) + " KiB";
    return fmt(b, 0) + " B";
  }
  function pct(x) { return fmt(x * 100, 1) + "%"; }

  /**
   * Build a control panel.
   *
   * spec.controls: array of {id, label, min, max, step, value, unit, log}
   *                or {id, label, options: [[value, label], ...]}
   * spec.compute:  (values) -> object
   * spec.render:   (result, values) -> HTML string for the readout
   *
   * `log` controls move on a log scale, because sequence length and batch size
   * are interesting across three orders of magnitude and a linear slider spends
   * 90% of its travel in a range nobody cares about.
   */
  function panel(host, spec) {
    host.innerHTML = "";
    host.classList.add("widget--live");

    var head = document.createElement("div");
    head.className = "widget__head";
    head.innerHTML =
      '<span class="widget__tag">interactive</span>' +
      '<span class="widget__title">' + spec.title + "</span>";
    host.appendChild(head);

    var grid = document.createElement("div");
    grid.className = "widget__controls";
    host.appendChild(grid);

    var out = document.createElement("div");
    out.className = "widget__out";
    host.appendChild(out);

    if (spec.note) {
      var note = document.createElement("p");
      note.className = "widget__note";
      note.innerHTML = spec.note;
      host.appendChild(note);
    }

    var inputs = {};

    spec.controls.forEach(function (c) {
      var wrap = document.createElement("label");
      wrap.className = "widget__ctl";

      var lab = document.createElement("span");
      lab.className = "widget__lab";
      lab.textContent = c.label;

      var val = document.createElement("b");
      val.className = "widget__val";

      var input;
      if (c.options) {
        input = document.createElement("select");
        c.options.forEach(function (o) {
          var op = document.createElement("option");
          op.value = String(o[0]);
          op.textContent = o[1];
          input.appendChild(op);
        });
        input.value = String(c.value);
        wrap.classList.add("widget__ctl--select");
      } else {
        input = document.createElement("input");
        input.type = "range";
        if (c.log) {
          // store the exponent; read() converts back
          input.min = String(Math.log2(c.min));
          input.max = String(Math.log2(c.max));
          input.step = "1";
          input.value = String(Math.log2(c.value));
        } else {
          input.min = String(c.min);
          input.max = String(c.max);
          input.step = String(c.step || 1);
          input.value = String(c.value);
        }
      }
      input.className = "widget__input";
      inputs[c.id] = { el: input, spec: c, out: val };

      lab.appendChild(val);
      wrap.appendChild(lab);
      wrap.appendChild(input);
      grid.appendChild(wrap);
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });

    function read() {
      var v = {};
      Object.keys(inputs).forEach(function (k) {
        var it = inputs[k];
        var raw = Number(it.el.value);
        v[k] = it.spec.log ? Math.pow(2, raw) : raw;
      });
      return v;
    }

    function update() {
      var v = read();
      Object.keys(inputs).forEach(function (k) {
        var it = inputs[k];
        var shown = v[k];
        it.out.textContent = it.spec.options
          ? (it.spec.options.filter(function (o) { return Number(o[0]) === shown; })[0] || ["", shown])[1]
          : fmt(shown, it.spec.decimals || 0) + (it.spec.unit || "");
      });
      out.innerHTML = spec.render(spec.compute(v), v);
    }

    update();
  }

  /** A row in the readout. `flag` colours it: ok / warn / bad. */
  function row(label, value, flag) {
    return '<div class="widget__row' + (flag ? " is-" + flag : "") + '">' +
      '<span>' + label + "</span><b>" + value + "</b></div>";
  }
  function headline(value, label, flag) {
    return '<div class="widget__big' + (flag ? " is-" + flag : "") + '">' +
      "<b>" + value + "</b><span>" + label + "</span></div>";
  }

  // ======================================================================
  // 1 · KV cache size — the handbook's central formula
  // ======================================================================
  function kvCache(host) {
    panel(host, {
      title: "KV cache size",
      note: "Matches <code>2 × layers × kv_heads × head_dim × seq_len × batch " +
            "× bytes</code>. Drop <b>KV heads</b> from 32 to 8 and watch a quarter of the " +
            "memory disappear — that single change is GQA, and it is worth more than every " +
            "serving trick on this page combined.",
      controls: [
        { id: "layers", label: "layers", min: 8, max: 126, value: 32 },
        { id: "kvHeads", label: "KV heads", min: 1, max: 64, value: 8 },
        { id: "headDim", label: "head dim", min: 64, max: 256, step: 32, value: 128 },
        { id: "seq", label: "context", min: 1024, max: 1048576, value: 32768, log: true, unit: " tok" },
        { id: "batch", label: "concurrent requests", min: 1, max: 256, value: 32, log: true },
        { id: "dtype", label: "KV precision", value: 2,
          options: [[2, "bf16 — 2 bytes"], [1, "fp8 — 1 byte"], [0.5, "int4 — 0.5 bytes"]] },
        { id: "share", label: "layers per cache (CLA)", min: 1, max: 4, value: 1 }
      ],
      compute: function (v) {
        var perTok = 2 * (v.layers / v.share) * v.kvHeads * v.headDim * v.dtype;
        var one = perTok * v.seq;
        return { perTok: perTok, one: one, all: one * v.batch };
      },
      render: function (r, v) {
        // 80GB card, ~16GB of weights for an 8B-class model: a rough budget line
        var budget = 80 * GiB - 16 * GiB;
        var over = r.all > budget;
        return headline(bytes(r.all), "KV cache for " + fmt(v.batch) + " concurrent requests",
                        over ? "bad" : "ok") +
          row("per token, all layers", bytes(r.perTok)) +
          row("one request at " + fmt(v.seq) + " tokens", bytes(r.one)) +
          row("against ~64 GiB of free HBM on an 80 GB card",
              over ? "does not fit" : fmt(100 * r.all / budget, 0) + "% used",
              over ? "bad" : "ok");
      }
    });
  }

  // ======================================================================
  // 2 · Prefill share — does sparse attention apply to you at all?
  // ======================================================================
  function prefillShare(host) {
    panel(host, {
      title: "Is sparse attention worth it for your shape?",
      note: "Sparsity attacks the quadratic <b>prefill</b> term only; decode was already " +
            "linear in the cache. So the ceiling is set by your prefill share, not by how " +
            "good the selector is. Short prompts end the conversation.",
      controls: [
        { id: "prompt", label: "prompt", min: 128, max: 524288, value: 8192, log: true, unit: " tok" },
        { id: "gen", label: "generated", min: 32, max: 8192, value: 512, log: true, unit: " tok" },
        { id: "sparsity", label: "keys actually attended", min: 5, max: 100, step: 5, value: 10, unit: "%" }
      ],
      compute: function (v) {
        var prefill = v.prompt * v.prompt / 2;
        var decode = v.prompt * v.gen + v.gen * v.gen / 2;
        var dense = prefill + decode;
        var sparse = prefill * (v.sparsity / 100) + decode;   // decode is unaffected
        return { share: prefill / dense, speedup: dense / sparse };
      },
      render: function (r) {
        var flag = r.speedup < 2 ? "bad" : (r.speedup < 4 ? "warn" : "ok");
        return headline(fmt(r.speedup, 1) + "×", "attention work saved", flag) +
          row("prefill share of attention work", pct(r.share)) +
          row("verdict",
              r.speedup < 2 ? "not worth the retrieval risk"
                            : (r.speedup < 4 ? "marginal — measure first"
                                             : "this is what the papers benchmark"),
              flag);
      }
    });
  }

  // ======================================================================
  // 3 · Cascade break-even
  // ======================================================================
  function cascade(host) {
    panel(host, {
      title: "Does a cascade actually save money?",
      note: "Every request pays the small model whether or not it escalates — the call is " +
            "never refunded. Push escalation up and watch the saving collapse long before " +
            "the break-even, which is where the cascade stops being worth <i>building</i>.",
      controls: [
        { id: "ratio", label: "large / small price ratio", min: 2, max: 100, value: 20, unit: "×" },
        { id: "esc", label: "escalation rate", min: 0, max: 100, step: 1, value: 10, unit: "%" },
        { id: "verify", label: "verifier cost (runs on every request)",
          min: 0, max: 200, step: 10, value: 0, unit: "% of small" }
      ],
      compute: function (v) {
        var verify = v.verify / 100;
        var cost = 1 + verify + (v.esc / 100) * v.ratio;
        return {
          cost: cost,
          saving: v.ratio / cost,
          breakEven: (v.ratio - 1 - verify) / v.ratio
        };
      },
      render: function (r) {
        var flag = r.saving < 1 ? "bad" : (r.saving < 2 ? "warn" : "ok");
        return headline(fmt(r.saving, 2) + "×", "cheaper than using the large model alone", flag) +
          row("cost per request (small-model units)", fmt(r.cost, 2)) +
          row("break-even escalation rate", pct(Math.max(0, r.breakEven))) +
          row("verdict",
              r.saving < 1 ? "worse than no cascade at all"
                           : (r.saving < 2 ? "thin — is it worth the machinery?"
                                           : "clearly worth building"),
              flag);
      }
    });
  }

  // ======================================================================
  // 4 · Pipeline bubble
  // ======================================================================
  function bubble(host) {
    panel(host, {
      title: "Pipeline bubbles",
      note: "The bubble fraction is <code>(P−1) / (M + P−1)</code>. Pipelining converts " +
            "idle time into throughput only when there is enough concurrent work to fill the " +
            "pipe — which is exactly what a latency-sensitive deployment does not have.",
      controls: [
        { id: "stages", label: "pipeline stages", min: 2, max: 16, value: 4 },
        { id: "micro", label: "microbatches in flight", min: 1, max: 128, value: 8, log: true }
      ],
      compute: function (v) {
        var b = (v.stages - 1) / (v.micro + v.stages - 1);
        return { bubble: b, util: 1 - b };
      },
      render: function (r, v) {
        var flag = r.bubble > 0.4 ? "bad" : (r.bubble > 0.15 ? "warn" : "ok");
        // a small ASCII-ish bar, because the shape is the point
        var cells = 40, idle = Math.round(r.bubble * cells);
        var bar = '<div class="widget__bar">' +
          '<i style="flex:' + (cells - idle) + '"></i>' +
          '<u style="flex:' + Math.max(idle, 0) + '"></u></div>';
        return headline(pct(r.bubble), "of the cluster idle", flag) +
          bar +
          row("utilisation", pct(r.util), flag) +
          row("GPUs effectively wasted",
              fmt(v.stages * r.bubble, 1) + " of " + fmt(v.stages), flag);
      }
    });
  }

  // ======================================================================
  // 5 · Softmax — the attention weights, by hand
  // ======================================================================
  function softmax(host) {
    panel(host, {
      title: "Attention softmax — softmax #1, over positions",
      note: "Three scaled scores for a query attending to three earlier tokens. Note what " +
            "the scale does: divide by √d to keep the distribution soft, or watch it " +
            "collapse to near one-hot as the scores grow. This is the softmax over " +
            "<b>positions</b> — not the one over vocabulary.",
      controls: [
        { id: "s1", label: "score · “The”", min: -60, max: 60, value: 0, decimals: 1 },
        { id: "s2", label: "score · “cat”", min: -60, max: 60, value: 30, decimals: 1 },
        { id: "s3", label: "score · “sat”", min: -60, max: 60, value: 10, decimals: 1 },
        { id: "d", label: "head_dim (the √d scale)", min: 4, max: 256, step: 4, value: 4 }
      ],
      compute: function (v) {
        var s = [v.s1 / 10, v.s2 / 10, v.s3 / 10].map(function (x) {
          return x * 2 / Math.sqrt(v.d);   // *2 keeps the default example readable
        });
        var m = Math.max.apply(null, s);
        var e = s.map(function (x) { return Math.exp(x - m); });
        var sum = e.reduce(function (a, b) { return a + b; }, 0);
        return { w: e.map(function (x) { return x / sum; }), scaled: s };
      },
      render: function (r) {
        var names = ["The", "cat", "sat"];
        var max = Math.max.apply(null, r.w);
        var bars = r.w.map(function (w, i) {
          return '<div class="widget__wrow"><span>' + names[i] + "</span>" +
            '<div class="widget__wbar"><i style="width:' + (100 * w / max) + '%"></i></div>' +
            "<b>" + fmt(w, 3) + "</b></div>";
        }).join("");
        var peaked = max > 0.95;
        return bars +
          row("sums to", fmt(r.w.reduce(function (a, b) { return a + b; }, 0), 6)) +
          row("distribution",
              peaked ? "saturated — effectively a hard lookup" : "soft — a real blend",
              peaked ? "warn" : "ok");
      }
    });
  }

  // ======================================================================
  var WIDGETS = {
    "kv-cache": kvCache,
    "prefill-share": prefillShare,
    "cascade": cascade,
    "bubble": bubble,
    "softmax": softmax
  };

  document.addEventListener("DOMContentLoaded", function () {
    var hosts = document.querySelectorAll(".widget[data-widget]");
    Array.prototype.forEach.call(hosts, function (host) {
      var fn = WIDGETS[host.getAttribute("data-widget")];
      if (fn) {
        try {
          fn(host);
        } catch (e) {
          // A broken widget must never take the page's prose with it.
          host.classList.add("widget--failed");
        }
      }
    });
  });
})();
