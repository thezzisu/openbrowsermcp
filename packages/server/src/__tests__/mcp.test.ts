import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'http'
import express from 'express'
import { createMcpServer, setupMcpRoutes } from '../mcp.js'
import { ExtensionRegistry } from '../bridge.js'

// ---------------------------------------------------------------------------
// Helper to create a test HTTP server with MCP routes
// ---------------------------------------------------------------------------

function createTestServer() {
  const app = express()
  app.use(express.json())

  const registry = new ExtensionRegistry()
  setupMcpRoutes(app, registry)

  const server = http.createServer(app)

  return new Promise<{
    server: http.Server
    port: number
    close: () => Promise<void>
  }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0
      resolve({
        server,
        port,
        close: () =>
          new Promise<void>((res) => {
            // Force-close all connections (including open SSE streams)
            server.closeAllConnections?.()
            server.close(() => res())
          }),
      })
    })
  })
}

// ---------------------------------------------------------------------------
// Helper to send a JSON-RPC request to the test server
// ---------------------------------------------------------------------------

async function mcpPost(
  port: number,
  body: unknown,
  sessionId?: string,
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // MCP SDK requires both to work; it may respond with SSE or JSON
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
    // SSE response — parse the first data event
    const text = await resp.text()
    const lines = text.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          parsedBody = JSON.parse(line.slice(6))
          break
        } catch {
          // continue looking for valid JSON
        }
      }
    }
    if (parsedBody === undefined) {
      parsedBody = text
    }
  } else {
    parsedBody = await resp.text()
  }

  const headersObj: Record<string, string> = {}
  resp.headers.forEach((value, key) => {
    headersObj[key] = value
  })

  return { status: resp.status, headers: headersObj, body: parsedBody }
}


async function mcpDelete(
  port: number,
  sessionId: string,
): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'DELETE',
    headers: {
      'mcp-session-id': sessionId,
    },
  })
  const text = await resp.text()
  return { status: resp.status, body: text }
}

// ---------------------------------------------------------------------------
// Initialize request body helper
// ---------------------------------------------------------------------------

const initializeBody = {
  jsonrpc: '2.0',
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0' },
  },
  id: 1,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMcpServer', () => {
  it('returns an McpServer instance', () => {
    const server = createMcpServer()
    expect(server).toBeDefined()
    expect(typeof server.connect).toBe('function')
    expect(typeof server.close).toBe('function')
  })
})

describe('setupMcpRoutes', () => {
  let port: number
  let close: () => Promise<void>

  beforeEach(async () => {
    const result = await createTestServer()
    port = result.port
    close = result.close
  })

  afterEach(async () => {
    await close()
  })

  // -------------------------------------------------------------------------
  // Test 1: POST /mcp initialize creates a session and returns serverInfo
  // -------------------------------------------------------------------------
  it('initialize creates session and returns correct serverInfo', async () => {
    const result = await mcpPost(port, initializeBody)

    expect(result.status).toBe(200)

    // Response body should have serverInfo
    const body = result.body as {
      result?: { serverInfo?: { name?: string; version?: string } }
    }
    expect(body.result?.serverInfo?.name).toBe('openbrowsermcp')
    expect(body.result?.serverInfo?.version).toBe('1.0.0')

    // mcp-session-id header must be set
    const sessionId = result.headers['mcp-session-id']
    expect(sessionId).toBeTruthy()
    expect(typeof sessionId).toBe('string')
    expect((sessionId ?? '').length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Test 2: tools/list returns registered tools
  // -------------------------------------------------------------------------
  it('tools/list returns registered tools after initialization', async () => {
    // First, initialize to get session ID
    const initResult = await mcpPost(port, initializeBody)
    const sessionId = initResult.headers['mcp-session-id']
    expect(sessionId).toBeTruthy()

    // Then request tools/list
    const toolsListBody = {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 2,
    }
    const toolsResult = await mcpPost(port, toolsListBody, sessionId)

    expect(toolsResult.status).toBe(200)
    const body = toolsResult.body as {
      result?: { tools?: Array<{ name: string }> }
    }
    expect(Array.isArray(body.result?.tools)).toBe(true)
    // Should have at least one tool registered
    expect((body.result?.tools ?? []).length).toBeGreaterThanOrEqual(1)
  })

  // -------------------------------------------------------------------------
  // Test 3: Second request with session header reuses session
  // -------------------------------------------------------------------------
  it('second request with session header reuses session', async () => {
    // Initialize
    const initResult = await mcpPost(port, initializeBody)
    const sessionId = initResult.headers['mcp-session-id']
    expect(sessionId).toBeTruthy()

    // Make a second request with the same session ID — should succeed (not 400)
    const pingBody = {
      jsonrpc: '2.0',
      method: 'ping',
      id: 3,
    }
    const pingResult = await mcpPost(port, pingBody, sessionId)

    // The session should be reused — we get a valid response (not 400)
    expect(pingResult.status).not.toBe(400)
    expect(pingResult.status).not.toBe(404)
  })

  // -------------------------------------------------------------------------
  // Test 4: Request without session header to non-initialize returns 400
  // -------------------------------------------------------------------------
  it('non-initialize request without session header returns 400', async () => {
    const pingBody = {
      jsonrpc: '2.0',
      method: 'ping',
      id: 4,
    }
    const result = await mcpPost(port, pingBody)

    expect(result.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // Test 5: DELETE /mcp terminates session
  // -------------------------------------------------------------------------
  it('DELETE terminates session; subsequent request returns 400 or 404', async () => {
    // Initialize
    const initResult = await mcpPost(port, initializeBody)
    const sessionId = initResult.headers['mcp-session-id']
    expect(sessionId).toBeTruthy()

    // Delete the session
    const deleteResult = await mcpDelete(port, sessionId!)
    expect(deleteResult.status).toBe(200)

    // Subsequent request with same session ID should fail
    const pingBody = {
      jsonrpc: '2.0',
      method: 'ping',
      id: 5,
    }
    const afterDeleteResult = await mcpPost(port, pingBody, sessionId)
    expect([400, 404]).toContain(afterDeleteResult.status)
  })

  // -------------------------------------------------------------------------
  // Test 6: GET /mcp returns SSE stream headers (text/event-stream)
  // -------------------------------------------------------------------------
  it('GET /mcp with valid session returns SSE content-type', async () => {
    // Initialize first to get a session
    const initResult = await mcpPost(port, initializeBody)
    const sessionId = initResult.headers['mcp-session-id']
    expect(sessionId).toBeTruthy()

    // Use an AbortController to cancel the SSE stream after receiving headers
    const controller = new AbortController()

    let status = 0
    let contentType = ''

    try {
      const resp = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'mcp-session-id': sessionId!,
        },
        signal: controller.signal,
      })
      // We got the headers — capture them before aborting
      status = resp.status
      contentType = resp.headers.get('content-type') ?? ''
      // Abort to close the stream immediately (don't wait for body)
      controller.abort()
      // Drain or ignore body
      resp.body?.cancel().catch(() => {})
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        // Expected — we aborted the request after getting headers
      } else {
        throw err
      }
    }

    expect(status).toBe(200)
    expect(contentType).toContain('text/event-stream')
  }, 10000)

  // -------------------------------------------------------------------------
  // Test 7: GET /mcp without session returns 400
  // -------------------------------------------------------------------------
  it('GET /mcp without session header returns 400', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
      },
    })

    expect(resp.status).toBe(400)
    await resp.text() // drain
  })
})
