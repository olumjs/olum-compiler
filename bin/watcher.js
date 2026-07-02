const chokidar = require("chokidar");
const path = require("path");
const entryPoint = path.resolve(__dirname, "../../src");
const entryPoint2 = path.resolve(__dirname, "../../public");
// let ignoreRegex = /\_\.js$/;
// module.exports = chokidar.watch(entryPoint, {ignored: ignoreRegex, persistent: true });
module.exports = chokidar.watch([entryPoint, entryPoint2], { persistent: true });