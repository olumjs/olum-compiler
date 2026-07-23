const { getLineInfo } = require("./lineCounter");
const { forOf, forIn } = require("./regex");
const { isNum, id } = require("./helpers");
const { RAW_OPEN, RAW_CLOSE, shieldOps } = require("./tokens");

function handleForStatement(body, counter, filePath) {
  const forElms = new Array().slice
    .call(body.querySelectorAll("for"))
    .reverse();
  forElms.forEach((item) => {
    if (item.hasAttribute("each")) {
      const condition = shieldOps(item.getAttribute("each").trim());

      const keyAttr = item.getAttribute("key");
      if (keyAttr) {
        const keyExpr = keyAttr.trim();

        new Array().slice
          .call(item.querySelectorAll("olum"))
          .forEach((olum) => {
            if (!olum.hasAttribute("data-o-key"))
              olum.setAttribute("data-o-key", "{" + keyExpr + "}");
          });

        const skipTags = ["olum", "show", "if", "for", "else", "else-if"];
        new Array().slice.call(item.children).forEach((child) => {
          if (skipTags.includes(child.tagName.toLowerCase())) return;
          if (!child.hasAttribute("key"))
            child.setAttribute("key", "{" + keyExpr + "}");
        });
      }

      const innerContent = item.innerHTML;

      condition.replace(forOf, (str, $1, $2, $3) => {
        if (isNum($3)) {
          const params = $1.replace(/\(|\)/g, "");
          const [param1] = params.split(",");
          const mkID = id();
          let variable = param1 + "=index" + mkID + "+1";

          const loop =
            RAW_OPEN +
            "new Array(" +
            $3 +
            ").fill().map(function(" +
            param1 +
            ", index" +
            mkID +
            ")<-olum->\n" +
            variable +
            "\nreturn`" +
            innerContent +
            "`;\n}).join('')" +
            RAW_CLOSE;
          item.insertAdjacentHTML("beforebegin", loop);
          item.remove();
        } else {
          const params = $1.replace(/\(|\)/g, "");
          const loop =
            RAW_OPEN +
            $3 +
            ".map(function(" +
            params +
            ")<-olum->\nreturn`" +
            innerContent +
            "`;\n}).join('')" +
            RAW_CLOSE;
          item.insertAdjacentHTML("beforebegin", loop);
          item.remove();
        }
      });

      condition.replace(forIn, (str, $1, $2, $3) => {
        const params = $1.replace(/\(|\)/g, "");
        const [param1, param2, param3] = params.split(",");

        const value = param3 ? param3 + "=" + $3 + "[" + param1 + "];" : "";
        const loop =
          RAW_OPEN +
          "Object.keys(" +
          $3 +
          ").map(function(" +
          params +
          ")<-olum->\n" +
          value +
          "\nreturn`" +
          innerContent +
          "`;\n}).join('')" +
          RAW_CLOSE;
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
