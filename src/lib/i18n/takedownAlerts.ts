// The wording of the operator alerts of the authority takedown desk (owner 25/11/2026). They go to the moderation team (Vietnamese). Counts and a due time only: never the agency, the
// reference, or the content. Kept here, not in the routes, so that Vietnamese UI text lives in src/lib/i18n.

export const ESCALATION_PREFIX = 'LEO THANG · '

/** Title and body of the alert for a request that was just recorded. `dueVn` is the due time already written in Vietnam time. */
export function newRequestText(urgency: string, hours: number, dueVn: string): { title: string; body: string } {
  return {
    title: urgency === 'emergency_6h' ? 'KHẨN · Yêu cầu gỡ bài mới (6 giờ)' : `Yêu cầu gỡ bài mới (${hours} giờ)`,
    body: `Có yêu cầu gỡ bài cần xử lý trước ${dueVn} (giờ Việt Nam). Vào bàn kiểm duyệt xử lý ngay.`,
  }
}

/** Title and body of the periodic watch alert. */
export function clockText(counts: { open: number; at_risk: number; overdue: number }): { title: string; body: string } {
  return {
    title: counts.overdue > 0 ? `QUÁ HẠN GỠ BÀI · ${counts.overdue} yêu cầu` : `SẮP QUÁ HẠN GỠ BÀI · ${counts.at_risk} yêu cầu`,
    body: `Yêu cầu gỡ bài đang mở: ${counts.open} (quá hạn ${counts.overdue}, sắp quá hạn ${counts.at_risk}). Vào bàn kiểm duyệt xử lý ngay.`,
  }
}
