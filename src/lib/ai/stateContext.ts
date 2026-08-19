import { isRejected, type ConversationState } from './conversationState'
import { buildNumericGroundingRule } from './numericGrounding'

/**
 * What evidence this turn actually has (Task 3F-2). These are NOT the same
 * situation and must not collapse into one "no results" message:
 *
 *  candidates    — grounded candidates are held; normal recommendation path.
 *  search_empty  — a search ran and legitimately returned nothing.
 *  search_failed — the provider errored/timed out. We know nothing, which is
 *                  very different from knowing there is nothing.
 *  none          — no search ran this turn and nothing is held.
 */
export type EvidenceStatus = 'candidates' | 'search_empty' | 'search_failed' | 'none'

/**
 * The zero-evidence guard.
 *
 * WHY IT EXISTS: the grounding rules used to live inside
 * `if (state.candidates.length > 0)`, so the model received them only when it
 * already had facts — and nothing at all in the one situation where invention
 * is most likely. Observed live with 0 candidates: it recommended a specific
 * "MacPro M1 32GB SSD 256GB … tầm 25 triệu", invented a battery-health figure,
 * and silently downgraded the user's own 512GB requirement to 256GB while
 * explaining the downgrade away. The guard was inverted relative to the risk.
 *
 * Emitted whenever there is nothing to recommend from, never gated on the
 * candidate count.
 */
export function buildEvidenceStatusBlock(
  status: EvidenceStatus,
  state: ConversationState | null,
): string {
  if (status === 'candidates') return ''

  const requirements = (state?.hardConstraints ?? [])
    .map(c => `${c.key} ${c.op} ${c.value}`)
    .join(', ')

  const situation = status === 'search_failed'
    ? 'TIM KIEM THAT BAI: cong cu tra cuu khong phan hoi duoc luot nay. Ta KHONG BIET thi truong co gi — ' +
      'day KHONG PHAI la "khong co san pham nao". TUYET DOI KHONG noi rang khong ton tai lua chon nao.'
    : status === 'search_empty'
      ? 'DA TIM NHUNG KHONG CO KET QUA NAO XAC MINH DUOC: khong co ung vien nao trong du lieu hien tai dat cac tieu chi nay.'
      : 'CHUA CO UNG VIEN NAO duoc xac minh trong cuoc tro chuyen nay.'

  return `\n\n===== KHONG CO BANG CHUNG (SYSTEM — BAT BUOC) =====
${situation}

VI CHUA CO UNG VIEN NAO, TUYET DOI KHONG DUOC:
- Neu ten mot san pham/quan/khach san cu the nhu thu ban da tim thay
- Neu gia, khoang gia, hay "tam X trieu"
- Neu cau hinh (RAM, o cung, doi may), tinh trang pin, bao hanh, danh gia, gio mo cua, dia chi
- Noi mot lua chon "con hang", "de tim", hay so sanh hai phuong an khong co that
- Ha thap hay bo bot yeu cau user da neu de cho vua mot phuong an tu nghi ra${
    requirements ? `\n  (Yeu cau user da chot, PHAI giu nguyen: ${requirements})` : ''
  }
- DAC BIET: KHONG duoc tu de xuat mot cau hinh THAP HON roi bien minh cho no
  (vd user can 32GB ma ban khuyen 16GB va noi "16GB da qua du", hay user can 512GB
  ma ban de xuat 256GB). Do la tu y ha yeu cau cua user. Neu that su nghi nen noi
  long, hay HOI user co muon noi long khong — bang loi, khong kem con so moi.

HAY LAM DUNG NHUNG VIEC NAY:
1. Noi THANG va ngan gon rang lan nay chua xac minh duoc lua chon nao.
2. Nhac lai dung cac yeu cau cua user de ho biet ban van nho.
3. Duoc phep dua ra loi khuyen CHUNG khong gan voi san pham cu the (vd can kiem tra gi khi mua may cu) — nhung KHONG kem so lieu bia.
4. Neu huu ich, hoi DUNG MOT cau ve dieu duy nhat co the mo rong ket qua (vd noi long ngan sach hay cau hinh).
${buildNumericGroundingRule(state)}
====================================================`
}

/**
 * Renders conversation state into the block the model actually reads (Task 3D).
 *
 * ALLOW-LIST, NOT A SERIALISER. It reads named fields one at a time and never
 * iterates the state object, so a field added to `ConversationState` later
 * cannot leak by default — `ownerScope`, storage keys, auth ids and internal
 * timestamps have no path into this string. `stateContextLeaksNothing` in the
 * tests asserts that against a state deliberately stuffed with secrets.
 *
 * PROVENANCE IS PART OF THE MESSAGE. Every line says where it came from:
 * USER-STATED (the user's own words), TOOL-EVIDENCE (a tool returned it), or
 * SYSTEM (derived by us). Nothing is labelled inferred, because nothing here is
 * inferred — the moment something is, it needs its own label rather than being
 * quietly mixed in with facts.
 */

