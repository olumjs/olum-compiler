const serve = require("./server");
const watch = require("./watcher");
const compile = require("./compiler");
const copySrc = require("./copySrc");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");

let instance;
const entryPoint = path.resolve(__dirname, "../public");
serve(entryPoint).then(({ server, wsPort, PORT, log }) => {
  // initial compiling
  copySrc().then(() => {
    compile().then(() => {
      server.listen(PORT, () => console.log(log));
      // console.log("initial compiling");
      watch.on("change", handleChange);
      const wss = new WebSocket.Server({ port: wsPort });
      wss.on("connection", (ws) => {
        instance = ws;
        ws.send(JSON.stringify({ msg: "connected" }));
      });
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
