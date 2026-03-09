import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Router } from '../router.js'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const tabIdField = z.number().int().describe('The numeric tab ID to operate on. Use tabs_context to get tab IDs.')
const browserIdField = z.string().optional().describe('Target browser instanceId. Omit to use the default browser.')

export const fileUploadSchema = z.object({
  refId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  data: z.string().min(1),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type FileUploadArgs = z.infer<typeof fileUploadSchema>

export const uploadImageSchema = z.object({
  refId: z.string().min(1),
  screenshotData: z.string().optional(),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type UploadImageArgs = z.infer<typeof uploadImageSchema>

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerFileUploadTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'file_upload',
    {
      title: 'File Upload',
      description:
        'Inject a file into a file input element identified by its ref ID.',
      inputSchema: fileUploadSchema.shape,
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
      return router.dispatch('file_upload', rest, tabId, browserId)
    },
  )
}

export function registerUploadImageTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'upload_image',
    {
      title: 'Upload Image',
      description:
        'Upload a screenshot or image to the page via a file input element.',
      inputSchema: uploadImageSchema.shape,
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
      return router.dispatch('upload_image', rest, tabId, browserId)
    },
  )
}
