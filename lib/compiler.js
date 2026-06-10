const fs = require("fs");
const getTempPath = require("./getTempPath");
const parser = require("./parser");
const { lineCounter } = require("./lineCounter");
const { compExt } = require("./regex");

// todo handle the component when it has these cases [null, only html, html + css, html+js, html+css+js, only css, only js]
const pathsArr = getTempPath();
pathsArr.forEach((filePath) => {
  // console.warn("final: ", filePath);
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath).toString();
    const counter = lineCounter(fileContent);
    let parsedData = parser(fileContent, counter, filePath);
    const newFilePath = filePath.replace(compExt, ".js");
    // create .js module
    fs.writeFileSync(newFilePath, parsedData);
    // remove .html template
    fs.unlinkSync(filePath);
  }
});
