const path = require("path");

function toJs(statement) {
  return statement.replace(/(from)(\s+)?.*/g, (str) => {
    let _path = str.replace(/from|'|"/g, "").trim();
    const extname = path.extname(_path);
    const newPath = extname ? _path.replace(extname, "") : _path;
    return 'from "' + newPath + '.js";';
  });
}

module.exports = toJs;
