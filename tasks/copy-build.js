const logger = require("./logger");
const extra = require("fs-extra");
const path = require("path");
const fs = require("fs");

const copyBuild = () => {
  const taskName = "copyBuild";
  return new Promise((resolve, reject) => {
    logger(taskName, "start");
    // delete build folder if it exists
    const dest = path.resolve(__dirname, "../../../build");
    if (fs.existsSync(dest)) {
      extra.remove(dest, err => {
        if (err) return reject(err);
        // copy folder to project root
        extra.copy(path.resolve(__dirname, "../build"), path.resolve(__dirname, "../../../build"), err => {
          if (err) return reject(err);
          resolve();
          logger(taskName, "end");
        });
      });
    } else {
      // copy folder to project root
      extra.copy(path.resolve(__dirname, "../build"), path.resolve(__dirname, "../../../build"), err => {
        if (err) return reject(err);
        resolve();
        logger(taskName, "end");
      });
    }
  });
};

module.exports = copyBuild;