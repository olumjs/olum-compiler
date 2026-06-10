const { getLineInfo } = require("./lineCounter");
const path = require("path");

function handleModels(body, counter, filePath) {
  const elms = new Array().slice.call(body.querySelectorAll("[model]"));
  const name = path.basename(filePath).replace(/\.html/i, "");
  elms.forEach(item => {
    const value = item.getAttribute("model").trim();
    if (value) {
      const data = value.split(".");
      const index = hasMode(data);
      if (index) {
        const prop = data.slice(0, index).join(".");
        const mode = data.slice(index);
        item.setAttribute("data-o-e", "true");
        item.setAttribute("data-o-model", prop + "," + name);
        item.removeAttribute("model");
        if (mode.length) item.setAttribute("data-o-model-mode", mode.join(","));
        // console.log({ index, data, prop, mode });
        // console.log(item.outerHTML + "\n----------");
      } else if (index === false) {
        const prop = data.join(".");
        item.setAttribute("data-o-e", "true");
        item.setAttribute("data-o-model", prop + "," + name);
        item.removeAttribute("model");
        // console.log({ index, data, prop });
        // console.log(item.outerHTML + "\n----------");
      } else if (index === 0) {
        getLineInfo(counter, item, filePath, "Can't start model attribute with a modifier!");
      }
    }
  });
}

function hasMode(data) {
  const max = 999;
  let mode1 = data.indexOf("trim");
  let mode2 = data.indexOf("num");
  let mode3 = data.indexOf("bool");
  mode1 = mode1 === -1 ? max : mode1;
  mode2 = mode2 === -1 ? max : mode2;
  mode3 = mode3 === -1 ? max : mode3;
  const indexArr = [mode1, mode2, mode3];
  const min = Math.min(...indexArr);
  // console.log({ min, mode1, mode2, mode3 });
  if (min === max) return false;
  else if (min === 0) return 0;
  return min;
}

module.exports = handleModels;
