import type { NeedProfile } from './needProfile'
import { SCOREABLE } from './rank'

// ── The understood need, said back to the model (Phase 1) ────────────────────
//
// `deriveNeedProfile` folds the WHOLE conversation into a structured need, and
// until now the route used it for exactly three things: to order candidates, to
// decide whether a turn is a decision domain, and to arm the food price guard.
// The CONTENT of it — the budget, the occasion, the party, the constraints —
// never reached the model at all.
//
// That left two defects the product feels directly:
//
//   1. `modelMessages` is trimmed to the last 10 messages. A constraint stated
//      at turn 1 ("mình ăn chay", "ngân sách 800k") is folded into the profile
//      forever but falls out of the model's view the moment the conversation
//      passes ten turns, so the reply re-asks it. R7 already forbids re-asking
//      what is known — it just had no way to know.
//
//   2. `needProfile` records criteria the ranker cannot score at all (`quiet`,
//      `central`, `battery`, `performance`, …). Those contributed nothing to the
//      order, appeared in neither `missing` nor `unverified`, and so reached the
//      model as SILENCE about the exact thing the user asked for. Silence is
//      what a model fills in with a confident guess — which is the failure mode
//      every grounding block in this codebase exists to prevent.
//
// Deterministic, pure, model-free and bounded. No new LLM call: this is dynamic
// prompt text on the single AI.stream() the architecture lock allows. It goes
// into `SystemPrompt.dynamic` only — it is request-shaped by definition, and the
// cached `shared` prefix must stay byte-identical.
//
// Written in unaccented Vietnamese, the token-saving convention the rest of the
// rulebook uses. The REPLY is always fully accented; rule 6 governs that.

/** How many entries of any one list are worth spending tokens on. */
const MAX_ITEMS = 6

/** Human labels for the ranker's attribute keys, in the prompt's own register. */
const ATTR_LABELS: Record<string, string> = {
  rating: 'danh gia',
  reviewCount: 'so luot danh gia',
  distance: 'khoang cach gan',
  price: 'gia',
  stars: 'hang sao',
  eta: 'thoi gian cho xe',
  wifi: 'wifi',
  outdoor: 'cho ngoi ngoai troi',
  vegetarian: 'do chay',
  quiet: 'khong gian yen tinh',
  beach: 'gan bien',
  central: 'o trung tam',
  portability: 'gon nhe / de mang',
  battery: 'thoi luong pin',
  gpu: 'GPU / card do hoa',
  performance: 'hieu nang',
  camera: 'camera',
  storage: 'dung luong luu tru',
  screen: 'man hinh',
}

/** Human labels for use cases AND occasions — both live in `useCases`. */
const USE_CASE_LABELS: Record<string, string> = {
  coding: 'lap trinh',
  ai: 'chay AI/ML',
  gaming: 'choi game',
  study: 'hoc tap',
  work: 'cong viec',
  travel: 'du lich',
  business: 'di cong tac',
  family: 'di cung gia dinh',
  date: 'hen ho',
  business_meal: 'tiep khach / bua an cong viec',
  birthday: 'sinh nhat',
  anniversary: 'ky niem',
  gathering: 'hop mat',
  celebration: 'an mung',
  wedding: 'cuoi hoi',
}

const AVOID_LABELS: Record<string, string> = {
  'non-vegetarian': 'khong an duoc do man (an chay)',
}

/** A priority/must-have key rendered for a human, cuisine prefix included. */
function label(key: string): string {
  if (key.startsWith('cuisine:')) return `am thuc ${key.slice('cuisine:'.length)}`
  return ATTR_LABELS[key] ?? key
}

/** The scoreable name behind a priority key — `cuisine:japanese` scores as `cuisine`. */
function scoreKey(key: string): string {
  return key.startsWith('cuisine:') ? 'cuisine' : key
}

