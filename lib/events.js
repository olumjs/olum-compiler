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

function handleEvents(body, counter, filePath, anonHandlers) {
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
