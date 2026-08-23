import type { NeedProfile } from './needProfile'
import type { Candidate } from './candidate'
import type { RankedResult, Reason } from './rank'

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

/** Does the user's need contain anything a Pick could be FOR? */
function hasDecidableNeed(need: NeedProfile): boolean {
  return need.priorities.length > 0 || need.mustHave.length > 0 || need.budget !== null
}

/**
 * Derive the Pick, or null when the evidence does not support one.
 *
 * Null is a first-class outcome, not a failure: the turn then runs exactly as it
 * does today — R7's clarification ladder, or the comparison block's conditional
 * lean. Forcing a Pick because the user asked for a recommendation is precisely
 * the fabricated confidence §14 of the product contract forbids.
 */
export function derivePick(result: RankedResult, need: NeedProfile): Pick | null {
  // Ordering the provider's own list is not a decision.
  if (!result.rankable) return null
  // One candidate is an answer, not a choice.
  if (result.ranked.length < 2) return null
  // Nothing was asked for, so nothing can be picked FOR.
  if (!hasDecidableNeed(need)) return null

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
