const chokidar = require("chokidar");
const path = require("path");
const entryPoint = path.resolve(__dirname, "../../../src");
// let ignoreRegex = /\_\.js$/;
// module.exports = chokidar.watch(entryPoint, {ignored: ignoreRegex, persistent: true });
module.exports = chokidar.watch(entryPoint, { persistent: true });