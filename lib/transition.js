const { getLineInfo } = require("./lineCounter");

function parseDef(val) {
  const m = String(val)
    .trim()
    .match(/^([A-Za-z_$][\w$]*)\s*(?:\(([\s\S]*)\))?$/);
  if (!m) return null;
  return { name: m[1], args: (m[2] || "").trim() };
}

function buildSpec(item, counter, filePath) {
  const parts = [];
  const add = (dir, raw) => {
    const def = parseDef(raw);
    if (!def) {
      getLineInfo(
        counter,
        item,
        filePath,
        "Malformed <transition> value (expected name or name(params)):",
      );
      return;
    }

    parts.push(dir + ":" + def.name + "=${JSON.stringify([" + def.args + "])}");
  };

  if (item.hasAttribute("transition")) {
    add("in", item.getAttribute("transition"));
    add("out", item.getAttribute("transition"));
  }
  if (item.hasAttribute("in")) add("in", item.getAttribute("in"));
  if (item.hasAttribute("out")) add("out", item.getAttribute("out"));

  if (item.hasAttribute("flip")) {
    const raw = (item.getAttribute("flip") || "").trim();
    parts.push("flip=${JSON.stringify([" + raw + "])}");
  }

  ["onintrostart", "onintroend", "onoutrostart", "onoutroend"].forEach(
    (attr) => {
      if (item.hasAttribute(attr))
        parts.push("@" + attr.slice(2) + "=" + item.getAttribute(attr).trim());
    },
  );

  let chain = parts.join("&");
  chain = chain.replace(/{/g, "&lt;-olum-&gt;");
  return "-[[-" + chain + "-]]-";
}

function handleTransition(body, counter, filePath) {
  const els = new Array().slice.call(body.querySelectorAll("transition"));
  els.forEach((item) => {
    const child = item.firstElementChild;
    if (!child) {
      getLineInfo(
        counter,
        item,
        filePath,
        "Empty <transition> — expected a single element child:",
      );
      item.remove();
      return;
    }
    if (
      !item.hasAttribute("in") &&
      !item.hasAttribute("out") &&
      !item.hasAttribute("transition") &&
      !item.hasAttribute("flip")
    ) {
      getLineInfo(
        counter,
        item,
        filePath,
        "<transition> needs an in / out / transition / flip attribute:",
      );
    }
    child.setAttribute("data-o-trans", buildSpec(item, counter, filePath));

    while (item.firstChild) item.parentNode.insertBefore(item.firstChild, item);
    item.remove();
  });
}

module.exports = handleTransition;
