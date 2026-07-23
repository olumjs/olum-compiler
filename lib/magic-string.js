"use strict";

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeVlq(num) {
  num = num < 0 ? (-num << 1) | 1 : num << 1;
  let out = "";
  do {
    let digit = num & 31;
    num >>>= 5;
    if (num > 0) digit |= 32;
    out += BASE64[digit];
  } while (num > 0);
  return out;
}

function encodeMappings(decoded) {
  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let nameIndex = 0;

  return decoded
    .map((line) => {
      let genColumn = 0;
      return line
        .map((segment) => {
          let out = encodeVlq(segment[0] - genColumn);
          genColumn = segment[0];
          if (segment.length > 1) {
            out +=
              encodeVlq(segment[1] - sourceIndex) +
              encodeVlq(segment[2] - sourceLine) +
              encodeVlq(segment[3] - sourceColumn);
            sourceIndex = segment[1];
            sourceLine = segment[2];
            sourceColumn = segment[3];
          }
          if (segment.length === 5) {
            out += encodeVlq(segment[4] - nameIndex);
            nameIndex = segment[4];
          }
          return out;
        })
        .join(",");
    })
    .join(";");
}

function getRelativePath(from, to) {
  const fromParts = from.split(/[/\\]/);
  const toParts = to.split(/[/\\]/);

  fromParts.pop();

  while (fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }

  if (fromParts.length) {
    let i = fromParts.length;
    while (i--) fromParts[i] = "..";
  }

  return fromParts.concat(toParts).join("/");
}

class SourceMap {
  constructor(properties) {
    this.version = 3;
    this.file = properties.file;
    this.sources = properties.sources;
    this.sourcesContent = properties.sourcesContent;
    this.names = properties.names;
    this.mappings = encodeMappings(properties.mappings);
  }

  toString() {
    return JSON.stringify(this);
  }

  toUrl() {
    return (
      "data:application/json;charset=utf-8;base64," +
      Buffer.from(this.toString(), "utf-8").toString("base64")
    );
  }
}

const wordRegex = /\w/;

class MagicString {
  constructor(string, options = {}) {
    this.original = string;
    this.filename = options.filename;
  }

  toString() {
    return this.original;
  }

  get length() {
    return this.original.length;
  }

  generateDecodedMap(options = {}) {
    const hires = options.hires;
    const mappings = [];
    let line = [];
    let genColumn = 0;
    let sourceLine = 0;
    let sourceColumn = 0;
    let first = true;
    let inBoundary = false;

    for (let i = 0; i < this.original.length; i++) {
      if (this.original[i] === "\n") {
        mappings.push(line);
        line = [];
        genColumn = 0;
        sourceLine += 1;
        sourceColumn = 0;
        first = true;
        inBoundary = false;
      } else {
        if (hires || first) {
          const segment = [genColumn, 0, sourceLine, sourceColumn];
          if (hires === "boundary") {
            if (wordRegex.test(this.original[i])) {
              if (!inBoundary) {
                line.push(segment);
                inBoundary = true;
              }
            } else {
              line.push(segment);
              inBoundary = false;
            }
          } else {
            line.push(segment);
          }
        }
        sourceColumn += 1;
        genColumn += 1;
        first = false;
      }
    }
    mappings.push(line);

    return {
      file: options.file ? options.file.split(/[/\\]/).pop() : undefined,
      sources: [
        options.source
          ? getRelativePath(options.file || "", options.source)
          : options.file || "",
      ],
      sourcesContent: options.includeContent ? [this.original] : undefined,
      names: [],
      mappings,
    };
  }

  generateMap(options) {
    return new SourceMap(this.generateDecodedMap(options));
  }
}

for (const method of [
  "addSourcemapLocation",
  "append",
  "appendLeft",
  "appendRight",
  "clone",
  "indent",
  "insertLeft",
  "insertRight",
  "move",
  "overwrite",
  "prepend",
  "prependLeft",
  "prependRight",
  "remove",
  "replace",
  "replaceAll",
  "reset",
  "slice",
  "snip",
  "trim",
  "trimEnd",
  "trimStart",
  "trimLines",
  "update",
]) {
  MagicString.prototype[method] = function () {
    throw new Error(
      `MagicString#${method}() is not implemented in the standalone lib/magic-string.js — ` +
        "only identity source map generation (generateMap) is supported. " +
        "See the header comment for how to extend it, or reinstall the real magic-string package.",
    );
  };
}

module.exports = MagicString;
module.exports.default = MagicString;
module.exports.SourceMap = SourceMap;
