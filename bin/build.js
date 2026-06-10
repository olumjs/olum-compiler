const path = require("path");
const mode = require("../lib/mode");
console.log("build.js");

const files = [
    path.resolve(__dirname, "../core/devtool.js"),
    path.resolve(__dirname, "../lib/parser.js")
];
// mode(files, false); // related to isDev prop