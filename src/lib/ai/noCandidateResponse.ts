import type { ConversationState, HardConstraint } from './conversationState'
import type { EvidenceStatus } from './stateContext'

/**
 * Deterministic reply for the one situation where free-form generation has
 * repeatedly proven unsafe (Task 3F-2.2).
 *
 * WHY THIS EXISTS. Three rounds of prompt-level prohibition failed to move the
 * measurement: with zero candidates the model kept recommending a machine that
 * did not exist, inventing prices and battery hours, and — worst — answering a
 * stated "RAM 32GB" requirement with "giảm RAM xuống 16GB … 16GB đã quá đủ".
 * Measured 12 unsupported numeric claims before the directives and 12–13 after,
 * with the directive verified present and last-read. A prompt is not an
 * enforcement mechanism.
 *
 * So on this narrow path the model is not asked. The reply is composed here,
 * from state, and can only contain figures the user themselves supplied —
 * fabrication is impossible by construction rather than by instruction.
 *
 * DELIBERATELY NARROW. It is not a canned message for chat: it fires only when
 * a search actually ran, came back empty, left nothing grounded, and the user
 * has stated at least one hard requirement worth protecting. Every other
 * path — candidates present, search failed, no hard constraints — is untouched.
 */

/** Exact activation condition. Anything short of all four keeps the LLM path. */
export function shouldUseDeterministicResponse(
  state: ConversationState | null,
  status: EvidenceStatus,
  usableCandidateCount = 0,
  searchRequiredThisTurn = false,
): boolean {
  if (!state) return false
  if (status !== 'search_empty') return false          // failed / none / candidates -> not this path
  // This path returns BEFORE the LLM call, so it also cancels any tool use. On
  // a turn whose new constraints call for a fresh search, firing here would
  // answer "I couldn't find anything" without having looked — measured: after
  // one junk-only search, every later turn short-circuited and the
  // consultation stopped searching entirely.
  if (searchRequiredThisTurn) return false
  // Rows that carry no price, spec or address are not "something to recommend
  // from". Counting them here is what let a search returning six articles
  // disable this guard and produce an invented MacBook — see isDecisionGrade.
  if (usableCandidateCount > 0) return false
  if (state.hardConstraints.length === 0) return false // nothing stated worth protecting
  return true
}

/**
 * Render one requirement in the user's own terms.
 *
 * Only values the user supplied are printed — this function has no source of
 * numbers other than `state`, which is what makes a new figure impossible.
 */
function renderConstraint(c: HardConstraint, vi: boolean): string {
  const atLeast = c.op === '>='
  switch (c.key) {
    case 'ram_gb':
      return vi ? `RAM ${atLeast ? 'từ ' : ''}${c.value}GB` : `${atLeast ? 'at least ' : ''}${c.value}GB RAM`
    case 'storage_gb':
      return vi ? `ổ cứng ${atLeast ? 'từ ' : ''}${c.value}GB` : `${atLeast ? 'at least ' : ''}${c.value}GB storage`
    case 'condition':
      return c.value === 'used' ? (vi ? 'máy cũ' : 'used') : (vi ? 'máy mới' : 'new')
    case 'budget_max': {
      const millions = Number(c.value) >= 1_000_000 ? Math.round(Number(c.value) / 1_000_000) : null
      const amount = millions ? `${millions} triệu` : String(c.value)
      return vi ? `giá không quá ${amount}` : `no more than ${amount}`
    }
    default:
      return `${c.key} ${c.op} ${c.value}`
  }
}

/** Which qualitative levers exist, so the single question offers real choices. */
function relaxationChoices(state: ConversationState, vi: boolean): string[] {
  const keys = new Set(state.hardConstraints.map(c => c.key))
  const hasBudget = keys.has('budget_max') ||
    state.softPreferences.some(p => p.key.startsWith('budget~'))
  const hasSpec = keys.has('ram_gb') || keys.has('storage_gb')
  const out: string[] = []
  if (hasBudget) out.push(vi ? 'ngân sách' : 'the budget')
  if (hasSpec) out.push(vi ? 'cấu hình' : 'the specs')
  if (keys.has('condition')) out.push(vi ? 'tình trạng máy' : 'the condition')
  return out
}

