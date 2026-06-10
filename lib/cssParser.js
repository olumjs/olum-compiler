const { style } = require("./regex");

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Rename @keyframes declarations and all their animation/animation-name references
// to <name>-<compName> so same-named keyframes in different components don't collide.
function renameKeyframes(css, compName) {
  const names = [];
  css.replace(/@keyframes\s+([\w-]+)/g, (_, name) => names.push(name));
  if (!names.length) return css;
  names.forEach(name => {
    const re = escapeRe(name);
    const newName = name + "-" + compName;
    css = css.replace(new RegExp(`(@keyframes\\s+)${re}\\b`, "g"), "$1" + newName);
    css = css.replace(new RegExp(`(animation-name\\s*:[^;{]*)\\b${re}\\b`, "g"), "$1" + newName);
    css = css.replace(new RegExp(`(animation\\s*:[^;{]*)\\b${re}\\b`, "g"), "$1" + newName);
  });
  return css;
}

function scopeCSS(css, scopeAttr, compName) {
  css = renameKeyframes(css, compName);
  css = css.replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments

  const scope = `[data-o-${scopeAttr}]`;
  let out = "";
  let i = 0;

  function skipWS() {
    while (i < css.length && /\s/.test(css[i])) i++;
  }

  function readBlock() {
    let depth = 1, content = "";
    i++; // skip opening {
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") { depth--; if (depth === 0) { i++; break; } }
      if (depth > 0) content += css[i];
      i++;
    }
    return content;
  }

  function scopeSelectors(sel) {
    return sel.split(",").map(s => {
      s = s.trim();
      if (!s) return "";
      if (/^(:root|html|body)\b/.test(s)) return s;
      return scope + " " + s; // descendant combinator — root is now stamped so this covers all cases
    }).filter(Boolean).join(", ");
  }

  while (i < css.length) {
    skipWS();
    if (i >= css.length) break;
    const blockStart = css.indexOf("{", i);
    if (blockStart === -1) break;
    const selector = css.slice(i, blockStart).trim();
    i = blockStart;
    const content = readBlock();
    if (/^@keyframes\b/i.test(selector) || /^@font-face\b/i.test(selector)) {
      out += selector + " {" + content + "}\n";
    } else if (/^@(media|supports|layer|container)\b/i.test(selector)) {
      out += selector + " {" + scopeCSS(content, scopeAttr, compName) + "}\n";
    } else {
      out += scopeSelectors(selector) + " {" + content + "}\n";
    }
    skipWS();
  }

  return out;
}

function cssParser(str, scopeAttr, compName) {
  const arr = str.match(style);
  let content = Array.isArray(arr) && arr.length ? arr[arr.length - 1] : "";
  content = content.replace(/(<style.*?>)/, "");
  content = content.replace(/(<\/style>)$/, "");
  content = content.trim();
  if (scopeAttr && compName && content) content = scopeCSS(content, scopeAttr, compName);
  return "__style__() { return `" + content + "`;},\n";
}

module.exports = cssParser;
