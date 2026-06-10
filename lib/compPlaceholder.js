const { getLineInfo } = require("./lineCounter");

function handleCompPlaceholder(body, counter, filePath) {
  const comps = new Array().slice.call(body.querySelectorAll("olum"));
    return comps.map(comp => {
        if (comp.hasAttribute("name")) return comp.getAttribute("name");
    }).filter(item => item);
}

module.exports = handleCompPlaceholder;
