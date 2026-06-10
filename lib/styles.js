const { getLineInfo } = require("./lineCounter");
const path = require("path");

function handleStyles(body, counter, filePath) {
  let name = path.basename(filePath).replace(/\.html/i, "");
  name = name.slice(0, 1).toLowerCase() + name.slice(1); // make compName camel case

  const elms = new Array().slice.call(body.querySelectorAll("*"));
  elms.forEach(item => {
    if (item.hasAttribute(":style")) {
      let attrValue = item.getAttribute(":style");
      if (attrValue) {
        attrValue = attrValue.trim();
        // if (attrValue.startsWith("{") && attrValue.endsWith("}")) {
          // attrValue = attrValue.slice(1,-1);
          // console.log(attrValue);

          // added special delimiters for json in attribute to overcome double quotes issue -[[- , -]]-
          let chain = "-[[-${JSON.stringify(" + attrValue + ")}-]]-";

          chain = chain.replace(/{/g, "&lt;-olum-&gt;"); // using <-olum-> (&lt;-olum-&gt;) as placeholder for "{"
          // console.log({chain});
          item.setAttribute("data-o-style", chain);
          item.removeAttribute(":style");
          // console.log(item.outerHTML + "\n----------");
        // }
      }
    }
  });
}

module.exports = handleStyles;
