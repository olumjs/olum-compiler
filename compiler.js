#!/usr/bin/env node

/**
 * @name olum-compiler
 * @copyright 2021
 * @author Eissa Saber
 * @license MIT
 */
const commander = require("commander");
const cmd = new commander.Command();
const sass = require("sass");
const autoprefixer = require("autoprefixer");
const cssnano = require('cssnano');
const postcss = require("postcss");
const fs = require("fs");
const extra = require("fs-extra");
const path = require("path");
const colors = require("colors");

// helpers
const isDebugging = false;
const debugLib = arg => (isDebugging ? console.log(arg) : "");
const quotes = (msg, color = "grey") => `'${colors[color].bold(msg)}'`;
const log = (type, path, err) => quotes(`\n${type} : ${path.replace(/[\/|\\]node_modules[\/|\\]olum-compiler/g,"")}`, "white") + "\n" + colors.red.bold(err);
const isObj = obj => !!(obj !== null && typeof obj === "object");
const isFullArr = arr => !!(isObj(arr) && Array.isArray(arr) && arr.length);
const isDef = val => !!(val !== undefined && val !== null);
const flatten = lists => lists.reduce((a, b) => a.concat(b), []);
const mkRegex = arr => {
  const pattern = arr.map(str => `${str.toLowerCase().trim()}|`).join("").slice(0, -1);
  const regex = new RegExp(pattern, "gi");
  return regex;
};

