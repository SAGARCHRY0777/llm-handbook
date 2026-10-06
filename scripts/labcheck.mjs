/**
 * Lab checks — does each lab actually compute?
 *
 * `npm run check` reads the markdown and never executes a line of lab code.
 * `npm run build` renders a ```lab fence into a mount point whether or not the
 * lab behind it exists, and the runtime swallows a throwing lab into a
 * `.lab--failed` class so the page still loads. Between them, every one of
 * these reaches a reader silently:
 *
 *   - a fence naming a lab that was never registered
 *   - a lab that throws on mount
 *   - a control that moves and changes nothing
 *   - NaN or undefined rendered into the output
 *   - a lab that bursts the page width on a phone
 *
 * So this mounts every lab in a real browser, moves every control, and asserts
 * the output changed. It is the only gate that runs the labs at all.
 *
 * What it does NOT check is whether the arithmetic is right — a lab can be
 * confidently wrong and pass every assertion here. Correctness is asserted
 * per-lab against independently computed values; this is the floor, not the
 * ceiling.
 *
 *   node scripts/labcheck.mjs              check every lab
 *   node scripts/labcheck.mjs bm25 psi     check only these
 *
 * Needs a Chromium-family browser. Set PUPPETEER_EXECUTABLE_PATH to pick one,
 * otherwise the usual install locations are tried.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CONTENT = join(ROOT, "content");
const DOCS = join(ROOT, "docs");

// A Chromium-family binary, in the order worth trying. The CI runner has
// Chrome preinstalled, which is why puppeteer-core (no bundled browser) is
// enough and the heavyweight `puppeteer` package is not a dependency here.
const BROWSERS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

// -- find every fence, and which built page it landed on --------------------
const targets = [];
for (const file of readdirSync(CONTENT).filter((f) => f.endsWith(".md"))) {
  const lines = readFileSync(join(CONTENT, file), "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "```lab") continue;
    const name = (lines[i + 1] || "").trim();
    if (name) targets.push({ name, page: file.replace(/\.md$/, ".html") });
  }
}
const chosen = only.length ? targets.filter((t) => only.includes(t.name)) : targets;

if (!chosen.length) {
  console.error(only.length ? `No lab matched: ${only.join(", ")}` : "No ```lab fences found.");
  process.exit(1);
}
const missingPage = chosen.find((t) => !existsSync(join(DOCS, t.page)));
if (missingPage) {
  console.error(`docs/${missingPage.page} does not exist — run 'npm run build' first.`);
  process.exit(1);
}

const exe = BROWSERS.find((p) => existsSync(p));
if (!exe) {
  console.error(
    "No Chromium-family browser found. Set PUPPETEER_EXECUTABLE_PATH to one.\nTried:\n  " +
      BROWSERS.join("\n  "),
  );
  process.exit(1);
}

let puppeteer;
try {
  puppeteer = (await import("puppeteer-core")).default;
} catch {
  console.error("puppeteer-core is not installed. Run 'npm ci'.");
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();

const pageErrors = [];
page.on("pageerror", (e) => {
  const t = (e && e.stack) || String(e);
  if (!/mermaid/i.test(t)) pageErrors.push(String(e).slice(0, 180)); // mermaid is not a lab fault
});

const failures = [];
let ok = 0;

for (const { name, page: file } of chosen) {
  pageErrors.length = 0;
  await page.setViewport({ width: 1200, height: 1000 });
  await page.goto(pathToFileURL(join(DOCS, file)).href, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 400));

  const res = await page.evaluate(async (n) => {
    const host = document.querySelector(`.lab[data-lab="${n}"]`);
    if (!host) return { fatal: "FENCE NOT FOUND" };
    if (host.classList.contains("lab--failed")) return { fatal: "THREW ON MOUNT" };
    if (!host.classList.contains("lab--live")) return { fatal: "NEVER MOUNTED" };
    const out = host.querySelector(".lab__out");
    const read = () => out.textContent.replace(/\s+/g, " ").trim();
    if (read().length < 20) return { fatal: "OUTPUT EMPTY" };

    const dead = [];
    const label = (el, fallback) =>
      (el.closest(".lab__field")?.textContent || fallback).trim().slice(0, 26);

    // A threshold control is legitimately inert for one step — a gate at 90%
    // changes nothing at 91% when no value sits between. Try the extremes
    // before calling it dead, or correct controls read as broken.
    for (const r of host.querySelectorAll("input[type=range]")) {
      const before = read(), old = r.value;
      const mn = +r.min, mx = +r.max, st = +r.step || 1;
      const tries = [+old === mx ? Math.max(mn, +old - st) : Math.min(mx, +old + st), mn, mx];
      let moved = false;
      for (const v of tries) {
        r.value = String(v);
        r.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((res) => setTimeout(res, 20));
        if (read() !== before) { moved = true; break; }
      }
      if (!moved) dead.push(label(r, "range"));
      r.value = old;
      r.dispatchEvent(new Event("input", { bubbles: true }));
    }

    for (const s of host.querySelectorAll("select")) {
      const before = read(), old = s.value;
      let moved = false;
      for (const o of s.options) {
        if (o.value === old) continue;
        s.value = o.value;
        s.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((res) => setTimeout(res, 20));
        if (read() !== before) { moved = true; break; }
      }
      if (!moved && s.options.length > 1) dead.push(label(s, "select"));
      s.value = old;
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // A lab that parses structured input may legitimately ignore a trailing
    // line — the schema lab extracts the outermost {...} on purpose — so one
    // unmoved append proves nothing. Escalate before calling it dead.
    for (const t of host.querySelectorAll("textarea")) {
      const before = read(), old = t.value;
      const lines = old.split("\n").filter(Boolean);
      const tries = [
        old + "\n" + (lines[0] || "1 1"),
        lines.slice(0, Math.max(1, lines.length - 1)).join("\n"),
        "",
      ];
      let moved = false;
      for (const v of tries) {
        t.value = v;
        t.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((res) => setTimeout(res, 20));
        if (read() !== before) { moved = true; break; }
      }
      if (!moved) dead.push(label(t, "textarea"));
      t.value = old;
      t.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await new Promise((res) => setTimeout(res, 20));
    return { dead, dirty: /NaN|undefined|\[object |Infinity/.test(read()), len: read().length };
  }, name);

  if (res.fatal) {
    console.error(`${name.padEnd(12)} ${res.fatal}`);
    failures.push(`${name}: ${res.fatal}`);
    continue;
  }

  // 380px is a small phone. A lab that forces the page to scroll sideways
  // breaks the whole article, not just itself.
  await page.setViewport({ width: 380, height: 900 });
  await new Promise((r) => setTimeout(r, 300));
  const nw = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  }));

  const issues = [];
  if (res.dead.length) issues.push(`inert: ${res.dead.join(", ")}`);
  if (res.dirty) issues.push("NaN/undefined in output");
  if (nw.sw > nw.vw + 2) issues.push(`@380px the page scrolls sideways (${nw.sw} > ${nw.vw})`);
  if (pageErrors.length) issues.push(`js: ${pageErrors[0]}`);

  if (issues.length) {
    console.error(`${name.padEnd(12)} PROBLEM  <- ${issues.join("; ")}`);
    failures.push(`${name}: ${issues.join("; ")}`);
  } else {
    console.log(`${name.padEnd(12)} ok       out:${res.len}ch`);
    ok++;
  }
}

await browser.close();

const counts = `${ok}/${chosen.length} lab(s) healthy`;
if (failures.length) {
  console.error(`\nFAILED — ${counts}`);
  process.exit(1);
}
console.log(`\nok — ${counts}`);
