import * as z from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { BridgeMessageType } from '@openbrowsermcp/shared'
import type { ExtensionRegistry } from '../bridge.js'

export const agentDoneSchema = z.object({
  tabIds: z.array(z.number().int()).min(1).describe('List of tab IDs that the agent has finished operating on. The visual indicator will be hidden for each of these tabs.'),
  browserId: z.string().optional().describe('Target browser instanceId. Omit to use the default browser.'),
})

export type AgentDoneArgs = z.infer<typeof agentDoneSchema>

export function registerAgentDoneTool(
  server: McpServer,
  registry: ExtensionRegistry | undefined,
): void {
  server.registerTool(
    'agent_done',
    {
      title: 'Agent Done',
      description:
        'Call this tool when you have finished all browser interactions. ' +
        'Pass the tabIds you operated on so the browser can hide the "Agent is active" indicator, ' +
        'signalling to the user that they can take over.',
      inputSchema: agentDoneSchema.shape,
    },
    async (args: AgentDoneArgs) => {
      if (!registry) {
        return {
          content: [{ type: 'text' as const, text: 'No registry available.' }],
          isError: true,
        }
      }

      const all = registry.getAll()
      const targets = args.browserId
        ? [registry.getById(args.browserId)].filter(Boolean)
        : all.length > 0 ? [all[0]!] : []

      if (targets.length === 0) {
        return {
          content: [{ type: 'text' as const, text: args.browserId ? `Browser ${args.browserId} not found.` : 'No browsers connected.' }],
          isError: true,
        }
      }

      const msg = JSON.stringify({ type: BridgeMessageType.AGENT_DONE, tabIds: args.tabIds })
      for (const conn of targets) {
        conn!.ws.send(msg)
      }

      return {
        content: [{ type: 'text' as const, text: `Agent session ended for tabs [${args.tabIds.join(', ')}]. Browser control returned to user.` }],
      }
    },
  )
}
