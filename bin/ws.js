(() => {
  if (!("WebSocket" in window))
    return console.error(
      "Upgrade your browser. This Browser is doesn't support WebSocket for Live-Reloading.",
    );

  const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
  const esc = (str) => str.replace(/>/g, "&gt;").replace(/</g, "&lt;");
  const retry = 500;
  const maxAttempts = 30;
  let attempts = 0;
  let dropped = false;

  const show = (data) => {
    const blocks = data
      .split("<<Olum Warning>>")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!blocks.length) return;

    const box =
      document.getElementById("olum-warning") ||
      document.body.appendChild(document.createElement("div"));
    box.id = "olum-warning";
    box.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:2147483001;max-height:60vh;overflow:auto;padding:12px 16px;" +
      "background:#1c1917;color:#fde68a;box-shadow:0 2px 12px rgba(0,0,0,.35);font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace";
    box.innerHTML =
      '<button style="float:right;border:0;background:none;color:inherit;font:inherit;cursor:pointer">dismiss ✕</button>' +
      blocks
        .map(
          (item) =>
            `<pre style="margin:0 0 8px;white-space:pre-wrap">${esc(item)}</pre>`,
        )
        .join("");
    box.querySelector("button").onclick = () => box.remove();
  };

  const enabled = () => {
    const key = "IS_FIRST_TIME_OLUM_HOT_RELOAD";
    if (!sessionStorage || sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, true);
    console.log("Olum hot-reload enabled.");
  };

  const attach = (socket) => {
    socket.onopen = () => (dropped ? location.reload() : (attempts = 0));
    socket.onmessage = (event) => {
      const { msg, data } = JSON.parse(event.data);
      if (msg === "connected") enabled();
      else if (msg === "reload") location.reload();
      else if (msg === "css")
        document
          .querySelectorAll("link[rel='stylesheet']")
          .forEach((sheet) => sheet.replaceWith(sheet));
      else if (msg === "warn") show(data);
    };
    socket.onclose = () => {
      dropped = true;
      if (++attempts > maxAttempts)
        return console.error("Could not reconnect to dev server.");
      setTimeout(() => attach(new WebSocket(url)), retry);
    };
  };

  attach(new WebSocket(url));
})();
