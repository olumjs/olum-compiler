const gulp = require("gulp");
const watch = require('gulp-watch');
const compile = require("./compile");
const bundle = require("./bundle");
const colors = require("colors");
const logger = require("./logger");
const path = require("path");
const src = path.resolve(__dirname, "../../../src/**/*");

// start old
// const watcher = gulp.watch([src]);
// const watchSequence = [];
// const sequence = () => {
//   console.log(colors.bgRed.white(taskName));
//   watchSequence.forEach(clearTimeout); // clear watch sequence
//   const timeout = setTimeout(() => compile("development").then(() => bundle("development")), 1000);
//   watchSequence.push(timeout);
// };
// end old 

const taskName = "watch";
const watchSequence = [];
const watcher = () => {
  return new Promise((resolve, reject) => {
    try {
      logger(taskName, "start");
      // watcher.on("change", sequence);

      watch(src, () => {
        console.log(colors.bgRed.white(taskName));
        watchSequence.forEach(clearTimeout); // clear watch sequence
        let timeout = setTimeout(() => compile("development").then(() => bundle("development")), 0);
        watchSequence.push(timeout);
      });

      logger(taskName, "end");
      resolve();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = watcher;