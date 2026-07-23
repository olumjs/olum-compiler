"use strict";

const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

const SCAN_DEBOUNCE = 25;
const ROOT_POLL = 1000;

function normalizeIgnored(ignored) {
  if (!ignored) return () => false;
  const list = Array.isArray(ignored) ? ignored : [ignored];
  return (p) =>
    list.some((entry) => {
      if (typeof entry === "function") return entry(p);
      if (entry instanceof RegExp) return entry.test(p);
      return p === entry || p.startsWith(entry + path.sep);
    });
}

class FSWatcher extends EventEmitter {
  constructor(paths, options = {}) {
    super();

    this._persistent = options.persistent !== false;
    this._ignoreInitial = !!options.ignoreInitial;
    this._ignored = normalizeIgnored(options.ignored);

    const awf = options.awaitWriteFinish;

    this._awf = awf
      ? {
          threshold: awf.stabilityThreshold || 2000,
          poll: awf.pollInterval || 100,
        }
      : null;

    this._roots = (Array.isArray(paths) ? paths : [paths]).map((p) =>
      path.resolve(p),
    );
    this._watchers = new Map();
    this._snapshots = new Map();
    this._scanTimers = new Map();
    this._pending = new Map();
    this._rootTimers = new Map();
    this._realPaths = new Set();
    this._realByDir = new Map();
    this._closed = false;

    process.nextTick(() => {
      if (this._closed) return;
      for (const root of this._roots) this._addRoot(root, true);
      this.emit("ready");
    });
  }

  _addRoot(root, isInitial) {
    let stat;
    try {
      stat = fs.statSync(root);
    } catch (e) {
      this._waitForRoot(root);
      return;
    }
    if (stat.isDirectory()) {
      if (!(isInitial && this._ignoreInitial)) this.emit("addDir", root);
      this._watchDir(root, isInitial);
    } else this._watchDir(path.dirname(root), isInitial, root);
  }

  _waitForRoot(root) {
    if (this._closed || this._rootTimers.has(root)) return;
    const timer = setInterval(() => {
      if (fs.existsSync(root)) {
        clearInterval(timer);
        this._rootTimers.delete(root);
        this._addRoot(root, false);
      }
    }, ROOT_POLL);
    if (!this._persistent && timer.unref) timer.unref();
    this._rootTimers.set(root, timer);
  }

  _watchDir(dir, isInitial, onlyFile) {
    if (this._closed || this._watchers.has(dir) || this._ignored(dir)) return;

    let real;
    try {
      real = fs.realpathSync(dir);
    } catch (e) {
      return;
    }
    if (this._realPaths.has(real)) return;
    this._realPaths.add(real);
    this._realByDir.set(dir, real);

    let watcher;
    try {
      watcher = fs.watch(dir, { persistent: this._persistent });
    } catch (err) {
      this.emit("error", err);
      return;
    }

    watcher.on("error", () => watcher.close());
    watcher.on("change", () => this._scheduleScan(dir));

    this._watchers.set(dir, watcher);
    this._snapshots.set(dir, new Map());
    if (onlyFile) this._onlyFile = onlyFile;
    this._rescan(dir, isInitial);
  }

  _scheduleScan(dir) {
    if (this._closed || this._scanTimers.has(dir)) return;
    this._scanTimers.set(
      dir,
      setTimeout(() => {
        this._scanTimers.delete(dir);
        this._rescan(dir, false);
      }, SCAN_DEBOUNCE),
    );
  }

