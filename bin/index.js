#!/usr/bin/env node

"use strict";

const process = require("process");
process.on("unhandledRejection", err => {
  throw new Error(err);
});

// check node version
const requiredNodeMajorVer = +require("../package.json").engines.node.replace(/\<|\>|\=/gi,"").split(".")[0];
const currentNodeMajorVer = +process.version.replace(/v/gi, "").split(".")[0];
if (currentNodeMajorVer < requiredNodeMajorVer) {
  console.error(`\nYour node version is "${currentNodeMajorVer}" which is not compatible with 'olum-compiler', Please upgrade to "${requiredNodeMajorVer}"\n`);
  process.exit(1);
}

const path = require("path");
const spawn = require("cross-spawn");
const script = process.argv[2];

if (typeof script !== undefined && ["dev", "build"].includes(script)) {
  const result = spawn.sync("gulp", [script, "--gulpfile", path.resolve(__dirname, "../tasks")], { stdio: "inherit" });

  if (result.signal) {
    if (result.signal === "SIGKILL" || result.signal === "SIGTERM") console.log("Failed to run " + script + " script!");
    process.exit(1);
  }

  process.exit(result.status);
}