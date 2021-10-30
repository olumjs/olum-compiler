const compile = require("./compile");
const bundle = require("./bundle");
const clean = require("./clean");
const catchall = require("./catchall");
const desktop = require("./desktop");
const colors = require("colors");
const copyBuild = require("./copy-build");

async function renderBuild() {
  try {
    await clean("dest"); // remove 'build' folder
    await compile("production");
    await bundle("production");
    await clean("src"); // remove '.pre-build' folder
    await catchall(); // catch all routes to fallback to root
    await copyBuild(); // copy build folder to project root after finishing builing for production
    await desktop(); // package desktop app
    process.exitCode = 1;
  } catch (err) {
    console.log(colors.red.bold(err));
  }
}

module.exports = renderBuild;