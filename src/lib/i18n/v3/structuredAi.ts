// V3 structured-AI primitives — ComparisonBlock (DD-005) and ConfirmationPrompt (DD-006).
//
// Same contract as the w2…w5 dictionaries: flat namespaced maps, merged by useTranslation.
//
// Every string a user can read lives here, in both locales. The V3 honesty rule applies to copy as
// much as to data: `comparison.unknown` and `entity.unknown` are the ONLY way a missing value is
// rendered — never a blank cell, never an inferred value, never a dash that reads as "none".

export const vi: Record<string, string> = {
  // ── ComparisonBlock ─────────────────────────────────────────────────────
  'comparison.title': 'So sánh {count} lựa chọn',
  'comparison.collapse': 'Thu gọn',
  'comparison.expand': 'So sánh {count} lựa chọn',
  'comparison.recommended': 'Đề xuất',
  'comparison.reason': 'Vì sao đề xuất',
  'comparison.unknown': 'chưa rõ',
  'comparison.sameForAll': 'Giống nhau ở mọi lựa chọn',
  'comparison.attribute': 'Tiêu chí',
  'comparison.attrPrice': 'Giá',
  'comparison.attrMatch': 'Khớp yêu cầu',
  'comparison.attrSellers': 'Nơi bán',

  // ── ConfirmationPrompt ──────────────────────────────────────────────────
  'confirm.confirm': 'Xác nhận',
  'confirm.cancel': 'Huỷ',
  'confirm.working': 'Đang xử lý…',
  'confirm.whatChanges': 'Thay đổi',
  'confirm.failed': 'Không thực hiện được',
  'confirm.succeeded': 'Đã xong',
  // States the consequence, never "Bạn có chắc không?" — the user must know what happens next.
  'confirm.bookingConsequence': 'Tappy sẽ mở trang đặt chỗ của {place}. Bạn xem lại thông tin rồi mới gửi yêu cầu.',
  'confirm.bookingConfirm': 'Tiếp tục đặt chỗ',
  'confirm.thisPlace': 'chỗ này',

  // ── EntityCard ──────────────────────────────────────────────────────────
  'entity.unknown': 'chưa rõ',

  // ── Discovery/tool → Chat bridge (DD-004) ───────────────────────────────
  // The prompt names the subject and asks about it. It does not decide what the user wants.
  'bridge.askAboutThis': 'Hỏi Tappy về chỗ này',
  'bridge.continueInChat': 'Tiếp tục trong chat',
  'bridge.promptEntity': 'Cho mình biết thêm về {subject}',
  'bridge.promptResult': 'Về kết quả này: {subject}',
}

export const en: Record<string, string> = {
  // ── ComparisonBlock ─────────────────────────────────────────────────────
  'comparison.title': 'Comparing {count} options',
  'comparison.collapse': 'Collapse',
  'comparison.expand': 'Compare {count} options',
  'comparison.recommended': 'Recommended',
  'comparison.reason': 'Why this one',
  'comparison.unknown': 'unknown',
  'comparison.sameForAll': 'Same for all options',
  'comparison.attribute': 'Attribute',
  'comparison.attrPrice': 'Price',
  'comparison.attrMatch': 'Matches request',
  'comparison.attrSellers': 'Sellers',

  // ── ConfirmationPrompt ──────────────────────────────────────────────────
  'confirm.confirm': 'Confirm',
  'confirm.cancel': 'Cancel',
  'confirm.working': 'Working…',
  'confirm.whatChanges': 'What changes',
  'confirm.failed': "That didn't go through",
  'confirm.succeeded': 'Done',
  // States the consequence, never "Are you sure?" — the user must know what happens next.
  'confirm.bookingConsequence': "Tappy will open {place}'s booking page. You review the details before anything is sent.",
  'confirm.bookingConfirm': 'Continue to booking',
  'confirm.thisPlace': 'this place',

  // ── EntityCard ──────────────────────────────────────────────────────────
  'entity.unknown': 'unknown',

  // ── Discovery/tool → Chat bridge (DD-004) ───────────────────────────────
  // The prompt names the subject and asks about it. It does not decide what the user wants.
  'bridge.askAboutThis': 'Ask Tappy about this',
  'bridge.continueInChat': 'Continue in chat',
  'bridge.promptEntity': 'Tell me more about {subject}',
  'bridge.promptResult': 'About this result: {subject}',
}
