// ── CONSULTATIVE V1 — the memory block that informs the pick, never the question ─
//
// Measured 2026-09-18 (`docs/audit/eval/memory/replay-first20.json`): after ~20–30 ordinary turns
// the legacy block read
//
//   - Diem den dang quan tam: Đà Nẵng            ← a trip asked about 10 turns ago
//   - Thoi gian hay di: 3 ngày 2 đêm             ← the length of that trip
//   - So thich: an uong: bún bò; giai tri: khách sạn gần biển; mua sam: nồi chiên không dầu
//   - Lan truoc da hoi ve: khách sạn Đà Nẵng dưới 1 triệu/đêm, bao gồm ăn sáng, …
//   …
//   - Neu tin nhan hien tai con mo ho va thong tin tren se dan den mot SAN PHAM/DIA DIEM/LOAI
//     khac: hoi lai mot cau ngan de xac nhan TRUOC KHI tim kiem.
//
// and the last line did exactly what it says: "ăn gì ngon giờ" with `bún bò` on file became
// "bạn muốn ăn gì?" (F7, T4 failed until the row was cleared). Two things are wrong with it for a
// consultative product: the VALUES are one-off search subjects rendered as traits (fixed on the
// write side by memoryTransientFilter + memoryGate), and the INSTRUCTION turns memory into a
// reason to ask. Rows written before the fix still carry the residue, so this renderer also
// caps and demotes on the READ side:
//
//   • preferences: at most PREF_CAP newest values per category, at most CAT_CAP categories;
//   • discovery_city and history are one "recently asked about" line — context, not a request;
//   • companions / timing / personality are "defaults if the message says nothing";
//   • the instruction: use it to CHOOSE, never to ask; the message in front of you wins.
//
// With CONSULTATIVE_V1 off the legacy `buildMemoryBlock` renders byte-identically.

import { fenceUntrusted } from '@/lib/ai/security/fence'
import type { UserMemory } from '@/lib/memory/memoryService'

export const PREF_CAP = 4
export const CAT_CAP = 3
const HISTORY_ITEMS = 3
const HISTORY_ITEM_CHARS = 40
const VALUE_CHARS = 40

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t
}

const dedupe = (xs: readonly string[]) => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of xs) {
    const k = x.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(x)
  }
  return out
}

const PREF_LABEL: Record<string, string> = {
  food: 'an uong', spa: 'spa', entertainment: 'giai tri', shopping: 'mua sam', avoid: 'KHONG thich / kieng',
}

/** Which preference / budget keys matter for a decision-frame domain. Unknown domain → all. */
const DOMAIN_KEYS: Record<string, readonly string[]> = {
  food: ['food'], spa: ['spa'], entertainment: ['entertainment'], shopping: ['shopping'], travel: ['trip', 'travel'],
}

export interface ConsultativeMemoryOptions {
  /**
   * The decision frame's domains for THIS turn. Measured 2026-09-18 with a large legacy row
   * (F8, T4): the model read the whole taste list ("sushi, bò né, hải sản, gà nướng…") as a menu
   * and asked "bạn muốn ăn gì?" — on a trip question it listed food/spa/park. Only the categories
   * of the current domains are rendered (+ `avoid`, always); an empty/unknown domain keeps all.
   */
  domains?: readonly string[]
}

