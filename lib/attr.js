const { getLineInfo } = require("./lineCounter");
const path = require("path");

function handleAttr(body, counter, filePath) {
  let name = path.basename(filePath).replace(/\.html/i, "");
  name = name.slice(0, 1).toLowerCase() + name.slice(1);

  const elms = new Array().slice.call(body.querySelectorAll("*"));
  elms.forEach((item) => {
    const attrs = item.getAttributeNames();
    if (attrs.length) {
    }
  });
}

module.exports = handleAttr;