/**
 * Compose the reply.
 *
 * Structure is fixed: what was searched for, that nothing could be verified,
 * that the requirements have NOT been relaxed on the user's behalf, then
 * exactly one question offering qualitative levers. No product, no price, no
 * spec the user did not state, no comparison.
 */
export function buildNoCandidateResponse(state: ConversationState, lang = 'vi'): string {
  const vi = lang === 'vi'
  const reqs = state.hardConstraints.map(c => renderConstraint(c, vi))
  const list = vi
    ? reqs.join(', ').replace(/, ([^,]*)$/, ' và $1')
    : reqs.join(', ').replace(/, ([^,]*)$/, ' and $1')

  const choices = relaxationChoices(state, vi)
  const question = choices.length >= 2
    ? (vi
      ? `Bạn muốn mình thử nới ${choices.slice(0, -1).join(', ')} hay ${choices.at(-1)} trước?`
      : `Would you rather I loosen ${choices.slice(0, -1).join(', ')} or ${choices.at(-1)} first?`)
    : choices.length === 1
      ? (vi
        ? `Bạn có muốn mình thử nới ${choices[0]} một chút không?`
        : `Would you like me to loosen ${choices[0]} a little?`)
      : (vi
        ? 'Bạn có muốn mình tìm rộng hơn một chút không?'
        : 'Would you like me to widen the search a little?')

  return vi
    ? `Mình chưa tìm được lựa chọn nào trong dữ liệu hiện tại mà mình xác minh được là đáp ứng đủ yêu cầu bạn đã đặt ra: ${list}.\n\n` +
      `Mình không tự ý hạ bớt các tiêu chí này, nên hiện chưa có phương án nào để mình giới thiệu.\n\n` +
      `${question}`
    : `I couldn't verify any option in the current data that meets everything you asked for: ${list}.\n\n` +
      `I haven't loosened any of those requirements on your behalf, so there's nothing I can honestly recommend yet.\n\n` +
      `${question}`
}

/**
 * Rejection turn with nothing left on the table (Part E).
 *
 * WHY THIS EXISTS. Measured EN rejection turn: the user said "I don't like
 * those" after being shown three Hanoi cafes, and the reply ran NO search and
 * asked TWO questions — one of them re-asking the area the user had already
 * given ("which area of Hanoi — Old Quarter, Tây Hồ, Ba Đình?"). The
 * one-question ceiling is stated twice in the prompt, in R7 and again as the
 * closing instruction, and still lost.
 *
 * Forcing the re-search instead is not available on this SDK: ai@4.3.19 applies
 * `toolChoice` to every step, so a forced turn can spend all five steps calling
 * tools and return no text (see the C2 note in llm/types.ts). And the search
 * would repeat itself anyway — this path only fires once EVERY held candidate
 * has been shown and rejected, so re-running the same query returns the same
 * places the user just turned down. A targeted question is the correct
 * consultative move here; composing it here makes "exactly one" a property of
 * the code rather than a hope about the model.
 *
 * The question is chosen from what state does NOT yet know, so it can never
 * re-ask a constraint the user already stated.
 */
export function shouldUseDeterministicRejection(
  state: ConversationState | null,
  stage: string | null | undefined,
  visibleCandidateCount: number,
): boolean {
  if (!state) return false
  if (stage !== 'rejection') return false
  if (state.rejections.length === 0) return false
  if (visibleCandidateCount > 0) return false      // still something to offer — let the model consult
  if (state.candidates.length === 0) return false  // never had anything; not a rejection-of-evidence
  return true
}

/** "hoan kiem" -> "Hoan Kiem". The stored form is a match key, not display copy. */
function titleCase(s: string): string {
  return s.replace(/\b[a-zà-ỹ]/g, ch => ch.toUpperCase())
}

