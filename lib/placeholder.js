const { isFullArr, isUpper } = require("./helpers");

const ESC = "&amp;lt;-olum-&amp;gt;";

function literalExpr(raw) {
  if (/\{[^{}]+\}/.test(raw)) {
    const body = raw.replace(/`/g, "\\`").replace(/\{([^{}]+)\}/g, "${$1}");
    return ("`" + body + "`").replace(/\{/g, ESC);
  }
  return "'" + raw.replace(/'/g, "\\'") + "'";
}

function parseProps(attrsStr, parentMethods, propsAliases) {
  const entries = [];
  const srcEntries = [];

  const attrRegex =
    /\{(\w+)\}|(\w+)="\{([^}]+)\}"|(\w+)='\{([^}]+)\}'|(\w+)=\{([^}]+)\}|(\w+)="([^"]*)"|(\w+)='([^']*)'/g;
  let match;
  while ((match = attrRegex.exec(attrsStr)) !== null) {
    let propName,
      expr,
      isExpr = false;

    if (match[2] && match[3] !== undefined) {
      propName = match[2];
      expr = match[3];
      isExpr = true;
    } else if (match[4] && match[5] !== undefined) {
      propName = match[4];
      expr = match[5];
      isExpr = true;
    } else if (match[8] && match[9] !== undefined) {
      let v = match[9];
      if (
        !/\{[^{}]+\}/.test(v) &&
        v.startsWith("'") &&
        v.endsWith("'") &&
        v.length >= 2
      )
        v = v.slice(1, -1);
      propName = match[8];
      expr = literalExpr(v);
      isExpr = false;
    } else if (match[10] && match[11] !== undefined) {
      propName = match[10];
      expr = literalExpr(match[11]);
      isExpr = false;
    }
    if (!propName) continue;
    if (isExpr) {
      const bare = expr.trim();
      if (
        parentMethods &&
        parentMethods.includes(bare) &&
        /^[A-Za-z_$][\w$]*$/.test(bare)
      ) {
        srcEntries.push(propName + ":method:" + bare);
        continue;
      }

      if (
        propsAliases &&
        Object.prototype.hasOwnProperty.call(propsAliases, bare) &&
        /^[A-Za-z_$][\w$]*$/.test(bare)
      ) {
        entries.push(propName + ": " + bare);
        srcEntries.push(propName + ":props:" + propsAliases[bare]);
        continue;
      }

      const entryExpr = /^\s*\w+\s*:/.test(expr) ? ESC + expr + "}" : expr;
      entries.push(propName + ": " + entryExpr);

      const stateMatch = expr.trim().match(/^state\.(\w+)$/);

      const propsMatch = expr.trim().match(/^props(?:\(\s*\))?\.(\w+)$/);
      if (stateMatch) srcEntries.push(propName + ":state:" + stateMatch[1]);
      else if (propsMatch)
        srcEntries.push(propName + ":props:" + propsMatch[1]);
    } else {
      entries.push(propName + ": " + expr);
    }
  }
  return { entries, srcEntries };
}

function buildPropsAttr(attrsStr, parentMethods, propsAliases) {
  const { entries, srcEntries } = parseProps(
    attrsStr,
    parentMethods,
    propsAliases,
  );

  let attr = "";
  if (entries.length) {
    const expr =
      "$" +
      ESC +
      "encodeURIComponent(JSON.stringify(" +
      ESC +
      entries.join(", ") +
      "})).replace(/'/g,'%27')}";
    attr += ' data-o-props="-[[-' + expr + '-]]-"';
  }
  if (srcEntries.length)
    attr += ' data-o-props-src="' + srcEntries.join("|") + '"';
  return attr;
}

function placeholder(content, regex, type, parentMethods, propsAliases) {
  return content.replace(regex, (str, $1, $2) => {
    let data = $1.split(" ");
    if (isFullArr(data)) {
      let name = data[0].trim();
      if (isUpper(name[0])) {
        name = "name='" + name + "'";
        const propsAttr =
          data.length > 1
            ? buildPropsAttr(
                data.slice(1).join(" "),
                parentMethods,
                propsAliases,
              )
            : "";
        const slot = type === "normal" ? $2 : "";
        return "<olum " + name + propsAttr + ">" + slot + "</olum>";
      }
    }
  });
}

module.exports = placeholder;
