const { RAW_OPEN, RAW_CLOSE } = require("./tokens");

const BOOL_ATTRS = [
  "checked",
  "disabled",
  "selected",
  "readonly",
  "required",
  "hidden",
  "autofocus",
  "multiple",
  "open",
  "loop",
  "muted",
  "controls",
  "autoplay",
  "novalidate",
  "default",
  "defer",
  "ismap",
  "reversed",
];

const boolAttrRegex = new RegExp(
  "(\\s)(" + BOOL_ATTRS.join("|") + ")=([\"'])\\{([^{}]+)\\}\\3",
  "gi",
);

function handleBoolAttrs(content) {
  return content.replace(boolAttrRegex, (match, ws, name, quote, expr) => {
    return (
      ws +
      RAW_OPEN +
      "(" +
      expr.trim() +
      ') ? "' +
      name.toLowerCase() +
      '" : ""' +
      RAW_CLOSE
    );
  });
}

module.exports = handleBoolAttrs;
