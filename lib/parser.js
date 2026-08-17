const isDev = true;

const splitSFC = require("./sfc");
const htmlParser = require("./htmlParser");
const cssParser = require("./cssParser");
const jsParser = require("./jsParser");
const getImports = require("./getImports");
const toJs = require("./toJs");
const splitBarrels = require("./barrelSplit");
const path = require("path");
const {
  isFullArr,
  id,
  createScopeHandler,
  getGlobalMethods,
  getGlobalProps,
  getPropsAliases,
  computeTemplateDeps,
} = require("./helpers");
const createSourceMap = require("./sourcemap");
const liveProps = require("./liveProps");
const usage = require("./usage");

const parser = (str, counter, filePath) => {
  const sfc = splitSFC(str, filePath);

  let breaks = "";
  for (let i = 0; i < sfc.scriptStartLine; i++) breaks += "//\n";

  let { js, jsAttrs } = jsParser(sfc);

  let parentMethods = [];
  try {
    parentMethods = getGlobalMethods(js);
  } catch (e) {}

  let propsAliases = {};
  try {
    propsAliases = getPropsAliases(js);
  } catch (e) {}

  let { html, comps, anonHandlers } = htmlParser(
    sfc.template,
    counter,
    filePath,
    parentMethods,
    propsAliases,
  );

  html = html.replace(/\-\]\]\-\-\[\[\-/g, "OLUM_EVT_SEP");
  html = html.replace(/\"\-\[\[\-/g, "'").replace(/\-\]\]\-\"/g, "'");

  if (anonHandlers && anonHandlers.length)
    js = js + "\n" + anonHandlers.join("\n");

  let imports = getImports(js);
  if (imports) {
    const importRegex = /(import)(\s+)?(?!from)/g;
    imports.forEach((item) => {
      if (item.type && item.type == "noFrom")
        js = js.replace(new RegExp(item.regex, "gm"), "");
      if (!item.type) js = js.replace(new RegExp(item.regex, "g"), "*/");
    });
    js = js.replace(importRegex, "/* olum:toBeRemoved");

    js = js.replace(/(\/\* olum\:toBeRemoved)([\s\S]*?)(\*\/).*\n?/gm, "");
  }

  function toCamelCase(name) {
    return name;
    return name.slice(0, 1).toLowerCase() + name.slice(1);
  }

  let compName = path.basename(filePath).replace(/.html/gi, "");
  compName = toCamelCase(compName);
  const currentID = id().slice(1);
  const css = cssParser(sfc.css, currentID, compName);

  let globalProps = [];
  let globalMethods = [];
  let stateProps = [];
  let hasState = false;
  let hasWatcher = false;

  let hasMounted = false;
  let hasUnMounted = false;

  const methodsTobeExcluded = ["mounted", "unMounted", "onMount"];
  const propsTobeExcluded = ["watcher", "mounted"];

  globalProps = getGlobalProps(js);
  globalMethods = getGlobalMethods(js);

  hasMounted = globalMethods.includes("mounted") ? true : false;
  hasUnMounted = globalMethods.includes("unMounted") ? true : false;

  hasState = globalProps.includes("state") ? true : false;
  hasWatcher = globalProps.includes("watcher") ? true : false;

  globalMethods = globalMethods.filter(
    (name) => !methodsTobeExcluded.includes(name),
  );
  globalProps = globalProps.filter((name) => !propsTobeExcluded.includes(name));

  const handleScope = createScopeHandler({
    stateProps,
    hasState,
    propsTobeExcluded,
    jsAttrs,
  });
  const scopedProps = handleScope(globalProps, "props");
  const scopedMethods = handleScope(globalMethods, "methods");

  if (process.env.NODE_ENV === "development") {
    try {
      const children = [];
      (comps || []).forEach((name) => {
        const hit = (imports || []).find((item) =>
          new RegExp("\\b" + name + "\\b").test(item.statement),
        );
        const spec =
          hit && (hit.statement.match(/from\s+["'](.+?)["']/) || [])[1];
        if (!spec || !spec.startsWith(".")) return;
        const child = usage.relative(
          path
            .resolve(path.dirname(filePath), spec)
            .replace(/\.(js|html)$/, "") + ".html",
        );
        if (!children.includes(child)) children.push(child);
      });
      usage.record(filePath, children);
    } catch (e) {}
  }

  if (imports)
    imports = imports.map((item) => splitBarrels(toJs(item.statement)));

  function mkComponentsList(comps) {
    if (!imports || !isFullArr(imports)) return "";

    const seen = {};
    const entries = [];
    imports.forEach((importStatement) => {
      comps.forEach((name) => {
        if (seen[name]) return;
        if (new RegExp("\\b" + name + "\\b").test(importStatement)) {
          seen[name] = true;
          entries.push(toCamelCase(name) + ":" + name);
        }
      });
    });
    return entries.join(",");
  }

  js = js.replace(/params\(/g, `params("${filePath}",location.pathname`);

  js = js.replace(/props\(\s*\)/g, "props(_storeKey)");
  html = html.replace(/props\(\s*\)/g, "props(_storeKey)");

  const templateDeps = computeTemplateDeps(
    html,
    globalMethods,
    globalProps,
    hasState,
    js,
  );

  let out = `${breaks}${imports ? imports.join("\n") + "\n" : ""}export default (_instanceKey) => {const _storeKey=_instanceKey||"${compName}"; ${js}
  var el_${currentID} = olum.mkElm("div", "${compName}", "${currentID}");
  var host = el_${currentID};
  var methods_${currentID} = {${globalMethods}};
  var olum_${currentID} = {
    ${css}
    methods: ${scopedMethods},
    props: ${scopedProps},
    compName: "${compName}",
    ${process.env.NODE_ENV === "development" ? `file: ${JSON.stringify(usage.relative(filePath))},` : ""}
    deps: ${templateDeps ? JSON.stringify(templateDeps) : "null"},
    components: {${mkComponentsList(comps)}},
    get getElm() {
      var target_${currentID} = el_${currentID}.isConnected ? olum.vdom.mkStaging(el_${currentID}) : el_${currentID};
      target_${currentID}.innerHTML = \`
      ${html}\`;
      olum.injectStyle("${compName}", olum_${currentID}.__style__());
      return olum.handleMarkup("${compName}", "${currentID}", target_${currentID}, methods_${currentID});
    },
  };

  // todo: check if state.__olum__ needed since it's wiped out here
  ${
    hasState
      ? `
  state.__olum__ = { compName: _storeKey, compId: "${currentID}" };
  state = olum.proxyHandler(state, ${hasWatcher ? "watcher" : "null"}, el_${currentID});
  `
      : ""
  }

  return {
    methods: olum_${currentID}.methods,
    props: olum_${currentID}.props,
    __OLUM__: olum_${currentID},
    el: el_${currentID},
    methodsRef: methods_${currentID},
    ${isDev ? `stateProps: ${hasState ? "state" : "null"},` : ""}
    ${
      isDev
        ? `localsRef: {${globalProps
            .filter((name) => name !== "state")
            .map((name) => `get ${name}(){return ${name}}`)
            .join(",")}},`
        : ""
    }
    hooks: {
      mounted: typeof mounted !== "undefined" ? mounted : null,
      unMounted: null,
      isMounted: false,
      isUnMounted: false,
    }
  };
};`;

  try {
    out = liveProps(out);
  } catch (e) {}
  return (
    out +
    `
//# sourceMappingURL=data:application/json;charset=utf-8;base64,${createSourceMap(str, filePath)}`
  );
};

module.exports = parser;
