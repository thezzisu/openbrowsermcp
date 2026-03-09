import { randomUUID } from 'crypto'
import { BridgeMessageType, type ToolResult } from '@openbrowsermcp/shared'
import type { ExtensionRegistry } from './bridge.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MaybeIsError = {
  isError?: boolean
}

export type RouterToolResult = ToolResult & MaybeIsError

type PendingRequest = {
  resolve: (result: RouterToolResult) => void
  reject: (reason: Error) => void
  instanceId: string
  timeoutHandle: ReturnType<typeof setTimeout>
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 30_000

/**
 * Routes MCP tool calls to connected Chrome extensions via WebSocket.
 *
 * - Selects target extension by browserId (if provided) or first connected (default).
 * - tabId is forwarded to the extension as the operation target; it is NOT used for routing.
 * - Rejects pending requests on extension disconnect or 30s timeout.
 */
export class Router {
  private readonly pending = new Map<string, PendingRequest>()

  constructor(private readonly registry: ExtensionRegistry) {
    // Handle tool_result from extension
    registry.on(
      'message:tool_result',
      (payload: { extensionId: string; msg: { requestId: string; result: ToolResult } }) => {
        const pending = this.pending.get(payload.msg.requestId)
        if (!pending) return
        this.clearPending(payload.msg.requestId)
        pending.resolve({ ...payload.msg.result })
      },
    )

    // Handle tool_error from extension
    registry.on(
      'message:tool_error',
      (payload: { extensionId: string; msg: { requestId: string; error: { message: string } } }) => {
        const pending = this.pending.get(payload.msg.requestId)
        if (!pending) return
        this.clearPending(payload.msg.requestId)
        pending.resolve({
          content: [{ type: 'text', text: payload.msg.error.message }],
          isError: true,
        })
      },
    )

    // Handle extension disconnect: reject all pending requests for that instance
    registry.on('disconnected', (instanceId: string) => {
      this.rejectForInstance(instanceId, new Error('Extension disconnected'))
    })
  }

  /**
   * Dispatch a tool call to the appropriate extension.
   *
   * Routing: browserId → default (first connected). tabId is NOT used for routing;
   * it is forwarded inside args/message to the extension as the operation target.
   *
   * @param toolName - MCP tool name
   * @param args - Tool arguments (may include tabId for the extension to act on)
   * @param tabId - Tab ID forwarded to the extension; required for tab-targeted operations
   * @param browserId - Optional browser instanceId; omit to use the default browser
   * @returns Resolved tool result (never throws — errors are in isError=true results)
   */
  async dispatch(
    toolName: string,
    args: unknown,
    tabId?: number,
    browserId?: string,
  ): Promise<RouterToolResult> {
    const connection = this.selectExtension(browserId)
    if (!connection) {
      return {
        content: [
          {
            type: 'text',
            text: 'No extension connected. Load the OpenBrowserMCP extension in Chrome.',
          },
        ],
        isError: true,
      }
    }

    const requestId = randomUUID()

    return new Promise<RouterToolResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        const pending = this.pending.get(requestId)
        if (!pending) return
        this.clearPending(requestId)
        reject(new Error('Tool call timed out after 30s'))
      }, TIMEOUT_MS)

      this.pending.set(requestId, {
        resolve,
        reject,
        instanceId: connection.instanceId,
        timeoutHandle,
      })

      // Send tool_call to extension; tabId tells the extension which tab to act on
      const message = JSON.stringify({
        type: BridgeMessageType.TOOL_CALL,
        requestId,
        tool: toolName,
        args: args as Record<string, unknown>,
        ...(tabId !== undefined ? { tabId } : {}),
      })

      connection.ws.send(message)
    })
  }

  /**
   * Remove all event listeners this router attached to the registry.
   * Call this in tests (afterEach) or when tearing down a router instance
   * to prevent listener accumulation.
   */
  destroy(): void {
    this.registry.removeAllListeners()
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private selectExtension(browserId?: string) {
    const all = this.registry.getAll()
    if (all.length === 0) return undefined

    // Explicit browserId (instanceId) takes priority
    if (browserId !== undefined) {
      return all.find((c) => c.instanceId === browserId) ?? null
    }

    // Default: most recently connected extension (last in insertion order).
    // The latest connection is the active one; earlier entries may be stale
    // sockets whose service worker restarted but whose TCP connection is
    // still alive (passing heartbeat pings at the TCP level).
    return all[all.length - 1]
  }

  private clearPending(requestId: string): void {
    const pending = this.pending.get(requestId)
    if (pending) {
      clearTimeout(pending.timeoutHandle)
      this.pending.delete(requestId)
    }
  }

  private rejectForInstance(instanceId: string, reason: Error): void {
    for (const [requestId, pending] of this.pending) {
      if (pending.instanceId === instanceId) {
        this.clearPending(requestId)
        pending.reject(reason)
      }
    }
  }
}
