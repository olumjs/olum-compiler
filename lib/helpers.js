const { compExt } = require("./regex");
const colors = require("./colors");
const path = require("path");
const fs = require("fs");
const process = require("process");
const id = () => "_" + Math.random().toString(36).slice(2);
const isObj = obj => !!(obj !== null && typeof obj === "object");
const isFullArr = arr => !!(isObj(arr) && Array.isArray(arr) && arr.length);
const isDef = val => !!(val !== undefined && val !== null);
const flatten = lists => lists.reduce((a, b) => a.concat(b), []);
const isHTML = str => compExt.test(str);
const isFile = item => !fs.statSync(item).isDirectory();
const isDir = item => fs.statSync(item).isDirectory();
const isWin = () => !["linux", "darwin"].includes(process.platform);
const hasForwardSlash = (paths) => paths.find((item) => /\//g.test(item));
const hasSlash = (paths) => paths.find((item) => /\//g.test(item) || /\\/g.test(item));
const stringToBase64 = (str) => Buffer.from(str).toString('base64');
const base64ToString = (base64) => Buffer.from(base64, 'base64').toString('ascii');
const acorn = require("acorn");

function isUpper(char) {
  const upperChar = char.toUpperCase();
  const regex = new RegExp(upperChar);
  return regex.test(char);
}
function isNum(str) {
  if (["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(str.trim()[0])) return true;
  return false;
}
function toLower(str) {
  return str.toLowerCase();
}
function toUpper(str) {
  return str.toUpperCase();
}

// takes absolute path
// e.g. ls(src, { absolute: false })
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

  // handle options
  if (opt && opt.hasOwnProperty("absolute") && opt.absolute === false) paths = paths.map((item) => item.replace(src + "/", ""));

  // handle slashes
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

// todo make other tests
// e.g. copy("path/to/src", "path/to/dest");
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

  dirs.forEach((dir) => dir.replace(new RegExp(`${srcDir}.*`), (str) => cleanDirs.push(destDirChunck + str.replace(new RegExp(`${srcDir}`), destDir))));
  files.forEach((dir) => dir.replace(new RegExp(`${srcDir}.*`), (str) => cleanFiles.push(destDirChunck + str.replace(new RegExp(`${srcDir}`), destDir))));

  // console.log({ dirs });
  // console.log({ cleanDirs });
  // console.log({ cleanFiles });
  // console.log({ srcDir });
  // console.log({ destDir });
  // console.log({ files });
  // console.log({ destDirChunck });
  // make dirs
  cleanDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });
  // copy files to pre-made dirs above
  files.forEach((file, index) => {
    if (fs.lstatSync(file).isFile()) {
      const fileDest = cleanFiles[index];
      fs.copyFileSync(file, fileDest);
    }
  });
  if (cb) cb();
}

// e.g. remove("path/to/dir");
function remove(src, cb) {
  const files = ls(src);
  // console.log({ files });
  
  const upDir = path.resolve(files[0] , "..");
  files.unshift(upDir);
  // console.log(upDir);
  // console.log({ files });

  files.forEach((dir) => {
    if (fs.existsSync(dir) && fs.lstatSync(dir).isFile()) fs.unlinkSync(dir);
  });

  files.reverse().forEach((dir) => {
    if (fs.existsSync(dir) && fs.lstatSync(dir).isDirectory()) fs.rmdirSync(dir);
  });
  if (cb) cb();
}

function createScopeHandler({ stateProps, hasState, propsTobeExcluded, jsAttrs: attributes }) {
  /*

    // must type the attribute as  kebab-case if it was camel-case in the logic. e.g.: you have method/prop called getAge, then it will be: exclude-get-age
    private
    private-props 
    private-methods 
    ----------
    public
    public-props 
    public-methods 
    ----------
    exclude-prop-name
    exclude-method-name

  convert above attributes to below query syntax: 

    all=private&except=['age','name']

    ----------

    Order matters:

  ['public-props', 'exclude-age', 'exclude-name',  'private-methods', 'exclude-get-age']
        ↓                ↓              ↓                  ↓                  ↓
    open props       → age           → name           close props        → getAge
                                                        open methods       close methods (end)

  */

  function scopePolyfill(attrs) {
    const SCOPES = ["public", "public-props", "public-methods", "private", "private-props", "private-methods"];
    const toCamel = str => str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
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

  const jsAttrs = scopePolyfill(Object.keys(attributes))
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
    if (type === "public") arr = stateProps.filter((prop) => !propsInExcept.includes(prop));
    else if (type === "private") arr = stateProps.filter((prop) => propsInExcept.includes(prop));
    return arr;
  }

  function getProps(exceptArr, globalNamesArr, type) {
    let namesInExcept = [];
    let arr = [];
    exceptArr.forEach((name) => {
      if (globalNamesArr.includes(name)) {
        if (name !== "state" && !name.startsWith("state.")) namesInExcept.push(name);
      }
    });
    if (type === "public") arr = globalNamesArr.filter((prop) => !namesInExcept.includes(prop) && prop !== "state");
    if (type === "private") arr = globalNamesArr.filter((prop) => namesInExcept.includes(prop) && prop !== "state");
    return arr;
  }

  function getMethods(exceptArr, globalNamesArr, type) {
    let namesInExcept = [];
    let arr = [];
    exceptArr.forEach((name) => {
      if (globalNamesArr.includes(name)) namesInExcept.push(name);
    });
    if (type === "public") arr = globalNamesArr.filter((method) => !namesInExcept.includes(method));
    if (type === "private") arr = globalNamesArr.filter((method) => namesInExcept.includes(method));
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
        if (["public", "private"].includes(toLower(currentScope.all))) scope[type].all = toLower(currentScope.all).trim();
      }
      if (currentScope.except && isFullArr(currentScope.except)) {
        currentScope.except = currentScope.except.filter((item) => item && item.trim() !== "").map((item) => item.trim());
        if (isFullArr(currentScope.except)) scope[type].except = currentScope.except;
      }
    }
  }

  function shareAllProps(globalNamesArr) {
    let arr = [];
    arr = globalNamesArr
      .map((name) => {
        if (!["state", ...propsTobeExcluded].includes(name)) return `get ${name}(){return ${name}},set ${name}(val){return ${name} = val}`;
      })
      .filter((item) => item);
    if (hasState && isFullArr(stateProps)) {
      let fragments = stateProps.map((prop) => prop + ": state." + prop);
      arr.push(`get state(){return window.olum.proxyHandlerForStore(${"{" + fragments.join(",") + "}"}, state);}`);
    }
    return arr;
  }

  // all methods/props are private by default
  function handleScope(globalNamesArr, type) {
    if (globalNamesArr && isFullArr(globalNamesArr) && type) {
      if (!scope[type]) return toObj();
      if (!scope[type].all) return toObj();
      if (scope[type].all === "public") {
        if (!scope[type].except) return type === "methods" ? toObj(globalNamesArr) : toObj(shareAllProps(globalNamesArr));
        if (scope[type].except && isFullArr(scope[type].except)) {
          if (type === "methods") {
            let arr = [];
            let newArr = getMethods(scope[type].except, globalNamesArr, "public");
            if (newArr.length) arr = newArr;
            else return toObj();
            return arr.length ? toObj(arr) : toObj(globalNamesArr);
          } else if (type === "props") {
            const hasStateKeywordInExcecpt = scope[type].except.find((name) => name === "state");
            let arr = [];
            let newArr = getProps(scope[type].except, globalNamesArr, "public");
            if (newArr.length) arr = newArr;
            arr = arr.map((item) => `get ${item}(){return ${item}},set ${item}(val){return ${item} = val}`);
            if (hasState && isFullArr(stateProps)) {
              let publicPropsInState = [];
              if (!hasStateKeywordInExcecpt) {
                if (!hasStateDot(scope[type].except)) publicPropsInState = stateProps;
                else publicPropsInState = getStateProps(scope[type].except, "public");
              }
              if (isFullArr(publicPropsInState)) {
                let fragments = publicPropsInState.map((prop) => prop + ": state." + prop);
                arr.push(`get state(){return window.olum.proxyHandlerForStore(${"{" + fragments.join(",") + "}"}, state);}`);
              }
            }
            if (!newArr.length && !arr.length) return toObj();
            return arr.length ? toObj(arr) : toObj(shareAllProps(globalNamesArr));
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
            const hasStateKeywordInExcecpt = scope[type].except.find((name) => name === "state");
            let arr = [];
            arr = getProps(scope[type].except, globalNamesArr, "private");
            arr = arr.map((item) => `get ${item}(){return ${item}},set ${item}(val){return ${item} = val}`);
            if (hasState && isFullArr(stateProps)) {
              let publicPropsInState = [];
              if (hasStateKeywordInExcecpt) publicPropsInState = stateProps;
              else {
                if (hasStateDot(scope[type].except)) publicPropsInState = getStateProps(scope[type].except, "private");
              }
              if (isFullArr(publicPropsInState)) {
                let fragments = publicPropsInState.map((prop) => prop + ": state." + prop);
                arr.push(`get state(){return window.olum.proxyHandlerForStore(${"{" + fragments.join(",") + "}"}, state);}`);
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

// get methods names
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
        (obj.declarations[0].init.type === "FunctionExpression" || obj.declarations[0].init.type === "ArrowFunctionExpression")
      ) {
        return obj.declarations[0].id.name;
      }
    })
    .filter((item) => item);
}

// get props names
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
        // get all props names inside state object
        if (obj.declarations[0].id.name === "state") {
          if (Array.isArray(obj.declarations) && obj.declarations.length) {
            if (obj.declarations[0].init && obj.declarations[0].init.properties && Array.isArray(obj.declarations[0].init.properties) && obj.declarations[0].init.properties.length) {
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

// minify js as string into one line without changing the js content
function minifyJS(src) {
  let out = '';
  let i = 0;
  const n = src.length;

  while (i < n) {
    // Line comment — strip until end of line
    if (src[i] === '/' && src[i+1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      out += ' ';
      continue;
    }

    // Block comment — strip entirely
    if (src[i] === '/' && src[i+1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i+1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }

    // Quoted string — copy verbatim (respect escapes)
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      out += q;
      while (i < n) {
        const c = src[i++];
        out += c;
        if (c === '\\' && i < n) { out += src[i++]; continue; }
        if (c === q) break;
      }
      continue;
    }

    // Whitespace — collapse to single space
    if (/\s/.test(src[i])) {
      while (i < n && /\s/.test(src[i])) i++;
      out += ' ';
      continue;
    }

    // Everything else — copy as-is
    out += src[i++];
  }

  // Remove spaces around punctuation, restore keyword spacing, collapse multi-spaces
  out = out
    .replace(/ *([=+\-*/%&|^~<>!?,;:{}()[\]]) */g, '$1')
    .replace(/\b(const|let|var|return|if|else|for|while|do|switch|case|new|delete|typeof|instanceof|in|of|void|throw|catch|finally|function|class|import|export|from|async|await)\b/g, '$1 ')
    .replace(/ {2,}/g, ' ')
    .trim();

  return out;
}

function resolvePackage(pkgName) {
  const pkgJsonPath = path.join(
    process.cwd(),
    "node_modules",
    pkgName,
    "package.json"
  );

  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(`Package "${pkgName}" not found`);
  }

  const pkg = JSON.parse(
    fs.readFileSync(pkgJsonPath, "utf8")
  );

  let entry;

  if (typeof pkg.exports === "string") {
    entry = pkg.exports;
  } else if (pkg.exports?.["."]?.import) {
    entry = pkg.exports["."].import;
  } else if (pkg.exports?.["."]?.default) {
    entry = pkg.exports["."].default;
  } else if (typeof pkg.exports?.["."] === "string") {
    entry = pkg.exports["."];
  } else {
    entry = pkg.module || pkg.main || "index.js";
  }

  entry = entry.replace(/^\.?\//, "");

  return `/node_modules/${pkgName}/${entry}`;
}

function rewriteImports(code) {
  return code.replace(
    /from\s+["']([^"']+)["']/g,
    (match, specifier) => {
      if (
        specifier.startsWith(".") ||
        specifier.startsWith("/") ||
        specifier.startsWith("http:")
        || specifier.startsWith("https:")
      ) {
        return match;
      }

      try {
        return `from "${resolvePackage(specifier)}"`;
      } catch (err) {
        console.warn(err.message);
        return match;
      }
    }
  );
}

// handle routing based on files
function generateRouteManifest(paths, rootDir) {
  const routes = {};

  for (const absolutePath of paths) {
    const relative = path.relative(rootDir, absolutePath).replace(/\\/g, "/");

    // Global not-found
    if (relative === "not-found.html") {
      routes["not-found"] = {
        page: "not-found.html",
      };
      continue;
    }

    // Only page files create routes
    if (!relative.endsWith("/page.html") && relative !== "page.html") {
      continue;
    }

    // Remove "/page.html" or "page.html"
    const routePath = relative
      .replace(/\/page\.html$/, "")
      .replace(/^page\.html$/, "");

    const segments = routePath
      .split("/")
      .filter(Boolean);

    const params = [];

    const route = "/" + segments
      .map(segment => {
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
  if (file === "page.html") return "App";
  if (file === "not-found.html") return "NotFound";

  return file
    .replace(/\/page\.html$/, "")
    .split("/")
    .map(segment => {
      // [slug] -> Slug
      if (/^\[.+\]$/.test(segment)) {
        segment = segment.slice(1, -1);
      }

      return segment
        .split("-")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
    })
    .join("");
}

function generateImports(manifest) {
  return Object.values(manifest)
    .map(({ page }) => {
      const component = toComponentName(page);
      return `import ${component} from "./${page}";`;
    })
    .join("\n");
}

function generateRoutes(manifest) {
  const routes = [];

  // Root first
  if (manifest["/"]) {
    routes.push({
      path: "/",
      comp: toComponentName(manifest["/"].page),
    });
  }

  // Other routes
  for (const [route, config] of Object.entries(manifest)) {
    if (route === "/" || route === "not-found") continue;

    routes.push({
      path: route,
      comp: toComponentName(config.page),
    });
  }

  // 404 last
  if (manifest["not-found"]) {
    routes.push({
      path: "/404",
      comp: toComponentName(manifest["not-found"].page),
    });
  }

  return `export const routes = [
${routes
  .map(({ path, comp }) => `  { path: "${path}", comp: ${comp} }`)
  .join(",\n")}
];`;
}

const routerParamsParser = `<script>
  /**
   * Extract route params from a file path and pathname.
   *
   * @param {string} filePath
   * @param {string} pathname
   * @returns {Record<string, string | string[]>}
   *
   * Examples:
   * extractParams("/blog/[slug]/page.html", "/blog/hello")
   * -> { slug: "hello" }
   *
   * extractParams("/users/[id]/posts/[postId]/page.html", "/users/5/posts/10")
   * -> { id: "5", postId: "10" }
   */
  function extractParams(filePath, pathname) {
    const routeParts = filePath
      .replace(/\\/page\\.[^/]+$/, "")
      .split("/")
      .filter(Boolean);

    const pathParts = pathname.split("/").filter(Boolean);

    const params = {};

    let i = routeParts.length - 1;
    let j = pathParts.length - 1;

    while (i >= 0 && j >= 0) {
      const part = routeParts[i];

      // [...slug]
      if (part.startsWith("[...") && part.endsWith("]")) {
        params[part.slice(4, -1)] = pathParts.slice(0, j + 1);
        break;
      }

      // [slug]
      if (part.startsWith("[") && part.endsWith("]")) {
        params[part.slice(1, -1)] = decodeURIComponent(pathParts[j]);
      }

      i--;
      j--;
    }

    return params;
  }
</script>`;

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
module.exports.getGlobalProps = getGlobalProps;
module.exports.minifyJS = minifyJS;
module.exports.rewriteImports = rewriteImports;
module.exports.generateRouteManifest = generateRouteManifest;
module.exports.generateImports = generateImports;
module.exports.generateRoutes = generateRoutes;
module.exports.routerParamsParser = routerParamsParser;
