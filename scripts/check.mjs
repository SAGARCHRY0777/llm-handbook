/**
 * Content checks — what the build cannot catch on its own.
 *
 * `npm run build` renders whatever it is given. It will happily emit a page
 * that links to a file nobody wrote, sits in a module the nav does not know
 * about, or claims a slug another page already owns. Those are the failures
 * that reach a reader as a 404 or a missing sidebar entry, so they are worth a
 * separate gate.
 *
 * Deliberately dependency-free and deliberately not part of `build`: the build
 * should stay usable while a page is half-written, and this should be able to
 * fail without stopping you from previewing.
 *
 *   node scripts/check.mjs            fail on errors
 *   node scripts/check.mjs --strict   fail on warnings too
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CONTENT = join(ROOT, "content");

// Kept in sync with build.mjs by hand. A module here that is missing there
// renders a page into a nav section that does not exist, so a mismatch is
// exactly what this check is for.
const MODULES = new Set([
  "start", "foundations", "rag", "evaluation", "optimization", "orchestration",
  "agents", "training", "operations", "business", "practice", "reference",
]);

const STATUSES = new Set(["live", "draft"]);

// Lookup surfaces rather than topics: no reading order, so no stop condition.
const NO_STOP_CONDITION = new Set(["start", "reference", "practice"]);
const REQUIRED = ["title", "slug", "module", "order", "status", "summary"];

const strict = process.argv.includes("--strict");
const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

/** Same minimal parser the build uses; duplicated so this runs standalone. */
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

const files = readdirSync(CONTENT).filter((f) => f.endsWith(".md"));
if (files.length === 0) {
  console.error("no markdown found in content/ — refusing to pass vacuously");
  process.exit(1);
}

const pages = files.map((file) => {
  const raw = readFileSync(join(CONTENT, file), "utf8");
  const { meta, body } = parseFrontmatter(raw);
  return { file, meta, body, slug: meta.slug || basename(file, ".md") };
});

const slugs = new Set(pages.map((p) => p.slug));
const seenSlug = new Map();
const seenOrder = new Map();

for (const { file, meta, body, slug } of pages) {
  // -- frontmatter ----------------------------------------------------------
  for (const key of REQUIRED) {
    if (!meta[key]) err(file, `missing frontmatter: ${key}`);
  }
  if (meta.module && !MODULES.has(meta.module)) {
    err(file, `unknown module "${meta.module}" — not in build.mjs MODULES`);
  }
  if (meta.status && !STATUSES.has(meta.status)) {
    err(file, `status must be live or draft, got "${meta.status}"`);
  }
  if (meta.order && !Number.isFinite(Number(meta.order))) {
    err(file, `order must be a number, got "${meta.order}"`);
  }
  // The slug is the URL. A collision means one page silently overwrites the
  // other in docs/, and the build reports success either way.
  if (seenSlug.has(slug)) err(file, `duplicate slug "${slug}", also in ${seenSlug.get(slug)}`);
  else seenSlug.set(slug, file);

  if (meta.slug && meta.slug !== basename(file, ".md")) {
    warn(file, `slug "${meta.slug}" does not match filename`);
  }

  // Order collisions inside one module make nav ordering depend on title
  // tiebreak, which is stable but not what the author intended.
  if (meta.module && meta.order) {
    const key = `${meta.module}/${meta.order}`;
    if (seenOrder.has(key)) warn(file, `order ${meta.order} in "${meta.module}" also used by ${seenOrder.get(key)}`);
    else seenOrder.set(key, file);
  }

  // -- links ----------------------------------------------------------------
  // Internal links are written as `foo.html` because that is what they resolve
  // to in docs/. The target must therefore be a real page slug.
  for (const [, target] of body.matchAll(/\]\(([a-z0-9][a-z0-9-]*)\.html(#[^)]*)?\)/g)) {
    if (!slugs.has(target)) err(file, `link to "${target}.html" — no page with that slug`);
  }
  // A relative .md link works on GitHub and 404s on the built site. Pick one.
  for (const [, target] of body.matchAll(/\]\(([a-z0-9][a-z0-9-]*)\.md\)/g)) {
    err(file, `link to "${target}.md" — use "${target}.html", the built path`);
  }

  // -- structure ------------------------------------------------------------
  if (!/^#\s+/m.test(body)) err(file, "no H1 heading");
  // Only *topic* pages promise a stop condition. Reference material (glossary,
  // papers, numbers), practice material and the index are lookup surfaces —
  // they have no end to read to, so requiring one there is noise, and a check
  // that cries wolf is a check people stop reading.
  if (meta.status === "live" && !NO_STOP_CONDITION.has(meta.module)
      && !/##\s*Stop condition/i.test(body)) {
    warn(file, 'topic page has no "Stop condition" section');
  }
  if (/\bTODO\b|\bTKTK\b|\bFIXME\b/.test(body)) {
    err(file, "contains a TODO/FIXME marker");
  }
}

// -- reachability -----------------------------------------------------------
// Every page is in the nav, so nothing is truly orphaned — but a page that no
// other page links to in prose is one a reader only finds by scanning the
// sidebar. Worth knowing about; not worth failing a build over.
const linkedTo = new Set();
for (const { body } of pages) {
  for (const [, t] of body.matchAll(/\]\(([a-z0-9][a-z0-9-]*)\.html(?:#[^)]*)?\)/g)) linkedTo.add(t);
}
for (const { file, slug, meta } of pages) {
  if (meta.module !== "start" && meta.module !== "reference" && !linkedTo.has(slug)) {
    warn(file, `no other page links to "${slug}.html"`);
  }
}

// -- report -----------------------------------------------------------------
const drafts = pages.filter((p) => p.meta.status === "draft").length;
for (const w of warnings) console.warn(`warn   ${w}`);
for (const e of errors) console.error(`ERROR  ${e}`);

const counts = `${pages.length} page(s), ${drafts} draft(s), ${errors.length} error(s), ${warnings.length} warning(s)`;
if (errors.length || (strict && warnings.length)) {
  console.error(`\nFAILED — ${counts}`);
  process.exit(1);
}
console.log(`\nok — ${counts}`);
