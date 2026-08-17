const parse5 = require("parse5");
const colors = require("./colors");

const RAW_TEXT_TAGS = ["script", "style", "textarea", "title"];

const TAG_BODY = "(?:\"[^\"]*\"|'[^']*'|[^>\"'])*?";
const SELF_CLOSING_RAW_TEXT = new RegExp(
  "<(" + RAW_TEXT_TAGS.join("|") + ")(" + TAG_BODY + ")\\/\\s*>",
  "gi",
);

const expandSelfClosingRawText = (source) =>
  source.replace(
    SELF_CLOSING_RAW_TEXT,
    (_m, name, body) => "<" + name + body + "></" + name + ">",
  );

function findTagEnd(text, from) {
  let quote = null;
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === ">") return i;
  }
  return -1;
}

function scanRawTextBlocks(text, names) {
  const blocks = [];
  const open = new RegExp("<(" + names.join("|") + ")(?=[\\s/>])", "gi");
  let match;
  while ((match = open.exec(text)) !== null) {
    const start = match.index;
    const tagEnd = findTagEnd(text, start);
    if (tagEnd === -1) break;
    const innerStart = tagEnd + 1;
    const close = new RegExp("<\\/" + match[1] + "\\s*>", "i");
    const closeMatch = text.slice(innerStart).match(close);
    const innerEnd = closeMatch ? innerStart + closeMatch.index : text.length;
    const inner = text.slice(innerStart, innerEnd);

    if (!closeMatch && new RegExp(open.source, "i").test(inner)) {
      open.lastIndex = innerStart;
      blocks.push({
        name: match[1].toLowerCase(),
        inner: "",
        start,
        end: innerStart,
        spurious: true,
      });
      continue;
    }
    const end = closeMatch ? innerEnd + closeMatch[0].length : text.length;
    blocks.push({ name: match[1].toLowerCase(), inner, start, end });
    open.lastIndex = end;
  }
  return blocks;
}

function neutralizeStrayRawText(source) {
  const stray = scanRawTextBlocks(source, ["script", "style"]).filter(
    (b) => b.spurious,
  );
  if (!stray.length) return source;
  let out = "";
  let cursor = 0;
  stray.forEach((block) => {
    out +=
      source.slice(cursor, block.start) +
      "&lt;" +
      source.slice(block.start + 1, block.end);
    cursor = block.end;
  });
  return out + source.slice(cursor);
}

function warn(filePath, line, msg) {
  console.warn(
    colors("yellow.bold", "\n<<Olum Warning>>\n") +
      colors(
        "yellow",
        " File: " +
          (filePath || "unknown") +
          "\n Line: " +
          line +
          "\n " +
          msg +
          "\n",
      ),
  );
}

function splitSFC(source, filePath) {
  source = neutralizeStrayRawText(expandSelfClosingRawText(String(source)));
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

  let js = script ? inner(script) : "";
  let css = style ? inner(style) : "";
  let scriptStartLine =
    script && script.sourceCodeLocation
      ? script.sourceCodeLocation.startLine - 1
      : 0;

  const leaked = scanRawTextBlocks(template, ["script", "style"]);
  if (leaked.length) {
    const sourceLine = (block) => {
      const at = source.indexOf(template.slice(block.start, block.end));
      return at === -1 ? 0 : source.slice(0, at).split("\n").length;
    };
    warn(
      filePath,
      sourceLine(leaked[0]),
      "A <" +
        leaked[0].name +
        "> tag stayed inside the markup, so an element above it is still open: an unterminated attribute quote, a literal <script> typed as text, or an unclosed <textarea>/<title>. The tag was pulled out anyway — fix the markup above it.",
    );
    let cleaned = "";
    let cursor = 0;
    leaked.forEach((block) => {
      cleaned += template.slice(cursor, block.start);
      cursor = block.end;
      if (block.name === "style" && !css.trim()) css = block.inner;
      if (block.name === "script" && !js.trim()) {
        js = block.inner;
        const line = sourceLine(block);
        if (line) scriptStartLine = line - 1;
      }
    });
    cleaned += template.slice(cursor);
    template = cleaned;
  }

  return {
    js,
    jsAttrs,

    scriptStartLine,
    css,
    template: template.trim(),
  };
}

module.exports = splitSFC;
