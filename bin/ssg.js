const fs = require("fs");
const path = require("path");
const colors = require("../lib/colors");
const spawn = require("../lib/cross-spawn");
const { ensureVite } = require("./bundle");
const serve = require("./server");

const cwd = process.cwd();
const root = cwd.replace(/\/module$/, "");
const sitemapPath = path.resolve(__dirname, "../src/sitemap.js");
const routesPath = path.resolve(__dirname, "../routes.json");
const distDir = path.resolve(root, "dist");
const shellPath = path.join(distDir, "index.html");
const tmpDir = path.resolve(__dirname, "../.olum-ssg");
const tmpEntry = path.join(tmpDir, "sitemap.mjs");

const info = (msg) => console.log(colors("white", msg));
const fail = (msg) => console.error(colors("red", "SSG: " + msg));
const reason = (err) => (err && err.message) || String(err);

function ensurePuppeteer() {
  if (fs.existsSync(path.join(root, "node_modules/puppeteer/package.json")))
    return;
  info(
    "puppeteer not found — installing it into the project root (one-time, downloads Chrome)...",
  );

  const result = spawn.sync(
    "npm",
    ["install", "--save-dev", "--include=dev", "puppeteer"],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error(
      "Failed to install puppeteer — run `npm i -D puppeteer` in " +
        root +
        " then re-run the build.",
    );
}

function routerRoutes() {
  if (!fs.existsSync(routesPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(routesPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    fail("routes.json is unreadable — " + reason(err));
    return [];
  }
}

async function sitemapRoutes() {
  let paths;
  try {
    ensureVite();
    const { build } = await import("vite");
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      build: {
        ssr: true,
        outDir: tmpDir,
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
          input: sitemapPath,
          output: { format: "esm", entryFileNames: path.basename(tmpEntry) },
        },
      },
    });

    const { default: fn } = await import(`file://${tmpEntry}?t=${Date.now()}`);
    if (typeof fn !== "function") {
      fail("src/sitemap.js must default-export a function.");
      return [];
    }
    paths = await fn();
  } catch (err) {
    fail("sitemap.js failed — " + reason(err));
    return [];
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  if (!Array.isArray(paths)) {
    fail("sitemap.js must return an array of routes.");
    return [];
  }
  return paths.filter((item) => typeof item === "string" && item.trim() !== "");
}

function routeMatches(pattern, pathname) {
  const patternSegs = pattern.split("/").filter(Boolean);
  const pathSegs = pathname.split("/").filter(Boolean);
  if (patternSegs.length !== pathSegs.length) return false;
  return patternSegs.every(
    (seg, i) => seg.charAt(0) === ":" || seg === pathSegs[i],
  );
}

function writeShells(finalRoutes, patterns) {
  if (!fs.existsSync(shellPath)) {
    fail("dist/index.html is missing — the bundle step must run first.");
    return 0;
  }

  const shell = fs.readFileSync(shellPath);
  const dirs = new Set();
  for (const route of finalRoutes) {
    let current = "";
    for (const segment of route.split("/")) {
      if (!segment || segment === "." || segment === "..") continue;
      current += "/" + segment;

      if (patterns.some((pattern) => routeMatches(pattern, current)))
        dirs.add(current);
    }
  }

  for (const dir of dirs) {
    const target = path.join(distDir, dir);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "index.html"), shell);
  }
  return dirs.size;
}

async function serveDist() {
  const { server } = await serve(distDir, undefined, "production");
  await new Promise((resolve, reject) => {
    server.on("error", reject);

    server.listen(0, resolve);
  });
  return { server, origin: "http://localhost:" + server.address().port };
}

function writeRendered(route, html) {
  const target = path.join(distDir, route, "index.html");
  if (!target.startsWith(distDir + path.sep)) return false;
  if (!fs.existsSync(target)) return false;
  fs.writeFileSync(target, html);
  return true;
}

function siteUrl() {
  const clean = (str) => str.trim().replace(/\/+$/, "");
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
    const url = pkg.olum && pkg.olum.SITE_URL;
    if (typeof url === "string" && url.trim()) return clean(url);
  } catch (err) {}
  return "";
}

function readDelay(raw, source) {
  if (raw === undefined || raw === null || raw === "") return 0;

  const ms =
    typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(ms) || ms < 0) {
    const shown = typeof raw === "string" ? JSON.stringify(raw) : String(raw);
    fail(
      `ignoring ${source} — expected a number of milliseconds, got ${shown}`,
    );
    return 0;
  }
  return Math.round(ms);
}

