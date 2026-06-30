const fs = require("fs");
const path = require("path");
const http = require("http");
// const http2 = require("http2");
const jsdom = require("jsdom");
const colors = require("../lib/colors");
const mimes = require("./mimes.json");
const wsPort = 8090;

function handleWsFile() {
  let file = fs.readFileSync(path.resolve(__dirname, "./ws.js")).toString();
  file = file.replace(/{{port}}/, wsPort);
  file = "<script>" + file + "</script>";
  return file;
}

function getPath(entry, url) {
  entry = entry.endsWith("/") ? entry : entry + "/";
  url = url.startsWith("/") ? url.slice(1) : url;

  const paths = [
    path.resolve(entry, url),
    path.resolve(entry, "../", url),
    path.resolve(process.cwd(), url),
  ];

  return paths.find(fs.existsSync) || null;
}
// todo handle https
/**
 *
 * @param {*} entry must be an absolute path
 * @param {*} port optional port, default is 8000
 */
function serve(entry, port) {
  return new Promise((resolve, reject) => {
    const PORT = port ? port : process.env.PORT || 8000;
    const domain = `http://localhost:${PORT}`;

    const server = http.createServer(handler);
    function handler(req, res) {
      const urlPath = req.url.split("?")[0]; // strip query string before resolving

      // serve the (ws-injected) index.html — used for "/" and as the history-mode SPA fallback
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
          const wsContent = handleWsFile();
          dom.body.insertAdjacentHTML("beforeend", wsContent);
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<!DOCTYPE html>" + html.outerHTML);
        });
      }

      if (urlPath === "/") return serveIndex();

      // serve an existing static file with its mime type
      const finalPath = getPath(entry, urlPath);
      if (finalPath && fs.statSync(finalPath).isFile()) {
        const ext = path.extname(finalPath).toLowerCase();
        const obj = mimes.find(item => ext === item.ext.toLowerCase());
        res.writeHead(200, { "Content-Type": obj ? obj.mime : "application/octet-stream" });
        fs.createReadStream(finalPath).pipe(res);
        return;
      }

      // history-mode SPA fallback: a request with no file extension is a client-side route
      // (e.g. /card) — serve index.html and let the olum router handle it. Anything with an
      // extension is a genuinely missing asset, so return a real 404 instead of hanging.
      if (!path.extname(urlPath)) return serveIndex();

      res.writeHead(404, { "content-type": "text/plain" });
      res.end("404 Not Found: " + urlPath);
    }
    const log = colors("cyan", "Serving ") + colors("green", domain);
    resolve({ server: server, wsPort: wsPort, PORT: PORT, log: log });
  });
}

module.exports = serve;
