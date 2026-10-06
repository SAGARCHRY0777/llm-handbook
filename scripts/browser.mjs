/**
 * Finding a browser, shared by labcheck.mjs and labfacts.mjs.
 *
 * Both need a Chromium-family binary and neither should care where it lives.
 * puppeteer-core deliberately bundles no browser: CI has Chrome preinstalled
 * and a dev machine has something, so downloading a second one is waste.
 */

import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

/** Launch headless, or exit(1) with something actionable. */
export async function launch() {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) {
    console.error(
      "No Chromium-family browser found. Set PUPPETEER_EXECUTABLE_PATH to one.\nTried:\n  " +
        CANDIDATES.join("\n  "),
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
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
}
