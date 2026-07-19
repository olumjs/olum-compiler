// liveProps.js — compiler pass: LIVE destructured props.
//
// `const { color, size = "md", theme: t } = props()` normally freezes values at factory
// time (destructuring copies). This pass injects ONE shared live accessor per instance —
// `const __props = props(_storeKey);` (the props proxy is stateless, so one allocation
// serves every read) — and rewrites every later REFERENCE to those bindings into a live
// read through it:
//   color  ->  __props.color
//   size   ->  (__props.size === undefined ? ("md") : __props.size)
//   t      ->  __props.theme
// so destructured props are always current — in templates, methods, and closures alike.
//
// Runs on the fully-assembled compiled module (after parser.js has already rewritten
// props() -> props(_storeKey)), so template interpolations, anonymous event handlers and
// generated scope getters are all covered by a single AST walk.
//
// SAFETY MODEL — degrade to the old snapshot semantics, never break the build:
//  - the original declaration is KEPT (its bindings just become unused); if a reference
//    is skipped for any reason the code still runs with the old snapshot value.
//  - a reference is rewritten only when NO scope between it and the factory body
//    redeclares the name (function params, hoisted var/function names, let/const/class
//    in ancestor blocks, catch params, loop heads) — shadowed names are left alone.
//  - unsupported pattern parts (rest `...r`, nested `{ a: { b } }`, computed keys) keep
//    snapshot semantics for those bindings only.
//  - every edit is inline (line count unchanged), so the identity source map stays aligned.
//  - any parse failure returns the input untouched.

const acorn = require("acorn");
const walk = require("acorn-walk");

// all names bound by a declaration pattern (id of a declarator, a param, a catch param)
function patternNames(node, set) {
  if (!node) return;
  switch (node.type) {
    case "Identifier":
      set.add(node.name);
      break;
    case "ObjectPattern":
      node.properties.forEach((p) => patternNames(p.type === "Property" ? p.value : p.argument, set));
      break;
    case "ArrayPattern":
      node.elements.forEach((el) => patternNames(el, set));
      break;
    case "AssignmentPattern":
      patternNames(node.left, set);
      break;
    case "RestElement":
      patternNames(node.argument, set);
      break;
  }
}

