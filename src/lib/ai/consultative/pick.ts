import type { NeedProfile } from './needProfile'
import type { Candidate } from './candidate'
import type { RankedResult, Reason } from './rank'
import { normalizeVN } from '../intent'

// ── Tappy's Pick (Phase 2 §5) ───────────────────────────────────────────────
//
// The Pick is rank[0]. It is not a separate decision, which is what makes it
// deterministic, explainable and testable.
//
// This exists because the prompt-only approach was MEASURED at 6/30 across 30
// live runs, and §13 of the product contract forbids answering that with
// stronger wording. So the backend decides WHICH; the model writes the sentence.
// No extra model call is involved — the block below is dynamic prompt content on
// the single AI.stream() call the architecture lock allows.

/**
 * Relative margin required for a definite (rather than conditional) Pick.
 *
 * Relative, not absolute: scores grow with the number of attributes a domain
 * supplies, so a fixed threshold would mean something different for a Place
 * (rating + reviews + distance + amenities) than for a Hotel (stars + page type).
 */
export const PICK_MARGIN = 0.05

export interface Pick {
  candidate: Candidate
  /** The grounded reasons that decided it, strongest first. */
  reasons: Reason[]
  runnerUp: { candidate: Candidate; leadsOn: Reason | null } | null
  /** True when the win is real but narrow — express it as a lean with a condition. */
  conditional: boolean
  /** Constraints that could not be confirmed from evidence. The reply must hedge. */
  unverified: string[]
}

/**
 * The user asked Tappy to choose, in so many words.
 *
 * 🚨 MEASURED ON PRODUCTION (4c47753). Asked "MacBook Pro 14 M1 32GB 512GB, tư vấn giúp mình chọn",
 * the reply listed two shops and ended "bạn đã quyết định chọn shop nào rồi?" — it handed the
 * decision back to someone who had just asked to be given one. The tool result proved why: it
 * carried `_tappy_total_found` (set during ranking) but no `_tappy_ranking`, the exact signature of
 * ranking alive and Pick null.
 *
 * The cause was that `hasDecidableNeed` asked whether the user had stated CRITERIA, and a bare
 * product name states none — `needProfile` classifies "32GB", "512GB" and "M1" as SPEC, which by
 * design set no priority. So the one turn where a user most explicitly wants a decision was the one
 * turn the Pick machinery stayed dark.
 *
 * Matched against `normalizeVN()` output — lowercase, diacritics stripped — the same convention
 * `needProfile` uses, so an accented message and an unaccented one behave identically.
 *
 * Deliberately narrow. It looks for an ASK DIRECTED AT TAPPY ("chọn giúp mình", "theo bạn nên mua
 * cái nào", "which should I get"), not for the mere presence of the word "chọn": a user saying "mình
 * đã chọn xong rồi" is reporting a decision, not requesting one.
 */
const CHOICE_REQUEST = new RegExp([
  // "tư vấn/gợi ý ... giúp/cho mình" — an ask aimed at Tappy
  'tu van (giup|cho|ho) ?(minh|toi|em|tui|mik)?',
  '(chon|lua chon|goi y|recommend) (giup|ho|cho) ?(minh|toi|em|tui|mik)',
  // "nên mua/chọn/lấy cái nào" — with or without "theo bạn"
  '(theo (ban|cau|anh|chi) )?nen (mua|chon|lay|dung|lam) (cai |con |chiec |may |quan |shop )?nao',
  '(ban|cau) (chon|thay) (cai |con |chiec |may |shop )?nao',
  'cai nao (tot|ngon|dang|hop|phu hop) (hon|nhat)',
  // English
  'which (one )?(should|would) (i|you)',
  'what (do you|would you) recommend',
  'help me (choose|pick|decide)',
  'recommend (one|me one|something)',
  '\\bpick one for me\\b',
].join('|'))

/** Signals about the TURN that the ranked result alone cannot carry. */
export interface PickSignals {
  /** The user explicitly asked Tappy to make the choice. */
  explicitChoiceRequest?: boolean
}

/**
 * True when the user asked Tappy to decide.
 *
 * Pure and exported so the gate is testable without a route, and so the route
 * stays the only place that knows which message is "the current one".
 */
export function isExplicitChoiceRequest(text: string | null | undefined): boolean {
  if (!text) return false
  return CHOICE_REQUEST.test(normalizeVN(text.toLowerCase()))
}

