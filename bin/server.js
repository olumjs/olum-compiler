const fs = require("fs");
const path = require("path");
const http = require("http");

const jsdom = require("jsdom");
const colors = require("../lib/colors");
const mimes = require("./mimes.json");
let wsPort = 8090;

function handleWsFile() {
  let file = fs.readFileSync(path.resolve(__dirname, "./ws.js")).toString();

  file = "<script>" + file + "</script>";
  return file;
}

function getPath(entry, url) {
  entry = entry.endsWith("/") ? entry : entry + "/";
  url = url.startsWith("/") ? url.slice(1) : url;

  const resolve = (candidate) =>
    [
      path.resolve(entry, candidate),
      path.resolve(entry, "../", candidate),
      path.resolve(process.cwd(), candidate),
      path.resolve(entry, "../../", candidate),
    ].find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) || null;

  const direct = resolve(url);
  if (direct) return direct;

  if (path.extname(url)) {
    const segments = url.split("/");
    for (let i = 1; i < segments.length; i++) {
      const found = resolve(segments.slice(i).join("/"));
      if (found) return found;
    }
  }

  return null;
}

function serve(entry, port, mode = "development") {
  return new Promise((resolve, reject) => {
    const PORT = Number(port || process.env.PORT || 3000);

    const server = http.createServer(handler);
    function handler(req, res) {
      const urlPath = req.url.split("?")[0];

      function serveIndex() {
        let indexPath = entry + "/index.html";
        if (!fs.existsSync(indexPath)) indexPath = entry + "/index.htm";

        fs.readFile(indexPath, (err, content) => {
          if (err) {
            res.writeHead(500, { "content-type": "text/plain" });
            res.end("index.html not found");
            return reject(err);
          }
          const dom = new jsdom.JSDOM(content.toString()).window.document;
          const html = dom.querySelector("html");
          if (mode == "development") {
            const wsContent = handleWsFile();
            dom.body.insertAdjacentHTML("beforeend", wsContent);
          }
          res.writeHead(200, {
            "content-type": "text/html",
            "cache-control": "no-cache",
          });
          res.end("<!DOCTYPE html>" + html.outerHTML);
        });
      }

      if (urlPath === "/") return serveIndex();

      const finalPath = getPath(entry, urlPath);
      if (finalPath && fs.statSync(finalPath).isFile()) {
        const ext = path.extname(finalPath).toLowerCase();
        const obj = mimes.find((item) => ext === item.ext.toLowerCase());
        const mime = obj ? obj.mime : "application/octet-stream";
        const size = fs.statSync(finalPath).size;

        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
        if (range && (range[1] || range[2])) {
          const start = range[1]
            ? parseInt(range[1], 10)
            : size - parseInt(range[2], 10);
          const end =
            range[1] && range[2]
              ? Math.min(parseInt(range[2], 10), size - 1)
              : size - 1;
          if (start >= size || start < 0 || start > end) {
            res.writeHead(416, { "Content-Range": "bytes */" + size });
            return res.end();
          }
          res.writeHead(206, {
            "Content-Type": mime,
            "Content-Range": "bytes " + start + "-" + end + "/" + size,
            "Content-Length": end - start + 1,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
          });
          fs.createReadStream(finalPath, { start, end }).pipe(res);
          return;
        }

        res.writeHead(200, {
          "Content-Type": mime,
          "Content-Length": size,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-cache",
        });
        fs.createReadStream(finalPath).pipe(res);
        return;
      }

      if (!path.extname(urlPath)) return serveIndex();

      res.writeHead(404, { "content-type": "text/plain" });
      res.end("404 Not Found: " + urlPath);
    }
    const log = colors("cyan", "Serving ") + colors("green", "port " + PORT);

    const setWsPort = (port) => {
      wsPort = port;
    };
    resolve({
      server: server,
      wsPort: wsPort,
      PORT: PORT,
      log: log,
      setWsPort: setWsPort,
    });
  });
}

module.exports = serve;
