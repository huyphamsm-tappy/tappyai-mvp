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

  // ── ConfirmationPrompt ──────────────────────────────────────────────────
  'confirm.confirm': 'Xác nhận',
  'confirm.cancel': 'Huỷ',
  'confirm.working': 'Đang xử lý…',
  'confirm.whatChanges': 'Thay đổi',
  'confirm.failed': 'Không thực hiện được',
  'confirm.succeeded': 'Đã xong',

  // ── EntityCard ──────────────────────────────────────────────────────────
  'entity.unknown': 'chưa rõ',
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

  // ── ConfirmationPrompt ──────────────────────────────────────────────────
  'confirm.confirm': 'Confirm',
  'confirm.cancel': 'Cancel',
  'confirm.working': 'Working…',
  'confirm.whatChanges': 'What changes',
  'confirm.failed': "That didn't go through",
  'confirm.succeeded': 'Done',

  // ── EntityCard ──────────────────────────────────────────────────────────
  'entity.unknown': 'unknown',
}
