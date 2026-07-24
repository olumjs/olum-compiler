const serve = require("./server");
const colors = require("../lib/colors");
const path = require("path");

const cwd = process.cwd();
const root = cwd.replace(/\/module$/, "");
const outDir = path.resolve(root, "dist");

serve(outDir, undefined, "production").then(({ server, PORT, log }) => {
  const bootAt = Date.now();
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") server.listen(++PORT);
  });
  server.listen(PORT, () =>
    console.log(
      log.replace(/port \d+/, "port " + PORT),
      colors("white", `(ready in ${Date.now() - bootAt}ms)`),
    ),
  );
});
