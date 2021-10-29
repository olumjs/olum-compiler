const compile = require("./compile");
const bundle = require("./bundle");
const watch = require("./watch");
const server = require("./server");
const colors = require("colors");

async function renderDev() {
  try {
    // await compile("development");
    await bundle("development");
    // await watch();
    // await server();
  } catch (err) {
    console.log(colors.red.bold(err));
  }
}

module.exports = renderDev;