const fs = require("fs");
const path = require("path");

const toRoot = (dir) => (dir || process.cwd()).replace(/\/module$/, "");

const moduleSrc = path.resolve(__dirname, "../src");

const cache = new Map();

function aliases(root) {
  const pkgPath = path.join(root, "package.json");
  let mtime = 0;
  try {
    mtime = fs.statSync(pkgPath).mtimeMs;
  } catch (e) {}
  const hit = cache.get(root);
  if (hit && hit.mtime === mtime) return hit.list;

  let list = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const conf = pkg.olum && pkg.olum.alias;
    if (conf && typeof conf === "object" && !Array.isArray(conf)) {
      list = Object.keys(conf)
        .filter((name) => name && typeof conf[name] === "string")

        .sort((a, b) => b.length - a.length)
        .map((name) => [name, conf[name]]);
    }
  } catch (e) {}
  cache.set(root, { mtime, list });
  return list;
}

const matches = (spec, name) => spec === name || spec.startsWith(name + "/");

const isPlainPath = (spec) => /^\.{0,2}\//.test(spec) || /^[a-z]+:/i.test(spec);

function projectSpace(file, root) {
  const abs = path.resolve(file);
  return abs === moduleSrc || abs.startsWith(moduleSrc + path.sep)
    ? path.join(root, "src", path.relative(moduleSrc, abs))
    : abs;
}

function isAlias(spec, rootDir) {
  if (typeof spec !== "string" || !spec || isPlainPath(spec)) return false;
  return aliases(toRoot(rootDir)).some(([name]) => matches(spec, name));
}

function resolveAlias(spec, importer, rootDir) {
  if (typeof spec !== "string" || !spec || isPlainPath(spec)) return spec;
  const root = toRoot(rootDir);
  const hit = aliases(root).find(([name]) => matches(spec, name));
  if (!hit || !importer) return spec;

  const [name, target] = hit;
  const rest = spec.slice(name.length).replace(/^\//, "");
  const abs = path.resolve(path.resolve(root, target), rest);
  const from = path.dirname(projectSpace(importer, root));
  const rel = path.relative(from, abs).split(path.sep).join("/");
  return rel.startsWith(".") ? rel : "./" + rel;
}

function rewriteImports(code, file, rootDir) {
  const root = toRoot(rootDir);
  const list = aliases(root);
  if (!list.length) return code;
  if (!list.some(([name]) => code.includes(name))) return code;

  let body;
  try {
    body = require("acorn").parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
    }).body;
  } catch (e) {
    return code;
  }

  const nodes = body.filter(
    (node) =>
      node.source &&
      /^(Import|ExportNamed|ExportAll)Declaration$/.test(node.type),
  );

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const spec = node.source.value;
    const resolved = resolveAlias(spec, file, root);
    if (resolved === spec) continue;
    code =
      code.slice(0, node.source.start) +
      JSON.stringify(resolved) +
      code.slice(node.source.end);
  }
  return code;
}

function rewriteFile(file, rootDir) {
  const code = fs.readFileSync(file, "utf8");
  const out = rewriteImports(code, file, rootDir);
  if (out !== code) fs.writeFileSync(file, out);
}

module.exports = resolveAlias;
module.exports.isAlias = isAlias;
module.exports.rewriteImports = rewriteImports;
module.exports.file = rewriteFile;
