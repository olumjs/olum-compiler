const jsdom = require("jsdom");
const { script, style, selfClosingTag, normalTag } = require("./regex");
const placeholder = require("./placeholder");
const clean = require("./clean");
const handleIfStatement = require("./if");
const handleForStatement = require("./for");
const handleShowStatement = require("./show");
const handleEvents = require("./events");
const handleStyles = require("./styles");
const handleModels = require("./models");
const handleAttr = require("./attr");
const handleCompPlaceholder = require("./compPlaceholder");
const { RAW_OPEN, RAW_CLOSE } = require("./tokens");

function htmlparser(str, counter, filePath) {
  let content = str.replace(script, "").replace(style, "");
  content = clean(content); // clean html comments to avoid runtime errors
  content = placeholder(content, selfClosingTag, "self");
  content = placeholder(content, normalTag, "normal");
  // Allow unquoted each={expr} / when={expr} / key={expr} — wrap in quotes so jsdom can parse the
  // attribute. `key` is part of #3 (keyed <for>): <for each={t of arr} key={t.id}>.
  content = content.replace(/\b(each|when|key)=\{([^}]+)\}/g, '$1="{$2}"');

  // Anonymous function event handlers: on<event>={(e)=> expr} → on<event>="__olumAnon_id($event)"
  // The extracted function body is collected and later injected into the component JS as a named method.
  const anonHandlers = [];
  content = content.replace(/(on[a-z]+)=\{((?:[^{}]|\{[^{}]*\})*)\}/g, (match, attr, fn) => {
    const trimmed = fn.trim();
    if (/^(?:\([^)]*\)|\w+)\s*=>|^function[\s(]/.test(trimmed)) {
      const handlerName = "__olumAnon_" + Math.random().toString(36).slice(2, 9);
      anonHandlers.push(`const ${handlerName} = ${trimmed};`);
      return `${attr}="${handlerName}($event)"`;
    }
    return match;
  });

  // using dom parser
  const body = new jsdom.JSDOM(content).window.document.body;
  handleEvents(body, counter, filePath);
  handleStyles(body, counter, filePath);
  handleAttr(body, counter, filePath);
  handleModels(body, counter, filePath);
  handleIfStatement(body, counter, filePath);
  handleForStatement(body, counter, filePath);
  handleShowStatement(body, counter, filePath);
  const comps = handleCompPlaceholder(body, counter, filePath);

  content = body.innerHTML;

  // #2 (escape-by-default): at this point every literal `{expr}` left in the markup is a USER value
  // interpolation (text like `{props.todo.text}` or a simple attribute like `id="todo-{x.id}"`).
  // Control-flow interpolations were emitted with RAW_OPEN/RAW_CLOSE sentinels instead of braces,
  // and nested function-body / object-literal braces are entity-encoded as `<-olum->`, so neither
  // appears as a literal `{` here. Wrapping each remaining `{expr}` in `olum.esc(...)` therefore
  // escapes user-facing output (preventing XSS and "special characters break the page" bugs) while
  // leaving structural code untouched. `[^{}]+` keeps each match to a single, non-nested pair.
  content = content.replace(/\{([^{}]+)\}/g, (match, expr) => expr.trim() === "children" ? "${children}" : "${olum.esc(" + expr + ")}");

  content = content.replace(/&amp;/g, "&"); // fix entity
  content = content.replace(/=&gt;/g, "=>"); // preserve arrow functions
  content = content.replace(/&lt;-olum-&gt;|&amp;lt;-olum-&amp;gt;/g, "{"); // fix curly braces sign

  // #2: structural (compiler-generated) interpolations produce raw HTML, so emit them as plain
  // `${...}` WITHOUT esc(). Done after the escape pass so user braces are already handled.
  content = content.split(RAW_OPEN).join("${").split(RAW_CLOSE).join("}");
  // todo check if var html is empty string then return nothing for better performance
  // return "__template__() {\n var html = `\n" + content.trim() + "`;\nvar data = olum.lifeCycle.temp(this, html);\nolum.handelEvents(data.$wrapper,this);\nreturn data;\n},";
  return {html: content.trim(), comps, anonHandlers};
}

module.exports = htmlparser;
