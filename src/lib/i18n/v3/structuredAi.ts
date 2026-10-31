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

  // ── Device context, visible and revocable (DD-011) ──────────────────────
  'context.nearYou': 'Gần bạn',
  'context.removeLocation': 'Bỏ vị trí khỏi câu hỏi',

  // ── Offline (P4-15) ─────────────────────────────────────────────────────
  // Plain language, no status code, and it says what is still possible.
  'offline.composer': 'Đang mất kết nối. Bạn vẫn đọc được đoạn chat; tin nhắn sẽ gửi được khi có mạng lại.',

  // ── Attachments (31/10): images and PDFs ────────────────────────────────
  'attach.pdfTooLarge': 'Tệp PDF lớn hơn 3 MB, Tappy chưa đọc được. Bạn thử gửi tệp nhỏ hơn hoặc chỉ các trang cần hỏi.',
  'attach.unsupported': 'Tappy đọc được ảnh (PNG, JPG, WEBP, GIF) và tệp PDF.',
  'attach.remove': 'Bỏ tệp đính kèm',

  // ── Composer modes (31/10, ChatGPT-style "+" menu) ──────────────────────
  'composer.plus': 'Thêm tệp hoặc chọn chế độ',
  'composer.attach': 'Thêm ảnh & tệp PDF',
  'composer.attachHint': 'Ảnh chụp, ảnh màn hình, PDF tới 3 MB',
  'mode.web': 'Tìm web',
  'mode.webHint': 'Tra cứu nhiều nguồn, có link và ngày',
  'mode.think': 'Suy nghĩ',
  'mode.thinkHint': 'Trả lời kỹ cho câu khó, chậm hơn',
  'mode.off': 'Tắt chế độ',
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

  // ── Device context, visible and revocable (DD-011) ──────────────────────
  'context.nearYou': 'Near you',
  'context.removeLocation': 'Stop using my location',

  // ── Offline (P4-15) ─────────────────────────────────────────────────────
  'offline.composer': 'You are offline. You can still read this chat; your message will send once you are back online.',

  // ── Attachments (31/10): images and PDFs ────────────────────────────────
  'attach.pdfTooLarge': 'This PDF is larger than 3 MB, so Tappy cannot read it yet. Try a smaller file or only the pages you need.',
  'attach.unsupported': 'Tappy can read images (PNG, JPG, WEBP, GIF) and PDF files.',
  'attach.remove': 'Remove attachment',

  // ── Composer modes (31/10, ChatGPT-style "+" menu) ──────────────────────
  'composer.plus': 'Add a file or choose a mode',
  'composer.attach': 'Add photos & PDF files',
  'composer.attachHint': 'Photos, screenshots, PDFs up to 3 MB',
  'mode.web': 'Web search',
  'mode.webHint': 'Look things up across sources, with links and dates',
  'mode.think': 'Thinking',
  'mode.thinkHint': 'A thorough answer for hard questions, slower',
  'mode.off': 'Turn the mode off',
}