/**
 * Does the user's need contain anything a Pick could be FOR?
 *
 * Two ways to qualify, and they are not the same thing:
 *   · the user stated CRITERIA — a priority, a must-have, a budget; or
 *   · the user asked for a DECISION.
 *
 * The second was missing and is the whole of the production defect above. It
 * widens WHEN a Pick may be considered; it does not lower WHAT a Pick requires.
 */
function hasDecidableNeed(need: NeedProfile, signals?: PickSignals): boolean {
  return need.priorities.length > 0 || need.mustHave.length > 0 || need.budget !== null
    || signals?.explicitChoiceRequest === true
}

/**
 * Derive the Pick, or null when the evidence does not support one.
 *
 * Null is a first-class outcome, not a failure: the turn then runs exactly as it
 * does today — R7's clarification ladder, or the comparison block's conditional
 * lean.
 *
 * 🚨 An explicit request to choose is now a decidable need, which an earlier
 * version of this comment called "the fabricated confidence §14 forbids". That
 * conflated two different things. Asking to be told which one is not evidence
 * ABOUT the candidates, and it still buys none: every grounding guard below is
 * unchanged, so a request to choose with a tie, a single candidate, an unrankable
 * list, or no grounded reason still yields null. What the request changes is only
 * that the question was ASKED — and refusing to answer a question the evidence
 * can support is its own failure, which is what production measured.
 */
export function derivePick(result: RankedResult, need: NeedProfile, signals?: PickSignals): Pick | null {
  // Ordering the provider's own list is not a decision.
  if (!result.rankable) return null
  // One candidate is an answer, not a choice.
  if (result.ranked.length < 2) return null
  // Nothing was asked for, and nothing was asked OF us, so nothing can be picked FOR.
  if (!hasDecidableNeed(need, signals)) return null

  const top = result.ranked[0]
  const second = result.ranked[1]

  // A Pick with no grounded reason is not a Pick.
  if (top.reasons.length === 0) return null

  const margin = (top.score - second.score) / Math.max(Math.abs(top.score), 1e-9)
  // An exact tie: there is genuinely nothing to lean on. Say nothing rather than
  // manufacture a preference.
  if (margin <= 0) return null

  // What does the runner-up actually lead on? Only a reason where it genuinely
  // beats the winner qualifies — otherwise the "trade-off" would be invented,
  // which is the failure the C3-B.5 grounding rule exists to prevent.
  let leadsOn: Reason | null = null
  for (const r of second.reasons) {
    const mine = top.reasons.find(t => t.key === r.key)
    if (!mine || r.contribution > mine.contribution) { leadsOn = r; break }
  }

  return {
    candidate: top.candidate,
    reasons: top.reasons,
    runnerUp: { candidate: second.candidate, leadsOn },
    conditional: margin < PICK_MARGIN,
    unverified: [...top.unverifiedMustHave, ...top.unverifiedAvoid],
  }
}

/**
 * The Pick, as DATA to attach to the tool result the model reads.
 *
 * Why data and not prompt text: the Pick cannot exist when the system prompt is
 * built. Ranking needs candidates, candidates come from a tool, and the tool runs
 * inside the stream — after the prompt is fixed. Splitting it this way keeps both
 * halves where they belong:
 *
 *   * the ORDERING and the DECISION are data, carried on the tool result;
 *   * the INSTRUCTION for what that data means lives in the system prompt.
 *
 * That also preserves the safety rule the prompt already states — tool results
 * are DATA, never commands — which putting an instruction inside a tool result
 * would have quietly undermined.
 *
 * Internal scores are deliberately absent: they are not user-facing facts and
 * the product contract does not ask for them.
 */
export function buildPickPayload(pick: Pick): Record<string, unknown> {
  return {
    pick: pick.candidate.name,
    decided_by: pick.reasons.filter(r => r.contribution > 0).slice(0, 3).map(r => ({ attribute: r.key, evidence: r.detail })),
    ...(pick.runnerUp ? {
      not_chosen: pick.runnerUp.candidate.name,
      ...(pick.runnerUp.leadsOn ? { not_chosen_leads_on: { attribute: pick.runnerUp.leadsOn.key, evidence: pick.runnerUp.leadsOn.detail } } : {}),
    } : {}),
    ...(pick.conditional ? { conditional: true } : {}),
    ...(pick.unverified.length > 0 ? { unverified: pick.unverified } : {}),
  }
}

