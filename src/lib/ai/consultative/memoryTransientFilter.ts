// ── CONSULTATIVE V1 — durable memory keeps habits, not tonight ──────────────
//
// `extractMemoryFromConversation` (one LLM call, unchanged) summarises what the
// user said into durable traits. Measured on the branch it turns a single turn
// into a trait: "tối nay" became `timing`, "yên tĩnh" a food preference, and
// "500k cho tối nay" the user's budget. This deterministic post-filter drops
// the transient values, and lets a budget or an atmosphere preference through
// only when the USER's own words state it as a habit ("mình thường…", "budget
// của mình là…", "mình thích / hay…"). See consultative-v1-design.md §8.

import { normalizeVN } from '../intent'
import { DESTINATION_SIGNAL } from '../memoryGate'
import type { UserMemory } from '@/lib/memory/memoryService'

const fold = (s: string) => normalizeVN(s.toLowerCase()).replace(/\s+/g, ' ').trim()

/** Words that describe THIS occasion, never a habit. */
const TRANSIENT_RE = /\b(toi nay|trua nay|sang nay|hom nay|dem nay|cuoi tuan nay|tuan nay|thang nay|ngay mai|mai|bay gio|luc nay|lan nay|gan day|o day|cho nay|hien tai|tonight|today|this (?:weekend|week|evening|afternoon|time)|right now|tomorrow|nearby|around here)\b/
/** Atmosphere / mood words that are a wish for this outing unless stated as a habit. */
const ATMOSPHERE_RE = /\b(yen tinh|chill|soi dong|lang man|view|sang trong|binh dan|re|nhe nhang|thu gian|quiet|lively|romantic|fancy|cheap|cozy|am cung)\b/
/** The user says it is a habit. */
const HABITUAL_RE = /\b(minh|toi|tui|em|i)\s+(?:thuong|hay|luon|thich|ua|chuong|khoai|usually|always|often|prefer|like|love)\b|\b(?:thuong|hay|luon)\s+(?:di|an|chon|uong|ghe)\b|\bbudget cua (?:minh|toi|tui|em)\b|\bngan sach cua (?:minh|toi)\b|\bthuong (?:chi|xai|tieu)\b|\bmy (?:usual|normal|typical) budget\b|\bi usually spend\b/

export interface TransientFilterStats {
  timing_dropped: boolean
  budget_dropped: number
  preferences_dropped: number
  personality_dropped?: boolean
  companions_dropped?: boolean
  discovery_city_dropped?: boolean
}

/**
 * @param extracted  what the LLM extracted this turn
 * @param userTexts  the user's own turns (raw), so habit markers are read from the source
 */
export function filterTransientMemory(
  extracted: Partial<UserMemory>,
  userTexts: readonly string[],
): { memory: Partial<UserMemory>; stats: TransientFilterStats } {
  const stats: TransientFilterStats = { timing_dropped: false, budget_dropped: 0, preferences_dropped: 0 }
  const out: Partial<UserMemory> = { ...extracted }
  const said = fold(userTexts.join('\n'))
  const habitual = HABITUAL_RE.test(said)

  // timing: "hay đi cuối tuần" is a habit; "tối nay" is a plan. Measured 2026-09-18 (replay of the
  // first 20 eval turns): the transient-word test alone let "tối" (from "quán ăn tối"), "cuối tuần"
  // and "3 ngày 2 đêm" through as "Thoi gian hay di" — so, like companions and personality, timing
  // is durable only when the user's own words state a habit.
  if (typeof out.timing === 'string' && out.timing && (!habitual || TRANSIENT_RE.test(fold(out.timing)))) {
    delete out.timing
    stats.timing_dropped = true
  }
  // discovery_city: a district in a food query ("gần Quận 1" → "Diem den dang quan tam: Quận 1")
  // is not a destination. Kept only when the user is planning a trip or a stay — the same
  // evidence that earns the extraction call in the first place (memoryGate.DESTINATION_SIGNAL).
  if (typeof out.discovery_city === 'string' && out.discovery_city && !DESTINATION_SIGNAL.test(said)) {
    delete out.discovery_city
    stats.discovery_city_dropped = true
  }
  // personality: "thích lãng mạn, yên tĩnh" from ONE date question is not a trait (measured T1:
  // the next trip plan opened with "như sở thích trước đây"). Kept only when stated as a habit.
  // Measured E5: "hội bạn 5 người" from ONE outing came back as "đi cùng 5 người như thường lệ".
  // A trait about company or taste is durable only when the user's own words say it is a habit.
  if (typeof out.personality === 'string' && out.personality && !habitual) {
    delete out.personality
    stats.personality_dropped = true
  }
  // companions: "hay đi 2 người" is a habit; "2 người tối nay" is one outing.
  if (typeof out.companions === 'string' && out.companions && !habitual) {
    delete out.companions
    stats.companions_dropped = true
  }
  // budget: only when the user stated it as a habit — a per-turn amount is not the durable budget.
  if (out.budget && typeof out.budget === 'object') {
    const keys = Object.keys(out.budget)
    if (keys.length > 0 && !habitual) {
      stats.budget_dropped = keys.length
      delete out.budget
    }
  }
  // preferences: a search subject is not a taste. Measured 2026-09-18: one "tim quan bun bo" became
  // `food: bún bò` and was echoed back on every later extraction; "nồi chiên không dầu 5L loại nào
  // tốt" became `shopping: nồi chiên không dầu`; "cần chỗ đậu xe" became `entertainment: chỗ đậu xe
  // ô tô`. Those lists are what the model later read as "sở thích" and asked about. A preference
  // is kept only when the user's own words state it as a habit or a liking — except `avoid`
  // (dietary constraints, dislikes), which the extractor only fills from an explicit statement.
  if (out.preferences && typeof out.preferences === 'object') {
    const prefs: UserMemory['preferences'] = {}
    for (const [k, list] of Object.entries(out.preferences)) {
      if (!Array.isArray(list)) continue
      const kept = list.filter(v => {
        const f = fold(String(v))
        if (TRANSIENT_RE.test(f)) { stats.preferences_dropped++; return false }
        if (k !== 'avoid' && !habitual) { stats.preferences_dropped++; return false }
        if (ATMOSPHERE_RE.test(f) && !habitual) { stats.preferences_dropped++; return false }
        return true
      })
      if (kept.length > 0) prefs[k] = kept
    }
    if (Object.keys(prefs).length > 0) out.preferences = prefs
    else delete out.preferences
  }
  return { memory: out, stats }
}
