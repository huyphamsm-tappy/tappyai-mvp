// ── CONSULTATIVE V1 — the prompt block ──────────────────────────────────────
//
// One block, appended after the decision frame and the rendered-card block,
// that (a) states the situation (§1) and (b) OVERRIDES the listed rulebook
// rules that conflict with one-pick consulting — R1(a) "2-4 lựa chọn", R1b
// counts, R2 bullets, R7(b) "gợi ý 2-3 rồi hỏi", the 3-line cap (§7). Every
// other rule (tools, links, CCP, evidence gap, safety) is untouched. Unaccented
// like the rest of the rulebook; the situation lines carry diacritics because
// they are echoed to the user. ≈ 250–350 prompt tokens per turn.

import { buildSituationBlock, type SituationFrame } from './situationFrame'
import type { Hard } from './situationFrame'
import { buildDomainFrame, frameRef, type FrameDomain, type FrameTurn } from './domainFrames'
import { styleLuna6On } from './styleLuna6'

export interface ConsultativeV1PromptInput {
  frame: SituationFrame
  /** Hard constraints with no supporting evidence on any candidate (§4). */
  hardGaps: readonly Hard[]
  /** ASSUME_PRESENT constraints some fetched text argues against (hardConstraints.ts). */
  hardContrary?: readonly Hard[]
  /** True when the client renders the decision card (web / Android). */
  rendersCard: boolean
  lang: string
  /** The request clock, for the assumed weekend stay. Defaults to now. */
  now?: Date
  /** The concrete first tool call for a vague place request (searchNow.ts), or null. */
  searchNow?: { query: string; type: string; exact: boolean } | null
  /** Item 1: the previous assistant turn was the clarify question — asking again is forbidden. */
  afterClarify?: boolean
  /** A1(c): the route already ran the search-now call; the rows are in the tool result the model holds. */
  presearched?: boolean
  /** A1(d): the rows are the previous turn's set; these venues were already shown — pick others. */
  reuseShown?: string[]
  /**
   * Answer first (owner 2026-09-28): the gate's ONE question for this turn (a missing budget, else
   * party size), asked at the END of the reply, after the pick — never instead of it.
   */
  askAfter?: { q: string; options: string[] } | null
  /**
   * The area of this turn (owner-approved 6-area frames, 2026-09-29). When set, its frame replaces the
   * generic answer shape (items 1-3) and only that frame is loaded.
   */
  domain?: FrameDomain | null
  /** The consult turn type (consultBrain.ts) — picks the pick / follow-up / plan frame of the area. */
  frameTurn?: FrameTurn
  /** The frames sit in the CACHED system segment (frameLibrary): emit only the pointer (frameRef). */
  frameByRef?: boolean
  /**
   * Phase 3C (CONSULT_BRIEF on): a tool result may carry `_tappy_brief`, the engine's decision handoff. The single stale instruction that told
   * the model to choose because "no choice is supplied" is then conditional on the Brief being absent. Off: byte-identical text.
   */
  briefOn?: boolean
}

/**
 * The first sentences of the results rule. Without the Brief: unchanged ("the model chooses"). With the Brief on, the engine decision is already
 * supplied when `_tappy_brief` is present: Luna renders and explains it (D7) — no second choice, no second ranking, no scores — and the old
 * "you choose" applies only when there is no Brief on the result (too few candidates to rank).
 */
const RESULTS_LEAD_LEGACY = '- Ket qua tool la TOAN BO cac quan tim duoc, theo thu tu nha cung cap — KHONG phai thu tu uu tien, KHONG co lua chon san. '
const RESULTS_LEAD_BRIEF =
  '- Ket qua tool la cac quan tim duoc theo thu tu nha cung cap — KHONG phai thu tu uu tien. NEU ket qua tool co _tappy_brief: DAY LA QUYET DINH DA CO CUA HE THONG — '
  + 'lua chon chinh la pick.name; ban chi GIAI THICH vi sao hop (whyFits), danh doi (tradeoffs) va vi sao cac quan khac khong duoc chon (whyNot) bang dung du lieu trong brief; '
  + 'KHONG chon quan khac, KHONG xep hang lai, KHONG tu cham diem. Neu pick = null thi state (all_eliminated / no_evidence) noi ly do: KHONG chon mot quan thang cuoc. '
  + 'NEU KHONG co _tappy_brief (khong du ung vien de xep hang): khong co lua chon san, '

