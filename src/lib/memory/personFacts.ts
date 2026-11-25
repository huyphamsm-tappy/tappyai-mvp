// What the user says about THEMSELVES (14/11/2026, owner: the memory held only taste: food, spa, shopping; nothing about the person's work, what they are building, what they are after).
// Measured as the third root cause of "Tappy does not understand who is asking": a user who said they run a café asked later about a cheap phone and the answer knew nothing of the café.
//
// Three durable facts, stored under the existing `preferences` object (a list per key, already bounded and sanitised by memoryContract), so no schema change and no migration:
//   work     - what they do (a job, a field, a business they run)
//   projects - what they are working on or building now
//   goals    - what they are trying to achieve
// Rules (the same data-not-words discipline as the rest of the memory):
//   - only what the user states about THEMSELVES, in their own words; never inferred, never about another person;
//   - not what describes one outing ("tonight"): memoryTransientFilter drops a value with a transient word, and (unlike a taste) does not need a habit marker;
//   - never a sensitive category (health, religion, politics, sexual orientation, ethnicity, detailed personal finances, a minor's details): the extraction prompt below says so;
//   - the user sees and clears it with the rest of their memory (GET/DELETE /api/memory), and it is covered by the AI-data consent that already names "preferences and memory".
// It is written only when CONSULT_PERSON_MODEL is on (the route passes `person`); with the flag off the extraction prompt is byte-identical to before.

export const PERSON_KEYS = ['work', 'projects', 'goals'] as const
export type PersonKey = (typeof PERSON_KEYS)[number]

export const isPersonKey = (k: string): k is PersonKey => (PERSON_KEYS as readonly string[]).includes(k)

const LABEL: Record<PersonKey, string> = { work: 'cong viec / linh vuc', projects: 'dang lam', goals: 'muc tieu' }

/** The most values per key that reach a prompt, and their length. */
export const PERSON_CAP = 3
const VALUE_CHARS = 60

const clip = (s: string) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > VALUE_CHARS ? t.slice(0, VALUE_CHARS - 1).trimEnd() + '…' : t }

/** The person facts of a memory's `preferences`: newest PERSON_CAP per key, deduplicated, clipped. Junk (non-arrays, non-strings, empties) is ignored. Pure. */
export function personFactsOf(prefs: Record<string, unknown> | null | undefined): Partial<Record<PersonKey, string[]>> {
  const out: Partial<Record<PersonKey, string[]>> = {}
  if (!prefs || typeof prefs !== 'object') return out
  for (const k of PERSON_KEYS) {
    const list = prefs[k]
    if (!Array.isArray(list)) continue
    const seen = new Set<string>()
    const vals: string[] = []
    for (const v of list) {
      if (typeof v !== 'string') continue
      const c = clip(v)
      const key = c.toLowerCase()
      if (!c || seen.has(key)) continue
      seen.add(key)
      vals.push(c)
    }
    if (vals.length > 0) out[k] = vals.slice(-PERSON_CAP)
  }
  return out
}

/** The line a memory block renders for them, or null. The values are fenced by the caller together with the rest of the block. */
export function personLine(prefs: Record<string, unknown> | null | undefined): string | null {
  const facts = personFactsOf(prefs)
  const parts = PERSON_KEYS.filter(k => facts[k]).map(k => `${LABEL[k]}: ${facts[k]!.join(', ')}`)
  return parts.length > 0 ? `- Ve nguoi dung (ho tu noi): ${parts.join('; ')}` : null
}

/** The extractor prompt's addition. Vietnamese without accents like the rest of that prompt. */
export const PERSON_EXTRACTION_SCHEMA = `,
    "work": ["cong viec/linh vuc/doanh nghiep user TU NOI minh lam (vd: ke toan, mo quan cafe, sinh vien y)"],
    "projects": ["du an/viec user TU NOI dang lam hoac xay dung (vd: dang lam app giao hang, dang dat phong cho cong ty)"],
    "goals": ["muc tieu user TU NOI muon dat duoc (vd: mo them chi nhanh, tiet kiem mua nha)"]`

export const PERSON_EXTRACTION_RULES = `
- work / projects / goals: CHI khi user TU NOI ve CHINH HO bang loi cua ho ('toi la ...', 'minh dang lam ...', 'muc tieu cua minh la ...'). KHONG suy doan, KHONG ghi chuyen cua nguoi khac, KHONG ghi viec chi dien ra o cuoc di choi nay (vd 'toi nay').
- TUYET DOI khong ghi: suc khoe/benh, ton giao, chinh tri, xu huong tinh duc, dan toc, tai chinh ca nhan chi tiet (luong, no, so du), thong tin tre em. Co thi bo qua, khong ghi.`
