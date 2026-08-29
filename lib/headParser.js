const path = require("path");
const colors = require("./colors");

const LD_JSON =
  /(<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script\s*>)/gi;
const JSON_STRING = /"(?:[^"\\]|\\.)*"/g;
const EXPR = /\{([^{}]+)\}/g;

const MARK = "OLUM_HEAD_EXPR";

const escapeLiteral = (str) =>
  str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const PAGE_FILES = ["page.html", "not-found.html"];

function headParser(content, filePath) {
  content = (content || "").trim();
  if (!content) return "";

  if (
    filePath &&
    PAGE_FILES.indexOf(path.basename(filePath).toLowerCase()) === -1
  ) {
    console.warn(
      colors("yellow.bold", "\n<<Olum Warning>>\n") +
        colors(
          "yellow",
          " File: " +
            filePath +
            "\n <head> was ignored: only a page component (page.html / not-found.html) owns the document head.\n Move these tags into the page.html that renders this component.\n",
        ),
    );
    return "";
  }

  const exprs = [];
  const lift = (expr, raw) =>
    MARK + (exprs.push({ expr: expr.trim(), raw }) - 1) + MARK;

  let out = "";
  let cursor = 0;
  content.replace(LD_JSON, (block, open, body, close, at) => {
    out += content
      .slice(cursor, at)
      .replace(EXPR, (_m, expr) => lift(expr, false));
    out +=
      open +
      body.replace(JSON_STRING, (str) =>
        str.replace(EXPR, (_m, expr) => lift(expr, true)),
      ) +
      close;
    cursor = at + block.length;
    return block;
  });
  out += content.slice(cursor).replace(EXPR, (_m, expr) => lift(expr, false));

  out = escapeLiteral(out);

  out = out.replace(new RegExp(MARK + "(\\d+)" + MARK, "g"), (_m, index) => {
    const { expr, raw } = exprs[index];
    return raw ? "${" + expr + "}" : "${olum.esc(" + expr + ")}";
  });

  return "__head__() { return `" + out + "`;},\n";
}

module.exports = headParser;