/** The USE_CASES keys are English identifiers; a Vietnamese reply needs words. */
function renderUseCase(key: string, vi: boolean): string {
  if (!vi) return key.replace(/-/g, ' ')
  const VI_USE_CASES: Record<string, string> = {
    coding: 'lập trình',
    'video-editing': 'dựng video',
    work: 'làm việc',
    study: 'học tập',
    gaming: 'chơi game',
    family: 'gia đình',
  }
  return VI_USE_CASES[key] ?? key.replace(/-/g, ' ')
}

/**
 * One diagnostic question, aimed at the dimension the state knows least about.
 *
 * Order matters: ask for the missing thing first. Only if price, area and
 * purpose are all already known does it fall back to asking WHY the set was
 * wrong — the one question that is always answerable and never redundant.
 */
export function rejectionQuestionFor(state: ConversationState, lang = 'vi'): string {
  return rejectionQuestion(state, lang === 'vi')
}

/**
 * The same question, handed to the MODEL as a given rather than a choice.
 *
 * WHY A GIVEN. The rejection stage block used to name four dimensions the model
 * could probe — "(gia / vi tri / kieu / thuong hieu)" — and every measured
 * violation was an enumeration over exactly that menu: "vibe, location, or
 * something else?", "WiFi, không khách, hay không gian thoáng?". Three VI
 * samples asked 3, 3 and 1 questions against a stated one-question ceiling.
 * The prompt was not failing to forbid the questionnaire; it was supplying it.
 *
 * So the choice is removed. The dimension is decided here, from what state does
 * NOT know, and the model receives one finished sentence with nothing to pick
 * between. It still writes the consultative part of the reply in its own words.
 */
export function buildRejectionQuestionBlock(state: ConversationState, lang = 'vi'): string {
  const q = rejectionQuestionFor(state, lang)
  return `\n\n===== LUOT NAY: USER VUA TU CHOI CAC GOI Y =====
CAU HOI DUY NHAT duoc phep xuat hien trong reply nay (da chon san tu nhung gi user CHUA noi):
"${q}"
Neu ban can hoi, hay dung DUNG cau tren, dat o CUOI reply. KHONG dat them bat ky dau hoi nao khac o bat cu dau trong reply — ke ca hoi long trong cau van ("ban thay sao?", "duoc khong?").
Neu ban da du du lieu de de xuat phuong an khac, hay de xuat luon va KHONG hoi gi ca — do la ket qua tot nhat cho luot nay.
KHONG liet ke nhieu chieu (gia / vi tri / kieu / thuong hieu) thanh nhieu cau hoi.
KHONG them ngoac don liet ke lua chon sau cau hoi. Hai vi du SAI da do duoc that:
  - "Which area should I look around? (HCM, Hanoi, Da Nang, or online nationwide?)"
  - "Ban dinh dung MacBook Pro de lam viec gi? (lap trinh, thiet ke, chinh sua video, hay cong viec van phong?)"
Dau hoi thu hai trong ngoac van la mot dau hoi nua. Reply phai KET THUC ngay tai dau hoi dau tien — khong ngoac don, khong "vi du...", khong liet ke lua chon phia sau.
================================================`
}

function rejectionQuestion(state: ConversationState, vi: boolean): string {
  const knowsBudget = state.hardConstraints.some(c => c.key === 'budget_max') ||
    state.softPreferences.some(p => p.key.startsWith('budget~'))
  if (!knowsBudget) {
    return vi
      ? 'Bạn muốn tầm giá khoảng bao nhiêu để mình lọc lại cho đúng?'
      : 'Roughly what price range should I aim for?'
  }
  // Area is a real question about a cafe and a poor one about a laptop.
  // Measured live: after rejecting used-MacBook results the reply asked "Which
  // area should I look around? (HCM, Hanoi, Da Nang…)", which tells the user
  // nothing was understood about the purchase.
  const aboutPlaces = state.candidates.some(c => c.type === 'place')
  if (!state.location && aboutPlaces) {
    return vi
      ? 'Bạn muốn mình tìm quanh khu vực nào?'
      : 'Which area should I look around?'
  }
  if (!state.useCase) {
    return vi
      ? 'Bạn định dùng vào việc gì để mình chọn cho sát?'
      : 'What will you be using it for, so I can match it properly?'
  }
  return vi
    ? 'Mấy chỗ đó chưa hợp ở điểm nào — giá, vị trí hay kiểu không gian?'
    : 'What was wrong with those — the price, the location, or the style?'
}

