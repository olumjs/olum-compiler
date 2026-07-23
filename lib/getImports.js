const acorn = require("acorn");
const { isFullArr } = require("./helpers");

function getImports(str) {
  let finalImports = [];
  let arr = acorn.parse(str, {
    ecmaVersion: "latest",
    sourceType: "module",
  }).body;
  arr.forEach((obj) => {
    if (obj.type === "ImportDeclaration") {
      if (obj.specifiers) {
        if (isFullArr(obj.specifiers)) {
          if (obj.specifiers.length === 1) {
            if (obj.specifiers[0].type == "ImportDefaultSpecifier") {
              const name = obj.specifiers[0].local.name;
              const statement = "import " + name + " from " + obj.source.raw;
              finalImports.push({
                statement,
                regex: `(from)(\\s+)?(${obj.source.raw}).*`,
              });
            } else {
              const name = obj.specifiers[0].local.name;
              const statement =
                "import { " + name + " } from " + obj.source.raw;
              finalImports.push({
                statement,
                regex: `(from)(\\s+)?(${obj.source.raw}).*`,
              });
            }
          } else {
            let defaultItem = null;
            let nonDefaultArr = [];
            obj.specifiers.forEach((item) => {
              if (item.type === "ImportDefaultSpecifier")
                defaultItem = item.local.name;
              if (item.type === "ImportSpecifier")
                nonDefaultArr.push(item.local.name);
            });
            const statement =
              "import " +
              (defaultItem ? defaultItem + ", " : "") +
              "{ " +
              nonDefaultArr.join(", ") +
              " } from " +
              obj.source.raw;
            finalImports.push({
              statement,
              regex: `(from)(\\s+)?(${obj.source.raw}).*`,
            });
          }
        } else {
          const statement = "import " + obj.source.raw;
          finalImports.push({
            statement,
            type: "noFrom",
            regex: `(import)(\\s+)?(${obj.source.raw}).*\\n?`,
          });
        }
      }
    }
  });
  return finalImports.length ? finalImports : null;
}

module.exports = getImports;
