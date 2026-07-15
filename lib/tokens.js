// Sentinels for compiler-generated ("structural") template interpolations.
//
// #2 (escape-by-default): the htmlParser wraps every remaining `{expr}` it finds in `olum.esc(...)`.
// But control-flow handlers (<if>/<for>/<show>) ALSO produce `{...}` interpolations whose result is
// raw HTML (a ternary returning a template string, a `.map().join('')`, etc.) and must NOT be escaped.
// To tell the two apart, those handlers emit these sentinels instead of literal braces; htmlParser
// converts the sentinels straight to `${...}` (unescaped) AFTER it has escaped the user braces.
//
// Plain ASCII so they survive a jsdom parse/serialize round-trip unchanged, and regex-safe so they
// can be swapped with a simple global replace.
// LT/GT shield: a directive expression (when="a > b", each="x of f(a < b)") is spliced into the
// markup as TEXT, so jsdom serializes its < and > to &lt;/&gt; and produces broken JS. We replace
// them with these sentinels in the CONDITION string only (never in branch/display text), then
// restore them in htmlParser after the round-trip — so escaped <,> in user-visible text are untouched.
const LT = "OLUM_LT";
const GT = "OLUM_GT";

// Tag shield: the HTML5 parser restricts what these containers may hold — unknown tags are DROPPED
// inside <select> and foster-parented out of <table>/<tr> — so a <for>/<if>/<show> placed there is
// destroyed before the directive passes run. Renaming the containers to unknown elements
// (olum-select, olum-tr, …) makes the parser treat them as generic containers that keep any child;
// htmlParser restores the real names after serialization.
const restrictedTags = "select|table|caption|colgroup|col|thead|tbody|tfoot|tr|td|th";
const shieldRe = new RegExp("<(\\/?)(" + restrictedTags + ")(?=[\\s/>])", "gi");
const unshieldRe = new RegExp("<(\\/?)olum-(" + restrictedTags + ")(?=[\\s/>])", "gi");

module.exports = {
  RAW_OPEN: "OLUM_RAW_OPEN",
  RAW_CLOSE: "OLUM_RAW_CLOSE",
  LT,
  GT,
  shieldOps: (s) => String(s).split("<").join(LT).split(">").join(GT),
  shieldTags: (s) => s.replace(shieldRe, "<$1olum-$2"),
  unshieldTags: (s) => s.replace(unshieldRe, "<$1$2"),
};
