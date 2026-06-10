const esprima = require("esprima");
const { isFullArr } = require("./helpers");
// FYI: it ignores the comments by default beacuse it's based on lexial environment not based on regex
function getImports(str) {
  let finalImports = [];
  let arr = esprima.parse(str, { sourceType: "module" }).body;
  arr.forEach((obj) => {
    if (obj.type === "ImportDeclaration") {
      if (obj.specifiers) {
        if (isFullArr(obj.specifiers)) {
          if (obj.specifiers.length === 1) {
            if (obj.specifiers[0].type == "ImportDefaultSpecifier") {
              // default
              const name = obj.specifiers[0].local.name;
              const statement = "import " + name + " from " + obj.source.raw;
              finalImports.push({ statement, regex: `(from)(\\s+)?(${obj.source.raw}).*`});
              // console.log("default: ", statement);
            } else {
              // non-default
              const name = obj.specifiers[0].local.name;
              const statement = "import { " + name + " } from " + obj.source.raw;
              finalImports.push({ statement, regex: `(from)(\\s+)?(${obj.source.raw}).*` });
              // console.log("Non-default: ", statement);
            }
          } else {
            let defaultItem = null;
            let nonDefaultArr = [];
            obj.specifiers.forEach((item) => {
              if (item.type === "ImportDefaultSpecifier") defaultItem = item.local.name;
              if (item.type === "ImportSpecifier") nonDefaultArr.push(item.local.name);
            });
            const statement = "import " + (defaultItem ? defaultItem + ", " : "") + "{ " + nonDefaultArr.join(", ") + " } from " + obj.source.raw;
            finalImports.push({ statement, regex: `(from)(\\s+)?(${obj.source.raw}).*` });
            // console.log("mix: ", statement);
          }
        } else {
          // import only
          const statement = "import " + obj.source.raw;
          finalImports.push({ statement, type: "noFrom", regex: `(import)(\\s+)?(${obj.source.raw}).*\\n?` });
          // console.log("import only: ", statement);
        }
      }
    }
  });
  return finalImports.length ? finalImports : null;
}

module.exports = getImports;