/**
 * The static instruction that tells the model how to read `_tappy_ranking`.
 *
 * Goes into `SystemPrompt.dynamic` ONLY. `shared` is the byte-stable ~11k-token
 * prefix the provider caches; request-specific content inside it would fork a
 * cache lineage on every turn. This block is not request-specific in its TEXT,
 * but it is only sent on decision-domain turns, so it stays out of `shared`
 * to avoid growing the cached prefix for weather and gold lookups too.
 *
 * Written in the same unaccented Vietnamese as the rest of the rulebook — a
 * token-saving convention; the REPLY is always fully accented.
 */
export function buildRankingInstructionBlock(): string {
  return `\n\n===== TAPPY'S PICK — DA CHON SAN, BAN CHI GIAI THICH =====
Neu ket qua tool co truong \`_tappy_ranking\`, nghia la HE THONG da loc va xep hang cac lua chon THAT theo dung dieu user da noi, va DA CHON. Danh sach ket qua da duoc sap xep theo thu tu do.
- \`pick\` la lua chon duoc chon. \`decided_by\` la cac ly do that (thuoc tinh + bang chung) dan toi lua chon do.
- \`not_chosen\` la phuong an dung nhi; \`not_chosen_leads_on\` la diem ma no thuc su hon — dung dung cai do de noi DANH DOI, khong bia diem tru khac.
- \`conditional: true\` nghia la khoang cach rat nho: dien dat thanh cau NGHIENG VE co dieu kien, KHONG khang dinh tuyet doi.
- \`unverified\` la nhung dieu du lieu KHONG xac nhan duoc: noi ro la chua chac, TUYET DOI KHONG khang dinh la co.
LUAT:
- Viec cua ban la GIAI THICH lua chon nay, KHONG phai chon lai. KHONG doi sang ten khac.
- KHONG bia them thuoc tinh nao khong co trong ket qua tool.
- Noi ro ban nghieng ve lua chon nao va VI SAO, gan vao dung dieu user da noi.
==========================================================`
}

/**
 * Shopping grounding — what the product evidence can and cannot support.
 *
 * Added after live acceptance 2026-08-17 measured a real failure: asked for a
 * light laptop with good battery, the reply asserted "nhẹ" and "pin tốt" while
 * `/shopping` had supplied only title, source, price, link and rating. Neither
 * attribute existed anywhere in the evidence.
 *
 * The rule this block carries is the one the whole architecture rests on:
 * a USER REQUIREMENT is not CANDIDATE EVIDENCE. Wanting a light laptop does not
 * make any laptop light, and a recommendation may not borrow the user's wish and
 * hand it back as a product fact.
 *
 * Sent only on shopping turns, and only into `dynamic` — never `shared`.
 */
