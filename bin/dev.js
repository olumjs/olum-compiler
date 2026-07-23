const serve = require("./server");
const watch = require("./watcher");
const compile = require("./compiler");
const copySrc = require("./copySrc");
const WebSocket = require("../lib/websocket");
const colors = require("../lib/colors");
const path = require("path");
const fs = require("fs");

let instance;
const entryPoint = path.resolve(__dirname, "../public");
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
          wss.on("listening", () => setWsPort(port));
          wss.on("error", (e) => {
            if (e.code === "EADDRINUSE") startWs(port + 1);
          });
          wss.on("connection", (ws) => {
            instance = ws;
            ws.send(JSON.stringify({ msg: "connected" }));
          });
        })(wsPort);
      });
    })
    .catch(console.error);
});

function getLogs() {
  const logFilePath = path.resolve(__dirname, "../lib/log.txt");
  if (fs.existsSync(logFilePath)) {
    return fs.readFileSync(logFilePath).toString();
  } else {
    return null;
  }
}

const send = (data) => instance && instance.send(JSON.stringify(data));

function notify() {
  const logs = getLogs();
  logs ? send({ msg: "warn", data: logs }) : send({ msg: "reload" });
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
