const path = require("path");
const spawn = require("../lib/cross-spawn");
const script = process.argv[2];

if (script == "dev") process.env.NODE_ENV = "development";
else if (script == "build") process.env.NODE_ENV = "production";

if (typeof script !== undefined && ["dev", "build"].includes(script)) {
  const result = spawn.sync("node", [path.resolve(__dirname, script + ".js")], {
    stdio: "inherit",
  });

  if (result.signal) {
    if (result.signal === "SIGKILL" || result.signal === "SIGTERM")
      console.log("Failed to run " + script + " script!");
    process.exit(1);
  }

  process.exit(result.status);
}
