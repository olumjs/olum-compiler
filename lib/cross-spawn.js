/**
 * spawn.js — standalone single-file port of cross-spawn@7.0.6 (MIT)
 * with its dependencies inlined: which@2.0.2, isexe@2.0.0, path-key@3.1.1,
 * shebang-command@2.0.0, shebang-regex@3.0.0 (all MIT).
 * Uses only node built-ins (child_process, fs, path).
 *
 * API (same as cross-spawn):
 *   spawn(command, [args], [options])       → ChildProcess
 *   spawn.sync(command, [args], [options])  → SpawnSyncReturns
 */
"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const isWin = process.platform === "win32";
// `which`/`isexe` treat cygwin/msys shells as windows too
const isWindowsEnv = isWin || process.env.OSTYPE === "cygwin" || process.env.OSTYPE === "msys";

// ---------------------------------------------------------------- path-key
function pathKey(options = {}) {
  const environment = options.env || process.env;
  const platform = options.platform || process.platform;
  if (platform !== "win32") return "PATH";
  return Object.keys(environment).reverse().find(key => key.toUpperCase() === "PATH") || "Path";
}

// ------------------------------------------------------------------- isexe
// windows flavor: a file is executable if its extension is in PATHEXT
function checkPathExt(file, options) {
  let pathext = options.pathExt !== undefined ? options.pathExt : process.env.PATHEXT;
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
  return (mod & o) || (mod & g && gid === myGid) || (mod & u && uid === myUid) || (mod & ug && myUid === 0);
}

function isexeSync(file, options) {
  return isWindowsEnv ? isexeWindows(file, options) : isexePosix(file);
}

// ------------------------------------------------------------------- which
function getPathInfo(cmd, opt) {
  const colon = opt.colon || (isWindowsEnv ? ";" : ":");

  // if cmd has a slash, don't search PATH — check the file itself
  const pathEnv = cmd.match(/\//) || (isWindowsEnv && cmd.match(/\\/))
    ? [""]
    : [
        // windows always checks the cwd first
        ...(isWindowsEnv ? [process.cwd()] : []),
        ...(opt.path || process.env.PATH || "").split(colon),
      ];
  const pathExtExe = isWindowsEnv ? opt.pathExt || process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM" : "";
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
      } catch (ex) { /* Empty */ }
    }
  }

  if (opt.nothrow) return null;
  throw Object.assign(new Error("not found: " + cmd), { code: "ENOENT" });
}

// -------------------------------------------------- cross-spawn/lib/util/*
function resolveCommandAttempt(parsed, withoutPathExt) {
  const env = parsed.options.env || process.env;
  const cwd = process.cwd();
  const hasCustomCwd = parsed.options.cwd != null;
  // worker threads do not have process.chdir()
  const shouldSwitchCwd = hasCustomCwd && process.chdir !== undefined && !process.chdir.disabled;

  // `which` stats against the process cwd, so temporarily switch to the custom one
  if (shouldSwitchCwd) {
    try {
      process.chdir(parsed.options.cwd);
    } catch (err) { /* Empty */ }
  }

  let resolved;

  try {
    resolved = whichSync(parsed.command, {
      path: env[pathKey({ env })],
      pathExt: withoutPathExt ? path.delimiter : undefined,
    });
  } catch (e) { /* Empty */ } finally {
    if (shouldSwitchCwd) process.chdir(cwd);
  }

  // ensure an absolute path is returned (resolved against the custom cwd if any)
  if (resolved) resolved = path.resolve(hasCustomCwd ? parsed.options.cwd : "", resolved);

  return resolved;
}

function resolveCommand(parsed) {
  return resolveCommandAttempt(parsed) || resolveCommandAttempt(parsed, true);
}

