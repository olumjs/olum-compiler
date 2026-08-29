const fs = require("fs");
const path = require("path");
const bundle = require("./bundle");
const compile = require("./compiler");
const copySrc = require("./copySrc");
const ssg = require("./ssg");

(async function () {
  const bootAt = Date.now();
  const sitemap = path.resolve(__dirname, "../src/sitemap.js");
  try {
    await copySrc();
    await compile();
    await bundle(bootAt);
    if (fs.existsSync(sitemap)) await ssg();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
