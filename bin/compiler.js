const spawn = require("../lib/cross-spawn");
const path = require("path");
const fs = require("fs");
const colors = require("../lib/colors");

let num = -1;
module.exports = function (file, startedAt) {
  num++;
  const t0 = startedAt || Date.now();
  const done = () =>
    num &&
    console.log(
      colors("white", "Build no."),
      colors("yellow", num),
      colors("white", "in"),
      colors("green", Date.now() - t0 + "ms"),
    );
  return new Promise((resolve) => {
    const logFilePath = path.resolve(__dirname, "../lib/log.txt");
    fs.writeFileSync(logFilePath, "");

    const compilerPath = path.resolve(__dirname, "../lib/compiler.js");
    if (file) {
      try {
        require(compilerPath)(file);
      } catch (err) {
        console.error(err);
      }
      resolve();
      return done();
    }
    const result = spawn.sync("node", [compilerPath], { stdio: "inherit" });
    if (result.signal) {
      if (result.signal === "SIGKILL" || result.signal === "SIGTERM")
        console.log("Failed to run compiler @ " + compilerPath);
      process.exit(1);
    }
    resolve();
    done();
  });
};
