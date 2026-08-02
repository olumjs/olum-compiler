const fs = require("fs");
const path = require("path");

const srcDest = path.resolve(__dirname, "../src");
const mapFile = path.join(srcDest, "usage.json");

const relative = (file) =>
  "src/" + path.relative(srcDest, file).split(path.sep).join("/");

const read = () => {
  try {
    return JSON.parse(fs.readFileSync(mapFile, "utf8"));
  } catch (e) {
    return {};
  }
};

const write = (map) => {
  try {
    fs.writeFileSync(mapFile, JSON.stringify(map, null, 2));
  } catch (e) {}
};

module.exports = {
  relative,
  record(file, children) {
    const map = read();
    map[relative(file)] = children;
    write(map);
  },

  drop(file) {
    const map = read();
    const key = relative(file);
    if (!(key in map)) return;
    delete map[key];
    write(map);
  },
};
