// Double-encoded Vietnamese in the chat route.
//
// Twelve lines of src/app/api/chat/route.ts were UTF-8 bytes decoded as Latin-1 and re-encoded as
// UTF-8 — "Lưu" stored as "LÆ°u", "Cần" as "Cáº§n". Mojibake, and not merely cosmetic:
//
//   line 240  the personalization block header injected into the SYSTEM PROMPT. Every request
//             carrying freeform preferences sent the model a corrupted heading.
//   line 398  the save_price_watch tool DESCRIPTION — what the model reads to decide whether the
//             tool applies at all.
//   line 424  the success message shown to the USER after saving a price watch.
//
// The signature is stable and cheap to detect: genuine Vietnamese text never contains "Ã", "Æ°",
// "áº" or "Ä‘", because those sequences only arise from the double encoding. Detecting the
// SEQUENCE rather than the individual characters matters — "Ã" alone is a legitimate letter.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
const route = () => read('src/app/api/chat/route.ts')

/** Sequences that only exist when UTF-8 was decoded as Latin-1 and re-encoded. */
const MOJIBAKE = /Ã[-¿©¡°ª«¬­®¯]|Æ°|áº|Ä‘|á»|â€”/

describe('the mojibake detector itself', () => {
  // Without this, a broken pattern would silently pass every assertion below.
  it('catches the corrupted forms', () => {
    expect('LÆ°u theo dÃµi giÃ¡').toMatch(MOJIBAKE)
    expect('Cáº§n Ä‘Äƒng nháº­p').toMatch(MOJIBAKE)
    expect('Sá»ž THÃCH').toMatch(MOJIBAKE)
  })

  it('does not flag correct Vietnamese', () => {
    expect('Lưu theo dõi giá').not.toMatch(MOJIBAKE)
    expect('Cần đăng nhập để theo dõi giá').not.toMatch(MOJIBAKE)
    expect('SỞ THÍCH & THÔNG TIN CÁ NHÂN CỦA USER').not.toMatch(MOJIBAKE)
    expect('Đã lưu! Tappy sẽ kiểm tra giá mỗi 6 tiếng.').not.toMatch(MOJIBAKE)
  })
})

describe('the chat route carries no double-encoded text', () => {
  it('has no mojibake on any line', () => {
    const offenders = route()
      .split('\n')
      .map((line, i) => ({ line: i + 1, text: line }))
      .filter((l) => MOJIBAKE.test(l.text))
      .map((l) => `${l.line}: ${l.text.trim().slice(0, 60)}`)
    expect(offenders).toEqual([])
  })
})

describe('the strings the model and the user actually read', () => {
  it('the personalization block header is readable Vietnamese', () => {
    expect(route()).toContain('SỞ THÍCH & THÔNG TIN CÁ NHÂN CỦA USER')
  })

  it('the save_price_watch description is readable Vietnamese', () => {
    const src = route()
    expect(src).toContain('Lưu theo dõi giá sản phẩm')
    expect(src).toContain('theo dõi giá')
  })

  it('its parameter descriptions are readable', () => {
    const src = route()
    expect(src).toContain('Tên sản phẩm cần theo dõi')
    expect(src).toContain('Giá mục tiêu bằng VND')
  })

  it('the user-facing outcomes are readable', () => {
    const src = route()
    expect(src).toContain('Cần đăng nhập để theo dõi giá')
    expect(src).toContain('Bạn đã theo dõi tối đa 10 sản phẩm')
    expect(src).toContain('Đã lưu!')
  })
})
