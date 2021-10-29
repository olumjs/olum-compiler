const colors = require("colors");

const logger = (name, status) => {
  const t = new Date();
  const h = t.getHours();
  const m = t.getMinutes();
  const s = t.getSeconds();

  const start = colors.bgBlue.white("[" + h + ":" + m + ":" + s + "]" + " Starting " + "'" + name + "'...");
  const end = colors.bgGreen.white("[" + h + ":" + m + ":" + s + "]" + " Finished " + "'" + name + "'");

  if (status === "start") {
    console.log(colors.yellow(start));
  } else if (status === "end") {
    console.log(colors.yellow(end));
  }
};

module.exports = logger;