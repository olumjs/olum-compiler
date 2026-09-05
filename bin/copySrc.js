const path = require("path");
const fs = require("fs");
const { copy, compileRoutes, ls, isFile } = require("../lib/helpers");
const importMap = require("../lib/importMap");
const usage = require("../lib/usage");
const splitJsBarrels = require("../lib/jsBarrels");
const resolveAliases = require("../lib/alias");

const cwd = process.cwd();
const projectRoot = cwd.replace(/\/module$/, "");
const entryPoint = path.resolve(projectRoot, "src");
const entryPoint2 = path.resolve(projectRoot, "public");

const devtoolSrc = path.resolve(
  cwd.replace(/\/module$/, ""),
  "node_modules/olum-devtool/dist",
);
const devtoolScript = path.resolve(devtoolSrc, "./script.js");
const devtoolEnabled =
  process.env.NODE_ENV === "development" && fs.existsSync(devtoolScript);

const srcDest = path.resolve(__dirname, "../src");
const publicDest = path.resolve(__dirname, "../public");
const indexHtmlDest = path.resolve(__dirname, "../public/index.html");
const mainJsPathDest = path.resolve(__dirname, "../src/main.js");

function injectIndexHtml(indexHtmlPath) {
  let indexHtmlContent = fs.readFileSync(indexHtmlPath).toString();
  const devtoolScriptContent = devtoolEnabled
    ? "<script>" + fs.readFileSync(devtoolScript).toString() + "</script>\n"
    : "";

  const importMapTag =
    process.env.NODE_ENV === "production" ? "" : `${importMap(entryPoint)}\n`;

  const devFlagTag =
    process.env.NODE_ENV === "production"
      ? ""
      : `<script>globalThis.__OLUM_DEV__ = true;</script>\n`;
  indexHtmlContent = indexHtmlContent.replace(
    /<\/body>/,
    `\n<div id="olum-app"></div>\n${devFlagTag}${importMapTag}<script defer type="module" src="../src/main.js"></script>\n${devtoolScriptContent}</body>`,
  );
  fs.writeFileSync(indexHtmlPath, indexHtmlContent);
}

function splitCopiedJs() {
  ls(srcDest, { absolute: true }).forEach((file) => {
    if (isFile(file) && file.endsWith(".js")) {
      resolveAliases.file(file, projectRoot);
      splitJsBarrels.file(file, projectRoot);
    }
  });
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
    if (inSrc && dest.endsWith(".html")) {
      fs.rmSync(dest.replace(/\.html$/, ".js"), { force: true });
      usage.drop(dest);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
    if (inSrc && dest.endsWith(".js")) {
      resolveAliases.file(dest, projectRoot);
      splitJsBarrels.file(dest, projectRoot);
    }
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

      copy(entryPoint, srcDest, () => {
        splitCopiedJs();
        handleMainJs();
      });
      copy(entryPoint2, publicDest, () => injectIndexHtml(indexHtmlDest));

      if (devtoolEnabled) {
        fs.mkdirSync(publicDest + "/__olum_devtool", {
          recursive: true,
          force: true,
        });
        copy(devtoolSrc, publicDest + "/__olum_devtool");
      }

      resolve(null);
    } catch (err) {
      reject(err);
    }
  });
};
