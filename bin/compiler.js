const spawn = require("../lib/cross-spawn");
const path = require("path");
const fs = require("fs");
const colors = require("../lib/colors");

let num = 0;
module.exports = function () {
  num++;
  return new Promise(resolve => {
    // wipeout log.txt
    const logFilePath = path.resolve(__dirname, "../lib/log.txt");
    fs.writeFileSync(logFilePath, "");
    // compile
    const compilerPath = path.resolve(__dirname, "../lib/compiler.js");
    const result = spawn.sync("node", [compilerPath], { stdio: "inherit" });
    if (result.signal) {
      if (result.signal === "SIGKILL" || result.signal === "SIGTERM") console.log("Failed to run compiler @ " + compilerPath);
      process.exit(1);
    }
    resolve();
    console.log(colors("white", "Build no."), colors("yellow", num));
  });
};
