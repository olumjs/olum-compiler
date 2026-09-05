const { compExt } = require("./regex");
const colors = require("./colors");
const path = require("path");
const fs = require("fs");
const process = require("process");
const id = () => "_" + Math.random().toString(36).slice(2);
const isObj = (obj) => !!(obj !== null && typeof obj === "object");
const isFullArr = (arr) => !!(isObj(arr) && Array.isArray(arr) && arr.length);
const isDef = (val) => !!(val !== undefined && val !== null);
const flatten = (lists) => lists.reduce((a, b) => a.concat(b), []);
const isHTML = (str) => compExt.test(str);
const isFile = (item) => !fs.statSync(item).isDirectory();
const isDir = (item) => fs.statSync(item).isDirectory();
const isWin = () => !["linux", "darwin"].includes(process.platform);
const hasForwardSlash = (paths) => paths.find((item) => /\//g.test(item));
const hasSlash = (paths) =>
  paths.find((item) => /\//g.test(item) || /\\/g.test(item));
const stringToBase64 = (str) => Buffer.from(str).toString("base64");
const base64ToString = (base64) =>
  Buffer.from(base64, "base64").toString("ascii");
const acorn = require("acorn");

const routesPath = path.resolve(__dirname, "../routes.json");

const cleanParentheses = (filePath, type = "name") => {
  if (type == "name") {
    return filePath.replace(/\([^)]*\)/g, "");
  } else if (type == "url") {
    return filePath.replace(/\([^)]*\)\//g, "");
  }
  return filePath;
};

const cleanNumbersPrefix = (name, type = "name") => {
  if (type === "url") {
    const trimmedDigit =
      name.match(/(?:^|\/)(\d+)-/)?.[1] ?? name.match(/-(\d+)$/)?.[1] ?? "";
    return {
      name: name.replace(/(^|\/)\d+-/g, "$1"),
      trimmedDigit,
    };
  }

  const trimmedDigit =
    name.match(/^(\d+)/)?.[1] ?? name.match(/(\d+)$/)?.[1] ?? "";
  return {
    name: name.replace(/\d+-?/g, ""),
    trimmedDigit,
  };
};

function isUpper(char) {
  const upperChar = char.toUpperCase();
  const regex = new RegExp(upperChar);
  return regex.test(char);
}
function isNum(str) {
  if (
    ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(str.trim()[0])
  )
    return true;
  return false;
}
function toLower(str) {
  return str.toLowerCase();
}
function toUpper(str) {
  return str.toUpperCase();
}

function ls(src, opt) {
  let paths = [];

  if (!fs.existsSync(src)) {
    console.error(colors("red", src + " doesn't exist!"));
    return paths;
  }

  if (!fs.statSync(src).isDirectory()) {
    console.error(colors("red", src + " is NOT a directory!"));
    return paths;
  }

  let items = fs.readdirSync(src);
  items = items.map((item) => path.join(src, item));
  recursive(items);

  function recursive(arr) {
    if (!arr.length) return paths;
    arr.forEach(function (item) {
      paths.push(item);
      if (isDir(item)) {
        let newItems = fs.readdirSync(item);
        newItems = newItems.map((newItem) => path.join(item, newItem));
        recursive(newItems);
      }
    });
  }

  if (opt && opt.hasOwnProperty("absolute") && opt.absolute === false)
    paths = paths.map((item) => item.replace(src + "/", ""));

  if (hasSlash(paths)) {
    const hasForward = hasForwardSlash(paths);
    const win = isWin();
    if (win && hasForward) {
      paths = paths.map((item) => item.replace(/\//g, "\\"));
    } else if (!win && !hasForward) {
      paths = paths.map((item) => item.replace(/\\/g, "/"));
    }
  }

  return paths;
}

function copy(src, dest, cb) {
  const files = ls(src);
  let srcDir = path.basename(src);
  let destDir = path.basename(dest);
  let destDirChunck = dest.replace(destDir, "");
  let cleanDirs = [];
  let cleanFiles = [];
  let dirs = [];
  files.forEach((file) => {
    const dir = path.dirname(file);
    if (!dirs.includes(dir)) dirs.push(dir);
  });

  dirs.forEach((dir) =>
    dir.replace(new RegExp(`${srcDir}.*`), (str) =>
      cleanDirs.push(
        destDirChunck + str.replace(new RegExp(`${srcDir}`), destDir),
      ),
    ),
  );
  files.forEach((dir) =>
    dir.replace(new RegExp(`${srcDir}.*`), (str) =>
      cleanFiles.push(
        destDirChunck + str.replace(new RegExp(`${srcDir}`), destDir),
      ),
    ),
  );

  cleanDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });

  files.forEach((file, index) => {
    if (fs.lstatSync(file).isFile()) {
      const fileDest = cleanFiles[index];
      fs.copyFileSync(file, fileDest);
    }
  });
  if (cb) cb();
}

function remove(src, cb) {
  const files = ls(src);

  const upDir = path.resolve(files[0], "..");
  files.unshift(upDir);

  files.forEach((dir) => {
    if (fs.existsSync(dir) && fs.lstatSync(dir).isFile()) fs.unlinkSync(dir);
  });

  files.reverse().forEach((dir) => {
    if (fs.existsSync(dir) && fs.lstatSync(dir).isDirectory())
      fs.rmdirSync(dir);
  });
  if (cb) cb();
}

function createScopeHandler({
  stateProps,
  hasState,
  propsTobeExcluded,
  jsAttrs: attributes,
}) {
  function scopePolyfill(attrs) {
    const SCOPES = [
      "public",
      "public-props",
      "public-methods",
      "private",
      "private-props",
      "private-methods",
    ];
    const toCamel = (str) =>
      str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const results = {};

    let current = null;
    let except = [];

    function flush() {
      if (!current) return;
      const [visibility, dimension] = current.split("-");
      const query = `all=${visibility}&except=[${except.map((e) => `'${e}'`).join(",")}]`;
      if (dimension === "props") results["props-scope"] = query;
      else if (dimension === "methods") results["methods-scope"] = query;
      else {
        results["props-scope"] = query;
        results["methods-scope"] = query;
      }
    }

    for (const attr of attrs) {
      if (SCOPES.includes(attr)) {
        flush();
        current = attr;
        except = [];
      } else if (attr.startsWith("exclude-")) {
        except.push(toCamel(attr.replace("exclude-", "")));
      }
    }
    flush();

    return results;
  }

  const jsAttrs = scopePolyfill(Object.keys(attributes));
  const scope = {
    methods: { all: null, except: null },
    props: { all: null, except: null },
  };

  function toObj(arr = []) {
    return "{" + arr.join(",") + "}";
  }

  function hasStateDot(arr) {
    return !!arr.find((str) => str.startsWith("state."));
  }

  function getStateProps(exceptArr, type) {
    let propsInExcept = [];
    let arr = [];
    exceptArr.forEach((name) => {
      if (name.startsWith("state.")) {
        const propsInState = name.split(".")[1];
        if (stateProps.includes(propsInState)) propsInExcept.push(propsInState);
      }
    });
    if (type === "public")
      arr = stateProps.filter((prop) => !propsInExcept.includes(prop));
    else if (type === "private")
      arr = stateProps.filter((prop) => propsInExcept.includes(prop));
    return arr;
  }

  function getProps(exceptArr, globalNamesArr, type) {
    let namesInExcept = [];
    let arr = [];
    exceptArr.forEach((name) => {
      if (globalNamesArr.includes(name)) {
        if (name !== "state" && !name.startsWith("state."))
          namesInExcept.push(name);
      }
    });
    if (type === "public")
      arr = globalNamesArr.filter(
        (prop) => !namesInExcept.includes(prop) && prop !== "state",
      );
    if (type === "private")
      arr = globalNamesArr.filter(
        (prop) => namesInExcept.includes(prop) && prop !== "state",
      );
    return arr;
  }

  function getMethods(exceptArr, globalNamesArr, type) {
    let namesInExcept = [];
    let arr = [];
    exceptArr.forEach((name) => {
      if (globalNamesArr.includes(name)) namesInExcept.push(name);
    });
    if (type === "public")
      arr = globalNamesArr.filter((method) => !namesInExcept.includes(method));
    if (type === "private")
      arr = globalNamesArr.filter((method) => namesInExcept.includes(method));
    return arr;
  }

  function parseScope(query) {
    const obj = {};
    query = query.replace(/'/g, '"');
    const arr = query.split("&");
    if (Array.isArray(arr) && arr.length) {
      arr.forEach((fragment) => {
        const [key, value] = fragment.split("=");
        if (value.startsWith("[")) obj[key] = JSON.parse(value);
        else obj[key] = value;
      });
    }
    return obj;
  }

  function validateScope(type) {
    if (!jsAttrs[type + "-scope"]) return;
    const currentScope = parseScope(jsAttrs[type + "-scope"]);
    if (currentScope) {
      if (currentScope.all && currentScope.all.trim() !== "") {
        if (["public", "private"].includes(toLower(currentScope.all)))
          scope[type].all = toLower(currentScope.all).trim();
      }
      if (currentScope.except && isFullArr(currentScope.except)) {
        currentScope.except = currentScope.except
          .filter((item) => item && item.trim() !== "")
          .map((item) => item.trim());
        if (isFullArr(currentScope.except))
          scope[type].except = currentScope.except;
      }
    }
  }

  function shareAllProps(globalNamesArr) {
    let arr = [];
    arr = globalNamesArr
      .map((name) => {
        if (!["state", ...propsTobeExcluded].includes(name))
          return `get ${name}(){return ${name}},set ${name}(val){return ${name} = val}`;
      })
      .filter((item) => item);
    if (hasState && isFullArr(stateProps)) {
      let fragments = stateProps.map((prop) => prop + ": state." + prop);
      arr.push(
        `get state(){return olum.proxyHandlerForScope(${"{" + fragments.join(",") + "}"}, state);}`,
      );
    }
    return arr;
  }

  function handleScope(globalNamesArr, type) {
    if (globalNamesArr && isFullArr(globalNamesArr) && type) {
      if (!scope[type]) return toObj();
      if (!scope[type].all) return toObj();
      if (scope[type].all === "public") {
        if (!scope[type].except)
          return type === "methods"
            ? toObj(globalNamesArr)
            : toObj(shareAllProps(globalNamesArr));
        if (scope[type].except && isFullArr(scope[type].except)) {
          if (type === "methods") {
            let arr = [];
            let newArr = getMethods(
              scope[type].except,
              globalNamesArr,
              "public",
            );
            if (newArr.length) arr = newArr;
            else return toObj();
            return arr.length ? toObj(arr) : toObj(globalNamesArr);
          } else if (type === "props") {
            const hasStateKeywordInExcecpt = scope[type].except.find(
              (name) => name === "state",
            );
            let arr = [];
            let newArr = getProps(scope[type].except, globalNamesArr, "public");
            if (newArr.length) arr = newArr;
            arr = arr.map(
              (item) =>
                `get ${item}(){return ${item}},set ${item}(val){return ${item} = val}`,
            );
            if (hasState && isFullArr(stateProps)) {
              let publicPropsInState = [];
              if (!hasStateKeywordInExcecpt) {
                if (!hasStateDot(scope[type].except))
                  publicPropsInState = stateProps;
                else
                  publicPropsInState = getStateProps(
                    scope[type].except,
                    "public",
                  );
              }
              if (isFullArr(publicPropsInState)) {
                let fragments = publicPropsInState.map(
                  (prop) => prop + ": state." + prop,
                );
                arr.push(
                  `get state(){return olum.proxyHandlerForScope(${"{" + fragments.join(",") + "}"}, state);}`,
                );
              }
            }
            if (!newArr.length && !arr.length) return toObj();
            return arr.length
              ? toObj(arr)
              : toObj(shareAllProps(globalNamesArr));
          }
        }
      } else if (scope[type].all === "private") {
        if (!scope[type].except) return toObj();
        if (scope[type].except && isFullArr(scope[type].except)) {
          if (type === "methods") {
            let arr = [];
            arr = getMethods(scope[type].except, globalNamesArr, "private");
            return arr.length ? toObj(arr) : toObj();
          } else if (type === "props") {
            const hasStateKeywordInExcecpt = scope[type].except.find(
              (name) => name === "state",
            );
            let arr = [];
            arr = getProps(scope[type].except, globalNamesArr, "private");
            arr = arr.map(
              (item) =>
                `get ${item}(){return ${item}},set ${item}(val){return ${item} = val}`,
            );
            if (hasState && isFullArr(stateProps)) {
              let publicPropsInState = [];
              if (hasStateKeywordInExcecpt) publicPropsInState = stateProps;
              else {
                if (hasStateDot(scope[type].except))
                  publicPropsInState = getStateProps(
                    scope[type].except,
                    "private",
                  );
              }
              if (isFullArr(publicPropsInState)) {
                let fragments = publicPropsInState.map(
                  (prop) => prop + ": state." + prop,
                );
                arr.push(
                  `get state(){return olum.proxyHandlerForScope(${"{" + fragments.join(",") + "}"}, state);}`,
                );
              }
            }
            return arr.length ? toObj(arr) : toObj();
          }
        }
      }
    }
    return toObj();
  }

  validateScope("props");
  validateScope("methods");
  return handleScope;
}

function getGlobalMethods(str) {
  return acorn
    .parse(str, { ecmaVersion: "latest", sourceType: "module" })
    .body.map((obj) => {
      if (obj.type === "FunctionDeclaration") return obj.id.name;
      if (
        obj.type === "VariableDeclaration" &&
        obj.declarations &&
        Array.isArray(obj.declarations) &&
        obj.declarations.length &&
        obj.declarations[0].id &&
        obj.declarations[0].id.name &&
        obj.declarations[0].init &&
        obj.declarations[0].init.type &&
        (obj.declarations[0].init.type === "FunctionExpression" ||
          obj.declarations[0].init.type === "ArrowFunctionExpression")
      ) {
        return obj.declarations[0].id.name;
      }
    })
    .filter((item) => item);
}

function getPropsAliases(str) {
  const aliases = {};
  acorn
    .parse(str, { ecmaVersion: "latest", sourceType: "module" })
    .body.forEach((obj) => {
      if (
        obj.type !== "VariableDeclaration" ||
        !Array.isArray(obj.declarations)
      )
        return;
      obj.declarations.forEach((decl) => {
        if (
          decl.id &&
          decl.id.type === "ObjectPattern" &&
          decl.init &&
          decl.init.type === "CallExpression" &&
          decl.init.callee &&
          decl.init.callee.name === "props"
        ) {
          decl.id.properties.forEach((prop) => {
            if (
              prop.type === "Property" &&
              prop.key &&
              prop.key.name &&
              prop.value &&
              prop.value.type === "Identifier"
            ) {
              aliases[prop.value.name] = prop.key.name;
            }
          });
        }
      });
    });
  return aliases;
}

function getGlobalProps(str) {
  return acorn
    .parse(str, { ecmaVersion: "latest", sourceType: "module" })
    .body.map((obj) => {
      if (
        obj.type === "VariableDeclaration" &&
        obj.declarations &&
        Array.isArray(obj.declarations) &&
        obj.declarations.length &&
        obj.declarations[0].id &&
        obj.declarations[0].id.name &&
        obj.declarations[0].init &&
        obj.declarations[0].init.type &&
        (obj.declarations[0].init.type === "Literal" ||
          obj.declarations[0].init.type === "ObjectExpression" ||
          obj.declarations[0].init.type === "ArrayExpression" ||
          obj.declarations[0].init.type === "ConditionalExpression" ||
          obj.declarations[0].init.type === "Identifier")
      ) {
        const name = obj.declarations[0].id.name;

        if (obj.declarations[0].id.name === "state") {
          if (Array.isArray(obj.declarations) && obj.declarations.length) {
            if (
              obj.declarations[0].init &&
              obj.declarations[0].init.properties &&
              Array.isArray(obj.declarations[0].init.properties) &&
              obj.declarations[0].init.properties.length
            ) {
              const arr = obj.declarations[0].init.properties;
              stateProps = arr.map((item) => item && item.key && item.key.name);
            }
          }
        }
        return name;
      }
    })
    .filter((item) => item);
}

function computeTemplateDeps(html, methodNames, propNames, hasState, js) {
  if (!hasState) return null;
  if (/\bscope\s*\(/.test(html)) return null;
  if (/\bstate\b(?!\s*\.)/.test(html)) return null;

  const nameStart = "(?<![A-Za-z0-9_$])";
  const escapeName = (name) => name.replace(/\$/g, "\\$");
  for (const name of methodNames) {
    if (name && new RegExp(nameStart + escapeName(name) + "\\s*\\(").test(html))
      return null;
  }

  for (const prop of propNames || []) {
    if (!prop || prop === "state") continue;
    if (
      new RegExp(
        nameStart +
          escapeName(prop) +
          "\\s*\\.\\s*[A-Za-z_$][A-Za-z0-9_$]*\\s*\\(",
      ).test(html)
    )
      return null;
  }
  const deps = [];
  const addDep = (key) => {
    if (key && !deps.includes(key)) deps.push(key);
  };
  html.replace(/\bstate\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/g, (match, key) => {
    addDep(key);
    return match;
  });

  if (js) {
    const usesAlias = (alias) =>
      alias &&
      new RegExp(nameStart + escapeName(alias) + "(?![A-Za-z0-9_$])").test(
        html,
      );

    js.replace(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*state\s*\.\s*([A-Za-z_$][\w$]*)/g,
      (m, alias, key) => {
        if (usesAlias(alias)) addDep(key);
        return m;
      },
    );

    js.replace(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*state\b/g, (m, inner) => {
      inner.split(",").forEach((part) => {
        const bits = part
          .split(":")
          .map((s) => s.replace(/=[\s\S]*/, "").trim());
        const key = bits[0];
        const alias = bits[1] || bits[0];
        if (usesAlias(alias)) addDep(key);
      });
      return m;
    });
  }
  return deps;
}

function minifyJS(src) {
  let out = "";
  let i = 0;
  const n = src.length;

  while (i < n) {
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      out += " ";
      continue;
    }

    if (src[i] === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }

    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      out += q;
      while (i < n) {
        const c = src[i++];
        out += c;
        if (c === "\\" && i < n) {
          out += src[i++];
          continue;
        }
        if (c === q) break;
      }
      continue;
    }

    if (/\s/.test(src[i])) {
      while (i < n && /\s/.test(src[i])) i++;
      out += " ";
      continue;
    }

    out += src[i++];
  }

  out = out
    .replace(/ *([=+\-*/%&|^~<>!?,;:{}()[\]]) */g, "$1")
    .replace(
      /\b(const|let|var|return|if|else|for|while|do|switch|case|new|delete|typeof|instanceof|in|of|void|throw|catch|finally|function|class|import|export|from|async|await)\b/g,
      "$1 ",
    )
    .replace(/ {2,}/g, " ")
    .trim();

  return out;
}

function generateRouteManifest(paths, rootDir) {
  const routes = {};

  for (const absolutePath of paths) {
    const relative = path.relative(rootDir, absolutePath).replace(/\\/g, "/");

    if (relative === "not-found.html") {
      routes["not-found"] = {
        page: "not-found.html",
      };
      continue;
    }

    if (!relative.endsWith("/page.html") && relative !== "page.html") {
      continue;
    }

    let routePath = relative
      .replace(/\/page\.html$/, "")
      .replace(/^page\.html$/, "");
    routePath = cleanParentheses(routePath, "url");

    const segments = routePath.split("/").filter(Boolean);

    const params = [];

    const route =
      "/" +
      segments
        .map((segment) => {
          const match = segment.match(/^\[(.+)\]$/);

          if (match) {
            params.push(match[1]);
            return `:${match[1]}`;
          }

          return segment;
        })
        .join("/");

    routes[route === "/" ? "/" : route] = {
      page: relative,
      ...(params.length && { params }),
    };
  }

  return routes;
}

function toComponentName(file) {
  file = cleanParentheses(file, "name");
  if (file === "page.html") return "App";
  if (file === "not-found.html") return "NotFound";

  return file
    .replace(/\/page\.html$/, "")
    .split("/")
    .map((segment) => {
      if (/^\[.+\]$/.test(segment)) {
        segment = segment.slice(1, -1);
      }

      return segment
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
    })
    .join("");
}

function generateImports(manifest) {
  return Object.values(manifest)
    .map(({ page }) => {
      const { name, trimmedDigit } = cleanNumbersPrefix(toComponentName(page));
      return `import ${name}${trimmedDigit ? "_" + trimmedDigit : ""} from "./${page.replace(/.html$/, ".js")}";`;
    })
    .join("\n");
}

function generateRoutes(manifest) {
  const routes = [];
  const paths = [];

  if (manifest["/"]) {
    routes.push({
      path: "/",
      comp: toComponentName(manifest["/"].page),
    });
  }

  for (const [route, config] of Object.entries(manifest)) {
    if (route === "/" || route === "not-found") continue;

    routes.push({
      path: route,
      comp: toComponentName(config.page),
    });
  }

  if (manifest["not-found"]) {
    routes.push({
      path: "/404",
      comp: toComponentName(manifest["not-found"].page),
    });
  }

  const result = `export const routes = [
${routes
  .map(({ path, comp }) => {
    const { name } = cleanNumbersPrefix(path, "url");
    const _comp = cleanNumbersPrefix(comp);
    paths.push(name);
    return `  { path: "${name}", comp: ${_comp.name}${_comp.trimmedDigit ? "_" + _comp.trimmedDigit : ""} }`;
  })
  .join(",\n")}
];`;

  fs.writeFileSync(routesPath, `${JSON.stringify(paths, null, 2)}`);
  return result;
}

const compileRoutes = (entryPoint) => {
  let routes = ls(entryPoint, { absolute: true });
  routes = routes.filter((item) => {
    const extension = path.extname(item);
    const isDir = fs.lstatSync(item).isDirectory();
    const isHtml = fs.lstatSync(item).isFile() && extension == ".html";
    const segments = path.relative(entryPoint, item).split(path.sep);
    const inExcludedDir = segments.some(
      (seg) => ["components", "utils"].includes(seg) || seg.startsWith("_"),
    );
    if (isDir || (isHtml && !inExcludedDir)) return item;
  });

  const manifest = generateRouteManifest(routes, entryPoint);
  let has404Page = false;
  if (manifest["not-found"]) has404Page = true;
  const libImports = `import Olum from "olum";\nimport Router from "olum-router";`;
  const imports = generateImports(manifest);
  const config = `const config = { mode: "history", root: "/", ${has404Page ? `err: "/404",` : ""} routes: routes };\nconst router = new Router(config);\nnew Olum().$("#olum-app").use(router);`;
  routes = generateRoutes(manifest);

  return `${libImports}\n${imports}\n${routes}\n${config}`;
};

module.exports.isNum = isNum;
module.exports.id = id;
module.exports.isUpper = isUpper;
module.exports.toLower = toLower;
module.exports.toUpper = toUpper;
module.exports.isObj = isObj;
module.exports.isFullArr = isFullArr;
module.exports.isDef = isDef;
module.exports.flatten = flatten;
module.exports.isHTML = isHTML;
module.exports.ls = ls;
module.exports.copy = copy;
module.exports.remove = remove;
module.exports.isFile = isFile;
module.exports.isDir = isDir;
module.exports.stringToBase64 = stringToBase64;
module.exports.base64ToString = base64ToString;
module.exports.createScopeHandler = createScopeHandler;
module.exports.getGlobalMethods = getGlobalMethods;
module.exports.getPropsAliases = getPropsAliases;
module.exports.getGlobalProps = getGlobalProps;
module.exports.computeTemplateDeps = computeTemplateDeps;
module.exports.minifyJS = minifyJS;
module.exports.generateRouteManifest = generateRouteManifest;
module.exports.generateImports = generateImports;
module.exports.generateRoutes = generateRoutes;
module.exports.compileRoutes = compileRoutes;
