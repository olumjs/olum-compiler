const parse5 = require("parse5");

function splitSFC(source) {
  source = String(source);
  const doc = parse5.parse(source, {
    sourceCodeLocationInfo: true,
    scriptingEnabled: false,
  });

  const scripts = [],
    styles = [],
    comments = [];
  (function walk(node) {
    for (const child of node.childNodes || []) {
      if (child.nodeName === "#comment") {
        comments.push(child);
        continue;
      }
      if (child.tagName === "script") scripts.push(child);
      else if (child.tagName === "style") styles.push(child);
      walk(child);
      if (child.content) walk(child.content);
    }
  })(doc);

  const inner = (node) => {
    const loc = node.sourceCodeLocation;
    if (!loc) return "";
    const start = loc.startTag ? loc.startTag.endOffset : loc.startOffset;
    const end = loc.endTag ? loc.endTag.startOffset : loc.endOffset;
    return source.slice(start, end);
  };

  const script = scripts[0] || null;
  const style = styles[0] || null;

  const jsAttrs = {};
  if (script) script.attrs.forEach((a) => (jsAttrs[a.name] = a.value));

  const ranges = scripts
    .concat(styles, comments)
    .map((n) => n.sourceCodeLocation)
    .filter(Boolean)
    .map((loc) => [loc.startOffset, loc.endOffset])
    .sort((a, b) => a[0] - b[0]);
  let template = "";
  let pos = 0;
  ranges.forEach(([start, end]) => {
    if (start >= pos) {
      template += source.slice(pos, start);
      pos = end;
    }
  });
  template += source.slice(pos);

  return {
    js: script ? inner(script) : "",
    jsAttrs,

    scriptStartLine:
      script && script.sourceCodeLocation
        ? script.sourceCodeLocation.startLine - 1
        : 0,
    css: style ? inner(style) : "",
    template: template.trim(),
  };
}

module.exports = splitSFC;
