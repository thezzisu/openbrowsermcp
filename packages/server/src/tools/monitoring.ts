import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Router } from '../router.js'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const tabIdField = z.number().int().describe('The numeric tab ID to read from. Use tabs_context to get tab IDs.')
const browserIdField = z.string().optional().describe('Target browser instanceId. Omit to use the default browser.')

export const readConsoleMessagesSchema = z.object({
  tabId: tabIdField,
  browserId: browserIdField,
  clear: z.boolean().optional().default(false),
})

export type ReadConsoleMessagesArgs = z.infer<typeof readConsoleMessagesSchema>

export const readNetworkRequestsSchema = z.object({
  tabId: tabIdField,
  browserId: browserIdField,
  clear: z.boolean().optional().default(false),
  filter: z.enum(['all', 'failed']).optional().default('all'),
})

export type ReadNetworkRequestsArgs = z.infer<typeof readNetworkRequestsSchema>

export const getResponseBodySchema = z.object({
  requestId: z.string().min(1).describe('The request ID from read_network_requests output (the value in brackets at the start of each line).'),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type GetResponseBodyArgs = z.infer<typeof getResponseBodySchema>

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerReadConsoleMessagesTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'read_console_messages',
    {
      title: 'Read Console Messages',
      description:
        'Retrieve console logs and exceptions from the browser. Optionally clear after reading.',
      inputSchema: readConsoleMessagesSchema.shape,
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
      return router.dispatch('read_console_messages', rest, tabId, browserId)
    },
  )
}

export function registerReadNetworkRequestsTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'read_network_requests',
    {
      title: 'Read Network Requests',
      description:
        'Retrieve network request/response records from the browser. Optionally filter by status and clear after reading.',
      inputSchema: readNetworkRequestsSchema.shape,
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
      return router.dispatch('read_network_requests', rest, tabId, browserId)
    },
  )
}

export function registerGetResponseBodyTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'get_response_body',
    {
      title: 'Get Response Body',
      description:
        'Retrieve the response body of a completed network request by its request ID. Request IDs appear in brackets at the start of each line in read_network_requests output.',
      inputSchema: getResponseBodySchema.shape,
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
      return router.dispatch('get_response_body', rest, tabId, browserId)
    },
  )
}
