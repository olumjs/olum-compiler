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
module.exports = {
  RAW_OPEN: "OLUM_RAW_OPEN",
  RAW_CLOSE: "OLUM_RAW_CLOSE",
};
