<p align="center">
  <img src="packages/extension/public/icon.svg" width="128" height="128" alt="OpenBrowserMCP" />
</p>

# OpenBrowserMCP

Control Chrome from any MCP-compatible AI agent (Claude Code, Claude Desktop, Cursor, etc.) via a local WebSocket bridge and the Model Context Protocol.

## Architecture

```
MCP Client (Claude Code / Claude Desktop / Cursor)
    │
    │  MCP Streamable HTTP  (http://localhost:3500/mcp)
    ▼
MCP Server  (Node.js + TypeScript, port 3500)
    │
    │  WebSocket  (ws://localhost:3500/ws)
    ▼
Chrome Extension  (Manifest V3, service worker)
    │
    │  Chrome DevTools Protocol (chrome.debugger)
    ▼
Chrome Browser  (any tab)
```

Everything runs **100% locally** — no relay servers, no cloud services.

## Prerequisites

- **Node.js** v18 or later (v24 recommended)
- **pnpm** v8 or later (`npm install -g pnpm`)
- **Google Chrome** (any recent stable version)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/thezzisu/openbrowsermcp.git
cd openbrowsermcp
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Build all packages

```bash
pnpm run build
```

### 4. Start the MCP server

```bash
# Using pnpm filter
pnpm --filter server start

# Or directly
node packages/server/dist/index.js
```

The server listens on `http://localhost:3500`.

### 5. Load the Chrome extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `packages/extension/dist/` folder

### 6. Configure the extension

1. Click the extension icon → **Options** (or right-click → Options)
2. Verify the **Server URL** field shows `ws://localhost:3500/ws`
3. The status should change to **Connected** ✅

You can verify the connection with:

```bash
curl http://localhost:3500/status
# {"connectedExtensions":[{"id":"...","connectedAt":"...","activeTabId":...}]}
```

## Using with Claude Code

Add OpenBrowserMCP to your `.mcp.json` configuration:

```json
{
  "mcpServers": {
    "openbrowsermcp": {
      "type": "http",
      "url": "http://localhost:3500/mcp"
    }
  }
}
```

Place this file in your project root (or `~/.claude/.mcp.json` for global use). Claude Code will automatically discover and connect to the server.

## Tool Reference