/**
 * Compose the rejection reply: acknowledge, confirm nothing was lost, ask ONE
 * question. Exactly one '?' by construction — the two fixed sentences contain
 * none, and `rejectionQuestion` returns exactly one.
 */
export function buildRejectionResponse(state: ConversationState, lang = 'vi'): string {
  const vi = lang === 'vi'
  const kept: string[] = []
  // `location` and `useCase` are normalised match keys, not the user's words —
  // printing them raw produced "yêu cầu của bạn: hoan kiem và work", a
  // Vietnamese sentence carrying a de-accented place and an English token.
  if (state.location) kept.push(titleCase(state.location))
  if (state.useCase) kept.push(renderUseCase(state.useCase, vi))
  for (const c of state.hardConstraints) kept.push(renderConstraint(c, vi))
  const keptList = kept.length > 0
    ? (vi ? kept.join(', ').replace(/, ([^,]*)$/, ' và $1') : kept.join(', ').replace(/, ([^,]*)$/, ' and $1'))
    : ''

  const opener = vi
    ? 'Mình bỏ mấy lựa chọn đó nhé — mình sẽ không gợi ý lại chúng nữa.'
    : "Understood — I've dropped those and won't suggest them again."
  const keptLine = keptList
    ? (vi
      ? `Mình vẫn giữ nguyên yêu cầu của bạn: ${keptList}.`
      : `I've kept your requirements as they are: ${keptList}.`)
    : (vi
      ? 'Mình vẫn giữ nguyên yêu cầu của bạn.'
      : "I've kept your requirements as they are.")

  return `${opener} ${keptLine}\n\n${rejectionQuestion(state, vi)}`
}

/**
 * Provider did not answer — a different fact from "there is nothing".
 *
 * Kept deliberately separate from `buildNoCandidateResponse`: saying "không có
 * sản phẩm nào" after a timeout would state a market fact we never learned. The
 * requirements are still restated so the user can see nothing was lost.
 */
export function buildSearchFailedResponse(state: ConversationState, lang = 'vi'): string {
  const vi = lang === 'vi'
  const reqs = state.hardConstraints.map(c => renderConstraint(c, vi))
  const list = reqs.length > 0
    ? (vi ? reqs.join(', ').replace(/, ([^,]*)$/, ' và $1') : reqs.join(', ').replace(/, ([^,]*)$/, ' and $1'))
    : ''

  return vi
    ? `Mình chưa kiểm tra được dữ liệu sản phẩm lúc này — bên tìm kiếm đang không phản hồi, nên mình chưa biết hiện có những lựa chọn nào.${
      list ? ` Mình vẫn giữ nguyên yêu cầu của bạn: ${list}.` : ''
    }\n\nBạn muốn mình thử lại sau một chút không?`
    : `I couldn't check product data just now — the search provider isn't responding, so I don't know what's currently out there.${
      list ? ` I've kept your requirements as they are: ${list}.` : ''
    }\n\nWould you like me to try again in a moment?`
}

/**
 * Wrap the text in the AI SDK data-stream frames every client already parses.
 *
 * Reuses the existing protocol rather than introducing a second response shape,
 * so web `useChat` and Android's `parseTextDelta` need no change. Sent as ONE
 * text frame — no buffering machinery, no streaming redesign.
 */
export function toDataStreamBody(text: string, messageId = 'det-nocand'): string {
  return [
    `f:${JSON.stringify({ messageId })}`,
    `0:${JSON.stringify(text)}`,
    `e:${JSON.stringify({ finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 }, isContinued: false })}`,
    `d:${JSON.stringify({ finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } })}`,
    '',
  ].join('\n')
}
