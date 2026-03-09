import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'events'
import { ExtensionRegistry } from '../bridge.js'

// Minimal WebSocket mock
function makeMockWs() {
  const emitter = new EventEmitter()
  const ws = {
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    on: (event: string, listener: (...args: unknown[]) => void) =>
      emitter.on(event, listener),
    emit: (event: string, ...args: unknown[]) =>
      emitter.emit(event, ...args),
    readyState: 1, // OPEN
  }
  return ws
}

describe('ExtensionRegistry', () => {
  let registry: ExtensionRegistry

  beforeEach(() => {
    registry = new ExtensionRegistry()
  })

  it('starts with count 0', () => {
    expect(registry.count()).toBe(0)
  })

  it('adds an extension and reports count 1', () => {
    const ws = makeMockWs()
    registry.add(ws as unknown as import('ws').WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-1',
      connectedAt: new Date().toISOString(),
    })
    expect(registry.count()).toBe(1)
  })

  it('getAll returns all connected extensions from different extensionIds', () => {
    const ws1 = makeMockWs()
    const ws2 = makeMockWs()
    registry.add(ws1 as unknown as import('ws').WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-1',
      connectedAt: new Date().toISOString(),
    })
    registry.add(ws2 as unknown as import('ws').WebSocket, {
      extensionId: 'ext-2',
      instanceId: 'inst-2',
      connectedAt: new Date().toISOString(),
    })
    const all = registry.getAll()
    expect(all).toHaveLength(2)
    expect(all.map((c) => c.instanceId)).toContain('inst-1')
    expect(all.map((c) => c.instanceId)).toContain('inst-2')
  })

  it('same extensionId with new instanceId evicts old connection', () => {
    const ws1 = makeMockWs()
    const ws2 = makeMockWs()
    const disconnectedIds: string[] = []
    registry.on('disconnected', (id: string) => disconnectedIds.push(id))

    registry.add(ws1 as unknown as import('ws').WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-old',
      connectedAt: new Date().toISOString(),
    })
    registry.add(ws2 as unknown as import('ws').WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-new',
      connectedAt: new Date().toISOString(),
    })

    // Old connection should be terminated
    expect(ws1.terminate).toHaveBeenCalledTimes(1)
    expect(disconnectedIds).toContain('inst-old')
    // Only one connection remains
    expect(registry.count()).toBe(1)
    expect(registry.getById('inst-new')).toBeDefined()
    expect(registry.getById('inst-old')).toBeUndefined()
  })

  it('getById returns the correct connection by instanceId', () => {
    const ws = makeMockWs()
    const connectedAt = new Date().toISOString()
    registry.add(ws as unknown as import('ws').WebSocket, {
      extensionId: 'ext-42',
      instanceId: 'inst-42',
      connectedAt,
    })
    const conn = registry.getById('inst-42')
    expect(conn).toBeDefined()
    expect(conn?.extensionId).toBe('ext-42')
    expect(conn?.instanceId).toBe('inst-42')
    expect(conn?.connectedAt).toBe(connectedAt)
  })

  it('getById returns undefined for unknown id', () => {
    expect(registry.getById('does-not-exist')).toBeUndefined()
  })

  it('remove decrements count', () => {
    const ws = makeMockWs()
    registry.add(ws as unknown as import('ws').WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-1',
      connectedAt: new Date().toISOString(),
    })
    expect(registry.count()).toBe(1)
    registry.remove('inst-1')
    expect(registry.count()).toBe(0)
  })

  it('remove a non-existent id is a no-op', () => {
    expect(() => registry.remove('not-present')).not.toThrow()
    expect(registry.count()).toBe(0)
  })

  it('getById returns undefined after remove', () => {
    const ws = makeMockWs()
    registry.add(ws as unknown as import('ws').WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-1',
      connectedAt: new Date().toISOString(),
    })
    registry.remove('inst-1')
    expect(registry.getById('inst-1')).toBeUndefined()
  })

  it('extension with activeTabId stores it correctly', () => {
    const ws = makeMockWs()
    registry.add(ws as unknown as import('ws').WebSocket, {
      extensionId: 'ext-tab',
      instanceId: 'inst-tab',
      connectedAt: new Date().toISOString(),
      activeTabId: 123,
    })
    const conn = registry.getById('inst-tab')
    expect(conn?.activeTabId).toBe(123)
  })

  it('duplicate instanceId: old ws is terminated and disconnected event emitted before new connection is added', () => {
    const ws1 = makeMockWs()
    const ws2 = makeMockWs()

    const disconnectedIds: string[] = []
    registry.on('disconnected', (id: string) => disconnectedIds.push(id))

    // Add first connection
    registry.add(ws1 as unknown as import('ws').WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-dup',
      connectedAt: new Date().toISOString(),
    })
    expect(registry.count()).toBe(1)
    expect(registry.getById('inst-dup')?.ws).toBe(ws1)

    // Add second connection with same instanceId
    registry.add(ws2 as unknown as import('ws').WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-dup',
      connectedAt: new Date().toISOString(),
    })

    // Old ws should have been terminated
    expect(ws1.terminate).toHaveBeenCalledTimes(1)
    // 'disconnected' should have been emitted for the old connection
    expect(disconnectedIds).toContain('inst-dup')
    // Only one connection in the registry
    expect(registry.count()).toBe(1)
    // The new connection is registered
    expect(registry.getById('inst-dup')?.ws).toBe(ws2)
  })

  it('duplicate instanceId: stale close event on old ws does not remove new connection', () => {
    const ws1 = makeMockWs()
    const ws2 = makeMockWs()

    // Add first connection, then replace with second
    registry.add(ws1 as unknown as import('ws').WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-stale',
      connectedAt: new Date().toISOString(),
    })
    registry.add(ws2 as unknown as import('ws').WebSocket, {
      extensionId: 'ext-1',
      instanceId: 'inst-stale',
      connectedAt: new Date().toISOString(),
    })

    // At this point ws2 is the current connection
    expect(registry.getById('inst-stale')?.ws).toBe(ws2)

    // Simulate stale 'close' event firing on old ws1
    ws1.emit('close')

    // The new ws2 connection should still be registered
    expect(registry.getById('inst-stale')?.ws).toBe(ws2)
    expect(registry.count()).toBe(1)
  })
})
