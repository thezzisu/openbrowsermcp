import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Router } from '../router.js'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const computerSchema = z.object({
  action: z.enum([
    'screenshot',
    'zoom',
    'left_click',
    'right_click',
    'middle_click',
    'double_click',
    'triple_click',
    'hover',
    'scroll',
    'left_click_drag',
    'type',
    'key',
  ]),
  coordinate: z.tuple([z.number(), z.number()]).optional(),
  start_coordinate: z.tuple([z.number(), z.number()]).optional(),
  text: z.string().optional(),
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  amount: z.number().optional(),
  region: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  tabId: z.number().int().describe('The numeric tab ID to operate on. Use tabs_context to get tab IDs.'),
  browserId: z.string().optional().describe('Target browser instanceId. Omit to use the default browser.'),
})

export type ComputerArgs = z.infer<typeof computerSchema>

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerComputerTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'computer',
    {
      title: 'Computer',
      description:
        'Interact with the browser: take screenshots, click, type, scroll, drag, and more.',
      inputSchema: computerSchema.shape,
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
      return router.dispatch('computer', rest, tabId, browserId)
    },
  )
}