const MAX_CANDIDATES_SHOWN = 8

/**
 * The options still on the table: held, minus the ones the user turned down.
 *
 * Rejected options are filtered OUT of the evidence list, not just out of the
 * ranking. Leaving them here contradicted the ranking block — which already
 * says "DA LOAI" — and left the model reading them as available choices.
 * Observed: a 5-candidate rejection still had all five listed as evidence.
 *
 * Exported because "how many candidates are there" must have ONE answer. The
 * route used to decide the evidence status from `candidates.length`, which
 * counts rejected ones, so a rejection that cleared the whole shown set still
 * announced "you have evidence" while this block listed none. The model was
 * being told two different things in the same prompt.
 */
/**
 * Facts that let a candidate take part in a DECISION, as opposed to merely
 * existing. A row with nothing but a search snippet cannot be compared,
 * ranked, or checked against a requirement.
 */
const DECISION_FACTS = ['price', 'price_vnd', 'gia', 'rating', 'address', 'maps_link', 'ram_gb', 'storage_gb', 'condition', 'battery', 'year']

/**
 * Is this candidate something a recommendation can actually rest on?
 *
 * WHY THIS EXISTS. `search_products` is a Serper WEB search, so on the live Mac
 * consultation it grounded six rows that were a YouTube video, two marketplace
 * tag pages and a market-research report — each with a `snippet` and nothing
 * else. Row count was 6, so the evidence status read 'candidates' and the
 * zero-evidence guard stood down. The model, handed six unusable rows and a
 * decision to make, recommended a "MacBook Air M2 32GB/512GB" that appears in
 * no candidate, at an invented 26-28 triệu, with invented 12-15h battery — a
 * configuration Apple has never sold, against a stated 32GB requirement.
 *
 * Counting rows was the mistake. Junk evidence is worse than no evidence: it
 * silently disables the protection built for exactly this situation.
 */
export function isDecisionGrade(c: ConversationState['candidates'][number]): boolean {
  return DECISION_FACTS.some(k => {
    const v = c.facts?.[k]
    return v !== undefined && v !== null && String(v).trim() !== ''
  })
}

/** Still on the table AND actually usable for a decision. */
export function usableCandidates(state: ConversationState) {
  return visibleCandidates(state).filter(isDecisionGrade)
}

export function visibleCandidates(state: ConversationState) {
  // Matched on canonical identity (with a display-name fallback for older
  // records), so two listings that happen to share a title are not both
  // discarded when the user rejects one.
  return state.candidates.filter(c => !isRejected(c, state))
}

/**
 * The dimensions a recommendation habitually talks about. Each one is either
 * evidenced for a candidate or explicitly marked missing — silence is what the
 * model fills in.
 */
const CLAIMABLE_DIMENSIONS: Array<[key: string, label: string, aliases: string[]]> = [
  ['opening_hours', 'gio_mo_cua', ['opening_hours']],
  ['price', 'gia', ['price', 'price_vnd', 'gia']],
  ['rating', 'danh_gia', ['rating', 'google_rating', 'rating_count']],
  ['wifi', 'wifi', ['wifi', 'amenities']],
  ['size', 'khong_gian_quy_mo', ['size', 'capacity', 'seats']],
  ['address', 'dia_chi', ['address']],
]

/**
 * Which of those dimensions this candidate has NO evidence for.
 *
 * WHY PER-CANDIDATE AND EXPLICIT. Measured on honest captured evidence: MVTTS
 * carried only an address and a maps link, and the reply said "mở cả ngày";
 * Orick got "WiFi tốt, giá hợp lý". Neither fact existed anywhere. The evidence
 * line said nothing about hours, wifi or price for those candidates, and a gap
 * reads as an invitation. Naming the gap per candidate — never pooled across
 * candidates — is what keeps A's opening hours from becoming B's.
 */
function missingDimensions(c: ConversationState['candidates'][number]): string[] {
  const has = (aliases: string[]) => aliases.some(a => {
    const v = c.facts[a]
    return v !== undefined && v !== null && String(v).trim() !== ''
  })
  return CLAIMABLE_DIMENSIONS.filter(([, , aliases]) => !has(aliases)).map(([, label]) => label)
}

