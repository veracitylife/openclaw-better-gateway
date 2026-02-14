# ISSUES.md — Known Issues & Status

## Terminal Feature (feat/cli-terminal branch)

### 🟢 Gateway intercepts all WebSocket upgrades
**Status:** Resolved — replaced WebSocket with SSE+POST

The OpenClaw gateway's HTTP server has a global `upgrade` handler that catches ALL WebSocket connections before plugins can intercept them. Plugin `registerHttpHandler` only covers HTTP requests, not WS upgrades.

**Previous workaround:** Terminal WebSocket ran on a dedicated side port (18790), requiring users to forward both ports via SSH tunnel — a major usability issue.

**Fix applied:** Replaced the WebSocket transport entirely with **SSE + POST**:
- `GET /better-gateway/terminal/stream` — Server-Sent Events for PTY output (server → browser)
- `POST /better-gateway/terminal/input` — keystrokes (browser → server)
- `POST /better-gateway/terminal/resize` — terminal resize events

All routes go through `registerHttpHandler` on the main gateway port. No second port, no `ws` module, no extra SSH tunnel config.

---

### 🟢 ws module import fails under jiti
**Status:** No longer applicable

The `ws` module has been removed entirely. The terminal now uses SSE+POST over plain HTTP, so there's no WebSocket dependency to resolve under jiti.

---

### 🟡 node-pty required but not bundled
**Status:** Added as optional dependency

Terminal requires `node-pty` for PTY sessions. It's a native module that needs compilation. If missing, the SSE stream sends an `error` event with a clear message — the terminal page shows "node-pty is not installed" instead of a cryptic disconnect.

**Note:** `node-pty` is listed in `optionalDependencies`. Multi-strategy `pluginImport()` tries `createRequire(import.meta.url)`, `createRequire(cwd)`, bare `import()`, and global paths to find it under jiti.

---

### 🟢 Terminal shows "Disconnected" in browser
**Status:** Fixed

The original issue had multiple causes: WebSocket side port not reachable, race conditions, and no diagnostic feedback. All resolved by the SSE+POST rewrite — the terminal now connects over the same port as everything else, and errors are reported inline.

---

### ⚪ Plugin discovery doesn't use installs config
**Status:** Documented / config workaround applied

`plugins.installs` in `openclaw.json` is metadata only — it records where a plugin was installed from but doesn't affect discovery. Plugin discovery scans:
1. `plugins.load.paths` (config)
2. `<workspace>/.openclaw/extensions/`
3. `~/.openclaw/extensions/`
4. Bundled plugins dir

A stale copy in `~/.openclaw/extensions/` will be loaded instead of the dev version. 

**Fix applied:** 
- Deleted stale copy from `/root/.openclaw/extensions/openclaw-better-gateway/`
- Added dev path to `plugins.load.paths` in `openclaw.json`

**Dev workflow:** After `npm run build`, just `systemctl restart openclaw-gateway` — no deploy step needed.

---

### ⚪ Gateway control UI catches all unhandled GET routes
**Status:** Not a bug, but worth knowing

When `controlUi.basePath` is empty (default), the control UI serves `index.html` for any GET path that isn't handled by a prior handler. This is standard SPA behavior. Plugin HTTP handlers run *before* the control UI, so as long as the plugin returns `true`, it works fine.

---

## Architecture Notes

### Request handling order (gateway HTTP)
1. Hooks
2. Tools invoke
3. Slack HTTP
4. **Plugin handlers** (`registerHttpHandler`)
5. OpenAI Responses API
6. OpenAI Chat Completions API
7. Canvas host
8. Control UI (SPA catch-all)

### Plugin discovery order (first match wins)
1. `plugins.load.paths`
2. `<workspace>/.openclaw/extensions/`
3. `~/.openclaw/extensions/`
4. Bundled plugins
