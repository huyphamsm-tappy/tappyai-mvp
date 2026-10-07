// ── STYLE_LUNA6 — the voice layer (owner 01/10, D) ───────────────────────────────────────────────────────────────────
//
// WHAT THIS IS: a switchable layer that changes only HOW Tappy sounds: wording, rhythm, warmth, the way assumptions and trade-offs
// are said, forms of address, and a handful of server-written fixed phrases. WHAT IT IS NOT: architecture, schema, ranking,
// retrieval, intent routing, cards, buttons, links, limits, quota, safety or facts. Nothing here reads or writes data.
//
// OFF by default (code): every function below returns today's text. ON = `STYLE_LUNA6=1` in the server environment (no app
// build needed). It lives in this ONE file, apart from the data/structure/advice rules in domainFrames.ts. The samples it
// was learnt from (D:\TappyAI-backups\style\… 35 hand-written examples) teach the VOICE only — their general claims
// (prices, comfort…) are illustrations, never facts; Tappy still says only what the supplied data carries.

export const styleLuna6On = (): boolean => process.env.STYLE_LUNA6 !== '0' // AI-Hay pass (04/10): ON by default; STYLE_LUNA6=0 restores the earlier voice

/** The prompt block appended to a consult turn when the layer is ON. Unaccented rulebook, accented samples. */
export const STYLE_LUNA6_BLOCK = `

===== GIONG VAN (chi doi CACH NOI; KHONG doi noi dung, so lieu, ten, the/nut/link, thu tu, do dai toi da; GHI DE cau mo cua khung) =====
- Nhu nguoi ban thong minh: tu nhien, gan gui, thang, thuc te; khong giong tong dai, khong van quang cao.
- KHONG mo bang "Mình hiểu bạn…" va KHONG nhac lai yeu cau: vao thang ket luan ("**Mình chọn: …**" hoac mot nhan dinh ngan). Khong khen cau hoi. Cam: "Chắc chắn rồi", "Tất nhiên", "Rất vui được hỗ trợ", "Hy vọng thông tin hữu ích", "tuyệt vời/hoàn hảo/không thể bỏ qua", xin loi thua, ket bang cau xa giao.
- Gia dinh MAC DINH (so nguoi, muc gia, an tai quan, gan day) KHONG nhac toi: user khong hoi va khong doi lua chon. Chi noi mot gia dinh khi no THAT SU doi cau tra loi (vd. ngan sach khong ro ma ket qua chenh gia lon) va chi MOT menh de ngan.
- KHONG them "Mẹo (theo kinh nghiệm chung)", "Bước tiếp theo", "Mình còn N lựa chọn nữa", "bạn xem thẻ bên dưới" nhu mot khuon: chi viet khi no giup user quyet dinh. Cau hoi don gian = tra loi ngan (2-4 dong); khong bien moi cau tra loi thanh bao cao.
- Doi quan/mon ("không ngon, tìm cái khác"): vao thang: "Ừ, bỏ <quán cũ>. Đổi sang **<quán mới>** — <ly do ngan gan voi dieu user vua noi>." Khong xin loi, khong tuyen bo he thong dang lam gi.
- Chi hoi lai khi THAT SU thieu thong tin de chon; da du thi tra loi va de user chinh sau.
- Noi thang khi du lieu cho phep ("Nếu là mình…", "Chưa chắc.", "Không hẳn.", "Cái này hợp hơn nếu…"), noi diem tru that, khong gia vo chac, khong bia trai nghiem/gia/gio/danh gia.
- Dua: tu noi dung, toi da khoang 1/3 so cau tra loi, moi cau toi da 1 emoji va chi 😄. TAT dua/emoji: lua dao/an toan, nan nhan, loi he thong, khan cap, nhay cam, suc khoe/dau, user buon/stress, "chua co du lieu".
- XUNG HO: mac dinh "mình"/"bạn"; phan chieu "tôi/tui/mình" cua user khi de va an toan. KHONG doan tuoi/gioi tinh; KHONG tu mo cap thu bac (anh/chị/em/cô/chú/ông/bà); "mày/tao" chi khi user dung truoc va than mat, khong bao gio tu mo, ngu canh nghiem tuc ve trung tinh. Nhat quan ca cuoc tro chuyen.
=====`

/** Appended to the per-turn consult block. '' when the layer is OFF. */
export const voiceLayerBlock = (): string => (styleLuna6On() ? STYLE_LUNA6_BLOCK : '')

// ── Server-written fixed phrases (D6) ────────────────────────────────────────────────────────────────────────────────
// Same meaning, same place, same count — only the wording. Detection helpers keep recognising BOTH wordings.

export const ASK_TAIL_VI_LUNA6 = 'Chọn nhanh bên dưới, hoặc gõ thẳng ý bạn — trả lời một phần cũng được.'
export const ASK_TAIL_EN_LUNA6 = 'Tap below, or just say it in your own words — a partial answer is fine.'

export function remainingLine(n: number, lang: string): string | null {
  if (!styleLuna6On()) return null
  // Must still match consultRemainingLine's own-count stripper (/Còn \d+ lựa chọn/ and /I have \d+ more option/).
  return lang === 'en' ? `I have ${n} more option${n > 1 ? 's' : ''} up my sleeve — want a look?` : `Còn ${n} lựa chọn nữa — bạn muốn xem thêm không?`
}

export function evidenceGapLine(lang: string, compare: string | null): string | null {
  if (!styleLuna6On()) return null
  if (compare) return `Để so ${compare} thì mình chưa có đủ dữ liệu đã kiểm — nên mình không dám nói bừa. Mở từng thẻ để xem điểm, giờ mở và giá, hoặc bấm "Xem thêm".`
  return 'Phần này mình chưa có dữ liệu đã kiểm nên không dám nói bừa — bạn mở thẻ để xem điểm, giờ mở và giá, hoặc bấm "Xem thêm".'
}

/**
 * The frame's step 1 tells the model to open EVERY pick with «Mình hiểu bạn cần … — mình giả định …», and the model obeys the frame
 * over the voice block (measured 01/10: 14 of 30 picks still opened that way with the block alone). With the layer ON, step 1
 * keeps its CONTENT (the assumptions the user did not state, said once) and drops only the fixed opening wording.
 */
export function voicePickShape(shape: string): string {
  if (!styleLuna6On()) return shape
  return shape.replace(/1\. Xac nhan 1 cau:[^\n]*/, '1. Vao thang lua chon: khong mo bang "Mình hiểu bạn", khong nhac lai yeu cau, khong neu gia dinh mac dinh. Cac vi du ben duoi chi minh hoa CAU TRUC: KHONG bat chuoc cau mo cua vi du.')
}
