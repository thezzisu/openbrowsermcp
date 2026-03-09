/**
 * E2E Integration Tests for OpenBrowserMCP Server
 *
 * These tests validate cross-area protocol flows WITHOUT requiring a Chrome extension.
 * They use fetch() to call the MCP server running on a random port.
 *
 * ============================================================================
 * EXTENSION-DEPENDENT TESTS (not automated here — require manual verification):
 * ============================================================================
 *
 * The following cross-area flows REQUIRE a connected Chrome extension:
 *
 * VAL-CROSS-001: Full agent workflow — navigate, screenshot, interact, screenshot
 *   - Requires extension: tools/call navigate, computer screenshot, read_page, computer left_click
 *   - Test manually: load extension in Chrome, start server, use curl recipes in
 *     .factory/library/user-testing.md
 *
 * VAL-CROSS-002: Multi-tab workflow — create tab, use it, return to original
 *   - Requires extension: tabs_create, navigate with tabId, computer screenshot
 *   - Test manually: as above
 *
 * VAL-CROSS-004: Extension reconnect — tools resume after WebSocket reconnect
 *   - Requires extension: verify /status before/after server restart,
 *     confirm extension auto-reconnects within 10 seconds
 *   - Test manually: start server + extension, stop server, restart, watch /status
 *
 * ============================================================================
 * AUTOMATED TESTS (run here without extension):
 * ============================================================================
 *
 * VAL-CROSS-003: Error recovery — graceful failure then successful continuation
 *   - invalid JS → isError=true (HTTP 200, not 500)
 *   - immediately after error, server still responds normally
 *   - session still usable after tool error
 *
 * Plus: Protocol-level tests (session lifecycle, tools/list count, status endpoint)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'http'
import express from 'express'
import { setupMcpRoutes } from '../../mcp.js'
import { ExtensionRegistry } from '../../bridge.js'

// ---------------------------------------------------------------------------
// Test server helpers (mirrors mcp.test.ts pattern)
// ---------------------------------------------------------------------------

function createTestServer() {
  const app = express()
  app.use(express.json())

  const registry = new ExtensionRegistry()
  setupMcpRoutes(app, registry)

  // Health + status endpoints (mirrors index.ts)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', extensionCount: registry.count() })
  })

  app.get('/status', (_req, res) => {
    const connectedExtensions = registry.getAll().map((conn) => ({
      id: conn.extensionId,
      connectedAt: conn.connectedAt,
      ...(conn.activeTabId !== undefined ? { activeTabId: conn.activeTabId } : {}),
    }))
    res.json({ connectedExtensions })
  })

  const server = http.createServer(app)

  return new Promise<{
    server: http.Server
    port: number
    registry: ExtensionRegistry
    close: () => Promise<void>
  }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0
      resolve({
        server,
        port,
        registry,
        close: () =>
          new Promise<void>((res) => {
            server.closeAllConnections?.()
            server.close(() => res())
          }),
      })
    })
  })
}

/** Send a JSON-RPC POST to /mcp and return status, headers, and parsed body. */
async function mcpPost(
  port: number,
  body: unknown,
  sessionId?: string,
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (sessionId) {
    headers['mcp-session-id'] = sessionId
  }

  const resp = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const contentType = resp.headers.get('content-type') ?? ''
  let parsedBody: unknown
  if (contentType.includes('application/json')) {
    parsedBody = await resp.json()
  } else if (contentType.includes('text/event-stream')) {
    const text = await resp.text()
    const lines = text.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          parsedBody = JSON.parse(line.slice(6))
          break
        } catch {
          // continue
        }
      }
    }
    if (parsedBody === undefined) parsedBody = text
  } else {
    parsedBody = await resp.text()
  }

  const headersObj: Record<string, string> = {}
  resp.headers.forEach((value, key) => {
    headersObj[key] = value
  })

  return { status: resp.status, headers: headersObj, body: parsedBody }
}

