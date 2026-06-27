const { RAW_OPEN, RAW_CLOSE, shieldOps } = require("./tokens");

// `html="expr"` — render the expression as UNESCAPED HTML, replacing the element's content
// (like Vue's v-html / React's dangerouslySetInnerHTML). It's a "code attribute": the "" holds a
// JS expression. Output is a raw `${expr}` interpolation (NOT wrapped in olum.esc), so use it only
// on trusted/sanitized HTML. The per-value primitive olum.html(x) still exists for inline/mixed use.
//
// Runs before the control-flow handlers (which dissolve elements into template text), so an html
// element inside <for>/<if> is rewritten while it's still a real DOM node.
function handleHtml(body) {
  const elms = new Array().slice.call(body.querySelectorAll("[html]"));
  elms.forEach((item) => {
    const expr = shieldOps((item.getAttribute("html") || "").trim()); // protect <,> from the DOM round-trip
    item.removeAttribute("html");
    if (!expr) return;
    const encoded = expr.replace(/{/g, "&lt;-olum-&gt;"); // hide JS braces from the {expr} escape pass
    item.innerHTML = RAW_OPEN + encoded + RAW_CLOSE; // raw ${expr} — replaces the element's content
  });
}

module.exports = handleHtml;
