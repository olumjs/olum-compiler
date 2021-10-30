const logger = require("./logger");
const reload = require("./reload");
const { exec } = require("child_process");
const colors = require("colors");

const bundle = mode => {
  const taskName = "bundle";
  return new Promise((resolve, reject) => {
    logger(taskName, "start");
    if (mode === "development") {
      exec("webpack --env dev", (error, stdout, stderr) => {
        if (stdout.toLowerCase().includes("error")) console.log(colors.red.bold(stdout));
        else if (stdout.trim() !== "") console.log(stdout);
        if (error) return reject(error);
        if (stderr) return reject(stderr);
        reload();
        resolve();
        logger(taskName, "end");
      });
    } else if (mode === "production") {
      exec("webpack", (error, stdout, stderr) => {
        if (stdout.toLowerCase().includes("error")) console.log(colors.red.bold(stdout));
        else if (stdout.trim() !== "") console.log(stdout);
        if (error) return reject(error);
        if (stderr) return reject(stderr);
        resolve();
        logger(taskName, "end");
      });
    }
  });
};

module.exports = bundle;