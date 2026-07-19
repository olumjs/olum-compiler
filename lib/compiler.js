const fs = require("fs");
const getTempPath = require("./getTempPath");
const parser = require("./parser");
const { lineCounter } = require("./lineCounter");
const { compExt } = require("./regex");

// todo handle the component when it has these cases [null, only html, html + css, html+js, html+css+js, only css, only js]
function compileFile(filePath) {
  // console.warn("final: ", filePath);
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath).toString();
    const counter = lineCounter(fileContent);
    let parsedData = parser(fileContent, counter, filePath);
    const newFilePath = filePath.replace(compExt, ".js");
    // create .js module
    fs.writeFileSync(newFilePath, parsedData);
    // remove .html template
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}
module.exports = compileFile; // required in-process by the dev server (jsdom/acorn load once)

// script mode (npm run build / full compile): compile one file (arg) or all
if (require.main === module) {
  const pathsArr = process.argv[2] ? [process.argv[2]] : getTempPath();
  pathsArr.forEach(compileFile);
}
