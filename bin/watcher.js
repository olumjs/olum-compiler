const chokidar = require("../lib/chokidar");
const path = require("path");
// Resolve against the project root (process.cwd()), same as copySrc.js.
// The old "../../src" pointed at node_modules/src, which doesn't exist, so
// chokidar watched 0 directories and never detected any changes.
const entryPoint = path.resolve(process.cwd(), "src").replace(/\/module/, "");
const entryPoint2 = path.resolve(process.cwd(), "public").replace(/\/module/, "");
// let ignoreRegex = /\_\.js$/;
// module.exports = chokidar.watch(entryPoint, {ignored: ignoreRegex, persistent: true });
// ignoreInitial: don't fire "add" for every existing file on startup (initial
// compile is handled separately in dev.js). awaitWriteFinish: coalesce the
// temp-file/rename churn from atomic saves into a single event.
module.exports = chokidar.watch([entryPoint, entryPoint2], {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
});