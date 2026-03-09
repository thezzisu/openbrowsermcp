// Content script: injected into all pages at document_idle
// Provides visual feedback (pulsing border + stop button) during agentic sessions.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BORDER_COLOR = '#2563EB'
const BORDER_GLOW = 'rgba(37,99,235,0.45)'
const BORDER_WIDTH = 3
const ANIMATION_NAME = 'obm-pulse'
const BORDER_ID = 'obm-visual-border'
const TOOLBAR_ID = 'obm-toolbar'
const BANNER_ID = 'obm-static-banner'
const STYLE_ID = 'obm-style'

// ---------------------------------------------------------------------------
// Inject CSS animation styles
// ---------------------------------------------------------------------------

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes ${ANIMATION_NAME} {
      0%   { box-shadow: 0 0 0 0 ${BORDER_GLOW}, inset 0 0 0 0 ${BORDER_GLOW}; opacity: 1; }
      50%  { box-shadow: 0 0 18px 4px ${BORDER_GLOW}, inset 0 0 12px 2px ${BORDER_GLOW}; opacity: 0.75; }
      100% { box-shadow: 0 0 0 0 ${BORDER_GLOW}, inset 0 0 0 0 ${BORDER_GLOW}; opacity: 1; }
    }
    @keyframes obm-spinner {
      to { transform: rotate(360deg); }
    }
    #${BORDER_ID} {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483647;
      box-sizing: border-box;
      border: ${BORDER_WIDTH}px solid ${BORDER_COLOR};
      animation: ${ANIMATION_NAME} 2s ease-in-out infinite;
    }
    #${TOOLBAR_ID} {
      position: fixed;
      bottom: 14px;
      right: 14px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(15,23,42,0.9);
      border: 1px solid rgba(37,99,235,0.55);
      border-radius: 10px;
      padding: 7px 8px 7px 14px;
      font-size: 13px;
      font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
      font-weight: 500;
      letter-spacing: 0.01em;
      box-shadow: 0 0 0 1px rgba(37,99,235,0.15), 0 4px 20px rgba(0,0,0,0.45), 0 0 28px rgba(37,99,235,0.12);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    #${TOOLBAR_ID} .obm-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: ${BORDER_COLOR};
      box-shadow: 0 0 7px ${BORDER_COLOR};
      flex-shrink: 0;
      animation: obm-dot-pulse 2s ease-in-out infinite;
    }
    @keyframes obm-dot-pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 7px ${BORDER_COLOR}; }
      50% { opacity: 0.5; box-shadow: 0 0 3px ${BORDER_COLOR}; }
    }
    #${TOOLBAR_ID} .obm-label {
      color: #94a3b8;
      white-space: nowrap;
    }
    #${TOOLBAR_ID} .obm-divider {
      width: 1px;
      height: 16px;
      background: rgba(37,99,235,0.3);
      flex-shrink: 0;
    }
    #${TOOLBAR_ID} .obm-stop {
      background: rgba(37,99,235,0.15);
      border: 1px solid rgba(37,99,235,0.4);
      border-radius: 6px;
      color: #93c5fd;
      cursor: pointer;
      font-size: 12px;
      font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
      font-weight: 600;
      padding: 3px 10px;
      letter-spacing: 0.02em;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
      white-space: nowrap;
    }
    #${TOOLBAR_ID} .obm-stop:hover {
      background: rgba(37,99,235,0.28);
      border-color: rgba(37,99,235,0.7);
      color: #bfdbfe;
    }
    #${BANNER_ID} {
      position: fixed;
      bottom: 14px;
      right: 14px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(15,23,42,0.82);
      color: #64748b;
      border: 1px solid rgba(37,99,235,0.2);
      border-radius: 10px;
      padding: 6px 10px 6px 14px;
      font-size: 12px;
      font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
      font-weight: 500;
      letter-spacing: 0.02em;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    #${BANNER_ID}::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #334155;
      flex-shrink: 0;
    }
    #${BANNER_ID} button {
      background: transparent;
      border: none;
      color: #334155;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      padding: 0 2px;
      transition: color 0.12s;
    }
    #${BANNER_ID} button:hover {
      color: #64748b;
    }
  `
  document.documentElement.appendChild(style)
}

// ---------------------------------------------------------------------------
// Active indicator (pulsing border + stop button)
// ---------------------------------------------------------------------------

function showIndicator(): void {
  ensureStyles()

  // Remove static banner if present (transitioning back to active)
  document.getElementById(BANNER_ID)?.remove()

  // Create border overlay if not present
  if (!document.getElementById(BORDER_ID)) {
    const border = document.createElement('div')
    border.id = BORDER_ID
    document.documentElement.appendChild(border)
  }

  // Create toolbar (label + stop button) if not present
  if (!document.getElementById(TOOLBAR_ID)) {
    const toolbar = document.createElement('div')
    toolbar.id = TOOLBAR_ID

    const dot = document.createElement('span')
    dot.className = 'obm-dot'

    const label = document.createElement('span')
    label.className = 'obm-label'
    label.textContent = 'Agent is active'

    const divider = document.createElement('span')
    divider.className = 'obm-divider'

    const stopBtn = document.createElement('button')
    stopBtn.className = 'obm-stop'
    stopBtn.textContent = 'Stop'
    stopBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'STOP_AGENT' }, () => {
        void chrome.runtime.lastError
      })
    })

    toolbar.appendChild(dot)
    toolbar.appendChild(label)
    toolbar.appendChild(divider)
    toolbar.appendChild(stopBtn)
    document.documentElement.appendChild(toolbar)
  }
}

function hideIndicator(): void {
  document.getElementById(BORDER_ID)?.remove()
  document.getElementById(TOOLBAR_ID)?.remove()
}

// ---------------------------------------------------------------------------
// Static banner ("Agent is active")
// ---------------------------------------------------------------------------

function showStaticBanner(): void {
  ensureStyles()

  if (document.getElementById(BANNER_ID)) return

  const banner = document.createElement('div')
  banner.id = BANNER_ID

  const label = document.createElement('span')
  label.textContent = 'Agent is active'

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '×'
  closeBtn.setAttribute('aria-label', 'Dismiss')
  closeBtn.addEventListener('click', () => {
    banner.remove()
  })

  banner.appendChild(label)
  banner.appendChild(closeBtn)
  document.documentElement.appendChild(banner)
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message
    ) {
      const { type } = message as { type: string }
      if (type === 'INDICATOR_SHOW') {
        showIndicator()
        sendResponse({ ok: true })
        return true
      }
      if (type === 'INDICATOR_HIDE') {
        hideIndicator()
        showStaticBanner()
        sendResponse({ ok: true })
        return true
      }
    }
    return false
  },
)

export {}
