const path = require("path");
const fs = require("fs");
const { copy, compileRoutes } = require("../lib/helpers");
const importMap = require("../lib/importMap");

const cwd = process.cwd();
const entryPoint = path.resolve(cwd.replace(/\/module$/, ""), "src");
const entryPoint2 = path.resolve(cwd.replace(/\/module$/, ""), "public");

const srcDest = path.resolve(__dirname, "../src");
const publicDest = path.resolve(__dirname, "../public");
const indexHtmlDest = path.resolve(__dirname, "../public/index.html");
const mainJsPathDest = path.resolve(__dirname, "../src/main.js");

function injectIndexHtml(indexHtmlPath) {
  let indexHtmlContent = fs.readFileSync(indexHtmlPath).toString();

  const importMapTag =
    process.env.NODE_ENV === "production" ? "" : `${importMap(entryPoint)}\n`;
  indexHtmlContent = indexHtmlContent.replace(
    /<\/body>/,
    `\n<div id="app"></div>\n${importMapTag}<script defer type="module" src="../src/main.js"></script>\n</body>`,
  );
  fs.writeFileSync(indexHtmlPath, indexHtmlContent);
}

function handleMainJs() {
  if (fs.existsSync(mainJsPathDest)) return;
  const mainJsContent = compileRoutes(entryPoint);

  fs.writeFileSync(mainJsPathDest, mainJsContent);
}

function syncFile(event, file) {
  if (!fs.existsSync(mainJsPathDest) || !fs.existsSync(indexHtmlDest))
    return null;
  const inSrc = file.startsWith(entryPoint + path.sep);
  const inPublic = !inSrc && file.startsWith(entryPoint2 + path.sep);
  if (!inSrc && !inPublic) return null;
  const dest = inSrc
    ? path.join(srcDest, path.relative(entryPoint, file))
    : path.join(publicDest, path.relative(entryPoint2, file));
  if (event.startsWith("unlink")) {
    fs.rmSync(dest, { recursive: true, force: true });
    if (inSrc && dest.endsWith(".html"))
      fs.rmSync(dest.replace(/\.html$/, ".js"), { force: true });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
    if (dest === indexHtmlDest) injectIndexHtml(dest);
  }

  const affectsRoutes =
    inSrc &&
    event !== "change" &&
    (dest.endsWith(".html") ||
      event === "unlinkDir" ||
      dest === mainJsPathDest);
  if (affectsRoutes && !fs.existsSync(path.join(entryPoint, "main.js")))
    fs.writeFileSync(mainJsPathDest, compileRoutes(entryPoint));
  return dest;
}

module.exports = function copySrc(event, file) {
  return new Promise((resolve, reject) => {
    try {
      if (event) {
        const dest = syncFile(event, file);
        if (dest) return resolve(dest);
      }

      fs.rmSync(publicDest, { recursive: true, force: true });
      fs.rmSync(srcDest, { recursive: true, force: true });

      copy(entryPoint, srcDest, () => handleMainJs());
      copy(entryPoint2, publicDest, () => injectIndexHtml(indexHtmlDest));

      resolve(null);
    } catch (err) {
      reject(err);
    }
  });
};
