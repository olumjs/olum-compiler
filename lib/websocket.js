/**
 * websocket.js — standalone single-file WebSocket server (RFC 6455)
 * Minimal replacement for the `ws` package's server side, using only node
 * built-ins (http, crypto, events). Cross-platform by construction.
 *
 * Covered (same API shape as ws@8.21.0):
 *   const WebSocket = require("./websocket");
 *   const wss = new WebSocket.Server({ port });            // or { server } / { noServer: true }
 *   wss.on("listening" | "connection" | "error" | "close" | "headers", ...)
 *   ws.send(data, [cb]) / ws.ping() / ws.close(code, reason) / ws.terminate()
 *   ws.on("message" | "close" | "error" | "ping" | "pong", ...)
 *
 * Not included: the client-side WebSocket(url) constructor (browsers provide
 * their own) and the permessage-deflate extension (never negotiated, so
 * clients transparently fall back to uncompressed frames per the RFC).
 */
"use strict";

const crypto = require("crypto");
const http = require("http");
const { EventEmitter } = require("events");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"; // fixed magic value from RFC 6455 §1.3
const EMPTY = Buffer.alloc(0);

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

// build one server→client frame: FIN set, no mask (RFC 6455 §5.1: servers must not mask)
function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[1] = 127;
    header.writeUInt32BE(Math.floor(len / 2 ** 32), 2);
    header.writeUInt32BE(len >>> 0, 6);
  }

  header[0] = 0x80 | opcode; // FIN + opcode
  return Buffer.concat([header, payload]);
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(String(data));
}

class WebSocket extends EventEmitter {
  constructor(socket) {
    super();

    this._socket = socket;
    this._buffer = EMPTY;
    this._fragments = [];
    this._fragmentOpcode = 0;
    this._closeSent = false;
    this._closeReceived = false;
    this._closeCode = 1006; // abnormal closure unless a close frame says otherwise
    this._closeReason = EMPTY;
    this.readyState = OPEN;

    socket.setNoDelay(true);
    socket.on("data", chunk => this._parse(chunk));
    // upgraded sockets are half-open: when the peer stops sending without a
    // close frame, end our side too so the tcp socket can actually close
    socket.on("end", () => {
      this.readyState = CLOSING;
      socket.end();
    });
    socket.on("error", err => {
      this.emit("error", err);
      socket.destroy();
    });
    socket.on("close", () => {
      this.readyState = CLOSED;
      this.emit("close", this._closeCode, this._closeReason);
    });
  }

  // ------------------------------------------------------------ outgoing
  send(data, options, cb) {
    if (typeof options === "function") {
      cb = options;
      options = {};
    }

    if (this.readyState !== OPEN) {
      // match ws: sending on a closed socket is a no-op unless a callback wants the error
      if (cb) {
        const err = new Error("WebSocket is not open: readyState " + this.readyState);
        process.nextTick(cb, err);
      }
      return;
    }

    const isBinary = typeof data !== "string";
    this._socket.write(encodeFrame(isBinary ? 0x2 : 0x1, toBuffer(data)), cb);
  }

  ping(data) {
    if (this.readyState === OPEN) this._socket.write(encodeFrame(0x9, toBuffer(data == null ? EMPTY : data)));
  }

  pong(data) {
    if (this.readyState === OPEN) this._socket.write(encodeFrame(0xa, toBuffer(data == null ? EMPTY : data)));
  }

  close(code, reason) {
    if (this.readyState !== OPEN && this.readyState !== CLOSING) return;
    this._sendClose(code === undefined ? 1000 : code, reason == null ? EMPTY : toBuffer(reason));
    // if the client never answers with its own close frame, force-drop the tcp socket
    const timer = setTimeout(() => this._socket.destroy(), 30000);
    if (timer.unref) timer.unref();
  }

  terminate() {
    this._socket.destroy();
  }

  _sendClose(code, reason) {
    if (this._closeSent) return;
    this._closeSent = true;
    this.readyState = CLOSING;

    let payload = EMPTY;
    if (code !== undefined) {
      payload = Buffer.allocUnsafe(2 + reason.length);
      payload.writeUInt16BE(code, 0);
      reason.copy(payload, 2);
    }
    this._socket.write(encodeFrame(0x8, payload));
    // close handshake complete → shut down the tcp stream
    if (this._closeReceived) this._socket.end();
  }

  // ------------------------------------------------------------ incoming
  _abort(code) {
    // protocol violation: send close frame with the given code and cut the connection
    this._closeCode = code;
    this._sendClose(code, EMPTY);
    this._socket.end();
  }

  _parse(chunk) {
    this._buffer = this._buffer.length === 0 ? chunk : Buffer.concat([this._buffer, chunk]);

    while (true) {
      const buf = this._buffer;
      if (buf.length < 2) return;

      const fin = (buf[0] & 0x80) !== 0;
      const rsv = buf[0] & 0x70;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let length = buf[1] & 0x7f;
      let offset = 2;

      // no extension negotiated → RSV bits must be 0; clients must always mask
      if (rsv !== 0 || !masked) return this._abort(1002);

      if (length === 126) {
        if (buf.length < 4) return;
        length = buf.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buf.length < 10) return;
        const length64 = buf.readBigUInt64BE(2);
        if (length64 > BigInt(Number.MAX_SAFE_INTEGER)) return this._abort(1009);
        length = Number(length64);
        offset = 10;
      }

      if (length > 100 * 1024 * 1024) return this._abort(1009); // same default max payload as ws

      if (buf.length < offset + 4 + length) return;
      const mask = buf.slice(offset, offset + 4);
      offset += 4;

      const payload = buf.slice(offset, offset + length);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];

