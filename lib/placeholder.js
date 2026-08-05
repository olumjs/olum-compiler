const ESC = "&amp;lt;-olum-&amp;gt;";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  if (srcEntries.length) {
    attr += ' data-o-props-src="' + srcEntries.join("|") + '"';

    attr += ' data-o-props-owner="-[[-$' + ESC + '_storeKey}-]]-"';
  }
  return attr;
}

const ATTRS = "(?:\"[^\"]*\"|'[^']*'|[^\"'>])*?";

const nextComponent = /<([A-Z][\w$]*)(?=[\s/>])/g;

const tagCache = new Map();

function tagsFor(name) {
  let tags = tagCache.get(name);
  if (!tags) {
    const safe = escapeRegExp(name);
    const open = "<" + safe + "(?=[\\s/>])" + ATTRS + "(/)?>";
    tags = {
      head: new RegExp(open, "y"),
      open: new RegExp(open, "g"),
      close: new RegExp("</" + safe + "\\s*>", "g"),
    };
    tagCache.set(name, tags);
  }
  return tags;
}

function findClose(content, name, from) {
  const { open, close } = tagsFor(name);
  let depth = 1;
  let i = from;

  for (;;) {
    open.lastIndex = close.lastIndex = i;
    const nextOpen = open.exec(content);
    const nextClose = close.exec(content);
    if (!nextClose) return null;

    if (nextOpen && nextOpen.index < nextClose.index) {
      if (!nextOpen[1]) depth++;
      i = nextOpen.index + nextOpen[0].length;
      continue;
    }

    i = nextClose.index + nextClose[0].length;
    if (--depth === 0) return { start: nextClose.index, end: i };
  }
}

function olumTag(name, attrs, slot, parentMethods, propsAliases) {
  const props = attrs.trim()
    ? buildPropsAttr(attrs, parentMethods, propsAliases)
    : "";
  return "<olum name='" + name + "'" + props + ">" + slot + "</olum>";
}

function placeholder(content, parentMethods, propsAliases) {
  let out = "";
  let i = 0;

  while (i < content.length) {
    nextComponent.lastIndex = i;
    const found = nextComponent.exec(content);
    if (!found) break;

    const start = found.index;
    const name = found[1];
    const { head } = tagsFor(name);
    head.lastIndex = start;
    const open = head.exec(content);

    if (!open) {
      out += content.slice(i, start + 1);
      i = start + 1;
      continue;
    }

    out += content.slice(i, start);
    const selfClosing = !!open[1];
    const attrs = open[0].slice(1 + name.length, selfClosing ? -2 : -1);
    i = start + open[0].length;

    if (selfClosing) {
      out += olumTag(name, attrs, "", parentMethods, propsAliases);
      continue;
    }

    const close = findClose(content, name, i);
    if (!close) {
      out += open[0];
      continue;
    }

    const slot = placeholder(
      content.slice(i, close.start),
      parentMethods,
      propsAliases,
    );
    out += olumTag(name, attrs, slot, parentMethods, propsAliases);
    i = close.end;
  }

  return out + content.slice(i);
}

module.exports = placeholder;
