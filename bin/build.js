const fs = require("fs");
const path = require("path");
const bundle = require("./bundle");
const compile = require("./compiler");
const copySrc = require("./copySrc");
const ssg = require("./ssg");
const colors = require("../lib/colors");

const lockFile = path.resolve(__dirname, "../.dev.lock");
const devPid = (() => {
  try {
    return Number(fs.readFileSync(lockFile, "utf8").trim());
  } catch (e) {
    return 0;
  }
})();
const devAlive = (() => {
  try {
    return !!devPid && !!process.kill(devPid, 0);
  } catch (e) {
    return e.code === "EPERM";
  }
})();
if (devAlive) {
  console.error(
    colors(
      "red",
      `A dev server is running (pid ${devPid}) — refusing to build.`,
    ),
  );
  console.error(
    colors(
      "white",
      `The build would overwrite the files it serves and break the page in the browser.\nStop the dev server first, then build.    # or delete ${lockFile} if that process is gone`,
    ),
  );
  process.exit(1);
}

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
