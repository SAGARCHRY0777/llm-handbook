/* Search, theme, scrollspy, mobile nav. No framework: the page is static and
   these are four small behaviours that do not need one. */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- theme */
  var root = document.documentElement;
  var themeBtn = document.getElementById("theme-btn");

  function currentTheme() {
    return (
      root.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    );
  }

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("llm-handbook:theme", next);
      } catch (e) {
        /* private mode: the choice just will not persist */
      }
      // Mermaid bakes colours into the SVG, so it must redraw, not restyle.
      window.dispatchEvent(new CustomEvent("themechange"));
    });
  }

  /* Preserve each diagram's source before mermaid replaces it with an SVG,
     so a theme flip can re-render from the original text. */
  document.querySelectorAll("pre.mermaid").forEach(function (el) {
    el.dataset.src = el.textContent;
  });

  /* ------------------------------------------------------------ mobile nav */
  var menuBtn = document.getElementById("menu-btn");
  var sidebar = document.getElementById("sidebar");
  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", function () {
      var open = sidebar.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
  }

  /* -------------------------------------------------------------- scrollspy */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  if (tocLinks.length) {
    var targets = tocLinks
      .map(function (a) {
        return document.getElementById(a.getAttribute("href").slice(1));
      })
      .filter(Boolean);

    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          tocLinks.forEach(function (a) {
            a.classList.toggle(
              "active",
              a.getAttribute("href").slice(1) === entry.target.id
            );
          });
        });
      },
      // Trigger when a heading reaches the upper third, which matches where a
      // reader's eye actually is, rather than when it touches the very top.
      { rootMargin: "-72px 0px -66% 0px" }
    );
    targets.forEach(function (t) {
      spy.observe(t);
    });
  }

  /* ---------------------------------------------------------------- search */
  var input = document.getElementById("search");
  var results = document.getElementById("results");
  if (!input || !results) return;

  var index = null;
  var selected = -1;

  function load() {
    if (index) return Promise.resolve(index);
    return fetch("search-index.json")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        index = data;
        return index;
      })
      .catch(function () {
        index = [];
        return index;
      });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /** A snippet centred on the first match, so a hit is judgeable at a glance. */
  function snippet(text, needle) {
    var at = text.toLowerCase().indexOf(needle);
    if (at === -1) return "";
    var start = Math.max(0, at - 45);
    var raw = text.slice(start, at + needle.length + 85);
    var re = new RegExp("(" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    return (start ? "…" : "") + escapeHtml(raw).replace(re, "<mark>$1</mark>") + "…";
  }

  function score(page, needle) {
    var s = 0;
    if (page.title.toLowerCase().includes(needle)) s += 100;
    if (page.summary.toLowerCase().includes(needle)) s += 40;
    if (page.headings.some(function (h) { return h.toLowerCase().includes(needle); })) s += 30;
    var body = page.text.toLowerCase();
    var at = body.indexOf(needle);
    while (at !== -1 && s < 200) {
      s += 2;
      at = body.indexOf(needle, at + needle.length);
    }
    return s;
  }

  function render(query) {
    var needle = query.trim().toLowerCase();
    if (needle.length < 2) {
      results.hidden = true;
      input.setAttribute("aria-expanded", "false");
      return;
    }
    var hits = (index || [])
      .map(function (p) {
        return { page: p, s: score(p, needle) };
      })
      .filter(function (h) {
        return h.s > 0;
      })
      .sort(function (a, b) {
        return b.s - a.s;
      })
      .slice(0, 8);

    results.innerHTML = hits.length
      ? hits
          .map(function (h, i) {
            return (
              '<a href="' + h.page.slug + '.html" class="' + (i === 0 ? "sel" : "") + '">' +
              '<div class="r-title">' + escapeHtml(h.page.title) + "</div>" +
              '<div class="r-ctx">' + (snippet(h.page.text, needle) || escapeHtml(h.page.summary)) + "</div>" +
              "</a>"
            );
          })
          .join("")
      : '<div class="empty">No matches for “' + escapeHtml(query) + '”.</div>';

    selected = hits.length ? 0 : -1;
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  input.addEventListener("focus", load);
  input.addEventListener("input", function () {
    load().then(function () {
      render(input.value);
    });
  });

  input.addEventListener("keydown", function (event) {
    var links = results.querySelectorAll("a");
    if (event.key === "Escape") {
      results.hidden = true;
      input.blur();
      return;
    }
    if (!links.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
      links.forEach(function (a, i) {
        a.classList.toggle("sel", i === selected);
      });
      links[selected].scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter" && links[selected]) {
      window.location.href = links[selected].getAttribute("href");
    }
  });

  document.addEventListener("click", function (event) {
    if (!results.contains(event.target) && event.target !== input) results.hidden = true;
  });

  // "/" focuses search from anywhere, the convention on documentation sites.
  document.addEventListener("keydown", function (event) {
    if (event.key === "/" && document.activeElement !== input) {
      event.preventDefault();
      input.focus();
    }
  });
})();
