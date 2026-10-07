import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { modelPickName, pickStillStated, ALT_SENTENCE } from './modelPick'

const EV = join(process.cwd(), 'docs/uat/evidence')
// c40 F8 rows (526129a run) — the names the reply may name.
const F8 = JSON.parse(readFileSync(join(EV, 'c40-ab-2026-09-27/head-526129a-FTP/F8.json'), 'utf8')) as { prose: string; rows: Array<{ name: string }> }
const rows = F8.rows.map(r => r.name)
// The capture of 28 Sep: model text before any guard, and what the client got.
const cap = JSON.parse(readFileSync(join(EV, 'uat4-p1-2026-09-27/f8-pick-lost-2026-09-28.json'), 'utf8')) as { pre: string; post: string }

describe('the model\'s pick survives the guards (c40 F8)', () => {
  it('the model chose Nhà Hàng Ngon — read from its own text, as the ROW name', () => {
    expect(modelPickName(cap.pre, rows)).toBe('NHÀ HÀNG NGON')
  })
  it('after the guards it was no longer stated — the backstop must put IT back, not the engine pick', () => {
    expect(pickStillStated(cap.post, 'NHÀ HÀNG NGON')).toBe(false)
    expect(cap.post).toContain('Mình chọn **The Lủi') // the defect: another venue presented as the pick
  })
  it('526129a run: the only venue sentence was "Thay thế: **Nhà Hàng Du Ký** …" — an alternative, not a pick', () => {
    expect(ALT_SENTENCE.test('Thay thế: **Nhà Hàng Du Ký** (103A Phạm Ngũ Lão) có **4.7⭐ (1.120 đánh giá)**')).toBe(true)
    expect(pickStillStated(F8.prose, 'Nhà Hàng Du Ký')).toBe(false)
    expect(pickStillStated(F8.prose, 'NHÀ HÀNG NGON')).toBe(false)
  })
  it('a stated pick is recognised; alternatives never count as the pick', () => {
    expect(pickStillStated('Mình chọn **Nhà Hàng Ngon** — 4⭐. Ngoài ra **Du Ký** cũng được.', 'NHÀ HÀNG NGON')).toBe(true)
    expect(modelPickName('Nếu muốn, **Du Ký** cũng được. **Nhà Hàng Ngon** là lựa chọn của mình.', ['Nhà Hàng Du Ký', 'NHÀ HÀNG NGON', 'Du Ký'])).toBe('NHÀ HÀNG NGON')
  })
})
