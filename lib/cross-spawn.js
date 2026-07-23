"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const isWin = process.platform === "win32";

const isWindowsEnv =
  isWin || process.env.OSTYPE === "cygwin" || process.env.OSTYPE === "msys";

function pathKey(options = {}) {
  const environment = options.env || process.env;
  const platform = options.platform || process.platform;
  if (platform !== "win32") return "PATH";
  return (
    Object.keys(environment)
      .reverse()
      .find((key) => key.toUpperCase() === "PATH") || "Path"
  );
}

function checkPathExt(file, options) {
  let pathext =
    options.pathExt !== undefined ? options.pathExt : process.env.PATHEXT;
  if (!pathext) return true;
  pathext = pathext.split(";");
  if (pathext.indexOf("") !== -1) return true;
  for (let i = 0; i < pathext.length; i++) {
    const p = pathext[i].toLowerCase();
    if (p && file.substr(-p.length).toLowerCase() === p) return true;
  }
  return false;
}

function isexeWindows(file, options) {
  const stat = fs.statSync(file);
  if (!stat.isSymbolicLink() && !stat.isFile()) return false;
  return checkPathExt(file, options);
}

function isexePosix(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) return false;
  const mod = stat.mode;
  const uid = stat.uid;
  const gid = stat.gid;
  const myUid = process.getuid && process.getuid();
  const myGid = process.getgid && process.getgid();
  const u = parseInt("100", 8);
  const g = parseInt("010", 8);
  const o = parseInt("001", 8);
  const ug = u | g;
  return (
    mod & o ||
    (mod & g && gid === myGid) ||
    (mod & u && uid === myUid) ||
    (mod & ug && myUid === 0)
  );
}

function isexeSync(file, options) {
  return isWindowsEnv ? isexeWindows(file, options) : isexePosix(file);
}

