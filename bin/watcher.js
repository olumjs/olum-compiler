const chokidar = require("../lib/chokidar");
const path = require("path");
const fs = require("fs");
// Resolve against the project root (process.cwd()), same as copySrc.js.
// The old "../../src" pointed at node_modules/src, which doesn't exist, so
// chokidar watched 0 directories and never detected any changes.
const cwd = process.cwd();
const entryPoint = path.resolve(cwd.replace(/\/module$/, ""), "src")
const entryPoint2 = path.resolve(cwd.replace(/\/module$/, ""), "public")
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

// Debug trail: log every event of this session to lib/changes.txt (newest last)
const changesLog = path.resolve(__dirname, "../lib/changes.txt"); // e.g. "add /path/to/src/page.html"
fs.writeFileSync(changesLog, ""); // start fresh each session
["add", "change", "unlink", "addDir", "unlinkDir"].forEach((event) => module.exports.on(event, (file) => fs.appendFileSync(changesLog, `${event} ${file}\n`))); // one line per event