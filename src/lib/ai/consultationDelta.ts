import { extractBudget } from './budget'
import { detectMoreOptions, normalizeVN, type DecisionStage } from './intent'
import { candidateMatchesRef, isPresented, isRejected, type ConversationState, type HardConstraint, type SoftPreference } from './conversationState'

/**
 * What one user message DOES to the consultation (Task 3E).
 *
 * Deterministic — regex and lookup tables, no LLM call. Same reasoning C2 gave
 * for the decision-stage signals: a classification round-trip costs a call and
 * latency on every turn, and a wrong answer is worse than no answer. Precision
 * is favoured over recall throughout: a missed constraint leaves today's
 * behaviour, whereas a FALSE hard constraint silently filters out the very
 * option the user wanted.
 */
export interface ConsultationDelta {
  goal?: string
  hardConstraintAdds: HardConstraint[]
  /** Same `key` as an existing constraint but a different value — replaces it. */
  hardConstraintChanges: HardConstraint[]
  softPreferenceAdds: SoftPreference[]
  useCase?: string
  location?: string
  timeContext?: string
  rejection?: { ref: string; reason?: string }
  decisionIntent: boolean
  /** The user asked for MORE of the same kind, not for different requirements. */
  moreOptions?: boolean
  /** Why the search space did or did not move. Human-readable, for logs/tests. */
  searchImpact: { required: boolean; reason: string }
}

// ── Constraint vocabulary ───────────────────────────────────────────────────
// Only patterns where a miss is safe and a false positive is unlikely.

/** "32gb ram", "dram 32gb", "ram 32 gb" → ram_gb >= 32. */
const RAM_RE = /(?:^|\b)(?:d?ram\s*)?(\d{1,3})\s*gb(?:\s*ram)?\b/i
const RAM_CONTEXT = /\b(d?ram|memory|bo nho ram)\b/i

/**
 * Words that can sit between the storage noun and the figure without changing
 * what is being asked for. Measured live: "ổ cứng TỪ 512GB trở lên" extracted
 * nothing, because the pattern required the number to follow the noun directly
 * — the consultation then had no 512GB requirement to protect.
 */
const SPEC_FILLER = '(?:\\s*(?:tu|toi thieu|it nhat|khoang|tren|from|at least|minimum|min))?'

/** "512gb", "ổ cứng 512gb", "ổ cứng từ 512gb", "1tb" → storage_gb >= N. */
const STORAGE_RE = new RegExp(
  `\\b(?:o cung|ssd|storage|rom)${SPEC_FILLER}\\s*(\\d{3,4})\\s*gb\\b` +
  '|\\b(\\d{3,4})\\s*gb\\s*(?:ssd|o cung|storage)\\b' +
  '|\\b(\\d)\\s*tb\\b',
  'i',
)

/**
 * ">= / trở lên / or more" turns a figure into a floor rather than an exact.
 *
 * Scoped to what FOLLOWS the figure, never the whole message: "dram 32gb, ổ
 * cứng 512gb trở lên" qualifies the storage only, and a message-wide test made
 * the RAM a floor too — which would have accepted a 64GB machine as satisfying
 * a 32GB ask the user may have meant exactly.
 */
const OR_MORE = /^[\s,]*(tro len|tro nen|or more|or above|or higher|\+|it nhat|toi thieu|minimum)/i

/**
 * "at least 512gb storage" puts the qualifier BEFORE the figure, where a
 * trailing-only test cannot see it. Measured live: the EN flow's "at least
 * 512GB storage" became storage_gb = 512 exactly, which silently EXCLUDES the
 * 1TB machine the user explicitly said they would take.
 */
const AT_LEAST_BEFORE = /\b(at least|from|minimum|min|tu|tren|toi thieu|it nhat|hon)\s*$/i

/** The floor words, wherever they appear relative to the figure. */
const FLOOR_WORD = /\b(at least|from|minimum|min|tu|tren|toi thieu|it nhat|hon)\b/i

/**
 * Is the figure spanning [startIdx, endIdx) qualified as a floor?
 *
 * Three positions, all real: after ("512gb trở lên"), before ("at least 512GB
 * storage"), and swallowed by the pattern's own filler ("storage at least
 * 512gb", where SPEC_FILLER matched the qualifier).
 */