// names hoisted to a FUNCTION scope: `var` declarations and function declarations
// anywhere inside, without descending into nested functions (their own scopes)
function hoistedNames(node, set) {
  (function rec(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(rec);
    if (typeof n.type !== "string") return;
    if (n.type === "FunctionDeclaration") {
      if (n.id) set.add(n.id.name);
      return; // the body is a new scope
    }
    if (n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") return;
    if (n.type === "VariableDeclaration" && n.kind === "var") n.declarations.forEach((d) => patternNames(d.id, set));
    for (const k in n) {
      if (k === "type" || k === "start" || k === "end") continue;
      rec(n[k]);
    }
  })(node);
}

// names declared DIRECTLY in a lexical scope node (block, loop head, catch, switch)
function lexicalNames(node, set) {
  const fromStatements = (stmts) =>
    stmts.forEach((st) => {
      if (st.type === "VariableDeclaration" && (st.kind === "let" || st.kind === "const")) st.declarations.forEach((d) => patternNames(d.id, set));
      else if (st.type === "FunctionDeclaration" || st.type === "ClassDeclaration") st.id && set.add(st.id.name);
    });
  switch (node.type) {
    case "BlockStatement":
    case "StaticBlock":
      fromStatements(node.body);
      break;
    case "ForStatement":
      if (node.init && node.init.type === "VariableDeclaration") node.init.declarations.forEach((d) => patternNames(d.id, set));
      break;
    case "ForInStatement":
    case "ForOfStatement":
      if (node.left.type === "VariableDeclaration") node.left.declarations.forEach((d) => patternNames(d.id, set));
      break;
    case "CatchClause":
      patternNames(node.param, set);
      break;
    case "SwitchStatement":
      node.cases.forEach((c) => fromStatements(c.consequent));
      break;
  }
}

const isFn = (t) => t === "FunctionDeclaration" || t === "FunctionExpression" || t === "ArrowFunctionExpression";
const within = (node, container) => container && node.start >= container.start && node.end <= container.end;

function transform(code) {
  // fast path: no `const { ... } = props(_storeKey)` destructure anywhere
  if (!/\}\s*=\s*props\(_storeKey\)/.test(code)) return code;

  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    return code;
  }

  // 1 ── locate the compiled factory: `export default (_instanceKey) => { ... }`
  let factory = null;
  ast.body.forEach((st) => {
    if (st.type === "ExportDefaultDeclaration" && isFn(st.declaration.type)) factory = st.declaration;
  });
  if (!factory || factory.body.type !== "BlockStatement") return code;
  const factoryBody = factory.body;

  // 2 ── collect target bindings from DIRECT statements of the factory body
  const bindings = {}; // localName -> { key, dflt }
  const declPatterns = []; // ObjectPattern nodes of the target declarations (skip refs inside)
  factoryBody.body.forEach((st) => {
    if (st.type !== "VariableDeclaration") return;
    st.declarations.forEach((decl) => {
      if (!decl.id || decl.id.type !== "ObjectPattern") return;
      if (!decl.init || decl.init.type !== "CallExpression" || !decl.init.callee || decl.init.callee.name !== "props") return;
      declPatterns.push(decl.id);
      decl.id.properties.forEach((p) => {
        if (p.type !== "Property" || p.computed || !p.key || !p.key.name) return; // rest / computed key -> snapshot
        if (p.value.type === "Identifier") bindings[p.value.name] = { key: p.key.name, dflt: null };
        else if (p.value.type === "AssignmentPattern" && p.value.left.type === "Identifier")
          bindings[p.value.left.name] = { key: p.key.name, dflt: code.slice(p.value.right.start, p.value.right.end) };
        // nested { a: { b } } patterns -> snapshot
      });
    });
  });
  if (!Object.keys(bindings).length) return code;

  // one shared live accessor per instance; suffix the name on the off chance it collides
  let propsRef = "__props";
  while (code.indexOf(propsRef) !== -1) propsRef += "$";

  const repl = (name) => {
    const b = bindings[name];
    const read = propsRef + "." + b.key;
    return b.dflt === null ? read : "(" + read + " === undefined ? (" + b.dflt + ") : " + read + ")";
  };

  // 3 ── walk every identifier, classify, shadow-check, collect edits
  const edits = [];
  walk.fullAncestor(ast, (node, state, ancestors) => {
    if (node.type !== "Identifier" || !bindings[node.name]) return;
    const parent = ancestors[ancestors.length - 2];
    if (!parent) return;

    // inside one of the target destructure patterns (the kept declaration itself)
    if (declPatterns.some((dp) => within(node, dp))) return;

    // non-reference positions
    if (parent.type === "Property" && parent.key === node && !parent.computed && !parent.shorthand) return;
    if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return;
    if ((parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") && parent.key === node && !parent.computed) return;
    if (parent.type.indexOf("Import") === 0 || parent.type === "ExportSpecifier") return;
    if ((parent.type === "LabeledStatement" || parent.type === "BreakStatement" || parent.type === "ContinueStatement") && parent.label === node) return;
    if (isFn(parent.type) && parent.id === node) return;
    if (parent.type === "ClassDeclaration" || parent.type === "ClassExpression") {
      if (parent.id === node) return;
    }

    // binding positions & shadow scopes — walk ancestors innermost -> factory body
    let inFactory = false;
    for (let i = ancestors.length - 2; i >= 0; i--) {
      const a = ancestors[i];
      if (a === factoryBody) {
        inFactory = true;
        break; // the factory body holds the (kept) target declaration — not a shadow
      }
      // binding position?
      if (a.type === "VariableDeclarator" && within(node, a.id)) return;
      if (isFn(a.type) && a.params.length && node.start >= a.params[0].start && node.end <= a.params[a.params.length - 1].end) return;
      if (a.type === "CatchClause" && a.param && within(node, a.param)) return;
      // shadowed by this scope?
      const declared = new Set();
      if (isFn(a.type)) {
        a.params.forEach((p) => patternNames(p, declared));
        hoistedNames(a.body, declared);
      } else {
        lexicalNames(a, declared);
      }
      if (declared.has(node.name)) return;
    }
    if (!inFactory) return; // reference outside the factory (imports area) — leave it

    // `({ color })` shorthand in an object EXPRESSION needs the key spelled out
    const grand = ancestors[ancestors.length - 3];
    if (parent.type === "Property" && parent.shorthand && parent.value === node && grand && grand.type === "ObjectExpression") {
      edits.push({ start: node.start, end: node.end, text: node.name + ": " + repl(node.name) });
      return;
    }
    if (parent.type === "Property" && parent.shorthand && parent.value === node) return; // shorthand inside a pattern

    edits.push({ start: node.start, end: node.end, text: repl(node.name) });
  });

  if (!edits.length) return code;
  // inject the shared accessor right after the factory's first statement
  // (`const _storeKey = ...;`) — same line, so line numbering is unchanged
  const anchor = factoryBody.body[0];
  edits.push({ start: anchor.end, end: anchor.end, text: " const " + propsRef + " = props(_storeKey);" });
  edits.sort((a, b) => b.start - a.start);
  let out = code;
  edits.forEach((e) => (out = out.slice(0, e.start) + e.text + out.slice(e.end)));
  return out;
}

module.exports = transform;
