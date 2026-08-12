const fs = require("fs");
const acorn = require("acorn");
const splitBarrels = require("./barrelSplit");

const hasBareImport = (code) => /from\s*["'][^./"']/.test(code);

function splitJsBarrels(code, rootDir) {
  if (!hasBareImport(code)) return code;

  let body;
  try {
    body = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
    }).body;
  } catch (e) {
    return code;
  }

  const nodes = body.filter((node) => node.type === "ImportDeclaration");

  for (let i = nodes.length - 1; i >= 0; i--) {
    const { start, end } = nodes[i];
    const statement = code.slice(start, end);
    const split = splitBarrels(statement, rootDir);
    if (split !== statement)
      code = code.slice(0, start) + split + code.slice(end);
  }
  return code;
}

function splitFile(file, rootDir) {
  const code = fs.readFileSync(file, "utf8");
  const split = splitJsBarrels(code, rootDir);
  if (split !== code) fs.writeFileSync(file, split);
}

module.exports = splitJsBarrels;
module.exports.file = splitFile;
