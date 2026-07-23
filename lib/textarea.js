function handleTextarea(body) {
  const elms = Array.prototype.slice.call(
    body.querySelectorAll("textarea[value]"),
  );
  elms.forEach((item) => {
    item.textContent = item.getAttribute("value");
    item.removeAttribute("value");
  });
}

module.exports = handleTextarea;
