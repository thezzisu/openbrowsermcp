import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Router } from '../router.js'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const tabIdField = z.number().int().describe('The numeric tab ID to operate on. Use tabs_context to get tab IDs.')
const browserIdField = z.string().optional().describe('Target browser instanceId. Omit to use the default browser.')

export const readPageSchema = z.object({
  filter: z.enum(['all', 'interactive']).optional().default('all'),
  depth: z.number().int().positive().optional(),
  maxChars: z.number().int().positive().optional(),
  refId: z.string().optional(),
  compact: z.boolean().optional().describe('When true, unnamed structural wrapper elements (div, group, region, etc.) are omitted from output to reduce token usage.'),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type ReadPageArgs = z.infer<typeof readPageSchema>

export const findSchema = z.object({
  description: z.string().min(1),
  refId: z.string().optional(),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type FindArgs = z.infer<typeof findSchema>

export const javascriptToolSchema = z.object({
  code: z.string().min(1),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type JavascriptToolArgs = z.infer<typeof javascriptToolSchema>

export const formInputSchema = z.object({
  refId: z.string().min(1),
  value: z.string(),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type FormInputArgs = z.infer<typeof formInputSchema>

export const getPageTextSchema = z.object({
  tabId: tabIdField,
  browserId: browserIdField,
})

export type GetPageTextArgs = z.infer<typeof getPageTextSchema>

export const clickElementSchema = z.object({
  refId: z.string().min(1).describe('The ref ID of the element to click, e.g. "ref_42". Obtain ref IDs from read_page or find.'),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type ClickElementArgs = z.infer<typeof clickElementSchema>

export const scrollElementSchema = z.object({
  refId: z.string().min(1).describe('The ref ID of the element to scroll within, e.g. "ref_42".'),
  direction: z.enum(['up', 'down', 'left', 'right']).default('down'),
  amount: z.number().int().positive().optional().describe('Number of scroll units (default 3).'),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type ScrollElementArgs = z.infer<typeof scrollElementSchema>

export const fillElementSchema = z.object({
  refId: z.string().min(1).describe('The ref ID of the input element to fill, e.g. "ref_42".'),
  text: z.string().describe('Text to fill. Existing content is cleared first via triple-click.'),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type FillElementArgs = z.infer<typeof fillElementSchema>

export const getElementInfoSchema = z.object({
  refId: z.string().min(1).describe('The ref ID of the element to inspect, e.g. "ref_42".'),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type GetElementInfoArgs = z.infer<typeof getElementInfoSchema>

export const waitForElementSchema = z.object({
  refId: z.string().optional().describe('Wait until a specific ref ID (e.g. "ref_42") is present and visible.'),
  description: z.string().optional().describe('Wait until an element matching this natural language description appears in the accessibility tree.'),
  timeout: z.number().int().positive().optional().describe('Maximum wait time in milliseconds (default 10000).'),
  tabId: tabIdField,
  browserId: browserIdField,
})

export type WaitForElementArgs = z.infer<typeof waitForElementSchema>

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerReadPageTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'read_page',
    {
      title: 'Read Page',
      description:
        'Generate an accessibility tree (structured DOM reading). Supports filtering to interactive elements only.',
      inputSchema: readPageSchema.shape,
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
      return router.dispatch('read_page', rest, tabId, browserId)
    },
  )
}

export function registerFindTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'find',
    {
      title: 'Find',
      description:
        'Find a page element using a natural language description.',
      inputSchema: findSchema.shape,
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
      return router.dispatch('find', rest, tabId, browserId)
    },
  )
}

export function registerJavascriptTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'javascript_tool',
    {
      title: 'JavaScript Tool',
      description:
        'Execute arbitrary JavaScript code in the page context.',
      inputSchema: javascriptToolSchema.shape,
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
      return router.dispatch('javascript_tool', rest, tabId, browserId)
    },
  )
}

export function registerFormInputTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'form_input',
    {
      title: 'Form Input',
      description:
        'Set the value of a form element identified by its ref ID.',
      inputSchema: formInputSchema.shape,
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
      return router.dispatch('form_input', rest, tabId, browserId)
    },
  )
}

export function registerGetPageTextTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'get_page_text',
    {
      title: 'Get Page Text',
      description:
        'Extract the plain text content of the current page.',
      inputSchema: getPageTextSchema.shape,
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
      return router.dispatch('get_page_text', rest, tabId, browserId)
    },
  )
}

export function registerWaitForElementTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'wait_for_element',
    {
      title: 'Wait For Element',
      description:
        'Poll until a page element appears (by ref ID or description), or until timeout. Useful after navigation, form submissions, or dynamic content loads.',
      inputSchema: waitForElementSchema.shape,
    },
    async (args: WaitForElementArgs) => {
      if (!router) {
        return { content: [{ type: 'text' as const, text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.' }], isError: true }
      }
      if (!args.refId && !args.description) {
        return { content: [{ type: 'text' as const, text: 'wait_for_element: either "refId" or "description" must be provided.' }], isError: true }
      }
      const { tabId, browserId, ...rest } = args
      return router.dispatch('wait_for_element', rest, tabId, browserId)
    },
  )
}

export function registerGetElementInfoTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'get_element_info',
    {
      title: 'Get Element Info',
      description:
        'Get detailed runtime information about a page element by its ref ID: tag, role, visibility, bounding box, value, attributes, computed styles, and innerHTML.',
      inputSchema: getElementInfoSchema.shape,
    },
    async (args) => {
      if (!router) {
        return { content: [{ type: 'text' as const, text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.' }], isError: true }
      }
      const { tabId, browserId, ...rest } = args
      return router.dispatch('get_element_info', rest, tabId, browserId)
    },
  )
}

export function registerScrollElementTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'scroll_element',
    {
      title: 'Scroll Element',
      description:
        'Scroll within a page element (e.g. a scrollable list or panel) by its ref ID. More reliable than coordinate-based scrolling for scrollable containers.',
      inputSchema: scrollElementSchema.shape,
    },
    async (args) => {
      if (!router) {
        return { content: [{ type: 'text' as const, text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.' }], isError: true }
      }
      const { tabId, browserId, ...rest } = args
      return router.dispatch('scroll_element', rest, tabId, browserId)
    },
  )
}

export function registerFillElementTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'fill_element',
    {
      title: 'Fill Element',
      description:
        'Clear an input/textarea element and type new text, identified by ref ID. Equivalent to triple-click (select all) then type. Prefer this over form_input for visible interactive inputs.',
      inputSchema: fillElementSchema.shape,
    },
    async (args) => {
      if (!router) {
        return { content: [{ type: 'text' as const, text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.' }], isError: true }
      }
      const { tabId, browserId, ...rest } = args
      return router.dispatch('fill_element', rest, tabId, browserId)
    },
  )
}

export function registerClickElementTool(
  server: McpServer,
  router: Router | undefined,
): void {
  server.registerTool(
    'click_element',
    {
      title: 'Click Element',
      description:
        'Click a page element by its ref ID (from read_page or find). More reliable than coordinate-based clicks because the element center is computed at click time.',
      inputSchema: clickElementSchema.shape,
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
      return router.dispatch('click_element', rest, tabId, browserId)
    },
  )
}
