const useLocalCore = process?.env?.LOCAL_CORE == "true";

const localLibs = {
  olum: "/core/olum.js",
  "olum-router": "/core/router.js",
  "olum-store": "/core/store.js",
};

module.exports = { useLocalCore, localLibs };
