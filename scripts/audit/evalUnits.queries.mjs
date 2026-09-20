// E2 (2026-09-20) — the eval rebuilt along the ANSWER-UNIT axis.
//
// Every query carries BOTH tags: the vertical (food / shopping / travel / spa / entertainment) and
// the answer unit the reply must produce — VENUE (a place card), PRODUCT (product rows / the
// shopping marker), SCHEDULE_TICKET (a time and/or a price that traces to a fetched row, or an
// explicit hedge, plus a link). 30 single-turn queries = 5 verticals × 3 units × 2, plus five
// multi-turn scenarios (clarify→answer, task switch, follow-up chain, re-asking a named venue, a
// long session) = 12 more turns. A follow-up names its parent; the runner replays the thread.
//
// id shape: <vertical letter><unit letter><n> — F/S/T/P/E × V/P/K — and M<scenario><turn>.

export const VERTICAL = { F: 'food', S: 'shopping', T: 'travel', P: 'spa', E: 'entertainment' }
export const UNIT = { V: 'VENUE', P: 'PRODUCT', K: 'SCHEDULE_TICKET' }

/** id → { text, vertical, unit, parent? , note? } */
export const QUERIES = {
  // ── FOOD ──
  FV1: { text: 'Tìm quán ăn tối ngon gần Quận 1 cho 2 người', vertical: 'food', unit: 'VENUE' },
  FV2: { text: 'quán cà phê yên tĩnh ở Quận 3 để làm việc, tầm 50-80k', vertical: 'food', unit: 'VENUE' },
  FP1: { text: 'mua bánh trung thu Kinh Đô online, hộp 4 bánh', vertical: 'food', unit: 'PRODUCT' },
  FP2: { text: 'đặt mua đặc sản khô bò Đà Lạt online loại ngon', vertical: 'food', unit: 'PRODUCT' },
  FK1: { text: 'quán Cơm Tấm Ba Ghiền Đặng Văn Ngữ mở đến mấy giờ?', vertical: 'food', unit: 'SCHEDULE_TICKET' },
  FK2: { text: 'quán ăn nào gần Quận 1 còn mở giờ này không', vertical: 'food', unit: 'SCHEDULE_TICKET' },
  // ── SHOPPING ──
  SV1: { text: 'cửa hàng CellphoneS gần Quận 1 nhất ở đâu?', vertical: 'shopping', unit: 'VENUE' },
  SV2: { text: 'siêu thị điện máy nào gần Phú Nhuận', vertical: 'shopping', unit: 'VENUE' },
  SP1: { text: 'Mua tai nghe bluetooth dưới 1 triệu, pin trâu', vertical: 'shopping', unit: 'PRODUCT' },
  SP2: { text: 'Máy lọc không khí cho phòng ngủ 20m2', vertical: 'shopping', unit: 'PRODUCT' },
  SK1: { text: 'CellphoneS Nguyễn Trãi Quận 5 mở cửa mấy giờ?', vertical: 'shopping', unit: 'SCHEDULE_TICKET' },
  SK2: { text: 'Thế Giới Di Động gần Quận 1 mấy giờ đóng cửa tối nay?', vertical: 'shopping', unit: 'SCHEDULE_TICKET' },
  // ── TRAVEL ──
  TV1: { text: 'khach san da nang gan bien duoi 1tr/dem', vertical: 'travel', unit: 'VENUE' },
  TV2: { text: 'Resort Phú Quốc cho kỷ niệm 1 năm, sang chút', vertical: 'travel', unit: 'VENUE' },
  TP1: { text: 'mua vali kéo 20 inch nhẹ, dưới 1.5 triệu', vertical: 'travel', unit: 'PRODUCT' },
  TP2: { text: 'sim 4G du lịch 7 ngày ở Việt Nam mua ở đâu online', vertical: 'travel', unit: 'PRODUCT' },
  TK1: { text: 'vé máy bay Sài Gòn đi Hà Nội ngày 10/10, 2 người, giá rẻ nhất?', vertical: 'travel', unit: 'SCHEDULE_TICKET' },
  TK2: { text: 'xe khách Sài Gòn đi Đà Lạt tối mai, vé bao nhiêu và mấy giờ chạy?', vertical: 'travel', unit: 'SCHEDULE_TICKET' },
  // ── SPA ──
  PV1: { text: 'spa massage chan gan q1 duoi 300k', vertical: 'spa', unit: 'VENUE' },
  PV2: { text: 'Spa couple cho 2 người tối nay gần Quận 1', vertical: 'spa', unit: 'VENUE' },
  PP1: { text: 'máy massage cổ vai gáy loại nào tốt dưới 2 triệu', vertical: 'spa', unit: 'PRODUCT' },
  PP2: { text: 'mua tinh dầu massage body chính hãng online', vertical: 'spa', unit: 'PRODUCT' },
  PK1: { text: 'Spa nào mở khuya sau 22h ở Quận 3', vertical: 'spa', unit: 'SCHEDULE_TICKET' },
  PK2: { text: 'Sả Spa Quận 1 mở cửa đến mấy giờ, có cần đặt lịch không?', vertical: 'spa', unit: 'SCHEDULE_TICKET' },
  // ── ENTERTAINMENT ──
  EV1: { text: 'karaoke gần đây cho nhóm 8 người tối nay, tầm 150k/người', vertical: 'entertainment', unit: 'VENUE' },
  EV2: { text: 'công viên nước nào ở Sài Gòn hợp cho gia đình có trẻ em, vé vào cổng bao nhiêu?', vertical: 'entertainment', unit: 'VENUE' },
  EP1: { text: 'loa karaoke gia đình dưới 3 triệu loại nào hát hay', vertical: 'entertainment', unit: 'PRODUCT' },
  EP2: { text: 'máy chiếu mini xem phim tại nhà dưới 5 triệu', vertical: 'entertainment', unit: 'PRODUCT' },
  EK1: { text: 'tối nay rạp CGV Vincom Đồng Khởi chiếu phim gì, mấy giờ, vé bao nhiêu?', vertical: 'entertainment', unit: 'SCHEDULE_TICKET' },
  EK2: { text: 'vé concert hoặc sự kiện cuối tuần này ở Sài Gòn mua ở đâu?', vertical: 'entertainment', unit: 'SCHEDULE_TICKET' },

  // ── MULTI-TURN ──
  // M1 clarify → answer
  M1a: { text: 'ăn gì ngon giờ', vertical: 'food', unit: 'VENUE', note: 'expects the canned clarify' },
  M1b: { text: 'dưới 100k/người', vertical: 'food', unit: 'VENUE', parent: 'M1a' },
  // M2 task switch (food → shopping in one thread)
  M2a: { text: 'quán bún bò ngon Quận 1', vertical: 'food', unit: 'VENUE', note: 'expects the canned clarify (no budget / party / constraint — item 1 policy)' },
  M2b: { text: 'à mà thôi, mua tai nghe bluetooth dưới 1 triệu', vertical: 'shopping', unit: 'PRODUCT', parent: 'M2a' },
  // M3 follow-up chain on a venue
  M3a: { text: 'quán này mở mấy giờ?', vertical: 'food', unit: 'SCHEDULE_TICKET', parent: 'FV1' },
  M3b: { text: 'chỗ đó có giữ xe không?', vertical: 'food', unit: 'VENUE', parent: 'M3a' },
  // M4 re-asking a named venue
  M4a: { text: 'rạp CGV Vincom Đồng Khởi tối nay chiếu gì?', vertical: 'entertainment', unit: 'SCHEDULE_TICKET' },
  M4b: { text: 'rạp đó có suất sau 21h không, vé bao nhiêu?', vertical: 'entertainment', unit: 'SCHEDULE_TICKET', parent: 'M4a' },
  // M5 long session
  M5a: { text: 'Spa nào tốt rẻ ở Đà Nẵng', vertical: 'spa', unit: 'VENUE' },
  M5b: { text: 'gợi ý thêm', vertical: 'spa', unit: 'VENUE', parent: 'M5a' },
  M5c: { text: 'cái thứ hai có massage đá nóng không?', vertical: 'spa', unit: 'VENUE', parent: 'M5b' },
  M5d: { text: 'vậy chốt cái đầu, đặt lịch thế nào?', vertical: 'spa', unit: 'SCHEDULE_TICKET', parent: 'M5c' },
}

/** Turn order that satisfies every parent before its child. */
export const ORDER = Object.keys(QUERIES)
export const SINGLE = ORDER.filter(id => !id.startsWith('M'))
export const MULTI = ORDER.filter(id => id.startsWith('M'))
