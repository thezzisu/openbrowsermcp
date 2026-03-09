import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Router } from '../router.js'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const tabIdField = z.number().int().describe('The numeric tab ID to operate on. Use tabs_context to get tab IDs.')
const browserIdField = z.string().optional().describe('Target browser instanceId. Omit to use the default browser.')

export const gifCreatorSchema = z.object({
  action: z.enum(['start', 'stop', 'export']),
  tabId: tabIdField,
  browserId: browserIdField,
  fps: z.number().int().min(1).max(30).optional().default(2),
})

export type GifCreatorArgs = z.infer<typeof gifCreatorSchema>

export const shortcutsListSchema = z.object({
  tabId: tabIdField,
  browserId: browserIdField,
})

export type ShortcutsListArgs = z.infer<typeof shortcutsListSchema>

export const shortcutsExecuteSchema = z.object({
  shortcut: z.string().min(1),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type ShortcutsExecuteArgs = z.infer<typeof shortcutsExecuteSchema>

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerGifCreatorTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'gif_creator',
    {
      title: 'GIF Creator',
      description:
        'Record browser automation operations as a GIF. Use action=start to begin recording, stop to end, and export to retrieve the GIF.',
      inputSchema: gifCreatorSchema.shape,
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
      const { tabId, browserId, ...rest } = args
      return router.dispatch('gif_creator', rest, tabId, browserId)
    },
  )
}

export function registerShortcutsListTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'shortcuts_list',
    {
      title: 'Shortcuts List',
      description:
        'List all available keyboard shortcuts for the current browser tab.',
      inputSchema: shortcutsListSchema.shape,
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
      const { tabId, browserId, ...rest } = args
      return router.dispatch('shortcuts_list', rest, tabId, browserId)
    },
  )
}

export function registerShortcutsExecuteTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'shortcuts_execute',
    {
      title: 'Shortcuts Execute',
      description:
        'Execute a keyboard shortcut in the browser tab.',
      inputSchema: shortcutsExecuteSchema.shape,
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
      const { tabId, browserId, ...rest } = args
      return router.dispatch('shortcuts_execute', rest, tabId, browserId)
    },
  )
}
