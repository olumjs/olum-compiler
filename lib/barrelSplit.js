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

// A package with an `exports` map is only reachable through the subpaths it
// lists -- a file that exists on disk but isn't exported can't be imported by
// name, and bundlers hard-fail on the attempt. Deep-importing a barrel member
// is only safe once the target survives this check. Mirrors the pattern
// matching in Node's PACKAGE_EXPORTS_RESOLVE, minus the condition ordering
// (pickEntry already picks a browser/ESM branch).
function exposes(exp, subpath, dir) {
  // Matching a pattern isn't enough -- the wildcard has to be substituted back
  // into the target and the result has to exist. "./*.js": "./dist/*.js" does
  // match "./dist/OlumLogo.js", but resolves it to "./dist/dist/OlumLogo.js",
  // which is nothing. Approving that would emit a specifier no bundler
  // resolves, which is the failure this whole check exists to prevent.
  const lands = (target) =>
    typeof target === "string" &&
    fs.existsSync(path.resolve(dir, target.replace(/^\.?\//, "")));

  // No exports field at all: legacy resolution, every file is addressable.
  if (exp == null) return true;

  // A string, an array or a bare conditions object describes the root export
  // and nothing else, so no deep path is reachable.
  const isSubpathMap =
    typeof exp === "object" &&
    !Array.isArray(exp) &&
    Object.keys(exp).some((key) => key.startsWith("."));
  if (!isSubpathMap) return false;

  if (Object.hasOwn(exp, subpath)) return lands(pickEntry(exp[subpath]));

  // Longest matching prefix wins, as in Node's resolver.
  let best = null;
  for (const key of Object.keys(exp)) {
    const star = key.indexOf("*");
    if (star === -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (subpath.length < prefix.length + suffix.length) continue;
    if (!subpath.startsWith(prefix)) continue;
    if (suffix && !subpath.endsWith(suffix)) continue;
    if (!best || prefix.length > best.prefix.length)
      best = { prefix, suffix, value: exp[key] };
  }
  if (!best) return false;

  const target = pickEntry(best.value);
  if (typeof target !== "string" || !target.includes("*")) return lands(target);

  const captured = subpath.slice(
    best.prefix.length,
    best.suffix ? subpath.length - best.suffix.length : undefined,
  );
  return lands(target.replace("*", captured));
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
        const rel = path.relative(dir, target).split(path.sep).join("/");
        // Also drops re-exports that resolve outside the package ("../").
        if (!exposes(pkg.exports, "./" + rel, dir)) return;
        const spec = pkgName + "/" + rel;
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
