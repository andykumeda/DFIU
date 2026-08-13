import { describe, expect, it } from 'vitest'
import { resetPageScroll } from './training-scroll'

describe('resetPageScroll', () => {
  it('resets the browser, document element, and body scroll positions', () => {
    const scrollCalls: unknown[] = []
    const target = {
      scrollTo: (options: unknown) => scrollCalls.push(options),
      document: {
        documentElement: { scrollTop: 412 },
        body: { scrollTop: 412 },
      },
    }

    resetPageScroll(target)

    expect(scrollCalls).toEqual([{ top: 0, left: 0, behavior: 'auto' }])
    expect(target.document.documentElement.scrollTop).toBe(0)
    expect(target.document.body.scrollTop).toBe(0)
  })
})
