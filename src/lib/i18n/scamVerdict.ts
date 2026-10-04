// Scam Shield · verdict wording (owner 02/10, legal review pending).
//
// THE RULES THIS FILE ENFORCES, AND `scamVerdictWording.test.ts` HOLDS THE LINE ON:
//   * Only THREE states are ever shown for a message, a link or a QR link:
//       familiar     "Có dấu hiệu lừa đảo quen thuộc"
//       suspicious   "Có một số dấu hiệu đáng ngờ"
//       unrecognized "Chưa nhận ra dấu hiệu quen thuộc. Điều này KHÔNG có nghĩa là an toàn: ..."
//   * Never a "safe" label, never a number (score / confidence), never "Độ tin cậy cao".
//   * A LINK is never declared a scam by name: "đường link có đặc điểm thường gặp ở link giả mạo".
//   * Every state carries "TappyAI không thay thế cơ quan chức năng".
// A person who knows Vietnamese law must review these strings before they are final
// (docs/uat/SCAMSHIELD-WORDING-FOR-REVIEW.md prints them verbatim). The server reads the SAME
// dictionary (see `lib/scam-shield/verdict.ts`) so web and API can never drift apart.

import { SCAM_REPORT_HOTLINE } from '../scam-shield/hotline'

export const vi: Record<string, string> = {
  // ── The three states, for a MESSAGE / described situation ──
  'scamVerdict.familiar.title': 'Có dấu hiệu lừa đảo quen thuộc',
  'scamVerdict.suspicious.title': 'Có một số dấu hiệu đáng ngờ',
  'scamVerdict.unrecognized.title': 'Chưa nhận ra dấu hiệu quen thuộc',
  'scamVerdict.unrecognized.body': 'Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức.',
  'scamVerdict.familiar.body': 'Nội dung này giống một thủ đoạn lừa đảo đã được cơ quan chức năng cảnh báo. Đừng làm theo yêu cầu trong đó.',
  'scamVerdict.suspicious.body': 'Chưa đủ để kết luận, nhưng bạn nên dừng lại và xác minh qua kênh chính thức trước khi làm bất cứ điều gì.',
  // ── The same three states for a LINK or a link read from a QR ──
  'scamVerdict.link.familiar.title': 'Đường link có đặc điểm thường gặp ở link giả mạo',
  'scamVerdict.link.suspicious.title': 'Đường link có một số điểm đáng ngờ',
  'scamVerdict.link.unrecognized.title': 'Chưa nhận ra dấu hiệu quen thuộc ở đường link này',
  'scamVerdict.link.familiar.body': 'Đây là nhận định về đặc điểm của đường link, không phải kết luận về một tổ chức hay tên miền cụ thể. Đừng đăng nhập, đừng nhập OTP hay thông tin thẻ trên trang này.',
  'scamVerdict.link.suspicious.body': 'Chưa đủ để kết luận. Đừng nhập thông tin cá nhân hay mã OTP; hãy tự mở website hoặc ứng dụng chính thức.',
  'scamVerdict.link.unrecognized.body': 'Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức.',
  'scamVerdict.link.reasons': 'Lý do cụ thể',
  // Short badges for the device-local history list (links only).
  'scamVerdict.link.short.familiar': 'Đặc điểm link giả mạo',
  'scamVerdict.link.short.suspicious': 'Có điểm đáng ngờ',
  'scamVerdict.link.short.unrecognized': 'Chưa nhận ra dấu hiệu',
  // ── Always printed under a verdict ──
  'scamVerdict.disclaimer': 'TappyAI không thay thế cơ quan chức năng.',
  // ── The matched scenario (familiar state) ──
  'scamVerdict.scenario.heading': 'Tình huống tương ứng',
  'scamVerdict.scenario.number': 'Kịch bản số {n} trong danh sách của Bộ Công an',
  'scamVerdict.scenario.signs': 'Dấu hiệu nhận biết (theo bài viết)',
  'scamVerdict.scenario.source': 'Thông tin từ nguồn chính thức',
  'scamVerdict.scenario.sourceOpen': 'Xem bài viết gốc',
  'scamVerdict.scenario.guidanceNote': 'Phần dấu hiệu và lời khuyên do TappyAI biên soạn từ nguồn chính thức, không phải trích dẫn nguyên văn.',
  'scamVerdict.scenario.report': `Báo ngay cho Công an nơi gần nhất hoặc gọi ${SCAM_REPORT_HOTLINE.display} nếu nghi ngờ bị lừa.`,
  // ── Message tab copy (replaces the old "AI" copy) ──
  'scamVerdict.msg.subtitle': 'Dán tin nhắn hoặc mô tả ngắn tình huống đáng ngờ. TappyAI đối chiếu với các tình huống lừa đảo đã được Bộ Công an cảnh báo.',
  'scamVerdict.msg.privacy': 'Đối chiếu bằng danh sách tình huống và quy tắc có sẵn: không dùng AI, không lưu nội dung tin nhắn.',
  'scamVerdict.msg.why': 'Lý do cụ thể',
  // ── QR that is not a link ──
  'scamVerdict.qr.noVerdict': 'TappyAI chưa kiểm tra nội dung này. Đừng làm theo hướng dẫn trong đó nếu bạn không chắc; hãy xác minh qua kênh chính thức.',
}

