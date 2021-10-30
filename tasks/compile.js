const { exec } = require("child_process");
const logger = require("./logger");
const path = require("path");

const compile = mode => {
  const taskName = "compile";
  return new Promise((resolve, reject) => {
    const file = path.resolve(__dirname, "../compiler.js");
    logger(taskName, "start");
    if (mode === "development") {
      exec(`node ${file} compile dev`, (error, stdout, stderr) => {
        if (stdout.toLowerCase().includes("error")) console.log(colors.red.bold(stdout));
        else if (stdout.trim() !== "") console.log(stdout);
        if (error) return reject(error);
        if (stderr) return reject(stderr);
        resolve();
        logger(taskName, "end");
      });
    } else if (mode === "production") {
      exec(`node ${file} compile`, (error, stdout, stderr) => {
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

module.exports = compile;