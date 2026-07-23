const { getLineInfo } = require("./lineCounter");
const { RAW_OPEN, RAW_CLOSE, shieldOps } = require("./tokens");

function hasElseIfOrElse(node) {
  const nextNode = node.nextElementSibling;
  if (
    nextNode &&
    (nextNode.nodeName === "ELSE-IF" || nextNode.nodeName === "ELSE")
  ) {
    return nextNode;
  }
  return false;
}

function handleIfStatement(body, counter, filePath) {
  const ifElms = new Array().slice.call(body.querySelectorAll("if")).reverse();
  ifElms.forEach((item) => {
    if (item.hasAttribute("when")) {
      const condition = shieldOps(item.getAttribute("when").trim());

      const olums = item.querySelectorAll("olum");

      olums.forEach((olum) =>
        olum.setAttribute(
          "if",
          "-[[-" +
            RAW_OPEN +
            "JSON.stringify(!!" +
            condition +
            ")" +
            RAW_CLOSE +
            "-]]-",
        ),
      );

      const innerContent = item.innerHTML;

      if (hasElseIfOrElse(item)) {
        const toBeRemovedArr = [];
        let nodesArr = [{ content: innerContent, when: condition }];
        function recursive(item) {
          const node = hasElseIfOrElse(item);
          nodesArr.push({
            content: node.innerHTML,
            when: shieldOps((node.getAttribute("when") || "").trim()),
          });
          toBeRemovedArr.push(node);
          if (hasElseIfOrElse(node)) recursive(node);
        }
        recursive(item);

        let ternaryOperator = RAW_OPEN;
        nodesArr.forEach((node, index) => {
          if (index === nodesArr.length - 1) {
            if (node.when)
              ternaryOperator +=
                node.when + "?`" + node.content + "`:''" + RAW_CLOSE;
            else ternaryOperator += "`" + node.content + "`" + RAW_CLOSE;
          } else {
            ternaryOperator += node.when + "?`" + node.content + "`:";
          }
        });

        item.insertAdjacentHTML("beforebegin", ternaryOperator);
        toBeRemovedArr.forEach((item) => item.remove());
      } else {
        item.insertAdjacentHTML(
          "beforebegin",
          RAW_OPEN +
            condition +
            "?" +
            "`" +
            innerContent +
            "`" +
            ":''" +
            RAW_CLOSE,
        );
      }
      item.remove();
    } else {
      const msg = "Missing 'when' attribute:";
      getLineInfo(counter, item, filePath, msg);
    }
  });
}

module.exports = handleIfStatement;
