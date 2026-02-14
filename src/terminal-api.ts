/**
 * Terminal API — PTY management + WebSocket bridge
 *
 * Spawns server-side PTY sessions via node-pty and bridges them
 * to the browser through WebSocket connections.
 */

import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";

// ---------------------------------------------------------------------------
// Minimal interfaces — avoids hard dependency on @types/node-pty
// ---------------------------------------------------------------------------

interface IPty {
  onData(cb: (data: string) => void): { dispose(): void };
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose(): void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  readonly pid: number;
}

interface INodePty {
  spawn(
    file: string,
    args: string[],
    options: Record<string, unknown>,
  ): IPty;
}

interface TerminalLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

// ---------------------------------------------------------------------------
// Cached dynamic imports (lazy-loaded so the plugin works even if deps are
// missing — the rest of Better Gateway keeps running)
// ---------------------------------------------------------------------------

let _pty: INodePty | null = null;
let _ptyPromise: Promise<boolean> | null = null;

let _wsModule: typeof import("ws") | null = null;
let _wsPromise: Promise<typeof import("ws")> | null = null;

function loadPty(logger: TerminalLogger): Promise<boolean> {
  if (_ptyPromise) return _ptyPromise;
  _ptyPromise = import("node-pty").then(
    (mod) => {
      _pty = (mod.default ?? mod) as unknown as INodePty;
      logger.info("Terminal: node-pty loaded");
      return true;
    },
    () => {
      logger.warn("Terminal: node-pty not available — install it for terminal support");
      return false;
    },
  );
  return _ptyPromise;
}

function loadWs(): Promise<typeof import("ws")> {
  if (_wsPromise) return _wsPromise;
  _wsPromise = import("ws").then((mod) => {
    _wsModule = mod;
    return mod;
  });
  return _wsPromise;
}

// WebSocket readyState constants (avoid import dependency)
const WS_OPEN = 1;

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createTerminalManager(logger: TerminalLogger, workspaceDir: string) {
  let serverAttached = false;

  // Start loading both modules eagerly so they're warm by the time a
  // connection arrives.
  loadPty(logger);
  loadWs().catch((err) =>
    logger.error(`Terminal: failed to load ws module — ${err}`),
  );

  // ---- per-connection handler ------------------------------------------

  async function handleConnection(
    socket: import("ws").WebSocket,
  ): Promise<void> {
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

    let ws: typeof import("ws");
    try {
      ws = await loadWs();
    } catch (err) {
      logger.error(`Terminal: cannot load ws — ${err}`);
      return;
    }

    const wss = new ws.WebSocketServer({ noServer: true });

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