function ssgDelay() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
    return readDelay(
      pkg.olum && pkg.olum.SSG_DELAY,
      'package.json "olum.SSG_DELAY"',
    );
  } catch (err) {
    return 0;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const xmlEscape = (str) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function writeSitemapXml(finalRoutes) {
  const base = siteUrl();
  if (!base)
    fail(
      'no package.json "olum.SITE_URL" — sitemap.xml falls back to relative paths, which crawlers ignore',
    );

  const urls = finalRoutes.filter((route) =>
    fs.existsSync(path.join(distDir, route, "index.html")),
  );
  const lastmod = new Date().toISOString().slice(0, 10);
  const body = urls
    .map(
      (route) =>
        `  <url>\n    <loc>${xmlEscape(base + route)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
    )
    .join("\n");

  fs.writeFileSync(
    path.join(distDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
  );
  return urls.length;
}

async function prerender(finalRoutes) {
  if (!finalRoutes.length) return 0;
  const delay = ssgDelay();
  if (delay) {
    const total = (delay * finalRoutes.length) / 1000;
    info(
      `SSG: waiting ${delay}ms after each route (+${total < 60 ? total.toFixed(1) + "s" : (total / 60).toFixed(1) + "min"} to this build)`,
    );
  }
  ensurePuppeteer();
  const mod = await import("puppeteer");
  const puppeteer = mod.default || mod;

  const { server, origin } = await serveDist();

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const isShell = (route) =>
    path.join(distDir, route, "index.html") === shellPath ? 1 : 0;
  const ordered = [...finalRoutes].sort((a, b) => isShell(a) - isShell(b));

  let written = 0;

  const width = String(ordered.length).length;
  const counter = (index) =>
    colors("white", String(index + 1).padStart(width) + "/" + ordered.length);

  try {
    const page = await browser.newPage();
    for (const [index, route] of ordered.entries()) {
      try {
        await page.goto(origin + route, { waitUntil: "networkidle0" });

        await page.waitForFunction(
          () => document.querySelector("#olum-app")?.childElementCount > 0,
          { timeout: 15000 },
        );

        if (delay) await sleep(delay);
        const html =
          "<!doctype html>\n" +
          (await page.evaluate(() => document.documentElement.outerHTML));
        if (writeRendered(route, html)) written++;
        console.log(
          colors("green", " ✓ ") +
            counter(index) +
            "  " +
            colors("cyan", route),
        );
      } catch (err) {
        console.error(
          colors("red", " ✗ ") +
            counter(index) +
            "  " +
            colors("cyan", route) +
            colors("red", "  failed to render — " + reason(err)),
        );
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  return written;
}

const formatSize = (bytes) =>
  bytes < 1024
    ? bytes + " B"
    : (bytes / 1024 < 10
        ? (bytes / 1024).toFixed(1)
        : Math.round(bytes / 1024)) + " kB";

function printRoutesTree(finalRoutes) {
  const root = { name: "/", children: new Map() };
  let built = 0;
  for (const route of finalRoutes) {
    const file = path.join(distDir, route, "index.html");
    if (!fs.existsSync(file)) continue;
    built++;
    let node = root;
    for (const segment of route.split("/").filter(Boolean)) {
      if (!node.children.has(segment))
        node.children.set(segment, { name: segment, children: new Map() });
      node = node.children.get(segment);
    }
    node.size = formatSize(fs.statSync(file).size);
  }
  if (!built) return;

  const rows = [{ label: root.name, size: root.size }];
  const walk = (node, prefix) => {
    const kids = [...node.children.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    kids.forEach((kid, index) => {
      const last = index === kids.length - 1;
      rows.push({
        prefix: prefix + (last ? "└── " : "├── "),
        label: kid.name,
        size: kid.size,
      });
      walk(kid, prefix + (last ? "    " : "│   "));
    });
  };
  walk(root, "");

  const width = Math.max(
    ...rows.map((row) => (row.prefix || "").length + row.label.length),
  );
  const sizeWidth = Math.max(...rows.map((row) => (row.size || "").length));
  console.log("");
  for (const row of rows) {
    const branch =
      colors("white", row.prefix || "") + colors("cyan", row.label);
    if (!row.size) {
      console.log(branch);
      continue;
    }
    const gap = " ".repeat(
      width - (row.prefix || "").length - row.label.length + 3,
    );
    console.log(branch + gap + colors("white", row.size.padStart(sizeWidth)));
  }
  console.log("");
}

async function ssg() {
  console.log("");
  const patterns = routerRoutes();
  const routes = [...patterns];
  if (fs.existsSync(sitemapPath)) routes.push(...(await sitemapRoutes()));

  const finalRoutes = [...new Set(routes)].filter(
    (route) => !route.includes("/:"),
  );
  info(`SSG: ${finalRoutes.length} route(s) to prerender`);

  const count = writeShells(finalRoutes, patterns);
  info(`SSG: created ${count + 1} index.html file(s) into dist`);

  const prerendered = await prerender(finalRoutes);
  info(`SSG: prerendered ${prerendered} page(s)`);

  const listed = writeSitemapXml(finalRoutes);
  info(`SSG: sitemap.xml lists ${listed} URL(s)`);

  printRoutesTree(finalRoutes);
}

module.exports = ssg;
module.exports.ensurePuppeteer = ensurePuppeteer;
module.exports.siteUrl = siteUrl;
module.exports.ssgDelay = ssgDelay;
module.exports.readDelay = readDelay;
