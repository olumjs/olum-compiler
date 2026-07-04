// todo check changed files only to be copied, use this project https://github.com/eissapk/diff
const path = require("path");
const fs = require("fs");
const { copy, remove, ls, generateRouteManifest, generateImports, generateRoutes } = require("../lib/helpers");
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
        // modify main.js file import paths -- old concept for main.js that was wriiten manullly but user
        // const mainJsPath = path.resolve(__dirname, "../src/main.js");
        // if (fs.existsSync(mainJsPath)) {
        //   let mainJsContent = fs.readFileSync(mainJsPath).toString();
        //   mainJsContent = rewriteImports(mainJsContent);
        //   fs.writeFileSync(mainJsPath, mainJsContent);
        // }

        // clean routes
        let routes = ls(entryPoint, { absolute: true });
        routes = routes.filter((item) => {
          const extension = path.extname(item);
          const isDir = fs.lstatSync(item).isDirectory();
          const isHtml = fs.lstatSync(item).isFile() && extension == ".html";
          if (isDir || isHtml && !item.includes("components")) return item;
        });
        // generate routes manifest
        const manifest = generateRouteManifest(routes, entryPoint);
        let has404Page = false;
        if (manifest['not-found']) has404Page = true;
        const libImports = `import Olum from "/node_modules/olum/dist/olum.js";\nimport Router from "/node_modules/olum-router/dist/router.js";`;
        // const libImports = `import Olum from "../core/olum.js";\nimport Router from "../core/router.js";`; // for testing 
        const imports = generateImports(manifest).replace(/.html/g, ".js"); // fix extension by replacing .html with .js since components are js modules
        const config = `const config = { mode: "history", root: "/", ${has404Page? `err: "/404",` : "" } routes: routes };\nconst router = new Router(config);\nnew Olum().$("#app").use(router);`;
        routes = generateRoutes(manifest);
        // console.log(libImports);
        // console.log(imports);
        // console.log(routes);
        // console.log(config);

        // automated main.js -- new concept
        const mainJsPath = path.resolve(__dirname, "../src/main.js");
        fs.writeFileSync(mainJsPath, `${libImports}\n${imports}\n${routes}\n${config}`);
      });
      copy(entryPoint2, path.resolve(__dirname, "../public"), () => {
        const indexHtmlPath = path.resolve(__dirname, "../public/index.html");
        let indexHtmlContent = fs.readFileSync(indexHtmlPath).toString();
        // auto bind div#app placeholder and mainjs script to index.html
        indexHtmlContent = indexHtmlContent.replace(/<\/body>/, `\n<div id="app"></div>\n<script defer type="module" src="../src/main.js"></script>\n</body>`);
        fs.writeFileSync(indexHtmlPath, indexHtmlContent);
      });
      resolve();
    } catch (err) {
      reject();
    }
  });
};
