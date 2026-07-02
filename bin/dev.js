const serve = require("./server");
const watch = require("./watcher");
const compile = require("./compiler");
const copySrc = require("./copySrc");
const WebSocket = require("../lib/websocket");
const path = require("path");
const fs = require("fs");

let instance;
const entryPoint = path.resolve(__dirname, "../public");
serve(entryPoint).then(({ server, wsPort, PORT, log, setWsPort }) => {
  // initial compiling
  copySrc().then(() => {
    compile().then(() => {
      // EADDRINUSE is emitted as an 'error' event (not thrown), so retry on the next port
      server.on("error", (e) => { if (e.code === "EADDRINUSE") server.listen(++PORT); });
      server.listen(PORT, () => console.log(log.replace(/:\d+/, ":" + PORT)));

      // Listen for adds, edits and deletes. Editors that save atomically
      // (temp file + rename) surface edits as unlink+add rather than change,
      // so watching only "change" misses new files and many edits.
      watch.on("add", handleChange);
      watch.on("change", handleChange);
      watch.on("unlink", handleChange);

      (function startWs(port) {
        const wss = new WebSocket.Server({ port });
        wss.on("listening", () => setWsPort(port)); // tell server.js the real ws port to inject
        wss.on("error", (e) => { if (e.code === "EADDRINUSE") startWs(port + 1); });
        wss.on("connection", (ws) => {
          instance = ws;
          ws.send(JSON.stringify({ msg: "connected" }));
        });
      })(wsPort);
    });
  });
});

function getLogs() {
  const logFilePath = path.resolve(__dirname, "../lib/log.txt");
  if (fs.existsSync(logFilePath)) {
    return fs.readFileSync(logFilePath).toString();
  } else {
    return null;
  }
}

function handleChange(file) {
  copySrc()
    .then(() => {
      if (file.endsWith("css") && instance) return instance.send(JSON.stringify({ msg: "css" }));
      compile().then(() => {
        const logs = getLogs();
        if (logs && instance) return instance.send(JSON.stringify({ msg: "warn", data: logs }));
        instance ? instance.send(JSON.stringify({ msg: "reload" })) : null;
      });
    })
    .catch(console.error);
}
