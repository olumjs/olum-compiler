const connect = require("gulp-connect");
const logger = require("./logger");
const { olum: settings } = require("../../../package.json");

const server = () => {
  const taskName = "server";
  return new Promise((resolve, reject) => {
    try {
      logger(taskName, "start");
      const options = {
        root: "build",
        port: process.env.PORT || settings.port,
        livereload: settings.livereload,
        https: settings.https,
        fallback: "build"+settings.fallback,
      };
      connect.server(options);
      resolve();
      logger(taskName, "end");
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = server;