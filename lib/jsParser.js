function jsParser(sfc) {
  let { js: content, jsAttrs } = sfc;
  content = content.replace(/onMount\(/, "var mounted = onMount(");

  content = content.replace(/const state/g, "var state");
  return { js: content, jsAttrs };
}

module.exports = jsParser;
