const path = require("path");
const resolveAlias = require("./alias");

function toJs(statement, filePath, rootDir) {
  if (!/(^|\s)from\s/.test(statement))
    return statement.replace(
      /(["'])([^"']+)\1/,
      (str, quote, _path) =>
        quote + resolveAlias(_path, filePath, rootDir) + quote,
    );

  return statement.replace(/(from)(\s+)?.*/g, (str) => {
    let _path = str.replace(/from|'|"/g, "").trim();

    _path = resolveAlias(_path, filePath, rootDir);

    if (!/^\.{0,2}\//.test(_path)) return 'from "' + _path + '";';
    const extname = path.extname(_path);
    const newPath = extname ? _path.replace(extname, "") : _path;
    return 'from "' + newPath + '.js";';
  });
}

module.exports = toJs;
