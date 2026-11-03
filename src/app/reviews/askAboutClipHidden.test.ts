// @vitest-environment node
// Phase 7 closeout 8A — "Hỏi Tappy về video này" is hidden by default and reversible (capability kept).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SHOW_ASK_ABOUT_CLIP } from '@/lib/config/product'
describe('ask-about-clip', () => {
  it('is off by default and gated at its only render site', () => {
    expect(SHOW_ASK_ABOUT_CLIP).toBe(false)
    expect(readFileSync('src/app/reviews/clipStage.tsx', 'utf8')).toMatch(/\{SHOW_ASK_ABOUT_CLIP && subject && \(/)
  })
})
