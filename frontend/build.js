#!/usr/bin/env bun
// Build script: bundles app with dependencies and adds content-hash cache busting
// to app.js and style.css references in index.html and sw.js

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";

const SRC = "src";
const DIST = "dist";

// Clean and create dist
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Bundle app.js with dependencies using Bun
const buildResult = await Bun.build({
  entrypoints: [join(SRC, "app.js")],
  outdir: DIST,
  naming: "[dir]/app.bundle.js",
  minify: false,
  target: "browser",
});

if (!buildResult.success) {
  console.error("Build failed:", buildResult.logs);
  process.exit(1);
}

// Hash a file's contents and return short hex string
function contentHash(filePath) {
  const content = readFileSync(filePath);
  return createHash("md5").update(content).digest("hex").slice(0, 8);
}

// Hash the cacheable assets
const jsBundlePath = join(DIST, "app.bundle.js");
const jsHash = contentHash(jsBundlePath);
const cssHash = contentHash(join(SRC, "style.css"));

const jsName = `app.${jsHash}.js`;
const cssName = `style.${cssHash}.css`;

// Rename bundled JS with hash
const bundledContent = readFileSync(jsBundlePath);
writeFileSync(join(DIST, jsName), bundledContent);
rmSync(jsBundlePath);

// Copy CSS
copyFileSync(join(SRC, "style.css"), join(DIST, cssName));

// Rewrite index.html with hashed references
let html = readFileSync(join(SRC, "index.html"), "utf-8");
html = html.replace("/style.css", `/${cssName}`);
html = html.replace("/app.js", `/${jsName}`);
writeFileSync(join(DIST, "index.html"), html);

// Rewrite sw.js with hashed references in STATIC_ASSETS
let sw = readFileSync(join(SRC, "sw.js"), "utf-8");
sw = sw.replace("'/app.js'", `'/${jsName}'`);
sw = sw.replace("'/style.css'", `'/${cssName}'`);
// Auto-bump cache name based on asset hashes
sw = sw.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'relay-chat-${jsHash.slice(0, 4)}${cssHash.slice(0, 4)}';`);
writeFileSync(join(DIST, "sw.js"), sw);

// Copy remaining static files as-is
const passthrough = ["manifest.json", "icon-192.png", "icon-512.png"];
for (const f of passthrough) {
  copyFileSync(join(SRC, f), join(DIST, f));
}

console.log(`Built: ${jsName}, ${cssName}`);
