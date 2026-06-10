const events = require("./domEvents");
const { getLineInfo } = require("./lineCounter");
const path = require("path");

function handleEvents(body, counter, filePath) {
  let name = path.basename(filePath).replace(/\.html/i, "");
  name = name.slice(0, 1).toLowerCase() + name.slice(1); // make compName camel case

  const elms = new Array().slice.call(body.querySelectorAll("*"));
  elms.forEach(item => {
    events.forEach(e => {
      if (item.hasAttribute(e)) {
        const attrValue = item.getAttribute(e);
        let methods = attrValue.split("),");
        methods = methods.map(str => (str.replace(/\)$/, "") + ")").trim());
        let methodsNames = methods.map(str => (str.trim().split("(")[0]).trim());
        let methodsArgs = methods.map(str => (str.trim().split("(")[1].replace(/\)$/, "")).trim());
        
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

        // todo handle direct logic inside event attribute with needing to invoke a method
        const mode = item.getAttribute("mode");
        if (mode) {
          item.setAttribute("data-o-event-mode", mode);
          item.removeAttribute("mode");
        }
        // console.log(item.outerHTML + "\n----------");
      }
    });
  });
}

module.exports = handleEvents;
