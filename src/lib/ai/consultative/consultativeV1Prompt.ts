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

export interface ConsultativeV1PromptInput {
  frame: SituationFrame
  /** Hard constraints with no supporting evidence on any candidate (§4). */
  hardGaps: readonly Hard[]
  /** True when the client renders the decision card (web / Android). */
  rendersCard: boolean
  lang: string
  /** The request clock, for the assumed weekend stay. Defaults to now. */
  now?: Date
  /** The concrete first tool call for a vague place request (searchNow.ts), or null. */
  searchNow?: { query: string; type: string; exact: boolean } | null
}

const HARD_VI: Record<Hard, string> = {
  quiet: 'yên tĩnh', parking: 'chỗ đậu xe', kids: 'phù hợp trẻ em', vegetarian: 'món chay', outdoor: 'ngoài trời',
  private_room: 'phòng riêng', late_open: 'mở khuya', delivery: 'giao hàng', air_con: 'máy lạnh', view: 'view',
  live_music: 'nhạc sống', wheelchair: 'tiếp cận xe lăn',
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
  const gaps = hardGaps.length > 0
    ? `\n- BANG CHUNG THIEU: user can "${hardGaps.map(h => HARD_VI[h]).join(', ')}" nhung KHONG quan nao trong ket qua co bang chung ve dieu do. Noi ro "minh chua thay bang chung ve X" cho quan ban chon; KHONG khang dinh bua, KHONG bo qua im lang.`
    : ''
  const call = input.searchNow
    ? (input.searchNow.type === 'hotel'
      ? `goi get_hotel_prices NGAY voi location theo yeu cau cua user${input.searchNow.query ? ` (vd "${input.searchNow.query}")` : ''}, checkIn "${nextWeekend.checkIn}", checkOut "${nextWeekend.checkOut}" (gia su cuoi tuan toi — noi ro la gia su, KHONG hoi ngay)`
      : input.searchNow.exact
        ? `goi search_places({ query: "${input.searchNow.query}", type: "${input.searchNow.type}" }) quanh vi tri user`
        : `goi search_places NGAY voi query dat theo yeu cau cua user (vd "${input.searchNow.query}") va type phu hop`)
    : ''
  const searchNow = input.searchNow
    ? `
- LENH LUOT NAY (bat buoc, lam TRUOC khi viet bat ky chu nao): ${call} ngay o buoc 1. KHONG hoi "ban thich loai gi", KHONG hoi "phai khong", KHONG hoi gio/so nguoi/mon truoc khi tim. Sau khi co ket qua: viet theo hinh dang tren, mo dau bang lua chon.`
    : ''
  const langLine = lang === 'en'
    ? '- Tra loi bang TIENG ANH (user viet tieng Anh).'
    : '- Tra loi bang TIENG VIET co dau, ke ca khi user go khong dau.'
  // The concrete first call goes FIRST, before the situation: measured, the same line at the end of
  // the block moved "ăn gì ngon giờ" to a search but "đi chơi ở đâu" still asked "bạn muốn chơi gì?".
  const searchFirst = input.searchNow
    ? `\n\n===== BUOC 1 CUA LUOT NAY (bat buoc) =====\n${call.charAt(0).toUpperCase()}${call.slice(1)} NGAY, truoc khi viet bat ky chu nao. Cau hoi "ban muon choi gi / an gi / loai nao?" bi CAM o luot nay: user da noi hoat dong, phan con lai la gia su (ghi o TINH HUONG). Chon 1 dia diem tu ket qua va noi ro "minh gia su ...".
=====================================`
    : ''
  return `${searchFirst}${buildSituationBlock(frame)}

===== TU VAN V1 — GHI DE CAC LUAT SAU =====
Khoi nay GHI DE R1(a) "dua 2-4 lua chon", R1b "neu 2 viet 2 / neu 3 viet toi da 3", R2 "toi da 3 bullet", R7(b) "goi y 2-3 lua chon roi hoi", va gioi han 3 dong. Cac luat khac giu nguyen.
HINH DANG CAU TRA LOI (3-5 cau, toi da 6, KHONG bullet, KHONG tieu de):
1. CAU DAU: MOT lua chon chinh cho DUNG tinh huong tren + LY DO co bang chung (so lieu/that trong ket qua tool: diem, so luot danh gia, khoang cach, muc gia, trich review). Ten quan phai co trong _tappy_shortlist.
2. MOT lua chon thay the (toi da 1) + danh doi that: "re hon nhung xa hon", "view dep nhung dong". Khong co danh doi that thi khong nhac.
3. MOT luu y huu ich: gio mo/dong, nen dat ban, khoang cach/di chuyen — chi khi co trong du lieu.
4. Neu co gia su (giả sử) o tren: noi mot ve ngan "minh gia su ..." de user chinh, KHONG hoi. Gia su ve AI DI / KHI NAO / NGAN SACH / KHU VUC / UU TIEN. DOI TUONG: voi MUA SAM, KHONG gia su mon do — neu user chua noi mua GI ("mua gi bay gio", "qua gi"), hoi DUNG MOT cau ngan ve mon do va dung lai. Voi DIA DIEM, hoat dong DA LA doi tuong: "an gi ngon", "di choi o dau", "cuoi tuan lam gi", "massage", "toi nay lam gi" ⇒ GIA SU (quanh vi tri user, hom nay, quan an ngon / diem vui choi-giai tri pho bien / spa gan) va GOI tool tim NGAY, KHONG hoi.
5. TOI DA 1 cau hoi, va chi khi cau tra loi lam DOI lua chon. Khong hoi "ban muon an loai gi". KHONG hoi "ban uu tien gi (gia / hieu nang / pin / view)?" — tu chon theo KHUNG QUYET DINH va noi ro tieu chi ban dung. KHONG hoi de lay thong tin ma ban co the GIA SU roi tim ngay (so dem, ngay di, so nguoi, uu tien). Khi da co ket qua tool: cau dau PHAI la lua chon (luat 1), cau hoi (neu co) chi o CUOI.
6. NGAN SACH ma ket qua KHONG co gia: VAN chon 1 quan theo diem/so danh gia/khoang cach va noi "chua co gia de doi chieu" — KHONG hoi them de lay gia, KHONG bo trong khong chon.
7. KHACH SAN / RESORT / CHUYEN DI ma user chua noi ngay: GIA SU di cuoi tuan toi — check-in ${nextWeekend.checkIn}, check-out ${nextWeekend.checkOut} (${nextWeekend.nights} dem) — noi ro la gia su, roi GOI tool tim ngay voi ngay do. KHONG hoi ngay/so dem truoc khi tim.
${rendersCard ? '- The (card) da hien anh/ten/diem/dia chi/gio/gia: KHONG liet ke lai. Con so chi xuat hien khi no la LY DO.' : '- Khong co the: neu ten, diem va gio mo ngan gon trong cau ly do, van khong liet ke.'}
- _tappy_shortlist la nhung quan ban DUOC nhac; ban khong can nhac het. Chon 1 cho tinh huong; lua chon #1 cua he thong la mac dinh, chi doi khi co ly do gan voi tinh huong (dip/khong khi/dieu kien cung/gio) va noi ro ly do do. Quan DONG CUA vao luc user dinh di (vd "an toi" ma gio mo chi den 13:30) KHONG duoc chon lam lua chon chinh — chon quan dang mo vao gio do.
- Tinh tu ve khong khi/doi tuong (yen tinh, view, hop gia dinh, hen ho, sang trong) CHI duoc noi ve mot quan khi evidence.attributes cua quan do co no. Mong muon cua user KHONG phai la thuoc tinh cua quan.
- KHONG noi "minh da kiem tra / da tim lai / da goi" tru khi luot nay thuc su co ket qua tool.${gaps}${searchNow}
${langLine}
=====================================`
}
