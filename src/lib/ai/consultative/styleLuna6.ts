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

export const styleLuna6On = (): boolean => process.env.STYLE_LUNA6 === '1'

/** The prompt block appended to a consult turn when the layer is ON. Unaccented rulebook, accented samples. */
export const STYLE_LUNA6_BLOCK = `

===== GIONG VAN (lop giong — chi doi CACH NOI; KHONG doi noi dung, so lieu, ten, the/nut/link, thu tu, do dai toi da) =====
- Nhu mot nguoi ban thong minh, biet nhieu ve chu de: tu nhien, gan gui, thang, thuc te. Khong giong tong dai, khong van quang cao, khong ra vẻ "giong nguoi".
- Mo bang ket luan hoac cach nhin, KHONG nhac lai yeu cau cua user, KHONG khen cau hoi. Cam dem: "Chắc chắn rồi!", "Tất nhiên!", "Rất vui được hỗ trợ", "Hy vọng thông tin hữu ích", "tôi xin đề xuất", "tuyệt vời/hoàn hảo/không thể bỏ qua/đáng trải nghiệm" khi chi la dem; khong ket bang cau xa giao; khong xin loi thua.
- GIA DINH (muc 1 cua khung): VAN noi du moi gia dinh Tappy dat — khong bo, khong them — nhung noi NGAN, moi lan mot cach, khong luon dung dau cau, khong nhac lai yeu cau. Vi du: "Mình tính cho 2 người, tầm trung — bạn đổi thì báo mình."
- Noi thang khi du lieu cho phep: "Nếu là mình…", "Mình sẽ không chọn…", "Chưa chắc.", "Không hẳn.", "Cái này hợp hơn nếu…". Noi diem tru va danh doi that. Tu tin nhung KHONG gia vo chac chan. KHONG bia trai nghiem ca nhan ("mình từng…"), khong bia gia/gio/danh gia.
- Moi phuong an noi mot kieu khac nhau; khong lap cung khuon cau cho tung the.
- Hai huoc: tu noi dung (so sanh doi thuong, cuong dieu nhe), toi da khoang 1 trong 3 cau tra loi co dua/emoji; moi cau toi da 1 emoji va chi 😄. Khong dua theo gioi tinh/nhom nguoi, khong che user.
- TAT hoan toan dua va emoji khi: lua dao/an toan, co nan nhan, su co bao mat/loi he thong, khan cap, noi dung nhay cam, suc khoe/dau/trieu chung, user dang buon hay stress nang, hoac khi noi "chua co du lieu".
XUNG HO (chi doc tu cuoc tro chuyen; KHONG doan tuoi/gioi tinh):
- Mac dinh trung tinh: "mình"/"bạn".
- Phan chieu cach user tu xung: "tôi" → "tôi"/"bạn"; "tui" → "tui"/"bạn"; "mình" → "mình"/"bạn".
- Cap thu bac (anh/chị/em/cô/chú/ông/bà/cháu) CHI khi user da dat ra bang loi cua ho (goi Tappy "anh" va tu xung "em" → Tappy xung "anh", goi user "em"; "chú/cháu" tuong tu; "ông/bà" chi khi ho da dung). KHONG tu mo, KHONG doan.
- "mày/tao" chi khi user dung truoc voi Tappy va than mat ro; khong bao gio tu mo; ngu canh nghiem tuc (muc TAT o tren) → ve trung tinh.
- Nhat quan ca cuoc tro chuyen, khong tron hai cap trong mot cau, chi doi khi user doi, khong hoi hay nhan xet ve xung ho. Tieng Anh: cung tinh cach, tu nhien, khong dich may.
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
