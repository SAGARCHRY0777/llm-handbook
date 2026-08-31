/** Static server for `docs/`. Enough to preview the built site locally. */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = new URL("../docs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PORT = Number(process.env.PORT || 4180);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

async function handler(req, res) {
  // Strip the query string and refuse traversal before touching the disk.
  const path = decodeURIComponent(req.url.split("?")[0]);
  if (path.includes("..")) {
    res.writeHead(400).end("bad request");
    return;
  }
  const file = join(ROOT, path === "/" ? "index.html" : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}

const server = createServer(handler);

// Without this the process exits on an unhandled EADDRINUSE, and when it has
// been backgrounded that failure is silent -- you then screenshot whatever else
// is already on that port and believe it is your own site.
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`port ${PORT} is in use. Try: PORT=${PORT + 1} npm run serve`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => console.log(`serving docs/ on http://localhost:${PORT}`));
