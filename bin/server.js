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
  let trial_1 = path.resolve(entry + url);
  let trial_2 = path.resolve(entry + "../" + url);
  // console.log("getPath", { entry, url, trial_1, trial_2 });

  if (fs.existsSync(trial_1)) return trial_1;
  else if (fs.existsSync(trial_2)) return trial_2;
  else return null;
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
      if (req.url == "/") {
        let indexPath = entry + "/index.html";
        if (!fs.existsSync(indexPath)) indexPath = entry + "/index.htm";

        fs.readFile(indexPath, (err, content) => {
          if (err) {
            console.log(err);
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
      // handle files paths and mime types
      const finalPath = getPath(entry, req.url);
      if (finalPath) {
        const isFile = fs.statSync(finalPath).isFile();
        if (isFile) {
          const ext = path.extname(finalPath).toLowerCase();
          const obj = mimes.find(item => (ext === item.ext.toLowerCase() ? item : null));
          if (obj) {
            res.writeHead(200, { "Content-Type": obj.mime });
            fs.createReadStream(finalPath).pipe(res);
          }
        }
      }
    }
    const log = colors("cyan", "Serving ") + colors("green", domain);
    resolve({ server: server, wsPort: wsPort, PORT: PORT, log: log });
  });
}

module.exports = serve;
