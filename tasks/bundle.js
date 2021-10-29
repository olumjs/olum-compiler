const { exec } = require("child_process");
const logger = require("./logger");
const reload = require("./reload");
const path = require("path");

const bundle = mode => {
  const taskName = "bundle";
  return new Promise((resolve, reject) => {
    const file = path.resolve(__dirname, "../node_modules/webpack/bin/webpack.js");
    logger(taskName, "start");
    if (mode === "development") {
      exec(`${file} --env dev`, (error, stdout, stderr) => {
        if (error) return reject(error);
        if (stderr.trim() !== "") return reject(stderr);
        if (stdout !== "webpack compiled successfully\n") console.log(stdout);
        resolve();
        reload();
        logger(taskName, "end");
      });
    } else if (mode === "production") {
      exec(file, (error, stdout, stderr) => {
        if (error) return reject(error);
        if (stderr.trim() !== "") return reject(stderr);
        if (stdout !== "webpack compiled successfully\n") console.log(stdout);
        resolve();
        logger(taskName, "end");
      });
    }
  });
};

module.exports = bundle;