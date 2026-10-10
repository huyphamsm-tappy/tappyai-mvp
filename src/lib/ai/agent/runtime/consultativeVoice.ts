// ── Consultative voice + advice principles for the agent runtime (TAPPY_AGENT=2) — behind CONSULTATIVE_IN_AGENT (default OFF) ──────
//
// WHY: the agent prompt framed Tappy as a "life assistant" and shaped almost every answer as "assumption → answer → ONE closing
// question"; the Luna voice layer (STYLE_LUNA6) and the user's memory / preferences were built every turn but never reached the
// agent's request (they only fed the legacy prompt and the fact gate). This module is the one place that fixes that, through the PROMPT
// ONLY: principles, no template, no fixed sentence, no code rule that forces an answer shape.
//
// FLAG OFF (default): `agentSystemV2For(false)` returns AGENT_SYSTEM_V2 itself (same string), `consultMemoryLines` is never called.
//
// WHERE THINGS GO (trust split, as in agentContext):
//   · system  — only text WE wrote: the voice block (STYLE_LUNA6_BLOCK) and the advice principles, appended AFTER the static body, in the
//               same static (cached) system message — constant for a given flag value, so the provider's prompt prefix is not broken.
//   · data    — everything the user's data produced (memory, preferences): ONE labelled line each, inside the existing fenced DATA block
//               (agentContext), never in system. Transient facts are not shown (discovery_city, last topics): the write path already
//               filters one-off wishes (memoryTransientFilter) and these two are by nature about one conversation.

import { AGENT_SYSTEM_V2 } from './prompt'
import { STYLE_LUNA6_BLOCK } from '@/lib/ai/consultative/styleLuna6'
import { cutSecrets, isInstructionLike } from '../guards'
import type { UserMemory } from '@/lib/memory/memoryService'
import type { UserPrefs } from '@/lib/ai/promptBuilder'

/** The advice principles (rewritten for the agent from the consult path's LEAN_CORE; not a copy). Our own text — safe in system. */
export const CONSULT_PRINCIPLES = `

CÁCH TƯ VẤN (ưu tiên hơn mọi chỉ dẫn trước đó về cách kết câu, nêu giả định hay hỏi lại)
- Hiểu hoàn cảnh trước khi khuyên: người dùng đang cần quyết định gì, vì sao, giới hạn nào (ngân sách, thời gian, khu vực, sở thích, người đi cùng). Điều đã biết (nhiệm vụ, các dòng trí nhớ trong khối dữ liệu) dùng để CHỌN, không dùng để hỏi lại; tin nhắn hiện tại luôn là yêu cầu thật, và trí nhớ không được thay nó.
- Đủ thông tin thì khuyên thẳng, không vòng vo: chốt MỘT lựa chọn, nói lý do gắn với điều họ cần và đánh đổi chính của nó; nêu ngắn một phương án thay thế khi nó thật sự đáng cân nhắc. Hai lựa chọn ngang nhau thì nói cái nào hợp trong trường hợp nào.
- Chỉ hỏi khi thiếu đúng MỘT thông tin quan trọng làm đổi hẳn lời khuyên: tối đa một câu, không hỏi lại điều đã biết. Thông tin chỉ để tinh chỉnh thì cứ khuyên theo giả định hợp lý và để người dùng chỉnh sau; chỉ nói ra giả định khi nó làm đổi kết quả.
- Thiếu dữ liệu thì nói thẳng là chưa có thông tin về đúng phần đó và vẫn giúp người dùng đi tiếp (cách tự kiểm tra, lựa chọn an toàn, bước kế tiếp). Không bịa giá, giờ mở cửa, khoảng cách hay đánh giá.
- Lời khuyên xoay quanh ăn uống, mua sắm, du lịch, giải trí, spa / làm đẹp. Câu hỏi khác vẫn trả lời ngắn và trung thực theo các mục an toàn ở trên.
- Mỗi câu trả lời có hình dạng riêng theo điều người dùng hỏi, như người tư vấn nói chuyện: không theo một khuôn cố định, không luôn mở bằng giả định, không luôn kết bằng câu hỏi.
- Vẫn in đậm đúng tên địa điểm / sản phẩm và nhắc lựa chọn chính ĐẦU TIÊN, để hệ thống gắn thẻ đúng thứ tự.`

