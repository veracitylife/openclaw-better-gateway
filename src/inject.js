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

  let ideViewActive = false;

  // SVG icon for code/IDE (matches gateway's feather icon style)
  const IDE_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="16 18 22 12 16 6"></polyline>
      <polyline points="8 6 2 12 8 18"></polyline>
    </svg>
  `;

  function createIdeNavItem() {
    const item = document.createElement("a");
    item.id = "better-gateway-ide-nav";
    item.href = "#ide";
    item.className = "nav-item";
    item.title = "IDE - Code Editor";
    item.innerHTML = `
      <span class="nav-item__icon" aria-hidden="true">${IDE_ICON_SVG}</span>
      <span class="nav-item__text">IDE</span>
    `;

    item.addEventListener("click", function (e) {
      e.preventDefault();
      toggleIdeView();
    });

    return item;
  }

  function createIdeFrame() {
    const frame = document.createElement("iframe");
    frame.id = "better-gateway-ide-frame";
    frame.src = "/better-gateway/ide";
    frame.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      display: none;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #1e1e1e;
    `;
    return frame;
  }

  function toggleIdeView() {
    if (ideViewActive) {
      showChatView();
    } else {
      showIdeView();
    }
  }

  function showIdeView() {
    const main = document.querySelector("main.content");
    if (!main) return;

    let ideFrame = document.getElementById("better-gateway-ide-frame");
    
    // Create iframe if it doesn't exist
    if (!ideFrame) {
      ideFrame = createIdeFrame();
      // Insert frame as sibling to main, inside the same parent
      main.parentNode.style.position = "relative";
      main.parentNode.appendChild(ideFrame);
    }

    // Hide main content, show IDE
    main.style.display = "none";
    ideFrame.style.display = "block";

    // Update nav item active states
    const chatNav = document.querySelector('.nav-item[href="/chat"]') 
      || document.querySelector('.nav-item[href="/better-gateway/chat"]');
    const ideNav = document.getElementById("better-gateway-ide-nav");
    
    if (chatNav) chatNav.classList.remove("active");
    if (ideNav) ideNav.classList.add("active");

    ideViewActive = true;
    console.log("[BetterGateway] Switched to IDE view");
  }

  function showChatView() {
    const main = document.querySelector("main.content");
    const ideFrame = document.getElementById("better-gateway-ide-frame");

    // Show main content, hide IDE
    if (main) main.style.display = "";
    if (ideFrame) ideFrame.style.display = "none";

    // Update nav item active states
    const chatNav = document.querySelector('.nav-item[href="/chat"]') 
      || document.querySelector('.nav-item[href="/better-gateway/chat"]');
    const ideNav = document.getElementById("better-gateway-ide-nav");
    
    if (chatNav) chatNav.classList.add("active");
    if (ideNav) ideNav.classList.remove("active");

    ideViewActive = false;
    console.log("[BetterGateway] Switched to Chat view");
  }

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
      if (injectIdeNavItem()) {
        obs.disconnect();
      }
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
    });
  } else {
    updateStatus("connected", "Ready");
    tryInjectIdeNavItem();
  }

  window.addEventListener("online", function () {
    updateStatus("connected", "Back online");
  });

  window.addEventListener("offline", function () {
    updateStatus("disconnected", "Offline");
  });

  console.log("[BetterGateway] Auto-reconnect enabled", config);
})();