export function buildShoppingGroundingBlock(): string {
  return `\n\n===== MUA SAM: CAN CU CUA TUNG CAU =====
Ket qua tim kiem san pham chi chung minh duoc: TEN san pham, GIA niem yet, NOI BAN (shop/san), va DANH GIA neu ket qua that su co truong do.
No KHONG chung minh duoc: trong luong, thoi luong PIN, do ben, nhiet do, do on, chat luong man hinh, hieu nang thuc te, hay "tot hon noi chung".
LUAT CUNG — YEU CAU CUA USER KHONG PHAI BANG CHUNG SAN PHAM:
- User noi "uu tien may nhe, pin tot" nghia la HO MUON the. Dieu do KHONG bien bat ky may nao thanh nhe hay pin tot, va KHONG duoc suy ra rang san pham dap ung yeu cau do.
- Duoc phep nhac lai yeu cau cua user (vd "vi ban can may nhe..."), NHUNG TUYET DOI KHONG khang dinh san pham CO thuoc tinh do khi ket qua khong ghi.
KHONG SUY DIEN tu: man hinh (15.6 inch khong co nghia la nhe), ten dong may, CPU, thuong hieu, gia cao, hay danh gia cao. Gia cao KHONG suy ra pin tot; danh gia cao KHONG suy ra may nhe.
NEU THIEU DU LIEU: noi that mot cau ngan rang nguon hien tai CHUA CO THONG TIN ve tieu chi do nen ban chua khang dinh duoc — roi van goi y dua tren nhung gi CO that (gia, danh gia, noi ban). Thieu bang chung thi BO QUA hoac NOI RO, khong duoc bia.
Luat nay ap dung cho MOI cau: uu diem, nhuoc diem, danh doi, ly do chon, va phan so sanh.

KHONG GOP CAC KET QUA THANH "MOT SAN PHAM NHIEU NOI BAN":
Moi dong la mot TIN DANG cua mot nguoi ban, KHONG phai mot bao gia cho cung mot may. Trong cung mot
ket qua thuong lan lon cau hinh khac nhau (vi du M1 Pro va M1 Max) va tinh trang khac nhau (like-new
va chinh hang), nen gia chenh nhau la vi HANG KHAC NHAU chu khong phai vi shop nay re hon shop kia.
- TUYET DOI KHONG viet "X noi cung ban may nay" hay "gia tu A den B cho cung mot san pham".
- Neu cac lua chon khac nhau ve cau hinh/tinh trang: NOI RO diem khac nhau do truoc khi so gia.
- Chi duoc goi hai dong la CUNG MOT may khi tieu de cua ca hai ghi ro cung cau hinh VA cung tinh
  trang. Khong chac thi coi la hai lua chon rieng.

TRA LOI DE USER QUYET DINH DUOC, KHONG PHAI DE LIET KE:
1. Mot cau cho thay ban hieu ho dang can gi.
2. Vai lua chon dang chu y — khong phai tat ca ket qua.
3. Diem khac nhau THUC SU anh huong den quyet dinh (cau hinh, tinh trang, gia, noi ban).
4. Neu du can cu: CHON MOT va noi RO VI SAO, kem mot lua chon thay the cho truong hop khac.
5. Neu thieu mot yeu to quyet dinh: hoi DUNG MOT cau.
Viet gon. Khong mo ta dai dong tung tin dang, khong lap lai thong tin da co o dong tren.
Neu ket qua co truong '_tappy_total_found': do la TONG so tin dang tim duoc, con danh sach ban nhan
duoc la phan da chon loc. Duoc phep noi "trong N ket qua, day la vai lua chon dang xem", nhung KHONG
duoc noi hay ngu y rang chi co bay nhieu tin dang ton tai.

KHI USER DA NHO BAN CHON, PHAI CHON NGAY O CAU TRA LOI DAU TIEN:
Neu user hoi kieu "tu van giup minh chon", "nen mua cai nao", "theo ban chon cai nao" thi viec ho
nho ban chon CHINH LA du can cu de chon — dung doi ho noi them tieu chi roi moi chon.
- PHAI dua ra MOT de xuat ro rang ngay o luot dau. TUYET DOI KHONG ket thuc bang "ban chon cai nao?"
  hay "ban da quyet dinh chua?" roi de ho tu chon.
- Chi duoc hoi lai thay vi chon khi bang chung THUC SU khong du de phan biet (vi du moi dong deu
  thieu gia va danh gia) — luc do noi RO thieu gi.

DE XUAT PHAI KEM LY DO VA DANH DOI:
- VI SAO chon: 1-2 ly do CO THAT trong ket qua (gia, danh gia, so luot danh gia, noi ban).
- DANH DOI: mot cau ve diem ma lua chon kia hon — khong bia diem tru.
- CAC LUA CHON KHONG CHON: neu trong danh sach con phuong an DANG KE khac (gia thap hon ro ret,
  danh gia cao hon, cau hinh khac), noi NGAN GON vi sao khong chon — moi phuong an mot ve la du.
  KHONG liet ke lai ca danh sach; day la giai thich quyet dinh, khong phai catalogue.

PHAM VI CUA MOI SO SANH — TUYET DOI KHONG NOI "NHAT THI TRUONG":
Ban chi nhin thay nhung tin dang da duoc tim ve, KHONG phai ca thi truong. Moi so sanh nhat/tot nhat
PHAI duoc gioi han vao dung pham vi do.
- CAM: "re nhat tren thi truong", "gia tot nhat thi truong", "re nhat hien nay", "khong dau re hon",
  "cheapest on the market", "best price on the market".
- DUNG: "re nhat trong cac lua chon minh tim duoc", "gia tot nhat trong danh sach hien co",
  "thap nhat trong N ket qua tren".
Co '_tappy_total_found' cang chung to ban chi thay MOT PHAN — cang khong duoc noi "nhat thi truong".

KHONG KHANG DINH HAI TIN DANG CUNG CAU HINH NEU BANG CHUNG KHONG NOI THE:
"M1" va "M1 Pro" la HAI chip khac nhau; "32GB/512GB" giong nhau khong lam hai may thanh cung cau hinh.
- CAM noi "cau hinh hoan toan giong nhau", "y het nhau", "cung cau hinh" khi tieu de hai dong khong
  ghi ro CUNG chip VA CUNG dung luong VA cung tinh trang.
- Neu khong chac: so sanh theo dung nhung gi tieu de ghi, hoac noi ro la tieu de khong ghi ro.
- Day la luat ve LOI KHANG DINH, khong phai luat gop dong: van giu moi dong la mot tin dang rieng.

TINH TRANG / NGUON GOC LA THUOC TINH RIENG CUA TUNG TIN DANG:
"Chinh hang", "likenew", "cu", "sealed", "refurb" chi duoc noi ve DUNG tin dang ma TIEU DE cua chinh no ghi ro dieu do.
- KHONG suy ra tinh trang tu: ten shop, ten mien, uy tin nguoi ban, gia, ten chip, thuong hieu, hay ngu canh xung quanh.
- KHONG chuyen tinh trang tu dong nay sang dong khac: mot dong ghi "Chinh Hang" KHONG lam nhung dong con lai chinh hang.
- CAM cach noi gop nhu "cac lua chon chinh hang", "ca hai deu chinh hang" khi khong phai MOI dong deu ghi ro.
- Cung cau hinh KHONG suy ra cung tinh trang: day la HAI chieu bang chung khac nhau.
- Neu tieu de khong ghi tinh trang: DUNG NOI GI ve tinh trang, hoac noi thang la tieu de khong ghi. Khong doan.
==========================================`
}

