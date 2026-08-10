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

const isSubpathMap = (exp) =>
  exp != null &&
  typeof exp === "object" &&
  !Array.isArray(exp) &&
  Object.keys(exp).some((key) => key.startsWith("."));

const toPath = (dir, target) => path.resolve(dir, target.replace(/^\.?\//, ""));

const splitStar = (str) => {
  const star = str.indexOf("*");
  return star === -1 ? null : [str.slice(0, star), str.slice(star + 1)];
};

function resolveTarget(exp, subpath) {
  if (!isSubpathMap(exp)) return null;
  if (Object.hasOwn(exp, subpath)) return pickEntry(exp[subpath]);

  let best = null;
  for (const key of Object.keys(exp)) {
    const parts = splitStar(key);
    if (!parts) continue;
    const [prefix, suffix] = parts;
    if (subpath.length <= prefix.length + suffix.length) continue;
    if (!subpath.startsWith(prefix)) continue;
    if (suffix && !subpath.endsWith(suffix)) continue;
    if (!best || prefix.length > best.prefix.length)
      best = { prefix, suffix, value: exp[key] };
  }
  if (!best) return null;

  const target = pickEntry(best.value);
  if (typeof target !== "string" || !target.includes("*")) return target;
  const captured = subpath.slice(
    best.prefix.length,
    best.suffix ? subpath.length - best.suffix.length : undefined,
  );
  return target.replace("*", captured);
}

function subpathOf(exp, rel, dir) {
  if (rel.startsWith("../")) return null;
  const file = "./" + rel;
  if (exp == null) return file;
  if (!isSubpathMap(exp)) return null;

  const hits = (subpath) => {
    const target = resolveTarget(exp, subpath);
    return (
      typeof target === "string" && toPath(dir, target) === toPath(dir, file)
    );
  };

  for (const key of Object.keys(exp)) {
    if (key === "." || key.includes("*")) continue;
    if (hits(key)) return key;
  }

  let best = null;
  for (const key of Object.keys(exp)) {
    const keyParts = splitStar(key);
    if (!keyParts) continue;
    const target = pickEntry(exp[key]);
    if (typeof target !== "string") continue;
    const targetParts = splitStar(target);
    if (!targetParts) continue;
    const [keyPrefix, keySuffix] = keyParts;
    const [targetPrefix, targetSuffix] = targetParts;

    if (keySuffix !== targetSuffix) continue;
    if (file.length <= targetPrefix.length + targetSuffix.length) continue;
    if (!file.startsWith(targetPrefix) || !file.endsWith(targetSuffix))
      continue;
    const captured = file.slice(
      targetPrefix.length,
      targetSuffix ? file.length - targetSuffix.length : undefined,
    );
    const subpath = keyPrefix + captured + keySuffix;
    if (!hits(subpath)) continue;
    if (!best || targetPrefix.length > best.prefix.length)
      best = { prefix: targetPrefix, subpath };
  }
  return best ? best.subpath : null;
}

function entryFor(dir, pkg, subpath) {
  const exp = pkg.exports;
  let entry;
  if (isSubpathMap(exp)) {
    entry = resolveTarget(exp, subpath);
    if (typeof entry !== "string" && subpath === ".")
      entry = pkg.module || pkg.main;
  } else if (subpath === ".") {
    entry = pickEntry(exp) || pkg.module || pkg.main || "index.js";
  } else {
    entry = subpath;
  }
  if (typeof entry !== "string") return null;

  let entryPath = toPath(dir, entry);
  if (!fs.existsSync(entryPath) && fs.existsSync(entryPath + ".js"))
    entryPath += ".js";
  if (fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory())
    entryPath = path.join(entryPath, "index.js");
  return fs.existsSync(entryPath) ? entryPath : null;
}

const nameOf = (node) => (node.type === "Identifier" ? node.name : node.value);

function barrelMap(rootDir, pkgName, subpath) {
  const key = rootDir + "\0" + pkgName + "\0" + subpath;
  if (cache.has(key)) return cache.get(key);

  let map = null;
  try {
    const dir = path.join(rootDir, "node_modules", pkgName);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    );

    const entryPath = entryFor(dir, pkg, subpath);
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
        if (!fs.existsSync(target)) return;
        const rel = path.relative(dir, target).split(path.sep).join("/");

        const member = subpathOf(pkg.exports, rel, dir);
        if (!member) return;
        const spec = pkgName + member.slice(1);
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

  const rest = source.slice(pkgName.length);
  const subpath = rest ? "." + rest : ".";
  if (!node.specifiers.length) return statement;
  if (!node.specifiers.every((item) => item.type === "ImportSpecifier"))
    return statement;

  const map = barrelMap(root, pkgName, subpath);
  if (!map) return statement;

  const lines = [];
  for (const item of node.specifiers) {
    const hit = map.get(nameOf(item.imported));
    if (!hit || hit.spec === source) return statement;
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
