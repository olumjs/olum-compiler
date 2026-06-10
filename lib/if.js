const { getLineInfo } = require("./lineCounter");
const { RAW_OPEN, RAW_CLOSE } = require("./tokens");

function hasElseIfOrElse(node) {
  const nextNode = node.nextElementSibling;
  if (nextNode && (nextNode.nodeName === "ELSE-IF" || nextNode.nodeName === "ELSE")) {
    return nextNode;
  }
  return false;
}

function handleIfStatement(body, counter, filePath) {
  const ifElms = new Array().slice.call(body.querySelectorAll("if")).reverse(); // we must reverse to start with the very deep if tag which doesn't have nested if tags inside it
  ifElms.forEach(item => {
    // console.log(item.outerHTML + "\n----------");
    if (item.hasAttribute("when")) {
      const condition = item.getAttribute("when").replace(/^\{|\}$/g, "");

      // start: store if statement value in olum tag
      const olums = item.querySelectorAll("olum");
      // Structural interpolation -> RAW_OPEN/RAW_CLOSE so #2's escape pass leaves it raw (it yields
      // the JSON "true"/"false" the runtime reads from the `if` attribute, not user-facing text).
      olums.forEach(olum => olum.setAttribute("if","-[[-"+ RAW_OPEN +"JSON.stringify(!!"+ condition + ")"+ RAW_CLOSE +"-]]-")); // convert condition value to truthy/falsy value
      // end: store if statement value in olum tag

      const innerContent = item.innerHTML;

      if (hasElseIfOrElse(item)) {
        const toBeRemovedArr = [];
        let nodesArr = [{ content: innerContent, when: condition }];
        function recursive(item) {
          const node = hasElseIfOrElse(item);
          nodesArr.push({ content: node.innerHTML, when: (node.getAttribute("when") || "").replace(/^\{|\}$/g, "") });
          toBeRemovedArr.push(node);
          if (hasElseIfOrElse(node)) recursive(node);
        }
        recursive(item);
        // console.log(nodesArr);
        // RAW_OPEN/RAW_CLOSE mark the structural interpolation braces so #2's escape pass keeps the
        // ternary raw (its branches return HTML). User braces inside each branch are still escaped.
        let ternaryOperator = RAW_OPEN;
        nodesArr.forEach((node, index) => {
          if (index === nodesArr.length - 1) {
            if (node.when) ternaryOperator += node.when + "?`" + node.content + "`:''" + RAW_CLOSE;
            else ternaryOperator += "`" + node.content + "`" + RAW_CLOSE;
          } else {
            ternaryOperator += node.when + "?`" + node.content + "`:";
          }
        });
        // console.log(ternaryOperator);
        item.insertAdjacentHTML("beforebegin", ternaryOperator);
        toBeRemovedArr.forEach(item => item.remove());
      } else {
        // RAW_OPEN/RAW_CLOSE: structural ternary (raw HTML); user braces in innerContent stay escaped.
        item.insertAdjacentHTML("beforebegin", RAW_OPEN + condition + "?" + "`" + innerContent + "`" + ":''" + RAW_CLOSE);
      }
      item.remove();
    } else {
      const msg = "Missing 'when' attribute:";
      getLineInfo(counter, item, filePath, msg);
    }
  });
}

module.exports = handleIfStatement;
