import { describe, it, expect } from 'vitest'
import {
  readConsoleMessagesSchema,
  readNetworkRequestsSchema,
  tabsContextSchema,
  tabsCreateSchema,
  tabsContextMcpSchema,
  tabsCreateMcpSchema,
  fileUploadSchema,
  uploadImageSchema,
  gifCreatorSchema,
  shortcutsListSchema,
  shortcutsExecuteSchema,
} from '../tools/index.js'

// ---------------------------------------------------------------------------
// read_console_messages schema tests
// ---------------------------------------------------------------------------

describe('readConsoleMessagesSchema', () => {
  // tabId is now required
  it('accepts empty object (all defaults)', () => {
    const result = readConsoleMessagesSchema.safeParse({ tabId: 1 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.clear).toBe(false)
    }
  })

  it('accepts tabId and clear=true', () => {
    const result = readConsoleMessagesSchema.safeParse({ tabId: 42, clear: true })
    expect(result.success).toBe(true)
  })

  // Invalid: non-integer tabId
  it('rejects non-integer tabId', () => {
    const result = readConsoleMessagesSchema.safeParse({ tabId: 1.5 })
    expect(result.success).toBe(false)
  })

  // Invalid: string tabId
  it('rejects string tabId', () => {
    const result = readConsoleMessagesSchema.safeParse({ tabId: 'tab-1' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// read_network_requests schema tests
// ---------------------------------------------------------------------------

describe('readNetworkRequestsSchema', () => {
  // tabId is now required
  it('accepts empty object (all defaults)', () => {
    const result = readNetworkRequestsSchema.safeParse({ tabId: 1 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.clear).toBe(false)
      expect(result.data.filter).toBe('all')
    }
  })

  it('accepts filter=failed', () => {
    const result = readNetworkRequestsSchema.safeParse({ tabId: 1, filter: 'failed' })
    expect(result.success).toBe(true)
  })

  // Valid: with tabId, clear, and filter
  it('accepts tabId, clear=true, and filter=all', () => {
    const result = readNetworkRequestsSchema.safeParse({ tabId: 10, clear: true, filter: 'all' })
    expect(result.success).toBe(true)
  })

  // Invalid: unknown filter value
  it('rejects unknown filter value', () => {
    const result = readNetworkRequestsSchema.safeParse({ filter: 'pending' })
    expect(result.success).toBe(false)
  })

  // Invalid: non-integer tabId
  it('rejects non-integer tabId', () => {
    const result = readNetworkRequestsSchema.safeParse({ tabId: 2.7 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// tabs_context schema tests
// ---------------------------------------------------------------------------

describe('tabsContextSchema', () => {
  // Valid: no args
  it('accepts empty object', () => {
    const result = tabsContextSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  // Valid: with sessionId
  it('accepts sessionId', () => {
    const result = tabsContextSchema.safeParse({ sessionId: 'session-abc' })
    expect(result.success).toBe(true)
  })

  // Invalid: non-string sessionId
  it('rejects non-string sessionId', () => {
    const result = tabsContextSchema.safeParse({ sessionId: 123 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// tabs_create schema tests
// ---------------------------------------------------------------------------

describe('tabsCreateSchema', () => {
  // Valid: no args
  it('accepts empty object (all optional)', () => {
    const result = tabsCreateSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  // Valid: valid URL
  it('accepts valid url', () => {
    const result = tabsCreateSchema.safeParse({ url: 'https://example.com' })
    expect(result.success).toBe(true)
  })

  // Valid: with both url and sessionId
  it('accepts url and sessionId', () => {
    const result = tabsCreateSchema.safeParse({ url: 'https://example.com', sessionId: 'abc' })
    expect(result.success).toBe(true)
  })

  // Invalid: invalid URL
  it('rejects invalid URL', () => {
    const result = tabsCreateSchema.safeParse({ url: 'not-a-url' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// tabs_context_mcp schema tests
// ---------------------------------------------------------------------------

describe('tabsContextMcpSchema', () => {
  // Valid: no args
  it('accepts empty object', () => {
    const result = tabsContextMcpSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  // Valid: with optional sessionId
  it('accepts optional sessionId', () => {
    const result = tabsContextMcpSchema.safeParse({ sessionId: 'mcp-session' })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// tabs_create_mcp schema tests
// ---------------------------------------------------------------------------

describe('tabsCreateMcpSchema', () => {
  // Valid: required sessionId only
  it('accepts required sessionId only', () => {
    const result = tabsCreateMcpSchema.safeParse({ sessionId: 'my-session' })
    expect(result.success).toBe(true)
  })

  // Valid: with url and sessionId
  it('accepts url and sessionId', () => {
    const result = tabsCreateMcpSchema.safeParse({ url: 'https://example.com', sessionId: 'my-session' })
    expect(result.success).toBe(true)
  })

  // Invalid: missing sessionId (required)
  it('rejects missing sessionId', () => {
    const result = tabsCreateMcpSchema.safeParse({ url: 'https://example.com' })
    expect(result.success).toBe(false)
  })

  // Invalid: invalid URL
  it('rejects invalid URL', () => {
    const result = tabsCreateMcpSchema.safeParse({ url: 'not-a-url', sessionId: 'abc' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// file_upload schema tests
// ---------------------------------------------------------------------------

describe('fileUploadSchema', () => {
  it('accepts all required fields', () => {
    const result = fileUploadSchema.safeParse({
      refId: 'file-input-1',
      fileName: 'test.png',
      mimeType: 'image/png',
      data: 'base64encodeddata',
      tabId: 1,
    })
    expect(result.success).toBe(true)
  })

  // Invalid: missing data
  it('rejects missing data', () => {
    const result = fileUploadSchema.safeParse({
      refId: 'file-input-1',
      fileName: 'test.png',
      mimeType: 'image/png',
    })
    expect(result.success).toBe(false)
  })

  // Invalid: empty refId
  it('rejects empty refId', () => {
    const result = fileUploadSchema.safeParse({
      refId: '',
      fileName: 'test.png',
      mimeType: 'image/png',
      data: 'somedata',
    })
    expect(result.success).toBe(false)
  })

  // Invalid: empty fileName
  it('rejects empty fileName', () => {
    const result = fileUploadSchema.safeParse({
      refId: 'file-input-1',
      fileName: '',
      mimeType: 'image/png',
      data: 'somedata',
    })
    expect(result.success).toBe(false)
  })

  // Invalid: empty mimeType
  it('rejects empty mimeType', () => {
    const result = fileUploadSchema.safeParse({
      refId: 'file-input-1',
      fileName: 'test.png',
      mimeType: '',
      data: 'somedata',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// upload_image schema tests
// ---------------------------------------------------------------------------

describe('uploadImageSchema', () => {
  it('accepts refId only', () => {
    const result = uploadImageSchema.safeParse({ refId: 'image-input-1', tabId: 1 })
    expect(result.success).toBe(true)
  })

  it('accepts refId with screenshotData', () => {
    const result = uploadImageSchema.safeParse({
      refId: 'image-input-1',
      screenshotData: 'base64imagedata',
      tabId: 1,
    })
    expect(result.success).toBe(true)
  })

  // Invalid: missing refId
  it('rejects missing refId', () => {
    const result = uploadImageSchema.safeParse({ screenshotData: 'base64imagedata' })
    expect(result.success).toBe(false)
  })

  // Invalid: empty refId
  it('rejects empty refId', () => {
    const result = uploadImageSchema.safeParse({ refId: '' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// gif_creator schema tests
// ---------------------------------------------------------------------------

describe('gifCreatorSchema', () => {
  it('accepts action=start', () => {
    const result = gifCreatorSchema.safeParse({ action: 'start', tabId: 1 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fps).toBe(2)
    }
  })

  it('accepts action=stop', () => {
    const result = gifCreatorSchema.safeParse({ action: 'stop', tabId: 1 })
    expect(result.success).toBe(true)
  })

  it('accepts action=export', () => {
    const result = gifCreatorSchema.safeParse({ action: 'export', tabId: 1 })
    expect(result.success).toBe(true)
  })

  // Valid: with tabId and fps
  it('accepts action=start with tabId and fps=10', () => {
    const result = gifCreatorSchema.safeParse({ action: 'start', tabId: 5, fps: 10 })
    expect(result.success).toBe(true)
  })

  // Invalid: unknown action
  it('rejects unknown action', () => {
    const result = gifCreatorSchema.safeParse({ action: 'pause' })
    expect(result.success).toBe(false)
  })

  // Invalid: fps out of range (>30)
  it('rejects fps > 30', () => {
    const result = gifCreatorSchema.safeParse({ action: 'start', fps: 31 })
    expect(result.success).toBe(false)
  })

  // Invalid: fps < 1
  it('rejects fps < 1', () => {
    const result = gifCreatorSchema.safeParse({ action: 'start', fps: 0 })
    expect(result.success).toBe(false)
  })

  // Invalid: non-integer fps
  it('rejects non-integer fps', () => {
    const result = gifCreatorSchema.safeParse({ action: 'start', fps: 2.5 })
    expect(result.success).toBe(false)
  })

  // Invalid: missing action
  it('rejects missing action', () => {
    const result = gifCreatorSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// shortcuts_list schema tests
// ---------------------------------------------------------------------------

describe('shortcutsListSchema', () => {
  // tabId is now required
  it('accepts tabId', () => {
    const result = shortcutsListSchema.safeParse({ tabId: 7 })
    expect(result.success).toBe(true)
  })

  it('rejects empty object (tabId required)', () => {
    const result = shortcutsListSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  // Invalid: non-integer tabId
  it('rejects non-integer tabId', () => {
    const result = shortcutsListSchema.safeParse({ tabId: 1.1 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// shortcuts_execute schema tests
// ---------------------------------------------------------------------------

describe('shortcutsExecuteSchema', () => {
  // tabId is now required
  it('accepts shortcut with tabId', () => {
    const result = shortcutsExecuteSchema.safeParse({ shortcut: 'Ctrl+V', tabId: 3 })
    expect(result.success).toBe(true)
  })

  it('rejects shortcut without tabId', () => {
    const result = shortcutsExecuteSchema.safeParse({ shortcut: 'Ctrl+C' })
    expect(result.success).toBe(false)
  })

  // Invalid: missing shortcut
  it('rejects missing shortcut', () => {
    const result = shortcutsExecuteSchema.safeParse({ tabId: 3 })
    expect(result.success).toBe(false)
  })

  // Invalid: empty shortcut
  it('rejects empty shortcut (min(1))', () => {
    const result = shortcutsExecuteSchema.safeParse({ shortcut: '' })
    expect(result.success).toBe(false)
  })

  // Invalid: non-integer tabId
  it('rejects non-integer tabId', () => {
    const result = shortcutsExecuteSchema.safeParse({ shortcut: 'Ctrl+Z', tabId: 1.5 })
    expect(result.success).toBe(false)
  })
})
