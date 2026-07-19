const bundle = require("./bundle");
const compile = require("./compiler");
const copySrc = require("./copySrc");

(async function () {
  const bootAt = Date.now();
  try {
    await copySrc();
    await compile();
    await bundle(bootAt);
  } catch (error) {
    console.error(error);
    process.exitCode = 1; // a failed build must not report success to CI
  }
})();
