const { isFullArr, isUpper } = require("./helpers");

// { must be double-encoded so it survives jsdom + htmlParser transformations
const ESC = "&amp;lt;-olum-&amp;gt;";

// A string-valued prop is literal by default, with {expr} interpolation inside (like a regular
// attribute): title="Hello {state.name}". If it contains {expr}, compile it to a TEMPLATE LITERAL
// so the literal text + interpolated parts concatenate into a string. The { of each ${...} is
// ESC-encoded so htmlParser's {expr} escape pass leaves it alone (restored to { at the end).
// A plain value (no braces) stays a quoted string literal.
function literalExpr(raw) {
  if (/\{[^{}]+\}/.test(raw)) {
    const body = raw.replace(/`/g, "\\`").replace(/\{([^{}]+)\}/g, "${$1}"); // {x} -> ${x}
    return ("`" + body + "`").replace(/\{/g, ESC);
  }
  return "'" + raw.replace(/'/g, "\\'") + "'";
}

function parseProps(attrsStr) {
  const entries = [];
  const srcEntries = []; // prop-name:state-key pairs for setter write-back
  // six alternatives in priority order (groups kept intact for easy toggling):
  // 1. {key}  2. key="{expr}"  3. key='{expr}'  4. key={expr}  5. key="value"  6. key='value'
  // NOTE: the naked-brace forms 1 ({key} shorthand) and 4 (key={expr}) are DISABLED — values must
  // live inside quotes, consistent with every other attribute. Uncomment their branches to re-enable.
  const attrRegex = /\{(\w+)\}|(\w+)="\{([^}]+)\}"|(\w+)='\{([^}]+)\}'|(\w+)=\{([^}]+)\}|(\w+)="([^"]*)"|(\w+)='([^']*)'/g;
  let match;
  while ((match = attrRegex.exec(attrsStr)) !== null) {
    let propName, expr, isExpr = false;
    // DISABLED — {key} shorthand. Uncomment to re-enable.
    // if (match[1] !== undefined) {
    //   propName = match[1]; expr = match[1]; isExpr = true;            // {key} shorthand
    // } else
    if (match[2] && match[3] !== undefined) {
      propName = match[2]; expr = match[3]; isExpr = true;              // key="{expr}"
    } else if (match[4] && match[5] !== undefined) {
      propName = match[4]; expr = match[5]; isExpr = true;              // key='{expr}'
    // DISABLED — key={expr} unquoted. Uncomment to re-enable.
    // } else if (match[6] && match[7] !== undefined) {
    //   propName = match[6]; expr = match[7]; isExpr = true;           // key={expr}
    } else if (match[8] && match[9] !== undefined) {
      // key="value" — literal string, or template literal if it contains {expr} interpolation
      let v = match[9];
      if (!/\{[^{}]+\}/.test(v) && v.startsWith("'") && v.endsWith("'") && v.length >= 2) v = v.slice(1, -1);
      propName = match[8]; expr = literalExpr(v); isExpr = false;
    } else if (match[10] && match[11] !== undefined) {
      propName = match[10]; expr = literalExpr(match[11]); isExpr = false;
    }
    if (!propName) continue;
    if (isExpr) {
      // object literal: restore {} wrappers, escaping { so htmlParser won't turn it into ${
      const entryExpr = /^\s*\w+\s*:/.test(expr) ? ESC + expr + '}' : expr;
      entries.push(propName + ': ' + entryExpr);
      // record write-back source: state.X writes to the parent's state; props.X chains up to the
      // parent's own prop (the setter recurses until it reaches whoever holds it in state).
      // format: propName:kind:srcKey  (kind = state | props)
      const stateMatch = expr.trim().match(/^state\.(\w+)$/);
      const propsMatch = expr.trim().match(/^props\.(\w+)$/);
      if (stateMatch) srcEntries.push(propName + ':state:' + stateMatch[1]);
      else if (propsMatch) srcEntries.push(propName + ':props:' + propsMatch[1]);
    } else {
      entries.push(propName + ': ' + expr);
    }
  }
  return { entries, srcEntries };
}

function buildPropsAttr(attrsStr) {
  const { entries, srcEntries } = parseProps(attrsStr);
  
  if (!entries.length) return "";
  const expr = "$" + ESC + "encodeURIComponent(JSON.stringify(" + ESC + entries.join(", ") + "}))}";
  let attr = ' data-o-props="-[[-' + expr + '-]]-"';
  if (srcEntries.length) attr += ' data-o-props-src="' + srcEntries.join("|") + '"';
  return attr;
}

// handle components placeholders with olum tag <olum></olum>
function placeholder(content, regex, type) {
  return content.replace(regex, (str, $1, $2) => {
    let data = $1.split(" ");
    if (isFullArr(data)) {
      let name = data[0].trim();
      if (isUpper(name[0])) {
        name = "name='" + name + "'";
        const propsAttr = data.length > 1 ? buildPropsAttr(data.slice(1).join(" ")) : "";
        const slot = type === "normal" ? $2 : "";
        return "<olum " + name + propsAttr + ">" + slot + "</olum>";
      }
    }
  });
}

module.exports = placeholder;
