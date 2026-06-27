const { getLineInfo } = require("./lineCounter");
const path = require("path");

function handleAttr(body, counter, filePath) {
  let name = path.basename(filePath).replace(/\.html/i, "");
  name = name.slice(0, 1).toLowerCase() + name.slice(1); // make compName camel case

  const elms = new Array().slice.call(body.querySelectorAll("*"));
  elms.forEach((item) => {
    const attrs = item.getAttributeNames();
    if (attrs.length) {
      // DISABLED — {identifier} shorthand (<img {src} /> → src="{src}"). Naked braces aren't allowed
      // in attribute position anymore (values live in ""); write src="{src}" instead. Uncomment to re-enable.
      // attrs.filter(attr => /^\{\w+\}$/.test(attr)).forEach(attr => {
      //   const attrName = attr.slice(1, -1);
      //   item.removeAttribute(attr);
      //   item.setAttribute(attrName, "{" + attrName + "}");
      // });

      // DISABLED — :attr dynamic binding (:src="expr"). Colon attributes are gone; regular
      // attributes are literal strings with {expr} interpolation inside. Uncomment to re-enable.
      // const dynamicAttrs = attrs.filter((attr) => attr.startsWith(":"));
      // if (dynamicAttrs.length) {
      //   dynamicAttrs.forEach((attrName) => {
      //     let attrValue = item.getAttribute(attrName);
      //     if (attrValue) {
      //       attrName = attrName.trim().slice(1);
      //       attrValue = attrValue.trim();
      //       let chain = "-[[-${JSON.parse(JSON.stringify(" + attrValue + "))}-]]-";
      //       chain = chain.replace(/{/g, "&lt;-olum-&gt;"); // using <-olum-> (&lt;-olum-&gt;) as placeholder for "{"
      //       item.setAttribute(attrName, chain);
      //       item.removeAttribute(":"+attrName);
      //     }
      //   });
      // }
    }
  });
}

module.exports = handleAttr;
