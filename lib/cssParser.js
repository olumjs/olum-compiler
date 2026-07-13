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
      // attach the scope attr to the selector's last compound (p:hover -> p[data-o-x]:hover),
      // not as a descendant combinator — a descendant rule would also match nested components'
      // elements, which sit inside this component's DOM but carry their own scope attr
      let depth = 0, start = 0;
      for (let j = 0; j < s.length; j++) {
        const c = s[j];
        if (c === "(" || c === "[") depth++;
        else if (c === ")" || c === "]") depth--;
        else if (depth === 0 && (c === " " || c === ">" || c === "+" || c === "~")) start = j + 1;
      }
      const compound = s.slice(start);
      let k = 0;
      depth = 0;
      for (; k < compound.length; k++) {
        const c = compound[k];
        if (c === "(" || c === "[") depth++;
        else if (c === ")" || c === "]") depth--;
        else if (c === ":" && depth === 0) break;
      }
      return s.slice(0, start) + compound.slice(0, k) + scope + compound.slice(k);
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
