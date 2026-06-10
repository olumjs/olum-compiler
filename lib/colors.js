// todo check how to convert colors.bgRed.white into colors("bgRed.white")
let map = {
  reset: { start: "\x1B[0m", end: "\x1B[0m" },
  bold: { start: "\x1B[1m", end: "\x1B[22m" },
  dim: { start: "\x1B[2m", end: "\x1B[22m" },
  italic: { start: "\x1B[3m", end: "\x1B[23m" },
  underline: { start: "\x1B[4m", end: "\x1B[24m" },
  inverse: { start: "\x1B[7m", end: "\x1B[27m" },
  hidden: { start: "\x1B[8m", end: "\x1B[28m" },
  strikethrough: { start: "\x1B[9m", end: "\x1B[29m" },
  black: { start: "\x1B[30m", end: "\x1B[39m" },
  red: { start: "\x1B[31m", end: "\x1B[39m" },
  green: { start: "\x1B[32m", end: "\x1B[39m" },
  yellow: { start: "\x1B[33m", end: "\x1B[39m" },
  blue: { start: "\x1B[34m", end: "\x1B[39m" },
  magenta: { start: "\x1B[35m", end: "\x1B[39m" },
  cyan: { start: "\x1B[36m", end: "\x1B[39m" },
  white: { start: "\x1B[37m", end: "\x1B[39m" },
  gray: { start: "\x1B[90m", end: "\x1B[39m" },
  grey: { start: "\x1B[90m", end: "\x1B[39m" },
  brightRed: { start: "\x1B[91m", end: "\x1B[39m" },
  brightGreen: { start: "\x1B[92m", end: "\x1B[39m" },
  brightYellow: { start: "\x1B[93m", end: "\x1B[39m" },
  brightBlue: { start: "\x1B[94m", end: "\x1B[39m" },
  brightMagenta: { start: "\x1B[95m", end: "\x1B[39m" },
  brightCyan: { start: "\x1B[96m", end: "\x1B[39m" },
  brightWhite: { start: "\x1B[97m", end: "\x1B[39m" },
  bgBlack: { start: "\x1B[40m", end: "\x1B[49m" },
  bgRed: { start: "\x1B[41m", end: "\x1B[49m" },
  bgGreen: { start: "\x1B[42m", end: "\x1B[49m" },
  bgYellow: { start: "\x1B[43m", end: "\x1B[49m" },
  bgBlue: { start: "\x1B[44m", end: "\x1B[49m" },
  bgMagenta: { start: "\x1B[45m", end: "\x1B[49m" },
  bgCyan: { start: "\x1B[46m", end: "\x1B[49m" },
  bgWhite: { start: "\x1B[47m", end: "\x1B[49m" },
  bgGray: { start: "\x1B[100m", end: "\x1B[49m" },
  bgGrey: { start: "\x1B[100m", end: "\x1B[49m" },
  bgBrightRed: { start: "\x1B[101m", end: "\x1B[49m" },
  bgBrightGreen: { start: "\x1B[102m", end: "\x1B[49m" },
  bgBrightYellow: { start: "\x1B[103m", end: "\x1B[49m" },
  bgBrightBlue: { start: "\x1B[104m", end: "\x1B[49m" },
  bgBrightMagenta: { start: "\x1B[105m", end: "\x1B[49m" },
  bgBrightCyan: { start: "\x1B[106m", end: "\x1B[49m" },
  bgBrightWhite: { start: "\x1B[107m", end: "\x1B[49m" },
  blackBG: { start: "\x1B[40m", end: "\x1B[49m" },
  redBG: { start: "\x1B[41m", end: "\x1B[49m" },
  greenBG: { start: "\x1B[42m", end: "\x1B[49m" },
  yellowBG: { start: "\x1B[43m", end: "\x1B[49m" },
  blueBG: { start: "\x1B[44m", end: "\x1B[49m" },
  magentaBG: { start: "\x1B[45m", end: "\x1B[49m" },
  cyanBG: { start: "\x1B[46m", end: "\x1B[49m" },
  whiteBG: { start: "\x1B[47m", end: "\x1B[49m" },
};

function colors(props, text) {
  let arr = props.split(".");
  if (arr.length) {
    if (arr.length === 1) return map[arr[0]].start + text + map["reset"].start;
    else if (arr.length > 1) {
      let str = "";
      arr.forEach((item) => (str += map[item].start));
      return str + text + map["reset"].start;
    }
  }
}

// test cases:
// console.log(colors("cyan", "Serving"), colors("green", "localhost"));
// console.log(colors("red", "err"));
// console.log(colors("yellow.bold", "<<Olum Warning>>"));
// console.log(colors("yellow", "File"));
module.exports = colors;