/**
 * Static site build: content/*.md -> docs/*.html
 *
 * Deliberately small. The content is the product, so the generator stays a
 * single file you can read in one sitting rather than a framework you have to
 * keep upgrading. Adding a page means adding a markdown file; nothing else.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { marked } from "marked";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CONTENT = join(ROOT, "content");
const SITE = join(ROOT, "site");
const OUT = join(ROOT, "docs");

/** Modules in reading order. A page declares which one it belongs to. */
const MODULES = [
  { id: "start", title: "Start here" },
  { id: "foundations", title: "LLM foundations" },
  { id: "rag", title: "Retrieval & advanced RAG" },
  { id: "evaluation", title: "Evaluation & judging" },
  { id: "optimization", title: "Inference optimization" },
  { id: "orchestration", title: "Orchestration frameworks" },
  { id: "agents", title: "Agents & safety" },
  { id: "training", title: "Training & adaptation" },
  { id: "operations", title: "Deployment & operations" },
  { id: "business", title: "Market & business" },
  { id: "practice", title: "Practice & interviews" },
  { id: "reference", title: "Reference" },
];

/* ------------------------------------------------------------------ parse */

/** Minimal `key: value` frontmatter. No YAML dependency for six fields. */
function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: raw };
  const meta = {};
  for (const line of raw.slice(4, end).split("\n")) {
    const match = /^([a-z_]+):\s*(.*)$/i.exec(line.trim());
    if (match) meta[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: raw.slice(end + 4) };
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/* -------------------------------------------------------------- rendering */

/**
 * Mermaid blocks are handed to the browser as-is. Rendering them at build time
 * would need a headless browser, which is a lot of machinery for diagrams that
 * also need to re-render when the reader flips the theme.
 */
function makeRenderer(headings) {
  const renderer = new marked.Renderer();

  renderer.code = ({ text, lang }) => {
    if (lang === "mermaid") {
      return `<pre class="mermaid">${escapeHtml(text)}</pre>`;
    }
    // A ```widget fence names a calculator in site/widgets.js. The fallback
    // paragraph is what a reader without JavaScript sees, and it points at the
    // code block that computes the same thing -- so nothing is lost, only the
    // slider. widgets.js replaces the whole node when it runs.
    // A ```lab fence names an experiment in site/labs.js. Unlike a widget
    // (which moves a slider over a formula) a lab runs the page's actual
    // algorithm on text the reader types, so the fallback points at the prose
    // rather than at a code block -- there may not be one.
    if (lang === "lab") {
      const name = escapeHtml(text.trim().split(/\s+/)[0]);
      return `<div class="lab" data-lab="${name}">` +
        `<p class="lab__fallback">Interactive experiment \u2014 needs JavaScript.</p></div>`;
    }
    // A ```sim fence names a simulation in site/sims.js. Where a lab is a
    // sandbox you drive, a sim plays a mechanism forward in TIME -- scenario
    // tabs, a step timeline, and a caption that narrates each frame. It earns
    // its place only when the mechanism actually unfolds in stages.
    if (lang === "sim") {
      const name = escapeHtml(text.trim().split(/\s+/)[0]);
      return `<div class="sim" data-sim="${name}">` +
        `<p class="sim__fallback">Interactive simulation — needs JavaScript.</p></div>`;
    }
    if (lang === "widget") {
      const name = escapeHtml(text.trim().split(/\s+/)[0]);
      return `<div class="widget" data-widget="${name}">` +
        `<p class="widget__fallback">Interactive calculator \u2014 needs JavaScript. ` +
        `The code beside it computes the same numbers.</p></div>`;
    }
    const cls = lang ? ` class="language-${lang}"` : "";
    return `<pre class="code"><code${cls}>${escapeHtml(text)}</code></pre>`;
  };

  renderer.heading = ({ text, depth }) => {
    const plain = text.replace(/<[^>]+>/g, "");
    const id = slugify(plain);
    if (depth === 2 || depth === 3) headings.push({ id, text: plain, depth });
    return `<h${depth} id="${id}"><a class="anchor" href="#${id}">#</a>${text}</h${depth}>`;
  };

  // Tables carry most of the comparison content here, and several are wide.
  // Wrapping each one lets it scroll inside itself instead of the page.
  renderer.table = (token) => {
    const head = token.header.map((c) => `<th>${marked.parseInline(c.text)}</th>`).join("");
    const rows = token.rows
      .map((row) => `<tr>${row.map((c) => `<td>${marked.parseInline(c.text)}</td>`).join("")}</tr>`)
      .join("");
    return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  };

  return renderer;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

/* ------------------------------------------------------------------ build */

function loadPages() {
  const pages = [];
  for (const file of readdirSync(CONTENT).filter((f) => f.endsWith(".md"))) {
    const raw = readFileSync(join(CONTENT, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const slug = meta.slug || basename(file, ".md");
    const headings = [];
    const html = marked.parse(body, { renderer: makeRenderer(headings), gfm: true });
    pages.push({
      slug,
      file,
      title: meta.title || slug,
      module: meta.module || "start",
      order: Number(meta.order ?? 999),
      summary: meta.summary || "",
      status: meta.status || "draft",
      level: meta.level || "",
      html,
      headings,
      // Plain text drives the search index; markup would swamp it.
      text: body.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|\-]/g, " "),
    });
  }
  return pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

function navHtml(pages, current) {
  const parts = [];
  for (const mod of MODULES) {
    const inModule = pages.filter((p) => p.module === mod.id);
    if (!inModule.length) continue;
    parts.push(`<div class="nav-group"><div class="nav-group-title">${mod.title}</div><ul>`);
    for (const page of inModule) {
      const active = page.slug === current ? ' class="active"' : "";
      const badge =
        page.status === "draft" ? '<span class="badge draft">draft</span>' : "";
      parts.push(`<li><a href="${page.slug}.html"${active}>${page.title}${badge}</a></li>`);
    }
    parts.push("</ul></div>");
  }
  return parts.join("");
}

function tocHtml(headings) {
  if (headings.length < 3) return "";
  const items = headings
    .map((h) => `<li class="d${h.depth}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`)
    .join("");
  return `<nav class="toc" aria-label="On this page"><div class="toc-title">On this page</div><ul>${items}</ul></nav>`;
}

function render(template, page, pages) {
  const prevNext = (() => {
    const index = pages.findIndex((p) => p.slug === page.slug);
    const prev = pages[index - 1];
    const next = pages[index + 1];
    const link = (p, rel) =>
      p ? `<a class="pager ${rel}" href="${p.slug}.html"><span>${rel}</span>${p.title}</a>` : "";
    return `<div class="pager-row">${link(prev, "previous")}${link(next, "next")}</div>`;
  })();

  return template
    .replaceAll("{{title}}", escapeHtml(page.title))
    .replaceAll("{{summary}}", escapeHtml(page.summary))
    .replaceAll("{{nav}}", navHtml(pages, page.slug))
    .replaceAll("{{toc}}", tocHtml(page.headings))
    .replaceAll("{{content}}", page.html)
    .replaceAll("{{pager}}", prevNext)
    .replaceAll("{{slug}}", page.slug);
}

function build() {
  const pages = loadPages();
  if (!pages.length) {
    console.error("no content found in content/");
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  const template = readFileSync(join(SITE, "template.html"), "utf8");

  for (const page of pages) {
    writeFileSync(join(OUT, `${page.slug}.html`), render(template, page, pages));
  }

  // The first page doubles as the site index.
  const home = pages.find((p) => p.slug === "index") || pages[0];
  writeFileSync(join(OUT, "index.html"), render(template, home, pages));

  // Search runs client-side over this index; at handbook scale a prebuilt JSON
  // is faster and simpler than any server.
  writeFileSync(
    join(OUT, "search-index.json"),
    JSON.stringify(
      pages.map((p) => ({
        slug: p.slug,
        title: p.title,
        module: p.module,
        summary: p.summary,
        headings: p.headings.map((h) => h.text),
        text: p.text.replace(/\s+/g, " ").slice(0, 12000),
      }))
    )
  );

  for (const asset of ["style.css", "app.js", "widgets.js", "labs.js", "sims.js", "simdefs.js"]) {
    if (existsSync(join(SITE, asset))) cpSync(join(SITE, asset), join(OUT, asset));
  }
  // Pages would otherwise run the output through Jekyll and drop _-prefixed paths.
  writeFileSync(join(OUT, ".nojekyll"), "");

  const drafts = pages.filter((p) => p.status === "draft").length;
  console.log(`built ${pages.length} pages -> docs/  (${drafts} still marked draft)`);
}

build();
