const { getLineInfo } = require("./lineCounter");
const path = require("path");

function handleAttr(body, counter, filePath) {
  let name = path.basename(filePath).replace(/\.html/i, "");
  name = name.slice(0, 1).toLowerCase() + name.slice(1); // make compName camel case

  const elms = new Array().slice.call(body.querySelectorAll("*"));
  elms.forEach((item) => {
    const attrs = item.getAttributeNames();
    if (attrs.length) {
      // {identifier} shorthand: <img {src} /> → <img src="{src}" /> → src="${src}" in template -- inspired by svelete
      attrs.filter(attr => /^\{\w+\}$/.test(attr)).forEach(attr => {
        const attrName = attr.slice(1, -1);
        item.removeAttribute(attr);
        item.setAttribute(attrName, "{" + attrName + "}");
      });

      const dynamicAttrs = attrs.filter((attr) => attr.startsWith(":"));
      if (dynamicAttrs.length) {
        dynamicAttrs.forEach((attrName) => {
          let attrValue = item.getAttribute(attrName);
          if (attrValue) {
            attrName = attrName.trim().slice(1);
            attrValue = attrValue.trim();
            let chain = "-[[-${JSON.parse(JSON.stringify(" + attrValue + "))}-]]-";
            chain = chain.replace(/{/g, "&lt;-olum-&gt;"); // using <-olum-> (&lt;-olum-&gt;) as placeholder for "{"
            // // console.log({chain});
            // item.setAttribute("data-o-attr-" + attrName, chain);
            item.setAttribute(attrName, chain);
            item.removeAttribute(":"+attrName);
          }
        });
      }
    }
  });
}

module.exports = handleAttr;
