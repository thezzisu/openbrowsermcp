import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ExtensionRegistry } from '../bridge.js'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const browsersContextSchema = z.object({})

export type BrowsersContextArgs = z.infer<typeof browsersContextSchema>

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerBrowsersContextTool(
  server: McpServer,
  registry: ExtensionRegistry | undefined,
): void {
  server.registerTool(
    'browsers_context',
    {
      title: 'Browsers Context',
      description:
        'List all connected browser instances. Use the returned browserId to target a specific browser in other tool calls.',
      inputSchema: browsersContextSchema.shape,
    },
    async () => {
      if (!registry) {
        return {
          content: [{ type: 'text' as const, text: 'No registry available.' }],
          isError: true,
        }
      }
      const all = registry.getAll()
      if (all.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No browsers connected.' }],
        }
      }
      const lines = [`Connected browsers (${all.length}):`, `Default browser: ${all[0]!.instanceId}`]
      for (let i = 0; i < all.length; i++) {
        const conn = all[i]!
        const isDefault = i === 0
        lines.push(`  browserId: ${conn.instanceId}${isDefault ? ' (default)' : ''}`)
        if (conn.browserInfo) {
          lines.push(`    browser: ${conn.browserInfo.name} ${conn.browserInfo.version} on ${conn.browserInfo.platform}`)
        }
        lines.push(`    extensionId: ${conn.extensionId}`)
        lines.push(`    connectedAt: ${conn.connectedAt}`)
        if (conn.activeTabUrl) lines.push(`    activeTab: ${conn.activeTabUrl}`)
      }
      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      }
    },
  )
}
