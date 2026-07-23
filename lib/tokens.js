const LT = "OLUM_LT";
const GT = "OLUM_GT";
const QUOT = "OLUM_QUOT";

const restrictedTags =
  "select|table|caption|colgroup|col|thead|tbody|tfoot|tr|td|th";
const shieldRe = new RegExp("<(\\/?)(" + restrictedTags + ")(?=[\\s/>])", "gi");
const unshieldRe = new RegExp(
  "<(\\/?)olum-(" + restrictedTags + ")(?=[\\s/>])",
  "gi",
);

module.exports = {
  RAW_OPEN: "OLUM_RAW_OPEN",
  RAW_CLOSE: "OLUM_RAW_CLOSE",
  LT,
  GT,
  QUOT,
  shieldOps: (s) =>
    String(s).split("<").join(LT).split(">").join(GT).split('"').join(QUOT),
  shieldTags: (s) => s.replace(shieldRe, "<$1olum-$2"),
  unshieldTags: (s) => s.replace(unshieldRe, "<$1$2"),
};
