/**
 * Terminal Page Generator
 * Creates a full-featured browser terminal using xterm.js (CDN)
 */

export interface TerminalPageConfig {
  xtermVersion: string;
  fitAddonVersion: string;
  webLinksAddonVersion: string;
}

const DEFAULT_CONFIG: TerminalPageConfig = {
  xtermVersion: "5.3.0",
  fitAddonVersion: "0.8.0",
  webLinksAddonVersion: "0.9.0",
};

export function generateTerminalPage(
  config: Partial<TerminalPageConfig> = {},
): string {
  const { xtermVersion, fitAddonVersion, webLinksAddonVersion } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const CDN = "https://cdn.jsdelivr.net/npm";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Better Gateway Terminal</title>
  <link rel="stylesheet" href="${CDN}/xterm@${xtermVersion}/css/xterm.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #1e1e1e;
      --fg: #cccccc;
      --status-bg: #007acc;
      --status-bg-err: #cc3333;
      --status-bg-warn: #cc7700;
    }

    html, body {
      background: var(--bg);
      color: var(--fg);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      height: 100%;
      overflow: hidden;
    }

    body {
      display: flex;
      flex-direction: column;
    }

    /* ---- terminal area ---- */
    #terminal-container {
      flex: 1;
      padding: 4px;
      overflow: hidden;
    }
    #terminal-container .xterm { height: 100%; }

    /* ---- status bar ---- */
    #status-bar {
      height: 22px;
      min-height: 22px;
      background: var(--status-bg);
      color: #fff;
      display: flex;
      align-items: center;
      padding: 0 10px;
      font-size: 12px;
      gap: 12px;
      user-select: none;
    }
    #status-bar.disconnected { background: var(--status-bg-err); }
    #status-bar.connecting   { background: var(--status-bg-warn); color: #1e1e1e; }
    .status-left  { display: flex; align-items: center; gap: 6px; }
    .status-right { margin-left: auto; display: flex; align-items: center; gap: 10px; opacity: 0.85; }

    /* ---- loading overlay ---- */
    #loading-overlay {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--bg);
      color: #888;
      font-size: 14px;
      z-index: 100;
      transition: opacity 0.3s;
    }
    #loading-overlay.hidden { opacity: 0; pointer-events: none; }
  </style>
</head>
<body>
  <div id="loading-overlay">Loading terminal&hellip;</div>
  <div id="terminal-container"></div>
  <div id="status-bar" class="connecting">
    <span class="status-left">
      <span id="conn-status">Connecting&hellip;</span>
    </span>
    <span class="status-right">
      <span id="term-size"></span>
    </span>
  </div>

  <script src="${CDN}/xterm@${xtermVersion}/lib/xterm.min.js"><\/script>
  <script src="${CDN}/xterm-addon-fit@${fitAddonVersion}/lib/xterm-addon-fit.min.js"><\/script>
  <script src="${CDN}/xterm-addon-web-links@${webLinksAddonVersion}/lib/xterm-addon-web-links.min.js"><\/script>
  <script>
  (function () {
    'use strict';

    // ---- guard CDN loads ----
    if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined') {
      document.getElementById('loading-overlay').textContent =
        'Failed to load terminal assets. Check your network / CDN access.';
      return;
    }

    // ---- create terminal ----
    var term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background:       '#1e1e1e',
        foreground:       '#cccccc',
        cursor:           '#aeafad',
        cursorAccent:     '#1e1e1e',
        selectionBackground: '#264f78',
        black:   '#000000', red:     '#cd3131', green:   '#0dbc79',
        yellow:  '#e5e510', blue:    '#2472c8', magenta: '#bc3fbc',
        cyan:    '#11a8cd', white:   '#e5e5e5',
        brightBlack: '#666666', brightRed:     '#f14c4c', brightGreen: '#23d18b',
        brightYellow:'#f5f543', brightBlue:    '#3b8eea', brightMagenta:'#d670d6',
        brightCyan:  '#29b8db', brightWhite:   '#e5e5e5'
      },
      scrollback: 10000,
      allowProposedApi: true,
    });

    var fitAddon  = new FitAddon.FitAddon();
    var linksAddon = (typeof WebLinksAddon !== 'undefined')
      ? new WebLinksAddon.WebLinksAddon()
      : null;

    term.loadAddon(fitAddon);
    if (linksAddon) term.loadAddon(linksAddon);

    var container = document.getElementById('terminal-container');
    term.open(container);
    fitAddon.fit();

    // Remove loading overlay
    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');

    // ---- DOM refs ----
    var statusBar  = document.getElementById('status-bar');
    var connStatus = document.getElementById('conn-status');
    var termSize   = document.getElementById('term-size');

    function showSize() {
      var d = fitAddon.proposeDimensions();
      if (d) termSize.textContent = d.cols + '\\u00d7' + d.rows;
    }
    showSize();

    // ---- WebSocket ----
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl    = protocol + '//' + location.host + '/better-gateway/terminal/ws';

    var ws = null;
    var reconnTimer = null;
    var reconnAttempts = 0;
    var MAX_RECONN = 10;
    var RECONN_DELAY = 2000;

    function setStatus(cls, text) {
      statusBar.className = cls;
      connStatus.textContent = text;
    }

    function connect() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

      setStatus('connecting',
        reconnAttempts > 0
          ? 'Reconnecting (' + reconnAttempts + '/' + MAX_RECONN + ')\\u2026'
          : 'Connecting\\u2026');

      ws = new WebSocket(wsUrl);

      ws.onopen = function () {
        reconnAttempts = 0;
        setStatus('', 'Connected');
        // send initial size
        var d = fitAddon.proposeDimensions();
        if (d) ws.send(JSON.stringify({ type: 'resize', cols: d.cols, rows: d.rows }));
      };

      ws.onmessage = function (ev) { term.write(ev.data); };

      ws.onclose = function () {
        setStatus('disconnected', 'Disconnected');
        if (reconnAttempts < MAX_RECONN) {
          reconnAttempts++;
          reconnTimer = setTimeout(connect, RECONN_DELAY);
        } else {
          setStatus('disconnected', 'Connection failed — click to retry');
          statusBar.style.cursor = 'pointer';
          statusBar.onclick = function () {
            statusBar.style.cursor = '';
            statusBar.onclick = null;
            reconnAttempts = 0;
            connect();
          };
        }
      };

      ws.onerror = function () { /* onclose fires next */ };
    }

    connect();

    // ---- terminal → server ----
    term.onData(function (data) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    // ---- resize handling ----
    function handleResize() {
      fitAddon.fit();
      showSize();
      if (ws && ws.readyState === WebSocket.OPEN) {
        var d = fitAddon.proposeDimensions();
        if (d) ws.send(JSON.stringify({ type: 'resize', cols: d.cols, rows: d.rows }));
      }
    }

    window.addEventListener('resize', handleResize);

    // ResizeObserver catches iframe resizes (the parent split-handle drag)
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () {
        // Small delay lets the layout settle before we measure
        setTimeout(handleResize, 30);
      }).observe(container);
    }

    // Parent frame can post messages to trigger resize / focus
    window.addEventListener('message', function (ev) {
      if (!ev.data) return;
      if (ev.data.type === 'resize')  setTimeout(handleResize, 50);
      if (ev.data.type === 'focus')   term.focus();
    });

    // ---- focus ----
    container.addEventListener('click', function () { term.focus(); });
    term.focus();

  })();
  <\/script>
</body>
</html>`;
}