export function buildConsultativeMemoryBlock(memory: UserMemory, forcedTool?: string | null, opts: ConsultativeMemoryOptions = {}): string {
  const infoOnly = forcedTool === 'get_weather' || forcedTool === 'get_gold_price'
  const locationAndHistory = forcedTool === 'get_news'
  const parts: string[] = []
  const scoped = (opts.domains ?? []).flatMap(d => DOMAIN_KEYS[d] ?? [])
  const inScope = (key: string) => key === 'avoid' || scoped.length === 0 || scoped.includes(key)

  if (memory.location_base) parts.push(`- Khu vuc thuong o (noi song/hay o): ${clip(memory.location_base, VALUE_CHARS)}`)

  if (!infoOnly && !locationAndHistory) {
    const defaults: string[] = []
    if (memory.companions) defaults.push(`hay di cung: ${clip(memory.companions, VALUE_CHARS)}`)
    if (memory.timing) defaults.push(`thoi gian hay di: ${clip(memory.timing, VALUE_CHARS)}`)
    if (memory.personality) defaults.push(`phong cach: ${clip(memory.personality, VALUE_CHARS)}`)
    if (defaults.length > 0) parts.push(`- Mac dinh neu tin nhan khong noi: ${defaults.join('; ')}`)

    const prefs = memory.preferences || {}
    const prefParts: string[] = []
    // `avoid` first: a constraint outranks a taste, and the cap must never drop it.
    const keys = ['avoid', ...Object.keys(prefs).filter(k => k !== 'avoid')]
    for (const k of keys) {
      const list = prefs[k]
      if (!Array.isArray(list) || list.length === 0 || !inScope(k)) continue
      if (prefParts.length >= CAT_CAP) break
      const vals = dedupe(list.map(v => clip(String(v), VALUE_CHARS))).slice(-PREF_CAP)
      if (vals.length === 0) continue
      prefParts.push(`${PREF_LABEL[k] ?? clip(k, 20)}: ${vals.join(', ')}`)
    }
    if (prefParts.length > 0) parts.push(`- So thich da noi ro: ${prefParts.join('; ')}`)

    const budgets = memory.budget || {}
    const budgetParts: string[] = []
    for (const [cat, range] of Object.entries(budgets)) {
      if (!inScope(cat)) continue
      if (range?.max) {
        const label = range.min > 0
          ? `${range.min.toLocaleString('vi-VN')}-${range.max.toLocaleString('vi-VN')}d`
          : `duoi ${range.max.toLocaleString('vi-VN')}d`
        budgetParts.push(`${cat}: ${label}`)
      }
    }
    if (budgetParts.length > 0) parts.push(`- Budget thuong dung: ${budgetParts.join('; ')}`)
  }

  if (!infoOnly) {
    const recent: string[] = []
    if (memory.discovery_city) recent.push(`diem den tung hoi: ${clip(memory.discovery_city, VALUE_CHARS)}`)
    const history = dedupe(memory.history || []).slice(-HISTORY_ITEMS).map(h => clip(h, HISTORY_ITEM_CHARS))
    if (history.length > 0) recent.push(history.join(', '))
    if (recent.length > 0) parts.push(`- Gan day da hoi ve (lich su, KHONG phai yeu cau hom nay): ${recent.join('; ')}`)
  }

  if (parts.length === 0) return ''

  // P3-S2: the VALUES are fenced, the instruction is not (see memoryService.buildMemoryBlock).
  return `===== THONG TIN VE USER NAY =====
${fenceUntrusted('user_memory', parts.join('\n'))}
Dung thong tin nay de CHON tot hon: uu tien ket qua hop so thich, budget va thoi quen da biet, va noi ro khi ban chon theo do.
QUAN TRONG: day chi la NGU CANH. Tin nhan hien tai cua user moi la yeu cau that.
- Tin nhan hien tai noi khac voi thong tin tren: LAM THEO TIN NHAN HIEN TAI, khong nhac lai thong tin cu.
- KHONG BAO GIO hoi lai vi thong tin tren. Tin nhan mo ho thi cu CHON theo so thich da biet (hoac theo ket qua tot nhat) va noi "minh chon theo ... ban da noi truoc day"; user doi duoc ngay.
- "Gan day da hoi ve" va "diem den tung hoi" la lich su: khong tim theo do, khong coi diem den cu la noi dang o.
- Chi dung thong tin tren de bo sung chi tiet user khong nhac lai (vi tri, ngan sach, so thich).
==================================`
}
