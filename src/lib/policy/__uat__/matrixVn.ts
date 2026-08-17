/**
 * VIETNAM REALITY UAT — the situations TappyAI will actually meet.
 *
 * ============================================================================
 * READ THIS BEFORE READING THE RESULTS
 * ============================================================================
 * These scenarios state WHAT THE CORPUS REQUIRES for real Vietnamese content.
 * They do NOT prove that TappyAI can recognise sarcasm, dialect, or a mangled
 * ASR transcript — no detector exists, and per-policy predicates are Product
 * content the corpus does not contain. What runs here is the classification
 * contract, given a stated constitutive result.
 *
 * So this file is an ACCEPTANCE STANDARD, not a capability report: any future
 * detector must land on these outcomes, and the ones marked
 * `constitutive: 'UNKNOWN'` are precisely the cases where a detector must say
 * "I cannot tell" instead of guessing.
 *
 * Every scenario cites the corpus verbatim; the audit asserts the quote exists.
 * Enforcement is NONE / NOT TESTED throughout.
 */

import type { UatScenario } from './matrix';

const NONE = 'NONE / NOT TESTED' as const;
const NR = 'Not reached — severity presupposes an established violation (SEV-9).';

export const UAT_MATRIX_VN: readonly UatScenario[] = Object.freeze([
  // ══ C. Food · cooking · agriculture — the biggest Vietnamese false-positive risk ══
  {
    id: 'VN-FOOD-1', policy: 'ts.violence.graphic-harm', kind: 'FALSE_POSITIVE',
    situation: 'Video làm tiết canh vịt: cắt tiết, hứng máu, đánh tiết. Quay cận cảnh, nhiều máu.',
    evidence: 'any food preparation', trace: '§9.1 Does not govern · §18 case 1',
    expected: 'NOT_APPLICABLE',
    why: 'Chế biến thức ăn được nêu đích danh trong Does-not-govern. Máu là chủ đề (TOP-1), không cấu thành policy.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-FOOD-2', policy: 'ts.animal.cruelty', kind: 'FALSE_POSITIVE',
    situation: 'Chủ quán livestream mổ lợn lúc 4h sáng để chuẩn bị hàng.',
    evidence: 'legitimate purpose, suffering not materially beyond it', trace: '§18 case 3',
    expected: 'NOT_APPLICABLE',
    why: 'Mục đích hợp pháp và mức chịu đựng không vượt quá mục đích ⇒ policy không cấu thành. Không cần "miễn trừ" vì chưa có gì cấu thành.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-FOOD-3', policy: 'ts.animal.cruelty', kind: 'FALSE_POSITIVE',
    situation: 'Clip trứng vịt lộn: bóc vỏ, thấy rõ phôi.',
    evidence: 'Nothing constituted', trace: '§18 case 2',
    expected: 'NOT_APPLICABLE',
    why: 'Corpus xử lý trực tiếp case này: không có gì cấu thành. Món ăn truyền thống không phải hành vi tàn ác.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-FOOD-4', policy: 'ts.animal.cruelty', kind: 'AMBIGUOUS',
    situation: 'Clip 8 giây một con vật kêu, không rõ đang giết mổ hay hành hạ, không caption.',
    evidence: 'gratuitousness relative to purpose', trace: '§9.5 Constitutive boundary',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Mục đích là chiều quyết định duy nhất của policy này và nó không đọc được. Không kết luận, cũng không tha bổng.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'VN-FOOD-5', policy: 'ts.danger.harmful-activity', kind: 'FALSE_POSITIVE',
    situation: 'Nông dân hướng dẫn pha thuốc trừ sâu đúng liều, có đồ bảo hộ, nhắc kỹ an toàn.',
    evidence: 'safety education', trace: '§9.1 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Giáo dục an toàn nằm trong Does-not-govern; không có yếu tố khuyến khích bắt chước.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-VET-1', policy: 'ts.animal.cruelty', kind: 'FALSE_POSITIVE',
    situation: 'Bác sĩ thú y quay video mổ lấy dị vật cho chó, có máu và vết mổ.',
    evidence: 'legitimate purpose', trace: '§9.5 Governs',
    expected: 'NOT_APPLICABLE',
    why: 'Điều trị thú y là mục đích hợp pháp; đau đớn không vượt quá mục đích ⇒ không cấu thành.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ══ G. Ẩn dụ · thành ngữ · nói quá ══
  {
    id: 'VN-IDIOM-1', policy: 'ts.violence.incitement-threats', kind: 'FALSE_POSITIVE',
    situation: '"Trận này bọn tao huỷ diệt tụi nó luôn" — bình luận trước trận bóng.',
    evidence: 'gaming and sports idiom', trace: '§9.1 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Thành ngữ thể thao nêu đích danh trong Does-not-govern; không có độ khả tín và không có đối tượng bạo lực.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-IDIOM-2', policy: 'ts.violence.incitement-threats', kind: 'FALSE_POSITIVE',
    situation: '"Đập chết cái app này luôn cho rồi" — user bực vì app lag.',
    evidence: 'hyperbole', trace: '§9.1 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Nói quá, và đối tượng là phần mềm chứ không phải người. Constitutive boundary đòi **cả** độ khả tín **và** một đối tượng.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-IDIOM-3', policy: 'ts.violence.incitement-threats', kind: 'FALSE_POSITIVE',
    situation: '"Ăn tươi nuốt sống đối thủ" trong bài chia sẻ kinh nghiệm bán hàng.',
    evidence: 'hyperbole', trace: '§9.1 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Thành ngữ cạnh tranh thương mại, không phải lời đe doạ. Không có đối tượng bạo lực.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-IDIOM-4', policy: 'ts.violence.incitement-threats', kind: 'AMBIGUOUS',
    situation: '"Tao xử nó" — một câu, không đối tượng, không ngữ cảnh trước sau.',
    evidence: 'anger without a target', trace: '§9.1 Does not govern',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: '"Xử" trong tiếng Việt vừa là bạo lực vừa là "giải quyết". Yếu tố quyết định không xác lập được ⇒ không kết luận.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'VN-IDIOM-5', policy: 'ts.danger.harmful-activity', kind: 'FALSE_POSITIVE',
    situation: '"Uống ly này là bay luôn" — nói về ly cà phê đậm.',
    evidence: 'lawful activity that is merely dangerous', trace: '§9.1 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Ẩn dụ đời thường, không phải chỉ dẫn hoạt động nguy hiểm, không có khuyến khích bắt chước.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ══ B. Vùng miền · tiếng lóng · A. tiếng Việt đời thường ══
  {
    id: 'VN-DIALECT-1', policy: 'ts.harassment.targeted', kind: 'AMBIGUOUS',
    situation: 'Bình luận tiếng Nghệ An đặc sệt, nhiều từ địa phương; không rõ đang trêu thân mật hay xúc phạm.',
    evidence: 'dialect/regional variety', trace: '§6.1 Cultural & linguistic · CTX-1',
    expected: 'INDETERMINATE_CONTEXT',
    why: 'Ngữ cảnh văn hoá/ngôn ngữ là thứ quyết định và không đọc được ⇒ CTX-1 cho INDETERMINATE_CONTEXT, không bao giờ là vi phạm.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'TRUE', contextUnreadable: true },
  },
  {
    id: 'VN-DIALECT-2', policy: 'ts.harassment.targeted', kind: 'FALSE_POSITIVE',
    situation: 'Hai người bạn miền Nam gọi nhau "thằng quỷ", "con khùng" trong comment đùa.',
    evidence: 'humour convention', trace: '§6.1 Cultural & linguistic',
    expected: 'NOT_APPLICABLE',
    why: 'Quy ước hài hước giữa bạn bè; không có lạm dụng hướng vào người theo nghĩa cấu thành.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-NODAU-1', policy: 'ts.harassment.targeted', kind: 'AMBIGUOUS',
    situation: 'Comment viết không dấu, viết tắt: "may bi gi vay ba", không rõ nghĩa.',
    evidence: 'euphemism', trace: '§6.1 Cultural & linguistic · CTX-1',
    expected: 'INDETERMINATE_CONTEXT',
    why: 'Không dấu làm câu đa nghĩa; ngữ cảnh ngôn ngữ quyết định mà không đọc được.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'TRUE', contextUnreadable: true },
  },
  {
    id: 'VN-CULT-1', policy: 'ts.violence.graphic-harm', kind: 'FALSE_POSITIVE',
    situation: 'Ảnh cúng tất niên có gà luộc nguyên con, tiết canh, mâm cỗ.',
    evidence: 'culturally specific practice', trace: '§6.1 Cultural & linguistic',
    expected: 'NOT_APPLICABLE',
    why: 'Thực hành văn hoá đặc thù; không tôn vinh, không lấy gây sốc làm chính.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ══ D. Kinh doanh · thương mại ══
  {
    id: 'VN-BIZ-1', policy: 'ts.harassment.targeted', kind: 'FALSE_POSITIVE',
    situation: 'Review 1 sao: "Quán bẩn, phục vụ hỗn, không bao giờ quay lại."',
    evidence: 'negative reviews', trace: '§9.4 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Đánh giá tiêu cực nêu đích danh trong Does-not-govern. Nhắm vào dịch vụ, không phải vào con người.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-BIZ-2', policy: 'ts.harassment.targeted', kind: 'FALSE_POSITIVE',
    situation: 'Khách tức giận tố quán tính sai tiền, gọi tên quán, đăng hoá đơn.',
    evidence: 'criticism of ideas, institutions, products, governments or public conduct',
    trace: '§9.4 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Phê phán cơ sở kinh doanh và hành vi dịch vụ, không phải lạm dụng nhắm vào cá nhân.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-BIZ-3', policy: 'ts.harassment.targeted', kind: 'AMBIGUOUS',
    situation: 'Khách tố quán nhưng chuyển sang chửi đích danh chủ quán bằng tên riêng; không rõ có kéo dài hay phối hợp không.',
    evidence: 'requires an **identifiable target**', trace: '§9.4 Constitutive boundary',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Ranh giới giữa phê phán công việc và lạm dụng cá nhân là chỗ VP-1 làm việc nặng nhất; hồ sơ chưa đủ để kết luận.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'VN-BIZ-4', policy: 'ts.fraud.scam', kind: 'FALSE_POSITIVE',
    situation: 'Bài bán hàng: "Giá sốc, chỉ hôm nay, số lượng có hạn."',
    evidence: 'advertising', trace: '§9.6 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Quảng cáo nằm trong Does-not-govern. Không có ý định chiếm đoạt tiền/tài sản bằng lừa dối.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-BIZ-5', policy: 'ts.fraud.scam', kind: 'FALSE_POSITIVE',
    situation: 'Hai chủ shop tranh cãi công khai về việc bên kia phá giá.',
    evidence: 'disputed business practice', trace: '§9.6 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Tranh chấp thực hành kinh doanh nêu đích danh trong Does-not-govern.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-BIZ-6', policy: 'ts.platform.abuse-manipulation', kind: 'FALSE_POSITIVE',
    situation: 'Một quán mới nổi tiếng nhanh, hàng trăm review thật trong một tuần.',
    evidence: 'organic popularity', trace: '§9.6 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Nổi tiếng tự nhiên nêu đích danh trong Does-not-govern.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-BIZ-7', policy: 'ts.platform.abuse-manipulation', kind: 'AMBIGUOUS',
    situation: 'Nhiều tài khoản cùng đăng review giống nhau cho một quán trong 10 phút.',
    evidence: 'multiple accounts for legitimate purposes', trace: '§9.6 Does not govern',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Trùng thời điểm chưa chứng minh phối hợp giả mạo; tính xác thực là yếu tố quyết định và chưa xác lập.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'VN-BIZ-8', policy: 'ts.deception.harmful', kind: 'FALSE_POSITIVE',
    situation: 'Quảng cáo mỹ phẩm nói "trắng da sau 7 ngày" — cường điệu tiếp thị.',
    evidence: 'marketing and promotional expression', trace: '§9.6 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Cách nói tiếp thị nằm trong Does-not-govern; thiếu ít nhất một trong bốn yếu tố hội đủ.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ══ E. Mạng xã hội · nội dung bên thứ ba ══
  {
    id: 'VN-SOCIAL-1', policy: 'ts.violence.graphic-harm', kind: 'FALSE_POSITIVE',
    situation: 'User repost lại clip thời sự về tai nạn giao thông, kèm caption "đi đứng cẩn thận".',
    evidence: 'EXTERNAL_THIRD_PARTY', trace: '§13 content classes · B-5',
    expected: 'NOT_APPLICABLE',
    why: 'Nội dung do bên thứ ba tạo, mục đích cảnh báo; không tôn vinh, không lấy gây sốc làm chính.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-SOCIAL-2', policy: 'ts.violence.incitement-threats', kind: 'FALSE_POSITIVE',
    situation: 'Nhà báo trích nguyên văn lời đe doạ của một người khác để đưa tin.',
    evidence: 'reporting on threats made by others', trace: '§9.1 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Đưa tin về lời đe doạ của người khác nêu đích danh trong Does-not-govern. Trích dẫn không phải ý định của người trích.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-SOCIAL-3', policy: 'ts.deception.harmful', kind: 'FALSE_POSITIVE',
    situation: 'Meme chế ảnh lãnh đạo doanh nghiệp với câu nói bịa rõ ràng để đùa.',
    evidence: 'satire and parody', trace: '§9.6 Does not govern · §18 case 11',
    expected: 'NOT_APPLICABLE',
    why: 'Châm biếm/nhại nêu đích danh; yếu tố ý định lừa dối không thành lập.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-SOCIAL-4', policy: 'ts.violence.graphic-harm', kind: 'AMBIGUOUS',
    situation: 'Ảnh mạnh xuất hiện trong feed, không rõ user tự bấm vào hay tự động phát.',
    evidence: 'INITIATION_UNAVAILABLE', trace: '§6.1 viewing initiation · CTX-1',
    expected: 'INDETERMINATE_CONTEXT',
    why: 'Không ghi nhận được sự kiện hiển thị ⇒ CTX-1 cho INDETERMINATE_CONTEXT.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'TRUE', contextUnreadable: true },
  },

  // ══ F. Báo chí · giáo dục · y tế ══
  {
    id: 'VN-NEWS-1', policy: 'ts.violence.graphic-harm', kind: 'AMBIGUOUS',
    situation: 'Phóng sự chiến tranh có hình ảnh thi thể, đăng bởi toà soạn.',
    evidence: 'behavior present but purpose is journalistic, shock-primacy absent', trace: '§18 case 6',
    expected: 'APPLICABLE_NO_VIOLATION',
    why: 'Corpus giải trực tiếp: hành vi hiện diện nhưng mục đích báo chí ⇒ không vi phạm, và vẫn được ghi nhận (OUT-2).',
    severityTreatment: 'Không tới — ANV không phải vi phạm.', enforcement: NONE,
    harness: { constitutive: 'TRUE', defeat: 'TRUE' },
  },
  {
    id: 'VN-MED-1', policy: 'ts.sexual.adult-content', kind: 'FALSE_POSITIVE',
    situation: 'Bác sĩ đăng ảnh giải phẫu vùng kín để giảng bài cho sinh viên y.',
    evidence: 'medical and anatomical content', trace: '§9.3 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Nội dung y khoa/giải phẫu nêu đích danh; mức lộ liễu là chủ đề (TOP-1), không cấu thành.',
    severityTreatment: 'NO_ENVELOPE (ENV-7).', enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-MED-2', policy: 'ts.violence.graphic-harm', kind: 'FALSE_POSITIVE',
    situation: 'Video phẫu thuật nội soi trong khoá đào tạo y khoa.',
    evidence: 'medical/surgical', trace: '§9.1 Does not govern · §18 case 5',
    expected: 'NOT_APPLICABLE',
    why: 'Y khoa/phẫu thuật nêu đích danh; không tôn vinh, không gây sốc làm chính.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-EDU-1', policy: 'ts.child.sexualization', kind: 'FALSE_POSITIVE',
    situation: 'Bài giảng giáo dục giới tính cho học sinh cấp 2, có hình minh hoạ cơ thể.',
    evidence: 'imagery of minors', trace: 'SC-1 does_not_govern',
    expected: 'NOT_APPLICABLE',
    why: 'Hình ảnh giáo dục về trẻ vị thành niên nằm trong does_not_govern; ranh giới cấu thành đặt ở "trình bày mang tính tình dục hoá".',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-EDU-2', policy: 'ts.child.abuse-harm', kind: 'FALSE_POSITIVE',
    situation: 'Phóng sự về bạo hành trẻ em ở một cơ sở trông trẻ, nhằm tố cáo.',
    evidence: 'documentation for protective, journalistic or educational purposes',
    trace: 'SC-1 does_not_govern',
    expected: 'NOT_APPLICABLE',
    why: 'Ghi nhận nhằm bảo vệ/báo chí nêu đích danh. Ghi nhận hành vi bạo hành không phải là hành vi bạo hành.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-HEALTH-1', policy: 'ts.selfharm.promotion', kind: 'FALSE_POSITIVE',
    situation: 'Bài truyền thông phòng chống tự tử, có nêu dấu hiệu cảnh báo.',
    evidence: 'prevention and awareness', trace: '§9.1 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Phòng ngừa và nâng cao nhận thức nêu đích danh; yếu tố cấu thành là **thúc đẩy hướng tới người khác**.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-HEALTH-2', policy: 'ts.selfharm.promotion', kind: 'FALSE_POSITIVE',
    situation: 'User nhắn: "Dạo này mình mệt quá, không muốn sống nữa" — đang cần giúp đỡ.',
    evidence: 'Support-seeking is `APPLICABLE_NO_VIOLATION`, response-warranted',
    trace: '§9.1 OUT-3 · §18 case 21',
    expected: 'APPLICABLE_NO_VIOLATION',
    why: 'Corpus gọi tên kết quả này và cảnh báo rằng coi lời tâm sự là vi phạm **tự nó đã là một tổn hại lường trước được**.',
    severityTreatment: 'Không tới — ANV không phải vi phạm.', enforcement: NONE,
    harness: { constitutive: 'TRUE', defeat: 'TRUE', responseWarranted: true },
  },

  // ══ H. Ngữ cảnh hội thoại ══
  {
    id: 'VN-CTX-1', policy: 'ts.violence.incitement-threats', kind: 'AMBIGUOUS',
    situation: 'Một câu trích giữa hội thoại: "Tối nay tao qua nhà nó." Không có tin nhắn trước/sau.',
    evidence: 'anger without a target', trace: '§9.1 Does not govern · CTX-1',
    expected: 'INDETERMINATE_CONTEXT',
    why: 'Ý nghĩa phụ thuộc hoàn toàn vào đoạn hội thoại bị thiếu ⇒ ngữ cảnh quyết định mà không đọc được.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'TRUE', contextUnreadable: true },
  },
  {
    id: 'VN-CTX-2', policy: 'ts.harassment.targeted', kind: 'AMBIGUOUS',
    situation: 'Câu nghe vô hại "Anh biết em làm ở đâu rồi nhé" — chỉ nguy hiểm nếu biết các tin nhắn trước.',
    evidence: 'requires an **identifiable target**', trace: '§9.4 Constitutive boundary',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Ý định chỉ hiện ra khi có chuỗi hội thoại; hồ sơ hiện tại không đủ để kết luận theo cả hai hướng.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'VN-CTX-3', policy: 'ts.child.grooming', kind: 'AMBIGUOUS',
    situation: 'Một tin nhắn thân thiện từ huấn luyện viên gửi học sinh; không có lịch sử hội thoại.',
    evidence: 'absent an established pattern', trace: 'SC-1 does_not_govern',
    expected: 'NOT_APPLICABLE',
    why: 'Một tin nhắn đơn lẻ, không có mẫu hình đã xác lập ⇒ policy không cấu thành. Nêu đích danh trong does_not_govern.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ══ I. Giọng nói · ASR ══
  {
    id: 'VN-ASR-1', policy: 'ts.violence.incitement-threats', kind: 'AMBIGUOUS',
    situation: 'ASR nghe nhầm "giết deal" thành "giết dê"; bản ghi bị cắt giữa câu.',
    evidence: 'anger without a target', trace: '§4 INSUFFICIENT_EVIDENCE · OUT-1',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Bản ghi không đáng tin làm yếu tố cấu thành không xác lập được. Sai sót nhận dạng giọng nói không bao giờ được thành vi phạm.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'VN-ASR-2', policy: 'ts.harassment.targeted', kind: 'AMBIGUOUS',
    situation: 'Ghi âm nhiều người nói chồng tiếng, không phân biệt được ai nói câu nào.',
    evidence: 'dialect/regional variety', trace: '§6.1 Cultural & linguistic · CTX-1',
    expected: 'INDETERMINATE_CONTEXT',
    why: 'Không xác định được người nói ⇒ không xác định được đối tượng và người thực hiện; ngữ cảnh không đọc được.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'TRUE', contextUnreadable: true },
  },
  {
    id: 'VN-ASR-3', policy: 'ts.danger.harmful-activity', kind: 'AMBIGUOUS',
    situation: 'Bản ghi thiếu dấu: "cho no chay di" — không rõ "cháy" hay "chạy".',
    evidence: 'documentation of risk', trace: '§9.1 Does not govern · CTX-1',
    expected: 'INDETERMINATE_CONTEXT',
    why: 'Thiếu dấu khiến câu đa nghĩa; ngữ cảnh ngôn ngữ quyết định và không đọc được.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'TRUE', contextUnreadable: true },
  },

  // ══ J. Đa ngữ · code-switching ══
  {
    id: 'VN-MIX-1', policy: 'ts.violence.incitement-threats', kind: 'FALSE_POSITIVE',
    situation: '"Tối nay mình kill cái deadline này" — Việt pha Anh trong nhóm công việc.',
    evidence: 'code-switching', trace: '§6.1 Cultural & linguistic',
    expected: 'NOT_APPLICABLE',
    why: 'Chuyển mã ngôn ngữ; "kill" ở đây là hoàn thành công việc, không có đối tượng bạo lực.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-MIX-2', policy: 'ts.fraud.scam', kind: 'FALSE_POSITIVE',
    situation: 'Tên thương hiệu tiếng Anh nghe giống từ nhạy cảm, dùng trong bài bán hàng bình thường.',
    evidence: 'legitimate commerce', trace: '§9.6 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Thương mại hợp pháp; tên thương hiệu là chủ đề, không phải yếu tố cấu thành.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ══ K. Trẻ em · gia đình ══
  {
    id: 'VN-KID-1', policy: 'ts.child.sexualization', kind: 'FALSE_POSITIVE',
    situation: 'Ảnh trẻ con tắm biển cùng gia đình dịp hè.',
    evidence: 'imagery of minors', trace: 'SC-1 does_not_govern',
    expected: 'NOT_APPLICABLE',
    why: 'Ảnh gia đình thông thường nằm trong does_not_govern; ranh giới cấu thành đặt ở trình bày mang tính tình dục hoá.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-KID-2', policy: 'ts.child.sexual-exploitation', kind: 'FALSE_POSITIVE',
    situation: 'Ảnh khám nhi khoa trong hồ sơ bệnh án.',
    evidence: 'clinical or medical content', trace: 'SC-1 does_not_govern',
    expected: 'NOT_APPLICABLE',
    why: 'Nội dung lâm sàng/y khoa nêu đích danh trong does_not_govern.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-KID-3', policy: 'ts.child.abuse-harm', kind: 'AMBIGUOUS',
    situation: 'Clip trẻ khóc khi bị người lớn quát; không rõ tuổi, không rõ quan hệ.',
    evidence: 'AGE_UNCERTAIN', trace: '§6.1 age context · CS-3',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Tuổi là yếu tố quyết định và chưa xác lập; mọi trạng thái tuổi chưa rõ đều cho kết quả cuối, không vi phạm.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },

  // ══ L. Riêng tư · định danh ══
  {
    id: 'VN-PRIV-1', policy: 'ts.privacy.personal-information', kind: 'FALSE_POSITIVE',
    situation: 'Bài review đăng kèm số điện thoại và địa chỉ quán ăn.',
    evidence: 'business contact details', trace: '§9.4 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Thông tin liên hệ doanh nghiệp nêu đích danh trong Does-not-govern.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-PRIV-2', policy: 'ts.privacy.personal-information', kind: 'FALSE_POSITIVE',
    situation: 'User tự đăng số điện thoại của chính mình để nhận đơn hàng.',
    evidence: 'self-disclosure', trace: '§9.4 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Tự tiết lộ nêu đích danh; chiều quyết định là sự đồng ý và tự-tiết-lộ so với tiết lộ người khác.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-PRIV-3', policy: 'ts.privacy.personal-information', kind: 'AMBIGUOUS',
    situation: 'Ảnh chụp màn hình nhóm chat có tên và số của người khác; không rõ họ có đồng ý không.',
    evidence: 'Actor & target is decisive on **consent** and on self-disclosure versus disclosure of another',
    trace: 'SC-1 decisive_dimensions',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Sự đồng ý là yếu tố quyết định và chưa xác lập.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'UNKNOWN' },
  },

  // ══ M. Chính trị · phê phán ══
  {
    id: 'VN-POL-1', policy: 'ts.harassment.targeted', kind: 'FALSE_POSITIVE',
    situation: 'Bài phê phán gay gắt một chính sách mới về thuế.',
    evidence: 'criticism of ideas, institutions, products, governments or public conduct',
    trace: '§9.4 Does not govern · §18 case 9',
    expected: 'NOT_APPLICABLE',
    why: 'Phê phán chính sách và thể chế nêu đích danh trong Does-not-govern. VP-1 tồn tại để bảo vệ đúng loại nội dung này.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-POL-2', policy: 'ts.deception.harmful', kind: 'FALSE_POSITIVE',
    situation: 'Tranh luận chính trị trên mạng, hai bên đưa cách hiểu khác nhau về một sự kiện lịch sử.',
    evidence: 'historical interpretation', trace: '§9.6 Does not govern · §18 case 7',
    expected: 'NOT_APPLICABLE',
    why: 'Diễn giải lịch sử và tranh luận chính trị đều nằm trong Does-not-govern.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-POL-3', policy: 'ts.deception.harmful', kind: 'FALSE_POSITIVE',
    situation: 'Một bác sĩ nêu quan điểm thiểu số về một phác đồ điều trị.',
    evidence: 'minority scientific positions', trace: '§9.6 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Quan điểm khoa học thiểu số nêu đích danh trong Does-not-govern.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'VN-POL-4', policy: 'ts.harassment.targeted', kind: 'FALSE_POSITIVE',
    situation: 'Chế ảnh châm biếm một người nổi tiếng trong vai trò công vụ của họ.',
    evidence: 'satire of public figures in their public role', trace: '§9.4 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Châm biếm người của công chúng trong vai trò công vụ nêu đích danh.',
    severityTreatment: NR, enforcement: NONE, harness: { constitutive: 'FALSE' },
  },

  // ══ Positive — phải bắt được, không được bỏ sót ══
  {
    id: 'VN-POS-1', policy: 'ts.fraud.scam', kind: 'POSITIVE',
    situation: 'Trang giả ngân hàng gửi qua tin nhắn, yêu cầu nhập mã OTP để "xác minh tài khoản".',
    evidence: 'deceptive schemes to obtain money, credentials or assets', trace: '§9.6 Governs',
    expected: 'VIOLATION',
    why: 'Ý định chiếm đoạt thông tin đăng nhập bằng lừa dối là yếu tố cấu thành.',
    severityTreatment: 'Envelope S2–S3 giới hạn mức độ, không phải là mức độ (ENV-1/ENV-2).',
    enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
  {
    id: 'VN-POS-2', policy: 'ts.violence.incitement-threats', kind: 'POSITIVE',
    situation: 'Bài đăng nêu tên, địa chỉ một người và kêu gọi người khác tới "xử" họ tối nay.',
    evidence: 'credible threats of violence against identifiable people or groups', trace: '§9.1 Governs',
    expected: 'VIOLATION',
    why: 'Có cả độ khả tín và đối tượng xác định được — Constitutive boundary đòi cả hai.',
    severityTreatment: 'Envelope S3–S4.', enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
  {
    id: 'VN-POS-3', policy: 'ts.platform.abuse-manipulation', kind: 'POSITIVE',
    situation: 'Một nhóm dùng nhiều tài khoản để báo cáo hàng loạt quán đối thủ nhằm hạ uy tín.',
    evidence: 'abuse of the reporting system itself', trace: '§9.6 Governs',
    expected: 'VIOLATION',
    why: 'Lạm dụng chính hệ thống báo cáo, có tính trả đũa/phối hợp — nêu đích danh là cấu thành.',
    severityTreatment: 'Envelope S1–S4.', enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
  {
    id: 'VN-POS-4', policy: 'ts.animal.cruelty', kind: 'POSITIVE',
    situation: 'Clip hành hạ chó để câu view, có tiếng cười và caption khoe.',
    evidence: 'for entertainment or spectacle', trace: '§9.5 Governs',
    expected: 'VIOLATION',
    why: 'Gây đau đớn để giải trí/trình diễn — vượt quá mọi mục đích hợp pháp.',
    severityTreatment: 'Envelope S1–S4.', enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
]);
