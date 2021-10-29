const path = require("path");
const gulp = require("gulp");
const connect = require("gulp-connect");
const { olum: settings } = require("../../../package.json");

const reload = () => gulp.src(path.resolve(__dirname, "../"+settings.dest)).pipe(connect.reload());

module.exports = reload;
