const { RAW_OPEN, RAW_CLOSE, shieldOps } = require("./tokens");

function handleHtml(body) {
  const elms = new Array().slice.call(body.querySelectorAll("[html]"));
  elms.forEach((item) => {
    const expr = shieldOps((item.getAttribute("html") || "").trim());
    item.removeAttribute("html");
    if (!expr) return;
    const encoded = expr.replace(/{/g, "&lt;-olum-&gt;");
    item.innerHTML = RAW_OPEN + encoded + RAW_CLOSE;
  });
}

module.exports = handleHtml;