function isFloor(t: string, endIdx: number, startIdx = -1): boolean {
  if (OR_MORE.test(t.slice(endIdx, endIdx + 24))) return true
  if (startIdx < 0) return false
  if (FLOOR_WORD.test(t.slice(startIdx, endIdx))) return true
  return AT_LEAST_BEFORE.test(t.slice(Math.max(0, startIdx - 24), startIdx))
}

/**
 * "cũ" alone is not a condition — "bạn cũ", "chỗ cũ", "quán cũ" are ordinary
 * Vietnamese. It only states a requirement when it qualifies the THING being
 * bought, so the noun is part of the pattern. Measured live: "một chiếc Mac cũ"
 * produced no used-condition requirement because only "máy cũ" was listed.
 */
const BUYABLE = 'may|mac|macbook|imac|laptop|pc|may tinh|dien thoai|iphone|ipad|xe|hang|do'
const CONDITION_USED = new RegExp(
  `\\b(?:${BUYABLE}) cu\\b|\\b(second ?hand|used|refurb|like new|qua su dung)\\b`,
  'i',
)
const CONDITION_NEW = /\b(may moi|brand ?new|hang moi|chua qua su dung|full box)\b/i

/** Use case — what the thing is FOR. Drives which trade-offs matter. */
const USE_CASES: Array<[RegExp, string]> = [
  [/\b(code|coding|lap trinh|developer|dev|compile|docker)\b/i, 'coding'],
  [/\b(edit video|dung phim|video editing|render|4k)\b/i, 'video-editing'],
  [/\b(lam viec|work|working|office|hop online)\b/i, 'work'],
  [/\b(hoc|study|studying|sinh vien|student)\b/i, 'study'],
  [/\b(choi game|gaming|game)\b/i, 'gaming'],
  [/\b(gia dinh|family|tre em|con nho|kids?|child)\b/i, 'family'],
]

/**
 * Soft preferences. Comparatives are inherently relative ("cheaper" than WHAT?)
 * — they only mean anything against the task already in play, which is why the
 * caller passes state and why these never become hard bounds.
 */
const SOFT_PREFS: Array<[RegExp, string]> = [
  [/\b(re hon|cheaper|kinh te hon|budget|affordable|tiet kiem)\b/i, 'cheaper'],
  [/\b(yen tinh|quiet|quieter|it on|khong on)\b/i, 'quiet'],
  [/\b(gan hon|closer|nearer|gan day)\b/i, 'closer'],
  [/\b(rong hon|bigger|larger|spacious)\b/i, 'bigger'],
  [/\b(nho gon|smaller|compact|nhe hon|lighter|portable)\b/i, 'lighter'],
  [/\b(moi hon|newer|doi moi)\b/i, 'newer'],
  // Deliberately loose: this is a SOFT preference, so it only nudges ranking —
  // a stray match costs nothing, whereas missing "battery must be good" loses a
  // priority the user stated outright.
  [/\b(pin|battery)\b/i, 'battery'],
  // NOT a bare "sang": diacritics are stripped before matching, so "sáng mai"
  // (tomorrow morning) became "sang" and every morning request was read as a
  // request for somewhere fancy. Observed live on turn 1 of the cafe flow.
  [/\b(sang trong|dep hon|nicer|fancier|cao cap|luxury)\b/i, 'nicer'],
  [/\b(gan bien|beach|ven bien|sea ?view)\b/i, 'near-beach'],
  [/\b(wifi|wi-fi)\b/i, 'wifi'],
]

/** A named place the user is shopping in. Kept deliberately small and explicit. */
const LOCATIONS = [
  'ha noi', 'hanoi', 'hoan kiem', 'cau giay', 'tay ho', 'ba dinh', 'thanh xuan',
  'sai gon', 'ho chi minh', 'tphcm', 'hcm', 'quan 1', 'quan 3', 'thu duc',
  'da nang', 'hoi an', 'nha trang', 'da lat', 'hue', 'phu quoc', 'vung tau', 'sa pa',
]

const TIME_CONTEXT: Array<[RegExp, string]> = [
  [/\b(sang mai|tomorrow morning)\b/i, 'tomorrow-morning'],
  [/\b(toi nay|tonight|buoi toi)\b/i, 'tonight'],
  [/\b(cuoi tuan|weekend)\b/i, 'weekend'],
  [/\b(sang|morning)\b/i, 'morning'],
  [/\b(hom nay|today)\b/i, 'today'],
]

/** "I don't like those" — the set was wrong, but the task stands. */
const REJECTION_RE =
  /khong (thich|ung|hop|khoai)|chan qua|khong cai nao|deu khong|don'?t like|do not like|not a fan|none of (these|them|those)|not what i (want|need)/i

