// vite task to compile from main.js as entrypoint  and outputs dist dir as final vite output
const path = require("path");
const fs = require("fs");
const colors = require("../lib/colors");
const spawn = require("../lib/cross-spawn");
const { useLocalCore, localLibs } = require("../lib/coreLibs"); // same runtime switch the dev import map uses

// compiled files paths
const cwd = process.cwd();
const public = path.resolve(__dirname, "../public"); // node_modules path
const root = cwd.replace(/\/module$/, ""); // project root path
const outDir = path.resolve(root, "dist");

function getLogs() {
  const logFilePath = path.resolve(__dirname, "../lib/log.txt");
  if (fs.existsSync(logFilePath)) {
    return fs.readFileSync(logFilePath).toString();
  } else {
    return null;
  }
}

// vite only emits assets it can trace from the bundle graph — URLs living inside compiled
// component strings (scoped CSS url(), template paths) are invisible to it. Dev serves all
// of public/ verbatim at /, so prod mirrors the rest of it into dist — skipping files vite
// already absorbed under hashed names, and never overwriting what it emitted.
function copyStatic(from, to, absorbed) {
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dest = path.join(to, name);
    if (fs.statSync(src).isDirectory()) {
      copyStatic(src, dest, absorbed);
    } else if (!absorbed.has(src) && !fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

// public files vite already bundled (e.g. favicon.svg, main.css → hashed copies in dist/assets):
// every emitted asset lists the source files it came from, relative to the vite root
function absorbedFiles(buildResult) {
  const absorbed = new Set();
  for (const res of [buildResult].flat()) {
    for (const item of res.output || []) {
      for (const orig of item.originalFileNames || []) absorbed.add(path.resolve(public, orig));
    }
  }
  // processed stylesheets don't report their origin (they're merged into a renamed css chunk),
  // but everything index.html links to is by definition handled by vite
  const html = fs.readFileSync(path.join(public, "index.html"), "utf8");
  const attrRegex = /(?:href|src)=["']([^"']+)["']/g;
  let match;
  while ((match = attrRegex.exec(html))) {
    const url = match[1];
    if (/^(https?:)?\/\//.test(url)) continue; // external URLs aren't public files
    absorbed.add(path.resolve(public, url.replace(/^\//, "")));
  }
  return absorbed;
}

// vite is build-only, so it installs lazily into the project root on first build — dev installs stay lean
function ensureVite() {
  if (fs.existsSync(path.join(root, "node_modules/vite/package.json"))) return;
  console.log(colors("white", "vite not found — installing it into the project root (one-time)..."));
  // --include=dev: the build runs with NODE_ENV=production, which npm inherits as omit=dev and would skip the install
  const result = spawn.sync("npm", ["install", "--save-dev", "--include=dev", "vite"], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Failed to install vite — run `npm i -D vite` in " + root + " then re-run the build.");
}

async function bundle(bootAt) {
  const logs = getLogs();
  if (logs) {
    // stop bundler to fix compiler errors first
    console.error(colors("red", "Bundle skipped — fix the compiler errors above first."));
    process.exitCode = 1;
    return;
  }

  ensureVite();
  const { build } = await import("vite"); // vite 5+ is ESM-only → dynamic import from CJS

  // LOCAL_CORE=true → bundle the framework from module/core (like the dev import map);
  // otherwise bare "olum"/"olum-router"/"olum-store" resolve from the project root's node_modules
  const alias = {};
  if (useLocalCore) {
    for (const [pkgName, corePath] of Object.entries(localLibs)) {
      alias[pkgName] = path.resolve(__dirname, ".." + corePath); // "/core/olum.js" → module/core/olum.js
    }
  }

  const buildResult = await build({
    root: public, // index.html here is the entry; its ../src/main.js script gets pulled in and bundled
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir: true, // outDir sits outside vite's root, so emptying it must be opted into explicitly
    },
  });

  copyStatic(public, outDir, absorbedFiles(buildResult));

  // console.log("compile + bundle in", colors("white", `${Date.now() - bootAt}ms`));
}

module.exports = bundle;