class Compiler {
  regex = {
    template: {
      all: /<template[\s\S]*?>[\s\S]*?<\/template>/gi,
      tag: /<template[\s\S]*?>|<\/template>/gi,
      component: /(?<=<)[A-Z]([^/>]+)(?=\/>)/g, // detect <App/> or <App-Nav/>
      comment: /\<\!\-\-(.|\s)*?\-\-\>/gi
    },
    script: {
      all: /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      tag: /<script[\s\S]*?>|<\/script>/gi,
      classStartPoint: /(class .*)(\{)/,
    },
    style: {
      all: /<style[\s\S]*?>[\s\S]*?<\/style>/gi,
      tag: /<style[\s\S]*?>|<\/style>/gi,
      openTag: /<style[\s\S]*?>/gi,
      comment: /(\/\*)([\s\S]*?)(\*\/)|(\/\/.*)/gi
    },
  };

  constructor() {
    cmd.command("clean [dir]").action(this.clean.bind(this));
    cmd.command("compile [mode]").action(this.init.bind(this));
    cmd.parse(process.argv);
  }
  
  isHTML(path) {
    const arr = path.split(".");
    const lastItem = arr[arr.length-1]; 
    if (lastItem.trim().toLowerCase() === "html") return true;
    return false;
  }

  getPaths(base = "../../src") {
    return new Promise((resolve, reject) => {
      const dirs = src => fs.readdirSync(src).map(item => path.join(src, item)).filter(item => fs.statSync(item).isDirectory());
      const recursive = src => [src, ...flatten(dirs(src).map(recursive))];
      const directories = recursive(base);
      debugLib(["all directories", directories]);
      
      if (!isFullArr(directories)) return reject("No directories found !");
      const lastDir = directories[directories.length - 1];
      
      // get all html files 
      this.paths = [];
      [...directories].forEach((dir, index) => {
        fs.readdir(path.resolve(dir), (err, files) => {
          if (err) return reject(err);
          
          files.forEach((file, ind) => {
            const lastFile = files[files.length - 1];
            const item = path.join(dir, file);
            if (!fs.statSync(item).isDirectory() && this.isHTML(item)) this.paths.push(item.trim().replace(/src/, "node_modules/olum-compiler/"+"src")); // push files only and exclude directories
            if (directories.indexOf(lastDir) === index && files.indexOf(lastFile) === ind) {
              const msg = `Created ${quotes("Paths", "blue")} Tree.`;
              debugLib(["Final paths",this.paths]);
              debugLib(msg);
              resolve();
            }
          });
        });
      })
      
    });
  }

  clean(dir) {
    return new Promise((resolve, reject) => {
      if (dir === "src") { // clean src folder which is ".pre-build"
        if (fs.existsSync("src")) { // if folder exists
          extra.remove(path.resolve(__dirname, "src"), err => {
            if (err) return reject(err);
            const msg = `Deleted ${quotes("src", "red")} Directory.`;
            debugLib(msg);
            resolve();
          });
        } else resolve();
      } else if (dir === "dest") { // clean dest folder which is "build"
        if (fs.existsSync("build")) { // if folder exists
          extra.remove(path.resolve(__dirname, "build"), err => {
            if (err) return reject(err);
            const msg = `Deleted ${quotes("build", "red")} Directory.`;
            debugLib(msg);
            resolve();
          });
        } else resolve();
      }
    });
  }

  copy() {
    return new Promise((resolve, reject) => {
      extra.copy(path.resolve(__dirname, "../../src"), path.resolve(__dirname, "src"), err => {
        if (err) return reject(err);
        const msg = `Copied & renamed ${quotes("src", "green")} Directory → ${quotes("src", "yellow")}`;
        debugLib(msg);
        // delete public folder if it exists
        if (fs.existsSync(path.resolve(__dirname,"./public"))) {
          extra.remove(path.resolve(__dirname,"./public"), err => {
            if (err) return reject(err);
            // copy public from root to node_module/olum-compiler
            extra.copy(path.resolve(__dirname, "../../public"), path.resolve(__dirname,"./public"), err => {
              if (err) return reject(err);
              const msg = `Copied & renamed ${quotes("public", "green")} Directory`;
              debugLib(msg);
              resolve();
            });
          });
        } else {
          // copy public from root to node_module/olum-compiler
          extra.copy(path.resolve(__dirname, "../../public"), path.resolve(__dirname,"./public"), err => {
            if (err) return reject(err);
            const msg = `Copied & renamed ${quotes("public", "green")} Directory`;
            debugLib(msg);
            resolve();
          });
        }
      });
    });
  }

  sharedStyle() {
    const file = path.resolve(__dirname, "../../src/styles/shared.scss");
    return new Promise((resolve, reject) => {
      if (fs.existsSync(file)) {
        fs.readFile(file, "utf8", (err, data) => {
          if (err) return reject(err);
          const msg = `Copied ${quotes("shared", "green")} Style.`;
          debugLib(msg);
          resolve(data.trim());
        });
      } else {
        resolve("");
      }
    });
  }

  compiledSharedStyle(shared) {
    const file = path.resolve(__dirname, "../../src/styles/shared.scss");
    return new Promise((resolve, reject) => {
      try {
        // compile sass to css 
        const compiled = sass.renderSync({
          data: shared
        }).css.toString();
        const msg = `Compiled ${quotes("shared", "green")} Style.`;
        debugLib(msg);
        resolve(compiled);
      } catch (err) { // error related to Sass
        reject(log("Sass Compiler", file, err));
      }
    });
  }

  hasSASS(style) {
    const regex = new RegExp("lang=['\"]scss|sass['\"]", "gi");
    const openTagArr = style.match(this.regex.style.openTag);
    const openTag = isFullArr(openTagArr) ? openTagArr[0] : "";
    return regex.test(openTag);
  }

  /* stringify template litrals placeholder ${} before sass/postcss */
  stringify(string, file) {
    const regex = new RegExp(`(\\$\\{+[\\w|\\.]+\\})`, "gi"); // detects => ${}
    let arr = string.match(regex);
    arr = isFullArr(arr) ? arr : [];
    arr.forEach(item => {
      debugLib(`Stringified template litrals placeholder ${quotes(item, "red")} in <style> : ${quotes(file.trim().replace("src", "src"), "yellow")}`);
      string = string.replace(regex, `"$1"`);
    });
    return string;
  }

  /* parse template litrals placeholder ${} after sass/postcss */
  parse(string, file) {
    const regex = new RegExp(`(\\s?\\"(\\$\\{+[\\w|\\.]+\\})\\"\\s?)`, "gi"); // detects => "${}"
    let arr = string.match(regex);
    arr = isFullArr(arr) ? arr : [];
    arr.forEach(item => {
      debugLib(`Parsed template litrals placeholder ${quotes(item, "green")} in <style> : ${quotes(file.trim().replace("src", "src"), "yellow")}`);
      string = string.replace(regex, "$2");
    });
    return string;
  }
  
  styleImporter(file, scss) {
    return new Promise ((resolve, reject) => {
      // extend css to outside component file - initial test
      const importRegex =  /(\/*|\/\/)=?.*(@import)\s+((\'|\").*(\'|\"));?/gi;
      const imports = scss.match(importRegex);
      debugLib(["Style Import statements\n", imports]);
      
      if (isFullArr(imports)) {
        imports.map(imp => {
          if (!imp.trim().startsWith("/")) { // detect non-commented @import
            const scssPath = imp.replace(/\@import|\s|'|"|;/g, "").trim();
            const scssFullPath = file.replace(path.basename(file), "") + scssPath;
            debugLib(["Style paths\n", {imp, scssPath, scssFullPath}]);
            
            if (fs.existsSync(scssFullPath)) {
              fs.readFile(scssFullPath, "utf8", (err, data) => {
                if (err) return reject(err);
                debugLib(["Style module content\n", data]);
                
                scss = scss.replace(imp, data); // substitute with import statement content
                return resolve(scss);
              });
              
            } else {
              return reject("Style file doesn't exist in this path '" + scssPath + "'");
            }
          }
        });
      } else {
        return resolve(scss);
      }

    });
  }
  
  css(file, data, shared, compiledShared) {
    return new Promise((resolve, reject) => {
      const styleArr = data.match(this.regex.style.all);
      const style = isFullArr(styleArr) ? styleArr[styleArr.length - 1] : ""; // get last style tag as the order of component file | because you may have style tag inside the class "script tag"
      let scss = style.replace(this.regex.style.tag, ""); // remove style tag
      scss = scss.replace(this.regex.style.comment, ""); // remove block/inline comments
      
      this.styleImporter(file, scss).then(_scss => {
        _scss = this.stringify(_scss, file);
        
        try {
          // compile sass to css 
          const css = this.hasSASS(style) ? sass.renderSync({
            data: shared + _scss
          }).css.toString() : compiledShared + _scss;
  
          if (this.mode === "development") { // development
            const parsedDev = this.parse(css, file);
            resolve("\n style() { \n return `" + parsedDev + "`;\n}\n");
  
          } else if (this.mode === "production") { // production
            // prefix & minify css
            postcss([autoprefixer, cssnano]).process(css, {
              from: undefined
            }).then(result => {
              result.warnings().forEach(warn => console.warn(colors.yellow.bold(warn.toString())));
              const parsedBuild = this.parse(result.css, file);
              resolve("\n style() { \n return `" + parsedBuild + "`;\n}\n");
            }).catch(err => reject(log("PostCSS - [autoprefixer, cssnano]", file, err.reason + "\n" + err.showSourceCode())));
          }
  
        } catch (err) { // error related to Sass
          reject(log("Sass Compiler", file, err));
        }

      }).catch(err => reject(log("Style Importer", file, err)));
      
    });
  }

  html(data) {
    return new Promise(resolve => {
      const tempArr = data.match(this.regex.template.all);
      const template = isFullArr(tempArr) ? tempArr[0] : ""; // get 1st template tag as the order of component file
      const markup = template.replace(this.regex.template.tag, "");
      const cleanHTML = markup.replace(this.regex.template.comment, ""); // clean html from comments
      const html = "\n template() { \n return `" + cleanHTML + "`;\n}\n";
      resolve(html);
    });
  }

  js(file, data) {
    return new Promise((resolve, reject) => {
      const scriptArr = data.match(this.regex.script.all);
      const script = isFullArr(scriptArr) ? scriptArr[0] : ""; // get 1st script tag as the order of component file
      let js = script.replace(this.regex.script.tag, "");
      
      // start replace .html extension from import statements with .js
      const imports = this.getImportStatement(js); // get all import statements
      const htmlExtRegex = /\.html/gi;
      imports.forEach(imp => {
        if (htmlExtRegex.test(imp)) {
          debugLib({imp})
          js = js.replace(htmlExtRegex, ".js");
        }
      });
      // end replace .html extension from import statements with .js
      
      const hasJsClass = this.regex.script.classStartPoint.test(js);
      if (hasJsClass) resolve(js);
      else reject(log("JS Class", file, "Couldn't find a class"));
    });
  }

  modifyExt(file) {
    const arr = file.split(".");
    const ext = arr[arr.length - 1];
    return file.replace(ext, "") + "js";
  }

  // start auto inject data method
  getModuleName(str) {
    return str.replace(/import|from|\;|("|').*("|')|\s/gi, "").trim();
  }

  getImportStatement(str) {
    return str.match(/(import).*/g) || [];
  }
  
  getClassName(js) {
    let str = js.match(this.regex.script.classStartPoint)[0].replace(/\{/g, "");
    let arr = str.split(" ");
    arr = arr.filter(item => item.trim() != "");
    const classIndex = arr.indexOf("class");
    const name = arr[classIndex+1];
    return name;
  }
  // end auto inject data method

  merge(html, css, js) {
    // start auto inject data method
    const imports = this.getImportStatement(js); // get all import statements
    const modulesNames = imports.map(statement => this.getModuleName(statement)); // extract modules names 
    const cleanHTML = html.replace(this.regex.template.comment, ""); // clean html from comments
    const components = cleanHTML.match(this.regex.template.component) || []; // get components tags
    const componentsNames = components.map(name => name.replace(/(.*)(\-)/, "").trim()); // remove prefix
    const className = this.getClassName(js);

    let dataMethod;
    if (isFullArr(modulesNames) && isFullArr(componentsNames)) { // there are components
      debugLib("components exist");
      const finalNames = [];
      modulesNames.forEach(moduleName => componentsNames.forEach(compName => (moduleName !== "" && moduleName === compName) ? finalNames.push(moduleName) : null));
      dataMethod = `
        olumCompData() {
          return {
            name: "${className}",
            components: { ${finalNames.join(", ")} },
            template: this.template(),
            style: this.style(),
            render: this.render.bind(this),
          };
        }
      `;
    } else { // NO components
      debugLib("components DON'T exist");
      dataMethod = `
        olumCompData() {
          return {
            name: "${className}",
            components: {},
            template: this.template(),
            style: this.style(),
            render: this.render.bind(this),
          };
        }
      `;
    }

    debugLib({ html });
    debugLib({ componentsNames });
    debugLib({ modulesNames });
    debugLib({ dataMethod });
    // end auto inject data method

    return new Promise((resolve, reject) => {
      let classSentence = js.match(this.regex.script.classStartPoint);
      if (isFullArr(classSentence)) {
        classSentence = classSentence[0];
        const file = js.replace(classSentence, classSentence + dataMethod + html + css);
        return resolve(file);
      } else {
        return reject("Couldn't find a JS Class");
      }
    });
  }

  createFile(oldPath, newPath, compiledFile) {
    return new Promise((resolve, reject) => {
      fs.rename(oldPath, newPath, err => {
        if (err) return reject(err);
        fs.writeFile(newPath, compiledFile, err => {
          if (err) return reject(err);
          // debugLib("Created " + quotes(path.basename(newPath), "green"));
          resolve();
        });
      });
    });
  }

  update(shared, compiledShared) {
    if (isDef(this.paths) && isFullArr(this.paths)) {
      const recursive = num => {
        const file = this.paths[num].trim();
        const newPath = this.modifyExt(file);

        fs.readFile(file, "utf8", (err, data) => {
          if (err) return console.error(colors.red.bold(err));

          (async () => {
            try {
              const html = await this.html(data);
              const css = await this.css(file, data, shared, compiledShared);
              const js = await this.js(file, data);
              const compiledFile = await this.merge(html, css, js);
              await this.createFile(file, newPath, compiledFile);

              if (num + 1 <= this.paths.length - 1) recursive(num + 1); // next
            } catch (err) {
              console.error(err);
            }
          })();

        });
      };
      recursive(0);
    } else {
      const msg = `No ${quotes("components", "red")} to compile.`;
      console.warn(msg);
    }
  }

  async init(mode) {
    // detect mode 
    mode = typeof mode != "undefined" && mode === "dev" ? "development" : "production";
    this.mode = mode;
    debugLib(`Compiling in ${quotes(this.mode, "green")} mode...`);

    try {
      await this.getPaths(path.resolve(__dirname,"../../src"));
      await this.clean("src"); // clean src folder which is ".pre-build"
      await this.copy();
      const shared = await this.sharedStyle();
      const compiledShared = await this.compiledSharedStyle(shared);
      this.update(shared, compiledShared);
      debugLib(`Updated ${quotes("Components", "green")}`);
    } catch (err) {
      console.error(colors.red.bold(err));
    }
  }
}

new Compiler();