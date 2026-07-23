const { script, exportDefault } = require("./regex");
const jsdom = require("jsdom");

const clean = require("./clean");
function jsParser(str) {
  str = clean(str);
  const arr = str.match(script);
  let content = Array.isArray(arr) && arr.length ? arr[0] : "";

  const attrsObj = {};
  if (content !== "") {
    const dom = new jsdom.JSDOM(content).window.document;
    const scriptElm = dom.querySelector("script");
    const attrs = scriptElm.getAttributeNames();
    if (attrs.length)
      attrs.forEach((key) => (attrsObj[key] = scriptElm.getAttribute(key)));
  }

  content = content.replace(/(<script.*>)/, "");
  content = content.replace(/(<\/script>)$/, "");
  content = content.replace(/onMount\(/, "var mounted = onMount(");

  content = content.replace(/const state/g, "var state");
  return { js: content, jsAttrs: attrsObj };
}

module.exports = jsParser;
