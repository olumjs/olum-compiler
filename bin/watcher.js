const chokidar = require("../lib/chokidar");
const path = require("path");
const fs = require("fs");

const cwd = process.cwd();
const entryPoint = path.resolve(cwd.replace(/\/module$/, ""), "src");
const entryPoint2 = path.resolve(cwd.replace(/\/module$/, ""), "public");

module.exports = chokidar.watch([entryPoint, entryPoint2], {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
});

const changesLog = path.resolve(__dirname, "../lib/changes.txt");
fs.writeFileSync(changesLog, "");
["add", "change", "unlink", "addDir", "unlinkDir"].forEach((event) =>
  module.exports.on(event, (file) =>
    fs.appendFileSync(changesLog, `${event} ${file}\n`),
  ),
);
