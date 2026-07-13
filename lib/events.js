const events = require("./domEvents");
const { getLineInfo } = require("./lineCounter");
const path = require("path");

// An event value is plain JS inside "" (like native HTML `onclick="..."`): either a method-call
// list — onclick="inc()" / onclick="inc(), dec()" — or an inline arrow/function expression —
// oninput="(e)=> state.x = e.target.value". Arrow/function values are extracted to a named
// __olumAnon_ method (collected in anonHandlers, injected into the component JS) so the call-list
// parser below can treat them uniformly as `__olumAnon_xxx($event)`.
function looksLikeFunction(str) {
  return /^(?:\([^)]*\)|[\w$]+)\s*=>/.test(str) || /^function\b/.test(str);
}

// True when the value is a plain call list the legacy parser can split — one or more
// `name(args)` calls where each callee is a bare identifier: onclick="inc()" / "inc(), dec()".
// Anything else (props().toggle(id), state.count++, obj.method()) must run as a real JS
// expression, so the caller wraps it in an anonymous handler instead.
function isSimpleCallList(str) {
  try {
    const acorn = require("acorn");
    const node = acorn.parseExpressionAt(str, 0, { ecmaVersion: "latest" });
    if (node.end !== str.length) return false;
    const calls = node.type === "SequenceExpression" ? node.expressions : [node];
    return calls.every((c) => c.type === "CallExpression" && c.callee.type === "Identifier");
  } catch (e) {
    return true; // unparseable as a single expression -> let the legacy splitter have it
  }
}

// True when the expression references a name destructured from props() — e.g.
// `const { onclick } = props()` + onclick="onclick()". Such a call CAN'T go through the
// data-o-event chain (the runtime resolves chain names against methodsRef, and a destructured
// prop isn't a method), so the caller wraps it in an anon handler whose closure holds the prop.
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
        // skip non-value positions: obj.onclick (member property) / { onclick: x } (literal key)
        const isStaticProp =
          parent && !parent.computed && ((parent.type === "MemberExpression" && key === "property") || (parent.type === "Property" && key === "key"));
        if (!isStaticProp) found = true;
        return;
      }
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach((item) => item && typeof item === "object" && walk(item, n, k));
        else if (v && typeof v === "object") walk(v, n, k);
      }
    })(node, null, null);
    return found;
  } catch (e) {
    return false;
  }
}

function handleEvents(body, counter, filePath, anonHandlers, propsAliases) {
  let name = path.basename(filePath).replace(/\.html/i, "");
  name = name.slice(0, 1).toLowerCase() + name.slice(1); // make compName camel case

  const elms = new Array().slice.call(body.querySelectorAll("*"));
  elms.forEach(item => {
    events.forEach(e => {
      if (item.hasAttribute(e)) {
        let attrValue = item.getAttribute(e).trim();

        // inline arrow/function handler -> extract to a named method, then parse the call below
        if (looksLikeFunction(attrValue)) {
          const handlerName = "__olumAnon_" + Math.random().toString(36).slice(2, 9);
          if (anonHandlers) anonHandlers.push(`const ${handlerName} = ${attrValue};`);
          attrValue = handlerName + "($event)";
        } else if (!isSimpleCallList(attrValue) || referencesPropsAlias(attrValue, propsAliases)) {
          // not a plain `name(args)` call list — e.g. a function prop call props().toggle(id)
          // or a statement like state.count++ — OR a call touching a destructured prop
          // (onclick="onclick()") — wrap the whole expression in an anon handler
          // so it executes as-is in component scope ($event = the DOM event)
          const handlerName = "__olumAnon_" + Math.random().toString(36).slice(2, 9);
          if (anonHandlers) anonHandlers.push(`const ${handlerName} = ($event) => { ${attrValue} };`);
          attrValue = handlerName + "($event)";
        }

        let methods = attrValue.split("),");
        methods = methods.map(str => (str.replace(/\)$/, "") + ")").trim());
        let methodsNames = methods.map(str => (str.trim().split("(")[0]).trim());
        // args = everything between the FIRST "(" and the LAST ")", so arguments that themselves
        // contain parens (e.g. toggle(props().todo.id)) aren't truncated at the inner "(".
        let methodsArgs = methods.map(str => {
          const s = str.trim();
          return s.slice(s.indexOf("(") + 1, s.lastIndexOf(")")).trim();
        });
        
        function handle$event(str) {
          return str.replace(/\$event/g, "'$event'")
        }
        
        // added special delimiters for json in attribute to overcome double quotes issue -[[- , -]]-
        let chain = e+"|"
        methodsNames.forEach((item, index) => {
          if (index === methodsNames.length - 1) return chain += item + "=${JSON.stringify([" + handle$event(methodsArgs[index]) +"])}-]]-"
          chain += item + "=${JSON.stringify([" + handle$event(methodsArgs[index]) + "])}&";
        })
        
        chain = chain.replace(/{/g, "&lt;-olum-&gt;")   // using <-olum-> (&lt;-olum-&gt;) as placeholder for "{" 
        // console.log({chain});
        item.setAttribute("data-o-event", "-[[-"+chain);
        item.removeAttribute(e);
        // console.log(item.outerHTML);

        // DISABLED — `mode` event modifiers (mode="prevent|stop|once|passive|capture|self").
        // Handle it inside the arrow instead, e.g. onsubmit="(e)=> { e.preventDefault(); save() }".
        // Uncomment to re-enable. (The runtime data-o-event-mode reader in app.js is now dead code.)
        // const mode = item.getAttribute("mode");
        // if (mode) {
        //   item.setAttribute("data-o-event-mode", mode);
        //   item.removeAttribute("mode");
        // }
        // console.log(item.outerHTML + "\n----------");
      }
    });
  });
}

module.exports = handleEvents;
