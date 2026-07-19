const spawn = require("../lib/cross-spawn");
const path = require("path");
const fs = require("fs");
const colors = require("../lib/colors");

let num = -1;
module.exports = function (file, startedAt) {
  num++;
  const t0 = startedAt || Date.now(); // build timing — callers pass their copySrc start so the line shows the whole copy+compile
  const done = () => num && console.log(colors("white", "Build no."), colors("yellow", num), colors("white", "in"), colors("green", Date.now() - t0 + "ms"));
  return new Promise(resolve => {
    // wipeout log.txt
    const logFilePath = path.resolve(__dirname, "../lib/log.txt");
    fs.writeFileSync(logFilePath, "");
    // compile
    const compilerPath = path.resolve(__dirname, "../lib/compiler.js");
    if (file) { // single file → compile in-process: jsdom/acorn are already loaded, so this is ~ms instead of a ~400ms node spawn
      try { require(compilerPath)(file); }
      catch (err) { console.error(err); } // a broken component must not kill the dev server
      resolve();
      return done();
    }
    const result = spawn.sync("node", [compilerPath], { stdio: "inherit" }); // full compile stays in a child (startup / fallback / build)
    if (result.signal) {
      if (result.signal === "SIGKILL" || result.signal === "SIGTERM") console.log("Failed to run compiler @ " + compilerPath);
      process.exit(1);
    }
    resolve();
    done();
  });
};
