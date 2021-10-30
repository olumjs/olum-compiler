const path = require("path");
const gulp = require("gulp");
const connect = require("gulp-connect");

const reload = () => gulp.src(path.resolve(__dirname, "../build")).pipe(connect.reload());

module.exports = reload;
