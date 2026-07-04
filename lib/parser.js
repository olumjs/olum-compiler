const isDev = true; // todo: handle this later to be global var accessable every where in compiler files
const htmlParser = require("./htmlParser");
const cssParser = require("./cssParser");
const jsParser = require("./jsParser");
const getImports = require("./getImports");
const toJs = require("./toJs");
const path = require("path");
const { isFullArr, id, createScopeHandler, getGlobalMethods, getGlobalProps, minifyJS, libsMap } = require("./helpers");
const createSourceMap = require("./sourcemap");

const parser = (str, counter, filePath) => {
  // start: calc lines above script tag (from line 1 to script tag)
  let startIndex = str.split("\n").findIndex(item => /<script[\s\S]*?>/gi.test(item)) || 0;
  let breaks = "";
  for (let i = 0; i < startIndex; i++) breaks += "//\n";
  // end

  let { js, jsAttrs } = jsParser(str, counter, filePath); // js content and attributes in script opening tag
  let {html, comps, anonHandlers} = htmlParser(str, counter, filePath); // html content and all components tags <olum></olum>
  html = html.replace(/\"\-\[\[\-/g, "'").replace(/\-\]\]\-\"/g, "'"); // fix json in attribute issue

  // Inject anonymous handler declarations so getGlobalMethods picks them up as regular methods
  if (anonHandlers && anonHandlers.length) js = js + "\n" + anonHandlers.join("\n");

  // clean import statements
  let imports = getImports(js);
  if (imports) {
    const importRegex = /(import)(\s+)?(?!from)/g;
    imports.forEach((item) => {
      // resolve imported libs: olum, olum-router
      if (/from\s+(['"])olum\1/.test(item.statement)) {
        item.statement = item.statement.replace(new RegExp(item.regex, ""), `from "${libsMap[process.env.NODE_ENV].olum}"`)
      }
      if (/from\s+(['"])olum-router\1/.test(item.statement)) {
        item.statement = item.statement.replace(new RegExp(item.regex, ""), `from "${libsMap[process.env.NODE_ENV].olum}"`)
      }

      if (item.type && item.type == "noFrom") js = js.replace(new RegExp(item.regex, "gm"), "");
      if (!item.type) js = js.replace(new RegExp(item.regex, "g"), "*/");
    });
    js = js.replace(importRegex, "/* olum:toBeRemoved");
    // clean multiple line comments of imports and delete lines
    js = js.replace(/(\/\* olum\:toBeRemoved)([\s\S]*?)(\*\/).*\n?/gm, "");
  }

  function toCamelCase(name) {
    return name;
    return name.slice(0, 1).toLowerCase() + name.slice(1); // todo decide what to do with component name, leave it as it is or make it pascal case or camelcase of  cababcase
  }

  let compName = path.basename(filePath).replace(/.html/gi, "");
  compName = toCamelCase(compName);
  const currentID = id().slice(1);
  const css = cssParser(str, currentID, compName);

  let globalProps = [];
  let globalMethods = [];
  let stateProps = [];
  let hasState = false;
  let hasWatcher = false;
  // let hasComputed = false;
  let hasMounted = false;
  let hasUnMounted = false;

  const methodsTobeExcluded = ["mounted", "unMounted", "onMount"];
  const propsTobeExcluded = ["watcher", "mounted"];

  globalProps = getGlobalProps(js);
  globalMethods = getGlobalMethods(js);

  // check existance before runtime
  // methods
  hasMounted = globalMethods.includes("mounted") ? true : false;
  hasUnMounted = globalMethods.includes("unMounted") ? true : false;
  // props
  hasState = globalProps.includes("state") ? true : false;
  hasWatcher = globalProps.includes("watcher") ? true : false;
  // hasComputed = globalProps.includes("computed") ? true : false;

  // exclude props/methods
  globalMethods = globalMethods.filter((name) => !methodsTobeExcluded.includes(name));
  globalProps = globalProps.filter((name) => !propsTobeExcluded.includes(name));

  const handleScope = createScopeHandler({ stateProps, hasState, propsTobeExcluded, jsAttrs });
  const scopedProps = handleScope(globalProps, "props");
  const scopedMethods = handleScope(globalMethods, "methods");

  // convert .html to .js and add .js if it doesn't exist
  if (imports) imports = imports.map((item) => toJs(item.statement));

  function mkComponentsList(comps) {
    if (!imports || !isFullArr(imports)) return "";
    // emit a deduped name->factory map; word-boundary match so "Todos" doesn't also match "FilterTodos"
    const seen = {};
    const entries = [];
    imports.forEach(importStatement => {
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

  // resolves this instance's store slot via _storeKey (the runtime instance key)
  const propsProxy = `const props = new Proxy({}, {
    get(_, key) {
      const entry = olum.app.store[_storeKey];
      return entry && entry.incomingProps ? entry.incomingProps[key] : undefined;
    },
    set(_, key, val) {
      const entry = olum.app.store[_storeKey];
      if (entry && entry.parentCompName && entry.incomingPropSources) {
        const desc = entry.incomingPropSources[key];
        if (desc) {
          const parent = olum.app.store[entry.parentCompName];
          if (parent) {
            // state source -> write parent state (triggers re-render); props source -> chain up the parent's props proxy
            if (desc.kind === "state" && parent.stateProps) parent.stateProps[desc.key] = val;
            else if (desc.kind === "props" && parent.incomingPropsProxy) parent.incomingPropsProxy[desc.key] = val;
          }
        }
      }
      return true;
    }
  });`;

  // children is declared inside getElm (not at factory-call time) so it re-reads the store on every render
  const childrenVar = `const children=(olum.app.store[_storeKey]&&olum.app.store[_storeKey].children)||"";`;
  const routerParamsProxy = `const params = new Proxy({},{ get(_, key) { const values = extractParams(currentFilePath, location.pathname); return values[key];}, ownKeys() { return Reflect.ownKeys(extractParams(currentFilePath, location.pathname));},getOwnPropertyDescriptor() {return {enumerable: true,configurable: true,};},});`;

  // bind props proxy at the top to be accessed by ${js} code
  return `${breaks}${imports ? imports.join("\n") + "\n" : ""}export default (_instanceKey) => {const currentFilePath = "${filePath}"; ${routerParamsProxy} const _storeKey=_instanceKey||"${compName}"; ${minifyJS(propsProxy)}${js}
  var el_${currentID} = olum.mkElm("div", "${compName}", "${currentID}");
  var $0 = el_${currentID};
  var methods_${currentID} = {${globalMethods}};
  var olum_${currentID} = {
    ${css}
    methods: ${scopedMethods},
    props: ${scopedProps},
    compName: "${compName}",
    components: {${mkComponentsList(comps)}},
    get getElm() {
      ${childrenVar}
      el_${currentID}.innerHTML = \`
      ${html}\`;
      olum.injectStyle("${compName}", olum_${currentID}.__style__());
      return olum.handleMarkup("${compName}", "${currentID}", el_${currentID}, methods_${currentID});
    },
  };

  // todo: check if state.__olum__ needed since it's wiped out here
  ${ hasState ? `
  state.__olum__ = { compName: _storeKey, compId: "${currentID}" };
  state = olum.proxyHandler(state, ${hasWatcher ? "watcher" : "null"}, el_${currentID});
  ` : "" }

  return {
    methods: olum_${currentID}.methods,
    props: olum_${currentID}.props,
    __OLUM__: olum_${currentID},
    el: el_${currentID},
    incomingPropsProxy: props,
    ${isDev ? `stateProps: ${hasState ? "state" : "null"},` : ""}
    hooks: {
      mounted: typeof mounted !== "undefined" ? mounted : null,
      unMounted: null,
      isMounted: false,
      isUnMounted: false,
    }
  };
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,${createSourceMap(str, filePath)}`;
};

module.exports = parser;