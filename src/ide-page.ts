/**
 * IDE Page Generator
 * Creates a full-featured code editor interface using Monaco Editor (CDN)
 * With integrated chat sidebar for OpenClaw gateway communication
 */

export interface IdePageConfig {
  monacoVersion: string;
  theme: "vs-dark" | "vs" | "hc-black";
}

const DEFAULT_CONFIG: IdePageConfig = {
  monacoVersion: "0.52.0",
  theme: "vs-dark",
};

/**
 * Language detection from file extension
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  sql: "sql",
  graphql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
  toml: "toml",
  ini: "ini",
  txt: "plaintext",
};

/**
 * Generate the IDE page HTML
 */
export function generateIdePage(config: Partial<IdePageConfig> = {}): string {
  const { monacoVersion, theme } = { ...DEFAULT_CONFIG, ...config };
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Better Gateway IDE</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    :root {
      --bg-primary: #1e1e1e;
      --bg-secondary: #252526;
      --bg-tertiary: #2d2d30;
      --bg-hover: #2a2d2e;
      --bg-active: #37373d;
      --border-color: #3c3c3c;
      --text-primary: #cccccc;
      --text-secondary: #858585;
      --text-muted: #6e6e6e;
      --accent: #0078d4;
      --accent-hover: #1c8ae6;
      --success: #4ec9b0;
      --warning: #dcdcaa;
      --error: #f14c4c;
      --scrollbar-bg: #1e1e1e;
      --scrollbar-thumb: #424242;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      overflow: hidden;
    }
    
    #app {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    
    /* Header / Toolbar */
    #toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      height: 42px;
    }
    
    #toolbar .logo {
      font-weight: 600;
      color: var(--accent);
      font-size: 14px;
    }
    
    #toolbar .separator {
      width: 1px;
      height: 20px;
      background: var(--border-color);
    }
    
    .toolbar-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .toolbar-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .toolbar-btn.active {
      background: var(--bg-active);
      color: var(--text-primary);
    }
    
    #workspace-path {
      margin-left: auto;
      font-size: 12px;
      color: var(--text-muted);
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #save-status {
      font-size: 12px;
      color: var(--text-muted);
      min-width: 72px;
      text-align: right;
    }
    
    #save-status.saving { color: var(--warning); }
    #save-status.saved { color: var(--success); }
    #save-status.error { color: var(--error); }
    
    /* Main Layout */
    #main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    
    /* Sidebar */
    #sidebar {
      width: 260px;
      min-width: 200px;
      max-width: 400px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    #sidebar.collapsed {
      width: 0;
      min-width: 0;
      border-right: none;
    }
    
    #sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-color);
    }
    
    #sidebar-header button {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }
    
    #sidebar-header button:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    /* File Search */
    #file-search-container {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
    }
    
    #file-search {
      width: 100%;
      padding: 6px 10px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 12px;
      outline: none;
    }
    
    #file-search:focus {
      border-color: var(--accent);
    }
    
    #file-search::placeholder {
      color: var(--text-muted);
    }
    
    #open-editors {
      border-bottom: 1px solid var(--border-color);
      max-height: 180px;
      overflow-y: auto;
      padding: 4px 0;
    }

    #open-editors-header {
      padding: 4px 12px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    #open-editors.empty .open-editor-empty {
      display: block;
    }

    .open-editor-empty {
      display: none;
      padding: 4px 12px 8px 12px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .open-editor-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-secondary);
      user-select: none;
    }

    .open-editor-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .open-editor-item.active {
      background: var(--bg-active);
      color: var(--text-primary);
    }

    .open-editor-item .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .open-editor-item .close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 4px;
      padding: 0 4px;
      font-size: 13px;
      line-height: 1.1;
    }

    .open-editor-item .close:hover {
      background: var(--bg-active);
      color: var(--text-primary);
    }

    #file-tree {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }
    
    .tree-item {
      display: flex;
      align-items: center;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-primary);
      user-select: none;
    }
    
    .tree-item:hover {
      background: var(--bg-hover);
    }
    
    .tree-item.selected {
      background: var(--bg-active);
    }
    
    .tree-item.directory {
      color: var(--text-secondary);
    }
    
    .tree-item .icon {
      width: 16px;
      height: 16px;
      margin-right: 6px;
      flex-shrink: 0;
      font-size: 14px;
      text-align: center;
    }
    
    .tree-item .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .tree-item .chevron {
      width: 16px;
      margin-right: 2px;
      font-size: 10px;
      color: var(--text-muted);
      transition: transform 0.15s;
    }
    
    .tree-item .chevron.expanded {
      transform: rotate(90deg);
    }
    
    .tree-children {
      display: none;
    }
    
    .tree-children.expanded {
      display: block;
    }
    
    /* Resize Handle */
    #resize-handle {
      width: 4px;
      cursor: col-resize;
      background: transparent;
    }
    
    #resize-handle:hover {
      background: var(--accent);
    }
    
    /* Editor Area */
    #editor-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 320px;
    }

    /* Chat Panel */
    #chat-resize-handle {
      width: 4px;
      cursor: col-resize;
      background: transparent;
    }

    #chat-resize-handle:hover {
      background: var(--accent);
    }

    #chat-panel {
      width: 380px;
      min-width: 280px;
      max-width: 700px;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #chat-panel.hidden {
      display: none;
    }

    #chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
    }

    #chat-title {
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: 0.2px;
    }

    #chat-connection-state {
      font-size: 11px;
      color: var(--text-muted);
    }

    #chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .chat-message {
      font-size: 12px;
      line-height: 1.45;
      padding: 8px 10px;
      border-radius: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chat-message.user {
      background: #1f3347;
      border: 1px solid #2a4a67;
      align-self: flex-end;
      max-width: 90%;
    }

    .chat-message.assistant {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      align-self: flex-start;
      max-width: 100%;
    }

    .chat-message.assistant.streaming::after {
      content: ' ⏺';
      color: var(--accent);
      animation: pulse 1s infinite;
    }

    .chat-message.assistant.error {
      border-color: var(--error);
      color: #ffb4b4;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }

    #chat-composer {
      border-top: 1px solid var(--border-color);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #chat-input {
      width: 100%;
      min-height: 72px;
      max-height: 180px;
      resize: vertical;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 8px;
      font-size: 12px;
      line-height: 1.4;
      outline: none;
    }

    #chat-input:focus {
      border-color: var(--accent);
    }

    #chat-composer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    #chat-hint {
      font-size: 11px;
      color: var(--text-muted);
    }

    #chat-send {
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }

    #chat-send:hover { background: var(--accent-hover); }
    #chat-send:disabled { opacity: 0.6; cursor: not-allowed; }
    
    /* Tab Bar */
    #tab-bar {
      display: flex;
      align-items: center;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-color);
      height: 36px;
      overflow-x: auto;
    }
    
    #tab-bar::-webkit-scrollbar {
      height: 3px;
    }
    
    .tab {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      height: 100%;
      font-size: 13px;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      border-right: 1px solid var(--border-color);
      cursor: pointer;
      white-space: nowrap;
    }
    
    .tab:hover {
      background: var(--bg-hover);
    }
    
    .tab.active {
      background: var(--bg-primary);
      color: var(--text-primary);
      border-bottom: 1px solid var(--bg-primary);
      margin-bottom: -1px;
    }
    
    .tab.modified .tab-name::after {
      content: " •";
      color: var(--warning);
    }
    
    .tab .close-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      font-size: 14px;
      line-height: 1;
      visibility: hidden;
    }
    
    .tab:hover .close-btn,
    .tab.active .close-btn {
      visibility: visible;
    }
    
    .tab .close-btn:hover {
      background: var(--bg-active);
      color: var(--text-primary);
    }
    
    .tab.dragging {
      opacity: 0.5;
    }
    
    .tab.drag-over {
      border-left: 2px solid var(--accent);
    }
    
    /* Tab scroll buttons */
    .tab-scroll-btn {
      background: var(--bg-tertiary);
      border: none;
      color: var(--text-secondary);
      padding: 0 8px;
      cursor: pointer;
      height: 100%;
      font-size: 14px;
    }
    
    .tab-scroll-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .tab-scroll-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    
    /* Editor Container */
    #editor-container {
      flex: 1;
      overflow: hidden;
    }
    
    /* Welcome Screen */
    #welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted);
      font-size: 14px;
    }
    
    #welcome h2 {
      font-size: 24px;
      font-weight: 400;
      margin-bottom: 16px;
      color: var(--text-secondary);
    }
    
    #welcome .shortcuts {
      margin-top: 24px;
      text-align: left;
    }
    
    #welcome .shortcut {
      display: flex;
      gap: 12px;
      margin: 8px 0;
    }
    
    #welcome kbd {
      background: var(--bg-tertiary);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 12px;
      min-width: 80px;
      text-align: center;
    }
    
    /* Loading Overlay */
    #loading {
      position: fixed;
      inset: 0;
      background: var(--bg-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    
    #loading.hidden {
      display: none;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--bg-tertiary);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Context Menu */
    #context-menu {
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 4px 0;
      min-width: 160px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      z-index: 1000;
      display: none;
    }
    
    #context-menu.visible {
      display: block;
    }
    
    .context-item {
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .context-item:hover {
      background: var(--bg-hover);
    }
    
    .context-separator {
      height: 1px;
      background: var(--border-color);
      margin: 4px 0;
    }
    
    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    
    ::-webkit-scrollbar-track {
      background: var(--scrollbar-bg);
    }
    
    ::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb);
      border-radius: 5px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
  </div>
  
  <div id="app">
    <div id="toolbar">
      <span class="logo">⚡ Better Gateway IDE</span>
      <span class="separator"></span>
      <button class="toolbar-btn" id="toggle-sidebar" title="Toggle Sidebar (Ctrl+B)">
        ☰ Files
      </button>
      <button class="toolbar-btn" id="new-file-btn" title="New File (Ctrl+N)">
        + New
      </button>
      <button class="toolbar-btn" id="open-folder-btn" title="Open Folder">
        📂 Open Folder
      </button>
      <button class="toolbar-btn" id="toggle-chat-btn" title="Toggle Chat (Ctrl+Shift+C)">
        💬 Chat
      </button>
      <span id="workspace-path" title="Current workspace folder">/</span>
      <span id="save-status"></span>
    </div>
    
    <div id="main">
      <div id="sidebar">
        <div id="sidebar-header">
          <span>Explorer</span>
          <button id="collapse-btn" title="Collapse All">⊟</button>
        </div>
        <div id="file-search-container">
          <input type="text" id="file-search" placeholder="Search files... (Ctrl+P)" />
        </div>
        <div id="open-editors" class="empty">
          <div id="open-editors-header">Open Editors</div>
          <div class="open-editor-empty">No open files</div>
        </div>
        <div id="file-tree"></div>
      </div>
      
      <div id="resize-handle"></div>
      
      <div id="editor-area">
        <div id="tab-bar"></div>
        <div id="editor-container">
          <div id="welcome">
            <h2>Better Gateway IDE</h2>
            <p>Open a file from the sidebar to start editing</p>
            <div class="shortcuts">
              <div class="shortcut"><kbd>⌘/Ctrl+S</kbd> <span>Save file</span></div>
              <div class="shortcut"><kbd>⌘/Ctrl+B</kbd> <span>Toggle sidebar</span></div>
              <div class="shortcut"><kbd>⌘/Ctrl+P</kbd> <span>Quick open</span></div>
              <div class="shortcut"><kbd>⌘/Ctrl+W</kbd> <span>Close tab</span></div>
              <div class="shortcut"><kbd>⌘/Ctrl+Shift+C</kbd> <span>Toggle chat panel</span></div>
            </div>
          </div>
        </div>
      </div>

      <div id="chat-resize-handle"></div>

      <aside id="chat-panel">
        <div id="chat-header">
          <span id="chat-title">OpenClaw Chat</span>
          <span id="chat-connection-state">Connecting…</span>
        </div>
        <div id="chat-messages"></div>
        <div id="chat-composer">
          <textarea id="chat-input" placeholder="Ask OpenClaw… (Enter to send, Shift+Enter for newline)"></textarea>
          <div id="chat-composer-actions">
            <span id="chat-hint">Session stream via gateway WebSocket</span>
            <button id="chat-send">Send</button>
          </div>
        </div>
      </aside>
    </div>
  </div>
  
  <div id="context-menu">
    <div class="context-item" data-action="new-file">📄 New File</div>
    <div class="context-item" data-action="new-folder">📁 New Folder</div>
    <div class="context-separator"></div>
    <div class="context-item" data-action="rename">✏️ Rename</div>
    <div class="context-item" data-action="delete">🗑️ Delete</div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@${monacoVersion}/min/vs/loader.js"></script>
  <script>
    // Configuration
    const API_BASE = '/better-gateway/api/files';
    const EXTENSION_MAP = ${JSON.stringify(EXTENSION_TO_LANGUAGE)};
    
    // State
    const state = {
      files: [],
      openTabs: [],
      activeTab: null,
      editor: null,
      models: new Map(), // path -> monaco model
      expandedDirs: new Set(['']),
      unsavedChanges: new Map(), // path -> true
      workspaceRoot: '/',
      chatMessages: [],
      chatConnected: false,
      chatStatus: 'connecting', // connecting | connected | reconnecting | disconnected
      chatRunId: null,
      chatPanelVisible: true,
      chatPanelWidth: 380,
    };
    
    // DOM Elements
    const elements = {
      loading: document.getElementById('loading'),
      fileTree: document.getElementById('file-tree'),
      openEditors: document.getElementById('open-editors'),
      tabBar: document.getElementById('tab-bar'),
      editorContainer: document.getElementById('editor-container'),
      welcome: document.getElementById('welcome'),
      sidebar: document.getElementById('sidebar'),
      saveStatus: document.getElementById('save-status'),
      workspacePath: document.getElementById('workspace-path'),
      contextMenu: document.getElementById('context-menu'),
      fileSearch: document.getElementById('file-search'),
      chatPanel: document.getElementById('chat-panel'),
      chatResizeHandle: document.getElementById('chat-resize-handle'),
      chatConnectionState: document.getElementById('chat-connection-state'),
      chatMessages: document.getElementById('chat-messages'),
      chatInput: document.getElementById('chat-input'),
      chatSend: document.getElementById('chat-send'),
      toggleChatBtn: document.getElementById('toggle-chat-btn'),
    };
    
    // Search state
    let searchQuery = '';
    
    // ==================== File API ====================
    
    function normalizeWorkspaceRoot(path) {
      if (!path || path === '/' || path === '.') return '/';
      let normalized = String(path).trim();
      while (normalized.startsWith('/')) normalized = normalized.slice(1);
      while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
      return normalized || '/';
    }

    function getWorkspaceApiPath() {
      return state.workspaceRoot === '/' ? '/' : state.workspaceRoot;
    }

    function workspaceJoin(name) {
      if (state.workspaceRoot === '/') return name;
      return state.workspaceRoot + '/' + name;
    }

    function updateWorkspacePathLabel() {
      elements.workspacePath.textContent = state.workspaceRoot;
      elements.workspacePath.title = 'Current workspace folder: ' + state.workspaceRoot;
    }

    async function fetchFiles(path = '/') {
      const res = await fetch(\`\${API_BASE}?path=\${encodeURIComponent(path)}&recursive=true\`);
      if (!res.ok) throw new Error('Failed to fetch files');
      const data = await res.json();
      return data.files;
    }
    
    async function readFile(path) {
      const res = await fetch(\`\${API_BASE}/read?path=\${encodeURIComponent(path)}\`);
      if (!res.ok) throw new Error('Failed to read file');
      const data = await res.json();
      return data.content;
    }
    
    async function writeFile(path, content) {
      const res = await fetch(\`\${API_BASE}/write\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
      if (!res.ok) throw new Error('Failed to write file');
      return res.json();
    }
    
    async function deleteFile(path) {
      const res = await fetch(\`\${API_BASE}?path=\${encodeURIComponent(path)}\`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete file');
      return res.json();
    }
    
    async function createDirectory(path) {
      const res = await fetch(\`\${API_BASE}/mkdir\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error('Failed to create directory');
      return res.json();
    }
    
    // ==================== File Tree ====================
    
    function buildTree(files) {
      const root = { name: '', children: {}, type: 'directory' };
      
      for (const file of files) {
        const parts = file.path.split('/').filter(Boolean);
        let current = root;
        
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isLast = i === parts.length - 1;
          
          if (!current.children[part]) {
            current.children[part] = {
              name: part,
              path: parts.slice(0, i + 1).join('/'),
              type: isLast ? file.type : 'directory',
              size: file.size,
              modified: file.modified,
              children: {},
            };
          }
          current = current.children[part];
        }
      }
      
      return root;
    }
    
    function sortTreeChildren(children) {
      return Object.values(children).sort((a, b) => {
        // Directories first
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        // Then alphabetically
        return a.name.localeCompare(b.name);
      });
    }
    
    function getFileIcon(name, type) {
      if (type === 'directory') return '📁';
      const ext = name.split('.').pop()?.toLowerCase();
      const icons = {
        ts: '🔷', tsx: '⚛️', js: '🟨', jsx: '⚛️',
        json: '📋', md: '📝', html: '🌐', css: '🎨',
        py: '🐍', rb: '💎', rs: '🦀', go: '🐹',
        sh: '⚙️', bash: '⚙️', yml: '⚙️', yaml: '⚙️',
        png: '🖼️', jpg: '🖼️', gif: '🖼️', svg: '🖼️',
        txt: '📄',
      };
      return icons[ext] || '📄';
    }
    
    function matchesSearch(name, path) {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return name.toLowerCase().includes(query) || path.toLowerCase().includes(query);
    }
    
    function hasMatchingDescendants(node) {
      if (!searchQuery) return true;
      if (matchesSearch(node.name, node.path)) return true;
      if (node.type === 'directory' && node.children) {
        return Object.values(node.children).some(child => hasMatchingDescendants(child));
      }
      return false;
    }
    
    function highlightMatch(text) {
      if (!searchQuery) return text;
      const query = searchQuery.toLowerCase();
      const idx = text.toLowerCase().indexOf(query);
      if (idx === -1) return text;
      return text.slice(0, idx) + '<mark style="background: var(--accent); color: var(--bg-primary); padding: 0 2px; border-radius: 2px;">' + text.slice(idx, idx + query.length) + '</mark>' + text.slice(idx + query.length);
    }
    
    function renderTree(node, container, depth = 0) {
      const sorted = sortTreeChildren(node.children);
      
      for (const child of sorted) {
        // Skip items that don't match search (unless they have matching descendants)
        if (searchQuery && !hasMatchingDescendants(child)) {
          continue;
        }
        
        const item = document.createElement('div');
        item.className = 'tree-item' + (child.type === 'directory' ? ' directory' : '');
        item.style.paddingLeft = (12 + depth * 16) + 'px';
        item.dataset.path = child.path;
        item.dataset.type = child.type;
        
        // Auto-expand directories when searching
        const isExpanded = searchQuery ? true : state.expandedDirs.has(child.path);
        const displayName = highlightMatch(child.name);
        
        if (child.type === 'directory') {
          item.innerHTML = \`
            <span class="chevron \${isExpanded ? 'expanded' : ''}">▶</span>
            <span class="icon">\${getFileIcon(child.name, child.type)}</span>
            <span class="name">\${displayName}</span>
          \`;
        } else {
          item.innerHTML = \`
            <span class="icon">\${getFileIcon(child.name, child.type)}</span>
            <span class="name">\${displayName}</span>
          \`;
        }
        
        container.appendChild(item);
        
        // Add click handlers
        item.addEventListener('click', () => handleTreeItemClick(child));
        item.addEventListener('contextmenu', (e) => showContextMenu(e, child));
        
        // Render children if directory and expanded
        if (child.type === 'directory' && Object.keys(child.children).length > 0) {
          const childContainer = document.createElement('div');
          childContainer.className = 'tree-children' + (isExpanded ? ' expanded' : '');
          container.appendChild(childContainer);
          renderTree(child, childContainer, depth + 1);
        }
      }
    }
    
    function handleTreeItemClick(node) {
      if (node.type === 'directory') {
        // Toggle expanded state
        if (state.expandedDirs.has(node.path)) {
          state.expandedDirs.delete(node.path);
        } else {
          state.expandedDirs.add(node.path);
        }
        refreshFileTree();
      } else {
        openFile(node.path);
      }
    }
    
    async function refreshFileTree() {
      try {
        state.files = await fetchFiles(getWorkspaceApiPath());
        const tree = buildTree(state.files);
        elements.fileTree.innerHTML = '';
        renderTree(tree, elements.fileTree);
        updateTreeSelection();
      } catch (err) {
        console.error('Failed to refresh file tree:', err);
      }
    }
    
    function updateTreeSelection() {
      document.querySelectorAll('.tree-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.path === state.activeTab);
      });
    }

    function closeAllTabs(force = false) {
      const paths = [...state.openTabs];
      for (const path of paths) {
        if (state.unsavedChanges.has(path) && !force) {
          return false;
        }
      }

      for (const path of paths) {
        const model = state.models.get(path);
        if (model) {
          model.dispose();
          state.models.delete(path);
        }
      }

      state.openTabs = [];
      state.activeTab = null;
      state.unsavedChanges.clear();
      state.editor.setModel(null);
      elements.welcome.style.display = 'flex';
      renderTabs();
      return true;
    }

    async function setWorkspaceRoot(nextRoot) {
      const normalized = normalizeWorkspaceRoot(nextRoot);
      if (normalized === state.workspaceRoot) return;

      const hasDirty = state.unsavedChanges.size > 0;
      if (hasDirty) {
        const ok = confirm('Switch workspace folder? Unsaved changes will be discarded.');
        if (!ok) return;
      }

      closeAllTabs(true);
      searchQuery = '';
      elements.fileSearch.value = '';
      state.expandedDirs.clear();
      state.expandedDirs.add('');
      state.workspaceRoot = normalized;
      updateWorkspacePathLabel();
      await refreshFileTree();
    }
    
    function renderOpenEditors() {
      const container = elements.openEditors;
      container.innerHTML = '';
      
      const header = document.createElement('div');
      header.id = 'open-editors-header';
      header.textContent = 'Open Editors';
      container.appendChild(header);
      
      if (state.openTabs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'open-editor-empty';
        empty.textContent = 'No open files';
        container.classList.add('empty');
        container.appendChild(empty);
        return;
      }
      
      container.classList.remove('empty');
      
      for (const path of state.openTabs) {
        const item = document.createElement('div');
        item.className = 'open-editor-item' + (path === state.activeTab ? ' active' : '');
        item.dataset.path = path;
        const name = path.split('/').pop();
        const icon = getFileIcon(name, 'file');
        const modifiedDot = state.unsavedChanges.has(path) ? ' •' : '';
        
        item.innerHTML =
          '<span class="icon">' + icon + '</span>' +
          '<span class="name" title="' + path + '">' + name + modifiedDot + '</span>' +
          '<button class="close" title="Close">×</button>';
        
        item.addEventListener('click', () => switchToTab(path));
        item.querySelector('.close').addEventListener('click', (e) => {
          e.stopPropagation();
          closeTab(path);
        });
        
        container.appendChild(item);
      }
    }
    
    // ==================== Tabs ====================
    
    // Tab drag state
    let draggedTab = null;
    
    function renderTabs() {
      elements.tabBar.innerHTML = '';
      renderOpenEditors();
      
      for (const path of state.openTabs) {
        const tab = document.createElement('button');
        tab.className = 'tab' + (path === state.activeTab ? ' active' : '');
        tab.draggable = true;
        tab.dataset.path = path;
        
        if (state.unsavedChanges.has(path)) {
          tab.classList.add('modified');
        }
        
        const name = path.split('/').pop();
        tab.innerHTML = \`
          <span class="tab-name">\${name}</span>
          <span class="close-btn" title="Close (Ctrl+W)">×</span>
        \`;
        
        // Click handlers
        tab.addEventListener('click', (e) => {
          if (e.target.classList.contains('close-btn')) {
            closeTab(path);
          } else {
            switchToTab(path);
          }
        });
        
        // Middle-click to close
        tab.addEventListener('auxclick', (e) => {
          if (e.button === 1) { // Middle button
            e.preventDefault();
            closeTab(path);
          }
        });
        
        // Drag and drop for tab reordering
        tab.addEventListener('dragstart', (e) => {
          draggedTab = path;
          tab.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        
        tab.addEventListener('dragend', () => {
          tab.classList.remove('dragging');
          draggedTab = null;
          document.querySelectorAll('.tab.drag-over').forEach(t => t.classList.remove('drag-over'));
        });
        
        tab.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (draggedTab && draggedTab !== path) {
            tab.classList.add('drag-over');
          }
        });
        
        tab.addEventListener('dragleave', () => {
          tab.classList.remove('drag-over');
        });
        
        tab.addEventListener('drop', (e) => {
          e.preventDefault();
          tab.classList.remove('drag-over');
          if (draggedTab && draggedTab !== path) {
            // Reorder tabs
            const fromIdx = state.openTabs.indexOf(draggedTab);
            const toIdx = state.openTabs.indexOf(path);
            if (fromIdx !== -1 && toIdx !== -1) {
              state.openTabs.splice(fromIdx, 1);
              state.openTabs.splice(toIdx, 0, draggedTab);
              renderTabs();
            }
          }
        });
        
        elements.tabBar.appendChild(tab);
      }
    }
    
    async function openFile(path) {
      // Check if already open
      if (!state.openTabs.includes(path)) {
        state.openTabs.push(path);
      }
      
      // Switch to tab
      await switchToTab(path);
    }
    
    async function switchToTab(path) {
      state.activeTab = path;
      
      // Hide welcome screen
      elements.welcome.style.display = 'none';
      
      // Get or create model
      let model = state.models.get(path);
      if (!model) {
        try {
          const content = await readFile(path);
          const ext = path.split('.').pop()?.toLowerCase() || '';
          const language = EXTENSION_MAP[ext] || 'plaintext';
          
          model = monaco.editor.createModel(content, language, monaco.Uri.parse('file:///' + path));
          state.models.set(path, model);
          
          // Track changes
          model.onDidChangeContent(() => {
            if (!state.unsavedChanges.has(path)) {
              state.unsavedChanges.set(path, true);
              renderTabs();
            }
          });
        } catch (err) {
          console.error('Failed to open file:', err);
          return;
        }
      }
      
      state.editor.setModel(model);
      renderTabs();
      updateTreeSelection();
      
      // Restore view state if we have it
      const viewState = localStorage.getItem('viewState:' + path);
      if (viewState) {
        state.editor.restoreViewState(JSON.parse(viewState));
      }
    }
    
    function closeTab(path) {
      const idx = state.openTabs.indexOf(path);
      if (idx === -1) return;
      
      // Check for unsaved changes
      if (state.unsavedChanges.has(path)) {
        if (!confirm(\`"\${path.split('/').pop()}" has unsaved changes. Close anyway?\`)) {
          return;
        }
      }
      
      // Remove from tabs
      state.openTabs.splice(idx, 1);
      
      // Dispose model
      const model = state.models.get(path);
      if (model) {
        model.dispose();
        state.models.delete(path);
      }
      
      state.unsavedChanges.delete(path);
      
      // Switch to another tab or show welcome
      if (state.activeTab === path) {
        if (state.openTabs.length > 0) {
          const newIdx = Math.min(idx, state.openTabs.length - 1);
          switchToTab(state.openTabs[newIdx]);
        } else {
          state.activeTab = null;
          state.editor.setModel(null);
          elements.welcome.style.display = 'flex';
        }
      }
      
      renderTabs();
    }
    
    // ==================== Save ====================
    
    async function saveCurrentFile() {
      if (!state.activeTab) return;
      
      const model = state.models.get(state.activeTab);
      if (!model) return;
      
      elements.saveStatus.textContent = 'Saving...';
      elements.saveStatus.className = 'saving';
      
      try {
        await writeFile(state.activeTab, model.getValue());
        state.unsavedChanges.delete(state.activeTab);
        renderTabs();
        elements.saveStatus.textContent = 'Saved';
        elements.saveStatus.className = 'saved';
        setTimeout(() => {
          elements.saveStatus.textContent = '';
          elements.saveStatus.className = '';
        }, 2000);
      } catch (err) {
        elements.saveStatus.textContent = 'Save failed';
        elements.saveStatus.className = 'error';
        console.error('Save failed:', err);
      }
    }
    
    // ==================== Context Menu ====================
    
    let contextMenuTarget = null;
    
    function showContextMenu(e, node) {
      e.preventDefault();
      contextMenuTarget = node;
      elements.contextMenu.style.left = e.clientX + 'px';
      elements.contextMenu.style.top = e.clientY + 'px';
      elements.contextMenu.classList.add('visible');
    }
    
    function hideContextMenu() {
      elements.contextMenu.classList.remove('visible');
      contextMenuTarget = null;
    }
    
    async function handleContextAction(action) {
      if (!contextMenuTarget) return;
      
      const target = contextMenuTarget;
      hideContextMenu();
      
      switch (action) {
        case 'new-file': {
          const name = prompt('New file name:');
          if (!name) return;
          const dir = target.type === 'directory' ? target.path : target.path.split('/').slice(0, -1).join('/');
          const newPath = dir ? dir + '/' + name : name;
          await writeFile(newPath, '');
          await refreshFileTree();
          openFile(newPath);
          break;
        }
        case 'new-folder': {
          const name = prompt('New folder name:');
          if (!name) return;
          const dir = target.type === 'directory' ? target.path : target.path.split('/').slice(0, -1).join('/');
          const newPath = dir ? dir + '/' + name : name;
          await createDirectory(newPath);
          await refreshFileTree();
          break;
        }
        case 'rename': {
          const newName = prompt('New name:', target.name);
          if (!newName || newName === target.name) return;
          // Would need a rename API endpoint
          alert('Rename not implemented yet');
          break;
        }
        case 'delete': {
          if (!confirm(\`Delete "\${target.name}"?\`)) return;
          await deleteFile(target.path);
          if (state.openTabs.includes(target.path)) {
            closeTab(target.path);
          }
          await refreshFileTree();
          break;
        }
      }
    }
    
    // ==================== Chat Transport ====================

    function createId() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }

    function parseGatewaySettings() {
      const defaults = {
        gatewayUrl: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host,
        token: '',
        sessionKey: 'main',
      };
      try {
        const raw = localStorage.getItem('openclaw.control.settings.v1');
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        return {
          gatewayUrl: parsed.gatewayUrl || defaults.gatewayUrl,
          token: parsed.token || '',
          sessionKey: parsed.sessionKey || 'main',
        };
      } catch {
        return defaults;
      }
    }

    const chatTransport = {
      ws: null,
      pending: new Map(),
      reconnectTimer: null,
      backoffMs: 800,
      closed: false,
      connectSent: false,
      settings: parseGatewaySettings(),

      setStatus(status, label) {
        state.chatStatus = status;
        state.chatConnected = status === 'connected';
        elements.chatConnectionState.textContent = label;
        elements.chatSend.disabled = status === 'disconnected';
      },

      connect() {
        if (this.closed) return;
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

        this.setStatus(this.backoffMs > 800 ? 'reconnecting' : 'connecting', this.backoffMs > 800 ? 'Reconnecting…' : 'Connecting…');

        this.ws = new WebSocket(this.settings.gatewayUrl);
        this.ws.addEventListener('open', () => {
          this.backoffMs = 800;
          this.connectSent = false;
          this.sendConnect();
          this.setStatus('connected', 'Connected');
        });

        this.ws.addEventListener('message', (event) => {
          this.handleMessage(String(event.data || ''));
        });

        this.ws.addEventListener('close', () => {
          this.ws = null;
          this.connectSent = false;
          this.flushPending(new Error('gateway closed'));
          if (!this.closed) this.scheduleReconnect();
        });

        this.ws.addEventListener('error', () => {
          this.setStatus('reconnecting', 'Connection error, retrying…');
        });
      },

      stop() {
        this.closed = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        if (this.ws) this.ws.close();
        this.ws = null;
        this.flushPending(new Error('transport stopped'));
        this.setStatus('disconnected', 'Disconnected');
      },

      scheduleReconnect() {
        this.setStatus('reconnecting', 'Reconnecting…');
        const wait = this.backoffMs;
        this.backoffMs = Math.min(this.backoffMs * 1.7, 15000);
        this.reconnectTimer = setTimeout(() => this.connect(), wait);
      },

      flushPending(err) {
        for (const [, pending] of this.pending) {
          pending.reject(err);
        }
        this.pending.clear();
      },

      sendRequest(method, params) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          return Promise.reject(new Error('gateway not connected'));
        }
        const id = createId();
        const frame = { type: 'req', id, method, params };
        const promise = new Promise((resolve, reject) => {
          this.pending.set(id, { resolve, reject });
        });
        this.ws.send(JSON.stringify(frame));
        return promise;
      },

      async sendConnect() {
        if (this.connectSent) return;
        this.connectSent = true;

        const auth = this.settings.token ? { token: this.settings.token } : undefined;
        const payload = {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'better-gateway-ide',
            version: 'dev',
            platform: navigator.platform || 'web',
            mode: 'webchat',
            instanceId: 'better-gateway-ide',
          },
          role: 'operator',
          scopes: ['operator.admin', 'operator.approvals', 'operator.pairing'],
          caps: [],
          auth,
          userAgent: navigator.userAgent,
          locale: navigator.language,
        };

        try {
          await this.sendRequest('connect', payload);
        } catch (error) {
          console.error('[IDE chat] connect handshake failed', error);
        }
      },

      handleMessage(raw) {
        let msg;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }

        if (msg.type === 'res') {
          const pending = this.pending.get(msg.id);
          if (!pending) return;
          this.pending.delete(msg.id);
          if (msg.ok) pending.resolve(msg.payload);
          else pending.reject(new Error((msg.error && msg.error.message) || 'request failed'));
          return;
        }

        if (msg.type === 'event' && msg.event === 'chat') {
          handleChatEvent(msg.payload || {});
        }
      },
    };

    function renderChatMessages() {
      elements.chatMessages.innerHTML = '';
      for (const message of state.chatMessages) {
        const row = document.createElement('div');
        row.className = 'chat-message ' + message.role + (message.status === 'streaming' ? ' streaming' : '') + (message.status === 'error' ? ' error' : '');
        row.textContent = message.text;
        elements.chatMessages.appendChild(row);
      }
      elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }

    function appendChatMessage(role, text, status = 'final', runId = null) {
      const message = { id: createId(), role, text, status, createdAt: Date.now(), runId };
      state.chatMessages.push(message);
      renderChatMessages();
      return message;
    }

    function findActiveAssistantMessage(runId) {
      for (let i = state.chatMessages.length - 1; i >= 0; i -= 1) {
        const message = state.chatMessages[i];
        if (message.role === 'assistant' && message.status === 'streaming') {
          if (!runId || !message.runId || message.runId === runId) {
            return message;
          }
        }
      }
      return null;
    }

    function extractChatText(content) {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            if (part && part.type === 'text' && typeof part.content === 'string') return part.content;
            return '';
          })
          .join('')
          .trim();
      }
      if (content && typeof content.text === 'string') return content.text;
      return '';
    }

    function handleChatEvent(payload) {
      const sessionKey = payload && payload.sessionKey;
      if (sessionKey && sessionKey !== chatTransport.settings.sessionKey) {
        return;
      }

      const stateName = payload && payload.state;
      const runId = payload && payload.runId;

      if (stateName === 'delta') {
        const text = extractChatText(payload.message);
        if (!text) return;
        let assistant = findActiveAssistantMessage(runId);
        if (!assistant) {
          assistant = appendChatMessage('assistant', text, 'streaming', runId || state.chatRunId || null);
        } else {
          assistant.text = text;
          renderChatMessages();
        }
        return;
      }

      if (stateName === 'final') {
        const assistant = findActiveAssistantMessage(runId);
        if (assistant) {
          assistant.status = 'final';
          renderChatMessages();
        }
        state.chatRunId = null;
        return;
      }

      if (stateName === 'error' || stateName === 'aborted') {
        const assistant = findActiveAssistantMessage(runId);
        if (assistant) {
          assistant.status = stateName === 'error' ? 'error' : 'final';
          if (stateName === 'error' && payload.errorMessage) {
            assistant.text = 'Error: ' + payload.errorMessage;
          }
          renderChatMessages();
        }
        state.chatRunId = null;
      }
    }

    async function sendChatMessage() {
      const text = elements.chatInput.value.trim();
      if (!text) return;

      appendChatMessage('user', text, 'final', null);
      elements.chatInput.value = '';

      const runId = createId();
      state.chatRunId = runId;
      appendChatMessage('assistant', '', 'streaming', runId);

      try {
        await chatTransport.sendRequest('chat.send', {
          sessionKey: chatTransport.settings.sessionKey || 'main',
          message: text,
          deliver: false,
          idempotencyKey: runId,
        });
      } catch (error) {
        const assistant = findActiveAssistantMessage(runId);
        if (assistant) {
          assistant.status = 'error';
          assistant.text = 'Error: ' + String(error && error.message ? error.message : error);
          renderChatMessages();
        }
        state.chatRunId = null;
      }
    }

    function applyChatPanelVisibility() {
      elements.chatPanel.classList.toggle('hidden', !state.chatPanelVisible);
      elements.chatResizeHandle.style.display = state.chatPanelVisible ? '' : 'none';
      elements.toggleChatBtn.classList.toggle('active', state.chatPanelVisible);
      if (state.chatPanelVisible) {
        elements.chatPanel.style.width = state.chatPanelWidth + 'px';
      }
      if (state.editor) {
        state.editor.layout();
      }
    }

    function setupChatPanelResize() {
      let isResizing = false;
      document.getElementById('chat-resize-handle').addEventListener('mousedown', () => {
        if (!state.chatPanelVisible) return;
        isResizing = true;
        document.body.style.cursor = 'col-resize';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isResizing || !state.chatPanelVisible) return;
        const mainRect = document.getElementById('main').getBoundingClientRect();
        const next = mainRect.right - e.clientX;
        const clamped = Math.max(280, Math.min(700, next));
        state.chatPanelWidth = clamped;
        elements.chatPanel.style.width = clamped + 'px';
      });

      document.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          document.body.style.cursor = '';
        }
      });
    }

    function setupChatPanel() {
      const savedVisible = localStorage.getItem('chatPanelVisible');
      const savedWidth = Number(localStorage.getItem('chatPanelWidth') || '380');
      state.chatPanelVisible = savedVisible !== 'false';
      state.chatPanelWidth = Number.isFinite(savedWidth) ? Math.max(280, Math.min(700, savedWidth)) : 380;
      applyChatPanelVisibility();

      elements.toggleChatBtn.addEventListener('click', () => {
        state.chatPanelVisible = !state.chatPanelVisible;
        localStorage.setItem('chatPanelVisible', String(state.chatPanelVisible));
        applyChatPanelVisibility();
      });

      elements.chatSend.addEventListener('click', sendChatMessage);
      elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });

      setupChatPanelResize();
      chatTransport.connect();
      window.addEventListener('beforeunload', () => {
        localStorage.setItem('chatPanelWidth', String(state.chatPanelWidth));
        localStorage.setItem('chatPanelVisible', String(state.chatPanelVisible));
        chatTransport.stop();
      });
    }

    // ==================== Keyboard Shortcuts ====================
    
    function setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // Use Cmd on Mac, Ctrl on Windows/Linux
        const modKey = e.metaKey || e.ctrlKey;
        
        // Cmd/Ctrl+S - Save
        if (modKey && e.key === 's') {
          e.preventDefault();
          saveCurrentFile();
        }
        
        // Cmd/Ctrl+B - Toggle sidebar
        if (modKey && e.key === 'b') {
          e.preventDefault();
          elements.sidebar.classList.toggle('collapsed');
        }
        
        // Cmd/Ctrl+W - Close tab
        if (modKey && e.key === 'w') {
          e.preventDefault();
          if (state.activeTab) {
            closeTab(state.activeTab);
          }
        }
        
        // Cmd/Ctrl+P - Focus file search / Quick open
        if (modKey && e.key === 'p') {
          e.preventDefault();
          elements.sidebar.classList.remove('collapsed');
          elements.fileSearch.focus();
          elements.fileSearch.select();
        }

        // Cmd/Ctrl+Shift+C - Toggle chat panel
        if (modKey && e.shiftKey && e.key.toLowerCase() === 'c') {
          e.preventDefault();
          state.chatPanelVisible = !state.chatPanelVisible;
          localStorage.setItem('chatPanelVisible', String(state.chatPanelVisible));
          applyChatPanelVisibility();
        }
        
        // Cmd/Ctrl+Tab - Next tab
        if (modKey && e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          if (state.openTabs.length > 1) {
            const idx = state.openTabs.indexOf(state.activeTab);
            const nextIdx = (idx + 1) % state.openTabs.length;
            switchToTab(state.openTabs[nextIdx]);
          }
        }
        
        // Cmd/Ctrl+Shift+Tab - Previous tab
        if (modKey && e.shiftKey && e.key === 'Tab') {
          e.preventDefault();
          if (state.openTabs.length > 1) {
            const idx = state.openTabs.indexOf(state.activeTab);
            const prevIdx = (idx - 1 + state.openTabs.length) % state.openTabs.length;
            switchToTab(state.openTabs[prevIdx]);
          }
        }
        
        // Escape - Hide context menu and clear search
        if (e.key === 'Escape') {
          hideContextMenu();
          if (document.activeElement === elements.fileSearch) {
            elements.fileSearch.blur();
            searchQuery = '';
            elements.fileSearch.value = '';
            refreshFileTree();
          }
        }
      });
    }
    
    function setupFileSearch() {
      elements.fileSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        refreshFileTree();
      });
      
      elements.fileSearch.addEventListener('keydown', (e) => {
        // Enter key opens first matching file
        if (e.key === 'Enter' && searchQuery) {
          const firstFile = elements.fileTree.querySelector('.tree-item:not(.directory)');
          if (firstFile) {
            openFile(firstFile.dataset.path);
            searchQuery = '';
            elements.fileSearch.value = '';
            elements.fileSearch.blur();
          }
        }
      });
    }
    
    // ==================== Resize Handle ====================
    
    function setupResizeHandle() {
      const handle = document.getElementById('resize-handle');
      let isResizing = false;
      
      handle.addEventListener('mousedown', () => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth >= 200 && newWidth <= 400) {
          elements.sidebar.style.width = newWidth + 'px';
        }
      });
      
      document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = '';
      });
    }
    
    // ==================== Initialize ====================
    
    async function init() {
      // Load Monaco
      require.config({
        paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@${monacoVersion}/min/vs' }
      });
      
      require(['vs/editor/editor.main'], async function() {
        // Create editor
        state.editor = monaco.editor.create(elements.editorContainer, {
          theme: '${theme}',
          fontSize: 14,
          fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'off',
          lineNumbers: 'on',
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
        });
        
        // Save view state on switch
        state.editor.onDidChangeCursorPosition(() => {
          if (state.activeTab) {
            const viewState = state.editor.saveViewState();
            localStorage.setItem('viewState:' + state.activeTab, JSON.stringify(viewState));
          }
        });
        
        const savedWorkspaceRoot = localStorage.getItem('workspaceRoot');
        state.workspaceRoot = normalizeWorkspaceRoot(savedWorkspaceRoot || '/');
        updateWorkspacePathLabel();

        // Load file tree
        await refreshFileTree();
        
        // Setup UI
        setupKeyboardShortcuts();
        setupResizeHandle();
        setupFileSearch();
        setupChatPanel();
        
        // Context menu handlers
        elements.contextMenu.querySelectorAll('.context-item').forEach(item => {
          item.addEventListener('click', () => handleContextAction(item.dataset.action));
        });
        document.addEventListener('click', hideContextMenu);
        
        // Toolbar buttons
        document.getElementById('toggle-sidebar').addEventListener('click', () => {
          elements.sidebar.classList.toggle('collapsed');
        });
        document.getElementById('collapse-btn').addEventListener('click', () => {
          state.expandedDirs.clear();
          state.expandedDirs.add('');
          refreshFileTree();
        });
        document.getElementById('new-file-btn').addEventListener('click', async () => {
          const name = prompt('New file name:');
          if (!name) return;
          const newPath = workspaceJoin(name);
          await writeFile(newPath, '');
          await refreshFileTree();
          openFile(newPath);
        });
        document.getElementById('open-folder-btn').addEventListener('click', async () => {
          const input = prompt('Open folder (relative to workspace root):', state.workspaceRoot);
          if (input === null) return;
          await setWorkspaceRoot(input);
        });
        
        // Restore open tabs from localStorage
        const savedTabs = localStorage.getItem('openTabs');
        const savedActive = localStorage.getItem('activeTab');
        if (savedTabs) {
          const tabs = JSON.parse(savedTabs);
          for (const path of tabs) {
            if (state.workspaceRoot !== '/' && !path.startsWith(state.workspaceRoot + '/')) {
              continue;
            }
            state.openTabs.push(path);
          }
          if (savedActive && state.openTabs.includes(savedActive)) {
            await switchToTab(savedActive);
          } else if (state.openTabs.length > 0) {
            await switchToTab(state.openTabs[0]);
          }
          renderTabs();
        }
        
        // Save tabs on change
        const saveTabs = () => {
          localStorage.setItem('openTabs', JSON.stringify(state.openTabs));
          localStorage.setItem('activeTab', state.activeTab || '');
          localStorage.setItem('workspaceRoot', state.workspaceRoot);
          localStorage.setItem('chatPanelWidth', String(state.chatPanelWidth));
          localStorage.setItem('chatPanelVisible', String(state.chatPanelVisible));
        };
        setInterval(saveTabs, 5000);
        window.addEventListener('beforeunload', saveTabs);
        
        // Hide loading
        elements.loading.classList.add('hidden');
      });
    }
    
    init();
  </script>
</body>
</html>`;
}

export { EXTENSION_TO_LANGUAGE };