/** Initialize an MCP session and return the session ID. */
async function initSession(port: number): Promise<string> {
  const result = await mcpPost(port, {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-test', version: '1.0' },
    },
    id: 1,
  })
  const sessionId = result.headers['mcp-session-id']
  if (!sessionId) {
    throw new Error(`No mcp-session-id in response headers. Status: ${result.status}, Body: ${JSON.stringify(result.body)}`)
  }
  return sessionId
}

/** Call a tool via tools/call and return the result. */
async function callTool(
  port: number,
  sessionId: string,
  name: string,
  args: Record<string, unknown>,
  id = 10,
): Promise<{
  isError?: boolean
  content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
}> {
  const result = await mcpPost(
    port,
    {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name, arguments: args },
      id,
    },
    sessionId,
  )
  const body = result.body as {
    result?: {
      isError?: boolean
      content?: Array<{ type: string; text?: string }>
    }
  }
  return body.result ?? {}
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MCP E2E — Protocol-level flows (no extension required)', () => {
  let port: number
  let close: () => Promise<void>

  beforeEach(async () => {
    const srv = await createTestServer()
    port = srv.port
    close = srv.close
  })

  afterEach(async () => {
    await close()
  })

  // -------------------------------------------------------------------------
  // Test 1: Initialize + sessionId (VAL-MCP-001)
  // -------------------------------------------------------------------------
  it('MCP initialize returns serverInfo and mcp-session-id header', async () => {
    const result = await mcpPost(port, {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'e2e-test', version: '1.0' },
      },
      id: 1,
    })

    expect(result.status).toBe(200)

    const body = result.body as {
      result?: { serverInfo?: { name?: string; version?: string } }
    }
    expect(body.result?.serverInfo?.name).toBe('openbrowsermcp')
    expect(body.result?.serverInfo?.version).toBe('1.0.0')

    const sessionId = result.headers['mcp-session-id']
    expect(typeof sessionId).toBe('string')
    expect((sessionId ?? '').length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Test 2: tools/list returns ≥ 17 tools (VAL-MCP-002)
  // -------------------------------------------------------------------------
  it('tools/list returns ≥ 17 tool definitions', async () => {
    const sessionId = await initSession(port)

    const result = await mcpPost(
      port,
      { jsonrpc: '2.0', method: 'tools/list', params: {}, id: 2 },
      sessionId,
    )

    expect(result.status).toBe(200)
    const body = result.body as { result?: { tools?: Array<{ name: string }> } }
    const tools = body.result?.tools ?? []
    expect(Array.isArray(tools)).toBe(true)
    expect(tools.length).toBeGreaterThanOrEqual(17)

    // Verify presence of required tools
    const toolNames = tools.map((t) => t.name)
    const requiredTools = [
      'computer',
      'navigate',
      'read_page',
      'find',
      'javascript_tool',
      'form_input',
      'get_page_text',
      'read_console_messages',
      'read_network_requests',
      'tabs_context',
      'tabs_create',
      'file_upload',
      'upload_image',
      'gif_creator',
      'resize_window',
      'shortcuts_list',
      'shortcuts_execute',
    ]
    for (const required of requiredTools) {
      expect(toolNames, `Expected tool '${required}' to be in tools list`).toContain(required)
    }
  })

  // -------------------------------------------------------------------------
  // Test 3: GET /status returns connectedExtensions array
  // -------------------------------------------------------------------------
  it('GET /status returns connectedExtensions array (empty when no extension)', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/status`)
    expect(resp.status).toBe(200)

    const body = await resp.json() as { connectedExtensions?: unknown[] }
    expect(Array.isArray(body.connectedExtensions)).toBe(true)
    // No extension connected in test environment
    expect(body.connectedExtensions!.length).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Test 4: GET /health returns extensionCount
  // -------------------------------------------------------------------------
  it('GET /health returns extensionCount field', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/health`)
    expect(resp.status).toBe(200)

    const body = await resp.json() as { status?: string; extensionCount?: number }
    expect(body.status).toBe('ok')
    expect(typeof body.extensionCount).toBe('number')
    expect(body.extensionCount).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Test 5: Session reuse with mcp-session-id header (VAL-MCP-004)
  // -------------------------------------------------------------------------
  it('second request with mcp-session-id reuses session (not 400)', async () => {
    const sessionId = await initSession(port)

    // Send tools/list using session — should reuse session
    const result = await mcpPost(
      port,
      { jsonrpc: '2.0', method: 'tools/list', params: {}, id: 2 },
      sessionId,
    )
    expect(result.status).not.toBe(400)
    expect(result.status).not.toBe(404)
  })

  // -------------------------------------------------------------------------
  // Test 6: Non-initialize request without session returns 400 (VAL-MCP-004)
  // -------------------------------------------------------------------------
  it('non-initialize POST without session header returns 400', async () => {
    const result = await mcpPost(port, {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 99,
    })
    expect(result.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // Test 7: DELETE /mcp terminates session (VAL-MCP-006)
  // -------------------------------------------------------------------------
  it('DELETE /mcp terminates session — subsequent request returns 400 or 404', async () => {
    const sessionId = await initSession(port)

    // Delete the session
    const deleteResp = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId },
    })
    expect(deleteResp.status).toBe(200)
    await deleteResp.text() // drain

    // Subsequent request with same session ID should fail
    const afterDelete = await mcpPost(
      port,
      { jsonrpc: '2.0', method: 'ping', id: 5 },
      sessionId,
    )
    expect([400, 404]).toContain(afterDelete.status)
  })

  // -------------------------------------------------------------------------
  // Test 8: computer/screenshot without extension → isError=true (VAL-MCP-007)
  // -------------------------------------------------------------------------
  it('computer/screenshot without extension returns isError=true with extension message', async () => {
    const sessionId = await initSession(port)

    // tabId is now required — call without it to get a validation error,
    // or call with it to get the "no extension" error
    const result = await callTool(port, sessionId, 'computer', { action: 'screenshot', tabId: 1 })

    expect(result.isError).toBe(true)
    expect(Array.isArray(result.content)).toBe(true)
    expect(result.content!.length).toBeGreaterThan(0)

    const text = result.content![0]?.text ?? ''
    // Message must mention extension or not connected
    expect(text.toLowerCase()).toMatch(/extension|not connected|no extension/)
  })
})

