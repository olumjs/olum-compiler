#!/usr/bin/env node

"use strict";

// todo check node version 1st

const process = require("process");
process.on("unhandledRejection", err => {
  throw new Error(err)
});
const path = require("path");
const spawn = require("cross-spawn");
const script = process.argv[2];

if (typeof script !== undefined && ["dev", "build"].includes(script)) {
  const result = spawn.sync(path.resolve(__dirname, "../node_modules/gulp/bin/gulp.js"),
    [script, "--gulpfile", path.resolve(__dirname, "../tasks")], {
      stdio: "inherit"
    }
  );

  if (result.signal) {
    if (result.signal === "SIGKILL" || result.signal === "SIGTERM") console.log("Failed to run " + script + " script!");
    process.exit(1);
  }

  process.exit(result.status);
}