/**
 * Render a known Pick as prompt text.
 *
 * Used where the Pick is already in hand at prompt-build time (tests, and any
 * future non-streaming path). The live chat route uses the payload + instruction
 * split above instead, because the Pick does not exist when its prompt is built.
 */
export function buildPickBlock(pick: Pick): string {
  const reasonLines = pick.reasons
    .filter(r => r.contribution > 0)
    .slice(0, 3)
    .map(r => `- ${r.key}: ${r.detail}`)
    .join('\n')

  const runnerLine = pick.runnerUp
    ? `NOT CHOSEN: ${pick.runnerUp.candidate.name}${pick.runnerUp.leadsOn ? ` — ${pick.runnerUp.leadsOn.key}: ${pick.runnerUp.leadsOn.detail}` : ''}`
    : ''

  const conditionalLine = pick.conditional
    ? '\nCONDITIONAL: khoang cach giua hai lua chon RAT NHO. Dien dat thanh mot cau NGHIENG VE co dieu kien (vd "neu uu tien X thi A, con neu Y thi B"), KHONG khang dinh tuyet doi.'
    : ''

  const unverifiedLine = pick.unverified.length > 0
    ? `\nUNVERIFIED: ${pick.unverified.join(', ')} — du lieu KHONG xac nhan duoc dieu nay cho lua chon tren. Noi ro la chua chac (vd "minh chua chac quan nay co..."), TUYET DOI KHONG khang dinh la co.`
    : ''

  return `\n\n===== TAPPY'S PICK — DA CHON SAN, BAN CHI GIAI THICH =====
He thong da xep hang cac lua chon that tu ket qua tool va DA CHON. Viec cua ban la GIAI THICH lua chon nay bang ngon ngu tu nhien cua user, KHONG phai chon lai.
TAPPY'S PICK: ${pick.candidate.name}
DECIDED BY:
${reasonLines}
${runnerLine}${conditionalLine}${unverifiedLine}
LUAT:
- KHONG doi sang lua chon khac, KHONG tu chon mot cai ten khac.
- KHONG bia them thuoc tinh nao khong co o tren.
- Noi ro ban nghieng ve lua chon nao va VI SAO, gan vao dung dieu user da noi.
- Neu co NOT CHOSEN, neu mot cau danh doi that dua tren dung dong do — khong bia diem tru.
==========================================================`
}
