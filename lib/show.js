const { getLineInfo } = require("./lineCounter");
const { RAW_OPEN, RAW_CLOSE, shieldOps } = require("./tokens");

function handleShowStatement(body, counter, filePath) {
  const showElms = new Array().slice
    .call(body.querySelectorAll("show"))
    .reverse();
  showElms.forEach((item) => {
    if (item.hasAttribute("when")) {
      const condition = shieldOps(item.getAttribute("when").trim());
      const innerContent = item.innerHTML;

      const wrapper =
        '<div data-o-show style="display:' +
        RAW_OPEN +
        "(" +
        condition +
        ")?'contents':'none'" +
        RAW_CLOSE +
        ';">' +
        innerContent +
        "</div>";
      item.insertAdjacentHTML("beforebegin", wrapper);
      item.remove();
    } else {
      const msg = "Missing 'when' attribute:";
      getLineInfo(counter, item, filePath, msg);
    }
  });
}

module.exports = handleShowStatement;
