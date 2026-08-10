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

// A `pkgName + "/"` prefix entry resolves every subpath straight to disk, which
// is only how Node behaves for a package with no `exports` map. Where a map
// exists its keys are aliases -- "olum-icons/lucide" names dist/lucide/index.js,
// it isn't a path -- so each one needs an entry of its own, and the blanket
// prefix has to go: it would let dev resolve specifiers the bundler rejects.
function subpathImports(pkg, pkgName) {
  const base = "/node_modules/" + pkgName + "/";
  const exp = pkg.exports;
  const isSubpathMap =
    exp &&
    typeof exp === "object" &&
    !Array.isArray(exp) &&
    Object.keys(exp).some((key) => key.startsWith("."));
  if (!isSubpathMap) return { [pkgName + "/"]: base };

  const imports = {};
  Object.keys(exp).forEach((key) => {
    if (key === "." || !key.startsWith(".")) return;
    const target = pickEntry(exp[key]);
    if (!target) return;
    if (!key.includes("*")) {
      imports[pkgName + key.slice(1)] = base + target.replace(/^\.?\//, "");
      return;
    }
    // An import map only substitutes prefixes, so a pattern is expressible
    // when both sides carry the same text after the wildcard -- that text is
    // then part of the specifier the browser writes and needs no rewriting.
    // "./*.js": "./dist/*.js" becomes "pkg/" -> "/node_modules/pkg/dist/".
    const [keyPrefix, keySuffix] = key.split("*");
    const [targetPrefix, targetSuffix] = target.split("*");
    if (keySuffix !== targetSuffix) return;
    imports[pkgName + keyPrefix.slice(1)] =
      base + targetPrefix.replace(/^\.?\//, "");
  });
  return imports;
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
  const pkgJsonPath = path.join(
    rootDir,
    "node_modules",
    pkgName,
    "package.json",
  );
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  imports[pkgName] = entry;
  Object.assign(imports, subpathImports(pkg, pkgName));
  Object.keys(pkg.dependencies || {}).forEach((dep) =>
    addPackage(rootDir, dep, imports),
  );
}

function buildImports(srcDir) {
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
      Object.assign(
        imports,
        subpathImports(
          JSON.parse(
            fs.readFileSync(
              path.join(rootDir, "node_modules", pkgName, "package.json"),
              "utf8",
            ),
          ),
          pkgName,
        ),
      );
    });
  }

  getBareSpecifiers(srcDir).forEach((spec) => {
    const pkgName = toPkgName(spec);
    if (pkgName in localLibs) return;
    addPackage(rootDir, pkgName, imports);
  });
  return imports;
}

function importMap(srcDir) {
  return (
    '<script type="importmap">' +
    JSON.stringify({ imports: buildImports(srcDir) }, null, 2) +
    "</script>"
  );
}

module.exports = importMap;
// Exposed for the test suite -- the interesting logic is the exports-map
// translation, which shouldn't need a whole node_modules tree to exercise.
module.exports.subpathImports = subpathImports;
