const { parseDOM } = require("./dom");
const { selfClosingTag, normalTag } = require("./regex");
const placeholder = require("./placeholder");
const handleIfStatement = require("./if");
const handleForStatement = require("./for");
const handleShowStatement = require("./show");
const handleEvents = require("./events");

const handleCompPlaceholder = require("./compPlaceholder");
const handleHtml = require("./html");
const handleLog = require("./log");
const handleTransition = require("./transition");
const handleBoolAttrs = require("./boolAttr");
const handleTextarea = require("./textarea");
const {
  RAW_OPEN,
  RAW_CLOSE,
  LT,
  GT,
  QUOT,
  shieldTags,
  unshieldTags,
} = require("./tokens");

function htmlparser(content, counter, filePath, parentMethods, propsAliases) {
  content = placeholder(
    content,
    selfClosingTag,
    "self",
    parentMethods,
    propsAliases,
  );
  content = placeholder(
    content,
    normalTag,
    "normal",
    parentMethods,
    propsAliases,
  );

  const anonHandlers = [];

  const body = parseDOM(shieldTags(content)).body;
  handleHtml(body);
  handleLog(body, counter, filePath);
  handleTransition(body, counter, filePath);
  handleTextarea(body);
  handleEvents(body, counter, filePath, anonHandlers, propsAliases);

  handleIfStatement(body, counter, filePath);
  handleForStatement(body, counter, filePath);
  handleShowStatement(body, counter, filePath);
  const comps = handleCompPlaceholder(body, counter, filePath);

  content = unshieldTags(body.innerHTML);

  content = handleBoolAttrs(content);

  content = content.replace(/\{([^{}]+)\}/g, (match, expr) => {
    const raw = expr.trim();
    if (raw === "children") return "${children}";
    if (/^props\(\s*\)\.children$/.test(raw)) return "${" + raw + "}";

    const js = expr
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    return "${olum.esc(" + js + ")}";
  });

  content = content.replace(/&amp;/g, "&");
  content = content.replace(/=&gt;/g, "=>");
  content = content.replace(/&lt;-olum-&gt;|&amp;lt;-olum-&amp;gt;/g, "{");
  content = content.split(LT).join("<").split(GT).join(">");
  content = content.split(QUOT).join('"');

  content = content.split(RAW_OPEN).join("${").split(RAW_CLOSE).join("}");

  return { html: content.trim(), comps, anonHandlers };
}

module.exports = htmlparser;
