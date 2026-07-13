const path = require("path");

function toJs(statement) {
  return statement.replace(/(from)(\s+)?.*/g, (str) => {
    let _path = str.replace(/from|'|"/g, "").trim();
    // bare specifiers (npm pkgs, olum) resolve via the import map in index.html — don't touch them
    if (!/^\.{0,2}\//.test(_path)) return 'from "' + _path + '";';
    const extname = path.extname(_path);
    const newPath = extname ? _path.replace(extname, "") : _path;
    return 'from "' + newPath + '.js";';
  });
}

module.exports = toJs;