function getPathInfo(cmd, opt) {
  const colon = opt.colon || (isWindowsEnv ? ";" : ":");

  const pathEnv =
    cmd.match(/\//) || (isWindowsEnv && cmd.match(/\\/))
      ? [""]
      : [
          ...(isWindowsEnv ? [process.cwd()] : []),
          ...(opt.path || process.env.PATH || "").split(colon),
        ];
  const pathExtExe = isWindowsEnv
    ? opt.pathExt || process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM"
    : "";
  const pathExt = isWindowsEnv ? pathExtExe.split(colon) : [""];

  if (isWindowsEnv) {
    if (cmd.indexOf(".") !== -1 && pathExt[0] !== "") pathExt.unshift("");
  }

  return { pathEnv, pathExt, pathExtExe };
}

function whichSync(cmd, opt) {
  opt = opt || {};
  const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);

  for (let i = 0; i < pathEnv.length; i++) {
    const ppRaw = pathEnv[i];
    const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;

    const pCmd = path.join(pathPart, cmd);
    const p = !pathPart && /^\.[\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;

    for (let j = 0; j < pathExt.length; j++) {
      const cur = p + pathExt[j];
      try {
        if (isexeSync(cur, { pathExt: pathExtExe })) return cur;
      } catch (ex) {}
    }
  }

  if (opt.nothrow) return null;
  throw Object.assign(new Error("not found: " + cmd), { code: "ENOENT" });
}

function resolveCommandAttempt(parsed, withoutPathExt) {
  const env = parsed.options.env || process.env;
  const cwd = process.cwd();
  const hasCustomCwd = parsed.options.cwd != null;

  const shouldSwitchCwd =
    hasCustomCwd && process.chdir !== undefined && !process.chdir.disabled;

  if (shouldSwitchCwd) {
    try {
      process.chdir(parsed.options.cwd);
    } catch (err) {}
  }

  let resolved;

  try {
    resolved = whichSync(parsed.command, {
      path: env[pathKey({ env })],
      pathExt: withoutPathExt ? path.delimiter : undefined,
    });
  } catch (e) {
  } finally {
    if (shouldSwitchCwd) process.chdir(cwd);
  }

  if (resolved)
    resolved = path.resolve(hasCustomCwd ? parsed.options.cwd : "", resolved);

  return resolved;
}

function resolveCommand(parsed) {
  return resolveCommandAttempt(parsed) || resolveCommandAttempt(parsed, true);
}

function shebangCommand(string = "") {
  const match = string.match(/^#!(.*)/);
  if (!match) return null;

  const [shebangPath, argument] = match[0].replace(/#! ?/, "").split(" ");
  const binary = shebangPath.split("/").pop();

  if (binary === "env") return argument;
  return argument ? `${binary} ${argument}` : binary;
}

function readShebang(command) {
  const size = 150;
  const buffer = Buffer.alloc(size);

  let fd;
  try {
    fd = fs.openSync(command, "r");
    fs.readSync(fd, buffer, 0, size, 0);
    fs.closeSync(fd);
  } catch (e) {}

  return shebangCommand(buffer.toString());
}

const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;

function escapeCommand(arg) {
  return arg.replace(metaCharsRegExp, "^$1");
}

function escapeArgument(arg, doubleEscapeMetaChars) {
  arg = `${arg}`;

  arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');

  arg = arg.replace(/(?=(\\+?)?)\1$/, "$1$1");

  arg = `"${arg}"`;
  arg = arg.replace(metaCharsRegExp, "^$1");

  if (doubleEscapeMetaChars) arg = arg.replace(metaCharsRegExp, "^$1");

  return arg;
}

const isExecutableRegExp = /\.(?:com|exe)$/i;
const isCmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;

function detectShebang(parsed) {
  parsed.file = resolveCommand(parsed);

  const shebang = parsed.file && readShebang(parsed.file);

  if (shebang) {
    parsed.args.unshift(parsed.file);
    parsed.command = shebang;
    return resolveCommand(parsed);
  }

  return parsed.file;
}

function parseNonShell(parsed) {
  if (!isWin) return parsed;

  const commandFile = detectShebang(parsed);

  const needsShell = !isExecutableRegExp.test(commandFile);

  if (parsed.options.forceShell || needsShell) {
    const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(commandFile);

    parsed.command = path.normalize(parsed.command);

    parsed.command = escapeCommand(parsed.command);
    parsed.args = parsed.args.map((arg) =>
      escapeArgument(arg, needsDoubleEscapeMetaChars),
    );

    const shellCommand = [parsed.command].concat(parsed.args).join(" ");

    parsed.args = ["/d", "/s", "/c", `"${shellCommand}"`];
    parsed.command = process.env.comspec || "cmd.exe";
    parsed.options.windowsVerbatimArguments = true;
  }

  return parsed;
}

function parse(command, args, options) {
  if (args && !Array.isArray(args)) {
    options = args;
    args = null;
  }

  args = args ? args.slice(0) : [];
  options = Object.assign({}, options);

  const parsed = {
    command,
    args,
    options,
    file: undefined,
    original: { command, args },
  };

  return options.shell ? parsed : parseNonShell(parsed);
}

function notFoundError(original, syscall) {
  return Object.assign(new Error(`${syscall} ${original.command} ENOENT`), {
    code: "ENOENT",
    errno: "ENOENT",
    syscall: `${syscall} ${original.command}`,
    path: original.command,
    spawnargs: original.args,
  });
}

function verifyENOENT(status, parsed, syscall) {
  if (isWin && status === 1 && !parsed.file)
    return notFoundError(parsed.original, syscall);
  return null;
}

function hookChildProcess(child, parsed) {
  if (!isWin) return;

  const originalEmit = child.emit;
  child.emit = function (name, arg1) {
    if (name === "exit") {
      const err = verifyENOENT(arg1, parsed, "spawn");
      if (err) return originalEmit.call(child, "error", err);
    }
    return originalEmit.apply(child, arguments);
  };
}

function spawn(command, args, options) {
  const parsed = parse(command, args, options);
  const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);
  hookChildProcess(spawned, parsed);
  return spawned;
}

function spawnSync(command, args, options) {
  const parsed = parse(command, args, options);
  const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);
  result.error =
    result.error || verifyENOENT(result.status, parsed, "spawnSync");
  return result;
}

module.exports = spawn;
module.exports.spawn = spawn;
module.exports.sync = spawnSync;
module.exports._parse = parse;
