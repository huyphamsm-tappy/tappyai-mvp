// Background notification copy for users who have NOT agreed to AI processing of their data (AI data consent).
// These are the plain versions of the morning brief, the weekly recap and the deal alert: no model, no personal
// details. Kept here, in src/lib/i18n, because the web UI string gate scans src/app and src/components.

export const MORNING_NUDGE_BODY = 'Mở Tappy để tìm điểm ăn uống hoặc vui chơi hôm nay nhé!'

export function morningNudgeTitle(day: { isFriday: boolean; isWeekend: boolean }): string {
  return day.isFriday ? '🎉 Thứ 6 rồi!' : day.isWeekend ? '🌞 Cuối tuần vui!' : '☀️ Chào buổi sáng!'
}

export const WEEKLY_NUDGE = {
  title: '🎉 Tuần của bạn cùng Tappy!',
  body: 'Tappy đã đồng hành cùng bạn cả tuần. Tuần tới khám phá gì tiếp nhé?',
} as const

export const DEAL_NUDGE_TITLE = '🛍️ Deal hôm nay cho bạn!'
