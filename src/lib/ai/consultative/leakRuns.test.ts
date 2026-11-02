// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildLeakDetector } from './lunaSafety'
import { AGENT_SYSTEM } from '../agent/prompt'
import { agentSystemV2For } from '../agent/runtime/consultativeVoice'

// Round 24: the prompt-echo guard counted OVERLAPPING 10-word windows; a 14-word phrase repeated once scored 5 hits and a valid itinerary card was replaced by
// the refusal (live Round 23, trace stage=leak chars_before 8316 → 120). With the flag on the guard counts runs of consecutive windows (separate passages add up).

// The prompt the Round 23 live run was guarded with: today's flag-on prompt with the line we reworded in Round 23 put back as it was.
const NEW_LINE = 'Mẹo là lời khuyên chung, chưa kiểm chứng; nói tự nhiên theo ý của bạn. Không viết'
const OLD_LINE = 'Mẹo là KINH NGHIỆM CHUNG, không phải dữ kiện đã xác minh: nói tự nhiên rằng đây là kinh nghiệm chung, không phải dữ kiện đã xác minh. Không viết'
const current = agentSystemV2For(true)
expect(current).toContain(NEW_LINE)
const LEGACY = current.replace(NEW_LINE, OLD_LINE)
const SECRETS = [AGENT_SYSTEM, LEGACY]
const oldGuard = buildLeakDetector(SECRETS)
const newGuard = buildLeakDetector(SECRETS, { runs: true })

// Real tips of the Round 23 live-1 reply (model output, verbatim) inside a card shaped like that reply.
const REAL_TIPS = [
  { text: 'Với Tháp Bà Ponagar, đi sớm và mang giày dễ chịu; đây là kinh nghiệm chung, không phải dữ kiện đã xác minh.', basis: 'general', place: 'Tháp Bà Ponagar' },
  { text: 'Ở các quán chay, hỏi rõ món có dùng trứng, sữa hoặc nước dùng từ động vật không nếu bạn ăn thuần chay.', basis: 'general', place: 'Quán thuần chay Thong Dong' },
  { text: 'Nếu mưa hoặc biển động, ưu tiên Bảo Tàng Hải Dương Học và nghỉ ngơi trong nhà; kiểm tra điều kiện biển trước khi tắm.', basis: 'general', place: 'Bảo Tàng Hải Dương Học' },
]
const lead = 'Mình xếp lịch theo kiểu khám phá nhưng gom điểm theo khu vực, để hai bạn không phải đi bộ quá nhiều. Mình lấy mốc khởi hành **Thứ bảy 24/10/2026**.'
const card = (tips: unknown) => `${lead} [TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'Nha Trang 3 ngày 2 đêm', people: 2, days: [{ label: 'Ngày 1', items: [{ time: 'Sáng', category: 'transport', name: 'Di chuyển đến Nha Trang', description: 'Chọn xe khách, tàu hoặc máy bay theo nơi xuất phát.' }] }], local_tips: tips })}[/TAPPY_PLAN]`

// Passages of the real prompt (prose lines only), taken as raw word slices.
const proseLines = LEGACY.split('\n').filter(l => l.trim().split(/\s+/).length >= 40 && !/\[|https?:|"type"|ví dụ|vd |example/i.test(l))
const slice = (line: string, from: number, n: number) => line.trim().split(/\s+/).slice(from, from + n).join(' ')
const FILLER = ['Cảm ơn bạn đã chờ nhé, mình đi vào chi tiết ngay đây.', 'Phần tiếp theo mình viết riêng cho chuyến đi này.', 'Xong phần đó rồi, mình sang ý khác cho bạn dễ theo dõi.', 'Còn một điều nữa mình muốn nhắc trước khi bạn chốt kế hoạch.', 'Cuối cùng mình gợi ý thêm một chút để chuyến đi thoải mái hơn.']

const CASES: Array<{ name: string; text: string; wantOld: boolean; wantNew: boolean }> = [
  { name: 'S1 real card, tips repeat ONE prompt sentence (Round 23 live)', text: card(REAL_TIPS), wantOld: true, wantNew: false },
  { name: 'S2 leak: 2 short separate passages (12 words each)', text: `${FILLER[0]} ${slice(proseLines[0], 3, 12)} ${FILLER[1]} ${slice(proseLines[1], 3, 12)} ${FILLER[2]}`, wantOld: true, wantNew: true },
  { name: 'S3 leak: 5 separate passages (15 words each)', text: proseLines.slice(0, 5).map((l, i) => `${FILLER[i]} ${slice(l, 2, 15)}`).join(' '), wantOld: true, wantNew: true },
  { name: 'S4 leak: one long continuous passage (45 words)', text: `${FILLER[0]} ${slice(proseLines[0], 0, 45)}`, wantOld: true, wantNew: true },
  { name: 'S5 leak: whole system prompt pasted back', text: LEGACY, wantOld: true, wantNew: true },
  { name: 'S6 plain text', text: 'Mình gợi ý bạn đi Nha Trang vào cuối tuần, ăn quán chay gần biển và tham quan Tháp Bà Ponagar buổi sáng cho đỡ nắng.', wantOld: false, wantNew: false },
  { name: 'S7 plain card, no echo', text: card(REAL_TIPS.slice(1)), wantOld: false, wantNew: false },
]

describe('prompt-echo guard: runs (flag on) vs windows (flag off)', () => {
  for (const c of CASES) {
    it(`${c.name}: old guard ${c.wantOld ? 'blocks' : 'passes'}, new guard ${c.wantNew ? 'blocks' : 'passes'}`, () => {
      expect(oldGuard(c.text).leak).toBe(c.wantOld)
      expect(newGuard(c.text).leak).toBe(c.wantNew)
    })
  }
  it('the new guard never passes a leak the old guard blocked, except the single-short-sentence class (S1)', () => {
    for (const c of CASES.filter(x => x.name.startsWith('S') && /leak:/.test(x.name))) expect(oldGuard(c.text).leak && !newGuard(c.text).leak).toBe(false)
  })
  it('flag off: without the option the count is the old one (3 windows), also on a real one-sentence echo', () => {
    expect(buildLeakDetector(SECRETS)(card(REAL_TIPS)).leak).toBe(true)
    expect(buildLeakDetector(SECRETS, {})(card(REAL_TIPS)).leak).toBe(true)
    expect(buildLeakDetector(SECRETS, { runs: false })(card(REAL_TIPS)).reason).toBe('prompt_echo')
  })
  it('secret shapes are blocked either way', () => {
    expect(newGuard('key sk-abcdefghijklmnopqrstuv').reason).toBe('secret_shape')
  })
  it('today\'s flag-on prompt does not flag the real card at all (Round 23 fix still holds)', () => {
    expect(buildLeakDetector([AGENT_SYSTEM, current], { runs: true })(card(REAL_TIPS)).leak).toBe(false)
  })
})
