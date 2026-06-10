const path = require("path");
const { ls, isFile, isHTML } = require("./helpers");
const isComp = str => !/^_/.test(str); // if doesn't have underscore

function getTempPath() {
  const entryPoint = path.resolve(__dirname, "../src");
  let paths = ls(entryPoint);
  // clean paths
  paths = paths.map((item) => (isFile(item) && isHTML(item) && isComp(path.basename(item)) ? item : null)).filter((item) => item);
  return paths;
}

module.exports = getTempPath;