const { getLineInfo } = require("./lineCounter");
const { RAW_OPEN, RAW_CLOSE, shieldOps } = require("./tokens");

function handleShowStatement(body, counter, filePath) {
  const showElms = new Array().slice.call(body.querySelectorAll("show")).reverse(); // we must reverse to start with the very deep if tag which doesn't have nested if tags inside it
  showElms.forEach(item => {
    // console.log(item.outerHTML + "\n----------");
    if (item.hasAttribute("when")) {
      // `when` is a plain JS expression (no braces): <show when="state.visible">
      // shieldOps: protect <,> from the jsdom text round-trip (restored in htmlParser)
      const condition = shieldOps(item.getAttribute("when").trim());
      const innerContent = item.innerHTML;
      // RAW_OPEN/RAW_CLOSE: structural interpolation (both branches return HTML); see tokens.js / #2.
      const ternaryOperator = RAW_OPEN+condition +"?`"+ innerContent + "`:`"+ "<div style=\"display:none;\">"+innerContent+"</div>`"+RAW_CLOSE;
      item.insertAdjacentHTML("beforebegin", ternaryOperator);
      item.remove();
    } else {
      const msg = "Missing 'when' attribute:";
      getLineInfo(counter, item, filePath, msg);
    }
  });
}

module.exports = handleShowStatement;
