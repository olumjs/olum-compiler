const parse5 = require("parse5");

const P5_OPTS = { scriptingEnabled: false };

const wrapCache = new WeakMap();

function wrap(node) {
  if (node == null) return null;
  let w = wrapCache.get(node);
  if (!w) {
    w = new NodeWrapper(node);
    wrapCache.set(node, w);
  }
  return w;
}

const isElement = (node) => !!node && typeof node.tagName === "string";
const isText = (node) => !!node && node.nodeName === "#text";

function compileSelector(selector) {
  const m = String(selector)
    .trim()
    .match(/^([a-zA-Z][\w-]*|\*)?(?:\[([a-zA-Z][\w-]*)\])?$/);
  if (!m || (!m[1] && !m[2]))
    throw new Error("dom.js: unsupported selector: " + selector);
  const tag = m[1] && m[1] !== "*" ? m[1].toLowerCase() : null;
  const attr = m[2] ? m[2].toLowerCase() : null;
  return (node) =>
    (!tag || node.tagName === tag) &&
    (!attr || node.attrs.some((a) => a.name === attr));
}

function walk(node, visit) {
  for (const child of node.childNodes || []) {
    if (isElement(child)) {
      visit(child);
      walk(child, visit);
    }
  }
}

function parseInContext(contextNode, html) {
  const context = isElement(contextNode)
    ? contextNode
    : findTag(contextNode, "body");
  const frag = parse5.parseFragment(context, String(html), P5_OPTS);
  return frag.childNodes.slice();
}

function findTag(root, tag) {
  let found = null;
  walk(root, (node) => {
    if (!found && node.tagName === tag) found = node;
  });
  return found;
}

function detach(node) {
  const parent = node.parentNode;
  if (!parent) return;
  const i = parent.childNodes.indexOf(node);
  if (i !== -1) parent.childNodes.splice(i, 1);
  node.parentNode = null;
}

function insertNodesBefore(parent, nodes, refNode) {
  const i = refNode ? parent.childNodes.indexOf(refNode) : -1;
  const at = i === -1 ? parent.childNodes.length : i;
  nodes.forEach((n) => {
    n.parentNode = parent;
  });
  parent.childNodes.splice(at, 0, ...nodes);
}

class NodeWrapper {
  constructor(node) {
    this.node = node;
  }

  get tagName() {
    return this.node.tagName
      ? this.node.tagName.toUpperCase()
      : this.node.nodeName;
  }
  get nodeName() {
    return this.tagName;
  }

  hasAttribute(name) {
    name = String(name).toLowerCase();
    return (this.node.attrs || []).some((a) => a.name === name);
  }
  getAttribute(name) {
    name = String(name).toLowerCase();
    const attr = (this.node.attrs || []).find((a) => a.name === name);
    return attr ? attr.value : null;
  }
  setAttribute(name, value) {
    name = String(name).toLowerCase();
    const attr = (this.node.attrs || []).find((a) => a.name === name);
    if (attr) attr.value = String(value);
    else this.node.attrs.push({ name, value: String(value) });
  }
  removeAttribute(name) {
    name = String(name).toLowerCase();
    const i = (this.node.attrs || []).findIndex((a) => a.name === name);
    if (i !== -1) this.node.attrs.splice(i, 1);
  }
  getAttributeNames() {
    return (this.node.attrs || []).map((a) => a.name);
  }

  get children() {
    return (this.node.childNodes || []).filter(isElement).map(wrap);
  }
  get firstElementChild() {
    return wrap((this.node.childNodes || []).find(isElement) || null);
  }
  get firstChild() {
    return wrap((this.node.childNodes || [])[0] || null);
  }
  get parentNode() {
    return wrap(this.node.parentNode || null);
  }
  get parentElement() {
    const parent = this.node.parentNode;
    return isElement(parent) ? wrap(parent) : null;
  }
  get nextElementSibling() {
    const parent = this.node.parentNode;
    if (!parent) return null;
    const siblings = parent.childNodes;
    for (let i = siblings.indexOf(this.node) + 1; i < siblings.length; i++) {
      if (isElement(siblings[i])) return wrap(siblings[i]);
    }
    return null;
  }
  get body() {
    return wrap(findTag(this.node, "body"));
  }

  querySelectorAll(selector) {
    const matches = compileSelector(selector);
    const out = [];
    walk(this.node, (node) => {
      if (matches(node)) out.push(wrap(node));
    });
    return out;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  get innerHTML() {
    return parse5.serialize(this.node, P5_OPTS);
  }
  set innerHTML(html) {
    const nodes = parseInContext(this.node, html);
    this.node.childNodes = [];
    insertNodesBefore(this.node, nodes, null);
  }
  get outerHTML() {
    return parse5.serializeOuter(this.node, P5_OPTS);
  }
  get textContent() {
    let out = "";
    (function collect(node) {
      for (const child of node.childNodes || []) {
        if (isText(child)) out += child.value;
        else collect(child);
      }
    })(this.node);
    return out;
  }
  set textContent(value) {
    this.node.childNodes = [];
    if (String(value)) {
      this.node.childNodes.push({
        nodeName: "#text",
        value: String(value),
        parentNode: this.node,
      });
    }
  }

  insertAdjacentHTML(position, html) {
    if (position === "beforebegin") {
      const parent = this.node.parentNode;
      insertNodesBefore(parent, parseInContext(parent, html), this.node);
    } else if (position === "beforeend") {
      insertNodesBefore(this.node, parseInContext(this.node, html), null);
    } else {
      throw new Error(
        "dom.js: unsupported insertAdjacentHTML position: " + position,
      );
    }
  }
  insertBefore(newWrapper, refWrapper) {
    detach(newWrapper.node);
    insertNodesBefore(
      this.node,
      [newWrapper.node],
      refWrapper ? refWrapper.node : null,
    );
    return newWrapper;
  }
  remove() {
    detach(this.node);
  }
}

function parseDOM(html) {
  return wrap(parse5.parse(String(html), P5_OPTS));
}

module.exports = { parseDOM };
