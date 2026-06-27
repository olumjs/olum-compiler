const { getLineInfo } = require("./lineCounter");
const { forOf, forIn } = require("./regex");
const { isNum,id } = require("./helpers");
const { RAW_OPEN, RAW_CLOSE, shieldOps } = require("./tokens");

function handleForStatement(body, counter, filePath) {
  // using <-olum-> (&lt;-olum-&gt;) as placeholder for "{" inside map method
  const forElms = new Array().slice.call(body.querySelectorAll("for")).reverse(); // we must reverse to start with the very deep if tag which doesn't have nested if tags inside it
  forElms.forEach(item => {
    // console.log(item.outerHTML + "\n----------");
    if (item.hasAttribute("each")) {
      // `each` is a plain JS expression (no braces): <for each="item of state.items">
      // shieldOps: protect <,> from the jsdom text round-trip (restored in htmlParser)
      const condition = shieldOps(item.getAttribute("each").trim());

      // #3 (keyed reconciliation): if the <for> declares key={expr}, stamp every component
      // placeholder in this loop with data-o-key="{expr}". `expr` references the loop variable, so
      // each iteration emits a distinct key, and the runtime (buildTree) reuses the matching
      // instance by identity instead of by position. <for>s are processed deepest-first, so a
      // nested loop has already stamped its own placeholders — we skip any that are already keyed.
      const keyAttr = item.getAttribute("key");
      if (keyAttr) {
        const keyExpr = keyAttr.trim();
        new Array().slice.call(item.querySelectorAll("olum")).forEach(olum => {
          if (!olum.hasAttribute("data-o-key")) olum.setAttribute("data-o-key", "{" + keyExpr + "}");
        });
      }

      const innerContent = item.innerHTML;

      // for of loop
      condition.replace(forOf, (str, $1, $2, $3) => {
        if (isNum($3)) {
          const params = $1.replace(/\(|\)/g, "");
          const [param1] = params.split(",");
          const mkID = id();
          let variable = param1 + "=index"+mkID+"+1";
          // RAW_OPEN/RAW_CLOSE wrap the structural interpolation so #2's escape pass keeps the
          // .map().join('') raw (it produces HTML). <-olum-> is the map callback's own `{` brace.
          const loop = RAW_OPEN + "new Array(" + $3 + ").fill().map(function(" + param1 +", index"+mkID+ ")<-olum->\n"+ variable +"\nreturn`" + innerContent + "`;\n}).join('')" + RAW_CLOSE;
          item.insertAdjacentHTML("beforebegin", loop);
          item.remove();
        } else {
          // console.log({ condition, innerContent });
          // console.log("for of loop", { str, $1, $2, $3 });
          const params = $1.replace(/\(|\)/g, "");
          const loop = RAW_OPEN + $3 + ".map(function(" + params + ")<-olum->\nreturn`" + innerContent + "`;\n}).join('')" + RAW_CLOSE;
          item.insertAdjacentHTML("beforebegin", loop);
          item.remove();
        }
      });

      // for in loop
      condition.replace(forIn, (str, $1, $2, $3) => {
        // console.log({ condition, innerContent });
        // console.log("for in loop", { str, $1, $2, $3 });
        const params = $1.replace(/\(|\)/g, "");
        const [param1, param2, param3] = params.split(",");
        // console.log({ param1, param2, param3 });
        const value = param3 ? param3 + "=" + $3 + "[" + param1 + "];" : "";
        const loop = RAW_OPEN + "Object.keys(" + $3 + ").map(function(" + params + ")<-olum->\n" + value + "\nreturn`" + innerContent + "`;\n}).join('')" + RAW_CLOSE;
        item.insertAdjacentHTML("beforebegin", loop);
        item.remove();
      });
      
    } else {
      const msg = "Missing 'each' attribute:";
      getLineInfo(counter, item, filePath, msg);
    }
  });
}

module.exports = handleForStatement;
