// single switch for where the framework runtime loads from:
//   true  -> the local copies in module/core, served at /core by the dev server (framework development)
//   false -> the published npm packages ("olum", "olum-router", "olum-store") installed at the project root
// both the generated main.js (helpers.js compileRoutes) and the import map (importMap.js)
// read this flag — they must agree, otherwise two runtime copies load and fight over window.olum
const useLocalCore = process?.env?.LOCAL_CORE == 'true';

// import-map entries for the local mode. "olum-store" must be listed even though no app file
// imports it directly: olum.js loads it via a bare dynamic import("olum-store"), which the
// importMap.js src scan never sees — without this entry the import rejects (silently) and
// store() throws "store is unavailable".
const localLibs = {
  olum: "/core/olum.js",
  "olum-router": "/core/router.js",
  "olum-store": "/core/store.js",
};

module.exports = { useLocalCore, localLibs };