| Tool                    | Description                                                        | Key Arguments                                                                                                        |
| ----------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `computer`              | Screenshot, click, type, scroll, drag, zoom                        | `action` (screenshot/left_click/right_click/middle_click/double_click/triple_click/hover/scroll/left_click_drag/type/key/zoom), `coordinate`, `text`, `direction`, `amount`, `region` |
| `navigate`              | Navigate active tab to a URL or use browser history                | `url` (string), `direction` (back\|forward)                                                                          |
| `resize_window`         | Resize the browser window                                          | `width`, `height`                                                                                                    |
| `read_page`             | Generate an accessibility tree (structured DOM) with stable ref IDs | `filter` (all\|interactive), `depth`, `maxChars`, `refId`, `compact`                                                |
| `find`                  | Find a page element using natural language                         | `description` (string), `refId`                                                                                      |
| `click_element`         | Click an element by ref ID (more reliable than coordinate clicks)  | `refId` (e.g. `ref_42`), `tabId`                                                                                     |
| `fill_element`          | Clear an input and type new text by ref ID                         | `refId`, `text`, `tabId`                                                                                             |
| `scroll_element`        | Scroll within an element by ref ID                                 | `refId`, `direction` (up\|down\|left\|right), `amount`, `tabId`                                                      |
| `get_element_info`      | Get runtime info (bounding box, styles, value, attributes) by ref  | `refId`, `tabId`                                                                                                     |
| `wait_for_element`      | Poll until an element appears (by ref ID or description)           | `refId`, `description`, `timeout` (ms), `tabId`                                                                      |
| `form_input`            | Programmatically set a form element value by ref ID                | `refId`, `value`, `tabId`                                                                                            |
| `javascript_tool`       | Execute arbitrary JavaScript in the page context                   | `code` (string), `tabId`                                                                                             |
| `get_page_text`         | Extract plain text content of the current page                     | `tabId`                                                                                                              |
| `read_console_messages` | Retrieve buffered console logs and exceptions                      | `tabId`, `clear` (bool)                                                                                              |
| `read_network_requests` | Retrieve buffered network request/response records                 | `tabId`, `clear` (bool), `filter` (all\|failed)                                                                      |
| `get_response_body`     | Get the response body of a completed network request               | `requestId` (from `read_network_requests`), `tabId`                                                                  |
| `tabs_context`          | Get info about all open tabs and tab groups                        | `all` (bool), `browserId`                                                                                            |
| `tabs_create`           | Create a new browser tab                                           | `url`, `browserId`                                                                                                   |
| `tabs_activate`         | Switch to a specific tab by ID                                     | `tabId`, `browserId`                                                                                                 |
| `tabs_close`            | Close a browser tab by ID                                          | `tabId`, `browserId`                                                                                                 |
| `tabs_context_mcp`      | Get tab context scoped to the current MCP session                  | `sessionId`, `browserId`                                                                                             |
| `tabs_create_mcp`       | Create a tab in the MCP session's tab group                        | `url`, `sessionId`, `browserId`                                                                                      |
| `file_upload`           | Inject a file into a file input element                            | `refId`, `fileName`, `mimeType`, `data` (base64)                                                                     |
| `upload_image`          | Upload a screenshot/image to a page file input                     | `refId`, `screenshotData`                                                                                            |
| `gif_creator`           | Record browser automation as an animated GIF                       | `action` (start\|stop\|export), `tabId`, `fps`                                                                       |
| `shortcuts_list`        | List available keyboard shortcuts for the current tab              | `tabId`                                                                                                              |
| `shortcuts_execute`     | Execute a keyboard shortcut                                        | `shortcut` (e.g. `Ctrl+A`), `tabId`                                                                                  |
| `browsers_context`      | List all connected Chrome browser instances                        | —                                                                                                                    |
| `agent_done`            | Signal agent completion and hide the visual indicator              | `tabIds` (array)                                                                                                     |

## Development

### Watch mode (rebuild on change)

```bash
# Build all packages in watch mode
pnpm --filter extension dev   # Vite watch — rebuilds extension on save
pnpm --filter server build    # TypeScript one-shot; re-run after changes
```

### Run tests

```bash
# Server unit tests (Vitest)
pnpm --filter server test --run

# All tests (root shortcut)
pnpm test

# End-to-end integration test (starts server, runs curl suite, stops server)
pnpm --filter server run test:e2e
```

### Type-check and lint

```bash
pnpm run typecheck   # tsc --noEmit across all packages
pnpm run lint        # ESLint across all packages
```

## Troubleshooting

### Extension not connected

- Make sure the MCP server is running (`node packages/server/dist/index.js`)
- Open the extension options page and check the server URL is `ws://localhost:3500/ws`
- Check `chrome://extensions` — the extension should be enabled and show no errors
- Run `curl http://localhost:3500/status` — if the server is up, you'll see `{"connectedExtensions":[]}`
- Try reloading the extension from `chrome://extensions` → click the reload icon

### Port 3500 already in use

```bash
# Find what's using port 3500
lsof -i :3500

# If it's a leftover server process, kill it by PID
kill <PID>
```

Then restart the server.

### Build errors after pulling new code

```bash
pnpm install       # update dependencies
pnpm run build     # rebuild all packages
```

### Chrome extension errors in the console

- Detach/re-attach errors (`Already attached`) are expected and handled gracefully
- If you see persistent errors, reload the extension and refresh the Chrome tab
- Check that you loaded `packages/extension/dist/` (the built output), not the source folder

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