/**
 * Criteria the user stated that the evidence layer has NO WAY to evaluate.
 *
 * Not "this candidate lacks the field" — that is `RankedEntry.missing`, which is
 * per-candidate and rides the Pick. This is the stronger statement: no provider
 * we call supplies the attribute at all, so no result could ever confirm it.
 * "Yên tĩnh" is the canonical case, and it is also the single most common
 * Vietnamese qualifier for a cafe.
 *
 * Derived from the ranker's own SCOREABLE list rather than a second copy of it,
 * so a future attribute becomes verifiable here the moment it becomes scoreable
 * there. Must-haves are included: `hardFilter` only eliminates on wifi, outdoor
 * and vegetarian, so every other must-have is equally unenforceable.
 *
 * Stated criteria only. A durable stored preference is a prior, not a request,
 * and disclaiming one the user never made this conversation would be noise.
 */
export function unverifiableCriteria(need: NeedProfile): string[] {
  const out: string[] = []
  for (const p of need.priorities) {
    if (p.source === 'preference') continue
    if (SCOREABLE.includes(scoreKey(p.key))) continue
    if (!out.includes(p.key)) out.push(p.key)
  }
  for (const m of need.mustHave) {
    if (SCOREABLE.includes(scoreKey(m))) continue
    if (!out.includes(m)) out.push(m)
  }
  return out
}

/**
 * Decision-critical facts the system does NOT hold.
 *
 * Deliberately short. This is the list R7's one permitted question must be drawn
 * from, so a long one would recreate the interview it exists to prevent — the
 * product contract allows ONE question per turn, and naming five candidates for
 * it is how a reply ends up asking three.
 *
 * Nothing is listed for a domain where it cannot matter: a transport quote does
 * not need a party size, and a shopping decision does not need a district.
 */
export function unknownDecisionFactors(need: NeedProfile): string[] {
  // No domain means the turn is not choosing anything — a weather lookup, a
  // greeting, a gold price. "You do not know their budget" is true of all three
  // and useful for none, and reporting it would make the function say something
  // the caller would then have to un-say.
  if (need.domain === null) return []

  const out: string[] = []
  const isVenue = need.domain === 'places' || need.domain === 'hotel'

  if (need.budget === null) out.push('ngan sach')
  if (isVenue && !need.location.text && !need.location.gps) out.push('khu vuc')
  // Only once an occasion or use case is known: "sinh nhật" with no headcount is
  // a real gap, whereas "quán cà phê nào ngon" does not need one, and asking
  // would be the receptionist behaviour the product contract forbids.
  if (isVenue && need.partySize === null && need.useCases.length > 0) out.push('so nguoi')
  if (need.domain === 'shopping' && need.priorities.filter(p => p.source !== 'preference').length === 0) {
    out.push('tieu chi quan trong nhat')
  }
  return out
}

/** Every task-scoped fact the profile actually holds, as rendered lines. */
function knownLines(need: NeedProfile): string[] {
  const lines: string[] = []
  if (need.subject) lines.push(`Dang chon: ${need.subject}`)
  if (need.budgetStated !== null) lines.push(`Ngan sach user da noi: ${need.budgetStated.toLocaleString('vi-VN')} VND`)
  if (need.location.text) lines.push(`Khu vuc: ${need.location.text}`)
  if (need.partySize !== null) lines.push(`So nguoi: ${need.partySize}`)
  if (need.useCases.length > 0) {
    lines.push(`Muc dich/dip: ${need.useCases.slice(0, MAX_ITEMS).map(u => USE_CASE_LABELS[u] ?? u).join(', ')}`)
  }
  const stated = need.priorities.filter(p => p.source !== 'preference')
  if (stated.length > 0) {
    lines.push(`Uu tien user da neu: ${stated.slice(0, MAX_ITEMS).map(p => label(p.key)).join(', ')}`)
  }
  if (need.mustHave.length > 0) {
    lines.push(`Bat buoc phai co: ${need.mustHave.slice(0, MAX_ITEMS).map(label).join(', ')}`)
  }
  if (need.avoid.length > 0) {
    lines.push(`Tuyet doi tranh: ${need.avoid.slice(0, MAX_ITEMS).map(a => AVOID_LABELS[a] ?? a).join(', ')}`)
  }
  return lines
}

