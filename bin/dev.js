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
  // initial compiling
  const bootAt = Date.now(); // Build-line timing covers copy + compile
  copySrc().then(() => {
    compile(undefined, bootAt).then(() => {
      // EADDRINUSE is emitted as an 'error' event (not thrown), so retry on the next port
      server.on("error", (e) => { if (e.code === "EADDRINUSE") server.listen(++PORT); });
      server.listen(PORT, () => console.log(log.replace(/port \d+/, "port " + PORT), colors("white", `(ready in ${Date.now() - bootAt}ms)`))); // boot = clean + copy + first compile + listen; replace keeps the log right after EADDRINUSE port bumps

      // Listen for adds, edits and deletes. Editors that save atomically
      // (temp file + rename) surface edits as unlink+add rather than change,
      // so watching only "change" misses new files and many edits.
      ["add", "change", "unlink", "unlinkDir"].forEach((event) => watch.on(event, (file) => handleChange(event, file)));
      require("../lib/compiler"); // preload jsdom/acorn now so even the first save compiles in-process instantly

      (function startWs(port) {
        // const wss = new WebSocket.Server({ port });
        const wss = new WebSocket.Server({ server }); // using the same server port
        wss.on("listening", () => setWsPort(port)); // tell server.js the real ws port to inject
        wss.on("error", (e) => { if (e.code === "EADDRINUSE") startWs(port + 1); });
        wss.on("connection", (ws) => {
          instance = ws;
          ws.send(JSON.stringify({ msg: "connected" }));
        });
      })(wsPort);
    });
  }).catch(console.error);
});

function getLogs() {
  const logFilePath = path.resolve(__dirname, "../lib/log.txt");
  if (fs.existsSync(logFilePath)) {
    return fs.readFileSync(logFilePath).toString();
  } else {
    return null;
  }
}

const send = (data) => instance && instance.send(JSON.stringify(data)); // push a message to the browser (if one is connected)

// after compiling: surface compiler warnings, otherwise reload the page
function notify() {
  const logs = getLogs(); // warnings written by the compiler child to lib/log.txt
  logs ? send({ msg: "warn", data: logs }) : send({ msg: "reload" }); // warn overlay or plain reload
}

// compilable component: .html under module/src, not a _-partial
const isComp = (dest) => dest.endsWith(".html") && !path.basename(dest).startsWith("_") && dest.startsWith(path.resolve(__dirname, "../src") + path.sep);

// copySrc mirrors the change (or falls back to its full flow), then:
// full flow → compile all / css → hot-swap / component → compile it / else → reload
function handleChange(event, file) {
  const t0 = Date.now(); // Build-line timing covers copy + compile
  copySrc(event, file) // mirror this one change into module/ (dest = mirrored path, null = full flow ran)
    .then((dest) => {
      if (dest === null) return compile(undefined, t0).then(notify); // full rebuild → compile every component
      if (file.endsWith("css")) return send({ msg: "css" }); // css → hot-swap styles, no reload
      if (!event.startsWith("unlink") && isComp(dest)) return compile(dest, t0).then(notify); // component → compile only this file
      send({ msg: "reload" }); // anything else (asset/js/partial/removal) → copy was enough, just reload
    })
    .catch(console.error); // watcher must survive a failed build
}
