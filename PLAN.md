# Better Gateway IDE - Development Plan

> Building Cursor-in-OpenClaw: A context-aware IDE with integrated chat

## Vision

Transform the OpenClaw gateway UI into a full development environment with:
- **Monaco Editor** — Full VS Code editing experience
- **File Explorer** — Browse and manage workspace files
- **Context-Aware Chat** — Chat that can reference and edit files
- **Seamless Integration** — Tabs in the existing gateway sidebar

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Better Gateway Plugin                         │
├─────────────────────────────────────────────────────────────────┤
│  HTTP Routes                                                     │
│  ├── /better-gateway/          → Enhanced gateway (existing)     │
│  ├── /better-gateway/ide       → IDE application                 │
│  ├── /better-gateway/api/files → File operations REST API        │
│  └── /better-gateway/assets/*  → Static assets (Monaco, etc.)    │
├─────────────────────────────────────────────────────────────────┤
│  Injected UI Components                                          │
│  ├── Sidebar tabs (Files, IDE, Chat)                             │
│  ├── File context panel                                          │
│  └── Chat file reference UI (@file mentions)                     │
├─────────────────────────────────────────────────────────────────┤
│  Backend Services                                                │
│  ├── File API (read/write/list/watch)                            │
│  ├── Chat context bridge                                         │
│  └── Session state management                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Foundation (MVP)

### 1.1 File Explorer Sidebar Tab

**Goal:** Add a "Files" tab to the gateway sidebar showing workspace tree.

**Implementation:**
```typescript
// Inject sidebar tab via DOM manipulation
function injectFilesTab() {
  const sidebar = document.querySelector('.sidebar-nav');
  const filesTab = createFilesTab();
  sidebar.appendChild(filesTab);
}
```

**File API Endpoints:**
- `GET /better-gateway/api/files?path=/` — List directory
- `GET /better-gateway/api/files/read?path=...` — Read file content
- `POST /better-gateway/api/files/write` — Write file content
- `DELETE /better-gateway/api/files?path=...` — Delete file

**File Tree Component:**
- Collapsible folder structure
- File icons by extension
- Right-click context menu (new file, rename, delete)
- Click to open in editor

### 1.2 Monaco Editor Integration

**Goal:** Embed Monaco Editor for code editing.

**Bundle Strategy:**
- Use Monaco's ESM build from CDN or bundle locally
- ~2MB gzipped for full feature set
- Lazy load on first IDE tab open

**Editor Features (MVP):**
- Syntax highlighting (auto-detect by extension)
- Basic autocomplete
- Multi-file tabs
- Save with Ctrl+S
- Unsaved indicator

**Implementation:**
```typescript
// IDE page structure
const idePage = `
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/better-gateway/assets/monaco/editor.css">
</head>
<body>
  <div id="sidebar"><!-- File tree --></div>
  <div id="editor-container"><!-- Monaco --></div>
  <script type="module" src="/better-gateway/assets/ide.js"></script>
</body>
</html>
`;
```

### 1.3 Embedded IDE Integration

**Goal:** Make IDE a native view within the gateway UI, not a separate page.

**Approach: Embedded iframe with view switching**
- Add "IDE" nav-item in sidebar **below "Chat"** (same `.nav-item` styling)
- When clicked, hide the main content and show IDE in an iframe
- Sidebar remains persistent — only the main content area switches
- Toggle `active` class between Chat and IDE nav items

**Implementation:**
```typescript
// Inject IDE nav-item matching gateway's native styling
function injectIdeNavItem() {
  const chatGroup = document.querySelector('.nav-group');
  const navItems = chatGroup.querySelector('.nav-group__items');
  
  const ideItem = document.createElement('a');
  ideItem.href = '#ide';
  ideItem.className = 'nav-item';
  ideItem.innerHTML = `
    <span class="nav-item__icon"><!-- code icon SVG --></span>
    <span class="nav-item__text">IDE</span>
  `;
  
  ideItem.addEventListener('click', toggleIdeView);
  navItems.appendChild(ideItem);
}

function toggleIdeView() {
  const main = document.querySelector('main.content');
  let ideFrame = document.getElementById('better-gateway-ide-frame');
  
  if (!ideFrame) {
    ideFrame = document.createElement('iframe');
    ideFrame.id = 'better-gateway-ide-frame';
    ideFrame.src = '/better-gateway/ide';
    main.parentNode.insertBefore(ideFrame, main.nextSibling);
  }
  
  // Toggle visibility and active states
  const showIde = ideFrame.style.display === 'none';
  ideFrame.style.display = showIde ? 'block' : 'none';
  main.style.display = showIde ? 'none' : '';
}
```

**Benefits:**
- Feels native — same sidebar, same layout
- No page navigation — instant switching
- Sidebar state preserved when switching views
- Foundation for future split view (IDE + Chat side by side)

---

## Phase 2: Context-Aware Chat

### 2.1 File References in Chat

**Goal:** Allow `@filename` mentions in chat that include file content.

**UI Components:**
- `@` trigger shows file picker autocomplete
- Selected files shown as chips in input
- Referenced files included in message context

**Message Format:**
```
User: @AGENTS.md @SOUL.md summarize these files

→ System injects file contents before sending to agent
```

**Implementation:**
```typescript
interface FileReference {
  path: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

function processMessageWithRefs(message: string, refs: FileReference[]): string {
  const context = refs.map(r => 
    `<file path="${r.path}">\n${r.content}\n</file>`
  ).join('\n');
  return `${context}\n\nUser message: ${message}`;
}
```

### 2.2 Chat-Driven Edits

**Goal:** Let the agent edit files directly from chat.

**Flow:**
1. User: "Add a TODO comment to line 15 of index.ts"
2. Agent uses edit tool
3. IDE view updates in real-time
4. User sees diff preview

**WebSocket Events:**
```typescript
// File change notification
{ type: 'file_changed', path: string, content: string }

// Editor subscribes to changes
ws.on('file_changed', (data) => {
  if (data.path === currentFile) {
    monaco.editor.setValue(data.content);
  }
});
```

### 2.3 Selection Context

**Goal:** Select code in editor, ask chat about it.

**UI:**
- "Ask about selection" button/shortcut
- Selection auto-included in next message
- Line numbers preserved

---

## Phase 3: Advanced Features

### 3.1 Split View

- Side-by-side editor + chat
- Drag to resize
- Toggle layouts (editor-only, chat-only, split)

### 3.2 Diff View

- Show pending changes before save
- Accept/reject hunks
- Git-style diff highlighting

### 3.3 Search Across Files

- Ctrl+Shift+F global search
- Regex support
- Replace all

### 3.4 Terminal Integration

- Embedded terminal panel
- Run commands from chat context
- Output capture for chat reference

### 3.5 AI Autocomplete

- Inline completions (like Copilot)
- Use gateway's model for suggestions
- Tab to accept

---

## Technical Decisions

### Monaco Loading Strategy

**Option A: CDN (Recommended for MVP)**
```html
<script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
```
- Pros: No bundling, fast to implement
- Cons: Requires internet, version management

**Option B: Bundled**
```bash
npm install monaco-editor
# Bundle with esbuild/vite
```
- Pros: Offline, version controlled
- Cons: Larger plugin, build complexity

**Recommendation:** Start with CDN, migrate to bundled later.

### State Management

**Editor State:**
- Open files (tabs)
- Cursor positions
- Unsaved changes
- Scroll positions

**Persistence:**
- Store in localStorage keyed by workspace
- Restore on page load
- Sync across tabs via BroadcastChannel

### File Watching

**Options:**
1. **Polling** — Simple, works everywhere
2. **WebSocket push** — Real-time, requires gateway support
3. **Gateway hook** — Subscribe to file change events

**MVP:** Polling every 5s for open files, WebSocket for chat-initiated changes.

---

## File Structure

```
better-gateway-dev/
├── src/
│   ├── index.ts              # Plugin entry, HTTP routes
│   ├── inject.js             # WebSocket enhancer (existing)
│   ├── routes/
│   │   ├── files-api.ts      # File operations API
│   │   ├── ide-page.ts       # IDE HTML generator
│   │   └── assets.ts         # Static file serving
│   ├── ide/
│   │   ├── editor.ts         # Monaco wrapper
│   │   ├── file-tree.ts      # File explorer component
│   │   ├── tabs.ts           # Editor tabs management
│   │   └── chat-bridge.ts    # Chat-editor integration
│   └── inject/
│       ├── sidebar-tabs.ts   # Sidebar tab injection
│       └── chat-enhance.ts   # Chat file reference UI
├── assets/
│   ├── ide.css               # IDE styles
│   └── ide.js                # IDE client bundle
├── dist/
├── package.json
├── tsconfig.json
└── openclaw.plugin.json
```

---

## Implementation Order

### Week 1: File API + Basic Editor
1. [x] Add file API routes (list, read, write, delete, mkdir) ✅ **DONE**
2. [x] Add comprehensive test suite (69 tests) ✅ **DONE**
3. [x] Add GitHub Actions CI/CD workflow ✅ **DONE**
4. [x] Create IDE page with Monaco (CDN) ✅ **DONE**
5. [x] Implement file tree component ✅ **DONE** (Phase 1)
   - Collapsible folder structure
   - File icons by extension  
   - Click to open in editor
   - Search/filter files (Ctrl+P)
   - Auto-expand matching folders during search
   - Highlight matching text
6. [x] Basic editor tabs ✅ **DONE** (Phase 1)
   - Drag to reorder tabs
   - Middle-click to close
   - Tab navigation (Ctrl+Tab, Ctrl+Shift+Tab)
   - Modified indicator

### Week 2: Gateway Integration
7. [x] Inject "IDE" as embedded view in gateway ✅ **DONE** (Phase 1)
   - IDE nav-item added below "Chat" in sidebar
   - Uses gateway's native `.nav-item` styling
   - Clicking toggles between Chat and IDE views
   - IDE loads in iframe, main content hides
   - Sidebar stays persistent across view switches
8. [x] Style consistency with gateway UI ✅ **DONE** (Phase 1)
   - Matches VS Code dark theme (vs-dark)
   - Uses gateway accent colors
   - Consistent font families
9. [x] Keyboard shortcuts ✅ **DONE**
   - ⌘/Ctrl+S: Save file
   - ⌘/Ctrl+B: Toggle sidebar
   - ⌘/Ctrl+W: Close tab
   - ⌘/Ctrl+P: Quick file search
   - ⌘/Ctrl+Tab: Next tab
   - ⌘/Ctrl+Shift+Tab: Previous tab
   - Escape: Clear search / hide context menu
10. [x] localStorage state persistence ✅ **DONE**
   - Open tabs persist across refreshes
   - Active tab remembered
   - Editor view state (cursor, scroll) preserved

---

### ✅ Phase 1 Complete (2026-02-09)

**Summary:** Full IDE embedded in gateway with file explorer, Monaco editor, and seamless navigation.

**Key Implementation Details:**
- IDE iframe inserted as sibling to `<main>` (not inside) to preserve SPA routing
- Main content hidden (not replaced) when IDE active
- All nav item clicks restore main content before navigation
- Chat link click intercepted to toggle back without page reload
- Supports both ⌘ (Mac) and Ctrl (Windows/Linux) for shortcuts

**Test Coverage:** 106 tests passing

---

### Week 3: Chat Integration (Phase 2)
11. [ ] `@file` mention autocomplete
12. [ ] File content injection in messages
13. [ ] Real-time file change updates
14. [ ] Selection-to-chat flow

### Week 4: Polish
15. [ ] Split view layout
16. [ ] Search across files
17. [ ] Error handling & edge cases
18. [ ] Documentation & README update

---

## API Reference

### File Operations

```typescript
// List directory
GET /better-gateway/api/files?path=/&recursive=false
Response: {
  files: [
    { name: "file.ts", type: "file", size: 1234, modified: "2024-..." },
    { name: "folder", type: "directory" }
  ]
}

// Read file
GET /better-gateway/api/files/read?path=/src/index.ts
Response: {
  content: "...",
  encoding: "utf-8",
  size: 1234
}

// Write file
POST /better-gateway/api/files/write
Body: { path: "/src/index.ts", content: "..." }
Response: { ok: true }

// Delete
DELETE /better-gateway/api/files?path=/src/old.ts
Response: { ok: true }
```

### WebSocket Events (Chat Integration)

```typescript
// File opened in editor
{ type: "ide:file_opened", path: string }

// File saved
{ type: "ide:file_saved", path: string }

// Request file context for chat
{ type: "ide:get_context", files: string[] }

// File changed by agent
{ type: "ide:file_changed", path: string, content: string }
```

---

## Dependencies

```json
{
  "dependencies": {
    // None required for MVP (Monaco via CDN)
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "esbuild": "^0.20.0"  // For bundling client JS
  }
}
```

---

## Open Questions

1. **Monaco bundling** — CDN vs bundled? (Start CDN, migrate later)
2. **Auth for file API** — Reuse gateway token? (Yes, same auth)
3. **Workspace scope** — Only workspace dir or allow broader? (Workspace only for security)
4. **Large files** — Max size for editor? (Warn at 1MB, block at 10MB)
5. **Binary files** — How to handle? (Show hex view or "binary file" message)

---

## Success Metrics

- [ ] Can browse files in sidebar
- [ ] Can edit and save files
- [ ] Can reference files in chat with `@`
- [ ] Chat edits reflect in editor
- [ ] Works offline (after initial load)
- [ ] State persists across refreshes

---

*Let's build Cursor in OpenClaw.* 🚀
