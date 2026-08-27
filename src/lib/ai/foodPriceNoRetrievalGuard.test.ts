// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

// ── P0 REGRESSION: the food/spa price boundary skipped no-retrieval turns ────
//
// Reproduced in production on 5708211. Turn 1 ("Tìm quán hủ tiếu Phú Nhuận") searched, stated no
// price, and was clean. Turn 2 ("Giá bao nhiêu?") ran NO tool at all and answered from the model's
// general knowledge:
//
//   "Mình vừa tìm kiếm nhưng chưa có giá cụ thể từ các nền tảng đặt hàng.
//    Thường hủ tiếu Nam Vang ở Phú Nhuận có giá khoảng 30.000 - 50.000đ/tô tùy loại..."
//
// It admits it has no price, then states one anyway. Nothing retrieved it; it was reconstructed.
//
// Cause: the A5 guard was gated on `hadPlaceSearch`, which is per-turn and set only when a
// `search_places` result arrives. A turn that answers from context never sets it, so the guard was
// inert — and because nothing forced buffering either, the bytes had already streamed out.
//
// This is precisely the shape travel already solved: a travel-intent turn ALWAYS buffers so the
// fail-closed guard can inspect the complete prose "even when the model answered from memory with
// no tool call at all" (streamEnrichment ~L690). Food/spa now behaves the same way.

const line0 = (s: string) => '0:' + JSON.stringify(s)

/** Drive the filter over a turn that makes NO tool call, as the production follow-up did. */
async function runNoToolTurn(text: string, opts: { placeIntent: boolean; userText?: string }) {
  const res = applyPlaceEnrichmentStreamFilter(
    new Response(line0(text) + '\n'),
    'vi',
    undefined,
    undefined,
    undefined,
    undefined,
    false,                    // travelIntent — this is a food turn, not travel
    opts.userText ?? '',
    opts.placeIntent,
  )
  return await new Response(res.body).text()
}

const FABRICATED = 'Mình vừa tìm kiếm nhưng chưa có giá cụ thể. Thường hủ tiếu Nam Vang ở Phú Nhuận có giá khoảng 30.000 - 50.000đ/tô tùy loại.'

describe('A5 P0 — a food price invented on a no-retrieval turn', () => {
  it('redacts a price no retrieval supports, on a food turn with no tool call', async () => {
    const out = await runNoToolTurn(FABRICATED, { placeIntent: true })

    expect(out).not.toContain('30.000')
    expect(out).not.toContain('50.000')
    // The honest half of the sentence survives — the guard removes claims, it does not rewrite.
    expect(out).toContain('chưa có giá cụ thể')
  })

  it('leaves the same turn untouched when it states no price at all', async () => {
    const clean = 'Quán mở cửa từ 6h sáng, rất đông khách buổi trưa.'
    const out = await runNoToolTurn(clean, { placeIntent: true })
    expect(out).toContain('rất đông khách buổi trưa')
  })

  it("never redacts the user's own number", async () => {
    const out = await runNoToolTurn(
      'Với ngân sách 50.000đ bạn có nhiều lựa chọn hủ tiếu.',
      { placeIntent: true, userText: 'tìm hủ tiếu dưới 50.000đ' },
    )
    expect(out).toContain('50.000')
  })

  it('a non-place turn with no tool call is NOT guarded — scope is unchanged', async () => {
    // placeIntent false ⇒ the food guard must stay inert, exactly as before this fix.
    const out = await runNoToolTurn('Giá vàng hôm nay khoảng 75.000.000đ một lượng.', { placeIntent: false })
    expect(out).toContain('75.000.000')
  })
})

// ── The route must actually pass the signal ─────────────────────────────────
//
// The guard above is inert unless `placeIntent` is true, so the wiring is as load-bearing as the
// guard. `needProfile.domain` is the signal because it is task-scoped: it is derived from the whole
// message array, so a bare follow-up ("Giá bao nhiêu?") that carries no place word of its own is
// still recognised as a places turn — which is the entire point of the fix.

import { readFileSync } from 'node:fs'
import { deriveNeedProfile } from './consultative/needProfile'

describe('route wiring', () => {
  it('passes a places-domain signal into the stream filter', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ')
    expect(route).toMatch(/travelIntent,\s*lastText,\s*needProfile\.domain === 'places'/)
  })

  it("the production conversation resolves to 'places' on the bare follow-up", () => {
    const profile = deriveNeedProfile([
      { role: 'user', content: 'Tìm quán hủ tiếu Phú Nhuận' },
      { role: 'assistant', content: 'Mình chọn Hủ Tiếu Nam Vang Chị Tư Phú Nhuận.' },
      { role: 'user', content: 'Giá bao nhiêu?' },
    ])
    expect(profile.domain).toBe('places')
  })
})
