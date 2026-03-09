import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Router } from '../router.js'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const tabsContextSchema = z.object({
  sessionId: z.string().optional(),
  all: z.boolean().optional(),
  browserId: z.string().optional(),
})

export type TabsContextArgs = z.infer<typeof tabsContextSchema>

export const tabsCreateSchema = z.object({
  url: z.string().url().optional(),
  sessionId: z.string().optional(),
  browserId: z.string().optional(),
})

export type TabsCreateArgs = z.infer<typeof tabsCreateSchema>

export const tabsContextMcpSchema = z.object({
  sessionId: z.string().optional(),
  browserId: z.string().optional(),
})

export type TabsContextMcpArgs = z.infer<typeof tabsContextMcpSchema>

export const tabsCreateMcpSchema = z.object({
  url: z.string().url().optional(),
  sessionId: z.string(),
  browserId: z.string().optional(),
})

export type TabsCreateMcpArgs = z.infer<typeof tabsCreateMcpSchema>

export const tabsActivateSchema = z.object({
  tabId: z.number().int().describe('The numeric tab ID to activate (switch to).'),
  browserId: z.string().optional(),
})

export type TabsActivateArgs = z.infer<typeof tabsActivateSchema>

export const tabsCloseSchema = z.object({
  tabId: z.number().int().describe('The numeric tab ID to close.'),
  browserId: z.string().optional(),
})

export type TabsCloseArgs = z.infer<typeof tabsCloseSchema>

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTabsContextTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'tabs_context',
    {
      title: 'Tabs Context',
      description:
        'Get the context of all open browser tabs and tab groups. Pass all=true to list every tab in the current window.',
      inputSchema: tabsContextSchema.shape,
    },
    async (args) => {
      if (!router) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.',
            },
          ],
          isError: true,
        }
      }
      const { browserId, ...rest } = args
      return router.dispatch('tabs_context', rest, undefined, browserId)
    },
  )
}

export function registerTabsCreateTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'tabs_create',
    {
      title: 'Tabs Create',
      description:
        'Create a new browser tab in a tab group, optionally navigating to a URL.',
      inputSchema: tabsCreateSchema.shape,
    },
    async (args) => {
      if (!router) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.',
            },
          ],
          isError: true,
        }
      }
      const { browserId, ...rest } = args
      return router.dispatch('tabs_create', rest, undefined, browserId)
    },
  )
}

export function registerTabsContextMcpTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'tabs_context_mcp',
    {
      title: 'Tabs Context (MCP)',
      description:
        'Get the context of all open browser tabs and tab groups for MCP sessions.',
      inputSchema: tabsContextMcpSchema.shape,
    },
    async (args) => {
      if (!router) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.',
            },
          ],
          isError: true,
        }
      }
      const { browserId, ...rest } = args
      return router.dispatch('tabs_context_mcp', rest, undefined, browserId)
    },
  )
}

export function registerTabsCreateMcpTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'tabs_create_mcp',
    {
      title: 'Tabs Create (MCP)',
      description:
        'Create a new browser tab in an MCP session tab group, optionally navigating to a URL.',
      inputSchema: tabsCreateMcpSchema.shape,
    },
    async (args) => {
      if (!router) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.',
            },
          ],
          isError: true,
        }
      }
      const { browserId, ...rest } = args
      return router.dispatch('tabs_create_mcp', rest, undefined, browserId)
    },
  )
}

export function registerTabsActivateTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'tabs_activate',
    {
      title: 'Tabs Activate',
      description:
        'Switch to (activate) a specific tab by its numeric tab ID, bringing it to the foreground and focusing its window. Use tabs_context with all=true to get tab IDs first.',
      inputSchema: tabsActivateSchema.shape,
    },
    async (args) => {
      if (!router) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.',
            },
          ],
          isError: true,
        }
      }
      const { browserId, ...rest } = args
      return router.dispatch('tabs_activate', rest, undefined, browserId)
    },
  )
}

export function registerTabsCloseTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'tabs_close',
    {
      title: 'Tabs Close',
      description:
        'Close a browser tab by its numeric tab ID. Use tabs_context with all=true to get tab IDs first.',
      inputSchema: tabsCloseSchema.shape,
    },
    async (args) => {
      if (!router) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.',
            },
          ],
          isError: true,
        }
      }
      const { browserId, ...rest } = args
      return router.dispatch('tabs_close', rest, undefined, browserId)
    },
  )
}
