const { exec } = require("child_process");
const logger = require("./logger");
const reload = require("./reload");
const path = require("path");
const spawn = require("cross-spawn");

const bundle = mode => {
  const taskName = "bundle";
  return new Promise((resolve, reject) => {
    const file = path.resolve(__dirname, "../node_modules/webpack/bin/webpack.js");
    logger(taskName, "start");
    if (mode === "development") {
      spawn.sync(file, ["--env", "dev"], { stdio: "inherit" } );
      reload();
      resolve();
      logger(taskName, "end");
    } else if (mode === "production") {
      spawn.sync(file, { stdio: "inherit" } );
      resolve();
      logger(taskName, "end");
    }
  });
};

module.exports = bundle;