/** One candidate line: identity, provenance, the facts that exist, and the gaps. */
function renderCandidate(c: ConversationState['candidates'][number]): string {
  const factPairs = Object.entries(c.facts)
    .map(([k, v]) => `${k}=${String(v).replace(/\s+/g, ' ').slice(0, 120)}`)
  // "(khong co du lieu)" is load-bearing: it tells the model this candidate has
  // NO facts, which is what stops it filling the gap from parametric memory.
  const facts = factPairs.length > 0 ? factPairs.join('; ') : '(khong co du lieu khac)'
  // Every claimable dimension is stated for EVERY candidate, as a value or as
  // UNKNOWN. A dimension that is simply absent reads as an invitation: MVTTS
  // carried address + maps_link only and the reply still said "có WiFi",
  // "quán nhỏ", "mở cả ngày". UNKNOWN is written per candidate and never
  // pooled, so one candidate's hours cannot become another's.
  const missing = missingDimensions(c)
  const gaps = missing.length > 0
    ? ` | ${missing.map(d => `${d}=UNKNOWN`).join('; ')} (UNKNOWN = CHUA CO DU LIEU, KHONG duoc khang dinh cung khong duoc phu dinh)`
    : ''
  const url = c.url ? ` | url=${c.url}` : ''
  return `- ${c.name} [${c.type}] (nguon: ${c.source}) ${facts}${gaps}${url}`
}

export function buildStateContextBlock(
  state: ConversationState | null,
  searchImpact?: { required: boolean; reason: string } | null,
): string {
  if (!state) return ''

  const lines: string[] = []

  // Task 3E: the search decision is made deterministically upstream, not left
  // to the model. Stated as a directive rather than enforced by withholding
  // tools: a hard block would also stop a legitimate unrelated lookup in the
  // same turn (weather, exchange rate), which the user did not ask us to break.
  if (searchImpact) {
    lines.push(
      searchImpact.required
        ? `TIM KIEM: CAN tim lai (${searchImpact.reason}). Ket qua cu o duoi co the da khong con dung — uu tien du lieu moi.`
        : `TIM KIEM: KHONG can tim lai (${searchImpact.reason}). Hay tra loi tu cac lua chon DA CO o duoi thay vi tim moi.`,
    )
  }

  if (state.goal) lines.push(`MUC TIEU (USER-STATED): ${state.goal}`)
  if (state.useCase) lines.push(`MUC DICH SU DUNG (USER-STATED): ${state.useCase}`)
  if (state.location) lines.push(`DIA DIEM (USER-STATED): ${state.location}`)
  if (state.timeContext) lines.push(`THOI GIAN (USER-STATED): ${state.timeContext}`)

  if (state.hardConstraints.length > 0) {
    lines.push('YEU CAU BAT BUOC (USER-STATED — phai dat, khong duoc lang le thay bang phuong an khong dat):')
    for (const c of state.hardConstraints) lines.push(`  - ${c.key} ${c.op} ${c.value}  ("${c.statedAs}")`)
  }

  if (state.softPreferences.length > 0) {
    lines.push('UU TIEN (USER-STATED — anh huong xep hang, khong loai tru):')
    for (const p of state.softPreferences) lines.push(`  - ${p.key} ("${p.statedAs}")`)
  }

  if (state.rejections.length > 0) {
    const refs = state.rejections.map(r => (r.reason ? `${r.ref} (${r.reason})` : r.ref)).join(', ')
    lines.push(`DA BI TU CHOI (USER-STATED — dung goi y lai): ${refs}`)
  }

  // Still lists factless rows, explicitly marked — hiding them would remove the
  // marker that stops the model filling the gap in. What changed is that they
  // no longer COUNT as evidence anywhere the code decides whether a
  // recommendation is possible (see usableCandidates).
  const visible = visibleCandidates(state)

  if (visible.length > 0) {
    lines.push('')
    lines.push('BANG CHUNG — CAC LUA CHON DA TIM DUOC O LUOT TRUOC (TOOL-EVIDENCE):')
    for (const c of visible.slice(0, MAX_CANDIDATES_SHOWN)) lines.push(renderCandidate(c))
    lines.push(
      'CHI duoc dua ra nhan dinh dua tren cac truong CO O TREN. Neu mot thong tin ' +
      '(gia, pin, bao hanh, tinh trang, danh gia...) KHONG co trong bang chung nay, ' +
      'PHAI noi ro la chua co du lieu — TUYET DOI KHONG doan, khong dien so, khong bia ten ' +
      'lua chon khac ngoai danh sach tren.',
    )
  }

  if (lines.length === 0) return ''

  return `\n\n===== TRANG THAI CUOC TU VAN (SYSTEM — tich luy tu cac luot truoc) =====\n${
    lines.join('\n')
  }\n=========================================================================`
}
