const ESC = "&amp;lt;-olum-&amp;gt;";

// Component names can contain `$`, which is special inside a regex.
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
  if (srcEntries.length)
    attr += ' data-o-props-src="' + srcEntries.join("|") + '"';
  return attr;
}

/* ---------------------------------------------------------------------------
 * Component tags
 *
 * A component is a PascalCase tag -- <Card>...</Card> or <Card />. Everything
 * else is plain HTML and is copied through untouched.
 *
 * Tags are scanned left to right instead of being matched with one global
 * regex, because a regex cannot pair <Card> with its OWN </Card>: it stops at
 * the first uppercase close tag it meets. That breaks the moment a component
 * wraps another one --
 *
 *   <Spinner><Spinner></Spinner></Spinner>   nested under the same name
 *   <KbdGroup><Kbd/><Kbd/></KbdGroup>        more than one child
 *   <Card><CardHeader/></Card>               child name starts with the parent's
 * ------------------------------------------------------------------------- */

// Attributes between the tag name and its `>`. Quoted values are consumed
// whole so that a `>` inside one doesn't end the tag early.
const ATTRS = "(?:\"[^\"]*\"|'[^']*'|[^\"'>])*?";

// Names must be valid JS identifiers -- parser.js emits them straight into the
// component map as `Card: Card`.
const nextComponent = /<([A-Z][\w$]*)(?=[\s/>])/g;

const tagCache = new Map();

// `head` matches an open tag at a known offset; `open` and `close` search
// forward from one. Group 1 of `head`/`open` is set when the tag self-closes.
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

// Locates the `</name>` closing the tag that ends at `from`, depth-tracking
// same-name tags on the way so a component pairs with its own close tag.
// Returns null when there is none, i.e. the markup is unbalanced.
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
      if (!nextOpen[1]) depth++; // a nested twin, and not self-closing
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

    // `<Card` with no `>` after it isn't a tag -- step over the `<` and go on.
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
      // Unbalanced: emit the open tag verbatim and keep scanning its content,
      // so the components inside it are still converted.
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
