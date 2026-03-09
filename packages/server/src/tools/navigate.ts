import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Router } from '../router.js'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

// Base shape used for MCP tool registration (inputSchema must be ZodRawShape)
const navigateBaseShape = {
  url: z.string().url().optional(),
  direction: z.enum(['back', 'forward']).optional(),
  tabId: z.number().int().describe('The numeric tab ID to navigate. Use tabs_context to get tab IDs.'),
  browserId: z.string().optional().describe('Target browser instanceId. Omit to use the default browser.'),
}

// Full schema with refinement — used for validation in handler
export const navigateSchema = z
  .object(navigateBaseShape)
  .refine((data) => data.url !== undefined || data.direction !== undefined, {
    message: 'Either "url" or "direction" must be provided',
  })

export type NavigateArgs = z.infer<typeof navigateSchema>

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerNavigateTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'navigate',
    {
      title: 'Navigate',
      description:
        'Navigate the active tab. Provide either url (string) to load a new page, or direction ("back"|"forward") to use browser history. At least one argument is required.',
      inputSchema: navigateBaseShape,
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
      // Validate with the full schema (including the "url OR direction" refinement)
      const validated = navigateSchema.safeParse(args)
      if (!validated.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid arguments: ${validated.error.message}`,
            },
          ],
          isError: true,
        }
      }
      const { tabId, browserId, ...rest } = validated.data
      return router.dispatch('navigate', rest, tabId, browserId)
    },
  )
}
