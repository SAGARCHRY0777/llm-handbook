/**
 * sims.js — simulation players, not calculators and not sandboxes.
 *
 * Three interactive primitives now live in this handbook, and the difference
 * between them is the whole point:
 *
 *   widget  moves a slider over a FORMULA.        (widgets.js)
 *   lab     runs the real ALGORITHM on your input. (labs.js)
 *   sim     plays a MECHANISM forward in TIME.     (this file)
 *
 * A sim earns its bytes only when the thing being taught genuinely unfolds
 * step by step — a cache filling, a pipeline draining its bubble, a loop
 * spending its budget. If the mechanism has no time axis, it does not get a
 * sim; it gets a lab. Faking a timeline over a static formula is the exact
 * dishonesty the labs file warns about, one dimension up.
 *
 * ---------------------------------------------------------------------------
 * AUTHORING
 *
 *   SIMS["name"] = {
 *     title: "Watch the KV cache grow",
 *     note:  "optional HTML paragraph under the title",
 *     interval: 1100,                    // optional ms per step at 1x
 *     scenarios: [
 *       {
 *         id: "grow",
 *         label: "Cache growth",         // tab label
 *         steps: [
 *           { caption: "Empty cache — press Play", ...anything },   // <- frame 0
 *           { caption: "Token 1 written", flag: "ok", ...anything },
 *         ],
 *       },
 *     ],
 *     draw: function (step, d, ctx) { return "<html>"; },
 *   };
 *
 * steps[0] is the IDLE frame. The counter reads "0 / N" where N is
 * steps.length - 1, so a 6-step scenario has 7 entries. `draw` receives the
 * current step object, the diagram helper `d`, and
 * ctx = { i, n, playing, scenario, done }.
 *
 * Put a ```sim fence naming the sim in the markdown. No build change.
 *
 * Progressive: the fence emits a labelled fallback that stays if JS never
 * runs. A sim that throws hides itself rather than taking the prose down.
 */
