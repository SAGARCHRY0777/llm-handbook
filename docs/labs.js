/**
 * labs.js — experiments, not calculators.
 *
 * A widget (widgets.js) moves a slider over a formula. A LAB runs the real
 * algorithm the page is about, in your browser, on text you type. Nothing is
 * pre-baked and nothing is fetched: if the page claims BM25 ranks a document a
 * certain way, the lab computes BM25 and you can break it with your own input.
 *
 * That is the whole design rule, and it is what makes a lab worth its bytes:
 *   THE LAB MUST IMPLEMENT THE MECHANISM, NOT MIMIC IT.
 * A "tokenizer" that splits on spaces teaches the wrong thing. If the honest
 * version is too big for a page, the page gets no lab.
 *
 * Progressive: the ```lab fence emits a labelled fallback that stays put if
 * JavaScript never runs. A lab that throws hides itself rather than taking the
 * prose down with it.
 *
 * Adding one: write LABS["name"] = (host, h) => {...}, put a ```lab fence
 * naming it in the markdown. No build change.
 */
(function () {
  "use strict";

  // ======================================================================
  // The helper library every lab is written against.
  // ======================================================================
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmt(n, d) {
    if (!isFinite(n)) return "—";
    return n.toLocaleString("en-US", {
      minimumFractionDigits: d === undefined ? 0 : d,
      maximumFractionDigits: d === undefined ? 0 : d,
    });
  }

  function makeHelpers(host) {
    var controls, out, changeFns = [];

    function fire() { changeFns.forEach(function (f) { f(); }); }

    var h = {
      esc: esc,
      fmt: fmt,

      /** Frame the lab. Returns nothing; call the field helpers after. */
      panel: function (spec) {
        host.innerHTML = "";
        host.classList.add("lab--live");
        var head = document.createElement("div");
        head.className = "lab__head";
        head.innerHTML =
          '<span class="lab__tag">experiment</span>' +
          '<span class="lab__title">' + spec.title + "</span>";
        host.appendChild(head);
        if (spec.note) {
          var n = document.createElement("p");
          n.className = "lab__note";
          n.innerHTML = spec.note;
          host.appendChild(n);
        }
        controls = document.createElement("div");
        controls.className = "lab__controls";
        host.appendChild(controls);
        out = document.createElement("div");
        out.className = "lab__out";
        host.appendChild(out);
      },

      /** Multi-line text input. Returns the element; read el.value. */
      textarea: function (o) {
        var w = document.createElement("label");
        w.className = "lab__field lab__field--wide";
        w.innerHTML = '<span class="lab__lab">' + esc(o.label) + "</span>";
        var t = document.createElement("textarea");
        t.className = "lab__input lab__textarea";
        t.rows = o.rows || 4;
        t.value = o.value || "";
        t.spellcheck = false;
        w.appendChild(t);
        controls.appendChild(w);
        t.addEventListener("input", fire);
        return t;
      },

      /** Single-line text input. */
      text: function (o) {
        var w = document.createElement("label");
        w.className = "lab__field" + (o.wide ? " lab__field--wide" : "");
        w.innerHTML = '<span class="lab__lab">' + esc(o.label) + "</span>";
        var t = document.createElement("input");
        t.type = "text";
        t.className = "lab__input";
        t.value = o.value || "";
        t.spellcheck = false;
        w.appendChild(t);
        controls.appendChild(w);
        t.addEventListener("input", fire);
        return t;
      },

      /** Range slider. The live value is shown in the label. */
      range: function (o) {
        var w = document.createElement("label");
        w.className = "lab__field";
        var lab = document.createElement("span");
        lab.className = "lab__lab";
        lab.textContent = o.label;
        var val = document.createElement("b");
        val.className = "lab__val";
        lab.appendChild(val);
        var r = document.createElement("input");
        r.type = "range";
        r.className = "lab__input";
        r.min = o.min; r.max = o.max; r.step = o.step || 1; r.value = o.value;
        w.appendChild(lab); w.appendChild(r);
        controls.appendChild(w);
        function sync() {
          val.textContent = fmt(Number(r.value), o.decimals || 0) + (o.unit || "");
        }
        r.addEventListener("input", function () { sync(); fire(); });
        sync();
        return r;
      },

      /** Dropdown. options: [[value, label], ...] */
      select: function (o) {
        var w = document.createElement("label");
        w.className = "lab__field";
        w.innerHTML = '<span class="lab__lab">' + esc(o.label) + "</span>";
        var s = document.createElement("select");
        s.className = "lab__input lab__select";
        o.options.forEach(function (p) {
          var op = document.createElement("option");
          op.value = String(p[0]); op.textContent = p[1];
          s.appendChild(op);
        });
        s.value = String(o.value);
        w.appendChild(s);
        controls.appendChild(w);
        s.addEventListener("change", fire);
        return s;
      },

      /** A button that re-fires the compute (for stochastic labs). */
      button: function (o) {
        var w = document.createElement("div");
        w.className = "lab__field";
        var b = document.createElement("button");
        b.type = "button";
        b.className = "lab__btn";
        b.textContent = o.label;
        w.appendChild(b);
        controls.appendChild(w);
        b.addEventListener("click", fire);
        return b;
      },

      /** Register the compute+render function. Runs once immediately. */
      on: function (fn) { changeFns.push(fn); fn(); },

      /** Write the output area. */
      render: function (html) { out.innerHTML = html; },

      // ---- output fragments, so every lab looks like the same family ----
      big: function (value, label, flag) {
        return '<div class="lab__big' + (flag ? " is-" + flag : "") + '"><b>' +
          value + "</b><span>" + label + "</span></div>";
      },
      row: function (label, value, flag) {
        return '<div class="lab__row' + (flag ? " is-" + flag : "") + '"><span>' +
          label + "</span><b>" + value + "</b></div>";
      },
      /** items: [{label, value, max, flag}] — horizontal bars */
      bars: function (items) {
        var max = Math.max.apply(null, items.map(function (i) { return i.max !== undefined ? i.max : i.value; }).concat([1e-9]));
        return '<div class="lab__bars">' + items.map(function (i) {
          return '<div class="lab__brow"><span>' + i.label + "</span>" +
            '<div class="lab__btrack"><i class="' + (i.flag ? "is-" + i.flag : "") +
            '" style="width:' + Math.max(0, Math.min(100, 100 * i.value / max)) + '%"></i></div>' +
            "<b>" + i.text + "</b></div>";
        }).join("") + "</div>";
      },
      /** Inline coloured chips — tokens, chunks, blocks. */
      chips: function (items) {
        return '<div class="lab__chips">' + items.map(function (t) {
          return '<i class="lab__chip' + (t.flag ? " is-" + t.flag : "") + '"' +
            (t.title ? ' title="' + esc(t.title) + '"' : "") + ">" +
            esc(t.label).replace(/ /g, "·") + "</i>";
        }).join("") + "</div>";
      },
      table: function (head, rows) {
        return '<div class="lab__tw"><table class="lab__table"><thead><tr>' +
          head.map(function (x) { return "<th>" + x + "</th>"; }).join("") +
          "</tr></thead><tbody>" +
          rows.map(function (r) {
            return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>";
          }).join("") + "</tbody></table></div>";
      },
      note: function (text, flag) {
        return '<p class="lab__msg' + (flag ? " is-" + flag : "") + '">' + text + "</p>";
      },
    };
    return h;
  }

  // ======================================================================
  // LAB 1 · tokenizer  (tokenization.md)
  // A real byte-pair-encoding merge loop, trained on the text you type.
  // ======================================================================
  function tokenizer(host, h) {
    h.panel({
      title: "Train a BPE tokenizer on your own text",
      note: "This is the actual BPE algorithm, not a word splitter: it starts from " +
        "characters and repeatedly merges the most frequent adjacent pair. Watch where " +
        "the merges land — common words become one token, rare ones stay in pieces. " +
        "That asymmetry is the whole reason token counts do not track word counts.",
    });
    var txt = h.textarea({
      label: "corpus — the tokenizer learns its merges from exactly this",
      rows: 4,
      value: "the cat sat on the mat. the cat ate the rat. that cat is a fat cat.",
    });
    var nMerges = h.range({ label: "merge operations", min: 0, max: 60, value: 18 });
    var test = h.text({ label: "encode this string", value: "the fat cat sat", wide: true });

    h.on(function () {
      // --- BPE training -------------------------------------------------
      var words = (txt.value.toLowerCase().match(/\S+/g) || []);
      if (!words.length) { h.render(h.note("Type some text to train on.", "warn")); return; }
      // each word is a list of symbols; </w> marks a word boundary
      var vocab = {};
      words.forEach(function (w) {
        var key = w.split("").join(" ") + " </w>";
        vocab[key] = (vocab[key] || 0) + 1;
      });
      var merges = [];
      for (var step = 0; step < Number(nMerges.value); step++) {
        var pairs = {};
        Object.keys(vocab).forEach(function (word) {
          var sym = word.split(" ");
          for (var i = 0; i < sym.length - 1; i++) {
            var p = sym[i] + " " + sym[i + 1];
            pairs[p] = (pairs[p] || 0) + vocab[word];
          }
        });
        var best = null, bestN = 0;
        Object.keys(pairs).forEach(function (p) { if (pairs[p] > bestN) { bestN = pairs[p]; best = p; } });
        if (!best || bestN < 2) break;               // nothing left worth merging
        merges.push({ pair: best, count: bestN });
        var joined = best.replace(" ", "");
        var next = {};
        Object.keys(vocab).forEach(function (word) {
          var nw = (" " + word + " ").split(" " + best + " ").join(" " + joined + " ").trim();
          next[nw] = (next[nw] || 0) + vocab[word];
        });
        vocab = next;
      }

      // --- encode the test string with the learned merges ---------------
      function encode(s) {
        return (s.toLowerCase().match(/\S+/g) || []).map(function (w) {
          var sym = w.split("").concat(["</w>"]);
          merges.forEach(function (m) {
            var a = m.pair.split(" ")[0], b = m.pair.split(" ")[1], j = a + b;
            for (var i = 0; i < sym.length - 1; i++) {
              if (sym[i] === a && sym[i + 1] === b) { sym.splice(i, 2, j); i--; }
            }
          });
          return sym;
        });
      }
      var encoded = encode(test.value);
      var flat = [];
      encoded.forEach(function (w) { w.forEach(function (t) { flat.push(t); }); });

      var chars = test.value.replace(/\s/g, "").length;
      var vocabSet = {};
      Object.keys(vocab).forEach(function (w) { w.split(" ").forEach(function (s) { vocabSet[s] = 1; }); });

      h.render(
        h.big(fmt(flat.length), "tokens for " + fmt(chars) + " characters — " +
          (flat.length ? (chars / flat.length).toFixed(2) : "0") + " chars/token") +
        h.chips(flat.map(function (t) {
          var whole = t.indexOf("</w>") >= 0;
          return { label: t.replace("</w>", "⏎"), flag: whole ? "ok" : "warn", title: whole ? "reaches a word boundary" : "word fragment" };
        })) +
        h.note("Green reaches a word boundary; amber is a fragment. Drag <b>merges</b> to 0 — " +
          "every character becomes its own token, which is what a tokenizer with no training looks like.") +
        h.row("learned merges", fmt(merges.length)) +
        h.row("distinct symbols in vocabulary", fmt(Object.keys(vocabSet).length)) +
        (merges.length
          ? h.table(["#", "merge learned", "frequency"],
              merges.slice(0, 8).map(function (m, i) {
                return [String(i + 1), "<code>" + h.esc(m.pair.replace(" ", " + ")) + "</code>", fmt(m.count)];
              }))
          : "")
      );
    });
  }

  // ======================================================================
  // LAB 2 · attention  (transformers.md)
  // Real scaled dot-product attention with a causal mask, over deterministic
  // pseudo-embeddings of the words you type.
  // ======================================================================
  function attention(host, h) {
    h.panel({
      title: "Scaled dot-product attention, on your own sentence",
      note: "Every number below is computed: each word gets a deterministic vector, " +
        "Q·Kᵀ is a real dot product, the causal mask really sets the upper triangle " +
        "to −∞, and softmax really normalises each row. Change <b>head_dim</b> and watch " +
        "the √d divisor decide whether attention blends or collapses to a hard lookup.",
    });
    var sent = h.text({
      label: "sentence (first 8 words)", wide: true,
      value: "the cat sat on the mat",
    });
    var dim = h.range({ label: "head_dim", min: 2, max: 128, step: 2, value: 8 });
    var causal = h.select({
      label: "mask", value: "1",
      options: [["1", "causal — decoder"], ["0", "none — encoder"]],
    });

    h.on(function () {
      var words = (sent.value.match(/\S+/g) || []).slice(0, 8);
      if (words.length < 2) { h.render(h.note("Type at least two words.", "warn")); return; }
      var d = Number(dim.value);

      // deterministic per-word vector: a hash expanded into d dimensions.
      function vec(word, salt) {
        var v = [], seed = 0;
        for (var i = 0; i < word.length; i++) seed = (seed * 31 + word.charCodeAt(i)) >>> 0;
        seed = (seed + salt * 2654435761) >>> 0;
        for (var k = 0; k < d; k++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          v.push((seed / 4294967296) * 2 - 1);
        }
        return v;
      }
      var Q = words.map(function (w) { return vec(w, 1); });
      var K = words.map(function (w) { return vec(w, 2); });
      function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

      var n = words.length, scale = Math.sqrt(d), rows = [];
      for (var i = 0; i < n; i++) {
        var raw = [];
        for (var j = 0; j < n; j++) {
          raw.push(causal.value === "1" && j > i ? -Infinity : dot(Q[i], K[j]) / scale);
        }
        var m = Math.max.apply(null, raw.filter(isFinite));
        var ex = raw.map(function (x) { return isFinite(x) ? Math.exp(x - m) : 0; });
        var sum = ex.reduce(function (a, b) { return a + b; }, 0);
        rows.push(ex.map(function (x) { return x / sum; }));
      }

      // heat grid
      var grid = '<div class="lab__grid" style="grid-template-columns:auto repeat(' + n + ',1fr)">';
      grid += '<div class="lab__gh"></div>';
      words.forEach(function (w) { grid += '<div class="lab__gh">' + h.esc(w.slice(0, 6)) + "</div>"; });
      rows.forEach(function (r, i) {
        grid += '<div class="lab__gl">' + h.esc(words[i].slice(0, 7)) + "</div>";
        r.forEach(function (v) {
          var masked = v === 0 && causal.value === "1";
          grid += '<div class="lab__cell' + (masked ? " is-masked" : "") + '" style="--w:' +
            v.toFixed(3) + '"><span>' + (masked ? "" : v.toFixed(2)) + "</span></div>";
        });
      });
      grid += "</div>";

      var last = rows[n - 1];
      var peak = Math.max.apply(null, last);
      h.render(
        grid +
        h.note("Each <b>row</b> is one query's distribution over positions, and each row sums to 1. " +
          "This is softmax #1 — over " + n + " positions, not over a vocabulary.") +
        h.row("rows sum to", last.reduce(function (a, b) { return a + b; }, 0).toFixed(6)) +
        h.row("largest weight in the last row", peak.toFixed(3),
          peak > 0.9 ? "warn" : "ok") +
        h.row("distribution", peak > 0.9 ? "saturated — effectively a hard lookup" : "soft — a real blend",
          peak > 0.9 ? "warn" : "ok")
      );
    });
  }

  // ======================================================================
  // LAB · sampler  (decoding.md)
  // ======================================================================
  function sampler(host, h) {
      // Two fixed steps, shaped like the real thing: one genuinely uncertain
      // with a long tail, one where the model is already sure. Nothing is
      // sampled or randomised — these are the numbers, every time.
      var STEPS = {
        open: {
          ctx: "The coffee was surprisingly",
          toks: [" good", " strong", " bitter", " cheap", " smooth", " hot",
                 " bad", " weak", " expensive", " nice", " pleasant", " purple"],
          logits: [3.20, 2.85, 2.60, 1.90, 1.65, 1.30, 0.95, 0.60, 0.20, -0.30, -0.85, -2.40]
        },
        sure: {
          ctx: "The capital of France is",
          toks: [" Paris", " the", " a", " located", " one", " not",
                 " now", " home", " still", " often", " France", " purple"],
          logits: [9.10, 3.20, 2.40, 2.10, 1.60, 1.40, 1.10, 0.80, 0.40, 0.10, -0.60, -2.10]
        }
      };
      function pct(x) {
        if (!isFinite(x)) return "—";
        if (x < 0) x = 0;                       // float noise never shows as -0.00%
        return (100 * x).toFixed(x < 0.001 ? 3 : 2) + "%";
      }
      function bits(x) { return (isFinite(x) && x > 0 ? x : 0).toFixed(2); }
      function tok(s) { return h.esc(s).replace(/ /g, "·"); }

      h.panel({
        title: "One decoding step, filter by filter",
        note: "Twelve candidates with fixed logits, so the only thing that changes below is " +
          "the policy. This is the real softmax and the real filters, applied in the order a " +
          "sampler applies them: temperature, top-k, top-p, min-p. The defaults already make " +
          "the point — top-k and top-p cut different slices of the same tail, and min-p sits " +
          "just under the survivors until you raise it. Then try two things: drag " +
          "<b>temperature</b> from 0 to 2.00 and watch the entropy <i>before</i> filtering go " +
          "from 0 to 3.27 bits over identical logits, and switch to the confident step to see " +
          "top-k keep ten candidates that top-p cuts to one."
      });
      var which = h.select({
        label: "next-token step", value: "open",
        options: [["open", "uncertain — “The coffee was surprisingly …”"],
                  ["sure", "confident — “The capital of France is …”"]]
      });
      var tmp = h.range({ label: "temperature", min: 0, max: 2, step: 0.05, value: 1, decimals: 2 });
      var kk = h.range({ label: "top-k (12 = off)", min: 1, max: 12, step: 1, value: 10 });
      var pp = h.range({ label: "top-p (1.00 = off)", min: 0.5, max: 1, step: 0.01, value: 0.95, decimals: 2 });
      var mp = h.range({ label: "min-p (0 = off)", min: 0, max: 0.3, step: 0.01, value: 0.08, decimals: 2 });

      h.on(function () {
        var st = STEPS[which.value] || STEPS.open, L = st.logits, n = L.length, i;
        var T = Number(tmp.value), K = Number(kk.value), P = Number(pp.value), M = Number(mp.value);
        // A slider can only hand back a number in range, but a garbage value
        // attribute must not put NaN on the screen.
        if (!isFinite(T) || T < 0) T = 0;
        K = !isFinite(K) ? n : Math.max(1, Math.min(n, Math.round(K)));
        P = !isFinite(P) ? 1 : Math.max(0, Math.min(1, P));
        M = !isFinite(M) ? 0 : Math.max(0, Math.min(1, M));
        var greedy = T <= 0;

        // 1 · temperature — softmax(logits / T). T=0 is argmax, not a softmax.
        var p0 = [], best = 0;
        for (i = 1; i < n; i++) if (L[i] > L[best]) best = i;
        if (greedy) {
          for (i = 0; i < n; i++) p0.push(i === best ? 1 : 0);
        } else {
          var ex = [], s = 0;                  // s >= 1: the best token contributes exp(0)
          for (i = 0; i < n; i++) { ex.push(Math.exp((L[i] - L[best]) / T)); s += ex[i]; }
          for (i = 0; i < n; i++) p0.push(ex[i] / s);
        }
        // Rank by probability, breaking ties by logit then index so the order is
        // the same in every engine — at low T most of the tail underflows to 0.
        var order = [];
        for (i = 0; i < n; i++) order.push(i);
        order.sort(function (a, b) { return (p0[b] - p0[a]) || (L[b] - L[a]) || (a - b); });

        // 2 · the filters, each recording exactly what it removed.
        var cut = [], gone = { greedy: [], "top-k": [], "top-p": [], "min-p": [] };
        function drop(idx, why) { cut[idx] = why; gone[why].push(tok(st.toks[idx])); }
        if (greedy) for (i = 1; i < n; i++) drop(order[i], "greedy");

        // 2a · top-k — keep the K highest-probability candidates.
        for (i = K; i < n; i++) if (!cut[order[i]]) drop(order[i], "top-k");

        // 2b · top-p — the smallest set whose mass reaches p, measured on the
        // distribution RENORMALISED over what top-k left. That renormalisation
        // is not a detail: HF, vLLM and llama.cpp all re-softmax the masked
        // logits, so top-p after top-k reaches p sooner than it would on the
        // raw scores. p = 1 is off, the way the reference code guards it with
        // "if top_p < 1.0" — without that guard the tail rounds its way over
        // 1.0 at low temperature and gets cut with top-p's name on it.
        var kMass = 0;
        for (i = 0; i < n; i++) if (!cut[i]) kMass += p0[i];
        if (P < 1 && kMass > 0) {
          var cum = 0, full = false;
          for (i = 0; i < n; i++) {
            var id = order[i];
            if (cut[id]) continue;
            if (full) { drop(id, "top-p"); continue; }
            cum += p0[id] / kMass;             // keep the token that CROSSES p
            if (cum >= P) full = true;
          }
        }

        // 2c · min-p — a floor set as a fraction of the best token. Both sides
        // of the test scale with the same mass, so comparing raw softmax
        // probabilities gives exactly the post-top-p answer.
        var thr = M * p0[order[0]];
        for (i = 0; i < n; i++) if (!cut[i] && p0[i] < thr) drop(i, "min-p");

        // 3 · renormalise over the survivors.
        var mass = 0, kept = 0;
        for (i = 0; i < n; i++) if (!cut[i]) { mass += p0[i]; kept++; }
        if (!kept || !(mass > 0)) { h.render(h.note("Every candidate was filtered out — loosen a knob.", "warn")); return; }
        var p1 = [], hB = 0, hA = 0;
        for (i = 0; i < n; i++) {
          p1.push(cut[i] ? 0 : p0[i] / mass);
          if (p0[i] > 0) hB -= p0[i] * Math.log(p0[i]) / Math.LN2;
          if (p1[i] > 0) hA -= p1[i] * Math.log(p1[i]) / Math.LN2;
        }

        // --- render --------------------------------------------------------
        var scale = p1[order[0]];              // top survivor sets the bar width
        function barsOf(pr, keptOnly) {
          var items = [];
          for (var j = 0; j < n; j++) {
            var d = order[j];
            if (keptOnly && cut[d]) continue;
            items.push({
              label: tok(st.toks[d]), value: pr[d], max: scale,
              text: cut[d] && !keptOnly ? pct(pr[d]) + " · " + cut[d] : pct(pr[d]),
              flag: cut[d] ? "bad" : "ok"
            });
          }
          return h.bars(items);
        }
        function list(a) { return a.length ? "<code>" + a.join("</code> <code>") + "</code>" : "—"; }
        var cT = greedy ? 1 : n, cK = cT - gone["top-k"].length,
            cP = cK - gone["top-p"].length, cM = cP - gone["min-p"].length;

        h.render(
          h.big(h.fmt(kept) + " / " + h.fmt(n), "candidates the sampler may still pick", kept === 1 ? "warn" : "ok") +
          h.big(bits(hA) + " bits", "entropy after filtering — was " + bits(hB) + " before",
            hA < 0.1 ? "warn" : "ok") +
          h.note("<b>Before</b> — the twelve candidates for <code>" + h.esc(st.ctx) + " ___</code> " +
            "after temperature and nothing else. Red is what the filters are about to remove.") +
          barsOf(p0, false) +
          h.note(kept === n
            ? "<b>After</b> — identical, because nothing was cut. Renormalising a full distribution is a no-op."
            : "<b>After</b> — the survivors, renormalised. The discarded " + pct(1 - mass) + " is redistributed " +
              "in proportion, which is why <code>" + tok(st.toks[best]) + "</code> rises from " + pct(p0[best]) +
              " to " + pct(p1[best]) + " without its logit moving.") +
          barsOf(p1, true) +
          h.table(["stage", "left", "removed here"], [
            ["temperature " + T.toFixed(2), h.fmt(cT),
              greedy ? "everything but the argmax — at T=0 there is no sampling at all"
                     : "nothing — temperature reshapes the distribution, it never truncates"],
            ["top-k " + h.fmt(K) + (K >= n ? " — off" : ""), h.fmt(cK), list(gone["top-k"])],
            ["top-p " + P.toFixed(2) + (P >= 1 ? " — off" : ""), h.fmt(cP), list(gone["top-p"])],
            ["min-p " + M.toFixed(2) + (M > 0 ? " → cut-off " + pct(thr) : " — off"), h.fmt(cM), list(gone["min-p"])]
          ]) +
          h.row("mass kept before renormalising", pct(mass)) +
          h.row("mass after renormalising", p1.reduce(function (a, b) { return a + b; }, 0).toFixed(6)) +
          h.note("min-p is the only one of the three defined <i>relative</i> to the best token: its cut-off is " +
            "min_p × p(top)" + (M > 0 ? " = " + pct(thr) + " here" : "") + ", so it tightens by itself when the model is confident and " +
            "opens up when it is not. top-k cannot do that — on the confident step it keeps ten candidates, " +
            "nine of them also-rans sharing 0.7% of the mass between them, and top-p cuts all nine.")
        );
      });
    }

  // ======================================================================
  // LAB · lora  (fine-tuning.md)
  // ======================================================================
  function lora(host, h) {
    h.panel({
      title: "LoRA parameter arithmetic on a Llama-shaped model",
      note: "No rules of thumb here: a LoRA on a weight of shape (out × in) adds exactly " +
        "<code>r(in + out)</code> parameters, and every figure below falls out of the layer " +
        "shapes. Drag <b>rank r</b> from 4 to 128 — trainable parameters go up 32× and training " +
        "memory moves about two gigabytes, because the frozen base is 98% of it. Then leave r " +
        "alone and switch <b>target modules</b> to all seven, and the base to 4-bit. Rank is " +
        "nearly free; what you target and how the base is stored are the choices that cost.",
    });
    var dimEl = h.range({ label: "hidden size d", min: 512, max: 8192, step: 256, value: 4096 });
    var layEl = h.range({ label: "layers", min: 2, max: 96, value: 32 });
    var rEl = h.range({ label: "rank r", min: 1, max: 128, value: 16 });
    var aEl = h.range({ label: "alpha", min: 1, max: 256, value: 32 });
    var modEl = h.select({
      label: "target modules", value: "qkvo",
      options: [
        ["qv", "q,v — the LoRA paper"],
        ["qkvo", "q,k,v,o — attention, the usual default"],
        ["mlp", "gate,up,down — MLP only"],
        ["all", "all seven projections"],
      ],
    });
    var precEl = h.select({
      label: "frozen base stored as", value: "2",
      options: [
        ["2", "bf16 — plain LoRA"],
        ["0.5", "nf4 4-bit — QLoRA"],
        ["1", "int8"],
        ["4", "fp32"],
      ],
    });

    var VOCAB = 32000;                  // Llama-2 tokenizer, lm_head untied
    var OPT = 16;                       // per trainable param: fp32 weight 4 + grad 4 + Adam 8
    var GIB = 1073741824, MIB = 1048576;
    var SETS = {
      qv: ["q", "v"], qkvo: ["q", "k", "v", "o"], mlp: ["gate", "up", "down"],
      all: ["q", "k", "v", "o", "gate", "up", "down"],
    };
    var NAMES = { qv: "q,v", qkvo: "q,k,v,o", mlp: "gate,up,down", all: "all seven" };
    // Keyed by the select's own values, so the readout never has to reach into
    // the option elements and re-split a display label to find the short name.
    var PREC = { "2": "bf16", "0.5": "nf4 4-bit", "1": "int8", "4": "fp32" };

    // SwiGLU width exactly as Llama picks it: 8d/3 rounded up to a multiple of 256.
    function mlpWidth(d) { return Math.ceil(Math.ceil(8 * d / 3) / 256) * 256; }
    // [out, in] of each projection. q,k,v,o are d×d — multi-head, no GQA shrink.
    function shape(n, d, m) {
      if (n === "gate" || n === "up") return [m, d];
      if (n === "down") return [d, m];
      return [d, d];
    }
    function baseParams(d, L) {
      var m = mlpWidth(d);
      return 2 * VOCAB * d + L * (4 * d * d + 3 * d * m + 2 * d) + d;
    }
    // A is r×in and B is out×r, so r(in+out) per matrix, per layer.
    function trainParams(d, L, r, names) {
      var m = mlpWidth(d), s = 0, i, sh;
      for (i = 0; i < names.length; i++) { sh = shape(names[i], d, m); s += r * (sh[0] + sh[1]); }
      return L * s;
    }
    function gib(b) { return h.fmt(b / GIB, 2) + " GiB"; }
    function mib(b) { return b < MIB ? h.fmt(b / 1024, 1) + " KiB" : h.fmt(b / MIB, 1) + " MiB"; }
    // Always pick the unit that keeps the digits meaningful: a 4 GiB adapter must
    // not read "3,660.0 MiB", and a 20 MiB base must not read "0.02 GiB".
    function size(b) { return b < GIB ? mib(b) : gib(b); }
    function pctOf(t, base) { return (100 * t / (base + t)).toFixed(3) + "%"; }

    h.on(function () {
      var d = Number(dimEl.value), L = Number(layEl.value), r = Number(rEl.value);
      var a = Number(aEl.value), bpp = Number(precEl.value), names = SETS[modEl.value];
      var base = baseParams(d, L);
      var train = names && names.length ? trainParams(d, L, r, names) : 0;
      if (!names || !names.length || !isFinite(base) || base <= 0 ||
          !isFinite(train) || train <= 0 || !isFinite(bpp) || bpp <= 0 || !(r >= 1)) {
        h.render(h.note("Pick a target-module set and a rank of at least 1.", "warn"));
        return;
      }
      var all = base + train;                    // peft counts the adapter in "all params"
      var fullB = base * OPT;                    // full fine-tune: every weight trainable
      var loraB = base * bpp + train * OPT;      // frozen base + adapter optimizer state
      var fileB = train * 2;                     // fp16 safetensors on disk
      var precLab = PREC[precEl.value] || "the chosen precision";

      var ranks = [4, 8, 16, 32, 64, 128];
      if (ranks.indexOf(r) < 0) { ranks.push(r); ranks.sort(function (x, y) { return x - y; }); }
      // The sweep sentence must quote the span the table actually shows: drop r
      // below 4 and the first row is r itself, so the range is no longer 32×.
      var span = h.fmt(Math.round(ranks[ranks.length - 1] / ranks[0]));

      h.render(
        h.big(h.fmt(train), "trainable parameters — " + pctOf(train, base) + " of " + h.fmt(all)) +
        h.big(size(fileB), "adapter file, fp16 — " + h.fmt(Math.floor(base / train)) +
          " of them fit in one bf16 copy of the base") +
        h.big(size(loraB), "training memory, against " + size(fullB) + " to fine-tune it all",
          loraB < 24 * GIB ? "ok" : loraB < 80 * GIB ? "warn" : "bad") +
        h.bars(["qv", "qkvo", "mlp", "all"].map(function (k) {
          var t = trainParams(d, L, r, SETS[k]);
          return {
            label: NAMES[k], value: t,
            text: h.fmt(t) + " · " + pctOf(t, base),
            flag: k === modEl.value ? "ok" : "",
          };
        })) +
        h.note("Target modules at r = " + h.fmt(r) + ", unchanged. The module list is what sets " +
          "the <i>capacity</i> of the adaptation, and it moves the parameter count by more than " +
          "a 4× change in rank does.") +
        h.table(["r", "trainable", "% of all params", "adapter file", "training memory"],
          ranks.map(function (rr) {
            var t = trainParams(d, L, rr, names);
            var cells = [h.fmt(rr), h.fmt(t), pctOf(t, base), size(t * 2), size(base * bpp + t * OPT)];
            return rr === r ? cells.map(function (c) { return "<b>" + c + "</b>"; }) : cells;
          })) +
        h.note("Rank sweep for <b>" + NAMES[modEl.value] + "</b>. " + span + "× the rank, and the " +
          "memory column barely moves — that is what &ldquo;rank is nearly free&rdquo; means, and " +
          "why reaching for r = 64 costs you almost nothing except overfitting risk.") +
        h.row("base model parameters", h.fmt(base) + " — vocab " + h.fmt(VOCAB) +
          ", MLP width " + h.fmt(mlpWidth(d)) + ", multi-head k/v") +
        h.row("frozen base held as " + precLab, size(base * bpp)) +
        h.row("adapter weights + gradients + Adam moments", size(train * OPT)) +
        h.row("share of training memory that is just the frozen base",
          (100 * base * bpp / loraB).toFixed(1) + "%", "warn") +
        h.row("full fine-tune costs", (fullB / loraB).toFixed(1) + "× this", "bad") +
        h.row("scale applied to the update BA", "α/r = " + (a / r).toFixed(3) +
          " — changes no number above") +
        h.note("Weights, gradients and optimizer state only. Activations depend on batch size, " +
          "sequence length and whether you gradient-checkpoint, and are excluded — the page's " +
          "table adds them, which is why its figures are a few GB higher. Both paths are costed " +
          "at 16 bytes per <i>trainable</i> parameter (fp32 master weight, gradient, two Adam " +
          "moments); a frozen parameter only has to be stored.")
      );
    });
  }

  // ======================================================================
  // LAB · prefix  (kv-reuse.md)
  // ======================================================================
  function prefix(host, h) {
    h.panel({
      title: "Prefix cache hits, block by block",
      note: "This is how a prefix cache actually decides: split the prompt into fixed blocks " +
        "and hash each block <b>together with the previous block's hash</b>, so a block can only " +
        "match if every token before it matched too. As it stands B differs from A by one word " +
        "and exactly one block is red — everything in front of it still hits. Now type a single " +
        "character in front of the <b>first</b> word as well: every block misses, including the " +
        "ones you never touched, and the hit rate falls to zero. That cliff is the exactness the " +
        "rest of this page is trying to buy its way out of.",
    });
    var pa = h.textarea({
      label: "prompt A — already in the cache", rows: 3,
      value: "You are a support agent for Acme Cloud. Always cite the policy section. " +
        "Never invent prices. --- Question: how do I rotate an API key for tenant 42?",
    });
    var pb = h.textarea({
      label: "prompt B — the request that just arrived", rows: 3,
      value: "You are a support agent for Acme Cloud. Always cite the policy section. " +
        "Never invent prices. --- Question: how do I revoke an API key for tenant 42?",
    });
    var bsz = h.range({ label: "block size", min: 1, max: 16, value: 4, unit: " tokens" });

    h.on(function () {
      var ta = pa.value.match(/\S+/g) || [];
      var tb = pb.value.match(/\S+/g) || [];
      if (!ta.length || !tb.length) { h.render(h.note("Both prompts need some text.", "warn")); return; }
      // The slider can only hand back 1..16, but a non-finite or zero n would
      // spin split() forever, so the clamp is not optional.
      var n = Math.floor(Number(bsz.value));
      if (!isFinite(n) || n < 1) n = 1;
      var i, k;
      var CAP = 48;   // blocks drawn per strip; the arithmetic always uses all of them

      function split(toks) {
        var out = [];
        for (var j = 0; j < toks.length; j += n) out.push(toks.slice(j, j + n).join(" "));
        return out;
      }
      // A seeded 32-bit string hash. The seed is what makes the chain a chain:
      // block i is hashed starting from block i-1's digest, so the digest of any
      // block commits to every token in front of it.
      function mix(seed, s) {
        var x = seed >>> 0;
        for (var c = 0; c < s.length; c++) {
          x = (x * 31 + s.charCodeAt(c)) >>> 0;
          x = (x ^ (x >>> 15)) >>> 0;
        }
        return x >>> 0;
      }
      function chain(bl) {
        var hs = [], prev = 2166136261;              // fixed root, like a cache's empty prefix
        for (var j = 0; j < bl.length; j++) { prev = mix(prev, bl[j]); hs.push(prev); }
        return hs;
      }
      function hex(x) { var s = x.toString(16); while (s.length < 8) s = "0" + s; return "0x" + s; }
      function full(t) { return t.split(" ").length === n; }

      var ba = split(ta), bb = split(tb);
      var ha = chain(ba), hb = chain(bb);

      // The lookup walks from the front and stops dead at the first mismatch.
      // A trailing partial block is never cached and never looked up, so BOTH
      // sides have to be whole — which is also what keeps the reuse count from ever
      // exceeding the tokens B actually has.
      var hit = 0;
      while (hit < ba.length && hit < bb.length && ha[hit] === hb[hit] &&
             full(ba[hit]) && full(bb[hit])) hit++;

      var reused = hit * n, prefill = tb.length - reused, rate = reused / tb.length;
      var idBlocks = 0;
      for (k = hit; k < Math.min(ba.length, bb.length); k++) {
        if (ba[k] === bb[k] && full(ba[k])) idBlocks++;
      }
      // Same index, not same token: a KV entry is only valid at the position it
      // was computed for, which is the whole subject of this page.
      var idToks = 0;
      for (k = reused; k < tb.length; k++) { if (ta[k] === tb[k]) idToks++; }

      function strip(bl, hs, other) {
        var shown = bl.length > CAP ? bl.slice(0, CAP) : bl;
        return h.chips(shown.map(function (t, j) {
          var same = other[j] === t, part = !full(t);
          return {
            // Labels are truncated, so the tooltip carries the whole block —
            // at block size 16 it is the only place the text survives.
            label: t.length > 30 ? t.slice(0, 29) + "…" : t,
            // Red means the text genuinely differs. Amber means it does not and
            // the block misses anyway. Nothing else may be amber, or the legend
            // under the strips is a lie.
            flag: j < hit ? "ok" : (same ? "warn" : "bad"),
            title: t + " · block " + j + " · " + hex(hs[j]) + " · " +
              (j < hit ? "HIT — chain intact to here"
                : other[j] === undefined ? "MISS — the other prompt has no block here"
                : !same ? "MISS — this text differs"
                : part ? "MISS — partial block, only whole blocks are cached"
                : "MISS — identical text, but an earlier block changed"),
          };
        })) + (bl.length > CAP
          ? h.note("(first " + CAP + " of " + h.fmt(bl.length) +
            " blocks drawn — every number here still counts all of them)")
          : "");
      }

      var rows = [], lim = Math.min(10, Math.max(ba.length, bb.length));
      for (i = 0; i < lim; i++) {
        rows.push([
          String(i),
          ha[i] === undefined ? "—" : "<code>" + hex(ha[i]) + "</code>",
          hb[i] === undefined ? "—" : "<code>" + hex(hb[i]) + "</code>",
          i < hit ? "hit" : "miss",
        ]);
      }

      function pl(v, total, word) {
        return h.fmt(v) + " of " + h.fmt(total) + " " + word + (total === 1 ? "" : "s");
      }
      h.render(
        h.big(h.fmt(100 * rate, 1) + "%", "of prompt B served from cache — " +
          pl(reused, tb.length, "token") + ", " + pl(hit, bb.length, "block"),
          rate > 0.5 ? "ok" : rate > 0 ? "warn" : "bad") +
        h.note("<b>A</b> — the cached prompt") + strip(ba, ha, bb) +
        h.note("<b>B</b> — the incoming prompt") + strip(bb, hb, ba) +
        h.note("Green matched. Red is text that genuinely changed. Amber changed <b>nothing</b> " +
          "and misses anyway — either the chain broke in front of it and is carried forward to " +
          "every block behind, or it is a trailing partial block, which no engine caches.") +
        h.row("tokens re-prefilled", h.fmt(prefill), prefill ? "warn" : "ok") +
        h.row("…of those, byte-identical to the token at that position in the cache",
          h.fmt(idToks) + (prefill ? " of " + h.fmt(prefill) : ""), idToks ? "bad" : "ok") +
        h.row("whole blocks identical to a cached block, still missed", h.fmt(idBlocks),
          idBlocks ? "bad" : "ok") +
        h.table(["block", "chained hash · A", "chained hash · B", ""], rows) +
        (lim < Math.max(ba.length, bb.length)
          ? h.note("(first " + lim + " blocks shown)") : "") +
        h.note("Two knobs worth turning. Drag <b>block size</b> to 16, the vLLM default: the same " +
          "one-word edit now poisons a larger unit and reuse drops further. Then move the edited " +
          "word earlier in prompt B, one position at a time, and watch the hit rate fall in steps — " +
          "a cached block is worth exactly as much as the tokens in front of it are unchanged.")
      );
    });
  }

  // ======================================================================
  // LAB · queue  (serving-and-operations.md)
  // ======================================================================
  function queue(host, h) {
    h.panel({
      title: "The latency knee — M/M/1 for a pool of replicas",
      note: "These are the exact M/M/1 steady-state formulas, and Little's Law is checked " +
        "against them on screen. It opens at ρ = 0.85, where half a second of real work " +
        "takes 3.3 s to come back. Add one <b>replica</b> — same arrivals — and p95 " +
        "more than halves. Then push <b>arrival rate</b> until ρ passes 0.95 and watch that " +
        "same half second take twenty times as long: capacity planning to 95% is planning " +
        "for unbounded latency.",
    });
    var arr = h.range({ label: "arrival rate", min: 0.2, max: 20, step: 0.2, value: 6.8, unit: " req/s", decimals: 1 });
    var tps = h.range({ label: "decode throughput / replica", min: 100, max: 3000, step: 50, value: 800, unit: " tok/s" });
    var len = h.range({ label: "avg output length", min: 20, max: 2000, step: 20, value: 400, unit: " tok" });
    var rep = h.range({ label: "replicas", min: 1, max: 16, value: 4 });

    h.on(function () {
      var A = Number(arr.value), c = Number(rep.value);
      var mu = Number(tps.value) / Number(len.value);   // requests/s one replica completes
      // Random (or hash) routing thins one Poisson stream into c independent Poisson
      // streams, which is what makes per-replica M/M/1 exact. Strict round-robin would
      // not: it regularises the arrivals, so a real RR pool waits slightly less.
      var lam = A / c;
      if (!isFinite(mu) || mu <= 0 || !isFinite(c) || c < 1 || !isFinite(lam) || lam <= 0) {
        h.render(h.note("Arrival rate, throughput, output length and replicas must all be positive.", "warn"));
        return;
      }
      var rho = lam / mu, svc = 1 / mu;
      // Float dust: 0.6 req/s over 3 replicas against μ = 100/500 lands at
      // ρ = 0.9999999999999999, and μ−λ then cancels to 2.8e−17 — a p95 of 36
      // quadrillion seconds where the honest answer is "no steady state". Snap ρ,
      // then take the gap as μ(1−ρ) so the subtraction never cancels catastrophically.
      if (Math.abs(rho - 1) < 1e-9) rho = 1;

      function band(r) { return r < 0.7 ? "ok" : (r < 0.85 ? "warn" : "bad"); }

      if (rho >= 1) {
        h.render(
          h.big(h.fmt(rho, 2), "ρ — utilisation per replica", "bad") +
          h.note("ρ ≥ 1. Arrivals outrun service, so there is no steady state: the " +
            "queue grows without bound and every formula below is undefined. No timeout " +
            "fixes this — only shedding, or more replicas.", "bad") +
          h.row("offered load", h.fmt(A, 1) + " req/s") +
          h.row("pool capacity — μ × replicas", h.fmt(mu * c, 2) + " req/s") +
          h.row("replicas needed to hold ρ ≤ 0.80", h.fmt(Math.ceil(A / (mu * 0.8))), "warn")
        );
        return;
      }

      var rate = mu * (1 - rho);                    // = μ−λ; time in system is Exp(μ−λ)
      var W = 1 / rate, Wq = rho / rate;            // mean in system / mean waiting
      var Lq = rho * rho / (1 - rho);
      var inflate = 1 / (1 - rho);                  // W ÷ service time
      var grow = 1 / rho;                           // arrivals × this reaches ρ = 1
      function tq(p) { return Math.log(1 / p) / rate; }                 // total-latency tail
      function wq(p) { return rho > p ? Math.log(rho / p) / rate : 0; } // wait tail: atom at 0
      function secs(v) { return v > 0 ? h.fmt(v, 2) + " s" : "none"; }  // Wq has an atom at 0
      var flag = band(rho);

      var sweep = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99].map(function (r) {
        var p = Math.log(20) / (mu * (1 - r));
        return { label: "ρ " + r.toFixed(2), value: p, text: h.fmt(p, 1) + " s", flag: band(r) };
      });

      h.render(
        h.big(h.fmt(rho, 2), "ρ — utilisation per replica", flag) +
        h.big(h.fmt(tq(0.05), 2) + " s", "p95 latency, for " + h.fmt(svc, 2) + " s of actual work", flag) +
        h.row("λ per replica — arrivals ÷ replicas", h.fmt(lam, 2) + " req/s") +
        h.row("μ per replica — tokens/s ÷ output length", h.fmt(mu, 2) + " req/s") +
        h.row("pool capacity — μ × replicas", h.fmt(mu * c, 2) + " req/s") +
        h.table(["", "queue wait", "total latency"], [
          ["mean", secs(Wq), secs(W)],
          ["p50", secs(wq(0.5)), secs(tq(0.5))],
          ["p95", secs(wq(0.05)), secs(tq(0.05))],
          ["p99", secs(wq(0.01)), secs(tq(0.01))]
        ]) +
        h.row("slower than an idle replica — 1/(1−ρ)", h.fmt(inflate, 1) + "×", flag) +
        h.row("requests queued, L<sub>q</sub> = ρ²/(1−ρ)", h.fmt(Lq, 2)) +
        h.row("Little's Law — λ·W<sub>q</sub>", h.fmt(lam * Wq, 2) + " — the same number") +
        h.row("in the replica, L = λ·W — queued plus serving", h.fmt(lam * W, 2)) +
        h.row("traffic headroom before ρ = 1",
          grow < 10 ? "+" + h.fmt(100 * (grow - 1), 0) + "%" : h.fmt(grow, 0) + "× current arrivals",
          flag) +
        h.bars(sweep) +
        h.note("p95 latency against utilisation, holding μ fixed. Nothing here is drawn: each " +
          "bar is ln(20)/(μ(1−ρ)). Flat to 0.7, bending at 0.8, near-vertical past 0.95: " +
          "the four points from ρ 0.95 to 0.99 add more latency than the ninety-five before " +
          "them. Plan to 0.8 and the headroom is real; plan to 0.95 and you have bought the " +
          "cliff. One assumption worth naming: this is <i>c</i> independent queues, one per " +
          "replica, which is what a balancer that commits a request on arrival gives you. A " +
          "single shared queue in front of the pool — M/M/c — waits less at the same ρ, and " +
          "that is the argument for queueing centrally rather than per replica.", flag)
      );
    });
  }

  // ======================================================================
  // LAB · config  (model-shape.md)
  // ======================================================================
  function config(host, h) {
    h.panel({
      title: "Read a config.json as a bill",
      note: "Every number below is derived from the JSON, not looked up. The default is " +
        "Llama-3-8B. Change <code>num_key_value_heads</code> from 8 to 32 — that is " +
        "Llama-2-7B's MHA: four times the KV cache, a quarter of the concurrency, and " +
        "about 0.8 B <i>more</i> parameters, because the K and V projections widen with it. " +
        "Nothing else in the file moves.",
    });
    var LLAMA3 = [
      "{",
      '  "architectures": ["LlamaForCausalLM"],',
      '  "model_type": "llama",',
      '  "hidden_size": 4096,',
      '  "intermediate_size": 14336,',
      '  "num_hidden_layers": 32,',
      '  "num_attention_heads": 32,',
      '  "num_key_value_heads": 8,',
      '  "max_position_embeddings": 8192,',
      '  "rope_theta": 500000.0,',
      '  "rope_scaling": null,',
      '  "vocab_size": 128256,',
      '  "tie_word_embeddings": false,',
      '  "torch_dtype": "bfloat16"',
      "}",
    ].join("\n");

    var src = h.textarea({ label: "config.json — paste any HuggingFace one", rows: 12, value: LLAMA3 });
    var ctxLen = h.range({ label: "context per request", min: 1024, max: 131072, step: 1024, value: 32768, unit: " tok" });
    var batch = h.range({ label: "concurrent requests", min: 1, max: 256, value: 64 });
    var kvDt = h.select({
      label: "KV cache dtype", value: "2",
      options: [["2", "bf16 / fp16 — 2 B"], ["1", "fp8 — 1 B"], ["0.5", "int4 — 0.5 B"]],
    });
    var hbm = h.select({
      label: "accelerator", value: "80",
      options: [["24", "24 GiB"], ["80", "80 GiB"], ["141", "141 GiB"], ["192", "192 GiB"]],
    });

    // Families whose FFN is ungated (up + down, not gate + up + down), and the
    // subset of those whose HF config class ties the embeddings by default.
    var UNGATED = /^(gpt2|gptj|gpt_neox|gpt_bigcode|opt|bloom|falcon|mpt|phi|codegen|starcoder2)$/;
    var TIED_BY_DEFAULT = /^(gpt2|gpt_bigcode|opt|bloom|codegen)$/;

    h.on(function () {
      var GiB = 1073741824, KiB = 1024, c, i;
      if (!/\S/.test(src.value)) { h.render(h.note("Paste a <code>config.json</code>.", "warn")); return; }
      try { c = JSON.parse(src.value); } catch (e) {
        h.render(h.note("That is not valid JSON — <code>" + h.esc(e && e.message ? e.message : e) +
          "</code>. A config.json copied from the file view parses as-is; Python <code>None</code>/" +
          "<code>True</code> and trailing commas do not.", "warn"));
        return;
      }
      if (!c || typeof c !== "object" || c instanceof Array) {
        h.render(h.note("Valid JSON, but not a config object.", "warn")); return;
      }
      // First positive, finite value among the aliases. Numeric strings count:
      // a few configs in the wild quote their integers.
      function num() {
        for (var k = 0; k < arguments.length; k++) {
          var v = c[arguments[k]];
          if (typeof v === "string" && /\S/.test(v)) v = Number(v);
          if (typeof v === "number" && isFinite(v) && v > 0) return v;
        }
        return 0;
      }
      var L = num("num_hidden_layers", "n_layer", "num_layers");
      var H = num("hidden_size", "n_embd", "d_model");
      var nh = num("num_attention_heads", "n_head");
      var miss = (L ? [] : ["num_hidden_layers"]).concat(H ? [] : ["hidden_size"], nh ? [] : ["num_attention_heads"]);
      if (miss.length) {
        h.render(h.note("Parsed, but the fields that set the bill are missing: <code>" +
          miss.join("</code>, <code>") + "</code>.", "warn"));
        return;
      }
      var mt = String(c.model_type || "").toLowerCase();

      // Absent num_key_value_heads means MHA -- that is the HF default, not a shortcut.
      var kvh = num("num_key_value_heads", "num_kv_heads", "n_head_kv", "multi_query_group_num") || nh;
      if (kvh > nh) kvh = nh;
      var derivedHd = !num("head_dim", "v_head_dim");
      var hd = num("head_dim", "v_head_dim") || Math.floor(H / nh);
      if (hd < 1) {
        h.render(h.note("hidden_size (" + h.fmt(H) + ") is smaller than num_attention_heads (" +
          h.fmt(nh) + "), so head_dim rounds to zero. That is not a real checkpoint.", "warn"));
        return;
      }

      // MLA (DeepSeek): one compressed latent per token per layer, shared by every
      // head. 2 x kv_heads x head_dim does not apply and overstates it by ~50x.
      var kvLora = num("kv_lora_rank"), qkRope = num("qk_rope_head_dim"), qkNope = num("qk_nope_head_dim");
      var mla = kvLora > 0;

      // intermediate_size may be a LIST -- variable width. Sum it, never multiply.
      var isz = c.intermediate_size, ffnW = 0, varWidth = isz instanceof Array, assumedFfn = false;
      if (varWidth) { for (i = 0; i < isz.length; i++) ffnW += Number(isz[i]) || 0; }
      else ffnW = num("intermediate_size", "n_inner", "ffn_dim", "d_ff", "intermediate_dim") * L;
      // GPT-2, Bloom and Falcon declare no FFN width at all: the class default is 4h.
      if (!ffnW) { ffnW = 4 * H * L; assumedFfn = true; }
      var denseI = ffnW / L;

      var nExp = num("num_local_experts", "num_experts", "n_routed_experts");
      var topk = num("num_experts_per_tok", "num_experts_per_token", "moe_topk");
      var moe = nExp > 0;
      if (moe && !topk) topk = nExp;          // routing not declared: cost every expert
      if (topk > nExp) topk = nExp;
      var moeI = num("moe_intermediate_size") || denseI;
      var shI = num("shared_expert_intermediate_size") ||
        num("n_shared_experts", "num_shared_experts") * moeI;
      // Hybrid MoE: the first k layers keep a full dense FFN.
      var dense0 = moe ? Math.min(L, Math.floor(num("first_k_dense_replace"))) : 0;
      var moeL = L - dense0;
      var g = UNGATED.test(mt) ? 2 : 3;       // gate + up + down, or up + down

      var attnP;
      if (mla) {
        var qHd = (qkNope + qkRope) || hd, vHd = num("v_head_dim") || hd, qLora = num("q_lora_rank");
        attnP = (qLora ? H * qLora + qLora * nh * qHd : H * nh * qHd) +   // q, maybe low-rank
          H * (kvLora + qkRope) +                                        // kv_a, down-projection
          kvLora * nh * (qkNope + vHd) +                                 // kv_b, up-projection
          nh * vHd * H;                                                  // o
      } else {
        attnP = H * nh * hd + 2 * H * kvh * hd + nh * hd * H;             // q, k, v, o
      }
      var ffnP, ffnA;
      if (moe) {
        ffnP = g * H * (dense0 * denseI + moeL * (nExp * moeI + shI));
        ffnA = g * H * (dense0 * denseI + moeL * (topk * moeI + shI));
      } else {
        ffnP = g * H * ffnW;
        ffnA = ffnP;
      }
      var vocab = num("vocab_size", "n_vocab", "padded_vocab_size");
      var emb = vocab * H;
      // HF ties by default only for the families whose config class says so; every
      // modern file states it outright.
      var tieDecl = c.tie_word_embeddings;
      var tied = tieDecl === true || (tieDecl === undefined && TIED_BY_DEFAULT.test(mt));
      var head = tied ? 0 : emb;
      var norms = (2 * L + 1) * H;            // two per layer plus the final one
      var total = emb + head + L * attnP + ffnP + norms;
      var active = emb + head + L * attnP + ffnA + norms;

      var dt = String(c.torch_dtype || c.dtype || "bfloat16").toLowerCase();
      var wb = dt.indexOf("32") >= 0 ? 4 : dt.indexOf("8") >= 0 ? 1 : 2;
      var q = c.quantization_config, qBits = 0;
      if (q && typeof q === "object" && !(q instanceof Array)) {
        qBits = Number(q.bits) || Number(q.w_bit) || Number(q.weight_bits) || 0;
        if (!qBits && q.load_in_4bit === true) qBits = 4;
        if (!qBits && q.load_in_8bit === true) qBits = 8;
        if (!qBits && /fp8/.test(String(q.quant_method || ""))) qBits = 8;
        if (qBits > 0 && isFinite(qBits)) wb = qBits / 8; else qBits = 0;
      }

      var dtB = Number(kvDt.value);
      var bpt = mla ? L * (kvLora + qkRope) * dtB : 2 * L * kvh * hd * dtB;   // 2 = K and V
      var perReq = bpt * Number(ctxLen.value);
      var allKV = perReq * Number(batch.value);
      var wBytes = total * wb, cap = Number(hbm.value) * GiB;
      var fits = perReq > 0 ? Math.max(0, Math.floor((cap - wBytes) / perReq)) : 0;
      var over = wBytes + allKV > cap;
      if (!isFinite(total) || !isFinite(bpt) || !isFinite(wBytes)) {
        h.render(h.note("Some field in this file is astronomically large, so the arithmetic " +
          "overflows. That is not a checkpoint anyone can serve.", "warn"));
        return;
      }

      var rs = c.rope_scaling, ropeTxt = "absent — advertised length is trained length", ropeWarn = false;
      if (rs && typeof rs === "object" && !(rs instanceof Array)) {
        var f = Number(rs.factor) || 0, orig = Number(rs.original_max_position_embeddings) || 0;
        ropeTxt = h.esc(String(rs.rope_type || rs.type || "present")) + (f ? " ×" + f : "") +
          (orig ? ", trained at " + h.fmt(orig) : "") + " — stretched, not trained";
        ropeWarn = true;
      }
      var maxPos = num("max_position_embeddings", "n_positions", "max_seq_len", "seq_length");
      var ctx = Number(ctxLen.value);

      var flags = [];
      if (mla) flags.push({ label: "MLA latent cache", flag: "ok", title: "kv_lora_rank " + h.fmt(kvLora) + " + qk_rope_head_dim " + h.fmt(qkRope) + " is the whole cache, shared by all " + h.fmt(nh) + " heads — the 2 x kv_heads x head_dim formula does not apply" });
      else if (kvh < nh) flags.push({ label: "GQA " + nh + ":" + kvh, flag: "ok", title: "KV cache is " + (nh / kvh).toFixed(0) + "x smaller than MHA, and the K and V projections shrink with it" });
      else flags.push({ label: "MHA — no GQA", flag: "bad", title: "every query head keeps its own K and V" });
      if (moe) flags.push({ label: "MoE " + nExp + " experts, top-" + topk, flag: "warn", title: "total parameters are a VRAM number; active parameters are the compute bill" + (dense0 ? "; the first " + dense0 + " layers stay dense" : "") });
      if (varWidth && !assumedFfn) flags.push({ label: "variable width", flag: "warn", title: "intermediate_size is a list — summed over " + isz.length + " entries, not multiplied" });
      if (assumedFfn) flags.push({ label: "FFN width assumed", flag: "warn", title: "no intermediate_size / n_inner / ffn_dim in the file — assumed 4 x hidden_size, which is the GPT-2, Bloom and Falcon default" });
      if (!vocab) flags.push({ label: "no vocab_size", flag: "warn", title: "embedding and lm_head weights are not in the total" });
      if (num("partial_rotary_factor") || qkRope) flags.push({ label: "partial RoPE", flag: "ok", title: "only part of each head carries position — smaller rotary cache, cheaper KV reuse" });
      var lt = c.layer_types;
      if (lt instanceof Array && lt.length) {
        var full = 0;
        for (i = 0; i < lt.length; i++) if (String(lt[i]).indexOf("full") >= 0) full++;
        flags.push({ label: "hybrid layers — " + full + " of " + lt.length + " full attention", flag: "warn", title: "the rest are sliding-window or linear, so this per-token figure is an upper bound" });
      }
      if (qBits) flags.push({ label: "quantized " + qBits + "-bit", flag: "ok", title: "quantization_config says " + qBits + " bits, so " + wb + " bytes/param" });
      if (tied) flags.push({ label: tieDecl === true ? "tied embeddings" : "tied embeddings (assumed)", flag: "ok", title: "lm_head shares the embedding matrix — counted once" + (tieDecl === true ? "" : "; the file does not say, and this family ties by default") });
      if (maxPos && ctx > maxPos) flags.push({ label: "context > trained length", flag: "bad", title: "you are asking for " + h.fmt(ctx) + " tokens from a model whose max_position_embeddings is " + h.fmt(maxPos) });

      h.render(
        h.big(h.fmt(bpt / KiB, bpt < 10 * KiB ? 1 : 0) + " KiB", "KV cache per token — the concurrency bill", (mla || kvh < nh) ? "ok" : "bad") +
        h.big(h.fmt(allKV / GiB, 2) + " GiB", "KV at " + h.fmt(ctx) + " tok × " + batch.value + " requests", over ? "bad" : "ok") +
        h.big(h.fmt(active / 1e9, 1) + " B", "active parameters per token" + (total > active * 1.05 ? " — of " + h.fmt(total / 1e9, 1) + " B total" : ""), "ok") +
        h.chips(flags) +
        h.bars([
          { label: "weights", value: wBytes, max: cap, text: h.fmt(wBytes / GiB, 1) + " GiB", flag: "ok" },
          { label: "KV cache", value: allKV, max: cap, text: h.fmt(allKV / GiB, 1) + " GiB", flag: over ? "bad" : "ok" },
        ]) +
        h.row("fits on " + hbm.value + " GiB, after weights", h.fmt(fits) + " requests at this context", fits >= Number(batch.value) ? "ok" : "bad") +
        h.table(["field", "read as", "lands on"], [
          [mla ? "<code>kv_lora_rank</code>" : "<code>num_key_value_heads</code>",
            mla ? h.fmt(kvLora) + " + " + h.fmt(qkRope) + " rope, shared by " + h.fmt(nh) + " heads"
              : h.fmt(kvh) + " of " + h.fmt(nh) + " query heads", "KV cache, so concurrency"],
          ["<code>head_dim</code>", h.fmt(hd) + (derivedHd ? " (derived: hidden_size / heads)" : ""),
            mla ? "attention projections — the cache is the latent" : "bytes per token per layer"],
          ["<code>num_hidden_layers</code>", h.fmt(L), "cache depth, serial decode"],
          [moe ? "<code>moe_intermediate_size</code>" : "<code>intermediate_size</code>",
            moe ? h.fmt(moeI) + " × " + nExp + " experts, " + topk + " active" + (dense0 ? ", first " + dense0 + " layers dense at " + h.fmt(denseI) : "")
              : assumedFfn ? "not declared — assumed " + h.fmt(denseI) + " (4 × hidden_size) × " + L + " layers"
                : varWidth ? "list of " + isz.length + ", summed to " + h.fmt(ffnW) + " — not multiplied"
                  : h.fmt(denseI) + " × " + L + " layers",
            "most of the weights"],
          ["<code>vocab_size</code>", vocab ? h.fmt(vocab) + (head ? " × 2 (untied)" : " (tied)") : "absent — not counted",
            "embed + lm_head weights"],
          ["<code>max_position_embeddings</code>", maxPos ? h.fmt(maxPos) + " tok" : "not declared", "trained length"],
          ["<code>rope_scaling</code>", ropeTxt, "long-context quality"],
        ]) +
        h.note(mla
          ? "Formula, spelled out: <code>" + L + " layers × (" + h.fmt(kvLora) + " kv_lora_rank + " +
            h.fmt(qkRope) + " qk_rope_head_dim) × " + kvDt.value + " B = " + h.fmt(bpt) +
            " bytes/token</code>. MLA caches one compressed latent per layer for all heads: no leading 2, no per-head term."
          : "Formula, spelled out: <code>2 × " + L + " layers × " + kvh + " KV heads × " + hd +
            " head_dim × " + kvDt.value + " B = " + h.fmt(bpt) + " bytes/token</code>. The leading 2 is K and V.") +
        (ropeWarn
          ? h.note("<code>rope_scaling</code> is set — the advertised length is a stretch of a shorter " +
            "trained length, which is a different risk from a model trained long.", "warn") : "") +
        (total > active * 1.05
          ? h.note("Total is <b>" + (total / active).toFixed(1) + "×</b> active: you buy VRAM for " +
            h.fmt(total / 1e9, 0) + " B and compute for " + h.fmt(active / 1e9, 0) +
            " B. Neither number substitutes for the other.", "warn")
          : "")
      );
    });
  }

  // ======================================================================
  // LAB · paged  (kv-cache.md)
  // ======================================================================
  function paged(host, h) {
    h.panel({
      title: "Paged vs contiguous allocation, on the same pool",
      note: "Both allocators get the identical pool and the identical queue. Paged takes " +
        "<b>ceil(tokens ÷ block)</b> blocks and nothing more; contiguous reserves " +
        "<b>max_seq_len</b> per request whether the request uses it or not. Drag " +
        "<b>block size</b> from 8 to 64 and watch wasted slots climb — then check it against " +
        "the bound line: the waste never reaches one block per request, no matter what you type. " +
        "That ceiling is the entire argument for fixed blocks.",
    });
    var reqs = h.textarea({
      label: "resident requests — tokens held, one per line",
      rows: 6,
      value: "37\n250\n8\n512\n96\n140\n61\n200\n19\n430",
    });
    var bsz = h.range({ label: "block size", min: 8, max: 64, step: 8, value: 16, unit: " tokens" });
    var cap = h.range({ label: "pool", min: 512, max: 4096, step: 256, value: 2048, unit: " slots" });
    var msl = h.range({ label: "max_seq_len", min: 128, max: 2048, step: 128, value: 512 });

    var MAXREQ = 24;   // as many requests as the pool view can honestly draw

    h.on(function () {
      // --- parse, keeping each request's input position so r-numbers never lie
      var lines = reqs.value.split("\n"), parsed = [], want = [], i, j, n;
      for (i = 0; i < lines.length; i++) {
        n = parseInt(lines[i], 10);
        if (isFinite(n) && n > 0) parsed.push(n);
      }
      var dropped = parsed.length > MAXREQ ? parsed.length - MAXREQ : 0;
      for (i = 0; i < parsed.length && i < MAXREQ; i++) want.push({ tokens: parsed[i], id: i + 1 });
      if (!want.length) {
        h.render(h.note("One token count per line — <code>37</code>, <code>250</code>, …", "warn"));
        return;
      }

      // The sliders cannot produce a zero, but a zero block size would divide the
      // pool into infinitely many blocks and hang the tab. Cheap to refuse.
      var B = Math.floor(Number(bsz.value)), pool = Math.floor(Number(cap.value)),
        M = Math.floor(Number(msl.value));
      if (!(B > 0)) B = 16;
      if (!(pool > 0)) pool = 2048;
      if (!(M > 0)) M = 512;

      var valid = [], over = 0;
      for (i = 0; i < want.length; i++) { if (want[i].tokens > M) over++; else valid.push(want[i]); }
      if (!valid.length) {
        h.render(h.note("Every request is longer than <b>max_seq_len</b>, so neither allocator " +
          "will admit one. Raise max_seq_len or shorten the requests.", "warn"));
        return;
      }

      var poolBlocks = Math.floor(pool / B);
      if (!(poolBlocks > 0)) {
        h.render(h.note("The pool is smaller than one block. Raise <b>pool</b> or lower " +
          "<b>block size</b>.", "warn"));
        return;
      }

      // --- paged: fixed blocks, FIFO admission, any free block will do -----
      var used = 0, plan = [], stop = false, pTok = 0, pAdmit = 0, waste = 0;
      for (i = 0; i < valid.length; i++) {
        var need = Math.ceil(valid[i].tokens / B);
        var fits = !stop && used + need <= poolBlocks;
        if (!fits) stop = true;
        plan.push({ id: valid[i].id, tokens: valid[i].tokens, blocks: need, first: used, ok: fits });
        if (fits) { used += need; pTok += valid[i].tokens; pAdmit++; waste += need * B - valid[i].tokens; }
      }
      if (!pAdmit) {
        h.render(h.note("Request <b>r" + plan[0].id + "</b> is at the head of the queue and wants " +
          h.fmt(plan[0].blocks) + " blocks (" + h.fmt(plan[0].tokens) + " tokens ÷ " + h.fmt(B) +
          " per block), but the entire pool is only " + h.fmt(poolBlocks) + " blocks. Nothing is " +
          "admitted, so there is no allocation to compare — raise the <b>pool</b> or shorten that " +
          "request.", "warn"));
        return;
      }
      var pCommit = used * B, pUtil = pCommit ? pTok / pCommit : 0, bound = pAdmit * (B - 1);

      // --- contiguous: one max_seq_len reservation per request -------------
      var cCommit = 0, cAdmit = 0, cTok = 0;
      for (i = 0; i < valid.length; i++) {
        if (cCommit + M > pool) break;
        cCommit += M; cAdmit++; cTok += valid[i].tokens;
      }
      var cUtil = cCommit ? cTok / cCommit : 0;

      // --- the physical pool, block by block -------------------------------
      var cells = [];
      for (i = 0; i < poolBlocks; i++) cells.push(null);
      for (i = 0; i < plan.length; i++) {
        if (!plan[i].ok) continue;
        for (j = 0; j < plan[i].blocks; j++) {
          var held = j === plan[i].blocks - 1 ? plan[i].tokens - (plan[i].blocks - 1) * B : B;
          cells[plan[i].first + j] = { req: plan[i].id, held: held };
        }
      }
      var shown = Math.min(poolBlocks, 240), chips = [];
      for (i = 0; i < shown; i++) {
        var c = cells[i];
        if (!c) { chips.push({ label: "·", title: "block " + i + " — free" }); continue; }
        chips.push({
          label: "r" + c.req,
          flag: c.held === B ? "ok" : "warn",
          title: "block " + i + " · request " + c.req + " · " + c.held + "/" + B +
            " slots live" + (c.held === B ? "" : " · " + (B - c.held) + " wasted"),
        });
      }

      var pct = function (x) { return (100 * x).toFixed(1) + "%"; };
      var rows = [];
      for (i = 0; i < plan.length && i < 10; i++) {
        var p = plan[i];
        rows.push([
          "r" + p.id,
          h.fmt(p.tokens),
          p.ok ? h.fmt(p.blocks) : "pool full",
          p.ok ? h.fmt(p.blocks * B) : "—",
          p.ok ? h.fmt(p.blocks * B - p.tokens) : "—",
          i < cAdmit ? h.fmt(M) + " (" + h.fmt(M - p.tokens) + " idle)" : "rejected",
        ]);
      }
      if (plan.length > 10) rows.push(["…", h.fmt(plan.length - 10) + " more", "", "", "", ""]);

      var slack = pool - poolBlocks * B;

      h.render(
        h.big(pct(pUtil), "paged utilisation — live tokens ÷ slots committed", pUtil > 0.9 ? "ok" : "warn") +
        h.big(pct(cUtil), "contiguous utilisation — same requests, same pool", cUtil > 0.9 ? "ok" : "bad") +
        h.big(h.fmt(pAdmit) + " / " + h.fmt(cAdmit), "requests admitted — paged / contiguous",
          pAdmit > cAdmit ? "ok" : "") +
        (dropped ? h.note("Queue capped at " + h.fmt(MAXREQ) + " requests — the last " +
          h.fmt(dropped) + (dropped === 1 ? " line is" : " lines are") + " not modelled, and none " +
          "of the numbers below count " + (dropped === 1 ? "it" : "them") + ".", "warn") : "") +
        h.chips(chips) +
        h.note("Green = a block with every slot live. <b>Amber = the partial tail block</b>, which is " +
          "all the internal fragmentation there is — at most one per request. Grey is free pool." +
          (poolBlocks > shown ? " Showing the first " + h.fmt(shown) + " of " + h.fmt(poolBlocks) + " blocks." : "") +
          (slack ? " The pool does not divide evenly by the block size: " + h.fmt(slack) +
            " slots fall outside every block and no allocator here can reach them." : "")) +
        h.bars([
          { label: "paged", value: pUtil, max: 1, text: pct(pUtil), flag: "ok" },
          { label: "contiguous", value: cUtil, max: 1, text: pct(cUtil), flag: "bad" },
        ]) +
        h.row("live tokens across admitted requests", h.fmt(pTok) + " paged · " + h.fmt(cTok) + " contiguous") +
        h.row("slots committed", h.fmt(pCommit) + " paged · " + h.fmt(cCommit) + " contiguous") +
        h.row("wasted slots — paged, internal only",
          h.fmt(waste) + " of at most " + h.fmt(bound) + " (" + h.fmt(pAdmit) + " × " +
          h.fmt(B - 1) + ", one short tail each)", "ok") +
        h.row("wasted slots — contiguous, unused reservation",
          h.fmt(cCommit - cTok) + " — nothing bounds this but max_seq_len",
          cCommit - cTok > 0 ? "bad" : "") +
        (over ? h.row("refused by both: longer than max_seq_len", h.fmt(over), "warn") : "") +
        h.table(["req", "tokens", "blocks", "slots", "wasted", "contiguous reserves"], rows) +
        h.note("Contiguous is being flattered here: this models only its <i>reservation</i> waste. " +
          "External fragmentation — free slots that no request can use because no run of them is " +
          "long enough — is real, unbounded, and not counted above. Paging has none of it, because " +
          "every block is interchangeable.")
      );
    });
  }

  // ======================================================================
  // LAB · gate  (regression-gates.md)
  // ======================================================================
  function gate(host, h) {
    h.panel({
      title: "Can this eval set see the regression you are gating on?",
      note: "The default is the gate most teams write first: a 1-point drop, caught on a 200-item " +
        "set. Every number below is the real test — pooled two-proportion z, Wald interval on the " +
        "difference, minimum detectable effect at 80% power, and an exact binomial tail for the " +
        "false-alarm bars. Read the interval: it straddles zero, so the same system could have " +
        "produced either score. Now drag <b>eval items</b> to the top and watch the interval narrow " +
        "and <i>still</i> contain zero — then read the table for how many thousand items a 1-point " +
        "gate actually needs.",
    });
    var nEl = h.range({ label: "eval items", min: 20, max: 2000, step: 10, value: 200 });
    var bEl = h.range({ label: "baseline accuracy", min: 50, max: 99.5, step: 0.5, value: 90, unit: "%", decimals: 1 });
    var oEl = h.range({ label: "observed accuracy", min: 50, max: 100, step: 0.5, value: 89, unit: "%", decimals: 1 });
    var aEl = h.select({
      label: "significance level", value: "0.05",
      options: [["0.10", "α = 0.10 · 90% CI"], ["0.05", "α = 0.05 · 95% CI"], ["0.01", "α = 0.01 · 99% CI"]],
    });

    var ZC = { "0.10": 1.644854, "0.05": 1.959964, "0.01": 2.575829 };  // two-sided critical value
    var ZPOW = 0.841621;                                                // z for 80% power

    /** Standard normal CDF — Abramowitz & Stegun 26.2.17, |error| < 7.5e-8. */
    function phi(z) {
      var t = 1 / (1 + 0.2316419 * Math.abs(z));
      var dn = 0.3989422804014327 * Math.exp(-z * z / 2);
      var tail = dn * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
        t * (-1.821255978 + t * 1.330274429))));
      var v = z > 0 ? 1 - tail : tail;
      return v < 0 ? 0 : (v > 1 ? 1 : v);
    }
    /** Exact binomial P(X <= k) in n draws at rate p, summed in log space. */
    function binomAtMost(k, n, p) {
      if (k < 0) return 0;
      if (k >= n) return 1;
      var lp = Math.log(p), lq = Math.log(1 - p), lc = 0, sum = 0;
      for (var i = 0; i <= k; i++) {
        if (i > 0) lc += Math.log((n - i + 1) / i);   // log C(n,i) by recurrence
        sum += Math.exp(lc + i * lp + (n - i) * lq);
      }
      return sum > 1 ? 1 : sum;
    }
    function pts(x) { return (x < 0 ? "−" : "+") + h.fmt(Math.abs(x) * 100, 1); }
    function pShow(p) { return p < 0.001 ? "&lt; 0.001" : "= " + p.toFixed(3); }

    h.on(function () {
      var aKey = ZC[aEl.value] ? aEl.value : "0.05";   // a control can only offer the three
      var alpha = Number(aKey), zc = ZC[aKey];
      var n = Number(nEl.value), bPct = Number(bEl.value), oPct = Number(oEl.value);
      var x0 = Math.round(bPct / 100 * n);   // items right at baseline
      var x1 = Math.round(oPct / 100 * n);   // items right this run
      if (!(n >= 2) || !isFinite(x0) || !isFinite(x1)) {
        h.render(h.note("Those control values do not describe an eval set: it needs at least two " +
          "items and two real accuracies. Reset the sliders.", "warn"));
        return;
      }
      if (x0 <= 0 || x0 >= n) {
        h.render(h.note(x0 >= n
          ? "A baseline of " + h.fmt(x0) + "/" + h.fmt(n) + " is a perfect score, so there is no " +
            "binomial variance left and the normal approximation degenerates here. With zero failures " +
            "the honest statement is the rule of three: with 95% confidence the true failure rate could " +
            "still be as high as " + h.fmt(300 / n, 1) + "%. Lower the baseline or raise the item count."
          : "A baseline of " + h.fmt(x0) + "/" + h.fmt(n) + " has no binomial variance left either, " +
            "and nothing to regress from. Raise the baseline.", "warn"));
        return;
      }
      var p0 = x0 / n, p1 = x1 / n, d = p1 - p0;
      var step = 100 / n;                                 // points one item is worth

      // --- pooled two-proportion z-test, equal group sizes ------------------
      var pool = (x0 + x1) / (2 * n);
      var sePool = Math.sqrt(2 * pool * (1 - pool) / n);
      var z = sePool > 0 ? d / sePool : 0;
      var pval = 2 * (1 - phi(Math.abs(z)));
      if (pval > 1) pval = 1;                             // |z| = 0 rounds the tail past a half

      // --- Wald interval on the DIFFERENCE (unpooled: the gate's question) --
      var seDiff = Math.sqrt(p0 * (1 - p0) / n + p1 * (1 - p1) / n);
      var lo = d - zc * seDiff, hi = d + zc * seDiff;
      var straddles = lo <= 0 && hi >= 0;

      // --- minimum detectable effect, and the n a given effect would need ---
      var mde = (zc + ZPOW) * Math.sqrt(2 * p0 * (1 - p0) / n);
      function needed(e) { return Math.ceil((zc + ZPOW) * (zc + ZPOW) * 2 * p0 * (1 - p0) / (e * e)); }

      // --- one run against a fixed committed baseline: false alarms ---------
      var se1 = Math.sqrt(p0 * (1 - p0) / n);
      var sig = pval < alpha, conf = h.fmt((1 - alpha) * 100, 0);
      var thin = Math.min(x0, n - x0, x1, n - x1) < 5;
      var split = sig === straddles;   // pooled test and unpooled interval part ways

      h.render(
        h.big(pts(d) + " pts", "observed − baseline · " + h.fmt(x1) + "/" + h.fmt(n) + " vs " +
          h.fmt(x0) + "/" + h.fmt(n), sig ? (d < 0 ? "bad" : "ok") : "warn") +
        h.big("p " + pShow(pval),
          "two-sided · z = " + z.toFixed(2) + " · α = " + alpha.toFixed(2), sig ? "ok" : "warn") +
        h.big(h.fmt(mde * 100, 1) + " pts", "minimum detectable effect at 80% power",
          mde > 0.05 ? "bad" : (mde > 0.02 ? "warn" : "ok")) +
        h.note(sig
          ? "<b>Distinguishable from noise.</b> The pooled two-proportion test returns p " + pShow(pval) +
            ", below α, so " + h.fmt(n) + " items are enough to separate these two runs. A gate can " +
            "act on this one."
          : "<b>Indistinguishable from noise.</b> " + h.fmt(n) + " items cannot separate these two runs: " +
            "the pooled two-proportion test returns p " + pShow(pval) + ", above α, so an unchanged " +
            "system could have produced either score. Gating on a move this size is theatre with a " +
            "build number.",
          sig ? "ok" : "warn") +
        (x0 === x1 && bPct !== oPct
          ? h.note("At " + h.fmt(n) + " items a score moves in " + h.fmt(step, 1) + "-point steps, so your " +
            h.fmt(bPct, 1) + "% and " + h.fmt(oPct, 1) + "% are the same " + h.fmt(x0) + " items. The " +
            "difference you dialled in does not exist on a set this size — which is the first thing to " +
            "check when a gate never fires.", "warn")
          : "") +
        (thin ? h.note("Fewer than 5 items in one cell of the 2×2 table, so the normal approximation " +
          "behind the z-test, the intervals and the power table is shaky and those figures are " +
          "indicative. The false-alarm bars below are exact binomial and unaffected.", "warn") : "") +
        h.row(conf + "% Wald interval on the difference", "[" + pts(lo) + ", " + pts(hi) + "] pts",
          straddles ? "warn" : "ok") +
        h.row("zero inside that interval", straddles ? "yes — no change demonstrated" : "no — a real difference",
          straddles ? "warn" : "ok") +
        h.row(conf + "% interval on the rate itself", "±" + h.fmt(zc * se1 * 100, 1) + " pts") +
        (split ? h.note("<b>Borderline:</b> the test and the interval disagree here, and that is a " +
          "property of the two standard tools, not a bug. The z-test pools both runs under the null, " +
          "and a pooled variance is never smaller than the unpooled one the interval is built from, so " +
          "near the threshold the interval can exclude zero while the test still cannot reject. Report " +
          "this as borderline and add items; do not pick whichever tool agrees with you.", "warn") : "") +
        h.table(["regression to catch", "items needed at 80% power", "your " + h.fmt(n) + "-item set"],
          [0.01, 0.02, 0.03, 0.05, 0.10].map(function (e) {
            var req = needed(e);
            return [h.fmt(e * 100, 0) + (e === 0.01 ? " point" : " points"), h.fmt(req), h.chips([{
              label: req <= n ? "detectable" : "invisible",
              flag: req <= n ? "ok" : "bad",
              title: req <= n ? "your set is large enough" : "needs " + h.fmt(req / n, 1) + "× your set",
            }])];
          })) +
        h.note("Chance a <b>clean</b> run — nothing changed, same true rate — trips each gate allowance " +
          "on sampling noise alone, from the exact binomial tail. One item is " + h.fmt(step, 1) +
          " pts at this size and a score can only move in whole items, which is exactly where the " +
          "normal curve and the binomial part company on small sets:") +
        h.bars([0.02, 0.04, 0.06, 0.08].map(function (a) {
          // the gate trips when the drop strictly exceeds the allowance
          var k = Math.ceil(x0 - a * n - 1e-9) - 1;
          var f = binomAtMost(k, n, p0);
          return {
            label: "allowance " + h.fmt(a * 100, 0) + " pts", value: f, max: 1,
            text: f < 0.0001 ? "&lt; 0.01%" : h.fmt(f * 100, f >= 0.01 ? 1 : 2) + "%",
            flag: f > 0.1 ? "bad" : (f > 0.02 ? "warn" : "ok"),
          };
        })) +
        h.note("Set <b>eval items</b> to 50 and the baseline to 90% — the handbook's example. One item " +
          "is 2 points there, so a 2-point allowance needs two items to flip before it fires, and it " +
          "still trips about a quarter of green builds. That is precisely how a gate gets switched " +
          "off. The binomial model treats your items as a sample of the traffic you care about; that " +
          "is the only reading under which gating on them means anything at all.")
      );
    });
  }

  // ======================================================================
  // LAB · similarity  (embeddings-and-vector-databases.md)
  // ======================================================================
  function similarity(host, h) {
    h.panel({
      title: "Cosine vs dot product vs Euclidean, on your own corpus",
      note: "Every line below becomes a real vector: character trigrams hashed into " +
        "d dimensions and counted. It is a crude embedding — no neural model anywhere — " +
        "but it is a genuine vector space and the three metrics are the textbook ones. " +
        "At the default settings the corpus splits them: cosine picks the relevant line, " +
        "dot product picks one of the <i>long</i> ones, Euclidean picks the <i>shortest</i>. " +
        "Switch <b>normalise</b> to on and all three rankings collapse into one — that " +
        "is what normalising both sides actually buys you.",
    });
    var query = h.text({ label: "query", wide: true, value: "how do i measure ann recall" });
    var corpus = h.textarea({
      label: "documents — one per line", rows: 7,
      value: "Measure ANN recall against a flat exact index on a sample of your corpus.\n" +
        "To measure the recall of an approximate nearest neighbour index, build a flat index over a sample, run the same queries through both, and report the overlap of the top-k results.\n" +
        "The quarterly report notes that the team has continued to deliver against the roadmap, that the migration remains on schedule, and that the remaining work has been scoped for the following quarter with no material change to the plan.\n" +
        "Pineapples.\n" +
        "Chunking strategy decides what a retrieved passage even contains.",
    });
    var dims = h.range({ label: "hash dimensions", min: 16, max: 512, step: 16, value: 64 });
    var unitv = h.select({
      label: "normalise", value: "0",
      options: [["0", "off — raw counts"], ["1", "on — unit vectors"]],
    });

    var MAX_DOCS = 8;

    h.on(function () {
      var d = Number(dims.value);
      if (!isFinite(d) || d < 1) d = 64;

      // --- the toy embedding: character trigrams, hashed into d dims -----
      // n counts every trigram occurrence; uniq counts distinct trigrams; coll
      // counts how many *distinct* trigrams landed in an already-occupied
      // bucket, so coll is only ever meaningful against uniq, never against n.
      function embed(s) {
        var v = [], seen = {}, taken = {}, n = 0, uniq = 0, coll = 0, i;
        for (i = 0; i < d; i++) v.push(0);
        var t = " " + String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ")
          .replace(/^\s+|\s+$/g, "") + " ";
        for (i = 0; i + 3 <= t.length; i++) {
          var g = t.slice(i, i + 3), x = 2166136261;
          for (var c = 0; c < 3; c++) x = (x * 31 + g.charCodeAt(c)) >>> 0;
          x = (x * 1664525 + 1013904223) >>> 0;      // avalanche; stays 32-bit exact
          var k = x % d;
          v[k] += 1; n++;
          if (!seen[g]) { seen[g] = 1; uniq++; if (taken[k]) coll++; else taken[k] = 1; }
        }
        var sq = 0;
        for (i = 0; i < d; i++) sq += v[i] * v[i];
        return { v: v, len: Math.sqrt(sq), n: n, uniq: uniq, coll: coll };
      }
      function scaled(e, on) {
        if (!on) return e.v;
        var s = [], L = e.len || 1, i;
        for (i = 0; i < d; i++) s.push(e.v[i] / L);
        return s;
      }

      var q = embed(query.value);
      if (!q.len) {
        h.render(h.note("Type a query containing at least one letter or digit.", "warn"));
        return;
      }

      // Keep only lines that actually produce a trigram. A punctuation-only line
      // has the zero vector: its cosine is undefined, but its Euclidean distance
      // to the query is a perfectly ordinary number, so leaving it in would put a
      // document with no overlap at all partway up the Euclidean ranking and
      // break the very identity the normalised view is here to demonstrate.
      var typed = String(corpus.value || "").split("\n")
        .map(function (s) { return s.replace(/^\s+|\s+$/g, ""); })
        .filter(function (s) { return s.length > 0; });
      var kept = [], empties = 0, seenLines = 0;
      while (seenLines < typed.length && kept.length < MAX_DOCS) {
        var de = embed(typed[seenLines]);
        if (de.n) kept.push({ text: typed[seenLines], e: de }); else empties++;
        seenLines++;
      }
      var over = typed.length - seenLines;
      if (kept.length < 2) {
        h.render(h.note("Give at least two documents, one per line, each with a letter " +
          "or digit in it.", "warn"));
        return;
      }

      var unit = unitv.value === "1", qs = scaled(q, unit);
      var rows = kept.map(function (doc) {
        var e = doc.e, es = scaled(e, unit), dp = 0, sq = 0, raw = 0, i;
        for (i = 0; i < d; i++) {
          dp += qs[i] * es[i];
          sq += (qs[i] - es[i]) * (qs[i] - es[i]);
          raw += q.v[i] * e.v[i];
        }
        return {
          text: doc.text, n: e.n, len: e.len, coll: e.coll, dot: dp,
          euc: Math.sqrt(sq), cos: raw / (q.len * e.len),
        };
      });

      // Ranking is deterministic: differences at the level of float noise count
      // as ties (normalised dot is cosine to within rounding, and must never be
      // painted as disagreeing over the last bit), and ties fall back to input
      // order. A non-finite score compares as a tie rather than scrambling sort.
      function ranks(key, asc) {
        var order = [], out = [], i;
        for (i = 0; i < rows.length; i++) order.push(i);
        order.sort(function (a, b) {
          var x = rows[a][key], y = rows[b][key], t;
          if (!asc) { t = x; x = y; y = t; }
          var diff = x - y;
          if (!(Math.abs(diff) > 1e-12 * (Math.abs(x) + Math.abs(y) + 1))) return a - b;
          return diff < 0 ? -1 : 1;
        });
        order.forEach(function (ix, p) { out[ix] = p + 1; });
        return out;
      }
      var rc = ranks("cos", false), rd = ranks("dot", false), re = ranks("euc", true);
      var wc = rc.indexOf(1), wd = rd.indexOf(1), we = re.indexOf(1);
      function cell(v, dec, r) { return h.fmt(v, dec) + (r === 1 ? " <b>#1</b>" : " #" + r); }

      var skipped = "";
      if (empties || over > 0) {
        skipped = h.note("Ranking " + h.fmt(kept.length) + " of " + h.fmt(typed.length) +
          " lines" + (empties ? " — " + h.fmt(empties) + " held no letter or digit, so " +
          "they have no vector to compare" : "") +
          (over > 0 ? (empties ? "; " : " — ") + "the last " + h.fmt(over) +
          " are past the " + h.fmt(MAX_DOCS) + "-document limit" : "") + ".", "warn");
      }

      h.render(
        h.big("#" + (wc + 1), "cosine ranks this document first", "ok") +
        h.big("#" + (wd + 1), "dot product ranks this one first", wd === wc ? "ok" : "bad") +
        h.big("#" + (we + 1), "Euclidean distance ranks this one first", we === wc ? "ok" : "bad") +
        skipped +
        h.table(["#", "document", "trigrams", "‖d‖", "cosine ↑", "dot ↑", "euclid ↓"],
          rows.map(function (r, ix) {
            return [
              String(ix + 1),
              h.esc(r.text.length > 44 ? r.text.slice(0, 44) + "…" : r.text),
              h.fmt(r.n), h.fmt(r.len, 1),
              cell(r.cos, 3, rc[ix]),
              cell(r.dot, unit ? 3 : 0, rd[ix]),
              cell(r.euc, unit ? 3 : 1, re[ix]),
            ];
          })) +
        h.bars(rows.map(function (r, ix) {
          return {
            label: "doc #" + (ix + 1), value: Math.max(0, r.cos), max: 1,
            text: h.fmt(r.cos, 3), flag: rc[ix] === 1 ? "ok" : null,
          };
        })) +
        (unit
          ? h.note("Normalised, <b>dot product is cosine</b>, and Euclidean distance is " +
              "√(2−2·cos) — a monotone function of it. Three metrics, one ranking. That identity " +
              "is why an index can store unit vectors and search with plain inner product.")
          : h.note("Unnormalised, dot product rewards magnitude and magnitude tracks length, so a " +
              "long irrelevant document outscores a short exact answer. Euclidean has the opposite " +
              "bias — short vectors sit near the origin, so the shortest line wins whatever it says. " +
              "Only cosine divides both out.", "bad")) +
        h.row("‖query‖", h.fmt(q.len, 2)) +
        h.row("distinct query trigrams sharing a bucket",
          h.fmt(q.coll) + " of " + h.fmt(q.uniq),
          q.coll * 4 > q.uniq ? "warn" : "ok") +
        h.note("Now move <b>hash dimensions</b>: collisions fall away and every score moves " +
          "with them — the trend is downward, but it is not smooth, because which trigrams " +
          "happen to share a bucket changes at every width. Same texts, same algorithm, " +
          "different numbers — which is why a cosine score has no absolute meaning and a " +
          "fixed relevance threshold cannot survive a change of model.")
      );
    });
  }

  // ======================================================================
  // LAB · bm25  (reranking.md)
  // ======================================================================
  function bm25(host, h) {
    h.panel({
      title: "BM25, over documents you type",
      note: "Every number is the real formula: IDF from these documents' own frequencies, " +
        "the k1 saturation term, and the b length penalty measured against this corpus's " +
        "average length. The default corpus is rigged to show both effects — <b>D2</b> says " +
        "<i>cat</i> eight times and still loses, <b>D3</b> contains every query term but is " +
        "padded to 20 words. Push <b>k1</b> to 3.5 and the keyword-stuffed document takes " +
        "first place; drag <b>b</b> to 0 and the padded one does. Those two failures are the " +
        "argument for a second stage.",
    });
    var qIn = h.text({ label: "query", wide: true, value: "the cat mat" });
    var docsIn = h.textarea({
      label: "candidate documents — one per line",
      rows: 6,
      value: "the cat sat on the mat\n" +
        "cat cat cat cat cat cat cat cat\n" +
        "the dog chased the cat around the garden while the mat stayed rolled up in the hall cupboard for weeks\n" +
        "the mat is a flat piece of woven fabric\n" +
        "the dog barked at the postman\n" +
        "the weather forecast for the weekend is dry",
    });
    var k1In = h.range({ label: "k1 — saturation", min: 0, max: 5, step: 0.1, value: 1.2, decimals: 1 });
    var bIn = h.range({ label: "b — length penalty", min: 0, max: 1, step: 0.05, value: 0.75, decimals: 2 });

    var MAX_DOCS = 500, MAX_BARS = 12;

    h.on(function () {
      // Words, accents kept — punctuation is a separator, as in any lexical index.
      // Escapes rather than literal accented characters, so the character range
      // survives a mis-declared source encoding.
      function tok(s) {
        return String(s).toLowerCase()
          .match(/[0-9a-zÀ-ɏͰ-ϿЀ-ӿ]+/g) || [];
      }
      // Every dictionary below is keyed through this. The tokenizer can never
      // produce a "#", so a document or query word like "constructor" cannot
      // collide with something inherited from Object.prototype.
      function key(w) { return "#" + w; }
      function tokens(n) { return h.fmt(n, 0) + (n === 1 ? " token" : " tokens"); }

      // --- index the corpus ---------------------------------------------
      var lines = docsIn.value.split(/\r\n|\r|\n/), docs = [], skipped = 0, i, j, kk;
      for (i = 0; i < lines.length; i++) {
        var t = tok(lines[i]);
        if (!t.length) continue;
        if (docs.length >= MAX_DOCS) { skipped++; continue; }
        var tf = {};
        for (j = 0; j < t.length; j++) { kk = key(t[j]); tf[kk] = (tf[kk] || 0) + 1; }
        docs.push({ n: docs.length + 1, text: lines[i].replace(/^\s+|\s+$/g, ""), tf: tf, len: t.length });
      }
      var qraw = tok(qIn.value), seen = {}, terms = [];
      for (i = 0; i < qraw.length; i++) {
        kk = key(qraw[i]);
        if (!seen[kk]) { seen[kk] = 1; terms.push(qraw[i]); }
      }
      if (!docs.length) { h.render(h.note("Type at least one document — one per line.", "warn")); return; }
      if (!terms.length) {
        h.render(h.note(/\S/.test(qIn.value)
          ? "No indexable words in that query. This index keeps letters and digits and " +
            "treats everything else as a separator, so punctuation alone matches nothing."
          : "Type a query.", "warn"));
        return;
      }

      var N = docs.length, total = 0;
      for (i = 0; i < N; i++) total += docs[i].len;
      var avgdl = total / N;                       // every doc has >= 1 token, so avgdl > 0
      var k1 = Number(k1In.value), b = Number(bIn.value);
      if (!(k1 >= 0)) k1 = 0;                      // also rejects NaN
      if (!(b >= 0)) b = 0;
      if (b > 1) b = 1;

      // --- IDF = ln(1 + (N − df + 0.5) / (df + 0.5)) ---------------------
      var idf = {};
      for (i = 0; i < terms.length; i++) {
        var df = 0;
        for (j = 0; j < N; j++) if (docs[j].tf[key(terms[i])]) df++;
        idf[key(terms[i])] = { df: df, v: Math.log(1 + (N - df + 0.5) / (df + 0.5)) };
      }

      // --- score = Σ IDF · f(k1+1) / (f + k1(1 − b + b·|D|/avgdl)) -------
      var scored = [];
      for (i = 0; i < N; i++) {
        var d = docs[i], K = k1 * (1 - b + b * d.len / avgdl), parts = [], s = 0;
        for (j = 0; j < terms.length; j++) {
          var f = d.tf[key(terms[j])] || 0;
          // f === 0 short-circuits: at k1 = 0 the denominator is 0 too, and the
          // textbook expression would hand the user a NaN.
          var sat = f ? (f * (k1 + 1)) / (f + K) : 0;
          var c = sat * idf[key(terms[j])].v;
          parts.push({ term: terms[j], f: f, sat: sat, c: c });
          s += c;
        }
        scored.push({ n: d.n, text: d.text, len: d.len, K: K, parts: parts, score: s });
      }
      var ranked = scored.sort(function (a, c) { return c.score - a.score; });
      var top = ranked[0];
      if (top.score <= 0) {
        h.render(h.note("No document contains any of <b>" + h.esc(terms.join(", ")) +
          "</b>, so every score is 0. BM25 is lexical: a passage that says the same thing " +
          "in other words is invisible to it.", "warn"));
        return;
      }

      // In a document of exactly average length K = k1, so one occurrence scores
      // (k1+1)/(1+k1) = 1 and eight score 8(k1+1)/(8+k1) — the saturation curve.
      var ratio = (8 * (k1 + 1)) / (8 + k1);
      var shown = ranked.slice(0, MAX_BARS);

      h.render(
        h.big(top.score.toFixed(3), "top score — D" + top.n + ", " + tokens(top.len), "ok") +
        h.bars(shown.map(function (d, r) {
          return {
            label: "D" + d.n + " · " + h.esc(d.text.slice(0, 32)) + (d.text.length > 32 ? "…" : ""),
            value: d.score, max: top.score, text: d.score.toFixed(3),
            flag: r === 0 ? "ok" : (d.score === 0 ? "bad" : ""),
          };
        })) +
        (ranked.length > shown.length
          ? h.note("Showing the top " + h.fmt(shown.length, 0) + " of " + h.fmt(ranked.length, 0) +
            " scored documents.")
          : "") +
        h.note("BM25 scores rank; they do not measure — the scale has no ceiling and means nothing " +
          "across queries, which is why two retrieval lists are fused by rank rather than by adding " +
          "scores. The IDF column is the standard ln(1 + (N − df + 0.5)/(df + 0.5)): a term in " +
          "nearly every document lands near zero, and that is the whole of stopword handling here.") +
        h.table(["query term", "df", "IDF", "tf in D" + top.n, "saturated tf", "contribution"],
          top.parts.map(function (p) {
            return ["<code>" + h.esc(p.term) + "</code>", h.fmt(idf[key(p.term)].df, 0),
              idf[key(p.term)].v.toFixed(3), h.fmt(p.f, 0), p.sat.toFixed(3), p.c.toFixed(3)];
          })) +
        h.row("documents · average length", h.fmt(N, 0) + " · " + avgdl.toFixed(1) + " tokens") +
        (skipped
          ? h.row("lines past the " + h.fmt(MAX_DOCS, 0) + "-document limit, not indexed",
            h.fmt(skipped, 0), "warn")
          : "") +
        h.row("length divisor for D" + top.n,
          k1.toFixed(1) + "(1 − " + b.toFixed(2) + " + " + b.toFixed(2) + "·" +
          top.len + "/" + avgdl.toFixed(1) + ") = " + top.K.toFixed(3),
          top.K > k1 ? "warn" : "ok") +
        h.row("eight occurrences of a term, in an average-length document, are worth",
          ratio.toFixed(2) + "× one occurrence", ratio < 2.5 ? "ok" : "warn")
      );
    });
  }

  // ======================================================================
  // LAB · quantize  (quantization.md)
  // ======================================================================
  function quantize(host, h) {
    h.panel({
      title: "Quantize a weight vector, and watch one outlier eat the range",
      note: "This is the affine quantizer from section 2, run for real: the scale and " +
        "zero-point are fitted to your numbers, every weight is rounded to an integer code, " +
        "and <code>scale × (q − zero_point)</code> brings it back. The default vector hides one " +
        "weight about 20× larger than any other. <b>Do this in order:</b> read the per-tensor " +
        "damage at INT4, then delete <code>9.20</code> from the list and watch the error " +
        "collapse — then put it back and switch to <b>per-block</b>, which does not remove the " +
        "damage but confines it to the one block the outlier sits in.",
    });
    var txt = h.textarea({
      label: "weights — one tensor, any separator",
      rows: 3,
      value: "0.12 -0.35 0.44 -0.08   0.21 -0.51 0.33 9.20   -0.17 0.06 0.29 -0.42   0.15 -0.23 0.38 -0.11",
    });
    var bits = h.select({
      label: "bits", value: "4",
      options: [["8", "INT8 — 256 codes"], ["4", "INT4 — 16 codes"], ["2", "INT2 — 4 codes"]],
    });
    var scheme = h.select({
      label: "granularity", value: "tensor",
      options: [["tensor", "per-tensor — one scale"], ["block", "per-block — one scale each"]],
    });
    var bsz = h.range({ label: "block size", min: 2, max: 32, step: 2, value: 4 });

    var CAP = 48;

    function num(x) {
      var a = Math.abs(x);
      if (!isFinite(x)) return "—";
      if (a === 0) return "0";
      if (a < 1e-3 || a >= 1e5) return x.toExponential(2);
      return x.toFixed(a < 1 ? 4 : a < 100 ? 3 : 1);
    }

    /**
     * The real affine quantizer.
     *   scale = (max − min) / qmax,  zero_point = round(−min / scale)
     *   q = clamp(round(w / scale) + zero_point, 0, qmax),  ŵ = scale × (q − zero_point)
     * size = block length; size >= vals.length is per-tensor.
     * norm rescales the error sum so squaring cannot overflow on extreme inputs.
     */
    function run(vals, b, size, norm) {
      var qmax = Math.pow(2, b) - 1, deq = [], blocks = [], s, i;
      if (!(size >= 1)) size = vals.length;          // never let the loop stall
      size = Math.floor(size);
      if (!(norm > 0) || !isFinite(norm)) norm = 1;
      for (s = 0; s < vals.length; s += size) {
        var seg = vals.slice(s, s + size);
        var lo = Math.min.apply(null, seg), hi = Math.max.apply(null, seg);
        var mn = Math.min(0, lo), mx = Math.max(0, hi);   // 0 must stay representable
        var scale = (mx - mn) / qmax;
        if (!(scale > 0)) scale = 1;                      // degenerate: every value identical
        var zp = Math.round(-mn / scale);
        if (!(zp >= 0)) zp = 0;
        if (zp > qmax) zp = qmax;
        var su = 0, seen = {}, codes = 0;
        for (i = 0; i < seg.length; i++) {
          var q = Math.round(seg[i] / scale) + zp;
          if (q < 0) q = 0;
          if (q > qmax) q = qmax;
          var d = scale * (q - zp);
          if (!seen[q]) { seen[q] = 1; codes++; }
          deq.push(d);
          var u = (seg[i] - d) / norm;
          su += u * u;
        }
        blocks.push({ lo: lo, hi: hi, scale: scale, zp: zp, codes: codes,
                      rmse: norm * Math.sqrt(su / seg.length) });
      }
      var tot = 0, rel = 0, rn = 0, dead = 0;
      for (i = 0; i < vals.length; i++) {
        var e = (vals[i] - deq[i]) / norm;
        tot += e * e;
        if (vals[i] !== 0 && deq[i] === 0) dead++;         // rounded onto the zero code
        if (Math.abs(vals[i]) > 1e-12) {
          rel += Math.abs(vals[i] - deq[i]) / Math.abs(vals[i]);
          rn++;
        }
      }
      return { deq: deq, blocks: blocks, qmax: qmax, dead: dead,
               rmse: norm * Math.sqrt(tot / vals.length), rel: rn ? rel / rn : 0 };
    }

    h.on(function () {
      var raw = txt.value.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
      var vals = [], dropped = 0, i;
      for (i = 0; i < raw.length; i++) {
        var v = parseFloat(raw[i]);
        if (!isFinite(v)) continue;                       // 1e400 and friends
        if (vals.length < CAP) vals.push(v); else dropped++;
      }
      if (vals.length < 2) {
        h.render(h.note("Type at least two numbers — the quantizer needs a vector to fit a scale to.", "warn"));
        return;
      }
      var b = Number(bits.value);
      if (!(b >= 1 && b <= 16)) b = 4;
      var n = vals.length;
      var bs = Math.floor(Number(bsz.value));
      if (!(bs >= 2)) bs = 2;
      if (bs > n) bs = n;

      var mag = vals.map(function (x) { return Math.abs(x); }).sort(function (x, y) { return x - y; });
      var top = mag[n - 1];
      var med = n % 2 ? mag[(n - 1) / 2] : (mag[n / 2 - 1] + mag[n / 2]) / 2;
      var ratio = med > 0 ? top / med : Infinity;
      var outlier = med > 0 ? ratio > 8 : top > 0;        // median 0 ⇒ unbounded, not 9.2e12
      var ratioTxt = med > 0
        ? (ratio >= 1e4 ? ratio.toExponential(1) + "×" : ratio.toFixed(1) + "×")
        : (top > 0 ? "unbounded — half the weights are exactly 0" : "—");

      var perT = run(vals, b, n, top), perB = run(vals, b, bs, top);
      var block = scheme.value === "block";
      var cur = block ? perB : perT, grp = block ? bs : n;
      var eff = b + 24 / grp;               // FP16 scale + INT8 zero-point, charged per block
      var oneBlock = cur.blocks.length === 1;
      var flag = cur.rel > 0.30 ? "bad" : (cur.rel > 0.10 ? "warn" : "ok");

      h.render(
        (dropped
          ? h.note("Only the first " + CAP + " numbers are quantized — <b>" + dropped +
              "</b> more were ignored, so every figure below describes that " + CAP +
              "-weight prefix.", "warn")
          : "") +
        h.big(num(cur.rmse), "RMSE of the round-trip", flag) +
        h.big((100 * cur.rel).toFixed(1) + "%", "mean error, relative to the weight", flag) +
        h.big(cur.dead + " / " + n, "weights flattened to exactly 0",
          cur.dead > n / 4 ? "bad" : (cur.dead ? "warn" : "ok")) +
        h.bars(vals.map(function (w, k) {
          var e = Math.abs(w - cur.deq[k]);
          var r = Math.abs(w) > 1e-12 ? e / Math.abs(w) : 0;
          return { label: num(w), value: e, text: num(cur.deq[k]) + " &nbsp; " + (100 * r).toFixed(0) + "%",
                   flag: r > 0.5 ? "bad" : (r > 0.15 ? "warn" : "ok") };
        })) +
        h.note("Bar length is the absolute error on that weight; the percentage is the error " +
          "relative to the weight itself, which is what the next matmul actually feels.") +
        h.row("per-tensor RMSE — one scale for all " + n, num(perT.rmse),
          perT.rmse > perB.rmse * 1.5 ? "bad" : "ok") +
        h.row("per-block RMSE — one scale per " + bs, num(perB.rmse),
          perB.rmse > perT.rmse ? "warn" : "ok") +
        h.row("outlier ratio — max|w| / median|w|", ratioTxt, outlier ? "bad" : "ok") +
        h.row("stored bits/weight — codes plus scale &amp; zero-point",
          eff.toFixed(2) + " &nbsp; (" + (16 / eff).toFixed(2) + "× smaller than FP16)") +
        h.table(["block", "min … max", "scale (step)", "zero-point", "codes used", "RMSE"],
          cur.blocks.slice(0, 12).map(function (bl, k) {
            return [String(k + 1), "<code>" + num(bl.lo) + " … " + num(bl.hi) + "</code>",
                    num(bl.scale), String(bl.zp), bl.codes + " / " + (cur.qmax + 1), num(bl.rmse)];
          })) +
        (cur.blocks.length > 12
          ? h.note("Showing the first 12 of " + cur.blocks.length + " blocks.")
          : "") +
        h.note(block
          ? (oneBlock
              ? "Block size <b>" + bs + "</b> covers all " + n + " weights, so this <i>is</i> " +
                "per-tensor under another name — the numbers above are identical to it. Drag " +
                "<b>block size</b> down, or type a longer vector, to see the tensor actually split."
              : "Each of these " + cur.blocks.length + " blocks fits its own scale, so the outlier " +
                "ruins <b>only its own block</b> and the rest recover — which is the argument in " +
                "section 6, and why block-scaled formats made 4-bit practical. Note it is confined, " +
                "not repaired: its block is still as bad as the whole tensor was.")
          : "One scale has to span <b>" + num(cur.blocks[0].lo) + " … " + num(cur.blocks[0].hi) +
            "</b>, so the step is <b>" + num(cur.blocks[0].scale) + "</b> and every weight below half " +
            "a step rounds onto the zero code. That is the outlier result, on a vector you can edit.",
          block ? (oneBlock ? "warn" : "ok") : (outlier ? "bad" : "ok")) +
        h.note("Scale and zero-point cost 16 + 8 = 24 bits and every block pays them, so at block " +
          "size <b>" + grp + "</b> that is " + (24 / grp).toFixed(2) + " extra bits on top of " + b +
          " — <b>" + eff.toFixed(2) + "</b> bits/weight stored. That is the real trade: block size 32 " +
          "is the usual compromise (4 + 0.75 = 4.75 bits at INT4), small enough to contain an outlier, " +
          "large enough that the scale is nearly free. Spread over a real tensor the per-tensor " +
          "overhead rounds to nothing — the blocks are what you pay for, and the RMSE column is what " +
          "you buy.")
      );
    });
  }

  // ======================================================================
  // LAB · needle  (long-context.md)
  // ======================================================================
  function needle(host, h) {
    h.panel({
      title: "The needle map your assumptions already imply",
      note: "Nothing here calls a model. You state a recall curve — what a doubling past the " +
        "trained length costs, and how far the middle sags below the ends — and the grid is " +
        "the published <b>lost-in-the-middle</b> shape that curve implies at every (length, " +
        "depth) a needle test would probe. Drag <b>dip severity</b> to 0: every column goes " +
        "flat, the world where position stops mattering and only total length does. Take " +
        "<b>decay</b> to 0 as well and the whole map reads 1.00 — the advertised claim. Put " +
        "both back, then compare the <b>0%</b> row of the grid with <b>mean over all 11 " +
        "depths</b>: a needle hidden at either end reports 1.8× the honest average, which is " +
        "why where you hide it decides what you get to conclude.",
    });

    var LEN = [4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288];
    function kLab(n) { return (n / 1024) + "k"; }

    var lenSel = h.select({
      label: "probe length", value: "131072",
      options: LEN.map(function (n) { return [String(n), kLab(n) + " tokens"]; }),
    });
    var depth = h.range({ label: "needle depth", min: 0, max: 100, step: 10, value: 50, unit: "%" });
    var sev = h.range({ label: "dip severity", min: 0, max: 1, step: 0.05, value: 0.55, decimals: 2 });
    var trainSel = h.select({
      label: "length actually trained on", value: "8192",
      options: [2048, 4096, 8192, 16384, 32768, 131072].map(function (n) { return [String(n), kLab(n)]; }),
    });
    var decay = h.range({ label: "decay weight per doubling past that", min: 0, max: 0.5, step: 0.01, value: 0.2, decimals: 2 });

    h.on(function () {
      var L = Number(lenSel.value), T = Number(trainSel.value);
      var s = Number(sev.value), a = Number(decay.value), d = Number(depth.value) / 100;
      if (!isFinite(L) || L <= 0 || !isFinite(T) || T <= 0 ||
          !isFinite(s) || !isFinite(a) || !isFinite(d)) {
        h.render(h.note("Pick a probe length, a trained length and a depth.", "warn"));
        return;
      }
      // keep the stated parameters inside the range the formula is defined on:
      // a < 0 could zero the denominator below, s and d outside [0,1] are meaningless.
      if (s < 0) s = 0; else if (s > 1) s = 1;
      if (a < 0) a = 0;
      if (d < 0) d = 0; else if (d > 1) d = 1;
      var depthPct = Math.round(d * 100);

      // --- the recall curve, stated once and used for every cell ----------
      function doublingsAt(len) {                   // how far past the trained length
        var n = len > 0 ? Math.log(len / T) / Math.LN2 : 0;
        return !isFinite(n) || n < 0 ? 0 : n;       // never below 0, never NaN/∞
      }
      function shrinkAt(len) {                      // uniform: paid at every depth
        return 1 / (1 + a * doublingsAt(len));      // a >= 0, so the denominator is >= 1
      }
      function dipAt(len) {                         // middle-only, and it deepens
        return Math.min(1, s * (2 - shrinkAt(len)));
      }
      function recall(len, dd) {
        var w = Math.sin(Math.PI * dd);             // Math.sin(Math.PI) is 1.2e-16, not 0 —
        if (!(w > 1e-12)) w = 0;                    // snap it so both ends read identically
        var r = shrinkAt(len) * (1 - dipAt(len) * w);
        if (!isFinite(r)) return 0;
        return r < 0 ? 0 : (r > 1 ? 1 : r);
      }
      function flagOf(v) { return v >= 0.9 ? "ok" : (v >= 0.5 ? "warn" : "bad"); }
      var D = [], i;
      for (i = 0; i <= 10; i++) D.push(i / 10);

      // --- the grid a needle test probes: rows are depths, columns lengths -
      var grid = '<div class="lab__grid" style="grid-template-columns:auto repeat(' + LEN.length + ',1fr)">';
      grid += '<div class="lab__gh">depth</div>';
      LEN.forEach(function (n) { grid += '<div class="lab__gh">' + kLab(n) + "</div>"; });
      D.forEach(function (dd, ri) {
        grid += '<div class="lab__gl">' + (ri * 10) + "%</div>";
        LEN.forEach(function (n) {
          var v = recall(n, dd), pick = n === L && ri * 10 === depthPct;
          grid += '<div class="lab__cell" style="--w:' + v.toFixed(3) +
            (pick ? ";outline:2px solid currentColor;outline-offset:-2px" : "") +
            '" title="' + kLab(n) + " · depth " + (ri * 10) + "% · recall " + v.toFixed(2) +
            '"><span>' + v.toFixed(2) + "</span></div>";
        });
      });
      grid += "</div>";

      var probe = recall(L, d), ends = recall(L, 0), sum = 0;
      D.forEach(function (dd) { sum += recall(L, dd); });
      var mean = sum / D.length;
      // three facts dropped at independent random depths: E[R1·R2·R3] = mean³.
      var three = Math.pow(mean, 3);
      var over = mean > 0 ? ends / mean : Infinity;
      var stretch = doublingsAt(L);

      h.render(
        h.big(probe.toFixed(2), "modelled recall — " + kLab(L) + " context, needle at " +
          depthPct + "% depth", flagOf(probe)) +
        grid +
        h.note("Every cell is <code>R = shrink × (1 − dip × sin πd)</code>, where " +
          "<code>shrink = 1 / (1 + decay × doublings)</code> is paid at every depth and " +
          "<code>dip = severity × (2 − shrink)</code> is charged only to the middle — which is " +
          "how the sag deepens as the window is stretched. Each doubling adds <code>decay</code> " +
          "to that denominator rather than multiplying, so the first doubling past the trained " +
          "length is the expensive one. Read a column down for the lost-in-the-middle shape, a " +
          "row across for what one more doubling costs.") +
        h.bars(D.map(function (dd, ri) {
          var v = recall(L, dd);
          return { label: (ri * 10) + "%", value: v, max: 1, text: v.toFixed(2), flag: flagOf(v) };
        })) +
        h.row("needle at either end (0% or 100%)", ends.toFixed(2), flagOf(ends)) +
        h.row("mean over all 11 depths — the honest summary", mean.toFixed(2), flagOf(mean)) +
        h.row("what an end-placed probe over-reports by",
          isFinite(over) ? over.toFixed(2) + "×" : "—",
          isFinite(over) && over > 1.25 ? "warn" : "ok") +
        h.row("doublings past the trained length", stretch.toFixed(2) + " → shrink " +
          shrinkAt(L).toFixed(3) + ", dip " + dipAt(L).toFixed(3)) +
        h.row("three facts at random depths, all recalled (mean R³, if independent)",
          three.toFixed(3), flagOf(three)) +
        h.note("No model was queried and no token was read: this is a <b>shape</b> — the one " +
          "Liu et al. reported — drawn from parameters you chose. It is worth something for " +
          "deciding where to hide needles and nothing as evidence about a particular model. " +
          "The grid that settles that is the one you run yourself.", "warn")
      );
    });
  }

  // ======================================================================
  // LAB · chunker  (chunking.md)
  // ======================================================================
  function chunker(host, h) {
    h.panel({
      title: "Chunk your own text three ways",
      note: "Every chunk below is really cut from the text in the box: fixed character windows " +
        "with overlap, whole sentences packed to a target, and paragraphs. Red chips <b>begin " +
        "mid-sentence</b> — hover one and read it, and you are looking at the split-referent " +
        "failure from the diagram. Then drag <b>overlap</b> up until no sentence is lost any " +
        "more, and watch the duplication figure pay for it.",
    });
    var txt = h.textarea({
      label: "document — re-chunked on every keystroke",
      rows: 6,
      value:
        "The maximum operating temperature is 810 °C. Above this, the seal " +
        "degrades within hours and the unit must be taken offline.\n\n" +
        "Inspection is quarterly. Replace the seal if any discolouration is " +
        "visible around the flange. The log stays with the unit for its whole " +
        "service life.",
    });
    var size = h.range({ label: "chunk size", min: 60, max: 400, step: 10, value: 120, unit: " chars" });
    var lap = h.range({ label: "overlap", min: 0, max: 200, step: 10, value: 30, unit: " chars" });

    // A terminator closes a sentence when the next thing is whitespace or the end
    // of the paragraph — but a closing quote or bracket may sit in between, so
    // `He said "stop." Then...` splits in two. Without this, "3.5" and "810 °C."
    // still do not become boundaries, which is the point of the rule.
    var CLOSERS = "\"')]}”’»";
    var ENDERS = ".!?";

    h.on(function () {
      var text = txt.value.replace(/\r/g, "").slice(0, 20000);   // it re-runs per keystroke
      if (!/\S/.test(text)) { h.render(h.note("Paste a document — a few sentences is enough.", "warn")); return; }
      // The sliders cannot hand us anything but a number, but the arithmetic below
      // divides by these, so clamp rather than trust and render NaN at the reader.
      function num(v, dflt) { var x = Number(v); return isFinite(x) ? x : dflt; }
      var C = Math.max(1, Math.round(num(size.value, 120)));
      var O = Math.max(0, Math.round(num(lap.value, 30)));
      var step = Math.max(10, C - O);          // O ≥ C would stand still; hold it at 10

      // --- the text as spans: paragraphs, then sentences inside them -------
      var paras = [], m, re = /\S[\s\S]*?(?=\n[ \t]*\n|$)/g;
      while ((m = re.exec(text))) {
        var a = m.index, b = a + m[0].length;
        while (b > a && /\s/.test(text.charAt(b - 1))) b--;
        paras.push({ start: a, end: b });
      }
      var sents = [], longest = 0;
      paras.forEach(function (p) {
        var i = p.start, st = p.start, j, e;
        while (i < p.end) {
          if (ENDERS.indexOf(text.charAt(i)) < 0) { i++; continue; }
          for (j = i; j + 1 < p.end && ENDERS.indexOf(text.charAt(j + 1)) >= 0; j++) {}
          for (e = j + 1; e < p.end && CLOSERS.indexOf(text.charAt(e)) >= 0; e++) {}
          if (e < p.end && !/\s/.test(text.charAt(e))) { i = j + 1; continue; }
          sents.push({ start: st, end: e });
          for (i = e; i < p.end && /\s/.test(text.charAt(i)); i++) {}
          st = i;
        }
        if (st < p.end) sents.push({ start: st, end: p.end });
      });
      sents.forEach(function (s) { longest = Math.max(longest, s.end - s.start); });

      // Painted once, so "is this offset inside a sentence?" is a lookup rather
      // than a scan of every sentence for every chunk on every keystroke.
      var inside = new Array(text.length + 1), z;
      for (z = 0; z <= text.length; z++) inside[z] = 0;
      sents.forEach(function (s) { for (var k = s.start + 1; k < s.end; k++) inside[k] = 1; });

      // --- the three strategies --------------------------------------------
      var fixed = [], q;
      for (q = 0; q < text.length; q += step) {
        fixed.push({ start: q, end: Math.min(text.length, q + C) });
        if (q + C >= text.length) break;
      }
      var packed = [], cur = null;                  // whole sentences, greedy to C
      sents.forEach(function (s) {
        if (cur && s.end - cur.start > C) { packed.push(cur); cur = null; }
        if (cur) cur.end = s.end; else cur = { start: s.start, end: s.end };
      });
      if (cur) packed.push(cur);

      // --- metrics -----------------------------------------------------------
      function tok(c) { return Math.max(1, Math.round((c.end - c.start) / 4)); }
      function plural(n, w) { return h.fmt(n) + " " + w + (n === 1 ? "" : "s"); }
      function mid(pos) { return inside[pos] === 1; }   // pos falls inside a sentence?
      function stats(cs) {
        var sum = 0, open = 0, lo = Infinity, hi = 0, i, t;
        for (i = 0; i < cs.length; i++) {
          t = tok(cs[i]); sum += cs[i].end - cs[i].start;
          if (t < lo) lo = t;
          if (t > hi) hi = t;
          if (mid(cs[i].start)) open++;
        }
        var lost = sents.filter(function (s) {      // held whole by no chunk at all
          for (var k = 0; k < cs.length; k++) if (cs[k].start <= s.start && cs[k].end >= s.end) return false;
          return true;
        });
        return { n: cs.length, open: open, lost: lost, dup: sum / text.length,
          lo: cs.length ? lo : 0, hi: hi };
      }
      var F = stats(fixed), S = stats(packed), P = stats(paras), shown = fixed.slice(0, 40);
      function cell(n) { return '<b style="color:var(--' + (n ? "bad" : "good") + ')">' + h.fmt(n) + "</b>"; }
      function span(s) { return h.fmt(s.lo) + "–" + h.fmt(s.hi); }

      h.render(
        h.big(h.fmt(F.n), "fixed chunks of " + h.fmt(C) + " characters") +
        h.big(h.fmt(F.lost.length), "of " + plural(sents.length, "sentence") + " held whole by no chunk",
          F.lost.length ? "bad" : "ok") +
        h.big(F.dup.toFixed(2) + "×", "the text, stored and embedded", F.dup > 1.2 ? "warn" : "ok") +
        h.chips(shown.map(function (c, i) {
          var raw = text.slice(c.start, c.end).replace(/\s+/g, " ").replace(/^ | $/g, "");
          var open = mid(c.start);
          return {
            label: "#" + (i + 1) + " " + tok(c) + "t " +
              (raw ? (raw.length > 22 ? raw.slice(0, 22) + "…" : raw) : "(blank)"),
            flag: open ? "bad" : (mid(c.end) ? "warn" : "ok"),
            title: (open ? "STARTS MID-SENTENCE · " : "") + plural(tok(c), "token") + " · " +
              (raw || "whitespace only — this chunk carries no text at all"),
          };
        })) +
        (F.n > shown.length
          ? h.note("First " + h.fmt(shown.length) + " of " + h.fmt(F.n) + " chunks shown.") : "") +
        h.note("Red begins mid-sentence, amber ends mid-sentence, green is clean at both ends. " +
          "Token counts are characters ÷ 4, the English rule of thumb, not a real tokenizer.") +
        (F.lost.length
          ? h.note("No chunk holds this sentence whole, so retrieval can never return it intact: " +
              "<b>“" + h.esc(text.slice(F.lost[0].start, Math.min(F.lost[0].end, F.lost[0].start + 110))
                .replace(/\s+/g, " ")) + "”</b>", "bad")
          : h.note("Every sentence survives whole inside some chunk — at the storage cost above.", "ok")) +
        h.row("fixed chunks beginning mid-sentence", h.fmt(F.open) + " of " + h.fmt(F.n), F.open ? "bad" : "ok") +
        h.row("duplication measured", F.dup.toFixed(3) + "×") +
        h.row("C/(C−O) predicts",
          O >= C ? "— the window never advances" : (C / (C - O)).toFixed(3) + "×",
          O >= C ? "warn" : undefined) +
        h.table(["strategy", "chunks", "tokens lo–hi", "sentences lost", "stored"],
          [["fixed, " + h.fmt(C) + "/" + h.fmt(O) + " overlap", h.fmt(F.n), span(F), cell(F.lost.length), F.dup.toFixed(2) + "×"],
           ["sentence, packed to " + h.fmt(C), h.fmt(S.n), span(S), cell(S.lost.length), S.dup.toFixed(2) + "×"],
           ["paragraph", h.fmt(P.n), span(P), cell(P.lost.length), P.dup.toFixed(2) + "×"]]) +
        (O >= C
          ? h.note("Overlap ≥ chunk size would leave the window standing still, so the step is held " +
              "at " + h.fmt(step) + " characters and C/(C−O) stops meaning anything. Overlap has to " +
              "stay a fraction of the chunk.", "warn")
          : "") +
        (longest > C
          ? h.note("Your longest sentence is " + h.fmt(longest) + " characters, longer than the chunk " +
              "size — no overlap value keeps that one whole, and the packed row has to overshoot its " +
              "target to hold it. Only a bigger chunk fixes either.", "warn")
          : "") +
        h.note("The bottom two rows lose nothing by construction; they pay in the spread of the " +
          "token column instead, and an uneven chunk is an uneven vector. They store a shade under " +
          "1.00× because the whitespace between chunks is never stored. C/(C−O) is the cost in the " +
          "limit — measured stays under it while the last chunk is a partial one."));
    });
  }

  // ======================================================================
  var LABS = {
    "tokenizer": tokenizer,
    "attention": attention,
    "sampler": sampler,
    "lora": lora,
    "prefix": prefix,
    "queue": queue,
    "config": config,
    "paged": paged,
    "gate": gate,
    "similarity": similarity,
    "bm25": bm25,
    "quantize": quantize,
    "needle": needle,
    "chunker": chunker
  };
  window.__LABS = LABS;   // later labs register into this

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll(".lab[data-lab]"), function (host) {
      var fn = LABS[host.getAttribute("data-lab")];
      if (!fn) return;
      try { fn(host, makeHelpers(host)); }
      catch (e) { host.classList.add("lab--failed"); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
