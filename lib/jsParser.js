const { script, exportDefault } = require("./regex");
const jsdom = require("jsdom");

const clean = require("./clean");
function jsParser(str) {
  str = clean(str);
  const arr = str.match(script);
  let content = Array.isArray(arr) && arr.length ? arr[0] : "";
  
  // fill empty logic to make component works if there is no script tag
  // if (content === "") return `__isInitial__: true,\n__render__(obj, prop) { olum.lifeCycle.render(obj, prop); },\n};`;
  
  // handle script tag attributes
  const attrsObj = {};
  if(content !== "") {
    const dom = new jsdom.JSDOM(content).window.document;
    const scriptElm = dom.querySelector("script");
    const attrs = scriptElm.getAttributeNames();
    if (attrs.length) attrs.forEach(key =>attrsObj[key] = scriptElm.getAttribute(key))
    // console.warn(attrsObj);
  }

  content = content.replace(/(<script.*>)/, "");
  content = content.replace(/(<\/script>)$/, "");
  content = content.replace(/onMount\(/, "var mounted = onMount("); // handle onMount hook if imported -- wrape it to another name (mounted) to continue the old flow
  // content = content.replace(exportDefault, "").trim();
  // return "__isInitial__: true,\n__render__(obj, prop) { olum.lifeCycle.render(obj, prop); },\n" + content;
  content = content.replace(/const state/g, "var state"); // todo make this solid
  return {js: content, jsAttrs: attrsObj};
}

module.exports = jsParser;