// shebang-command: "#!/usr/bin/env node" → "node", "#!/usr/bin/node -x" → "node -x"
function shebangCommand(string = "") {
  const match = string.match(/^#!(.*)/);
  if (!match) return null;

  const [shebangPath, argument] = match[0].replace(/#! ?/, "").split(" ");
  const binary = shebangPath.split("/").pop();

  if (binary === "env") return argument;
  return argument ? `${binary} ${argument}` : binary;
}

function readShebang(command) {
  // read the first 150 bytes of the file
  const size = 150;
  const buffer = Buffer.alloc(size);

  let fd;
  try {
    fd = fs.openSync(command, "r");
    fs.readSync(fd, buffer, 0, size, 0);
    fs.closeSync(fd);
  } catch (e) { /* Empty */ }

  return shebangCommand(buffer.toString());
}

// see http://www.robvanderwoude.com/escapechars.php
const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;

function escapeCommand(arg) {
  return arg.replace(metaCharsRegExp, "^$1");
}

function escapeArgument(arg, doubleEscapeMetaChars) {
  arg = `${arg}`;

  // algorithm based on https://qntm.org/cmd, altered to avoid regex backtracking
  // sequence of backslashes followed by a double quote: double the backslashes, escape the quote
  arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
  // sequence of backslashes at the end (a double quote follows once wrapped): double them
  arg = arg.replace(/(?=(\\+?)?)\1$/, "$1$1");

  // quote the whole thing, then escape cmd.exe meta chars
  arg = `"${arg}"`;
  arg = arg.replace(metaCharsRegExp, "^$1");

  // cmd-shims are re-parsed by a second cmd.exe, so escape twice
  if (doubleEscapeMetaChars) arg = arg.replace(metaCharsRegExp, "^$1");

  return arg;
}

// --------------------------------------------------- cross-spawn/lib/parse
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

  // no shell needed if the command resolved to a real executable (.com/.exe)
  const needsShell = !isExecutableRegExp.test(commandFile);

  if (parsed.options.forceShell || needsShell) {
    // cmd-shims in node_modules/.bin invoke a nested cmd.exe, requiring double escaping
    const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(commandFile);

    // normalize posix paths (foo/bar → foo\bar) or cmd.exe fails with ENOENT
    parsed.command = path.normalize(parsed.command);

    parsed.command = escapeCommand(parsed.command);
    parsed.args = parsed.args.map(arg => escapeArgument(arg, needsDoubleEscapeMetaChars));

    const shellCommand = [parsed.command].concat(parsed.args).join(" ");

    parsed.args = ["/d", "/s", "/c", `"${shellCommand}"`];
    parsed.command = process.env.comspec || "cmd.exe";
    parsed.options.windowsVerbatimArguments = true; // args are already escaped
  }

  return parsed;
}

function parse(command, args, options) {
  // normalize arguments, similar to nodejs
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

// -------------------------------------------------- cross-spawn/lib/enoent
function notFoundError(original, syscall) {
  return Object.assign(new Error(`${syscall} ${original.command} ENOENT`), {
    code: "ENOENT",
    errno: "ENOENT",
    syscall: `${syscall} ${original.command}`,
    path: original.command,
    spawnargs: original.args,
  });
}

// on windows a missing command exits cmd.exe with status 1 instead of erroring;
// convert that into the ENOENT error posix would have produced
function verifyENOENT(status, parsed, syscall) {
  if (isWin && status === 1 && !parsed.file) return notFoundError(parsed.original, syscall);
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

// ------------------------------------------------------- cross-spawn/index
function spawn(command, args, options) {
  const parsed = parse(command, args, options);
  const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);
  hookChildProcess(spawned, parsed);
  return spawned;
}

function spawnSync(command, args, options) {
  const parsed = parse(command, args, options);
  const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);
  result.error = result.error || verifyENOENT(result.status, parsed, "spawnSync");
  return result;
}

module.exports = spawn;
module.exports.spawn = spawn;
module.exports.sync = spawnSync;
module.exports._parse = parse;
