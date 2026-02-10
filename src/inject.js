(function () {
  "use strict";

  const config = window.__BETTER_GATEWAY_CONFIG__ || {
    reconnectIntervalMs: 3000,
    maxReconnectAttempts: 10,
  };

  let reconnectAttempts = 0;
  let statusIndicator = null;
  let originalWebSocket = window.WebSocket;
  let activeConnections = new Set();
  let currentState = "connected";
  let ideTabInjected = false;

  function createStatusIndicator() {
    if (statusIndicator) return statusIndicator;

    statusIndicator = document.createElement("div");
    statusIndicator.id = "better-gateway-status";
    statusIndicator.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 12px;
      padding: 8px 14px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 999999;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      user-select: none;
    `;

    // Click handler - always refresh the page
    statusIndicator.addEventListener("click", function () {
      window.location.reload();
    });

    // Hover effect
    statusIndicator.addEventListener("mouseenter", function () {
      statusIndicator.style.transform = "scale(1.05)";
      statusIndicator.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
    });
    statusIndicator.addEventListener("mouseleave", function () {
      statusIndicator.style.transform = "scale(1)";
      statusIndicator.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.15)";
    });

    document.body.appendChild(statusIndicator);
    return statusIndicator;
  }

  function updateStatus(state, message) {
    currentState = state;
    const indicator = createStatusIndicator();

    const styles = {
      connected: {
        background: "#10b981",
        color: "#ffffff",
        icon: "●",
      },
      disconnected: {
        background: "#ef4444",
        color: "#ffffff",
        icon: "●",
        clickHint: " (click to refresh)",
      },
      reconnecting: {
        background: "#f59e0b",
        color: "#ffffff",
        icon: "↻",
      },
      failed: {
        background: "#6b7280",
        color: "#ffffff",
        icon: "↻",
        clickHint: " (click to refresh)",
      },
    };

    const style = styles[state] || styles.disconnected;
    indicator.style.background = style.background;
    indicator.style.color = style.color;
    
    const displayMessage = message + (style.clickHint || "");
    indicator.innerHTML = `<span style="margin-right: 6px;">${style.icon}</span>${displayMessage}`;
    indicator.title = "Click to refresh page";

    if (state === "connected") {
      setTimeout(function () {
        indicator.style.opacity = "0.7";
      }, 2000);
    } else {
      indicator.style.opacity = "1";
    }
  }

  // ==================== IDE Embedded View ====================

  // View modes: 'chat' | 'ide' | 'split'
  let currentViewMode = 'chat';

  // SVG icon for code/IDE (matches gateway's feather icon style)
  const IDE_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="16 18 22 12 16 6"></polyline>
      <polyline points="8 6 2 12 8 18"></polyline>
    </svg>
  `;

  // SVG icon for split view
  const SPLIT_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="12" y1="3" x2="12" y2="21"></line>
    </svg>
  `;

  function createIdeNavItem() {
    const item = document.createElement("a");
    item.id = "better-gateway-ide-nav";
    item.href = "#ide";
    item.className = "nav-item";
    item.title = "IDE - Code Editor (click for split view, Shift+click for IDE only)";
    item.innerHTML = `
      <span class="nav-item__icon" aria-hidden="true">${IDE_ICON_SVG}</span>
      <span class="nav-item__text">IDE</span>
    `;

    item.addEventListener("click", function (e) {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+click toggles IDE-only view
        if (currentViewMode === 'ide') {
          setViewMode('chat');
        } else {
          setViewMode('ide');
        }
      } else {
        // Regular click toggles split view (Cursor-like experience)
        if (currentViewMode === 'split') {
          setViewMode('chat');
        } else {
          setViewMode('split');
        }
      }
    });

    return item;
  }

  function createIdeFrame() {
    const frame = document.createElement("iframe");
    frame.id = "better-gateway-ide-frame";
    frame.src = "/better-gateway/ide";
    frame.style.cssText = `
      border: none;
      background: #1e1e1e;
      display: none;
    `;
    return frame;
  }

  function createSplitResizeHandle() {
    const handle = document.createElement("div");
    handle.id = "better-gateway-split-handle";
    handle.style.cssText = `
      width: 4px;
      cursor: col-resize;
      background: #3c3c3c;
      display: none;
      flex-shrink: 0;
    `;
    handle.addEventListener("mouseenter", function() {
      handle.style.background = "#0078d4";
    });
    handle.addEventListener("mouseleave", function() {
      if (!handle.dataset.dragging) {
        handle.style.background = "#3c3c3c";
      }
    });
    return handle;
  }

  function setupSplitResize() {
    const handle = document.getElementById("better-gateway-split-handle");
    const ideFrame = document.getElementById("better-gateway-ide-frame");
    if (!handle || !ideFrame) return;

    let isDragging = false;

    handle.addEventListener("mousedown", function(e) {
      isDragging = true;
      handle.dataset.dragging = "true";
      handle.style.background = "#0078d4";
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // Keep receiving mouse events when cursor crosses the iframe.
      ideFrame.style.pointerEvents = "none";
      e.preventDefault();
    });

    document.addEventListener("mousemove", function(e) {
      if (!isDragging) return;
      const container = ideFrame.parentElement;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      const minWidth = 300;
      const maxWidth = containerRect.width - 350; // Leave room for chat
      const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);

      ideFrame.style.width = clampedWidth + "px";
      ideFrame.style.flex = "none";
    });

    document.addEventListener("mouseup", function() {
      if (isDragging) {
        isDragging = false;
        delete handle.dataset.dragging;
        handle.style.background = "#3c3c3c";
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        ideFrame.style.pointerEvents = "";
      }
    });
  }

  function setViewMode(mode) {
    const main = document.querySelector("main.content");
    if (!main) return;

    // Create or get the split container (flex wrapper for IDE | handle | chat)
    let splitWrapper = document.getElementById("better-gateway-split-wrapper");
    let ideFrame = document.getElementById("better-gateway-ide-frame");
    let splitHandle = document.getElementById("better-gateway-split-handle");

    if (!splitWrapper) {
      // Create wrapper: flex row container that replaces main in the layout
      splitWrapper = document.createElement("div");
      splitWrapper.id = "better-gateway-split-wrapper";
      splitWrapper.style.cssText = `
        display: flex;
        flex-direction: row;
        flex: 1;
        overflow: hidden;
        min-width: 0;
        min-height: 0;
      `;
      ideFrame = createIdeFrame();
      splitHandle = createSplitResizeHandle();

      // Wrap main: replace main with wrapper, put main inside wrapper
      const parent = main.parentNode;
      parent.replaceChild(splitWrapper, main);
      splitWrapper.appendChild(ideFrame);
      splitWrapper.appendChild(splitHandle);
      splitWrapper.appendChild(main);

      setupSplitResize();
    } else {
      ideFrame = document.getElementById("better-gateway-ide-frame");
      splitHandle = document.getElementById("better-gateway-split-handle");
    }

    const chatNav = document.querySelector('.nav-item[href="/chat"]') 
      || document.querySelector('.nav-item[href="/better-gateway/chat"]');
    const ideNav = document.getElementById("better-gateway-ide-nav");

    // Apply the view mode
    if (mode === 'chat') {
      // Chat only - hide IDE, chat takes full width
      ideFrame.style.display = "none";
      splitHandle.style.display = "none";
      main.style.display = "";
      main.style.flex = "1";
      main.style.width = "";
      main.style.minWidth = "";
      main.style.overflow = "";
      
      if (chatNav) chatNav.classList.add("active");
      if (ideNav) ideNav.classList.remove("active");
      
    } else if (mode === 'ide') {
      // IDE only - IDE takes full width
      ideFrame.style.display = "block";
      ideFrame.style.width = "100%";
      ideFrame.style.height = "100%";
      ideFrame.style.flex = "1";
      ideFrame.style.minWidth = "";
      splitHandle.style.display = "none";
      main.style.display = "none";
      
      if (chatNav) chatNav.classList.remove("active");
      if (ideNav) ideNav.classList.add("active");
      
    } else if (mode === 'split') {
      // Split view: IDE (left) | handle | Chat (right sidebar)
      ideFrame.style.display = "block";
      ideFrame.style.width = "55%";
      ideFrame.style.height = "100%";
      ideFrame.style.flex = "none";
      ideFrame.style.minWidth = "280px";
      splitHandle.style.display = "block";
      main.style.display = "";
      main.style.flex = "1";
      main.style.width = "";
      main.style.minWidth = "320px";
      main.style.overflow = "auto";
      
      // Both nav items get a special state
      if (chatNav) chatNav.classList.add("active");
      if (ideNav) ideNav.classList.add("active");
    }

    currentViewMode = mode;
    // Update legacy flag for nav click handlers
    ideViewActive = (mode === 'ide' || mode === 'split');
    console.log("[BetterGateway] View mode:", mode);
  }

  // Legacy function names for compatibility
  function toggleIdeView() {
    if (currentViewMode === 'ide' || currentViewMode === 'split') {
      setViewMode('chat');
    } else {
      setViewMode('ide');
    }
  }

  function showIdeView() {
    setViewMode('ide');
  }

  function showChatView() {
    setViewMode('chat');
  }

  // Track if IDE/split view is active (for nav click handlers)
  let ideViewActive = false;

  function injectIdeNavItem() {
    if (ideTabInjected) return false;

    // Don't inject on the standalone IDE page
    if (window.location && window.location.pathname === "/better-gateway/ide") {
      return false;
    }

    // Check if already injected
    if (document.getElementById("better-gateway-ide-nav")) {
      ideTabInjected = true;
      return false;
    }

    // Find the Chat section's nav-group__items container
    // The gateway structure is: .nav-group > .nav-group__items > .nav-item[href="/chat"]
    // Note: When accessed via /better-gateway/, links become /better-gateway/chat
    const chatLink = document.querySelector('.nav-item[href="/chat"]') 
      || document.querySelector('.nav-item[href="/better-gateway/chat"]');
    if (!chatLink) {
      return false;
    }

    const navItems = chatLink.parentElement;
    if (!navItems || !navItems.classList.contains("nav-group__items")) {
      return false;
    }

    // Intercept Chat link clicks when IDE is active
    chatLink.addEventListener("click", function (e) {
      if (ideViewActive) {
        e.preventDefault();
        e.stopPropagation();
        showChatView();
      }
    });

    // For all other nav items, restore main content before navigation
    // This ensures the gateway's SPA routing works properly
    const allNavItems = document.querySelectorAll(".nav-item");
    allNavItems.forEach(function (navItem) {
      // Skip Chat and IDE links (handled separately)
      if (navItem === chatLink || navItem.id === "better-gateway-ide-nav") {
        return;
      }
      
      navItem.addEventListener("click", function () {
        if (ideViewActive) {
          // Restore original content before navigation
          showChatView();
        }
      });
    });

    // Create and insert IDE nav item after Chat
    const ideNavItem = createIdeNavItem();
    navItems.appendChild(ideNavItem);

    ideTabInjected = true;
    console.log("[BetterGateway] IDE nav item injected below Chat");
    return true;
  }

  function tryInjectIdeNavItem() {
    // Try immediately
    if (injectIdeNavItem()) return;

    // Retry a few times with increasing delays (handles SPAs)
    var retryDelays = [100, 300, 500, 1000, 2000];
    var retryIndex = 0;
    
    function retryInjection() {
      if (injectIdeNavItem()) return;
      if (retryIndex < retryDelays.length) {
        setTimeout(retryInjection, retryDelays[retryIndex++]);
      }
    }
    setTimeout(retryInjection, retryDelays[retryIndex++]);

    // Also use MutationObserver for dynamic content
    var observer = new MutationObserver(function (mutations, obs) {
      try {
        if (injectIdeNavItem()) {
          obs.disconnect();
        }
      } catch (_error) {}
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Give up after 10 seconds
    setTimeout(function () {
      observer.disconnect();
    }, 10000);
  }

  // ==================== Chat Sidebar Mention Enhancer ====================

  const mentionState = {
    textarea: null,
    composer: null,
    chips: null,
    picker: null,
    files: [],
    selected: [],
    pickerOpen: false,
    pickerItems: [],
    activeIndex: 0,
    mentionRange: null,
    pendingPayloadRefs: null,
    suppressNextSubmit: false,
  };

  const FILE_CONTEXT_CHAR_LIMIT = 6000;
  const TOTAL_CONTEXT_CHAR_LIMIT = 18000;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function fetchWorkspaceFiles() {
    if (typeof fetch !== "function") return;
    try {
      const response = await fetch("/better-gateway/api/files?path=%2F&recursive=true");
      if (!response.ok) return;
      const payload = await response.json();
      mentionState.files = Array.isArray(payload.files)
        ? payload.files.filter((entry) => entry && entry.type === "file").map((entry) => entry.path)
        : [];
      if (mentionState.textarea) refreshMentionPicker();
    } catch (error) {
      console.warn("[BetterGateway] failed to index workspace files", error);
    }
  }

  function findMentionRange(value, cursorIndex) {
    const before = value.slice(0, cursorIndex);
    const match = before.match(/(^|\s)@([^\s@.,!?;:]*)$/);
    if (!match) return null;
    const token = match[0];
    const query = match[2] || "";
    const atIndex = cursorIndex - token.length + token.lastIndexOf("@");
    return { start: atIndex, end: cursorIndex, query };
  }

  function extractTrailingMentionQuery(value) {
    const text = String(value || "");
    const match = text.match(/(?:^|\s)@([^\s@.,!?;:]*)$/);
    if (!match) return null;
    return match[1] || "";
  }

  function extractMessageTextFromParams(params) {
    if (!params || typeof params !== "object") return null;
    const candidates = [params.message, params.text, params.input, params.prompt, params.query];
    for (const value of candidates) {
      if (typeof value === "string") return value;
    }
    return null;
  }

  function getMentionCandidates(query) {
    const needle = String(query || "").toLowerCase();
    return mentionState.files
      .filter((path) => !mentionState.selected.some((entry) => entry.path === path))
      .map((path) => {
        const lower = path.toLowerCase();
        const index = needle ? lower.indexOf(needle) : 0;
        return { path, index, name: path.split("/").pop() || path };
      })
      .filter((item) => !needle || item.index !== -1)
      .sort((a, b) => {
        if (a.index !== b.index) return a.index - b.index;
        if (a.path.length !== b.path.length) return a.path.length - b.path.length;
        return a.path.localeCompare(b.path);
      })
      .slice(0, 20);
  }

  function closeMentionPicker() {
    mentionState.pickerOpen = false;
    mentionState.pickerItems = [];
    mentionState.mentionRange = null;
    if (mentionState.picker) {
      mentionState.picker.style.display = "none";
      mentionState.picker.innerHTML = "";
    }
  }

  function renderMentionPicker() {
    if (!mentionState.picker || !mentionState.pickerOpen || mentionState.pickerItems.length === 0) {
      closeMentionPicker();
      return;
    }

    mentionState.picker.innerHTML = mentionState.pickerItems
      .map((item, idx) => {
        const activeClass = idx === mentionState.activeIndex ? "active" : "";
        return '<div class="better-gateway-chat-file-option ' + activeClass + '" data-path="' + escapeHtml(item.path) + '">'
          + '<span class="path">' + escapeHtml(item.path) + '</span>'
          + '<span class="name">' + escapeHtml(item.name) + '</span>'
          + '</div>';
      })
      .join("");
    mentionState.picker.style.display = "block";

    mentionState.picker.querySelectorAll(".better-gateway-chat-file-option").forEach(function (option) {
      option.addEventListener("mousedown", function (event) {
        event.preventDefault();
        selectMentionFile(option.dataset.path || "");
      });
    });
  }

  function renderMentionChips() {
    if (!mentionState.chips) return;
    if (typeof document === "undefined" || !document.createElement) return;
    mentionState.chips.innerHTML = "";

    mentionState.selected.forEach(function (entry) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "better-gateway-chat-file-chip";
      chip.setAttribute("data-path", entry.path);
      chip.innerHTML = '<span class="chip-path">' + escapeHtml(entry.path) + '</span><span class="chip-remove" aria-hidden="true">×</span>';
      chip.addEventListener("click", function () {
        mentionState.selected = mentionState.selected.filter((item) => item.path !== entry.path);
        renderMentionChips();
        refreshMentionPicker();
      });
      mentionState.chips.appendChild(chip);
    });
  }

  function refreshMentionPicker() {
    if (!mentionState.textarea) return;
    const range = findMentionRange(mentionState.textarea.value, mentionState.textarea.selectionStart || 0);
    if (!range) {
      closeMentionPicker();
      return;
    }
    mentionState.mentionRange = range;
    mentionState.pickerItems = getMentionCandidates(range.query);
    mentionState.activeIndex = Math.min(mentionState.activeIndex, Math.max(mentionState.pickerItems.length - 1, 0));
    mentionState.pickerOpen = mentionState.pickerItems.length > 0;
    renderMentionPicker();
  }

  async function readFileContext(path) {
    const response = await fetch("/better-gateway/api/files/read?path=" + encodeURIComponent(path));
    if (!response.ok) throw new Error("read failed");
    const payload = await response.json();
    const content = String(payload.content || "");
    if (content.length <= FILE_CONTEXT_CHAR_LIMIT) {
      return { path, content, truncated: false };
    }
    return {
      path,
      content: content.slice(0, FILE_CONTEXT_CHAR_LIMIT),
      truncated: true,
      originalLength: content.length,
    };
  }

  async function selectMentionFile(path) {
    if (!path) return;
    if (mentionState.selected.some((entry) => entry.path === path)) return;

    let context = { path, content: "", truncated: false, error: "pending" };
    mentionState.selected.push(context);
    renderMentionChips();

    const range = mentionState.mentionRange;
    if (range && mentionState.textarea) {
      const nextValue = mentionState.textarea.value.slice(0, range.start) + mentionState.textarea.value.slice(range.end);
      mentionState.textarea.value = nextValue;
      mentionState.textarea.setSelectionRange(range.start, range.start);
    }

    closeMentionPicker();
    if (mentionState.textarea) mentionState.textarea.focus();

    try {
      const loaded = await readFileContext(path);
      const idx = mentionState.selected.findIndex((entry) => entry.path === path);
      if (idx !== -1) {
        mentionState.selected[idx] = loaded;
      }
    } catch (error) {
      const idx = mentionState.selected.findIndex((entry) => entry.path === path);
      if (idx !== -1) {
        mentionState.selected[idx] = { path, content: "", truncated: false, error: "read_failed" };
      }
    }
    renderMentionChips();
  }

  function consumePendingFileRefs() {
    const refs = mentionState.pendingPayloadRefs && mentionState.pendingPayloadRefs.length
      ? mentionState.pendingPayloadRefs
      : mentionState.selected;
    mentionState.pendingPayloadRefs = null;
    if (!refs || refs.length === 0) return [];

    let remaining = TOTAL_CONTEXT_CHAR_LIMIT;
    const output = [];
    refs.forEach(function (entry) {
      if (!entry || !entry.path || remaining <= 0) return;
      const content = String(entry.content || "");
      if (!content) {
        output.push({ path: entry.path, truncated: Boolean(entry.truncated), error: entry.error || "empty" });
        return;
      }
      const slice = content.slice(0, remaining);
      output.push({
        path: entry.path,
        content: slice,
        truncated: Boolean(entry.truncated) || slice.length < content.length,
      });
      remaining -= slice.length;
    });
    mentionState.selected = [];
    renderMentionChips();
    return output;
  }

  function buildMessageWithFileRefs(baseMessage, fileRefs) {
    const body = String(baseMessage || "");
    if (!fileRefs || fileRefs.length === 0) return body;

    const summary = fileRefs.map(function (ref) { return "@" + ref.path; }).join(" ");
    const blocks = fileRefs.map(function (ref) {
      const meta = [];
      if (ref.truncated) meta.push("truncated");
      if (ref.error) meta.push("error:" + ref.error);
      const metaText = meta.length ? " " + meta.join(",") : "";
      const content = ref.content ? "\n" + ref.content : "\n(unavailable)";
      return "<file path=\"" + ref.path + "\"" + metaText + ">" + content + "\n</file>";
    }).join("\n\n");

    return body + "\n\nAttached files: " + summary + "\n\n" + blocks;
  }

  function queuePendingRefsForNextSend() {
    if (!mentionState.selected.length) return;
    mentionState.pendingPayloadRefs = mentionState.selected.map(function (entry) { return { ...entry }; });
    mentionState.selected = [];
    renderMentionChips();
    closeMentionPicker();
  }

  function attachChatComposerEnhancements() {
    if (typeof document === "undefined" || !document.querySelector) return;
    const textarea = document.querySelector("main.content textarea");
    if (!textarea || mentionState.textarea === textarea) return;

    mentionState.textarea = textarea;
    mentionState.composer = textarea.parentElement || textarea.closest("form") || textarea.parentElement;
    if (!mentionState.composer) return;

    let chips = mentionState.composer.querySelector(".better-gateway-chat-file-chips");
    if (!chips) {
      chips = document.createElement("div");
      chips.className = "better-gateway-chat-file-chips";
      textarea.parentElement.insertBefore(chips, textarea);
    }

    let picker = mentionState.composer.querySelector(".better-gateway-chat-file-picker");
    if (!picker) {
      picker = document.createElement("div");
      picker.className = "better-gateway-chat-file-picker";
      textarea.parentElement.insertBefore(picker, textarea);
    }

    mentionState.chips = chips;
    mentionState.picker = picker;

    if (!document.getElementById("better-gateway-chat-mention-style")) {
      const style = document.createElement("style");
      style.id = "better-gateway-chat-mention-style";
      style.textContent = `
        .better-gateway-chat-file-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .better-gateway-chat-file-chip { border: 1px solid #2a4a67; background: #1f3347; color: #dbeafe; border-radius: 999px; padding: 4px 8px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
        .better-gateway-chat-file-chip .chip-path { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .better-gateway-chat-file-chip .chip-remove { font-size: 12px; line-height: 1; }
        .better-gateway-chat-file-picker { position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); background: #1e1e1e; border: 1px solid #3c3c3c; border-radius: 8px; max-height: 220px; overflow: auto; display: none; z-index: 999; }
        .better-gateway-chat-file-option { display: flex; justify-content: space-between; gap: 8px; padding: 8px 10px; cursor: pointer; }
        .better-gateway-chat-file-option:hover, .better-gateway-chat-file-option.active { background: #2a2d2e; }
        .better-gateway-chat-file-option .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .better-gateway-chat-file-option .name { color: #8b8b8b; font-size: 11px; }
      `;
      document.head.appendChild(style);
    }

    mentionState.composer.style.position = mentionState.composer.style.position || "relative";

    textarea.addEventListener("input", refreshMentionPicker);
    textarea.addEventListener("click", refreshMentionPicker);
    textarea.addEventListener("keydown", function (event) {
      const liveRange = findMentionRange(textarea.value, textarea.selectionStart || 0);

      if (event.key === "ArrowDown" && mentionState.pickerOpen) {
        event.preventDefault();
        mentionState.activeIndex = (mentionState.activeIndex + 1) % mentionState.pickerItems.length;
        renderMentionPicker();
        return;
      }
      if (event.key === "ArrowUp" && mentionState.pickerOpen) {
        event.preventDefault();
        mentionState.activeIndex = (mentionState.activeIndex - 1 + mentionState.pickerItems.length) % mentionState.pickerItems.length;
        renderMentionPicker();
        return;
      }
      if (event.key === "Escape" && mentionState.pickerOpen) {
        event.preventDefault();
        closeMentionPicker();
        return;
      }

      if (event.key === "Enter" && !event.shiftKey && (mentionState.pickerOpen || liveRange)) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        mentionState.suppressNextSubmit = true;
        setTimeout(function () {
          mentionState.suppressNextSubmit = false;
        }, 0);

        if (!mentionState.pickerOpen) {
          refreshMentionPicker();
        }

        const selected = mentionState.pickerItems[mentionState.activeIndex] || mentionState.pickerItems[0];
        if (selected) {
          selectMentionFile(selected.path);
        }
        return;
      }

      if (event.key === "Backspace" && !textarea.value && mentionState.selected.length > 0) {
        mentionState.selected.pop();
        renderMentionChips();
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        queuePendingRefsForNextSend();
      }
    }, true);

    const form = textarea.closest("form");
    if (form) {
      form.addEventListener("submit", function (event) {
        const liveRange = findMentionRange(textarea.value, textarea.selectionStart || 0);
        if (mentionState.suppressNextSubmit || mentionState.pickerOpen || liveRange) {
          mentionState.suppressNextSubmit = false;
          if (!mentionState.pickerOpen && liveRange) {
            refreshMentionPicker();
          }
          const selected = mentionState.pickerItems[mentionState.activeIndex] || mentionState.pickerItems[0];
          if (selected) {
            selectMentionFile(selected.path);
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        queuePendingRefsForNextSend();
      }, true);
    }

    const sendButton = mentionState.composer.querySelector('button[type="submit"]');
    if (sendButton) {
      sendButton.addEventListener("click", function () {
        queuePendingRefsForNextSend();
      });
    }

    renderMentionChips();
  }

  function startChatComposerEnhancer() {
    fetchWorkspaceFiles();
    attachChatComposerEnhancements();
    if (!document.body) return;
    const observer = new MutationObserver(function () {
      try {
        attachChatComposerEnhancements();
      } catch (_error) {}
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function wrapWebSocket(OriginalWebSocket) {
    function BetterWebSocket(url, protocols) {
      const ws = new OriginalWebSocket(url, protocols);
      const wrappedWs = ws;

      activeConnections.add(wrappedWs);

      ws.addEventListener("open", function () {
        reconnectAttempts = 0;
        updateStatus("connected", "Connected");
      });

      ws.addEventListener("close", function (event) {
        activeConnections.delete(wrappedWs);

        if (!event.wasClean && reconnectAttempts < config.maxReconnectAttempts) {
          reconnectAttempts++;
          updateStatus(
            "reconnecting",
            "Reconnecting (" + reconnectAttempts + "/" + config.maxReconnectAttempts + ")..."
          );

          setTimeout(function () {
            try {
              new BetterWebSocket(url, protocols);
            } catch (e) {
              console.error("[BetterGateway] Reconnection failed:", e);
            }
          }, config.reconnectIntervalMs);
        } else if (reconnectAttempts >= config.maxReconnectAttempts) {
          updateStatus("failed", "Connection failed");
        } else {
          updateStatus("disconnected", "Disconnected");
        }
      });

      ws.addEventListener("error", function () {
        updateStatus("disconnected", "Connection error");
      });

      const originalSend = ws.send && ws.send.bind(ws);
      if (originalSend) {
        ws.send = function (data) {
          try {
            if (typeof data === "string") {
              const frame = JSON.parse(data);
              if (frame && frame.type === "req" && frame.method === "chat.send" && frame.params) {
                const activeTextarea = document.querySelector("main.content textarea") || mentionState.textarea;
                const activeValue = activeTextarea && typeof activeTextarea.value === "string" ? activeTextarea.value : "";
                const activeCursor = activeTextarea && typeof activeTextarea.selectionStart === "number" ? activeTextarea.selectionStart : activeValue.length;
                const liveRange = activeValue ? findMentionRange(activeValue, activeCursor) : null;

                const outboundText = extractMessageTextFromParams(frame.params);
                const trailingQuery = outboundText != null ? extractTrailingMentionQuery(outboundText) : null;

                if (mentionState.pickerOpen || (liveRange && activeTextarea) || trailingQuery !== null) {
                  if (!mentionState.pickerOpen) {
                    if (activeTextarea && liveRange) {
                      mentionState.textarea = activeTextarea;
                      refreshMentionPicker();
                    } else {
                      const inferred = getMentionCandidates(trailingQuery || "");
                      mentionState.pickerItems = inferred;
                      mentionState.activeIndex = 0;
                    }
                  }
                  const selected = mentionState.pickerItems[mentionState.activeIndex] || mentionState.pickerItems[0];
                  if (selected) {
                    selectMentionFile(selected.path);
                    return;
                  }
                }

                const fileRefs = consumePendingFileRefs();
                if (fileRefs.length > 0) {
                  if (typeof frame.params.message === "string") {
                    frame.params.message = buildMessageWithFileRefs(frame.params.message, fileRefs);
                  } else if (typeof frame.params.text === "string") {
                    frame.params.text = buildMessageWithFileRefs(frame.params.text, fileRefs);
                  } else if (typeof frame.params.input === "string") {
                    frame.params.input = buildMessageWithFileRefs(frame.params.input, fileRefs);
                  }
                  data = JSON.stringify(frame);
                }
              }
            }
          } catch (error) {
            // non-JSON frame or parse issues; pass through untouched
          }
          return originalSend(data);
        };
      }

      return ws;
    }

    BetterWebSocket.prototype = OriginalWebSocket.prototype;
    BetterWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    BetterWebSocket.OPEN = OriginalWebSocket.OPEN;
    BetterWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    BetterWebSocket.CLOSED = OriginalWebSocket.CLOSED;

    return BetterWebSocket;
  }

  window.WebSocket = wrapWebSocket(originalWebSocket);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      updateStatus("connected", "Ready");
      tryInjectIdeNavItem();
      startChatComposerEnhancer();
    });
  } else {
    updateStatus("connected", "Ready");
    tryInjectIdeNavItem();
    startChatComposerEnhancer();
  }

  window.addEventListener("online", function () {
    updateStatus("connected", "Back online");
  });

  window.addEventListener("offline", function () {
    updateStatus("disconnected", "Offline");
  });

  console.log("[BetterGateway] Auto-reconnect enabled", config);
})();
