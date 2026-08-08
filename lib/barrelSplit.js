const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const cache = new Map();

function pickEntry(exp) {
  if (typeof exp === "string") return exp;
  if (Array.isArray(exp)) {
    for (const item of exp) {
      const found = pickEntry(item);
      if (found) return found;
    }
    return null;
  }
  if (exp && typeof exp === "object") {
    for (const key of ["browser", "import", "module", "default"]) {
      if (exp[key]) {
        const found = pickEntry(exp[key]);
        if (found) return found;
      }
    }
  }
  return null;
}

const nameOf = (node) => (node.type === "Identifier" ? node.name : node.value);

function barrelMap(rootDir, pkgName) {
  const key = rootDir + "\0" + pkgName;
  if (cache.has(key)) return cache.get(key);

  let map = null;
  try {
    const dir = path.join(rootDir, "node_modules", pkgName);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    );

    let exp = pkg.exports;
    if (exp && typeof exp === "object" && !Array.isArray(exp)) {
      const keys = Object.keys(exp);
      if (keys.some((k) => k.startsWith("."))) exp = exp["."];
    }
    let entry = pickEntry(exp) || pkg.module || pkg.main || "index.js";
    let entryPath = path.resolve(dir, entry.replace(/^\.?\//, ""));
    if (fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory())
      entryPath = path.join(entryPath, "index.js");

    const body = acorn.parse(fs.readFileSync(entryPath, "utf8"), {
      ecmaVersion: "latest",
      sourceType: "module",
    }).body;

    const isPureBarrel =
      body.length > 0 &&
      body.every(
        (node) => node.type === "ExportNamedDeclaration" && node.source,
      );

    if (isPureBarrel) {
      map = new Map();
      body.forEach((node) => {
        const target = path.resolve(path.dirname(entryPath), node.source.value);
        const spec =
          pkgName + "/" + path.relative(dir, target).split(path.sep).join("/");
        node.specifiers.forEach((item) =>
          map.set(nameOf(item.exported), {
            spec,
            imported: nameOf(item.local),
          }),
        );
      });
    }
  } catch (e) {
    map = null;
  }

  cache.set(key, map);
  return map;
}

function splitBarrels(statement, rootDir) {
  const root = (rootDir || process.cwd()).replace(/\/module$/, "");

  let node;
  try {
    const body = acorn.parse(statement, {
      ecmaVersion: "latest",
      sourceType: "module",
    }).body;
    if (body.length !== 1 || body[0].type !== "ImportDeclaration")
      return statement;
    node = body[0];
  } catch (e) {
    return statement;
  }

  const source = node.source.value;
  if (/^[./]/.test(source) || /^https?:/.test(source)) return statement;

  const segments = source.split("/");
  const pkgName = source.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
  if (pkgName !== source) return statement;
  if (!node.specifiers.length) return statement;
  if (!node.specifiers.every((item) => item.type === "ImportSpecifier"))
    return statement;

  const map = barrelMap(root, pkgName);
  if (!map) return statement;

  const lines = [];
  for (const item of node.specifiers) {
    const hit = map.get(nameOf(item.imported));
    if (!hit) return statement;
    const local = item.local.name;
    lines.push(
      hit.imported === "default"
        ? "import " + local + ' from "' + hit.spec + '";'
        : "import { " +
            hit.imported +
            " as " +
            local +
            ' } from "' +
            hit.spec +
            '";',
    );
  }
  return lines.join("\n");
}

module.exports = splitBarrels;
