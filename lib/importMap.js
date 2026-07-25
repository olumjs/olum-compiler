const fs = require("fs");
const path = require("path");
const colors = require("./colors");
const { ls, isFile } = require("./helpers");

const { useLocalCore, localLibs, optionalLibs } = require("./coreLibs");

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

function resolvePackage(rootDir, pkgName) {
  const pkgJsonPath = path.join(
    rootDir,
    "node_modules",
    pkgName,
    "package.json",
  );
  if (!fs.existsSync(pkgJsonPath)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  let exp = pkg.exports;

  if (exp && typeof exp === "object" && !Array.isArray(exp)) {
    const keys = Object.keys(exp);
    if (keys.some((k) => k.startsWith("."))) exp = exp["."];
  }
  let entry = pickEntry(exp) || pkg.module || pkg.main || "index.js";
  entry = entry.replace(/^\.?\//, "");
  return "/node_modules/" + pkgName + "/" + entry;
}

function getBareSpecifiers(srcDir) {
  const specifiers = new Set();
  const files = ls(srcDir, { absolute: true }).filter(
    (p) => isFile(p) && /\.(html|js)$/i.test(p),
  );
  const regex = /(?:from\s+|import\s+|import\s*\(\s*)["']([^"'\n]+)["']/g;
  files.forEach((file) => {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = regex.exec(content))) {
      const spec = match[1];
      if (spec.startsWith(".") || spec.startsWith("/") || /^https?:/.test(spec))
        continue;
      specifiers.add(spec);
    }
  });
  return [...specifiers];
}

function toPkgName(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
}

function addPackage(rootDir, pkgName, imports) {
  if (imports[pkgName]) return;
  const entry = resolvePackage(rootDir, pkgName);
  if (!entry) {
    console.warn(
      colors(
        "yellow",
        "Can't resolve \"" +
          pkgName +
          '" — install it at the project root: npm i ' +
          pkgName,
      ),
    );
    return;
  }
  imports[pkgName] = entry;
  imports[pkgName + "/"] = "/node_modules/" + pkgName + "/";
  const pkgJsonPath = path.join(
    rootDir,
    "node_modules",
    pkgName,
    "package.json",
  );
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  Object.keys(pkg.dependencies || {}).forEach((dep) =>
    addPackage(rootDir, dep, imports),
  );
}

function importMap(srcDir) {
  const rootDir = path.resolve(srcDir, "..");
  const imports = {};

  if (useLocalCore) {
    Object.assign(imports, localLibs);
  } else {
    Object.keys(localLibs).forEach((pkgName) => {
      const entry = resolvePackage(rootDir, pkgName);
      if (!entry) {
        if (!optionalLibs.includes(pkgName))
          console.warn(
            colors(
              "yellow",
              "Can't resolve \"" +
                pkgName +
                '" — install it at the project root: npm i ' +
                pkgName,
            ),
          );
        return;
      }
      imports[pkgName] = entry;
      imports[pkgName + "/"] = "/node_modules/" + pkgName + "/";
    });
  }

  getBareSpecifiers(srcDir).forEach((spec) => {
    const pkgName = toPkgName(spec);
    if (pkgName in localLibs) return;
    addPackage(rootDir, pkgName, imports);
  });
  return (
    '<script type="importmap">' +
    JSON.stringify({ imports }, null, 2) +
    "</script>"
  );
}

module.exports = importMap;
