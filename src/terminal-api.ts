/**
 * Terminal API — PTY management + WebSocket bridge
 *
 * Spawns server-side PTY sessions via node-pty and bridges them
 * to the browser through WebSocket connections.
 *
 * All external types are defined locally so the module compiles without
 * @types/ws or @types/node-pty being installed.
 */

import type { IncomingMessage } from "node:http";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { Duplex } from "node:stream";

// ---------------------------------------------------------------------------
// Minimal interfaces — fully self-contained, no external @types needed
// ---------------------------------------------------------------------------

/** Subset of node-pty's IPty we actually use */
interface IPty {
  onData(cb: (data: string) => void): { dispose(): void };
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose(): void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  readonly pid: number;
}

/** The spawn function from node-pty */
interface INodePty {
  spawn(
    file: string,
    args: string[],
    options: Record<string, unknown>,
  ): IPty;
}

/** Subset of ws.WebSocket we actually use */
interface IWsSocket {
  readonly readyState: number;
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  on(event: "message", cb: (data: Buffer | ArrayBuffer | Buffer[]) => void): this;
  on(event: "close", cb: () => void): this;
  on(event: "error", cb: (err: Error) => void): this;
  on(event: string, cb: (...args: unknown[]) => void): this;
}

/** Subset of ws.WebSocketServer we actually use */
interface IWsServer {
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (client: IWsSocket) => void,
  ): void;
}

/** Shape of the dynamically imported ws module */
interface IWsModule {
  WebSocketServer: new (opts: { noServer: true }) => IWsServer;
}

interface TerminalLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

// ---------------------------------------------------------------------------
// Cached dynamic imports
//
// When OpenClaw loads plugins via jiti, bare `import("ws")` / `import("node-pty")`
// resolve from the *gateway's* node_modules, not the plugin's. So the plugin's
// own dependencies are invisible. We use `createRequire` anchored at this file's
// location to force resolution from the plugin's own node_modules, then fall back
// to a bare dynamic import() for environments where it works natively.
//
// String variables (WS_PKG, PTY_PKG) dodge TS static module resolution so the
// project compiles cleanly even when these packages aren't installed locally.
// ---------------------------------------------------------------------------

let _pty: INodePty | null = null;
let _ptyPromise: Promise<boolean> | null = null;

let _wsModule: IWsModule | null = null;
let _wsPromise: Promise<IWsModule> | null = null;

// String variables dodge TS module resolution for dynamic import()
const WS_PKG: string = "ws";
const PTY_PKG: string = "node-pty";

/**
 * Try to load a native/CJS module using multiple resolution strategies.
 * Each strategy is tried in order; all failures are logged so we can
 * actually diagnose what's going wrong under jiti.
 */
async function pluginImport(
  pkg: string,
  logger: TerminalLogger,
): Promise<Record<string, unknown>> {
  const errors: string[] = [];

  // Strategy 1: createRequire anchored at this source file
  // Under jiti, import.meta.url should point to the plugin's source file,
  // so require() will resolve from the plugin's own node_modules.
  try {
    const req = createRequire(import.meta.url);
    logger.debug(`Terminal: trying createRequire(${import.meta.url}).resolve("${pkg}")`);
    const resolved = req.resolve(pkg);
    logger.debug(`Terminal: resolved ${pkg} → ${resolved}`);
    const mod = req(pkg);
    return typeof mod === "object" && mod !== null
      ? (mod as Record<string, unknown>)
      : { default: mod };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`createRequire(import.meta.url): ${msg}`);
  }

  // Strategy 2: createRequire anchored at process.cwd()
  // Falls back to wherever the gateway process was started from.
  try {
    const cwdUrl = `file://${process.cwd()}/package.json`;
    const req = createRequire(cwdUrl);
    logger.debug(`Terminal: trying createRequire(${cwdUrl})("${pkg}")`);
    const mod = req(pkg);
    return typeof mod === "object" && mod !== null
      ? (mod as Record<string, unknown>)
      : { default: mod };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`createRequire(cwd): ${msg}`);
  }

  // Strategy 3: bare dynamic import()
  // Works in native ESM / standard Node but usually fails under jiti
  // for packages not in the gateway's own node_modules.
  try {
    logger.debug(`Terminal: trying dynamic import("${pkg}")`);
    const mod = await (import(pkg) as Promise<Record<string, unknown>>);
    return mod;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`import(): ${msg}`);
  }

  // Strategy 4: try well-known global node_modules paths directly
  // (for packages installed with npm install -g)
  const globalPaths = [
    `/usr/lib/node_modules/${pkg}`,
    `/usr/local/lib/node_modules/${pkg}`,
  ];
  for (const gp of globalPaths) {
    try {
      logger.debug(`Terminal: trying direct require("${gp}")`);
      const req = createRequire(import.meta.url);
      const mod = req(gp);
      return typeof mod === "object" && mod !== null
        ? (mod as Record<string, unknown>)
        : { default: mod };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`global(${gp}): ${msg}`);
    }
  }

  // All strategies failed — throw with full diagnostic info
  throw new Error(
    `Cannot load "${pkg}" — tried ${errors.length} strategies:\n  ` +
    errors.join("\n  "),
  );
}