export const en: Record<string, string> = {
  'scamVerdict.familiar.title': 'Familiar scam signs found',
  'scamVerdict.suspicious.title': 'Some suspicious signs found',
  'scamVerdict.unrecognized.title': 'No familiar signs recognised',
  'scamVerdict.unrecognized.body': 'This does NOT mean it is safe: do not send money, do not read out any OTP code, do not tap unknown links; verify through an official channel.',
  'scamVerdict.familiar.body': 'This looks like a scam tactic the authorities have warned about. Do not do what it asks.',
  'scamVerdict.suspicious.body': 'Not enough to be certain, but stop and verify through an official channel before doing anything.',
  'scamVerdict.link.familiar.title': 'This link has traits that are common in fake links',
  'scamVerdict.link.suspicious.title': 'This link has some suspicious traits',
  'scamVerdict.link.unrecognized.title': 'No familiar signs recognised in this link',
  'scamVerdict.link.familiar.body': 'This describes the traits of the link, not a conclusion about any particular organisation or domain. Do not sign in or enter an OTP or card details on this page.',
  'scamVerdict.link.suspicious.body': 'Not enough to be certain. Do not enter personal details or an OTP; open the official website or app yourself.',
  'scamVerdict.link.unrecognized.body': 'This does NOT mean it is safe: do not send money, do not read out any OTP code, do not tap unknown links; verify through an official channel.',
  'scamVerdict.link.reasons': 'Specific reasons',
  'scamVerdict.link.short.familiar': 'Fake-link traits',
  'scamVerdict.link.short.suspicious': 'Some suspicious traits',
  'scamVerdict.link.short.unrecognized': 'No signs recognised',
  'scamVerdict.disclaimer': 'TappyAI does not replace the authorities.',
  'scamVerdict.scenario.heading': 'Matching scenario',
  'scamVerdict.scenario.number': 'Scenario #{n} in the Ministry of Public Security list',
  'scamVerdict.scenario.signs': 'Warning signs (from the article)',
  'scamVerdict.scenario.source': 'Information from an official source',
  'scamVerdict.scenario.sourceOpen': 'Open the original article',
  'scamVerdict.scenario.guidanceNote': 'The signs and advice were written by TappyAI from the official material, not quoted verbatim.',
  'scamVerdict.scenario.report': `Report to the nearest police station or call ${SCAM_REPORT_HOTLINE.display} if you suspect a scam.`,
  'scamVerdict.msg.subtitle': 'Paste a message or briefly describe a suspicious situation. TappyAI compares it with the scam scenarios the Ministry of Public Security has warned about.',
  'scamVerdict.msg.privacy': 'Matched against a built-in list of scenarios and rules: no AI is used and the message text is not stored.',
  'scamVerdict.msg.why': 'Specific reasons',
  'scamVerdict.qr.noVerdict': 'TappyAI has not checked this content. Do not follow instructions in it if you are unsure; verify through an official channel.',
}

/** Server-side lookup against the SAME dictionary the web UI renders. */
export function scamVerdictText(locale: 'vi' | 'en', key: string, vars?: Record<string, string>): string {
  let s = (locale === 'en' ? en : vi)[key] ?? vi[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v)
  return s
}
