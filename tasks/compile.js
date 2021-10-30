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
        if (error) return reject(error);
        if (stderr.trim() !== "") return reject(stderr);
        if (stdout.trim() !== "") console.log(stdout);
        resolve();
        logger(taskName, "end");
      });
    } else if (mode === "production") {
      exec(`node ${file} compile`, (error, stdout, stderr) => {
        if (error) return reject(error);
        if (stderr.trim() !== "") return reject(stderr);
        if (stdout.trim() !== "") console.log(stdout);
        resolve();
        logger(taskName, "end");
      });
    }
  });
};

module.exports = compile;