function loadPty(logger: TerminalLogger): Promise<boolean> {
  if (_ptyPromise) return _ptyPromise;
  _ptyPromise = pluginImport(PTY_PKG, logger).then(
    (mod) => {
      _pty = (mod.default ?? mod) as unknown as INodePty;
      logger.info("Terminal: node-pty loaded successfully");
      return true;
    },
    (err) => {
      logger.warn(
        `Terminal: node-pty not available — ${err instanceof Error ? err.message : err}`,
      );
      return false;
    },
  );
  return _ptyPromise;
}

function loadWs(logger: TerminalLogger): Promise<IWsModule> {
  if (_wsPromise) return _wsPromise;
  _wsPromise = pluginImport(WS_PKG, logger).then((mod) => {
    // Hunt for WebSocketServer across all possible jiti/ESM/CJS interop shapes
    const candidates = [
      mod,
      mod.default,
      (mod.default as any)?.default,
      (mod as any).WebSocketServer ? mod : null,
    ].filter(Boolean);

    for (const c of candidates) {
      if (typeof (c as any).WebSocketServer === "function") {
        _wsModule = c as unknown as IWsModule;
        return _wsModule;
      }
    }

    // Last resort: ws CJS exports WebSocketServer as a named export
    // but jiti may hoist it as Server
    for (const c of candidates) {
      if (typeof (c as any).Server === "function") {
        const shim = { WebSocketServer: (c as any).Server } as unknown as IWsModule;
        _wsModule = shim;
        return _wsModule;
      }
    }

    const allKeys = candidates.map((c) => Object.keys(c as object).join(", ")).join(" | ");
    throw new Error(`ws module loaded but WebSocketServer not found (keys: ${allKeys})`);
  });
  _wsPromise.catch((err) =>
    logger.error(`Terminal: failed to load ws — ${err}`),
  );
  return _wsPromise;
}

