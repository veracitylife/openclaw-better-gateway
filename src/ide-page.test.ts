import { describe, it, expect } from "vitest";
import { generateIdePage, EXTENSION_TO_LANGUAGE } from "./ide-page.js";

describe("IDE Page Generator", () => {
  describe("generateIdePage", () => {
    it("should generate valid HTML document", () => {
      const html = generateIdePage();
      
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html lang=\"en\">");
      expect(html).toContain("</html>");
    });

    it("should include Monaco loader script from CDN", () => {
      const html = generateIdePage();
      
      expect(html).toContain("cdn.jsdelivr.net/npm/monaco-editor");
      expect(html).toContain("loader.js");
    });

    it("should use default Monaco version 0.52.0", () => {
      const html = generateIdePage();
      
      expect(html).toContain("monaco-editor@0.52.0");
    });

    it("should allow custom Monaco version", () => {
      const html = generateIdePage({ monacoVersion: "0.45.0" });
      
      expect(html).toContain("monaco-editor@0.45.0");
    });

    it("should use vs-dark theme by default", () => {
      const html = generateIdePage();
      
      expect(html).toContain("theme: 'vs-dark'");
    });

    it("should allow custom theme", () => {
      const html = generateIdePage({ theme: "vs" });
      
      expect(html).toContain("theme: 'vs'");
    });

    it("should include file tree sidebar", () => {
      const html = generateIdePage();
      
      expect(html).toContain("id=\"sidebar\"");
      expect(html).toContain("id=\"file-tree\"");
      expect(html).toContain("Explorer");
    });

    it("should include editor container", () => {
      const html = generateIdePage();
      
      expect(html).toContain("id=\"editor-container\"");
      expect(html).toContain("id=\"editor-area\"");
    });

    it("should include tab bar", () => {
      const html = generateIdePage();
      
      expect(html).toContain("id=\"tab-bar\"");
    });

    it("should include integrated chat panel shell", () => {
      const html = generateIdePage();

      expect(html).toContain('id="chat-panel"');
      expect(html).toContain('id="chat-messages"');
      expect(html).toContain('id="chat-input"');
      expect(html).toContain('id="chat-send"');
      expect(html).toContain('Ctrl+Shift+C');
    });

    it("should include @file mention picker and chips UI in chat composer", () => {
      const html = generateIdePage();

      expect(html).toContain('id="chat-file-picker"');
      expect(html).toContain('id="chat-file-chips"');
      expect(html).toContain('chat-file-chip');
      expect(html).toContain('chat-file-option');
    });

    it("should include mention autocomplete handlers with keyboard selection", () => {
      const html = generateIdePage();

      expect(html).toContain('findMentionRange');
      expect(html).toContain('refreshMentionPicker');
      expect(html).toContain('selectMentionFile');
      expect(html).toContain("e.key === 'ArrowDown'");
      expect(html).toContain("e.key === 'ArrowUp'");
      expect(html).toContain("state.chatMentionFiles.push(path)");
    });

    it("should include toolbar with buttons", () => {
      const html = generateIdePage();
      
      expect(html).toContain("id=\"toolbar\"");
      expect(html).toContain("id=\"toggle-sidebar\"");
      expect(html).toContain("id=\"new-file-btn\"");
      expect(html).toContain("id=\"open-folder-btn\"");
      expect(html).toContain("id=\"workspace-path\"");
    });

    it("should include welcome screen", () => {
      const html = generateIdePage();
      
      expect(html).toContain("id=\"welcome\"");
      expect(html).toContain("Better Gateway IDE");
      expect(html).toContain("Open a file from the sidebar");
    });

    it("should include keyboard shortcuts info", () => {
      const html = generateIdePage();
      
      expect(html).toContain("Ctrl+S");
      expect(html).toContain("Ctrl+B");
      expect(html).toContain("Ctrl+W");
    });

    it("should include loading overlay", () => {
      const html = generateIdePage();
      
      expect(html).toContain("id=\"loading\"");
      expect(html).toContain("spinner");
    });

    it("should include context menu", () => {
      const html = generateIdePage();
      
      expect(html).toContain("id=\"context-menu\"");
      expect(html).toContain("data-action=\"new-file\"");
      expect(html).toContain("data-action=\"new-folder\"");
      expect(html).toContain("data-action=\"delete\"");
    });

    it("should include file API base URL", () => {
      const html = generateIdePage();
      
      expect(html).toContain("/better-gateway/api/files");
    });

    it("should include extension to language mapping", () => {
      const html = generateIdePage();
      
      expect(html).toContain("typescript");
      expect(html).toContain("javascript");
      expect(html).toContain("python");
      expect(html).toContain("markdown");
    });

    it("should include save functionality", () => {
      const html = generateIdePage();
      
      expect(html).toContain("saveCurrentFile");
      expect(html).toContain("id=\"save-status\"");
    });

    it("should include chat transport protocol wiring", () => {
      const html = generateIdePage();

      expect(html).toContain("openclaw.control.settings.v1");
      expect(html).toContain("chat.send");
      expect(html).toContain("sendRequest('connect'");
      expect(html).toContain("new WebSocket");
    });

    it("should include localStorage state persistence", () => {
      const html = generateIdePage();
      
      expect(html).toContain("localStorage.setItem");
      expect(html).toContain("localStorage.getItem");
      expect(html).toContain("openTabs");
      expect(html).toContain("activeTab");
    });

    it("should include resize handle for sidebar", () => {
      const html = generateIdePage();
      
      expect(html).toContain("id=\"resize-handle\"");
      expect(html).toContain("setupResizeHandle");
    });

    it("should include CSS custom properties for theming", () => {
      const html = generateIdePage();
      
      expect(html).toContain("--bg-primary");
      expect(html).toContain("--text-primary");
      expect(html).toContain("--accent");
    });
  });

  describe("EXTENSION_TO_LANGUAGE mapping", () => {
    it("should map TypeScript extensions", () => {
      expect(EXTENSION_TO_LANGUAGE.ts).toBe("typescript");
      expect(EXTENSION_TO_LANGUAGE.tsx).toBe("typescript");
    });

    it("should map JavaScript extensions", () => {
      expect(EXTENSION_TO_LANGUAGE.js).toBe("javascript");
      expect(EXTENSION_TO_LANGUAGE.jsx).toBe("javascript");
    });

    it("should map common file types", () => {
      expect(EXTENSION_TO_LANGUAGE.json).toBe("json");
      expect(EXTENSION_TO_LANGUAGE.md).toBe("markdown");
      expect(EXTENSION_TO_LANGUAGE.html).toBe("html");
      expect(EXTENSION_TO_LANGUAGE.css).toBe("css");
      expect(EXTENSION_TO_LANGUAGE.py).toBe("python");
    });

    it("should map shell scripts", () => {
      expect(EXTENSION_TO_LANGUAGE.sh).toBe("shell");
      expect(EXTENSION_TO_LANGUAGE.bash).toBe("shell");
      expect(EXTENSION_TO_LANGUAGE.zsh).toBe("shell");
    });

    it("should map config files", () => {
      expect(EXTENSION_TO_LANGUAGE.yaml).toBe("yaml");
      expect(EXTENSION_TO_LANGUAGE.yml).toBe("yaml");
      expect(EXTENSION_TO_LANGUAGE.toml).toBe("toml");
      expect(EXTENSION_TO_LANGUAGE.ini).toBe("ini");
    });
  });
});
