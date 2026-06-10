const fs = require("fs");
module.exports = function (files, value) {
  if (Array.isArray(files) && files.length) {
    files.forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        let jsStr = fs.readFileSync(filePath).toString();
        jsStr = jsStr.replace(/"{{mode}}"/, JSON.stringify(value));
        fs.writeFileSync(filePath, jsStr);
      }
    });
  }
};