// WebSocket readyState constants (avoids needing the class at all)
const WS_OPEN = 1;

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createTerminalManager(
  logger: TerminalLogger,
  workspaceDir: string,
) {
  // Start loading both modules eagerly so they're warm by the time a
  // connection arrives.
  loadPty(logger);
  loadWs(logger);

  // ---- per-connection handler ------------------------------------------

  async function handleConnection(socket: IWsSocket): Promise<void> {
    const available = await loadPty(logger);
    if (!available || !_pty) {
      socket.send(
        "\r\n\x1b[1;31m node-pty is not installed. Terminal is unavailable.\x1b[0m\r\n" +
          "\x1b[90m Run: npm install node-pty\x1b[0m\r\n",
      );
      socket.close(1011, "node-pty not available");
      return;
    }

    const shell =
      process.env.SHELL ||
      (process.platform === "win32" ? "powershell.exe" : "/bin/bash");

    let proc: IPty;
    try {
      proc = _pty.spawn(shell, [], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: workspaceDir,
        env: process.env,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      socket.send(
        `\r\n\x1b[1;31mFailed to spawn terminal: ${msg}\x1b[0m\r\n`,
      );
      socket.close(1011, "PTY spawn failed");
      return;
    }

    logger.debug(
      `Terminal: PTY spawned pid=${proc.pid} shell=${shell} cwd=${workspaceDir}`,
    );

    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      try {
        proc.kill();
      } catch {
        /* already exited */
      }
    }

    // PTY → browser
    proc.onData((data) => {
      try {
        if (socket.readyState === WS_OPEN) socket.send(data);
      } catch {
        /* socket closed between check and send */
      }
    });

    proc.onExit(({ exitCode }) => {
      logger.debug(`Terminal: PTY pid=${proc.pid} exited code=${exitCode}`);
      try {
        if (socket.readyState === WS_OPEN) {
          socket.send(
            `\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`,
          );
          socket.close(1000, "PTY exited");
        }
      } catch {
        /* already closed */
      }
    });

    // browser → PTY
    socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const msg = Buffer.isBuffer(raw) ? raw.toString() : String(raw);

      // JSON control messages (e.g. resize)
      if (msg.startsWith("{")) {
        try {
          const ctrl = JSON.parse(msg) as {
            type?: string;
            cols?: number;
            rows?: number;
          };
          if (
            ctrl.type === "resize" &&
            typeof ctrl.cols === "number" &&
            typeof ctrl.rows === "number"
          ) {
            proc.resize(
              Math.max(1, Math.floor(ctrl.cols)),
              Math.max(1, Math.floor(ctrl.rows)),
            );
            return;
          }
        } catch {
          /* not valid JSON — fall through to write */
        }
      }

      proc.write(msg);
    });

    socket.on("close", () => {
      logger.debug(`Terminal: WebSocket closed, killing PTY pid=${proc.pid}`);
      cleanup();
    });

    socket.on("error", (err: Error) => {
      logger.error(`Terminal: WebSocket error — ${err.message}`);
      cleanup();
    });
  }

  // ---- standalone WebSocket server on a side port -----------------------
  // The gateway's upgrade handler catches ALL WebSocket connections before
  // plugins can intercept them, so we spin up our own HTTP server on a
  // separate port dedicated to the terminal WebSocket.

  const TERMINAL_WS_PORT = 18790;
  let wsServerStarted = false;
  let wsReady = false;

  async function startWsServer(): Promise<void> {
    if (wsServerStarted) return;
    wsServerStarted = true;

    let wsmod: IWsModule;
    try {
      wsmod = await loadWs(logger);
    } catch (err) {
      logger.error(`Terminal: cannot load ws — ${err}`);
      wsServerStarted = false;
      return;
    }

    const wss = new wsmod.WebSocketServer({ noServer: true });

    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("terminal ws endpoint");
    });

    server.on(
      "upgrade",
      (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (socket.destroyed) return;
        wss.handleUpgrade(req, socket, head, (wsSocket) => {
          handleConnection(wsSocket);
        });
      },
    );

    server.listen(TERMINAL_WS_PORT, "127.0.0.1", () => {
      wsReady = true;
      logger.info(`Terminal: WebSocket server listening on ws://127.0.0.1:${TERMINAL_WS_PORT}`);
    });

    server.on("error", (err: Error) => {
      logger.error(`Terminal: WebSocket server error — ${err.message}`);
      wsReady = false;
      wsServerStarted = false;
    });
  }

  // Start WS server eagerly so it's ready before any browser connects.
  // Previously this was lazy (triggered on first HTTP request), causing a
  // race where the page loaded before the WS server was listening.
  startWsServer();

  // ---- public API -------------------------------------------------------

  return {
    /** The port the terminal WebSocket server listens on. */
    wsPort: TERMINAL_WS_PORT,

    /** Returns true if node-pty is installed and loaded. */
    isAvailable(): Promise<boolean> {
      return loadPty(logger);
    },

    /** Returns status information for the /terminal/status endpoint. */
    async getStatus(): Promise<{
      wsPort: number;
      wsReady: boolean;
      ptyAvailable: boolean;
    }> {
      const ptyAvailable = await loadPty(logger);
      return {
        wsPort: TERMINAL_WS_PORT,
        wsReady,
        ptyAvailable,
      };
    },
  };
}
