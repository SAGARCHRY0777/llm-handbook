/**
 * Sim checks — does each simulation actually advance?
 *
 * A sim is a mechanism played forward in time. The build renders a ```sim
 * fence whether or not the sim behind it is registered, and the runtime
 * catches a throwing sim into `.sim--failed` so the page still loads. So all
 * of these reach a reader with nothing failing anywhere:
 *
 *   - a fence naming a sim that was never registered
 *   - a sim that throws on mount
 *   - a scenario whose frames are identical, so nothing appears to happen
 *   - NaN or undefined drawn into the stage or the caption
 *   - a frame with no caption, which leaves the reader no idea what changed
 *   - a sim that bursts the page width on a phone
 *
 * This walks every frame of every scenario tab, for every sim, in a real
 * browser. It is the only gate that runs the sims at all.
 *
 *   node scripts/simcheck.mjs                  check every sim
 *   node scripts/simcheck.mjs kvgrow batching  check only these
 *
 * Needs a Chromium-family browser; see scripts/browser.mjs.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./browser.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CONTENT = join(ROOT, "content");
const DOCS = join(ROOT, "docs");

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

// -- find every fence and the built page it landed on -----------------------
const targets = [];
for (const file of readdirSync(CONTENT).filter((f) => f.endsWith(".md"))) {
  const lines = readFileSync(join(CONTENT, file), "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "```sim") continue;
    const name = (lines[i + 1] || "").trim();
    if (name) targets.push({ name, page: file.replace(/\.md$/, ".html") });
  }
}
const chosen = only.length ? targets.filter((t) => only.includes(t.name)) : targets;

if (!chosen.length) {
  console.error(only.length ? `No sim matched: ${only.join(", ")}` : "No ```sim fences found.");
  process.exit(1);
}
const missing = chosen.find((t) => !existsSync(join(DOCS, t.page)));
if (missing) {
  console.error(`docs/${missing.page} does not exist — run 'npm run build' first.`);
  process.exit(1);
}

const browser = await launch();
const page = await browser.newPage();

const pageErrors = [];
page.on("pageerror", (e) => {
  const t = (e && e.stack) || String(e);
  // Mermaid parse failures are a diagram problem, not a sim fault, and they
  // would otherwise blame every sim on the page.
  if (!/mermaid/i.test(t)) pageErrors.push(String(e).slice(0, 180));
});

const failures = [];
let ok = 0;

for (const { name, page: file } of chosen) {
  pageErrors.length = 0;
  await page.setViewport({ width: 1200, height: 1000 });
  await page.goto(pathToFileURL(join(DOCS, file)).href, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 400));

  const res = await page.evaluate(async (n) => {
    const host = document.querySelector(`.sim[data-sim="${n}"]`);
    if (!host) return { fatal: "FENCE NOT FOUND" };
    if (host.classList.contains("sim--failed")) return { fatal: "THREW ON MOUNT" };
    if (!host.classList.contains("sim--live")) return { fatal: "NEVER MOUNTED" };

    const stage = host.querySelector(".sim__stage");
    const cap = host.querySelector(".sim__caption");
    const scrub = host.querySelector(".sim__scrub");
    if (!stage || !cap || !scrub) return { fatal: "MISSING STAGE, CAPTION OR SCRUBBER" };

    const tabs = [...host.querySelectorAll(".sim__tab")];
    const bad = /NaN|undefined|\[object |Infinity/;
    const out = [];

    for (const t of tabs.length ? tabs : [null]) {
      if (t) { t.click(); await new Promise((r) => setTimeout(r, 25)); }
      const N = Number(scrub.max);
      if (!isFinite(N) || N < 1) { out.push({ label: t ? t.textContent : "(single)", fatal: "no frames" }); continue; }

      let prev = null, dupes = 0, empty = 0;
      const dirty = [];
      for (let i = 0; i <= N; i++) {
        scrub.value = String(i);
        scrub.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 12));
        const html = stage.innerHTML;
        const caption = cap.textContent.trim();
        // A repeated FINAL frame is legitimate — a mechanism that has come to
        // rest looks the same once it is done. A repeat mid-run means the
        // step drew nothing new, which reads as a stuck sim.
        if (prev !== null && html === prev && i < N) dupes++;
        prev = html;
        if (!caption) empty++;
        if (bad.test(html) || bad.test(caption)) dirty.push(i);
      }
      out.push({ label: (t ? t.textContent : "(single)").trim().slice(0, 22), steps: N, dupes, empty, dirty });
    }
    return { out, tabs: tabs.length };
  }, name);

  if (res.fatal) {
    console.error(`${name.padEnd(16)} ${res.fatal}`);
    failures.push(`${name}: ${res.fatal}`);
    continue;
  }

  await page.setViewport({ width: 380, height: 900 });
  await new Promise((r) => setTimeout(r, 400));
  const nw = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  }));

  const issues = [];
  for (const s of res.out) {
    if (s.fatal) { issues.push(`${s.label}: ${s.fatal}`); continue; }
    if (s.dupes) issues.push(`${s.label}: ${s.dupes} identical frame(s) mid-run`);
    if (s.empty) issues.push(`${s.label}: ${s.empty} frame(s) with no caption`);
    if (s.dirty.length) issues.push(`${s.label}: NaN/undefined at frame ${s.dirty.join(",")}`);
  }
  if (nw.sw > nw.vw + 2) issues.push(`@380px the page scrolls sideways (${nw.sw} > ${nw.vw})`);
  if (pageErrors.length) issues.push(`js: ${pageErrors[0]}`);

  const shape = `${res.tabs || 1} scenario(s), ${res.out.map((s) => (s.steps ?? "?") + "f").join("/")}`;
  if (issues.length) {
    console.error(`${name.padEnd(16)} PROBLEM  ${shape}  <- ${issues.join("; ")}`);
    failures.push(`${name}: ${issues.join("; ")}`);
  } else {
    console.log(`${name.padEnd(16)} ok       ${shape}`);
    ok++;
  }
}

await browser.close();

const counts = `${ok}/${chosen.length} sim(s) healthy`;
if (failures.length) {
  console.error(`\nFAILED — ${counts}`);
  process.exit(1);
}
console.log(`\nok — ${counts}`);
