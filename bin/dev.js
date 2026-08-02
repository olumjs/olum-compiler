const serve = require("./server");
const watch = require("./watcher");
const compile = require("./compiler");
const copySrc = require("./copySrc");
const WebSocket = require("../lib/websocket");
const colors = require("../lib/colors");
const path = require("path");
const fs = require("fs");

let sockets;
const entryPoint = path.resolve(__dirname, "../public");

const lockFile = path.resolve(__dirname, "../.dev.lock");
const me = String(process.pid);
const read = () => {
  try {
    return fs.readFileSync(lockFile, "utf8").trim();
  } catch (e) {
    return "";
  }
};
const alive = (pid) => {
  try {
    return !!process.kill(pid, 0);
  } catch (e) {
    return e.code === "EPERM";
  }
};

const holder = Number(read());
if (holder && holder !== process.pid && alive(holder)) {
  console.error(
    colors(
      "red",
      `A dev server for this project is already running (pid ${holder}).`,
    ),
  );
  console.error(
    colors(
      "white",
      `Stop it first — two of them share one build output and will overwrite each other's work.\n  kill ${holder}    # or delete ${lockFile} if that process is gone`,
    ),
  );
  process.exit(1);
}

fs.writeFileSync(lockFile, me);
process.on("exit", () => read() === me && fs.rmSync(lockFile, { force: true }));
["SIGINT", "SIGTERM", "SIGHUP"].forEach((signal) =>
  process.on(signal, () => process.exit(0)),
);

serve(entryPoint).then(({ server, wsPort, PORT, log, setWsPort }) => {
  const bootAt = Date.now();
  copySrc()
    .then(() => {
      compile(undefined, bootAt).then(() => {
        server.on("error", (e) => {
          if (e.code === "EADDRINUSE") server.listen(++PORT);
        });
        server.listen(PORT, () =>
          console.log(
            log.replace(/port \d+/, "port " + PORT),
            colors("white", `(ready in ${Date.now() - bootAt}ms)`),
          ),
        );

        ["add", "change", "unlink", "unlinkDir"].forEach((event) =>
          watch.on(event, (file) => handleChange(event, file)),
        );
        require("../lib/compiler");

        (function startWs(port) {
          const wss = new WebSocket.Server({ server });
          sockets = wss.clients;
          wss.on("listening", () => setWsPort(port));
          wss.on("error", (e) => {
            if (e.code === "EADDRINUSE") startWs(port + 1);
          });
          wss.on("connection", (ws) =>
            ws.send(JSON.stringify({ msg: "connected" })),
          );
        })(wsPort);
      });
    })
    .catch(console.error);
});

const send = (data) =>
  sockets && sockets.forEach((ws) => ws.send(JSON.stringify(data)));

const logFile = path.resolve(__dirname, "../lib/log.txt");
function getLogs() {
  return fs.existsSync(logFile) ? fs.readFileSync(logFile).toString() : null;
}

function notify() {
  const logs = getLogs();

  send(logs && logs.trim() ? { msg: "warn", data: logs } : { msg: "reload" });
}

const isComp = (dest) =>
  dest.endsWith(".html") &&
  !path.basename(dest).startsWith("_") &&
  dest.startsWith(path.resolve(__dirname, "../src") + path.sep);

function handleChange(event, file) {
  const t0 = Date.now();
  copySrc(event, file)
    .then((dest) => {
      if (dest === null) return compile(undefined, t0).then(notify);
      if (file.endsWith("css")) return send({ msg: "css" });
      if (!event.startsWith("unlink") && isComp(dest))
        return compile(dest, t0).then(notify);
      send({ msg: "reload" });
    })
    .catch(console.error);
}
