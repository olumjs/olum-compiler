// todo check changed files only to be copied, use this project https://github.com/eissapk/diff
const path = require("path");
const fs = require("fs");
const { copy, remove } = require("../lib/helpers");

const entryPoint = path.resolve(__dirname, "../../../src");
const entryPoint2 = path.resolve(__dirname, "../../../public");
module.exports = function copySrc() {
  return new Promise((resolve, reject) => {
    try {
      // clean
      if (fs.existsSync(path.resolve(__dirname, "../public"))) remove(path.resolve(__dirname, "../public"));
      if (fs.existsSync(path.resolve(__dirname, "../src"))) remove(path.resolve(__dirname, "../src"));
      // copy
      copy(entryPoint, path.resolve(__dirname, "../src"));
      copy(entryPoint2, path.resolve(__dirname, "../public"));
      resolve();
    } catch (err) {
      reject();
    }
  });
};