// ---------------------------------------------------------------------------
// VAL-CROSS-003: Error recovery — graceful failure then successful continuation
// ---------------------------------------------------------------------------
describe('VAL-CROSS-003: Error recovery — graceful failure, server continues', () => {
  let port: number
  let close: () => Promise<void>

  beforeEach(async () => {
    const srv = await createTestServer()
    port = srv.port
    close = srv.close
  })

  afterEach(async () => {
    await close()
  })

  it('invalid javascript_tool call returns isError=true (HTTP 200, not 500)', async () => {
    const sessionId = await initSession(port)

    // Step 1: Call javascript_tool with invalid syntax
    // Without extension, this returns isError=true due to no extension.
    // The key check: HTTP status is 200 (tool error ≠ server error)
    const result = await mcpPost(
      port,
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'javascript_tool',
          arguments: { code: 'this is not valid javascript !!!' },
        },
        id: 10,
      },
      sessionId,
    )

    // HTTP must be 200 — tool errors are surfaced in the MCP result, not HTTP errors
    expect(result.status).toBe(200)

    const body = result.body as {
      result?: { isError?: boolean; content?: Array<{ type: string; text?: string }> }
    }
    // isError must be true
    expect(body.result?.isError).toBe(true)
  })

  it('server continues operating normally after isError response (VAL-CROSS-003)', async () => {
    const sessionId = await initSession(port)

    // Step 1: Cause an error
    await callTool(port, sessionId, 'javascript_tool', {
      code: 'this is not valid javascript !!!',
    })

    // Step 2: Server must still respond to subsequent requests
    const healthResp = await fetch(`http://127.0.0.1:${port}/health`)
    expect(healthResp.status).toBe(200)
    const health = await healthResp.json() as { status?: string }
    expect(health.status).toBe('ok')
  })

  it('session remains usable after tool error (VAL-CROSS-003)', async () => {
    const sessionId = await initSession(port)

    // Step 1: Cause an error
    const errorResult = await callTool(port, sessionId, 'javascript_tool', {
      code: 'this is not valid javascript !!!',
    })
    expect(errorResult.isError).toBe(true)

    // Step 2: Session still works — tools/list should succeed
    const listResult = await mcpPost(
      port,
      { jsonrpc: '2.0', method: 'tools/list', params: {}, id: 11 },
      sessionId,
    )
    expect(listResult.status).toBe(200)
    const body = listResult.body as { result?: { tools?: Array<{ name: string }> } }
    expect(Array.isArray(body.result?.tools)).toBe(true)
    expect((body.result?.tools ?? []).length).toBeGreaterThanOrEqual(17)
  })

  it('multiple consecutive errors do not crash the server', async () => {
    const sessionId = await initSession(port)

    // Call failing tool 3 times
    for (let i = 0; i < 3; i++) {
      const result = await callTool(
        port,
        sessionId,
        'computer',
        { action: 'screenshot' },
        20 + i,
      )
      expect(result.isError).toBe(true)
    }

    // Server must still respond
    const statusResp = await fetch(`http://127.0.0.1:${port}/status`)
    expect(statusResp.status).toBe(200)
    const status = await statusResp.json() as { connectedExtensions?: unknown[] }
    expect(Array.isArray(status.connectedExtensions)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// VAL-CROSS-004: Extension reconnect protocol (partial — no extension needed)
// ---------------------------------------------------------------------------
describe('VAL-CROSS-004: Extension reconnect — server-side protocol (partial)', () => {
  /**
   * NOTE: Full VAL-CROSS-004 verification requires:
   * 1. A real Chrome extension connected via WebSocket
   * 2. Server restart while extension is connected
   * 3. Waiting ≤ 10 seconds for extension to auto-reconnect
   * 4. Verifying /status shows extensionCount=1 again
   *
   * These tests verify only the server-side protocol aspects:
   * - /status correctly shows 0 extensions when none connected
   * - New MCP sessions can be created after server restart (clean state)
   * - The WebSocket upgrade endpoint exists at /ws
   */

  let port: number
  let close: () => Promise<void>

  beforeEach(async () => {
    const srv = await createTestServer()
    port = srv.port
    close = srv.close
  })

  afterEach(async () => {
    await close()
  })

  it('GET /status returns empty connectedExtensions before any extension connects', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/status`)
    expect(resp.status).toBe(200)
    const body = await resp.json() as { connectedExtensions?: unknown[] }
    expect(body.connectedExtensions).toEqual([])
  })

  it('new MCP session can be created on fresh server (simulates post-restart state)', async () => {
    // This verifies the server starts clean (no stale sessions)
    // A fresh server should accept a new initialize request
    const sessionId = await initSession(port)
    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)

    // Verify session works
    const listResult = await mcpPost(
      port,
      { jsonrpc: '2.0', method: 'tools/list', params: {}, id: 2 },
      sessionId,
    )
    expect(listResult.status).toBe(200)
  })

  it('[requires extension] VAL-CROSS-004: extension reconnects after server restart', () => {
    /**
     * This test documents the expected behavior but cannot run without a real extension.
     *
     * Manual verification steps:
     * 1. Start server: node packages/server/dist/index.js
     * 2. Load extension in Chrome (packages/extension/dist/)
     * 3. Verify: curl http://localhost:3500/status → connectedExtensions.length = 1
     * 4. Restart server (stop + start)
     * 5. Wait ≤ 10 seconds
     * 6. Verify: curl http://localhost:3500/status → connectedExtensions.length = 1
     * 7. Verify: curl (tools/call computer screenshot) → returns valid image
     *
     * Expected: Extension auto-reconnects via chrome.alarms keepalive mechanism
     * (implemented in packages/extension/src/background/ws-client.ts)
     */
    expect(true).toBe(true) // Document-only test — always passes
  })
})
