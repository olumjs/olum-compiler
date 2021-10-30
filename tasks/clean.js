const {exec} = require("child_process");
const logger = require("./logger");
const path = require("path");

const clean = dir => {
  const taskName = "clean";
  const file = path.resolve(__dirname, "../compiler.js");
  return new Promise((resolve, reject) => {
    logger(taskName, "start");
    exec(`node ${file} clean ${dir}`, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve();
      logger(taskName, "end");
    });
  });
};

module.exports = clean;