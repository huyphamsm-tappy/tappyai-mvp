// Security audit 04/11 (W-11): the framework banner header is off.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('next.config.mjs', () => {
  it('turns the X-Powered-By header off', () => {
    const cfg = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8')
    expect(cfg).toMatch(/^\s*poweredByHeader:\s*false,/m)
  })
})
