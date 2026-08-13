export interface ScrollResetTarget {
  scrollTo(options: { top: number; left: number; behavior: 'auto' }): void
  document: {
    documentElement: { scrollTop: number }
    body: { scrollTop: number }
  }
}

/** Reset every page scroll surface used by browsers and WebKit. */
export function resetPageScroll(target: ScrollResetTarget) {
  target.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  target.document.documentElement.scrollTop = 0
  target.document.body.scrollTop = 0
}
