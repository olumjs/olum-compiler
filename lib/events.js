const events = require("./domEvents");
const { getLineInfo } = require("./lineCounter");
const path = require("path");

function looksLikeFunction(str) {
  return /^(?:\([^)]*\)|[\w$]+)\s*=>/.test(str) || /^function\b/.test(str);
}

function isSimpleCallList(str) {
  try {
    const acorn = require("acorn");
    const node = acorn.parseExpressionAt(str, 0, { ecmaVersion: "latest" });
    if (node.end !== str.length) return false;
    const calls =
      node.type === "SequenceExpression" ? node.expressions : [node];
    return calls.every(
      (c) => c.type === "CallExpression" && c.callee.type === "Identifier",
    );
  } catch (e) {
    return true;
  }
}

function referencesPropsAlias(str, propsAliases) {
  const names = propsAliases ? Object.keys(propsAliases) : [];
  if (!names.length) return false;
  try {
    const acorn = require("acorn");
    const node = acorn.parseExpressionAt(str, 0, { ecmaVersion: "latest" });
    let found = false;
    (function walk(n, parent, key) {
      if (found || !n || typeof n.type !== "string") return;
      if (n.type === "Identifier" && names.includes(n.name)) {
        const isStaticProp =
          parent &&
          !parent.computed &&
          ((parent.type === "MemberExpression" && key === "property") ||
            (parent.type === "Property" && key === "key"));
        if (!isStaticProp) found = true;
        return;
      }
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (Array.isArray(v))
          v.forEach(
            (item) => item && typeof item === "object" && walk(item, n, k),
          );
        else if (v && typeof v === "object") walk(v, n, k);
      }
    })(node, null, null);
    return found;
  } catch (e) {
    return false;
  }
}

function loopVarNames(item) {
  const vars = [];
  let cur = item;
  while ((cur = cur.parentElement)) {
    if (cur.tagName.toLowerCase() === "for" && cur.hasAttribute("each")) {
      const m = cur
        .getAttribute("each")
        .trim()
        .match(/(.*)( of | in )/);
      if (m)
        m[1]
          .replace(/\(|\)/g, "")
          .split(",")
          .forEach((p) => {
            p = p.trim();
            if (p && !vars.includes(p)) vars.push(p);
          });
    }
  }
  return vars;
}

function usedLoopVars(str, item) {
  return loopVarNames(item).filter((v) =>
    new RegExp("(?<![.\\w$])" + v + "\\b").test(str),
  );
}

function handleEvents(body, counter, filePath, anonHandlers, propsAliases) {
  let name = path.basename(filePath).replace(/\.html/i, "");
  name = name.slice(0, 1).toLowerCase() + name.slice(1);

  const elms = new Array().slice.call(body.querySelectorAll("*"));
  elms.forEach((item) => {
    events.forEach((e) => {
      if (item.hasAttribute(e)) {
        let attrValue = item.getAttribute(e).trim();

        const loopArgs = usedLoopVars(attrValue, item);
        const params = ["$event"].concat(loopArgs).join(", ");

        if (looksLikeFunction(attrValue)) {
          const handlerName =
            "__olumAnon_" + Math.random().toString(36).slice(2, 9);
          if (anonHandlers) {
            if (loopArgs.length)
              anonHandlers.push(
                `const ${handlerName} = (${params}) => (${attrValue})($event);`,
              );
            else anonHandlers.push(`const ${handlerName} = ${attrValue};`);
          }
          attrValue = handlerName + "(" + params + ")";
        } else if (
          !isSimpleCallList(attrValue) ||
          referencesPropsAlias(attrValue, propsAliases)
        ) {
          const handlerName =
            "__olumAnon_" + Math.random().toString(36).slice(2, 9);
          if (anonHandlers)
            anonHandlers.push(
              `const ${handlerName} = (${params}) => { ${attrValue} };`,
            );
          attrValue = handlerName + "(" + params + ")";
        }

        let methods = attrValue.split("),");
        methods = methods.map((str) => (str.replace(/\)$/, "") + ")").trim());
        let methodsNames = methods.map((str) =>
          str.trim().split("(")[0].trim(),
        );

        let methodsArgs = methods.map((str) => {
          const s = str.trim();
          return s.slice(s.indexOf("(") + 1, s.lastIndexOf(")")).trim();
        });

        function handle$event(str) {
          return str.replace(/\$event/g, "'$event'");
        }

        let chain = e + "|";
        methodsNames.forEach((item, index) => {
          if (index === methodsNames.length - 1)
            return (chain +=
              item +
              "=${JSON.stringify([" +
              handle$event(methodsArgs[index]) +
              "])}-]]-");
          chain +=
            item +
            "=${JSON.stringify([" +
            handle$event(methodsArgs[index]) +
            "])}&";
        });

        chain = chain.replace(/{/g, "&lt;-olum-&gt;");

        const prevEvent = item.getAttribute("data-o-event") || "";
        item.setAttribute("data-o-event", prevEvent + "-[[-" + chain);
        item.removeAttribute(e);
      }
    });
  });
}

module.exports = handleEvents;
