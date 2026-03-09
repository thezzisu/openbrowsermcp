import { describe, it, expect } from 'vitest'
import {
  computerSchema,
  navigateSchema,
  resizeWindowSchema,
  readPageSchema,
  findSchema,
  javascriptToolSchema,
  formInputSchema,
  getPageTextSchema,
} from '../tools/index.js'

// ---------------------------------------------------------------------------
// computer schema tests
// ---------------------------------------------------------------------------

describe('computerSchema', () => {
  const TAB = { tabId: 1 }

  it('accepts screenshot action', () => {
    const result = computerSchema.safeParse({ action: 'screenshot', ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts left_click with coordinate', () => {
    const result = computerSchema.safeParse({ action: 'left_click', coordinate: [100, 200], ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts type action with text', () => {
    const result = computerSchema.safeParse({ action: 'type', text: 'Hello World', ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts scroll action with all optional fields', () => {
    const result = computerSchema.safeParse({ action: 'scroll', coordinate: [400, 300], direction: 'down', amount: 3, ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts zoom action with region', () => {
    const result = computerSchema.safeParse({ action: 'zoom', region: [0, 0, 400, 300], ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts left_click_drag with start_coordinate and coordinate', () => {
    const result = computerSchema.safeParse({ action: 'left_click_drag', start_coordinate: [100, 100], coordinate: [200, 200], ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts key action with text', () => {
    const result = computerSchema.safeParse({ action: 'key', text: 'Enter', ...TAB })
    expect(result.success).toBe(true)
  })

  // Invalid: unknown action
  it('rejects unknown action', () => {
    const result = computerSchema.safeParse({ action: 'fly_to_moon', ...TAB })
    expect(result.success).toBe(false)
  })

  // Invalid: missing action field
  it('rejects missing action field', () => {
    const result = computerSchema.safeParse({ coordinate: [100, 200], ...TAB })
    expect(result.success).toBe(false)
  })

  // Invalid: coordinate with wrong type (string instead of numbers)
  it('rejects coordinate with non-number values', () => {
    const result = computerSchema.safeParse({
      action: 'left_click',
      coordinate: ['a', 'b'],
    })
    expect(result.success).toBe(false)
  })

  // Invalid: direction with unknown value
  it('rejects unknown scroll direction', () => {
    const result = computerSchema.safeParse({
      action: 'scroll',
      direction: 'diagonal',
    })
    expect(result.success).toBe(false)
  })

  // Invalid: region with wrong number of elements
  it('rejects region with wrong tuple length', () => {
    const result = computerSchema.safeParse({
      action: 'zoom',
      region: [0, 0, 400],
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// navigate schema tests
// ---------------------------------------------------------------------------

describe('navigateSchema', () => {
  const TAB = { tabId: 1 }

  it('accepts valid url', () => {
    const result = navigateSchema.safeParse({ url: 'https://example.com', ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts direction back', () => {
    const result = navigateSchema.safeParse({ direction: 'back', ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts direction forward', () => {
    const result = navigateSchema.safeParse({ direction: 'forward', ...TAB })
    expect(result.success).toBe(true)
  })

  // Invalid: neither url nor direction provided
  it('rejects when neither url nor direction provided', () => {
    const result = navigateSchema.safeParse({ ...TAB })
    expect(result.success).toBe(false)
  })

  // Invalid: unknown direction value
  it('rejects unknown direction value', () => {
    const result = navigateSchema.safeParse({ direction: 'sideways' })
    expect(result.success).toBe(false)
  })

  // Invalid: invalid URL string
  it('rejects invalid URL string', () => {
    const result = navigateSchema.safeParse({ url: 'not-a-valid-url' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resizeWindow schema tests
// ---------------------------------------------------------------------------

describe('resizeWindowSchema', () => {
  const TAB = { tabId: 1 }

  it('accepts valid width and height', () => {
    const result = resizeWindowSchema.safeParse({ width: 1280, height: 720, ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts minimum positive values (1x1)', () => {
    const result = resizeWindowSchema.safeParse({ width: 1, height: 1, ...TAB })
    expect(result.success).toBe(true)
  })

  // Invalid: zero width
  it('rejects zero width', () => {
    const result = resizeWindowSchema.safeParse({ width: 0, height: 720 })
    expect(result.success).toBe(false)
  })

  // Invalid: negative height
  it('rejects negative height', () => {
    const result = resizeWindowSchema.safeParse({ width: 1280, height: -1 })
    expect(result.success).toBe(false)
  })

  // Invalid: missing width
  it('rejects missing width', () => {
    const result = resizeWindowSchema.safeParse({ height: 720 })
    expect(result.success).toBe(false)
  })

  // Invalid: non-integer width
  it('rejects non-integer width', () => {
    const result = resizeWindowSchema.safeParse({ width: 1280.5, height: 720 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// readPage schema tests
// ---------------------------------------------------------------------------

describe('readPageSchema', () => {
  const TAB = { tabId: 1 }

  it('accepts empty object (all defaults)', () => {
    const result = readPageSchema.safeParse({ ...TAB })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.filter).toBe('all')
    }
  })

  it('accepts filter=interactive', () => {
    const result = readPageSchema.safeParse({ filter: 'interactive', ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts filter=all with depth and maxChars', () => {
    const result = readPageSchema.safeParse({ filter: 'all', depth: 5, maxChars: 1000, ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts refId string', () => {
    const result = readPageSchema.safeParse({ refId: 'elem-123', ...TAB })
    expect(result.success).toBe(true)
  })

  // Invalid: unknown filter value
  it('rejects unknown filter value', () => {
    const result = readPageSchema.safeParse({ filter: 'partial' })
    expect(result.success).toBe(false)
  })

  // Invalid: non-integer depth
  it('rejects non-integer depth', () => {
    const result = readPageSchema.safeParse({ depth: 1.5 })
    expect(result.success).toBe(false)
  })

  // Invalid: zero depth (must be positive)
  it('rejects zero depth', () => {
    const result = readPageSchema.safeParse({ depth: 0 })
    expect(result.success).toBe(false)
  })

  // Invalid: negative maxChars
  it('rejects negative maxChars', () => {
    const result = readPageSchema.safeParse({ maxChars: -100 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// find schema tests
// ---------------------------------------------------------------------------

describe('findSchema', () => {
  const TAB = { tabId: 1 }

  it('accepts description only', () => {
    const result = findSchema.safeParse({ description: 'Submit button', ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts description with refId', () => {
    const result = findSchema.safeParse({ description: 'Submit button', refId: 'btn-1', ...TAB })
    expect(result.success).toBe(true)
  })

  // Invalid: missing description
  it('rejects missing description', () => {
    const result = findSchema.safeParse({ refId: 'btn-1' })
    expect(result.success).toBe(false)
  })

  // Invalid: empty description
  it('rejects empty description (min(1))', () => {
    const result = findSchema.safeParse({ description: '' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// javascriptTool schema tests
// ---------------------------------------------------------------------------

describe('javascriptToolSchema', () => {
  it('accepts code with tabId', () => {
    const result = javascriptToolSchema.safeParse({ code: 'document.title', tabId: 1 })
    expect(result.success).toBe(true)
  })

  it('accepts code only — rejects (tabId required)', () => {
    const result = javascriptToolSchema.safeParse({ code: 'document.title' })
    expect(result.success).toBe(false)
  })

  // Invalid: missing code
  it('rejects missing code', () => {
    const result = javascriptToolSchema.safeParse({ tabId: 1 })
    expect(result.success).toBe(false)
  })

  // Invalid: empty code
  it('rejects empty code (min(1))', () => {
    const result = javascriptToolSchema.safeParse({ code: '' })
    expect(result.success).toBe(false)
  })

  // Invalid: non-integer tabId
  it('rejects non-integer tabId', () => {
    const result = javascriptToolSchema.safeParse({ code: '1+1', tabId: 1.5 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// formInput schema tests
// ---------------------------------------------------------------------------

describe('formInputSchema', () => {
  const TAB = { tabId: 1 }

  it('accepts refId and value', () => {
    const result = formInputSchema.safeParse({ refId: 'input-1', value: 'hello', ...TAB })
    expect(result.success).toBe(true)
  })

  it('accepts empty string value', () => {
    const result = formInputSchema.safeParse({ refId: 'input-1', value: '', ...TAB })
    expect(result.success).toBe(true)
  })

  // Invalid: missing refId
  it('rejects missing refId', () => {
    const result = formInputSchema.safeParse({ value: 'hello' })
    expect(result.success).toBe(false)
  })

  // Invalid: empty refId (min(1))
  it('rejects empty refId (min(1))', () => {
    const result = formInputSchema.safeParse({ refId: '', value: 'hello' })
    expect(result.success).toBe(false)
  })

  // Invalid: missing value
  it('rejects missing value', () => {
    const result = formInputSchema.safeParse({ refId: 'input-1' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getPageText schema tests
// ---------------------------------------------------------------------------

describe('getPageTextSchema', () => {
  // tabId is now required
  it('accepts tabId', () => {
    const result = getPageTextSchema.safeParse({ tabId: 123 })
    expect(result.success).toBe(true)
  })

  it('rejects empty object (tabId required)', () => {
    const result = getPageTextSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  // Invalid: non-integer tabId
  it('rejects non-integer tabId', () => {
    const result = getPageTextSchema.safeParse({ tabId: 1.7 })
    expect(result.success).toBe(false)
  })

  // Invalid: string tabId
  it('rejects string tabId', () => {
    const result = getPageTextSchema.safeParse({ tabId: 'tab-1' })
    expect(result.success).toBe(false)
  })
})
