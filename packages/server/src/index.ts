import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { WebSocketServer } from 'ws'
import {
  parseExtensionMessage,
  BridgeMessageType,
} from '@openbrowsermcp/shared'
import { ExtensionRegistry } from './bridge.js'
import { setupMcpRoutes } from './mcp.js'
import { Router } from './router.js'

const PORT = parseInt(process.env['PORT'] ?? '3500', 10)

// ---------------------------------------------------------------------------
// Settings (token persistence)
// ---------------------------------------------------------------------------

type Settings = { token: string }

function getConfigDir(): string {
  return path.join(process.env['APPDATA'] ?? os.homedir(), 'openbrowsermcp')
}

function loadOrCreateToken(): string {
  const dir = getConfigDir()
  const file = path.join(dir, 'settings.json')
  fs.mkdirSync(dir, { recursive: true })

  let settings: Partial<Settings> = {}
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Settings>
  } catch {
    // file missing or malformed — will create fresh
  }

  if (typeof settings.token === 'string' && settings.token.length > 0) {
    return settings.token
  }

  const token = randomUUID()
  fs.writeFileSync(file, JSON.stringify({ token }, null, 2), { mode: 0o600 })
  console.log(`[OpenBrowserMCP] Token written to: ${file}`)
  return token
}

const SERVER_TOKEN = loadOrCreateToken()

// ---------------------------------------------------------------------------
// Express app (with MCP DNS-rebinding protection)
// ---------------------------------------------------------------------------
const app = createMcpExpressApp({ host: '127.0.0.1' })

// ---------------------------------------------------------------------------
// Extension registry
// ---------------------------------------------------------------------------
const registry = new ExtensionRegistry()

// ---------------------------------------------------------------------------
// Router: connects MCP tool calls → WebSocket → extension
// ---------------------------------------------------------------------------
const router = new Router(registry)

// ---------------------------------------------------------------------------
// MCP Streamable HTTP routes
// ---------------------------------------------------------------------------
setupMcpRoutes(app, registry, router, SERVER_TOKEN)

// ---------------------------------------------------------------------------
// Health + status endpoints
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', extensionCount: registry.count() })
})

app.get('/status', (_req, res) => {
  const connectedExtensions = registry.getAll().map((conn) => ({
    id: conn.extensionId,
    instanceId: conn.instanceId,
    connectedAt: conn.connectedAt,
    ...(conn.activeTabId !== undefined
      ? { activeTabId: conn.activeTabId }
      : {}),
    ...(conn.activeTabUrl !== undefined
      ? { activeTabUrl: conn.activeTabUrl }
      : {}),
  }))
  res.json({ connectedExtensions })
})

// ---------------------------------------------------------------------------
// HTTP server + WebSocket upgrade on /ws
// ---------------------------------------------------------------------------
const server = http.createServer(app)

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = req.url ?? ''
  if (!url.startsWith('/ws')) {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    // Wait for the initial 'connect' message to identify the extension
    ws.once('message', (data) => {
      let msg: ReturnType<typeof parseExtensionMessage>
      try {
        msg = parseExtensionMessage(
          typeof data === 'string' ? data : (data as Buffer).toString(),
        )
      } catch {
        ws.close()
        return
      }

      if (msg.type !== BridgeMessageType.CONNECT) {
        ws.close()
        return
      }

      if (msg.token !== SERVER_TOKEN) {
        ws.close(1008, 'Unauthorized')
        return
      }

      const { extensionId, instanceId } = msg
      const sessionId = randomUUID()

      registry.add(ws, {
        extensionId,
        instanceId,
        connectedAt: new Date().toISOString(),
        ...(msg.activeTabUrl !== undefined ? { activeTabUrl: msg.activeTabUrl } : {}),
        ...(msg.browserInfo !== undefined ? { browserInfo: msg.browserInfo } : {}),
      })

      ws.send(
        JSON.stringify({
          type: BridgeMessageType.CONNECTED,
          sessionId,
        }),
      )
    })
  })
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, '127.0.0.1', () => {
  console.log(`OpenBrowserMCP server running on port ${PORT}`)
})
