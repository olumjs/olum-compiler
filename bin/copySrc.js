const path = require("path");
const fs = require("fs");
const { copy, compileRoutes } = require("../lib/helpers");
const importMap = require("../lib/importMap");
// src paths (inside user project root path)
const cwd = process.cwd();
const entryPoint = path.resolve(cwd.replace(/\/module$/, ""), "src")
const entryPoint2 = path.resolve(cwd.replace(/\/module$/, ""), "public")
// dest paths (inside node_modules)
const srcDest = path.resolve(__dirname, "../src");
const publicDest = path.resolve(__dirname, "../public");
const indexHtmlDest = path.resolve(__dirname, "../public/index.html");
const mainJsPathDest = path.resolve(__dirname, "../src/main.js");

// auto bind div#app placeholder, import map and mainjs script to index.html
// (import map must precede the module script so bare imports resolve)
function injectIndexHtml(indexHtmlPath) {
  let indexHtmlContent = fs.readFileSync(indexHtmlPath).toString();
  // production bundles bare imports, so the dev-only import map never enters the build output
  const importMapTag = process.env.NODE_ENV === "production" ? "" : `${importMap(entryPoint)}\n`;
  indexHtmlContent = indexHtmlContent.replace(/<\/body>/, `\n<div id="app"></div>\n${importMapTag}<script defer type="module" src="../src/main.js"></script>\n</body>`);
  fs.writeFileSync(indexHtmlPath, indexHtmlContent);
}

function handleMainJs () {
  if (fs.existsSync(mainJsPathDest)) return; // skip main.js automation since user wants to drop router
  const mainJsContent = compileRoutes(entryPoint);
  // automated main.js -- new concept
  fs.writeFileSync(mainJsPathDest, mainJsContent);
}

// Mirror one watcher event into module/{src,public} and keep the automated
// main.js in step. Returns the mirrored path — or null when only the full
// flow can help (path outside both roots, or dest scaffolding deleted by hand).
function syncFile(event, file) {
  if (!fs.existsSync(mainJsPathDest) || !fs.existsSync(indexHtmlDest)) return null; // dest scaffolding deleted by hand → full flow
  const inSrc = file.startsWith(entryPoint + path.sep); // src/... → module/src/...
  const inPublic = !inSrc && file.startsWith(entryPoint2 + path.sep); // public/... → module/public/...
  if (!inSrc && !inPublic) return null; // outside both roots → full flow
  const dest = inSrc ? path.join(srcDest, path.relative(entryPoint, file)) : path.join(publicDest, path.relative(entryPoint2, file));
  if (event.startsWith("unlink")) { // file or dir was deleted → remove its mirror
    fs.rmSync(dest, { recursive: true, force: true }); // file or dir alike (helpers.remove is dir-only and crashes on empty dirs)
    if (inSrc && dest.endsWith(".html")) fs.rmSync(dest.replace(/\.html$/, ".js"), { force: true }); // and the compiled .js twin of a src component
  } else { // file was added or edited → copy just it
    fs.mkdirSync(path.dirname(dest), { recursive: true }); // make sure the mirror folder exists (mkdir, NOT remove!)
    fs.copyFileSync(file, dest); // copy just this one file
    if (dest === indexHtmlDest) injectIndexHtml(dest); // re-inject #app + import map + main.js script
  }
  // routes only change when a page (.html), a whole dir, or main.js itself is added/removed under src —
  // anything narrower (assets, utils, edits) skips the compileRoutes tree scan entirely
  const affectsRoutes = inSrc && event !== "change" && (dest.endsWith(".html") || event === "unlinkDir" || dest === mainJsPathDest);
  if (affectsRoutes && !fs.existsSync(path.join(entryPoint, "main.js"))) fs.writeFileSync(mainJsPathDest, compileRoutes(entryPoint)); // refresh automated main.js (skipped when user owns it)
  return dest; // tell the caller what was mirrored
}

// copySrc()            → full flow: wipe dest, clone src+public (first build / fallback)
// copySrc(event, file) → incremental: mirror that one watcher event only
// Resolves with the mirrored dest path, or null when the full flow ran.
module.exports = function copySrc(event, file) {
  return new Promise((resolve, reject) => {
    try {
      if (event) { // watcher event → try the incremental path first
        const dest = syncFile(event, file); // mirror just this one change
        if (dest) return resolve(dest); // done — falls through to the full flow otherwise
      }
      // clean (rmSync handles missing, empty and nested dirs alike —
      // helpers.remove crashes on missing/empty dirs)
      fs.rmSync(publicDest, { recursive: true, force: true });
      fs.rmSync(srcDest, { recursive: true, force: true });
      // copy
      copy(entryPoint, srcDest, () => handleMainJs());
      copy(entryPoint2, publicDest, () => injectIndexHtml(indexHtmlDest));

      resolve(null);
    } catch (err) {
      reject(err);
    }
  });
};
