import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { Router } from '../router.js'
import { ExtensionRegistry } from '../bridge.js'
import type { WebSocket } from 'ws'

// ---------------------------------------------------------------------------
// Mock WebSocket helper
// ---------------------------------------------------------------------------

function makeMockWs() {
  const emitter = new EventEmitter()
  const ws = {
    send: vi.fn(),
    close: vi.fn(),
    on: (event: string, listener: (...args: unknown[]) => void) =>
      emitter.on(event, listener),
    emit: (event: string, ...args: unknown[]) =>
      emitter.emit(event, ...args),
    readyState: 1, // OPEN
  }
  return ws
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Router', () => {
  let registry: ExtensionRegistry
  let router: Router

  beforeEach(() => {
    registry = new ExtensionRegistry()
    router = new Router(registry)
  })

  afterEach(() => {
    router.destroy()
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // Test 1: dispatch with no extension returns isError result
  // -------------------------------------------------------------------------
  it('dispatch with no extension returns isError result', async () => {
    const result = await router.dispatch('computer', { action: 'screenshot' })
    expect(result.isError).toBe(true)
    expect(result.content).toHaveLength(1)
    const content = result.content[0]!
    expect(content.type).toBe('text')
    if (content.type === 'text') {
      expect(content.text).toContain('extension')
    }
  })

  // -------------------------------------------------------------------------
  // Test 2: dispatch routes tool_call to WebSocket and resolves with result
  // -------------------------------------------------------------------------
  it('dispatch routes tool_call to WebSocket and resolves with tool result', async () => {
    const ws = makeMockWs()
    registry.add(ws as unknown as WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-1',
      connectedAt: new Date().toISOString(),
    })

    const dispatchPromise = router.dispatch('computer', { action: 'screenshot' })

    // The router should have sent a tool_call message via WebSocket
    expect(ws.send).toHaveBeenCalledTimes(1)
    const sentMessage = JSON.parse(ws.send.mock.calls[0]![0] as string) as {
      type: string
      requestId: string
      tool: string
      args: unknown
    }
    expect(sentMessage.type).toBe('tool_call')
    expect(sentMessage.tool).toBe('computer')
    expect(sentMessage.requestId).toBeTruthy()

    // Simulate extension returning a tool_result
    const toolResult = {
      content: [{ type: 'image', data: 'base64data', mimeType: 'image/jpeg' }],
    }
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'tool_result',
          requestId: sentMessage.requestId,
          result: toolResult,
        }),
      ),
    )

    const result = await dispatchPromise
    expect(result.isError).toBeFalsy()
    expect(result.content).toHaveLength(1)
    expect(result.content[0]!.type).toBe('image')
  })

  // -------------------------------------------------------------------------
  // Test 3: dispatch rejects with timeout after 30s
  // -------------------------------------------------------------------------
  it('dispatch rejects with timeout after 30s', async () => {
    vi.useFakeTimers()

    const ws = makeMockWs()
    registry.add(ws as unknown as WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-1',
      connectedAt: new Date().toISOString(),
    })

    const dispatchPromise = router.dispatch('computer', { action: 'screenshot' })

    // Advance timers by 30 seconds
    vi.advanceTimersByTime(30000)

    await expect(dispatchPromise).rejects.toThrow('Tool call timed out after 30s')
  })

  // -------------------------------------------------------------------------
  // Test 4: Extension disconnect rejects pending requests
  // -------------------------------------------------------------------------
  it('extension disconnect rejects pending requests', async () => {
    const ws = makeMockWs()
    registry.add(ws as unknown as WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-1',
      connectedAt: new Date().toISOString(),
    })

    const dispatchPromise = router.dispatch('computer', { action: 'screenshot' })

    // Simulate extension disconnect
    ws.emit('close')

    await expect(dispatchPromise).rejects.toThrow('Extension disconnected')
  })

  // -------------------------------------------------------------------------
  // Test 5: dispatch selects extension by browserId when provided
  // -------------------------------------------------------------------------
  it('dispatch selects extension by browserId when provided', async () => {
    const ws1 = makeMockWs()
    const ws2 = makeMockWs()
    registry.add(ws1 as unknown as WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-1',
      connectedAt: new Date().toISOString(),
    })
    registry.add(ws2 as unknown as WebSocket, {
      extensionId: 'ext-2',
      instanceId: 'inst-2',
      connectedAt: new Date().toISOString(),
    })

    // Dispatch with browserId=inst-2 — should send to ws2, not ws1
    const dispatchPromise = router.dispatch('navigate', { url: 'https://example.com' }, 42, 'inst-2')

    // ws1 should NOT have been called
    expect(ws1.send).not.toHaveBeenCalled()
    // ws2 should have been called
    expect(ws2.send).toHaveBeenCalledTimes(1)

    const sentMessage = JSON.parse(ws2.send.mock.calls[0]![0] as string) as {
      type: string
      requestId: string
      tool: string
      tabId: number
    }
    expect(sentMessage.type).toBe('tool_call')
    expect(sentMessage.tabId).toBe(42)

    // Resolve it
    ws2.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'tool_result',
          requestId: sentMessage.requestId,
          result: { content: [{ type: 'text', text: 'navigated' }] },
        }),
      ),
    )

    const result = await dispatchPromise
    expect(result.isError).toBeFalsy()
  })

  // -------------------------------------------------------------------------
  // Test 6: dispatch returns tool error when extension sends tool_error
  // -------------------------------------------------------------------------
  it('dispatch returns isError when extension sends tool_error', async () => {
    const ws = makeMockWs()
    registry.add(ws as unknown as WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-1',
      connectedAt: new Date().toISOString(),
    })

    const dispatchPromise = router.dispatch('computer', { action: 'screenshot' })

    expect(ws.send).toHaveBeenCalledTimes(1)
    const sentMessage = JSON.parse(ws.send.mock.calls[0]![0] as string) as {
      requestId: string
    }

    // Simulate extension returning a tool_error
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'tool_error',
          requestId: sentMessage.requestId,
          error: { message: 'CDP error: tab not found' },
        }),
      ),
    )

    const result = await dispatchPromise
    expect(result.isError).toBe(true)
    const item = result.content[0]!
    expect(item.type).toBe('text')
    if (item.type === 'text') {
      expect(item.text).toContain('CDP error: tab not found')
    }
  })
})
