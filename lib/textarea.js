// <textarea value="..."> — HTML has no `value` attribute on textarea (its value is its text
// content), so a serialized value="..." would be silently ignored by the browser's parser.
// Move the attribute into the element's content, where the later {expr} escape pass
// interpolates it exactly like regular text. If the textarea also has authored content,
// the value attribute wins (they'd be two sources of truth otherwise).
function handleTextarea(body) {
  const elms = Array.prototype.slice.call(body.querySelectorAll("textarea[value]"));
  elms.forEach((item) => {
    item.textContent = item.getAttribute("value");
    item.removeAttribute("value");
  });
}

module.exports = handleTextarea;
