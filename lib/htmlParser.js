const jsdom = require("jsdom");
const { script, style, selfClosingTag, normalTag } = require("./regex");
const placeholder = require("./placeholder");
const clean = require("./clean");
const handleIfStatement = require("./if");
const handleForStatement = require("./for");
const handleShowStatement = require("./show");
const handleEvents = require("./events");
// const handleStyles = require("./styles");
// const handleModels = require("./models");
// const handleAttr = require("./attr");
const handleCompPlaceholder = require("./compPlaceholder");
const handleHtml = require("./html");
const handleBoolAttrs = require("./boolAttr");
const { RAW_OPEN, RAW_CLOSE, LT, GT } = require("./tokens");

function htmlparser(str, counter, filePath, parentMethods, propsAliases) {
  let content = str.replace(script, "").replace(style, "");
  content = clean(content); // clean html comments to avoid runtime errors
  content = placeholder(content, selfClosingTag, "self", parentMethods, propsAliases);
  content = placeholder(content, normalTag, "normal", parentMethods, propsAliases);

  // Inline arrow/function event handlers (oninput="(e)=> expr") are extracted into named
  // __olumAnon_ methods inside handleEvents (collected here, injected into the component JS later).
  const anonHandlers = [];

  // using dom parser
  const body = new jsdom.JSDOM(content).window.document.body;
  handleHtml(body); // html="expr" -> unescaped ${expr} content (before control-flow dissolves elements)
  handleEvents(body, counter, filePath, anonHandlers, propsAliases);
  // DISABLED — :style object binding. Colon attributes are gone; use a string style with
  // {expr} interpolation instead, e.g. style="color:{state.color}". Uncomment to re-enable.
  // handleStyles(body, counter, filePath);
  // handleAttr(body, counter, filePath);
  // DISABLED — `model` two-way binding. Bind manually instead: value="{state.x}" + an
  // oninput handler that writes state.x. Uncomment to re-enable.
  // handleModels(body, counter, filePath);
  handleIfStatement(body, counter, filePath);
  handleForStatement(body, counter, filePath);
  handleShowStatement(body, counter, filePath);
  const comps = handleCompPlaceholder(body, counter, filePath);

  content = body.innerHTML;

  // presence-based boolean attributes: checked="{expr}" -> ${(expr) ? "checked" : ""}.
  // Must run before the {expr} escape pass below, which would otherwise interpolate the VALUE
  // (checked="false" is still checked — the browser only checks attribute presence).
  content = handleBoolAttrs(content);

  // #2 (escape-by-default): at this point every literal `{expr}` left in the markup is a USER value
  // interpolation (text like `{props.todo.text}` or a simple attribute like `id="todo-{x.id}"`).
  // Control-flow interpolations were emitted with RAW_OPEN/RAW_CLOSE sentinels instead of braces,
  // and nested function-body / object-literal braces are entity-encoded as `<-olum->`, so neither
  // appears as a literal `{` here. Wrapping each remaining `{expr}` in `olum.esc(...)` therefore
  // escapes user-facing output (preventing XSS and "special characters break the page" bugs) while
  // leaving structural code untouched. `[^{}]+` keeps each match to a single, non-nested pair.
  // slot content (`children` and `props().children`) is trusted markup authored in the parent
  // template, not user input, so it is emitted RAW (no esc) — escaping it would show its tags as text.
  content = content.replace(/\{([^{}]+)\}/g, (match, expr) => {
    const raw = expr.trim();
    if (raw === "children") return "${children}";
    if (/^props\(\s*\)\.children$/.test(raw)) return "${" + raw + "}";
    return "${olum.esc(" + expr + ")}";
  });

  content = content.replace(/&amp;/g, "&"); // fix entity
  content = content.replace(/=&gt;/g, "=>"); // preserve arrow functions
  content = content.replace(/&lt;-olum-&gt;|&amp;lt;-olum-&amp;gt;/g, "{"); // fix curly braces sign
  content = content.split(LT).join("<").split(GT).join(">"); // restore shielded <,> in directive expressions

  // #2: structural (compiler-generated) interpolations produce raw HTML, so emit them as plain
  // `${...}` WITHOUT esc(). Done after the escape pass so user braces are already handled.
  content = content.split(RAW_OPEN).join("${").split(RAW_CLOSE).join("}");
  // todo check if var html is empty string then return nothing for better performance
  // return "__template__() {\n var html = `\n" + content.trim() + "`;\nvar data = olum.lifeCycle.temp(this, html);\nolum.handelEvents(data.$wrapper,this);\nreturn data;\n},";
  return {html: content.trim(), comps, anonHandlers};
}

module.exports = htmlparser;
