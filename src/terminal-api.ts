/**
 * Terminal API — PTY management + WebSocket bridge
 *
 * Spawns server-side PTY sessions via node-pty and bridges them
 * to the browser through WebSocket connections.
 *
 * All external types are defined locally so the module compiles without
 * @types/ws or @types/node-pty being installed.
 */

import type { IncomingMessage, Server } from "node:http";
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
// Cached dynamic imports — using string variables so TypeScript does NOT try
// to resolve the module at compile time. This lets us compile cleanly even
// when ws / node-pty aren't installed (or have no type declarations).
// ---------------------------------------------------------------------------

let _pty: INodePty | null = null;
let _ptyPromise: Promise<boolean> | null = null;

let _wsModule: IWsModule | null = null;
let _wsPromise: Promise<IWsModule> | null = null;

// String variables dodge TS module resolution for dynamic import()
const WS_PKG: string = "ws";
const PTY_PKG: string = "node-pty";

function loadPty(logger: TerminalLogger): Promise<boolean> {
  if (_ptyPromise) return _ptyPromise;
  _ptyPromise = import(PTY_PKG).then(
    (mod: Record<string, unknown>) => {
      _pty = (mod.default ?? mod) as unknown as INodePty;
      logger.info("Terminal: node-pty loaded");
      return true;
    },
    () => {
      logger.warn(
        "Terminal: node-pty not available — install it for terminal support",
      );
      return false;
    },
  );
  return _ptyPromise;
}

function loadWs(logger: TerminalLogger): Promise<IWsModule> {
  if (_wsPromise) return _wsPromise;
  _wsPromise = import(WS_PKG).then((mod: Record<string, unknown>) => {
    const wsmod = (mod.default ?? mod) as unknown as IWsModule;
    _wsModule = wsmod;
    return wsmod;
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
  let serverAttached = false;

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

  // ---- server attachment ------------------------------------------------

  async function attachToServer(server: Server): Promise<void> {
    if (serverAttached) return;
    serverAttached = true;

    let wsmod: IWsModule;
    try {
      wsmod = await loadWs(logger);
    } catch (err) {
      logger.error(`Terminal: cannot load ws — ${err}`);
      return;
    }

    const wss = new wsmod.WebSocketServer({ noServer: true });

    server.on(
      "upgrade",
      (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "localhost"}`,
        );
        if (url.pathname !== "/better-gateway/terminal/ws") return;
        if (socket.destroyed) return;

        wss.handleUpgrade(req, socket, head, (wsSocket) => {
          handleConnection(wsSocket);
        });
      },
    );

    logger.info("Terminal: WebSocket upgrade handler registered");
  }

  // ---- public API -------------------------------------------------------

  return {
    /**
     * Call from any HTTP handler to lazily attach the WebSocket upgrade
     * listener to the underlying HTTP server.
     */
    ensureAttached(req: IncomingMessage): void {
      if (serverAttached) return;
      const sock = req.socket as unknown as { server?: Server } | undefined;
      const srv = sock?.server;
      if (srv) attachToServer(srv);
    },

    /** Returns true if node-pty is installed and loaded. */
    isAvailable(): Promise<boolean> {
      return loadPty(logger);
    },
  };
}
