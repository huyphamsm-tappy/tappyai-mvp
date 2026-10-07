// @vitest-environment node
// Phase 7 closeout 8J — "Cảnh báo lừa đảo" comes before "Quét" wherever the curated tool list is shown.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
describe('tool order', () => {
  it('safety (Cảnh báo lừa đảo) is listed before scan (Quét)', () => {
    const src = readFileSync('src/lib/tools/registry.ts', 'utf8')
    expect(src.indexOf("id: 'safety'")).toBeGreaterThan(0)
    expect(src.indexOf("id: 'safety'")).toBeLessThan(src.indexOf("id: 'scan'"))
  })
})
