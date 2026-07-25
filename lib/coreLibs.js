const useLocalCore = process?.env?.LOCAL_CORE == "true";

const localLibs = {
  olum: "/core/olum.js",
  "olum-router": "/core/router.js",
  "olum-store": "/core/store.js",
  "olum-transition": "/core/transition.js",
};

const optionalLibs = ["olum-store", "olum-transition"];

module.exports = { useLocalCore, localLibs, optionalLibs };
