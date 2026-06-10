const { htmlComment } = require("./regex");
module.exports = function clean(str) {
  return str.replace(htmlComment, "").trim();
};
