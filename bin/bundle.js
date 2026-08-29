const path = require("path");
const fs = require("fs");
const colors = require("../lib/colors");
const spawn = require("../lib/cross-spawn");
const { useLocalCore, localLibs, optionalLibs } = require("../lib/coreLibs");

const cwd = process.cwd();
const public = path.resolve(__dirname, "../public");
const root = cwd.replace(/\/module$/, "");
const outDir = path.resolve(root, "dist");

function getLogs() {
  const logFilePath = path.resolve(__dirname, "../lib/log.txt");
  if (fs.existsSync(logFilePath)) {
    return fs.readFileSync(logFilePath).toString();
  } else {
    return null;
  }
}

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

function absorbedFiles(buildResult) {
  const absorbed = new Set();
  for (const res of [buildResult].flat()) {
    for (const item of res.output || []) {
      for (const orig of item.originalFileNames || [])
        absorbed.add(path.resolve(public, orig));
    }
  }

  const html = fs.readFileSync(path.join(public, "index.html"), "utf8");
  const attrRegex = /(?:href|src)=["']([^"']+)["']/g;
  let match;
  while ((match = attrRegex.exec(html))) {
    const url = match[1];
    if (/^(https?:)?\/\//.test(url)) continue;
    absorbed.add(path.resolve(public, url.replace(/^\//, "")));
  }
  return absorbed;
}

function ensureVite() {
  if (fs.existsSync(path.join(root, "node_modules/vite/package.json"))) return;
  console.log(
    colors(
      "white",
      "vite not found — installing it into the project root (one-time)...",
    ),
  );

  const result = spawn.sync(
    "npm",
    ["install", "--save-dev", "--include=dev", "vite"],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error(
      "Failed to install vite — run `npm i -D vite` in " +
        root +
        " then re-run the build.",
    );
}

async function bundle(bootAt) {
  const logs = getLogs();
  if (logs) {
    console.error(
      colors("red", "Bundle skipped — fix the compiler errors above first."),
    );
    process.exitCode = 1;
    return;
  }

  ensureVite();
  const { build } = await import("vite");

  const alias = {};
  if (useLocalCore) {
    for (const [pkgName, corePath] of Object.entries(localLibs)) {
      alias[pkgName] = path.resolve(__dirname, ".." + corePath);
    }
  }

  const external = useLocalCore
    ? []
    : optionalLibs.filter(
        (pkgName) => !fs.existsSync(path.join(root, "node_modules", pkgName)),
      );

  const buildResult = await build({
    root: public,
    resolve: { alias },

    define: { "globalThis.__OLUM_DEV__": "false" },
    build: {
      outDir,
      emptyOutDir: true,

      assetsInlineLimit: 0,
      rollupOptions: {
        external,
        output: {
          assetFileNames(info) {
            const orig = (info.originalFileNames || [])[0];
            const name = (info.names || [])[0] || "";
            if (
              orig &&
              !orig.startsWith("..") &&
              !path.isAbsolute(orig) &&
              path.extname(orig) === path.extname(name)
            ) {
              return orig;
            }
            return "assets/[name]-[hash][extname]";
          },
        },
      },
    },
  });

  copyStatic(public, outDir, absorbedFiles(buildResult));
}

module.exports = bundle;
module.exports.ensureVite = ensureVite;
