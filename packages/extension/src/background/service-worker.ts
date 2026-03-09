// Chrome Extension background service worker (Manifest V3).

import { isToolCallMessage, isAgentDoneMessage } from '@openbrowsermcp/shared'
import { cdpSession } from './cdp.js'
import { bridgeClient } from './bridge-client.js'
import { dispatchTool } from './tool-registry.js'
import { ALARM_KEEPALIVE, ALARM_WS_RECONNECT } from './bridge-client.js'
// Register all tools (side-effect imports — each module calls registerTool)
import './tools/computer.js'
import './tools/navigation.js'
import './tools/dom.js'
import './tools/monitoring.js'
import './tools/tabs.js'
import './tools/upload.js'
import './tools/misc.js'

// ---------------------------------------------------------------------------
// Stop agent cancellation token + per-tab indicator debounce
// ---------------------------------------------------------------------------

// Set to the requestId of the currently executing tool call (if any).
// Cleared after the tool completes or is cancelled.
let pendingRequestId: string | null = null

// Per-tab debounce timers: tabId → setTimeout handle.
// After a tool finishes on a tab, we schedule hiding its indicator after
// INDICATOR_HIDE_DELAY_MS. A new tool call on the same tab cancels the timer,
// keeping the indicator visible across consecutive calls.
const INDICATOR_HIDE_DELAY_MS = 10_000
const hideIndicatorTimers = new Map<number, ReturnType<typeof setTimeout>>()

function scheduleHideIndicator(tabId: number): void {
  const existing = hideIndicatorTimers.get(tabId)
  if (existing !== undefined) clearTimeout(existing)
  hideIndicatorTimers.set(tabId, setTimeout(() => {
    hideIndicatorTimers.delete(tabId)
    sendIndicatorMessage(tabId, 'INDICATOR_HIDE')
  }, INDICATOR_HIDE_DELAY_MS))
}

function cancelHideIndicatorForTab(tabId: number): void {
  const existing = hideIndicatorTimers.get(tabId)
  if (existing !== undefined) {
    clearTimeout(existing)
    hideIndicatorTimers.delete(tabId)
  }
}

function cancelAllHideIndicators(): void {
  for (const [tabId, timer] of hideIndicatorTimers) {
    clearTimeout(timer)
    sendIndicatorMessage(tabId, 'INDICATOR_HIDE')
  }
  hideIndicatorTimers.clear()
}

// Track which tabs currently have an active indicator, for STOP_AGENT
const activeIndicatorTabs = new Set<number>()

/**
 * Sends a message to the content script of the given tab.
 * Silently ignores errors (e.g., tab closed, content script not injected).
 */
function sendIndicatorMessage(tabId: number, type: string): void {
  chrome.tabs.sendMessage(tabId, { type }, () => {
    // Suppress "Could not establish connection" errors
    void chrome.runtime.lastError
  })
}

// Open the options page when the user clicks the extension icon.
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage()
})

// Connect to the MCP server on service worker startup.
void bridgeClient.connect()

// Handle incoming messages from the MCP server.
bridgeClient.onMessage(async (msg) => {
  // Agent explicitly signals it's done — hide indicators for specified tabs immediately.
  if (isAgentDoneMessage(msg)) {
    for (const tabId of msg.tabIds) {
      cancelHideIndicatorForTab(tabId)
      activeIndicatorTabs.delete(tabId)
      sendIndicatorMessage(tabId, 'INDICATOR_HIDE')
    }
    return
  }

  if (!isToolCallMessage(msg)) return

  const { requestId, tool, args, tabId } = msg

  // Determine the active tab if no tabId was specified.
  const resolvedTabId = await resolveTabId(tabId)

  // Show the visual indicator before executing the tool.
  // Cancel any pending hide timer for this tab so the border stays visible.
  cancelHideIndicatorForTab(resolvedTabId)
  activeIndicatorTabs.add(resolvedTabId)
  pendingRequestId = requestId
  sendIndicatorMessage(resolvedTabId, 'INDICATOR_SHOW')

  try {
    const result = await dispatchTool(tool, resolvedTabId, args)

    // Check if the tool was stopped by the user
    if (pendingRequestId !== requestId) {
      // Already cancelled — do not send result
      return
    }

    bridgeClient.send({ type: 'tool_result', requestId, result })
  } catch (err) {
    if (pendingRequestId !== requestId) {
      // Already cancelled — do not send error
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    bridgeClient.send({
      type: 'tool_error',
      requestId,
      error: { message },
    })
  } finally {
    // Schedule hiding the indicator after a delay, so consecutive tool calls
    // on the same tab don't cause the border to flicker.
    if (pendingRequestId === requestId) {
      pendingRequestId = null
      scheduleHideIndicator(resolvedTabId)
    }
  }
})

// Handle messages from content scripts and the options page.
chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('type' in message)
    ) {
      return false
    }

    const msgType = (message as { type: string }).type

    // -----------------------------------------------------------------------
    // STOP_AGENT — content script stop button
    // -----------------------------------------------------------------------
    if (msgType === 'STOP_AGENT') {
      if (pendingRequestId !== null) {
        const stoppedRequestId = pendingRequestId
        pendingRequestId = null
        bridgeClient.send({
          type: 'tool_error',
          requestId: stoppedRequestId,
          error: { message: 'Tool execution stopped by user' },
        })
      }
      // Cancel all debounce timers and hide indicators on all active tabs immediately.
      cancelAllHideIndicators()
      activeIndicatorTabs.clear()
      sendResponse({ ok: true })
      return true
    }

    // -----------------------------------------------------------------------
    // GET_STATUS — options page queries current connection state
    // -----------------------------------------------------------------------
    if (msgType === 'GET_STATUS') {
      sendResponse({
        type: 'STATUS',
        connected: bridgeClient.isConnected,
        extensionId: chrome.runtime.id,
      })
      return true
    }

    // -----------------------------------------------------------------------
    // RECONNECT — options page requests reconnection after URL change
    // -----------------------------------------------------------------------
    if (msgType === 'RECONNECT') {
      bridgeClient.disconnect()
      void bridgeClient.connect()
      sendResponse({ ok: true })
      return true
    }

    return false
  },
)

// Detach all CDP sessions when the service worker is being unloaded.
// 'beforeunload' is fired on service worker shutdown.
addEventListener('beforeunload', () => {
  bridgeClient.disconnect()
  void cdpSession.detachAll()
})

// ---------------------------------------------------------------------------
// Alarm handler — used for keepalive and reconnect (MV3 service workers are
// suspended when idle, which kills setTimeout timers; alarms persist).
// ---------------------------------------------------------------------------
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_KEEPALIVE || alarm.name === ALARM_WS_RECONNECT) {
    void bridgeClient.onAlarm(alarm.name)
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns tabId if provided, otherwise queries Chrome for the active tab.
 */
async function resolveTabId(tabId: number | undefined): Promise<number> {
  if (tabId !== undefined) return tabId

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const activeTab = tabs[0]
  if (!activeTab?.id) {
    throw new Error('No active tab found')
  }
  return activeTab.id
}
