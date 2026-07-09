(() => {
  if ("WebSocket" in window) {
    const parse = str => str.replace(/>/g, "&gt;").replace(/</g, "&lt;");
    const interval = 500;
    const maxAttempts = 30;
    let attempts = 0;
    const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    // const socketUrl = `${wsProtocol}//${location.hostname}:{{port}}`;
    const socketUrl = `${wsProtocol}//${location.host}`;   // removing port so it uses the server port
    let socket = new WebSocket(socketUrl);

    socket.onmessage = function (res) {
      const obj = JSON.parse(res.data);
      if (obj.msg === "connected") enabled();
      if (obj.msg === "reload") window.location.reload();
      else if (obj.msg === "css") css();
      else if (obj.msg === "warn") {
        const stderr = obj.data.trim();
        const arr = stderr.split("<<Olum Warning>>");
        const markup = arr
          .map(item => {
            if (item.trim() !== "") return `<pre style="border-bottom: 1px solid #ccc; padding-bottom:10px;">${parse(item)}</pre>`;
          })
          .join("");
        document.body.innerHTML = markup;
      }
    };

    function enabled() {
      let key = "IS_FIRST_TIME_OLUM_HOT_RELOAD";
      if (sessionStorage && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, true);
        // if (olum) olum.logs.log("Olum hot-reload enabled.");
        // else console.log("Olum hot-reload enabled.");
        console.log("Olum hot-reload enabled.");
      }
    }

    function css() {
      const sheets = document.querySelectorAll("link[rel='stylesheet']");
      sheets.forEach(sheet => sheet.replaceWith(sheet));
    }

    socket.addEventListener("close", () => {
      const reloadIfCanConnect = () => {
        attempts++;
        if (attempts > maxAttempts) return console.error("Could not reconnect to dev server.");
        socket = new WebSocket(socketUrl);
        socket.addEventListener("error", () => setTimeout(reloadIfCanConnect, interval));
      };
      reloadIfCanConnect();
    });
  } else {
    console.error("Upgrade your browser. This Browser is doesn't support WebSocket for Live-Reloading.");
  }
})();
