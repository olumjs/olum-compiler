/**
 * magic-string.js — standalone single-file source map generator
 * Minimal replacement for the `magic-string` package (v0.30.21), using only
 * node built-ins. This project (lib/sourcemap.js) only ever builds an
 * IDENTITY map — `new MagicString(str)` with zero edits, then
 * `generateMap({ source, file, includeContent })` — so that surface is ported
 * faithfully (byte-identical output, including the VLQ `mappings`, JSON key
 * order and `toString()`/`toUrl()`):
 *
 *   const MagicString = require("./magic-string");
 *   const map = new MagicString(code).generateMap({ source, file, includeContent, hires });
 *   map.mappings / map.toString() / map.toUrl()
 *
 * Supported: generateMap / generateDecodedMap with options
 * `source`, `file`, `includeContent`, `hires` (true | "boundary" | falsy).
 *
 * KNOWN LIMITATIONS vs the real magic-string (future maintenance):
 * The string EDITING api (overwrite, update, appendLeft/Right, prepend,
 * append, remove, move, indent, trim, slice, clone, addSourcemapLocation,
 * Bundle, ...) is NOT implemented — those methods throw with a clear message
 * instead of failing silently. If the compiler ever needs to transform code
 * while tracking mappings (e.g. the sourcemap.js TODO about mapping html
 * above the script tag), either extend this file's char-walk in
 * generateDecodedMap to consume an edit list, or reinstall the real package.
 */
"use strict";

// ------------------------------------------------ base64 VLQ (sourcemap-codec)
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeVlq(num) {
  num = num < 0 ? (-num << 1) | 1 : num << 1;
  let out = "";
  do {
    let digit = num & 31;
    num >>>= 5;
    if (num > 0) digit |= 32; // continuation bit
    out += BASE64[digit];
  } while (num > 0);
  return out;
}

// encode decoded mappings ([[ [genCol, srcIdx, srcLine, srcCol, name?], ...], ...])
// into the standard delta-encoded VLQ string: fields are relative to the
// previous segment; generated column resets per line, the rest carry over
function encodeMappings(decoded) {
  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let nameIndex = 0;

  return decoded
    .map(line => {
      let genColumn = 0;
      return line
        .map(segment => {
          let out = encodeVlq(segment[0] - genColumn);
          genColumn = segment[0];
          if (segment.length > 1) {
            out += encodeVlq(segment[1] - sourceIndex) + encodeVlq(segment[2] - sourceLine) + encodeVlq(segment[3] - sourceColumn);
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

// path of `to` relative to `from`'s directory (magic-string's own helper)
function getRelativePath(from, to) {
  const fromParts = from.split(/[/\\]/);
  const toParts = to.split(/[/\\]/);

  fromParts.pop(); // get dirname

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

// --------------------------------------------------------------- SourceMap
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
    return JSON.stringify(this); // undefined keys (file, sourcesContent) drop out
  }

  toUrl() {
    return "data:application/json;charset=utf-8;base64," + Buffer.from(this.toString(), "utf-8").toString("base64");
  }
}

// -------------------------------------------------------------- MagicString
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

  // identity mapping: walk the original char by char, mirroring magic-string's
  // Mappings.addUneditedChunk — a segment at the first char of every line
  // (every char for hires: true, word boundaries for hires: "boundary");
  // lines with no characters get no segment
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
            // one segment per word, plus one for every non-word char
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
      sources: [options.source ? getRelativePath(options.file || "", options.source) : options.file || ""],
      sourcesContent: options.includeContent ? [this.original] : undefined,
      names: [],
      mappings,
    };
  }

  generateMap(options) {
    return new SourceMap(this.generateDecodedMap(options));
  }
}

// editing api is intentionally absent — fail loudly, not silently
for (const method of [
  "addSourcemapLocation", "append", "appendLeft", "appendRight", "clone", "indent",
  "insertLeft", "insertRight", "move", "overwrite", "prepend", "prependLeft",
  "prependRight", "remove", "replace", "replaceAll", "reset", "slice", "snip",
  "trim", "trimEnd", "trimStart", "trimLines", "update",
]) {
  MagicString.prototype[method] = function () {
    throw new Error(
      `MagicString#${method}() is not implemented in the standalone lib/magic-string.js — ` +
        "only identity source map generation (generateMap) is supported. " +
        "See the header comment for how to extend it, or reinstall the real magic-string package."
    );
  };
}

module.exports = MagicString;
module.exports.default = MagicString;
module.exports.SourceMap = SourceMap;