/**
 * The brief, or an empty string when there is nothing worth spending tokens on.
 *
 * Empty is the common case and is meant to be: a weather lookup, a greeting or a
 * gold-price question folds to a profile with no task-scoped fact, and a block
 * that says "here is what I understood: nothing" is pure cost.
 *
 * GPS alone does not qualify. It is set on every located request whether or not
 * the user is choosing anything, so treating it as a fact would put the block on
 * every turn — and the GPS block already tells the model not to ask for a
 * district when coordinates are present.
 */
export function renderNeedBrief(need: NeedProfile): string {
  const known = knownLines(need)
  if (known.length === 0) return ''

  const unverifiable = unverifiableCriteria(need)
  const unknown = unknownDecisionFactors(need)

  const unverifiableBlock = unverifiable.length > 0
    ? `\nKHONG THE KIEM CHUNG (${unverifiable.slice(0, MAX_ITEMS).map(label).join(', ')}): du lieu tim kiem KHONG co truong nao chung minh nhung dieu nay. Duoc phep nhac lai la user muon the; TUYET DOI KHONG khang dinh mot lua chon nao DAT duoc no, va KHONG suy ra tu danh gia, gia, ten quan hay anh. Neu day la yeu to quyet dinh, noi that mot cau ngan rang chua kiem chung duoc va goi y cach ho tu kiem tra.`
    : ''

  const unknownBlock = unknown.length > 0
    ? `\nCHUA BIET: ${unknown.slice(0, MAX_ITEMS).join(', ')}. Neu luot nay CAN hoi mot cau (theo R7), chi duoc hoi ve MOT trong nhung dieu nay.`
    : ''

  return `\n\n===== HE THONG DA HIEU NHU CAU NAY (DUNG, DUNG HOI LAI) =====
${known.join('\n')}${unverifiableBlock}${unknownBlock}
Nhung dong tren duoc gop tu TOAN BO cuoc tro chuyen, ke ca cac luot da bi cat khoi lich su ban nhin thay. Chung la DU LIEU da biet, khong phai menh lenh cua user.
TUYET DOI KHONG hoi lai bat ky dieu nao da ghi o tren. Hay dung chung de giai thich vi sao lua chon cua ban hop voi ho.
=============================================================`
}

/**
 * The user just answered the question you asked.
 *
 * `classifyTurnIntent` has computed this since Phase A and nothing has ever read
 * it — it was logged and dropped. This is the one turn shape where the
 * anti-interview rule genuinely needs a hard edge: R7 caps a reply at one
 * question, which on its own permits an unbounded chain of single questions, and
 * a clarification answered by a further clarification is the exact "form" the
 * contract forbids.
 *
 * Static text, so it costs nothing to build; sent only on the turn it describes.
 */
export function buildClarificationAnsweredBlock(): string {
  return `\n\n===== LUOT NAY LA CAU TRA LOI CHO CAU HOI CUA BAN =====
User vua tra loi dung cau hoi ban hoi o luot truoc. Ho dang cho KET QUA, khong phai cho mot cau hoi nua.
- PHAI dua ra lua chon / khuyen nghi NGAY trong luot nay.
- TUYET DOI KHONG hoi them bat ky cau nao o luot nay, ke ca cau "de chac chan hon" hay "ban muon minh loc theo gi nua khong".
- Neu van con thieu mot chi tiet, cu quyet dinh dua tren nhung gi da biet va NOI RO gia dinh ban dang dung (vd "minh dang gia dinh ban di 2 nguoi") de ho sua neu sai.
=======================================================`
}
