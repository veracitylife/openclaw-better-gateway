# Ticket 12 Implementation Plan — Chat Transport to OpenClaw Session Stream

## Scope
Implement Ticket 12 only: connect IDE chat panel to OpenClaw gateway session stream, send user messages, stream assistant output in real time, and handle reconnect/disconnect states.

## 1) Transport protocol

### Chosen protocol
- **Transport:** WebSocket JSON-RPC-style protocol used by gateway UI.
- **URL:** `ws(s)://<current-host>` (same host as gateway).
- **Client frame shape:**
  - Request: `{ "type": "req", "id": "<uuid>", "method": "<method>", "params": { ... } }`
  - Response: `{ "type": "res", "id": "<id>", "ok": true|false, "payload"?: any, "error"?: { "message": string } }`
  - Event: `{ "type": "event", "event": "chat"|"agent"|..., "payload": any, "seq"?: number }`

### Methods/events needed for Ticket 12
- Request `connect` once socket opens (protocol v3).
- Request `chat.send` to send user text (`deliver:false`, `idempotencyKey` set).
- Consume `event: "chat"` payload stream:
  - `state: "delta"` with `message` text snapshot/partial
  - `state: "final"` completion
  - `state: "error"` error string
  - `state: "aborted"` stop state

### Session/auth inputs
- Read local gateway settings from `localStorage["openclaw.control.settings.v1"]`.
- Use:
  - `sessionKey` (default `main`)
  - optional `token`
  - optional `gatewayUrl` override (fallback to current origin ws URL)

## 2) Message state model

Use explicit client-side message entities in IDE panel:

```ts
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "streaming" | "final" | "error";
  createdAt: number;
  runId?: string;
}
```

Panel state:
- `messages: ChatMessage[]`
- `activeRunId: string | null`
- `connectionState: "connecting" | "connected" | "reconnecting" | "disconnected"`
- `pendingQueue: { text: string; queuedAt: number }[]` (only for transient disconnect while reconnecting)

Behavior:
- On send: append user message + create assistant placeholder (`streaming`).
- On `delta`: update active assistant placeholder text.
- On `final`: mark assistant message final and clear `activeRunId`.
- On `error`: mark assistant message error and clear `activeRunId`.

## 3) Reconnect behavior

- Detect close/error and transition to `reconnecting`.
- Retry with exponential backoff (start 800ms, max 15s).
- On reconnect, re-send `connect` handshake and continue normal sends.
- UI states:
  - Connected: “Connected”
  - Reconnecting: “Reconnecting…” + queued sends allowed
  - Disconnected (manual stop/max failure): disable send + show retry hint
- Keep existing rendered messages and editor state unchanged across reconnects.

## 4) Minimal test plan

### Unit/integration (Vitest + existing HTML-string tests)
1. `generateIdePage` includes chat panel transport primitives:
   - chat panel containers (`#chat-panel`, `#chat-messages`, `#chat-input`, `#chat-send`)
   - transport constants/method usage strings (`chat.send`, `connect`, `openclaw.control.settings.v1`)
2. `inject` tests remain passing (no regressions to existing IDE embedding behavior).

### Build/test verification
- `npm test`
- `npm run build`

## Implementation notes
- Keep implementation in `src/ide-page.ts` (Ticket 12 scope).
- Do **not** implement Ticket 13 (`@file` mentions/chips); leave no behavior overlap beyond plain text chat input.
