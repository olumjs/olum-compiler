// single switch for where the framework runtime loads from:
//   true  -> the local copies in module/core, served at /core by the dev server (framework development)
//   false -> the published npm packages ("olum", "olum-router") installed at the project root
// both the generated main.js (helpers.js compileRoutes) and the import map (importMap.js)
// read this flag — they must agree, otherwise two runtime copies load and fight over window.olum
const useLocalCore = process?.env?.LOCAL_CORE == 'true';

// import-map entries for the local mode
const localLibs = {
  olum: "/core/olum.js",
  "olum-router": "/core/router.js",
};

module.exports = { useLocalCore, localLibs };
