// todo check changed files only to be copied, use this project https://github.com/eissapk/diff
const path = require("path");
const fs = require("fs");
const { copy, remove, compileRoutes } = require("../lib/helpers");
const importMap = require("../lib/importMap");
const entryPoint = path.resolve(process.cwd(), "src").replace(/\/module/, "");
const entryPoint2 = path.resolve(process.cwd(), "public").replace(/\/module/, "");

module.exports = function copySrc() {
  return new Promise((resolve, reject) => {
    try {
      // clean
      if (fs.existsSync(path.resolve(__dirname, "../public"))) remove(path.resolve(__dirname, "../public"));
      if (fs.existsSync(path.resolve(__dirname, "../src"))) remove(path.resolve(__dirname, "../src"));
      // copy
      copy(entryPoint, path.resolve(__dirname, "../src"), () => {
        const mainJsContent = compileRoutes(entryPoint);
        // automated main.js -- new concept
        const mainJsPath = path.resolve(__dirname, "../src/main.js");
        fs.writeFileSync(mainJsPath, mainJsContent);
      });
      copy(entryPoint2, path.resolve(__dirname, "../public"), () => {
        const indexHtmlPath = path.resolve(__dirname, "../public/index.html");
        let indexHtmlContent = fs.readFileSync(indexHtmlPath).toString();
        // auto bind div#app placeholder, import map and mainjs script to index.html
        // (import map must precede the module script so bare imports resolve)
        indexHtmlContent = indexHtmlContent.replace(/<\/body>/, `\n<div id="app"></div>\n${importMap(entryPoint)}\n<script defer type="module" src="../src/main.js"></script>\n</body>`);
        fs.writeFileSync(indexHtmlPath, indexHtmlContent);
      });
      resolve();
    } catch (err) {
      reject();
    }
  });
};
