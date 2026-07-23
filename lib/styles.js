const { getLineInfo } = require("./lineCounter");
const path = require("path");

function handleStyles(body, counter, filePath) {
  let name = path.basename(filePath).replace(/\.html/i, "");
  name = name.slice(0, 1).toLowerCase() + name.slice(1);

  const elms = new Array().slice.call(body.querySelectorAll("*"));
  elms.forEach((item) => {
    if (item.hasAttribute(":style")) {
      let attrValue = item.getAttribute(":style");
      if (attrValue) {
        attrValue = attrValue.trim();

        let chain = "-[[-${JSON.stringify(" + attrValue + ")}-]]-";

        chain = chain.replace(/{/g, "&lt;-olum-&gt;");

        item.setAttribute("data-o-style", chain);
        item.removeAttribute(":style");
      }
    }
  });
}

module.exports = handleStyles;
