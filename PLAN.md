# Plan: CLI Terminal Tab for Better Gateway

## Overview
Add an embedded terminal/CLI as a third nav tab (Chat → IDE → CLI) in the gateway sidebar. The terminal connects via WebSocket to a server-side PTY, letting you run shell commands directly from the browser — making this a true "full-fledged gateway" (chat + code + terminal).

## Architecture: xterm.js + node-pty (Full Terminal)

- Real PTY backend via `node-pty` on the server
- xterm.js in the browser (same lib VS Code uses)
- WebSocket bridge between browser ↔ PTY
- Full interactive terminal: vim, htop, tab completion, colors, everything

## Files to Create/Modify

### New Files

1. **`src/terminal-api.ts`** — PTY management + WebSocket handler
   - Spawn PTY sessions with `node-pty`
   - Handle WebSocket upgrade at `/better-gateway/terminal/ws`
   - Resize support, session cleanup on disconnect

2. **`src/terminal-page.ts`** — Standalone terminal page
   - xterm.js + xterm-addon-fit + xterm-addon-web-links
   - Load from CDN (like Monaco in ide-page.ts)
   - Endpoint: `/better-gateway/terminal`

### Modified Files

3. **`src/inject.js`** — Add CLI nav item
   - New `createCliNavItem()` following `createIdeNavItem()` pattern
   - New view modes: add `'cli'` and potentially split combos
   - CLI iframe pointing to `/better-gateway/terminal`
   - Keyboard shortcut: Ctrl+` (like VS Code)

4. **`src/index.ts`** — Register terminal routes
   - Serve terminal page at `/better-gateway/terminal`
   - WebSocket upgrade handler for `/better-gateway/terminal/ws`
   - Update landing page features list

5. **`package.json`** — Add `node-pty` dependency
   - xterm.js loaded from CDN, no npm dep needed

## Implementation Phases

### Phase 1: Terminal Backend (`terminal-api.ts`)
- PTY spawn/resize/kill
- WebSocket handler that bridges browser ↔ PTY
- Session management (create on connect, destroy on disconnect)

### Phase 2: Terminal Page (`terminal-page.ts`)
- xterm.js UI with dark theme matching IDE
- Connect to WebSocket, handle resize
- Fit addon for auto-sizing

### Phase 3: Nav Integration (`inject.js`)
- CLI nav item below IDE
- View mode support (chat/ide/cli/split combinations)
- Ctrl+` hotkey

### Phase 4: Wire It Up (`index.ts`)
- Register routes + WebSocket upgrade
- Build & test end-to-end

## View Mode Design

**Current:** `chat | ide | split(ide+chat)`

**CLI view modes:**
- `cli` — Terminal fullscreen
- `split-cli` — Terminal left, Chat right

**Nav behavior (matching IDE pattern):**
- Click CLI → toggle split-cli / chat
- Shift+click CLI → toggle cli-only / chat

## Security Considerations
- PTY runs as the gateway process user (same trust model as file API and exec tool)
- No additional auth beyond gateway access
- Could add command allowlist later if needed
