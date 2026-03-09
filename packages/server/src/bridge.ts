import { EventEmitter } from 'events'
import type { WebSocket } from 'ws'
import {
  parseExtensionMessage,
  isConnectMessage,
  isToolResultMessage,
  isToolErrorMessage,
  type ExtensionToServerMessage,
  type BrowserInfo,
} from '@openbrowsermcp/shared'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExtensionConnection = {
  ws: WebSocket
  extensionId: string
  instanceId: string
  connectedAt: string
  activeTabId?: number
  activeTabUrl?: string
  browserInfo?: BrowserInfo
}

export type ExtensionConnectionInfo = {
  extensionId: string
  instanceId: string
  connectedAt: string
  activeTabId?: number
  activeTabUrl?: string
  browserInfo?: BrowserInfo
}

// ---------------------------------------------------------------------------
// ExtensionRegistry
// ---------------------------------------------------------------------------

// Heartbeat interval: ping every 15 seconds; no pong within interval → dead
const HEARTBEAT_INTERVAL_MS = 15_000

/**
 * Manages connected Chrome extensions (WebSocket connections).
 * Emits events for tool results/errors so the router can handle them.
 *
 * A heartbeat timer pings all connections every HEARTBEAT_INTERVAL_MS.
 * Any connection that fails to respond with a pong is terminated, which
 * ensures stale entries (e.g. browser closed without a clean TCP teardown)
 * are detected and removed promptly.
 */
export class ExtensionRegistry extends EventEmitter {
  private readonly connections = new Map<string, ExtensionConnection>()
  // Tracks which WebSocket sockets have responded to the last ping
  private readonly alive = new WeakSet<WebSocket>()
  private readonly heartbeatTimer: ReturnType<typeof setInterval>

  constructor() {
    super()
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS)
    // Don't keep the process alive solely for the heartbeat
    this.heartbeatTimer.unref?.()
  }

  /** Stop the heartbeat timer (call when shutting down). */
  destroy(): void {
    clearInterval(this.heartbeatTimer)
  }

  /** Register a new extension WebSocket connection, keyed by instanceId. */
  add(ws: WebSocket, info: ExtensionConnectionInfo): void {
    // If this instanceId is already registered, clean up the old connection
    // before adding the new one to prevent stale close-event handlers from
    // prematurely removing the new connection.
    const existing = this.connections.get(info.instanceId)
    if (existing) {
      this.connections.delete(info.instanceId)
      existing.ws.terminate()
      this.emit('disconnected', info.instanceId)
    }

    // Evict any stale connections from the same extensionId (same Chrome
    // install) with a different instanceId. This happens when the service
    // worker restarts and generates a new instanceId while the old TCP
    // connection is still alive (passing heartbeat pings).
    for (const [oldInstanceId, conn] of this.connections) {
      if (conn.extensionId === info.extensionId && oldInstanceId !== info.instanceId) {
        this.connections.delete(oldInstanceId)
        conn.ws.terminate()
        this.emit('disconnected', oldInstanceId)
      }
    }

    const connection: ExtensionConnection = { ws, ...info }
    this.connections.set(info.instanceId, connection)
    // Treat a freshly connected socket as alive
    this.alive.add(ws)

    ws.on('pong', () => {
      this.alive.add(ws)
    })

    ws.on('message', (data: Buffer | string) => {
      this.handleMessage(info.instanceId, data)
    })

    ws.on('close', () => {
      // Only remove/emit if this ws is still the registered connection.
      // A duplicate add() may have already replaced it.
      if (this.connections.get(info.instanceId)?.ws === ws) {
        this.remove(info.instanceId)
        this.emit('disconnected', info.instanceId)
      }
    })

    ws.on('error', () => {
      if (this.connections.get(info.instanceId)?.ws === ws) {
        this.remove(info.instanceId)
        this.emit('disconnected', info.instanceId)
      }
    })

    this.emit('connected', info.instanceId)
  }

  /** Remove a connection by its instanceId. */
  remove(instanceId: string): void {
    this.connections.delete(instanceId)
  }

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  private heartbeat(): void {
    for (const [instanceId, conn] of this.connections) {
      if (!this.alive.has(conn.ws)) {
        // No pong since last ping — connection is dead
        console.log(`[Registry] Heartbeat timeout for ${instanceId} — terminating`)
        this.connections.delete(instanceId)
        conn.ws.terminate()
        this.emit('disconnected', instanceId)
      } else {
        // Clear the alive flag and send a new ping
        this.alive.delete(conn.ws)
        conn.ws.ping()
      }
    }
  }

  /** Return all current connections. */
  getAll(): ExtensionConnection[] {
    return Array.from(this.connections.values())
  }

  /** Return a connection by instanceId, or undefined. */
  getById(instanceId: string): ExtensionConnection | undefined {
    return this.connections.get(instanceId)
  }

  /** Return the count of connected extensions. */
  count(): number {
    return this.connections.size
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private handleMessage(
    instanceId: string,
    data: Buffer | string,
  ): void {
    let msg: ExtensionToServerMessage
    try {
      msg = parseExtensionMessage(
        typeof data === 'string' ? data : data.toString(),
      )
    } catch (err) {
      this.emit('error:parse', { instanceId, err })
      return
    }

    if (isConnectMessage(msg)) {
      // connect message handled externally (during WS upgrade)
      this.emit('message:connect', { instanceId, msg })
    } else if (isToolResultMessage(msg)) {
      this.emit('message:tool_result', { instanceId, msg })
    } else if (isToolErrorMessage(msg)) {
      this.emit('message:tool_error', { instanceId, msg })
    } else {
      // pong or unknown — ignore
      this.emit('message:other', { instanceId, msg })
    }
  }
}


