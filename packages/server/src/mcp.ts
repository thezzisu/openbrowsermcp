import { randomUUID } from 'crypto'
import type { Express, Request, Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { ExtensionRegistry } from './bridge.js'
import type { Router } from './router.js'
import {
  registerComputerTool,
  registerNavigateTool,
  registerResizeWindowTool,
  registerReadPageTool,
  registerFindTool,
  registerJavascriptTool,
  registerFormInputTool,
  registerGetPageTextTool,
  registerClickElementTool,
  registerScrollElementTool,
  registerFillElementTool,
  registerGetElementInfoTool,
  registerWaitForElementTool,
  registerReadConsoleMessagesTool,
  registerReadNetworkRequestsTool,
  registerGetResponseBodyTool,
  registerTabsContextTool,
  registerTabsCreateTool,
  registerTabsContextMcpTool,
  registerTabsCreateMcpTool,
  registerTabsActivateTool,
  registerTabsCloseTool,
  registerFileUploadTool,
  registerUploadImageTool,
  registerGifCreatorTool,
  registerShortcutsListTool,
  registerShortcutsExecuteTool,
  registerBrowsersContextTool,
  registerAgentDoneTool,
} from './tools/index.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Session = {
  transport: StreamableHTTPServerTransport
  server: McpServer
}

// ---------------------------------------------------------------------------
// createMcpServer
// ---------------------------------------------------------------------------

/**
 * Factory that creates a new McpServer instance with all tools registered.
 *
 * @param router - Optional Router instance to forward tool calls to the extension.
 *                 If not provided, tools return a "no router" error.
 * @param registry - Optional ExtensionRegistry for the browsers_context tool.
 */
export function createMcpServer(router?: Router, registry?: ExtensionRegistry): McpServer {
  const server = new McpServer(
    { name: 'openbrowsermcp', version: '1.0.0' },
    { capabilities: { logging: {} } },
  )

  // Register vision, mouse, keyboard, and navigation tools.
  // Handlers return an error when no router (extension) is available.
  registerComputerTool(server, router)
  registerNavigateTool(server, router)
  registerResizeWindowTool(server, router)

  // Register DOM reading, JavaScript execution, and form tools.
  registerReadPageTool(server, router)
  registerFindTool(server, router)
  registerJavascriptTool(server, router)
  registerFormInputTool(server, router)
  registerGetPageTextTool(server, router)
  registerClickElementTool(server, router)
  registerScrollElementTool(server, router)
  registerFillElementTool(server, router)
  registerGetElementInfoTool(server, router)
  registerWaitForElementTool(server, router)

  // Register monitoring tools.
  registerReadConsoleMessagesTool(server, router)
  registerReadNetworkRequestsTool(server, router)
  registerGetResponseBodyTool(server, router)

  // Register tab management tools.
  registerTabsContextTool(server, router)
  registerTabsCreateTool(server, router)
  registerTabsContextMcpTool(server, router)
  registerTabsCreateMcpTool(server, router)
  registerTabsActivateTool(server, router)
  registerTabsCloseTool(server, router)

  // Register file handling tools.
  registerFileUploadTool(server, router)
  registerUploadImageTool(server, router)

  // Register miscellaneous tools.
  registerGifCreatorTool(server, router)
  registerShortcutsListTool(server, router)
  registerShortcutsExecuteTool(server, router)

  // Register browser management tools.
  registerBrowsersContextTool(server, registry)
  registerAgentDoneTool(server, registry)

  return server
}

// ---------------------------------------------------------------------------
// setupMcpRoutes
// ---------------------------------------------------------------------------

/**
 * Adds MCP Streamable HTTP routes to the given Express app.
 *
 * Routes:
 *   POST   /mcp  — initialize (creates session) or handle subsequent requests
 *   GET    /mcp  — SSE stream for server→client notifications
 *   DELETE /mcp  — session termination
 *
 * CORS headers are set for all origins (local dev only).
 *
 * @param router - Router instance to forward tool calls to the extension.
 */
export function setupMcpRoutes(app: Express, registry: ExtensionRegistry, router?: Router, serverToken?: string): void {
  // Session map: sessionId → { transport, server }
  const sessions = new Map<string, Session>()

  // CORS middleware for /mcp
  // Access-Control-Allow-Origin is intentionally omitted to block browser cross-origin requests (CSRF prevention).
  // MCP clients connect via Node.js HTTP and are not subject to browser CORS restrictions.
  app.use('/mcp', (_req: Request, res: Response, next: () => void) => {
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, DELETE, OPTIONS',
    )
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, mcp-session-id, last-event-id',
    )
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id')
    next()
  })

  // Handle OPTIONS preflight
  app.options('/mcp', (_req: Request, res: Response) => {
    res.sendStatus(204)
  })

  // Bearer token authentication middleware
  if (serverToken) {
    app.use('/mcp', (req: Request, res: Response, next: () => void) => {
      if (req.method === 'OPTIONS') { next(); return }
      const auth = req.headers['authorization']
      if (auth !== `Bearer ${serverToken}`) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized' },
          id: null,
        })
        return
      }
      next()
    })
  }

  // -------------------------------------------------------------------------
  // POST /mcp
  // -------------------------------------------------------------------------
  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined

      if (sessionId) {
        // Reuse existing session
        const session = sessions.get(sessionId)
        if (!session) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: Invalid session ID' },
            id: null,
          })
          return
        }
        await session.transport.handleRequest(req, res, req.body)
        return
      }

      // No session ID — must be initialize
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        })
        return
      }

      // Create new session
      const eventStore = new InMemoryEventStore()
      let transport: StreamableHTTPServerTransport | undefined

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        eventStore,
        onsessioninitialized: (newSessionId: string) => {
          if (transport) {
            sessions.set(newSessionId, { transport, server: mcpServer })
          }
        },
      })

      transport.onclose = () => {
        const sid = transport?.sessionId
        if (sid) {
          sessions.delete(sid)
        }
      }

      const mcpServer = createMcpServer(router, registry)
      // Cast needed: SDK getter/setter types are incompatible with exactOptionalPropertyTypes
      await mcpServer.connect(transport as unknown as Transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error('Error handling POST /mcp:', err)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        })
      }
    }
  })

  // -------------------------------------------------------------------------
  // GET /mcp — SSE stream
  // -------------------------------------------------------------------------
  app.get('/mcp', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined

      if (!sessionId) {
        res.status(400).send('Bad Request: Missing mcp-session-id header')
        return
      }

      const session = sessions.get(sessionId)
      if (!session) {
        res.status(400).send('Bad Request: Invalid session ID')
        return
      }

      await session.transport.handleRequest(req, res)
    } catch (err) {
      console.error('Error handling GET /mcp:', err)
      if (!res.headersSent) {
        res.status(500).send('Internal server error')
      }
    }
  })

  // -------------------------------------------------------------------------
  // DELETE /mcp — session termination
  // -------------------------------------------------------------------------
  app.delete('/mcp', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined

      if (!sessionId) {
        res.status(400).send('Bad Request: Missing mcp-session-id header')
        return
      }

      const session = sessions.get(sessionId)
      if (!session) {
        res.status(400).send('Bad Request: Invalid session ID')
        return
      }

      await session.transport.handleRequest(req, res)
      // Clean up is handled via transport.onclose
    } catch (err) {
      console.error('Error handling DELETE /mcp:', err)
      if (!res.headersSent) {
        res.status(500).send('Internal server error')
      }
    }
  })
}
