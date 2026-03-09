import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Router } from '../router.js'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const resizeWindowSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tabId: z.number().int().describe('The numeric tab ID whose window to resize. Use tabs_context to get tab IDs.'),
  browserId: z.string().optional().describe('Target browser instanceId. Omit to use the default browser.'),
})

export type ResizeWindowArgs = z.infer<typeof resizeWindowSchema>

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerResizeWindowTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'resize_window',
    {
      title: 'Resize Window',
      description: 'Resize the browser window to the specified dimensions.',
      inputSchema: resizeWindowSchema.shape,
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
      return router.dispatch('resize_window', rest, tabId, browserId)
    },
  )
}