      this._buffer = buf.slice(offset + length);
      this._handleFrame(fin, opcode, payload);
      if (this.readyState === CLOSED) return;
    }
  }

  _handleFrame(fin, opcode, payload) {
    // control frames (§5.5): never fragmented, payload ≤ 125
    if (opcode >= 0x8) {
      if (!fin || payload.length > 125) return this._abort(1002);

      if (opcode === 0x8) {
        this._closeReceived = true;
        let code = 1005; // no status received
        let reason = EMPTY;
        if (payload.length >= 2) {
          code = payload.readUInt16BE(0);
          reason = payload.slice(2);
        } else if (payload.length === 1) {
          return this._abort(1002);
        }
        this._closeCode = code === 1005 ? 1000 : code;
        this._closeReason = reason;
        this._sendClose(payload.length >= 2 ? code : undefined, reason); // echo close per §5.5.1
        this._socket.end();
      } else if (opcode === 0x9) {
        this.pong(payload); // §5.5.2: a ping must be answered with an identical pong
        this.emit("ping", payload);
      } else if (opcode === 0xa) {
        this.emit("pong", payload);
      } else {
        this._abort(1002);
      }
      return;
    }

    // data frames: 0x1 text, 0x2 binary, 0x0 continuation of a fragmented message
    if (opcode === 0x1 || opcode === 0x2) {
      if (this._fragments.length > 0) return this._abort(1002); // new message before finishing the last
      if (fin) return this.emit("message", payload, opcode === 0x2);
      this._fragmentOpcode = opcode;
      this._fragments.push(payload);
    } else if (opcode === 0x0) {
      if (this._fragments.length === 0) return this._abort(1002); // continuation with nothing to continue
      this._fragments.push(payload);
      if (fin) {
        const message = Buffer.concat(this._fragments);
        const isBinary = this._fragmentOpcode === 0x2;
        this._fragments = [];
        this.emit("message", message, isBinary);
      }
    } else {
      this._abort(1002); // unknown opcode
    }
  }
}

WebSocket.CONNECTING = CONNECTING;
WebSocket.OPEN = OPEN;
WebSocket.CLOSING = CLOSING;
WebSocket.CLOSED = CLOSED;

class WebSocketServer extends EventEmitter {
  constructor(options = {}, callback) {
    super();

    this.clients = new Set();

    if (options.server) {
      this._server = options.server;
      this._ownServer = false;
    } else if (options.noServer) {
      this._server = null;
      this._ownServer = false;
    } else {
      // plain http requests get the same answer ws gives: 426 Upgrade Required
      this._server = http.createServer((req, res) => {
        const body = http.STATUS_CODES[426];
        res.writeHead(426, { "Content-Length": body.length, "Content-Type": "text/plain" });
        res.end(body);
      });
      this._ownServer = true;
      this._server.listen(options.port, options.host, options.backlog, callback);
    }

    if (this._server) {
      this._server.on("listening", () => this.emit("listening"));
      this._server.on("error", err => this.emit("error", err));
      this._server.on("upgrade", (req, socket, head) => {
        this.handleUpgrade(req, socket, head, ws => this.emit("connection", ws, req));
      });
    }
  }

  address() {
    return this._server && this._server.address();
  }

  handleUpgrade(req, socket, head, callback) {
    socket.on("error", () => socket.destroy());

    const key = req.headers["sec-websocket-key"];
    const version = +req.headers["sec-websocket-version"];
    const upgrade = (req.headers.upgrade || "").split(/, */).some(p => p.toLowerCase() === "websocket");

    if (req.method !== "GET" || !upgrade || !key || (version !== 13 && version !== 8)) {
      const body = http.STATUS_CODES[400];
      socket.write(
        "HTTP/1.1 400 Bad Request\r\n" +
          "Connection: close\r\n" +
          "Content-Type: text/plain\r\n" +
          `Content-Length: ${body.length}\r\n\r\n` +
          body
      );
      socket.destroy();
      return;
    }

    // RFC 6455 §4.2.2: accept key proves the server actually speaks websocket
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    const headers = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
    ];

    this.emit("headers", headers, req);
    socket.write(headers.concat("\r\n").join("\r\n"));

    const ws = new WebSocket(socket);
    if (head && head.length > 0) ws._parse(head); // bytes the client sent before we attached

    this.clients.add(ws);
    ws.on("close", () => this.clients.delete(ws));
    callback(ws);
  }

  close(cb) {
    for (const ws of this.clients) ws.terminate();
    const done = () => {
      this.emit("close");
      if (cb) cb();
    };
    if (this._ownServer) this._server.close(done);
    else process.nextTick(done);
  }
}

module.exports = WebSocket;
module.exports.WebSocket = WebSocket;
module.exports.Server = WebSocketServer;
module.exports.WebSocketServer = WebSocketServer;
