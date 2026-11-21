const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd().replace(/\/module$/, "");

function files() {
  const mode =
    process.env.NODE_ENV === "production" ? "production" : "development";
  return [".env", `.env.${mode}`].map((name) => path.join(projectRoot, name));
}

function parse(src) {
  const vars = {};
  src.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) return;
    let value = (m[2] || "").trim();
    const quote = value[0];
    if (
      (quote === '"' || quote === "'" || quote === "`") &&
      value.lastIndexOf(quote) > 0
    ) {
      value = value.slice(1, value.lastIndexOf(quote));
      if (quote === '"') value = value.replace(/\\n/g, "\n");
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    vars[m[1]] = value;
  });
  return vars;
}

function load() {
  return files().reduce(
    (vars, file) =>
      fs.existsSync(file)
        ? Object.assign(vars, parse(fs.readFileSync(file, "utf8")))
        : vars,
    {},
  );
}

function moduleSource() {
  return `globalThis.process = globalThis.process || {};\nglobalThis.process.env = Object.assign(globalThis.process.env || {}, ${JSON.stringify(load())});\n`;
}

module.exports = { load, parse, moduleSource, files };
