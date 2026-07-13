const { RAW_OPEN, RAW_CLOSE } = require("./tokens");

// Boolean attributes are truthy by PRESENCE: the browser treats checked="false" as checked and
// disabled="false" as disabled. So value interpolation (checked="${olum.esc(expr)}") can never
// turn them off. For these attributes, attr="{expr}" compiles to a conditional that emits the
// bare attribute name or nothing at all: ${(expr) ? "checked" : ""}.
//
// Runs on the serialized markup string, BEFORE the generic {expr} escape pass (which would
// otherwise claim these braces) and emitted with RAW sentinels so the code is not esc-wrapped.
// Only fires when the ENTIRE value is a single {expr}; mixed values (checked="a {b}") are
// meaningless for boolean attributes and fall through to the generic pass. Component props are
// already packed into data-o-props by placeholder() and can't match here.
const BOOL_ATTRS = [
  "checked", "disabled", "selected", "readonly", "required", "hidden",
  "autofocus", "multiple", "open", "loop", "muted", "controls", "autoplay",
  "novalidate", "default", "defer", "ismap", "reversed",
];

const boolAttrRegex = new RegExp("(\\s)(" + BOOL_ATTRS.join("|") + ")=([\"'])\\{([^{}]+)\\}\\3", "gi");

function handleBoolAttrs(content) {
  return content.replace(boolAttrRegex, (match, ws, name, quote, expr) => {
    return ws + RAW_OPEN + "(" + expr.trim() + ') ? "' + name.toLowerCase() + '" : ""' + RAW_CLOSE;
  });
}

module.exports = handleBoolAttrs;