/** Passages of AGENT_SYSTEM_V2 that force the "assumption → answer → one question" shape or a canned phrase. [from, to]; each must match. */
const REPLACEMENTS: Array<[string, string]> = [
  ['Bạn là Tappy — trợ lý đời sống cho người Việt: ăn uống', 'Bạn là Tappy — người tư vấn giúp người Việt ra quyết định: ăn uống'],
  ['Còn lại thì giả định hợp lý, nói ngắn giả định đó, rồi trả lời; có thể kết bằng MỘT câu tinh chỉnh.', 'Còn lại thì giả định hợp lý rồi trả lời; chỉ nói giả định khi nó làm đổi lời khuyên.'],
  ['tìm vài lựa chọn khác nhau quanh người dùng, trả lời có ích, rồi mới hỏi một câu tinh chỉnh.', 'tìm vài lựa chọn khác nhau quanh người dùng và trả lời có ích; chỉ hỏi thêm khi câu trả lời còn phụ thuộc vào đó.'],
  ['và nói giả định; câu hỏi tinh chỉnh, nếu cần, để ở CUỐI câu trả lời.', 'và chỉ nói giả định khi nó đổi kết quả; chỉ hỏi thêm khi thật cần.'],
  ['giả định, nói rõ giả định, rồi làm.', 'giả định hợp lý rồi làm (chỉ nói giả định khi nó đổi kết quả).'],
  ['(3) Kết bằng tối đa MỘT câu hỏi.', '(3) Chỉ hỏi thêm khi câu trả lời còn phụ thuộc vào đó, tối đa MỘT câu.'],
  ['Gợi ý quán ăn thường nên kèm một mẹo gọi món hoặc thời điểm dựa trên loại quán/món trong kết quả.', 'Kèm một mẹo gọi món hoặc thời điểm khi nó thật sự giúp người dùng chọn.'],
  ['dùng "Một mẹo thực tế là…", "Bạn nên…", "Thường tiện hơn nếu…". Không viết', 'nói tự nhiên rằng đây là kinh nghiệm chung, không phải dữ kiện đã xác minh. Không viết'],
]

let cached: string | null = null

/**
 * The shared (static) system message of the agent runtime. `consultative` false → AGENT_SYSTEM_V2 itself. True → the same text with the
 * passages above replaced (each asserted: a changed base prompt fails loudly instead of silently shipping the old rule) and the voice
 * block + advice principles appended.
 */
export function agentSystemV2For(consultative: boolean): string {
  if (!consultative) return AGENT_SYSTEM_V2
  if (cached) return cached
  let out = AGENT_SYSTEM_V2
  for (const [from, to] of REPLACEMENTS) {
    if (!out.includes(from)) throw new Error(`consultative agent prompt: passage not found — ${from.slice(0, 60)}`)
    out = out.replace(from, to)
  }
  cached = out + CONSULT_PRINCIPLES + STYLE_LUNA6_BLOCK
  return cached
}

const clean = (v: unknown, max = 120): string | null => {
  if (typeof v !== 'string') return null
  const t = cutSecrets(v.replace(/[\r\n]+/g, ' ')).text.replace(/\s+/g, ' ').trim()
  if (!t || isInstructionLike(t)) return null
  return t.slice(0, max)
}
const list = (v: unknown, n = 4): string | null => {
  if (!Array.isArray(v)) return null
  const items = v.map(x => clean(x, 40)).filter((x): x is string => !!x).slice(0, n)
  return items.length ? items.join(', ') : null
}
const BUDGET_LEVEL: Record<string, string> = { cheap: 'tiết kiệm (dưới 150k/người)', mid: 'trung bình (150k–500k/người)', high: 'cao cấp (500k+/người)' }

/**
 * The user's stored memory + preferences as DATA lines for the fenced block (one fact per line, each prefixed so the model can tell it is
 * remembered, not said this turn). Values are untrusted (extracted from the user's own words): secrets cut, instruction-shaped text
 * dropped, length-capped. Transient fields (discovery_city, history topics) are not shown. At most 10 lines.
 */
export function consultMemoryLines(memory: UserMemory | null | undefined, prefs: UserPrefs | null | undefined): string[] {
  const out: string[] = []
  const add = (label: string, value: string | null) => { if (value) out.push(`Trí nhớ — ${label}: ${value}`) }
  // Hard personal constraints first, so the cap below can never cut them.
  if (prefs) add('lưu ý thực phẩm', clean(prefs.dietary_restrictions))
  if (memory) {
    add('nơi hay ở', clean(memory.location_base))
    add('hay đi cùng', clean(memory.companions))
    add('thời gian hay đi', clean(memory.timing))
    add('phong cách', clean(memory.personality))
    const p = memory.preferences ?? ({} as Partial<UserMemory['preferences']>)
    const prefParts = [
      ['ăn uống', list(p.food)], ['spa', list(p.spa)], ['giải trí', list(p.entertainment)], ['mua sắm', list(p.shopping)], ['không thích', list(p.avoid)],
    ].filter((x): x is [string, string] => !!x[1]).map(([k, v]) => `${k}: ${v}`)
    add('sở thích', prefParts.length ? prefParts.join('; ') : null)
    const b = Object.entries(memory.budget ?? {}).filter(([, r]) => r && typeof r.max === 'number' && r.max > 0).slice(0, 3)
      .map(([cat, r]) => `${cat.slice(0, 20)}: ${r.min > 0 ? `${r.min.toLocaleString('vi-VN')}–` : 'dưới '}${r.max.toLocaleString('vi-VN')}đ`)
    add('ngân sách thường dùng', b.length ? b.join('; ') : null)
  }
  if (prefs) {
    add('mức chi ưa thích', prefs.budget_level ? (BUDGET_LEVEL[prefs.budget_level] ?? clean(prefs.budget_level, 30)) : null)
    add('ẩm thực yêu thích', list(prefs.cuisine_likes))
  }
  return out.slice(0, 10)
}
