// todo support mapping for html (stuff above script tag)
const MagicString = require('magic-string');
const { stringToBase64 } = require("./helpers");
const path = require("path");

function mkMapping(str, filePath) {
    const s = new MagicString(str);
    const map = s.generateMap({
        source: filePath,
        file: filePath + '.map',
        includeContent: true
    });
    return JSON.parse(map.toString()).mappings;
}

function createSourceMap(str, filePath) {
    try {
        filePath = filePath.replaceAll(filePath.split("src")[0], "./");
    } catch (err) {
        filePath = "./src/" + path.basename(filePath);
    }

    const map = {
        version: 3,
        file: filePath,
        mappings: mkMapping(str, filePath),
        sources: ["olum://appName/" + filePath], // todo replace appName
        sourcesContent: [str],
        names: ["olum"]
    };

    return stringToBase64(JSON.stringify(map));
}
module.exports = createSourceMap;