const HARD_VI: Record<Hard, string> = {
  quiet: 'yên tĩnh', parking: 'chỗ đậu xe', kids: 'phù hợp trẻ em', vegetarian: 'món chay', outdoor: 'ngoài trời',
  private_room: 'phòng riêng', late_open: 'mở khuya', delivery: 'giao hàng', air_con: 'máy lạnh', view: 'view',
  live_music: 'nhạc sống', wheelchair: 'tiếp cận xe lăn', upscale: 'sang trọng / cao cấp',
}

/** Next Saturday → Sunday from `now` (Vietnam local date), the stay V1 assumes when none is stated. */
export function nextWeekendStay(now: Date): { checkIn: string; checkOut: string; nights: number } {
  const vn = new Date(now.getTime() + 7 * 3600 * 1000)
  const day = vn.getUTCDay() // 0 = Sunday
  const untilSat = ((6 - day) + 7) % 7 || 7
  const sat = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + untilSat))
  const sun = new Date(sat.getTime() + 24 * 3600 * 1000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { checkIn: iso(sat), checkOut: iso(sun), nights: 1 }
}

export function buildConsultativeV1Block(input: ConsultativeV1PromptInput): string {
  const { frame, hardGaps, rendersCard, lang } = input
  const nextWeekend = nextWeekendStay(input.now ?? new Date())
  // Item 7 batch 1 (2026-09-19): the "BANG CHUNG THIEU" line is gone — it was dead (the block is
  // built BEFORE the tool runs, so `hardGaps` was always []); the evidence instruction rides the
  // tool result as `_tappy_evidence_note` (hardConstraints.ts). `hardGaps` stays in the input type
  // for callers; only the contrary line (also tool-time) is kept here for the same reason.
  void hardGaps
  const gaps = (input.hardContrary?.length ?? 0) > 0
    ? `
- BANG CHUNG NGUOC: user can "${input.hardContrary!.map(h => HARD_VI[h]).join(', ')}" va co danh gia noi quan KHONG co / kem. Neu ban chon quan do, noi ro dieu nay; KHONG khang dinh nguoc lai.`
    : ''
  const call = input.searchNow && input.presearched && input.reuseShown
    ? `KET QUA search_places DA CO SAN trong tool result ngay tren — la CUNG bo ket qua cua luot truoc (user muon THEM lua chon). KHONG goi search_places lai. Chon 2-3 cho KHAC voi nhung cho da gioi thieu: ${input.reuseShown.map(n => `"${n}"`).join(', ') || '(chua co)'}. Neu trong ket qua khong con cho nao khac phu hop, noi that va de nghi doi khu vuc/tieu chi.`
    : input.searchNow?.type === 'flight' && input.presearched
    ? `KET QUA get_flight_prices DA CO SAN trong tool result ngay tren (he thong da tra gia cho chang bay user hoi). KHONG goi lai, KHONG hoi ngay truoc. Trinh bay 2-3 gia re nhat kem NGAY BAY va nguon ghi trong ket qua; neu ket qua khong co gia, noi that la chua co gia truc tiep va dua link dat ve cua ket qua`
    : input.searchNow && input.presearched
    ? `KET QUA search_places DA CO SAN trong tool result ngay tren (he thong da tim "${input.searchNow.query}" quanh vi tri user). DUNG rows do de chon — KHONG goi search_places lai, tru khi rows ro rang sai vung/sai loai.`
    : input.searchNow
    ? (input.searchNow.type === 'flight'
      ? `goi get_flight_prices NGAY voi origin / destination theo yeu cau cua user — departDate BO TRONG neu user chua noi mot NGAY cu the ("tuan sau" khong phai ngay cu the). KHONG hoi ngay truoc khi goi. Trinh bay 2-3 gia re nhat kem NGAY BAY va nguon ghi trong ket qua tool; neu ket qua tool khong co gia, noi that la chua co gia truc tiep va dua link dat ve cua ket qua tool`
      : input.searchNow.type === 'product'
      ? `goi search_products({ query: "${input.searchNow.query}" })`
      : input.searchNow.type === 'hotel'
        ? `goi get_hotel_prices NGAY voi location theo yeu cau cua user${input.searchNow.query ? ` (vd "${input.searchNow.query}")` : ''}, checkIn "${nextWeekend.checkIn}", checkOut "${nextWeekend.checkOut}" (gia su cuoi tuan toi — noi ro la gia su, KHONG hoi ngay)`
        : input.searchNow.exact
          ? `goi search_places({ query: "${input.searchNow.query}"${input.searchNow.type === 'shop' ? '' : `, type: "${input.searchNow.type}"`} }) quanh vi tri user`
          : `goi search_places NGAY voi query dat theo yeu cau cua user (vd "${input.searchNow.query}") va type phu hop`)
    : ''
  // The answer turn after a clarify (item 1): the user has just answered the ONE question allowed;
  // measured GATE A (T5b "3–5 người", S5b "nước hoa") the model asked a second one instead of calling.
  // The model no longer sees the clarify turn itself (route.ts collapseClarifyTurns — the request
  // and the answer reach it as one user message), so the directive speaks of the request, not of
  // "your question".
  const afterClarify = input.afterClarify
    ? `\nHE THONG DA HOI user MOT lan va user DA BO SUNG (phan sau dau " — " trong tin nhan). Luot nay TUYET DOI KHONG hoi them bat ky dieu gi ("ban muon choi gi / an gi / huong gi / uu tien gi / loai nao" deu bi CAM). Phan user chua noi: GIA SU va noi ro. Goi tool ngay, roi CHON.`
    : ''
  // Item 7 batch 1: the second copy of the call ("- LENH LUOT NAY …" at the bottom of the block) is
  // gone — BUOC 1 at the top carries the same instruction (measured 2026-09-18: the top block is
  // the one that moved "đi chơi ở đâu" to a search; the bottom line predates it).
  const searchNow = ''
  // Answer first (2026-09-28): the gate's one question is NOT given to the model. Measured (golden B2,
  // c40 T8 / F4): with the question in the block the model asked it FIRST ("mình cần biết: …") and
  // skipped the search. askAfterStream (route, after every guard) adds it at the end instead.
  void input.askAfter
  const askAfterLine = ''
  const langLine = lang === 'en'
    ? '- Tra loi bang TIENG ANH (user viet tieng Anh).'
    : '- Tra loi bang TIENG VIET co dau, ke ca khi user go khong dau.'
  // The concrete first call goes FIRST, before the situation: measured, the same line at the end of
  // the block moved "ăn gì ngon giờ" to a search but "đi chơi ở đâu" still asked "bạn muốn chơi gì?".
  const searchFirst = input.searchNow
    ? `\n\n===== BUOC 1 CUA LUOT NAY (bat buoc) =====\n${call.charAt(0).toUpperCase()}${call.slice(1)}${input.presearched ? '' : ' NGAY, truoc khi viet bat ky chu nao'}. Cau hoi "ban muon choi gi / an gi / loai nao?" bi CAM o luot nay: user da noi hoat dong, phan con lai la gia su (ghi o TINH HUONG). Chon 1 ${input.searchNow.type === 'product' ? 'san pham' : input.searchNow.type === 'flight' ? 'chuyen bay' : 'dia diem'} tu ket qua va noi ro "minh gia su ...".${afterClarify}
=====================================`
    : afterClarify
      ? `\n\n===== LUOT SAU CAU HOI LAM RO =====${afterClarify}\n=====================================`
      : ''
  // The owner-approved frame of THIS turn's area replaces the generic shape (items 1-3); only it is loaded.
  const shape = input.domain
    ? 'HINH DANG CAU TRA LOI: theo KHUNG TRA LOI cua mang ngay ben duoi (thay cho 1-3 cu). Ten quan/san pham phai co trong ket qua tool.\n'
    : `HINH DANG CAU TRA LOI (3-5 cau, toi da 6, KHONG bullet, KHONG tieu de):\n1. CAU DAU: MOT lua chon chinh cho DUNG tinh huong tren + LY DO co bang chung (so lieu/that trong ket qua tool: diem, so luot danh gia, khoang cach, muc gia, trich review). Ten quan phai co trong ket qua tool (results / hotel_list).\n2. MOT lua chon thay the (toi da 1) + danh doi that: "re hon nhung xa hon", "view dep nhung dong". Khong co danh doi that thi khong nhac.\n3. MOT luu y huu ich: gio mo/dong, nen dat ban, khoang cach/di chuyen — chi khi co trong du lieu.\n`
  const domainFrame = !input.domain ? '' : input.frameByRef ? frameRef(input.domain, input.frameTurn ?? 'pick') : buildDomainFrame(input.domain, input.frameTurn ?? 'pick')
  return `${searchFirst}${buildSituationBlock(frame)}

===== TU VAN V1 — GHI DE CAC LUAT SAU =====
Khoi nay GHI DE R1(a) "dua 2-4 lua chon", R1b "neu 2 viet 2 / neu 3 viet toi da 3", R2 "toi da 3 bullet", va gioi han 3 dong. Cac luat khac giu nguyen.
${shape}4. Neu co gia su (giả sử) o tren: ${styleLuna6On() ? "dung NGAM cac gia su nay, KHONG nhac voi user tru khi no doi lua chon; KHONG hoi." : 'noi mot ve ngan "minh gia su ..." de user chinh, KHONG hoi.'} Gia su ve AI DI / KHI NAO / NGAN SACH / KHU VUC / UU TIEN. DOI TUONG: voi MUA SAM, KHONG gia su mon do — neu user chua noi mua GI ("mua gi bay gio", "qua gi"), hoi DUNG MOT cau ngan ve mon do va dung lai. Voi DIA DIEM, hoat dong DA LA doi tuong: "an gi ngon", "di choi o dau", "cuoi tuan lam gi", "massage", "toi nay lam gi" ⇒ GIA SU (quanh vi tri user, hom nay, quan an ngon / diem vui choi-giai tri pho bien / spa gan) va GOI tool tim NGAY, KHONG hoi.
5. TOI DA 1 cau hoi, va chi khi cau tra loi lam DOI lua chon. Khong hoi "ban muon an loai gi". KHONG hoi "ban uu tien gi (gia / hieu nang / pin / view)?" — tu chon theo KHUNG QUYET DINH va noi ro tieu chi ban dung. KHONG hoi de lay thong tin ma ban co the GIA SU roi tim ngay (so dem, ngay di, so nguoi, uu tien). Khi da co ket qua tool: cau dau PHAI la lua chon (luat 1), cau hoi (neu co) chi o CUOI.
6. NGAN SACH ma ket qua KHONG co gia: VAN chon 1 quan theo diem/so danh gia/khoang cach va noi "chua co gia de doi chieu" — KHONG hoi them de lay gia, KHONG bo trong khong chon.
7. KHACH SAN / RESORT / CHUYEN DI ma user chua noi ngay: GIA SU di cuoi tuan toi — check-in ${nextWeekend.checkIn}, check-out ${nextWeekend.checkOut} (${nextWeekend.nights} dem) — noi ro la gia su, roi GOI tool tim ngay voi ngay do. KHONG hoi ngay/so dem truoc khi tim. KHONG ghi ngay thang gia su vao cau tra loi — he thong tu hoi ngay o cuoi (owner 2026-09-28).${askAfterLine}
${rendersCard ? '- The (card) da hien anh/ten/diem/dia chi/gio/gia: KHONG liet ke lai. Con so chi xuat hien khi no la LY DO.' : '- Khong co the: neu ten, diem va gio mo ngan gon trong cau ly do, van khong liet ke.'}
${input.briefOn ? RESULTS_LEAD_BRIEF : RESULTS_LEAD_LEGACY}BAN tu chon 1 quan cho DUNG tinh huong (dip / khong khi / dieu kien cung / gio / ngan sach / loai chi tieu), KHONG chon may moc theo diem cao nhat hay dong dau, va noi ro tieu chi ban dung. Yeu cau "sang / xin / cao cap / dep hon": guest house, nha nghi, hostel, homestay binh dan KHONG phai lua chon chinh — chon resort / khach san co bang chung (loai hinh, sao, review noi ve sang trong); khong co bang chung thi noi "chua xac nhan duoc muc sang trong", KHONG khang dinh. Quan DONG CUA vao luc user dinh di (vd "an toi" ma gio mo chi den 13:30) KHONG duoc chon lam lua chon chinh — chon quan dang mo vao gio do.
- Tinh tu ve khong khi/doi tuong (yen tinh, view, hop gia dinh, hen ho, sang trong) CHI duoc noi ve mot quan khi evidence.attributes cua quan do co no. Mong muon cua user KHONG phai la thuoc tinh cua quan.
- KHONG noi "minh da kiem tra / da tim lai / da goi" tru khi luot nay thuc su co ket qua tool.${gaps}${searchNow}
${langLine}
=====================================${domainFrame}`
}