  _rescan(dir, isInitial) {
    if (this._closed || !this._snapshots.has(dir)) return;

    let names;
    try {
      names = fs.readdirSync(dir);
    } catch (e) {
      this._teardownDir(dir, true);
      if (this._roots.includes(dir)) this._waitForRoot(dir);
      return;
    }

    const old = this._snapshots.get(dir);
    const next = new Map();

    for (const name of names) {
      const full = path.join(dir, name);
      if (this._ignored(full)) continue;

      let stat;
      try {
        stat = fs.statSync(full);
      } catch (e) {
        continue;
      }

      const entry = {
        isDir: stat.isDirectory(),
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      };
      next.set(name, entry);

      const prev = old.get(name);
      const silent = isInitial && this._ignoreInitial;

      if (!prev) {
        if (entry.isDir) {
          if (!silent) this.emit("addDir", full);
          this._watchDir(full, isInitial);
        } else if (!silent) {
          this._settle(full, "add");
        }
      } else if (prev.isDir !== entry.isDir) {
        if (prev.isDir) this._teardownDir(full, true);
        else this.emit("unlink", full);
        if (entry.isDir) {
          this.emit("addDir", full);
          this._watchDir(full, false);
        } else {
          this._settle(full, "add");
        }
      } else if (
        !entry.isDir &&
        (prev.mtimeMs !== entry.mtimeMs || prev.size !== entry.size)
      ) {
        this._settle(full, "change");
      }
    }

    for (const [name, prev] of old) {
      if (next.has(name)) continue;
      const full = path.join(dir, name);
      if (prev.isDir) this._teardownDir(full, true);
      else this._dropFile(full);
    }

    this._snapshots.set(dir, next);
  }

  _dropFile(file) {
    const pending = this._pending.get(file);
    if (pending) {
      clearInterval(pending.timer);
      this._pending.delete(file);

      if (pending.event === "add") return;
    }
    this.emit("unlink", file);
  }

  _teardownDir(dir, emitEvents) {
    const watcher = this._watchers.get(dir);
    if (watcher) watcher.close();
    this._watchers.delete(dir);

    const real = this._realByDir.get(dir);
    if (real !== undefined) {
      this._realPaths.delete(real);
      this._realByDir.delete(dir);
    }

    const timer = this._scanTimers.get(dir);
    if (timer) clearTimeout(timer);
    this._scanTimers.delete(dir);

    const snapshot = this._snapshots.get(dir);
    this._snapshots.delete(dir);
    if (!snapshot) return;

    for (const [name, entry] of snapshot) {
      const full = path.join(dir, name);
      if (entry.isDir) this._teardownDir(full, emitEvents);
      else if (emitEvents) this._dropFile(full);
    }
    if (emitEvents) this.emit("unlinkDir", dir);
  }

  _settle(file, event) {
    if (this._onlyFile && file !== this._onlyFile) return;

    if (!this._awf) return this.emit(event, file);

    const existing = this._pending.get(file);
    if (existing) {
      existing.stableSince = Date.now();
      return;
    }

    const state = {
      event,
      stableSince: Date.now(),
      mtimeMs: -1,
      size: -1,
      timer: null,
    };
    state.timer = setInterval(() => {
      let stat;
      try {
        stat = fs.statSync(file);
      } catch (e) {
        clearInterval(state.timer);
        this._pending.delete(file);
        return;
      }
      if (stat.mtimeMs !== state.mtimeMs || stat.size !== state.size) {
        state.mtimeMs = stat.mtimeMs;
        state.size = stat.size;
        state.stableSince = Date.now();
        return;
      }
      if (Date.now() - state.stableSince >= this._awf.threshold) {
        clearInterval(state.timer);
        this._pending.delete(file);
        this.emit(state.event, file);
      }
    }, this._awf.poll);
    this._pending.set(file, state);
  }

  close() {
    this._closed = true;
    for (const watcher of this._watchers.values()) watcher.close();
    for (const timer of this._scanTimers.values()) clearTimeout(timer);
    for (const state of this._pending.values()) clearInterval(state.timer);
    for (const timer of this._rootTimers.values()) clearInterval(timer);
    this._watchers.clear();
    this._scanTimers.clear();
    this._pending.clear();
    this._rootTimers.clear();
    this._snapshots.clear();
    this._realPaths.clear();
    this._realByDir.clear();
    return Promise.resolve();
  }
}

module.exports = {
  watch: (paths, options) => new FSWatcher(paths, options),
  FSWatcher,
};
