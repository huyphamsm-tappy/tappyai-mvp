/**
 * EXPLORE UAT — the situations a Vietnamese Explore feed actually produces.
 *
 * This file exists to fill three real gaps, not to raise a count:
 *
 *   1. The highest-stakes policies had the thinnest Explore coverage
 *      (child safety 1–2 scenarios each, adult content 1, self-harm 2). Those
 *      are exactly the ones where a false positive is most damaging and a false
 *      negative is most serious.
 *   2. Caption-vs-media mismatch — an Explore-native situation with no
 *      equivalent in a chat or comment matrix.
 *   3. Gaming and sport, which is a large slice of Vietnamese short video and a
 *      known source of literal-reading mistakes.
 *
 * Same rules as every other matrix: verbatim corpus citation, no invented
 * predicate, enforcement NONE / NOT TESTED.
 */

import type { UatScenario } from './matrix';

const NONE = 'NONE / NOT TESTED' as const;
const NR = 'Không tới — mức độ chỉ tính sau khi đã xác lập vi phạm (SEV-9).';

export const UAT_MATRIX_EXPLORE: readonly UatScenario[] = Object.freeze([
  // ── Caption ≠ media: Explore-native ───────────────────────────────────────
  {
    id: 'EXP-MISMATCH-1', policy: 'ts.violence.graphic-harm', kind: 'FALSE_POSITIVE',
    situation: 'Caption giật tít "Máu me kinh hoàng!!!" nhưng video chỉ là cảnh làm bún bò.',
    evidence: 'any food preparation', trace: '§9.1 Does not govern · TOP-1',
    expected: 'NOT_APPLICABLE',
    why: 'Caption là chủ đề, không phải yếu tố cấu thành. Nội dung thật là chế biến thức ăn — nêu đích danh trong Does-not-govern.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'EXP-MISMATCH-2', policy: 'ts.violence.graphic-harm', kind: 'AMBIGUOUS',
    situation: 'Caption hiền lành "Chiều nay vui quá" nhưng video có cảnh đánh nhau; không rõ đăng để tôn vinh hay để tố cáo.',
    evidence: 'glorifies, celebrates, or exists primarily to shock', trace: '§9.1 Governs',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Yếu tố cấu thành là tôn vinh hoặc lấy gây sốc làm chính. Caption không cho biết điều đó, nên hồ sơ chưa đủ.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'EXP-MISMATCH-3', policy: 'ts.deception.harmful', kind: 'FALSE_POSITIVE',
    situation: 'Caption phóng đại "Bí quyết giàu sau 1 đêm" cho video chia sẻ kinh nghiệm bán hàng bình thường.',
    evidence: 'marketing and promotional expression', trace: '§9.6 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Cách nói tiếp thị nằm trong Does-not-govern; thiếu ít nhất một trong bốn yếu tố hội đủ.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ── Gaming và thể thao ────────────────────────────────────────────────────
  {
    id: 'EXP-GAME-1', policy: 'ts.violence.graphic-harm', kind: 'FALSE_POSITIVE',
    situation: 'Clip highlight game bắn súng, nhiều cảnh hạ gục nhân vật.',
    evidence: 'fiction and artistic depiction', trace: '§9.1 Does not govern · §18 case 27',
    expected: 'NOT_APPLICABLE',
    why: 'Hư cấu và thể hiện nghệ thuật nêu đích danh. Nhân vật game không phải người thật.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'EXP-GAME-2', policy: 'ts.violence.incitement-threats', kind: 'FALSE_POSITIVE',
    situation: 'Streamer hét "Giết nó đi! Giết nó đi!" khi đang chơi game cùng đồng đội.',
    evidence: 'gaming and sports idiom', trace: '§9.1 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Thành ngữ game/thể thao nêu đích danh; không có đối tượng bạo lực ngoài đời.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'EXP-SPORT-1', policy: 'ts.harassment.targeted', kind: 'FALSE_POSITIVE',
    situation: 'CĐV chê nặng lời màn trình diễn của một cầu thủ sau trận.',
    evidence: 'criticism of ideas, institutions, products, governments or public conduct',
    trace: '§9.4 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Phê phán màn trình diễn — tức công việc — chứ không phải lạm dụng nhắm vào con người.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ── Trẻ em trên Explore (policy nặng nhất, phủ mỏng nhất) ─────────────────
  {
    id: 'EXP-KID-1', policy: 'ts.child.sexual-exploitation', kind: 'FALSE_POSITIVE',
    situation: 'Video tài liệu về nạn buôn bán trẻ em, do một tổ chức phi chính phủ đăng để cảnh báo.',
    evidence: 'documentation or journalism', trace: 'SC-1 does_not_govern',
    expected: 'NOT_APPLICABLE',
    why: 'Tài liệu và báo chí nêu đích danh trong does_not_govern. Ghi nhận vấn đề không phải là hành vi.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'EXP-KID-2', policy: 'ts.child.sexual-exploitation', kind: 'AMBIGUOUS',
    situation: 'Clip nhảy theo trend, người trong clip trông trẻ nhưng không xác định được tuổi.',
    evidence: 'AGE_INDICATORS_SUGGEST_MINOR', trace: '§6.1 age context · CS-3 · CS-5',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Tuổi là yếu tố quyết định và chưa xác lập. Mọi trạng thái tuổi chưa rõ đều cho kết quả cuối, không vi phạm — **và cũng không phải là sự tha bổng**.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'EXP-KID-3', policy: 'ts.child.sexual-exploitation', kind: 'POSITIVE',
    situation: 'Nội dung bóc lột tình dục trẻ em.',
    evidence: 'sexual exploitation of minors, and material depicting it', trace: 'SC-1 constitutive_behavior',
    expected: 'VIOLATION',
    why: 'Cấu thành theo chính định nghĩa. CS-0: không ngữ cảnh nào phản bác được.',
    severityTreatment: 'Envelope S4 · bằng chứng LEGALLY_SENSITIVE + RESTRICTED_HANDLING + HUMAN_REQUIRED (CS-1) — **không được kết luận nếu không có người xem xét**.',
    enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
  {
    id: 'EXP-KID-4', policy: 'ts.child.grooming', kind: 'FALSE_POSITIVE',
    situation: 'Thầy giáo đăng clip chúc mừng học sinh đạt giải, có gọi tên các em.',
    evidence: 'absent an established pattern', trace: 'SC-1 does_not_govern',
    expected: 'NOT_APPLICABLE',
    why: 'Không có mẫu hình xây dựng lòng tin để bóc lột; một nội dung công khai chúc mừng không cấu thành.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'EXP-KID-5', policy: 'ts.child.grooming', kind: 'AMBIGUOUS',
    situation: 'Một tài khoản người lớn bình luận thân mật dưới nhiều clip của cùng một tài khoản trẻ; không đọc được tin nhắn riêng.',
    evidence: 'Actor & target** is decisive on the minor as target', trace: 'SC-1 decisive_dimensions',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Mẫu hình là yếu tố quyết định và phần quyết định của nó nằm ngoài hồ sơ đang có.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'EXP-KID-6', policy: 'ts.child.abuse-harm', kind: 'FALSE_POSITIVE',
    situation: 'Clip trẻ ngã xe đạp khi tập đi, cả nhà cười và đỡ dậy.',
    evidence: 'non-sexual abuse or endangerment of minors', trace: 'SC-1 constitutive_behavior',
    expected: 'NOT_APPLICABLE',
    why: 'Không có ngược đãi cũng không có đặt trẻ vào nguy hiểm — yếu tố cấu thành vắng mặt.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ── Nội dung người lớn trên Explore ───────────────────────────────────────
  {
    id: 'EXP-ADULT-1', policy: 'ts.sexual.adult-content', kind: 'FALSE_POSITIVE',
    situation: 'Clip bikini đi biển, không có hành vi tình dục.',
    evidence: 'non-sexual nudity in cultural, artistic or medical context', trace: '§9.3 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Không phải nội dung tình dục; mức hở là chủ đề (TOP-1), không cấu thành policy.',
    severityTreatment: 'NO_ENVELOPE (ENV-7).', enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'EXP-ADULT-2', policy: 'ts.sexual.adult-content', kind: 'AMBIGUOUS',
    situation: 'Nội dung gợi cảm tự phát trong feed; không đọc được điều kiện hiển thị đã áp dụng hay chưa.',
    evidence: 'Setting** is decisive because the constitutive element is the **absence of the required presentation conditions',
    trace: 'SC-1 decisive_dimensions',
    expected: 'INDETERMINATE_CONTEXT',
    why: 'Bối cảnh hiển thị là chiều quyết định và không đọc được ⇒ CTX-1.',
    severityTreatment: 'NO_ENVELOPE (ENV-7).', enforcement: NONE,
    harness: { constitutive: 'TRUE', contextUnreadable: true },
  },
  {
    id: 'EXP-SEX-1', policy: 'ts.sexual.exploitation-nonconsent', kind: 'FALSE_POSITIVE',
    situation: 'Phóng sự về nạn phát tán ảnh riêng tư, có phỏng vấn người trong cuộc.',
    evidence: 'journalism', trace: '§9.3 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Báo chí nêu đích danh trong Does-not-govern.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ── Tự hại trên Explore ───────────────────────────────────────────────────
  {
    id: 'EXP-SH-1', policy: 'ts.selfharm.promotion', kind: 'FALSE_POSITIVE',
    situation: 'Clip kể lại hành trình vượt qua trầm cảm, kết bằng lời động viên.',
    evidence: 'recovery narrative', trace: '§9.1 Does not govern — explicitly and importantly',
    expected: 'NOT_APPLICABLE',
    why: 'Kể chuyện hồi phục nêu đích danh; yếu tố cấu thành là **thúc đẩy hướng tới người khác**.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'EXP-SH-2', policy: 'ts.selfharm.promotion', kind: 'AMBIGUOUS',
    situation: 'Caption buồn kèm hashtag mơ hồ; không rõ đang tâm sự hay đang cổ vũ người khác làm theo.',
    evidence: 'promotion or instruction directed at others', trace: '§9.1 Constitutive boundary',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Hướng của hành vi là yếu tố quyết định và chưa xác lập. Corpus cảnh báo rằng coi lời tâm sự là vi phạm **tự nó đã là một tổn hại lường trước được**.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },

  // ── Riêng tư trên Explore ─────────────────────────────────────────────────
  {
    id: 'EXP-PRIV-1', policy: 'ts.privacy.personal-information', kind: 'FALSE_POSITIVE',
    situation: 'Clip review quán quay lướt qua biển hiệu có số điện thoại và địa chỉ quán.',
    evidence: 'business contact details', trace: '§9.4 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Thông tin liên hệ doanh nghiệp nêu đích danh trong Does-not-govern.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'EXP-PRIV-2', policy: 'ts.privacy.personal-information', kind: 'POSITIVE',
    situation: 'Clip công khai địa chỉ nhà riêng và số điện thoại một cá nhân kèm lời kêu gọi "ghé thăm".',
    evidence: 'publishing private identifying information without consent', trace: '§9.4 Governs',
    expected: 'VIOLATION',
    why: 'Không có sự đồng ý và việc phơi bày tạo ra rủi ro tổn hại.',
    severityTreatment: 'Envelope S2–S4.', enforcement: NONE, harness: { constitutive: 'TRUE' },
  },

  // ── Repost / trích dẫn ────────────────────────────────────────────────────
  {
    id: 'EXP-REPOST-1', policy: 'ts.deception.harmful', kind: 'AMBIGUOUS',
    situation: 'User repost một clip tin đồn về an toàn thực phẩm, không thêm bình luận nào.',
    evidence: 'EXTERNAL_THIRD_PARTY', trace: '§13 content classes · B-5',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Nội dung do bên thứ ba tạo, và ý định của người chia sẻ không đọc được từ hành vi repost đơn thuần.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },
]);