(function () {
  "use strict";

  var REDUCED = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  function flagCls(prefix, flag) {
    return flag ? " " + prefix + "--" + flag : "";
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ======================================================================
  // d — the diagram helper every sim draws with.
  // Everything returns an HTML string. Colours come from theme tokens via
  // classes, never inline, so both themes stay correct.
  // Valid flags throughout: "ok" | "warn" | "bad" | "idle".
  // ======================================================================
  var d = {
    esc: esc,
    fmt: fmt,

    /** Horizontal flow: items separated by arrows. Scrolls on narrow screens. */
    flow: function (items) {
      var inner = items.filter(Boolean).join('<span class="sim__arrow" aria-hidden="true">→</span>');
      return '<div class="sim__flow">' + inner + "</div>";
    },

    /** Vertical stack. */
    stack: function (items) {
      return '<div class="sim__stack">' + items.filter(Boolean).join("") + "</div>";
    },

    /** Side-by-side columns that wrap. */
    cols: function (items) {
      return '<div class="sim__cols">' + items.filter(Boolean).join("") + "</div>";
    },

    /**
     * A component card — the server box in the classic scaling diagram.
     * { title, badge, status, statusFlag, meta, gauges:[], rows:[], flag }
     */
    node: function (o) {
      var h = '<div class="sim__node' + flagCls("sim__node", o.flag) + '">';
      h += '<div class="sim__nhead">' +
        '<span class="sim__ntitle">' + esc(o.title || "") + "</span>" +
        (o.status
          ? '<span class="sim__status' + flagCls("sim__status", o.statusFlag || o.flag) + '">' +
            esc(o.status) + "</span>"
          : "") +
        "</div>";
      if (o.badge || o.meta) {
        h += '<div class="sim__nmeta">' +
          (o.badge ? '<span class="sim__badge">' + esc(o.badge) + "</span>" : "") +
          (o.meta ? "<span>" + esc(o.meta) + "</span>" : "") +
          "</div>";
      }
      if (o.gauges && o.gauges.length) {
        h += '<div class="sim__gauges">';
        for (var i = 0; i < o.gauges.length; i++) h += d.gauge(o.gauges[i]);
        h += "</div>";
      }
      if (o.rows && o.rows.length) {
        h += '<div class="sim__nrows">';
        for (var j = 0; j < o.rows.length; j++) {
          var r = o.rows[j];
          h += '<div class="sim__nrow' + flagCls("sim__nrow", r.flag) + '">' +
            "<span>" + esc(r.label) + "</span><b>" + esc(r.value) + "</b></div>";
        }
        h += "</div>";
      }
      if (o.body) h += '<div class="sim__nbody">' + o.body + "</div>";
      return h + "</div>";
    },

    /** A labelled percentage gauge. { label, pct, flag, value } */
    gauge: function (o) {
      var pct = clamp(Number(o.pct) || 0, 0, 100);
      var shown = o.value !== undefined ? o.value : Math.round(pct) + "%";
      return '<div class="sim__gauge' + flagCls("sim__gauge", o.flag) + '">' +
        '<div class="sim__glabel"><span>' + esc(o.label) + "</span><b>" + esc(shown) + "</b></div>" +
        '<div class="sim__gtrack"><i style="width:' + pct + '%"></i></div></div>';
    },

    /** A small result box — the SERVED / DROPPED tiles. */
    stat: function (o) {
      return '<div class="sim__stat' + flagCls("sim__stat", o.flag) + '">' +
        '<span class="sim__slabel">' + esc(o.label) + "</span>" +
        '<b class="sim__sval">' + esc(o.value) + "</b>" +
        (o.sub ? '<span class="sim__ssub">' + esc(o.sub) + "</span>" : "") +
        "</div>";
    },

    /** A big headline figure with a caption. */
    big: function (value, label, flag) {
      return '<div class="sim__big' + flagCls("sim__big", flag) + '">' +
        "<b>" + esc(value) + "</b><span>" + esc(label) + "</span></div>";
    },

    /**
     * A grid of small blocks. The workhorse for anything allocated or filled:
     * KV cache slots, paged blocks, context windows, batch slots.
     * cells: [{ label, flag, title }]  — label may be "" for a plain block.
     */
    cells: function (cells, o) {
      o = o || {};
      var h = "";
      if (o.label) h += '<div class="sim__clabel">' + esc(o.label) + "</div>";
      h += '<div class="sim__cells' + (o.dense ? " sim__cells--dense" : "") + '">';
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i] || {};
        h += '<span class="sim__cell' + flagCls("sim__cell", c.flag) + '"' +
          (c.title ? ' title="' + esc(c.title) + '"' : "") + ">" +
          (c.label === undefined ? "" : esc(c.label)) + "</span>";
      }
      return h + "</div>";
    },

    /**
     * A timeline lane — one row of slots against a shared time axis.
     * Built for pipeline-parallel bubble diagrams and any occupancy chart.
     * { label, cells: [{label, flag, title}] }
     */
    lane: function (o) {
      var h = '<div class="sim__lane"><span class="sim__lname">' + esc(o.label) + "</span>";
      h += '<div class="sim__lcells">';
      for (var i = 0; i < o.cells.length; i++) {
        var c = o.cells[i] || {};
        h += '<span class="sim__lcell' + flagCls("sim__lcell", c.flag) + '"' +
          (c.title ? ' title="' + esc(c.title) + '"' : "") + ">" +
          (c.label === undefined ? "" : esc(c.label)) + "</span>";
      }
      return h + "</div></div>";
    },

    /** A scatter of load particles — the incoming-traffic box. */
    dots: function (o) {
      var n = clamp(Math.round(Number(o.n) || 0), 0, 60);
      var h = '<div class="sim__dots' + flagCls("sim__dots", o.flag) + '">';
      for (var i = 0; i < n; i++) {
        // deterministic pseudo-scatter: same n always draws the same field
        var a = (i * 2654435761) >>> 0;
        var x = 6 + (a % 86);
        var y = 8 + ((a >>> 8) % 80);
        h += '<i style="left:' + x + "%;top:" + y + '%"></i>';
      }
      h += "</div>";
      if (o.label) h += '<div class="sim__dlabel">' + esc(o.label) + "</div>";
      return h;
    },

    /** A labelled horizontal bar, for anything measured rather than allocated. */
    bar: function (o) {
      var pct = clamp(Number(o.pct) || 0, 0, 100);
      return '<div class="sim__bar' + flagCls("sim__bar", o.flag) + '">' +
        '<span class="sim__blabel">' + esc(o.label) + "</span>" +
        '<span class="sim__btrack"><i style="width:' + pct + '%"></i></span>' +
        "<b>" + esc(o.value !== undefined ? o.value : Math.round(pct) + "%") + "</b></div>";
    },

    /** An inline tag. */
    pill: function (text, flag) {
      return '<span class="sim__pill' + flagCls("sim__pill", flag) + '">' + esc(text) + "</span>";
    },

    /** A row of tags. */
    pills: function (items) {
      return '<div class="sim__pills">' + items.map(function (p) {
        return typeof p === "string" ? d.pill(p) : d.pill(p.label, p.flag);
      }).join("") + "</div>";
    },

    /** A label/value line. */
    row: function (label, value, flag) {
      return '<div class="sim__row' + flagCls("sim__row", flag) + '">' +
        "<span>" + esc(label) + "</span><b>" + esc(value) + "</b></div>";
    },

    /** A small table. */
    table: function (head, rows) {
      var h = '<table class="sim__table"><thead><tr>';
      for (var i = 0; i < head.length; i++) h += "<th>" + esc(head[i]) + "</th>";
      h += "</tr></thead><tbody>";
      for (var r = 0; r < rows.length; r++) {
        h += "<tr>";
        for (var c = 0; c < rows[r].length; c++) h += "<td>" + esc(rows[r][c]) + "</td>";
        h += "</tr>";
      }
      return h + "</tbody></table>";
    },

    /** An explanatory line under the diagram. */
    note: function (text, flag) {
      return '<p class="sim__msg' + flagCls("sim__msg", flag) + '">' + text + "</p>";
    },

    /** A monospace code/console strip. */
    mono: function (text, flag) {
      return '<div class="sim__mono' + flagCls("sim__mono", flag) + '">' + esc(text) + "</div>";
    },
  };

  // ======================================================================
  // The player. Owns the timeline; the sim owns the frames.
  // ======================================================================
  function mount(host, spec) {
    var scenarios = spec.scenarios || [];
    if (!scenarios.length) throw new Error("sim has no scenarios");

    var si = 0;                 // scenario index
    var i = 0;                  // step index
    var playing = false;
    var speed = 1;
    var timer = null;
    var base = spec.interval || 1100;

    host.innerHTML = "";
    host.classList.add("sim--live");

    // ---- head ----------------------------------------------------------
    var head = document.createElement("div");
    head.className = "sim__head";
    head.innerHTML =
      '<span class="sim__tag">simulation</span>' +
      '<span class="sim__title">' + spec.title + "</span>";
    host.appendChild(head);

    if (spec.note) {
      var n = document.createElement("p");
      n.className = "sim__note";
      n.innerHTML = spec.note;
      host.appendChild(n);
    }

    // ---- scenario tabs --------------------------------------------------
    var tabs = null;
    if (scenarios.length > 1) {
      tabs = document.createElement("div");
      tabs.className = "sim__tabs";
      tabs.setAttribute("role", "tablist");
      scenarios.forEach(function (sc, k) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "sim__tab";
        b.textContent = sc.label;
        b.setAttribute("role", "tab");
        b.addEventListener("click", function () { selectScenario(k); });
        tabs.appendChild(b);
      });
      var reset = document.createElement("button");
      reset.type = "button";
      reset.className = "sim__reset";
      reset.title = "Reset to the start";
      reset.setAttribute("aria-label", "Reset to the start");
      reset.innerHTML = "&#8635;";
      reset.addEventListener("click", function () { pause(); go(0); });
      tabs.appendChild(reset);
      host.appendChild(tabs);
    }

    // ---- stage ----------------------------------------------------------
    var stage = document.createElement("div");
    stage.className = "sim__stage";
    host.appendChild(stage);

    // ---- caption + transport --------------------------------------------
    var deck = document.createElement("div");
    deck.className = "sim__deck";

    var cap = document.createElement("p");
    cap.className = "sim__caption";
    cap.setAttribute("aria-live", "polite");
    deck.appendChild(cap);

    var bar = document.createElement("div");
    bar.className = "sim__transport";

    function mkBtn(cls, label, glyph) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "sim__ctl " + cls;
      b.setAttribute("aria-label", label);
      b.title = label;
      b.innerHTML = glyph;
      bar.appendChild(b);
      return b;
    }

    var playBtn = mkBtn("sim__play", "Play", "&#9655;");
    var prevBtn = mkBtn("", "Previous step", "&#8249;");
    var nextBtn = mkBtn("", "Next step", "&#8250;");

    var scrub = document.createElement("input");
    scrub.type = "range";
    scrub.className = "sim__scrub";
    scrub.min = "0";
    scrub.step = "1";
    scrub.setAttribute("aria-label", "Step");
    bar.appendChild(scrub);

    var count = document.createElement("span");
    count.className = "sim__count";
    bar.appendChild(count);

    var speedBtn = mkBtn("sim__speed", "Playback speed", "1x");
    var fsBtn = mkBtn("sim__fs", "Fullscreen", "&#9974;");

    deck.appendChild(bar);
    host.appendChild(deck);

    // ---- behaviour -------------------------------------------------------
    function steps() { return scenarios[si].steps; }
    function last() { return steps().length - 1; }

    function render() {
      var sc = scenarios[si];
      var step = steps()[i];
      var ctx = { i: i, n: last(), playing: playing, scenario: sc, done: i >= last() };
      var html;
      try {
        html = spec.draw(step, d, ctx);
      } catch (e) {
        html = d.note("This frame failed to draw.", "bad");
      }
      stage.innerHTML = html;

      cap.innerHTML = step.caption || "";
      cap.className = "sim__caption" + flagCls("sim__caption", step.flag);

      scrub.max = String(last());
      scrub.value = String(i);
      count.textContent = i + " / " + last();

      playBtn.innerHTML = playing ? "&#10074;&#10074;" : (ctx.done ? "&#8635;" : "&#9655;");
      playBtn.setAttribute("aria-label", playing ? "Pause" : ctx.done ? "Replay" : "Play");
      playBtn.title = playBtn.getAttribute("aria-label");
      prevBtn.disabled = i <= 0;
      nextBtn.disabled = i >= last();

      if (tabs) {
        var bs = tabs.querySelectorAll(".sim__tab");
        for (var k = 0; k < bs.length; k++) {
          var on = k === si;
          bs[k].classList.toggle("is-on", on);
          bs[k].setAttribute("aria-selected", on ? "true" : "false");
        }
      }
    }

    function go(k) {
      i = clamp(k, 0, last());
      render();
    }

    function tick() {
      if (i >= last()) { pause(); render(); return; }
      go(i + 1);
      if (i >= last()) pause();
    }

    function play() {
      if (i >= last()) i = 0;      // replay from the top
      playing = true;
      clearInterval(timer);
      timer = setInterval(tick, Math.max(180, base / speed));
      render();
    }
    function pause() {
      playing = false;
      clearInterval(timer);
      timer = null;
    }
    function toggle() { if (playing) { pause(); render(); } else play(); }

    function selectScenario(k) {
      pause();
      si = clamp(k, 0, scenarios.length - 1);
      i = 0;
      render();
    }

    playBtn.addEventListener("click", toggle);
    prevBtn.addEventListener("click", function () { pause(); go(i - 1); });
    nextBtn.addEventListener("click", function () { pause(); go(i + 1); });
    scrub.addEventListener("input", function () { pause(); go(Number(scrub.value)); });

    var SPEEDS = [1, 1.5, 2, 0.5];
    speedBtn.addEventListener("click", function () {
      var k = (SPEEDS.indexOf(speed) + 1) % SPEEDS.length;
      speed = SPEEDS[k];
      speedBtn.textContent = speed + "x";
      if (playing) play();
    });

    fsBtn.addEventListener("click", function () {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
      } else if (host.requestFullscreen) {
        host.requestFullscreen().catch(function () {});
      }
    });

    // keyboard: the sim is focusable as a unit
    host.tabIndex = 0;
    host.addEventListener("keydown", function (e) {
      if (e.target !== host && e.target !== scrub) return;
      if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); pause(); go(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); pause(); go(i - 1); }
      else if (e.key === "Home") { e.preventDefault(); pause(); go(0); }
      else if (e.key === "End") { e.preventDefault(); pause(); go(last()); }
    });

    // stop the clock when scrolled away — a paused sim costs nothing
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        for (var k = 0; k < entries.length; k++) {
          if (!entries[k].isIntersecting && playing) { pause(); render(); }
        }
      }, { threshold: 0 }).observe(host);
    }

    if (REDUCED) host.classList.add("sim--still");

    render();
  }

  // ======================================================================
  var SIMS = {};
  window.__SIMS = SIMS;   // sims register into this
  window.__SIM_D = d;     // exposed so a page-local sim can use the helper

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll(".sim[data-sim]"), function (host) {
      var spec = SIMS[host.getAttribute("data-sim")];
      if (!spec) return;
      try { mount(host, spec); }
      catch (e) { host.classList.add("sim--failed"); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
