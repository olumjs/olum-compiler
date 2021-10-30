const logger = require("./logger");
const reload = require("./reload");
const spawn = require("cross-spawn");

const bundle = mode => {
  const taskName = "bundle";
  return new Promise((resolve, reject) => {
    logger(taskName, "start");
    if (mode === "development") {
      spawn.sync("webpack", ["--env", "dev"], { stdio: "inherit" } );
      reload();
      resolve();
      logger(taskName, "end");
    } else if (mode === "production") {
      spawn.sync("webpack", { stdio: "inherit" } );
      resolve();
      logger(taskName, "end");
    }
  });
};

module.exports = bundle;