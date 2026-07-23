const { getLineInfo } = require("./lineCounter");
const { RAW_OPEN, RAW_CLOSE, shieldOps } = require("./tokens");

function handleLog(body, counter, filePath) {
  const elms = new Array().slice.call(body.querySelectorAll("log"));
  elms.forEach((item) => {
    const raw = (item.textContent || "").trim();
    const match = raw.match(/^\{([\s\S]*)\}$/);
    if (!match || !match[1].trim()) {
      getLineInfo(
        counter,
        item,
        filePath,
        "Empty or malformed <log> — expected <log>{expr}</log>:",
      );
      item.remove();
      return;
    }
    const expr = shieldOps(match[1].trim());
    const encoded = expr.replace(/{/g, "&lt;-olum-&gt;");

    item.insertAdjacentHTML(
      "beforebegin",
      RAW_OPEN + "(console.log(" + encoded + "), '')" + RAW_CLOSE,
    );
    item.remove();
  });
}

module.exports = handleLog;