/**
 * Is the user turning down MORE THAN ONE option?
 *
 * Vietnamese marks plurality with a classifier ("mấy quán", "các quán",
 * "những chỗ") rather than on the noun, so the singular/plural distinction has
 * to be read from those words. English marks it on the noun and pronoun
 * ("those places", "these", "them", "any of them"). Anything not recognised as
 * plural is treated as singular — the conservative direction, since rejecting
 * one option too few leaves it available, while one too many silently discards
 * an option the user never mentioned.
 */
const PLURAL_REJECTION = new RegExp([
  '\\b(may|cac|nhung|ca)\\s+(quan|cho|noi|cai|may|option|lua chon)',
  '\\b(those|these|them|both|any of (them|these|those)|all of (them|these|those))\\b',
  '\\bnone of (these|them|those)\\b',
  '\\bdeu (khong|chua)\\b',
  '\\bkhong cai nao\\b',
].join('|'), 'i')

export function isPluralRejection(normalizedText: string): boolean {
  return PLURAL_REJECTION.test(normalizedText)
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function pushHard(
  into: HardConstraint[], key: string, op: HardConstraint['op'],
  value: string | number, statedAs: string, turn: number,
) {
  if (!into.some(c => c.key === key)) into.push({ key, op, value, statedAs, turn })
}

/**
 * Read one user message against the state it lands on.
 *
 * @param raw   the user's message, verbatim (kept for `statedAs`).
 * @param state the consultation so far — needed because comparatives are
 *              meaningless without it, and because "changed" needs a baseline.
 */
export function extractDelta(
  raw: string,
  state: ConversationState | null,
  stage: DecisionStage,
  turn: number,
): ConsultationDelta {
  const text = (raw ?? '').trim()
  const t = normalizeVN(text.toLowerCase())

  const hardConstraintAdds: HardConstraint[] = []
  const hardConstraintChanges: HardConstraint[] = []
  const softPreferenceAdds: SoftPreference[] = []
  const delta: ConsultationDelta = {
    hardConstraintAdds, hardConstraintChanges, softPreferenceAdds,
    decisionIntent: stage === 'decision',
    searchImpact: { required: false, reason: 'nothing decision-relevant changed' },
  }
  if (!text) return delta

  const existing = state?.hardConstraints ?? []
  const has = (key: string) => existing.find(c => c.key === key)

  // ── Hard: explicit specs ─────────────────────────────────────────────────
  const ram = t.match(RAM_RE)
  if (ram && RAM_CONTEXT.test(t)) {
    const gb = parseInt(ram[1], 10)
    // A spec figure is a FLOOR only when the words right after it say so.
    const floor = isFloor(t, (ram.index ?? 0) + ram[0].length)
    if (gb >= 4 && gb <= 256) pushHard(hardConstraintAdds, 'ram_gb', floor ? '>=' : '=', gb, text, turn)
  }

  const st = t.match(STORAGE_RE)
  if (st) {
    const gb = st[1] ? parseInt(st[1], 10) : st[2] ? parseInt(st[2], 10) : parseInt(st[3], 10) * 1024
    const floor = isFloor(t, (st.index ?? 0) + st[0].length, st.index ?? 0)
    if (gb >= 128) pushHard(hardConstraintAdds, 'storage_gb', floor ? '>=' : '=', gb, text, turn)
  }

  if (CONDITION_USED.test(t)) pushHard(hardConstraintAdds, 'condition', '=', 'used', text, turn)
  else if (CONDITION_NEW.test(t)) pushHard(hardConstraintAdds, 'condition', '=', 'new', text, turn)

  // ── Budget: the tool already distinguishes a ceiling from a ballpark ─────
  // extractBudget is Vietnamese-only (its unit vocabulary is k/tr/triệu and its
  // qualifiers are dưới/khoảng). Rather than widen a helper the budget filter
  // and luxury filter also depend on, the English qualifier is normalised to the
  // Vietnamese one here and handed to the same parser — one code path, one set
  // of semantics, no second money grammar to keep in sync.
  const budget = extractBudget(
    t.replace(/\bunder\b|\bbelow\b|\bless than\b|\bup to\b|\bmax\b/gi, 'duoi')
      .replace(/\baround\b|\babout\b|\broughly\b|\bapprox\w*\b/gi, 'khoang')
      .replace(/\bmillion\b|\bmil\b/gi, 'trieu')
      .replace(/\bthousand\b/gi, 'nghin'),
  )
  if (budget && isNum(budget.max)) {
    if (budget.type === 'around') {
      // "tầm 25 triệu" is a target, not a wall — a 26M option is still worth
      // showing. Treated as a preference so it ranks rather than excludes.
      //
      // The MIDPOINT, not `.max`: extractBudget widens "around N" to
      // [N*0.8, N*1.2], so `.max` on "tầm 25 triệu" is 30M — labelling the
      // preference with a figure the user never said.
      const target = Math.round((budget.min + budget.max) / 2)
      softPreferenceAdds.push({ key: `budget~${target}`, weight: 1, statedAs: text, turn })
    } else {
      const c: HardConstraint = { key: 'budget_max', op: '<=', value: budget.max, statedAs: text, turn }
      if (has('budget_max')) hardConstraintChanges.push(c)
      else hardConstraintAdds.push(c)
    }
  }

  // ── Soft preferences ────────────────────────────────────────────────────
  for (const [re, key] of SOFT_PREFS) {
    if (re.test(t)) softPreferenceAdds.push({ key, weight: 1, statedAs: text, turn })
  }

  // ── Scalars ─────────────────────────────────────────────────────────────
  for (const [re, key] of USE_CASES) if (re.test(t)) { delta.useCase = key; break }
  // Most specific wins: "quán ở Hoàn Kiếm Hà Nội" is a district ask, not a city
  // one, and a first-match scan returned the city because it sorted earlier.
  const loc = LOCATIONS.filter(l => t.includes(l)).sort((a, b) => b.length - a.length)[0]
  if (loc) delta.location = loc
  for (const [re, key] of TIME_CONTEXT) if (re.test(t)) { delta.timeContext = key; break }

  // The first substantive message names the task; later turns refine it.
  if (!state?.goal && text.length >= 12 && stage === null) delta.goal = text.slice(0, 160)

  if (stage === 'rejection' || REJECTION_RE.test(t)) {
    // "Mấy quán này" means the ones the user was SHOWN — recorded from the
    // previous reply's own text. Only those may be rejected.
    //
    // Both earlier approaches were wrong in opposite directions: rejecting the
    // first five held candidates under-captured, and rejecting all of them
    // over-captured (observed live: Cà Phê MVTTS and Cà Phê Linh marked rejected
    // while never displayed). Neither guessed right because the number held has
    // nothing to do with the number shown.
    //
    // Falls back to nothing rather than to a guess: with no record of what was
    // presented, rejecting an arbitrary subset would discard valid options.
    // A named rejection is narrower than a blanket one: "I don't like Cà Phê
    // HAN" turns down ONE option and leaves the rest of the same set standing.
    // Scope = what the LAST reply named, resolved through canonical identity.
    // Matching is done on the candidate's NAME (that is what the user reads and
    // types) while the RECORD is its id (two listings can share a title).
    const scopeRefs = state?.lastPresentedCandidates?.length
      ? state.lastPresentedCandidates
      : (state?.presentedCandidates ?? [])
    // Scope preserves the order the last reply named things, so [0] is the
    // primary recommendation.
    const inScope = scopeRefs
      .map(ref => (state?.candidates ?? []).find(c => candidateMatchesRef(c, ref)))
      .filter((c): c is NonNullable<typeof c> => !!c)
    const named = inScope.filter(c => t.includes(normalizeVN(c.name.trim().toLowerCase())))

    // How many options is the user turning down? Measured: "Mình không thích
    // quán ĐÓ" — singular — rejected both candidates the previous reply named,
    // the recommendation AND its alternative.
    const chosen = named.length > 0
      ? named                                        // they said which one(s)
      : isPluralRejection(t)
        ? inScope                                    // "mấy quán đó" — all of them
        : inScope.slice(0, 1)                        // "quán đó" — the one recommended first
    const refs = chosen.length > 0 ? chosen.map(c => c.candidateId) : scopeRefs
    delta.rejection = { ref: refs.join(', ') || 'previous suggestions', reason: undefined }
  }

  delta.moreOptions = detectMoreOptions(text)
  delta.searchImpact = decideSearch(delta, state, stage)
  return delta
}

/**
 * Should this turn spend a search?
 *
 * Two failure modes to avoid, in tension: searching when nothing moved burns a
 * tool call and latency; NOT searching when the space moved leaves the model
 * recommending from stale evidence — which is how a filtered-out option gets
 * presented as current. When in doubt this errs toward searching, because stale
 * evidence is the more damaging of the two.
 */
/**
 * Candidates we hold that the user has NOT been shown and has not rejected.
 *
 * The reuse budget: while this is above zero, "another option" is a question we
 * can answer from state. Both sets are matched by name because that is what the
 * previous reply actually put in front of the user.
 */
export function unseenCandidateCount(state: ConversationState | null): number {
  if (!state) return 0
  return state.candidates.filter(c => !isPresented(c, state) && !isRejected(c, state)).length
}

export function decideSearch(
  delta: ConsultationDelta,
  state: ConversationState | null,
  stage: DecisionStage,
): { required: boolean; reason: string } {
  // A decision or a confirmation is reasoning ABOUT what is already on the
  // table. Re-searching here would swap the options out from under the very
  // question the user asked.
  if (stage === 'decision' && (state?.candidates.length ?? 0) > 0) {
    return { required: false, reason: 'decision over candidates already on the table' }
  }
  if (stage === 'confirmation') {
    return { required: false, reason: 'acknowledgement — nothing new to look up' }
  }
  // "Cho mình thêm vài quán khác." The set is not wrong, the user has just seen
  // the front of it. Searching again here bought a second provider call and a
  // second batch of photos for options we were already holding.
  if (delta.moreOptions) {
    return unseenCandidateCount(state) > 0
      ? { required: false, reason: 'unseen candidates already held — show those instead of searching' }
      // Asked for more and the pool is exhausted: this is the one case where
      // "more" genuinely needs new evidence.
      : { required: true, reason: 'every held candidate has been shown — more options need a new search' }
  }
  if (delta.rejection) {
    // Only once the shown options are exhausted does a rejection need new
    // evidence; while unseen candidates remain, they are the answer.
    if (unseenCandidateCount(state) > 0) {
      return { required: false, reason: 'rejected what was shown, but unseen candidates remain' }
    }
    return { required: true, reason: 'candidates were rejected — the current set cannot be reused' }
  }
  if (delta.hardConstraintAdds.length > 0 || delta.hardConstraintChanges.length > 0) {
    return { required: true, reason: 'a hard constraint changed the eligible set' }
  }
  if (delta.location) return { required: true, reason: 'location changed' }
  if (delta.softPreferenceAdds.length > 0) {
    // A soft preference reorders the same options; it never changes which ones
    // qualify. With evidence in hand the honest move is to re-rank it, not to
    // fetch the same places again under a slightly different sort.
    if ((state?.candidates.length ?? 0) > 0) {
      return { required: false, reason: 'preference changed the ORDER — re-rank the candidates already held' }
    }
    return { required: true, reason: 'a preference changed what ranks best' }
  }
  if ((state?.candidates.length ?? 0) === 0) {
    return { required: true, reason: 'no candidates on the table yet' }
  }
  return { required: false, reason: 'nothing decision-relevant changed' }
}

/**
 * Fold a delta into state. Pure — returns a new object, mutates nothing.
 *
 * ACCUMULATE, never reset: a short message adds to the consultation, it does
 * not replace it. That is the whole point — "tầm 25 triệu" must not erase the
 * 32GB requirement stated two turns earlier.
 */
export function applyDelta(state: ConversationState, delta: ConsultationDelta): ConversationState {
  const changedKeys = new Set(delta.hardConstraintChanges.map(c => c.key))
  const hardConstraints = [
    ...state.hardConstraints.filter(c => !changedKeys.has(c.key)),
    ...delta.hardConstraintChanges,
    ...delta.hardConstraintAdds.filter(c => !state.hardConstraints.some(e => e.key === c.key)),
  ]

  // Repeating a preference is emphasis, not a duplicate entry.
  const softPreferences = [...state.softPreferences]
  for (const p of delta.softPreferenceAdds) {
    const existing = softPreferences.find(e => e.key === p.key)
    if (existing) existing.weight += 1
    else softPreferences.push(p)
  }

  return {
    ...state,
    goal: state.goal ?? delta.goal,
    hardConstraints,
    softPreferences,
    useCase: delta.useCase ?? state.useCase,
    location: delta.location ?? state.location,
    timeContext: delta.timeContext ?? state.timeContext,
    rejections: delta.rejection
      ? [...state.rejections, { ...delta.rejection, turn: state.turn }]
      : state.rejections,
  }
}
