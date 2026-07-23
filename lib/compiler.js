const fs = require("fs");
const getTempPath = require("./getTempPath");
const parser = require("./parser");
const { lineCounter } = require("./lineCounter");
const { compExt } = require("./regex");

function compileFile(filePath) {
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath).toString();
    const counter = lineCounter(fileContent);
    let parsedData = parser(fileContent, counter, filePath);
    const newFilePath = filePath.replace(compExt, ".js");

    fs.writeFileSync(newFilePath, parsedData);

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}
module.exports = compileFile;

if (require.main === module) {
  const pathsArr = process.argv[2] ? [process.argv[2]] : getTempPath();
  pathsArr.forEach(compileFile);
}
