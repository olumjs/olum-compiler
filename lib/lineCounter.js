const colors = require("./colors");
const fs = require("fs");
const path = require("path");

const lineCounter = (str) => str.split("\n").map((line) => line);

function getLineInfo(counter, item, filePath, msg) {
  const portion = item.outerHTML.split("\n")[0].trim();
  counter.forEach((line, index) => {
    index = index + 1;
    const origin = line;
    line = line.replace(/(\s+)?\/\>/g, ">").trim();
    if (line === portion) {
      const log =
        colors("yellow.bold", "\n<<Olum Warning>>\n") +
        colors(
          "yellow",
          " File: " + filePath + "\n Line: " + index + "\n " + msg + "\n",
        ) +
        colors("red", "  " + origin.trim()) +
        "\n";
      console.warn(log);

      const _log =
        "\n<<Olum Warning>>\n" +
        " File: " +
        filePath +
        "\n Line: " +
        index +
        "\n " +
        msg +
        "\n" +
        "  " +
        origin.trim() +
        "\n";
      const logFilePath = path.resolve(__dirname, "./log.txt");
      if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, "");
      fs.appendFileSync(logFilePath, _log);
    }
  });
}

module.exports.lineCounter = lineCounter;
module.exports.getLineInfo = getLineInfo;
