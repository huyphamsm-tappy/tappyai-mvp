import { LADDER, RULE_GROUP_IDS, RULE_GROUPS, type MaxPenalty, type RuleGroupId } from '@/lib/safety/communityRules'

// Copy of /community-guidelines (owner 01/10) — DRAFT: «đề xuất, chờ Huy duyệt chữ». Written in our own words (not copied from any
// other platform). Needs a review by someone who knows Vietnamese law, including the removal of content on the request of a
// competent authority, before it is treated as final. The numbers come from src/lib/safety/communityRules.ts (one source).

interface Rule { name: string; what: string; ex: [string, string, string] }

const VI: Record<RuleGroupId, Rule> = {
  spam: { name: 'Spam', what: 'Nội dung lặp lại hoặc đăng hàng loạt chỉ để quảng cáo, kéo tương tác giả hoặc dẫn người dùng đi nơi khác.', ex: ['Đăng cùng một quảng cáo dưới hàng loạt bài viết.', 'Mua bán lượt thích, lượt theo dõi hoặc đánh giá giả.', 'Chèn liên kết lạ không liên quan vào bình luận.'] },
  harassment: { name: 'Quấy rối và bắt nạt', what: 'Nhắm vào một người hoặc một nhóm để hạ nhục, đe doạ, làm họ sợ hoặc làm họ rời đi.', ex: ['Chửi bới, nhục mạ, nhắn tin quấy rầy liên tục.', 'Đe doạ làm hại một người cụ thể.', 'Kêu gọi người khác cùng tấn công một tài khoản.'] },
  hate: { name: 'Thù ghét', what: 'Kích động hoặc hạ thấp con người vì những đặc điểm như dân tộc, tôn giáo, giới tính, khuyết tật hay xu hướng tính dục.', ex: ['Dùng từ miệt thị nhắm vào một nhóm người.', 'Cho rằng cả một nhóm người là thấp kém hoặc nguy hiểm.', 'Cổ vũ phân biệt đối xử hoặc loại trừ một nhóm người.'] },
  sexual: { name: 'Nội dung nhạy cảm / tình dục', what: 'Nội dung khiêu dâm hoặc tình dục lộ liễu, hoặc đăng ảnh, video riêng tư của người khác khi họ không đồng ý.', ex: ['Ảnh hoặc video khiêu dâm.', 'Gạ gẫm tình dục hoặc ép người khác gửi ảnh nhạy cảm.', 'Đăng ảnh riêng tư của người khác để trả thù hoặc tống tiền.'] },
  violence_selfharm: { name: 'Bạo lực và tự hại', what: 'Cổ vũ, đe doạ hoặc mô tả bạo lực nhằm gây sợ hãi, hoặc khuyến khích người khác tự làm đau bản thân.', ex: ['Đe doạ giết hoặc đánh người khác.', 'Hướng dẫn hoặc cổ vũ tự tử, tự làm đau mình.', 'Đăng hình ảnh bạo lực để câu sự chú ý hoặc gây sốc.'] },
  scam_misinfo: { name: 'Lừa đảo và thông tin sai gây hại', what: 'Lừa người khác lấy tiền hoặc thông tin, hoặc lan truyền thông tin sai mà người đọc có thể bị thiệt hại thật nếu tin theo.', ex: ['Giả danh ngân hàng hoặc cơ quan để xin mã OTP, mật khẩu.', 'Mời đầu tư hứa lãi cao chắc chắn.', 'Tin sai về thuốc, y tế hoặc thiên tai có thể gây nguy hiểm.'] },
  impersonation: { name: 'Mạo danh', what: 'Giả làm một người, một thương hiệu hoặc một tổ chức khác để đánh lừa người dùng.', ex: ['Lấy tên và ảnh của người khác để đăng bài hoặc nhắn tin.', 'Giả làm nhân viên của TappyAI hoặc của một cửa hàng.', 'Tạo tài khoản fan giả làm người nổi tiếng nhưng không ghi rõ.'] },
  ip_privacy: { name: 'Bản quyền và quyền riêng tư', what: 'Dùng tác phẩm của người khác khi chưa được phép, hoặc đưa thông tin cá nhân của người khác lên mạng.', ex: ['Đăng nhạc, phim hoặc ảnh của người khác như của mình.', 'Đăng số điện thoại, địa chỉ nhà hoặc giấy tờ của người khác.', 'Chụp, quay người khác ở nơi riêng tư rồi đăng.'] },
  illegal_goods: { name: 'Hàng và dịch vụ trái pháp luật', what: 'Mua bán, rao hoặc hướng dẫn những thứ mà pháp luật Việt Nam cấm.', ex: ['Rao bán ma tuý, vũ khí hoặc chất cấm.', 'Bán hàng giả, hàng nhái hoặc giấy tờ giả.', 'Cung cấp dịch vụ cờ bạc, hack tài khoản hoặc rửa tiền.'] },
  child_safety: { name: 'An toàn trẻ em', what: 'Bất kỳ nội dung hay hành vi nào đặt trẻ em vào nguy hiểm hoặc xâm hại trẻ em. Đây là nhóm nghiêm trọng nhất và luôn được xem xét trước.', ex: ['Nội dung tình dục có liên quan đến trẻ em.', 'Tiếp cận, dụ dỗ hoặc gạ gẫm trẻ em.', 'Đăng ảnh hoặc thông tin của trẻ em để trục lợi hoặc làm hại.'] },
}
const EN: Record<RuleGroupId, Rule> = {
  spam: { name: 'Spam', what: 'Repetitive or mass-posted content meant only to advertise, fake engagement, or pull people elsewhere.', ex: ['Posting the same ad under many posts.', 'Buying or selling likes, follows or fake reviews.', 'Dropping unrelated links into comments.'] },
  harassment: { name: 'Harassment and bullying', what: 'Targeting a person or group to humiliate, threaten, scare, or drive them away.', ex: ['Insults, abuse, or constant unwanted messages.', 'Threatening to harm a specific person.', 'Calling on others to pile onto an account.'] },
  hate: { name: 'Hate', what: 'Attacking or demeaning people because of traits such as ethnicity, religion, sex, disability or sexual orientation.', ex: ['Using slurs aimed at a group.', 'Claiming a whole group is inferior or dangerous.', 'Promoting discrimination against, or exclusion of, a group.'] },
  sexual: { name: 'Sensitive / sexual content', what: 'Pornographic or sexually explicit content, or sharing someone’s private images or video without their consent.', ex: ['Pornographic photos or video.', 'Sexual solicitation, or pressuring someone to send intimate images.', 'Posting someone’s private images as revenge or to blackmail them.'] },
  violence_selfharm: { name: 'Violence and self-harm', what: 'Promoting, threatening or depicting violence to scare people, or encouraging others to hurt themselves.', ex: ['Threatening to kill or beat someone.', 'Instructions for, or encouragement of, suicide or self-harm.', 'Posting violent images to shock or get attention.'] },
  scam_misinfo: { name: 'Scams and harmful misinformation', what: 'Tricking people out of money or information, or spreading falsehoods that could really hurt anyone who believes them.', ex: ['Posing as a bank or agency to get OTP codes or passwords.', 'Investment offers promising guaranteed high returns.', 'False claims about medicine, health or disasters that could put people at risk.'] },
  impersonation: { name: 'Impersonation', what: 'Pretending to be another person, brand or organization to mislead people.', ex: ['Using someone else’s name and photo to post or message.', 'Pretending to be TappyAI staff or a shop.', 'A fake fan account posing as a public figure without saying so.'] },
  ip_privacy: { name: 'Copyright and privacy', what: 'Using someone’s work without permission, or putting other people’s personal information online.', ex: ['Posting someone else’s music, film or photos as your own.', 'Posting someone’s phone number, home address or ID documents.', 'Filming or photographing people in private places and posting it.'] },
  illegal_goods: { name: 'Illegal goods and services', what: 'Selling, advertising or explaining how to get things Vietnamese law forbids.', ex: ['Selling drugs, weapons or banned substances.', 'Selling counterfeit goods or forged documents.', 'Offering gambling, account hacking or money laundering.'] },
  child_safety: { name: 'Child safety', what: 'Any content or behaviour that puts a child in danger or abuses a child. This is the most serious group and is always reviewed first.', ex: ['Sexual content involving children.', 'Approaching, grooming or soliciting a child.', 'Posting a child’s photo or details to exploit or harm them.'] },
}

const PENALTY_VI: Record<MaxPenalty, string> = { warning: 'cảnh cáo', strike: 'gỡ nội dung và 1 strike', restrict: 'hạn chế đăng bài và bình luận có thời hạn', ban: 'khoá tài khoản' }
const PENALTY_EN: Record<MaxPenalty, string> = { warning: 'a warning', strike: 'removal and 1 strike', restrict: 'a time-limited restriction on posting and commenting', ban: 'locking the account' }
const SEV_VI = { 1: 'thấp', 2: 'vừa', 3: 'nghiêm trọng' } as const
const SEV_EN = { 1: 'low', 2: 'medium', 3: 'serious' } as const

function build(lang: 'vi' | 'en'): Record<string, string> {
  const T = lang === 'vi' ? VI : EN
  const out: Record<string, string> = {}
  const sevRange = (id: RuleGroupId) => { const g = RULE_GROUPS[id]; const S = lang === 'vi' ? SEV_VI : SEV_EN; return g.maxSeverity > g.defaultSeverity ? `${S[g.defaultSeverity]} đến ${S[g.maxSeverity]}` : S[g.defaultSeverity] }
  for (const id of RULE_GROUP_IDS) {
    const r = T[id]; const g = RULE_GROUPS[id]; const k = `legal.community.r.${id}`
    const sev = lang === 'vi' ? sevRange(id) : sevRange(id).replace(' đến ', ' to ')
    out[`${k}.heading`] = r.name
    out[`${k}.lead`] = r.what
    out[`${k}.b1`] = r.ex[0]; out[`${k}.b2`] = r.ex[1]; out[`${k}.b3`] = r.ex[2]
    out[`${k}.note`] = lang === 'vi'
      ? `Mức nghiêm trọng: ${sev}. Hình phạt tối đa: ${PENALTY_VI[g.maxPenalty]}. Thời hạn xem xét mục tiêu: ${g.targetHours} giờ.`
      : `Severity: ${sev}. Highest penalty: ${PENALTY_EN[g.maxPenalty]}. Target time to a decision: ${g.targetHours} hours.`
  }
  const d1 = LADDER.strikeExpiryDays[1], d2 = LADDER.strikeExpiryDays[2]
  if (lang === 'vi') Object.assign(out, {
    'legal.community.title': 'Quy tắc cộng đồng',
    'legal.community.effective': 'Bản đề xuất tháng 10 năm 2026 — đang chờ chủ sản phẩm duyệt chữ.',
    'legal.community.intro.heading': '1. Vì sao có quy tắc',
    'legal.community.intro.p1': 'TappyAI là nơi mọi người chia sẻ trải nghiệm thật. Các quy tắc dưới đây giúp nơi này an toàn, đáng tin và công bằng. Chúng áp dụng cho bài viết, bình luận, hồ sơ và tin nhắn.',
    'legal.community.reports.heading': '2. Báo cáo được xử lý thế nào',
    'legal.community.reports.lead': 'Khi bạn báo cáo một bài viết, bình luận hoặc người dùng:',
    'legal.community.reports.b1': 'Báo cáo chỉ đưa nội dung vào hàng chờ xem xét. Số lượng báo cáo không bao giờ tự động gỡ nội dung, ẩn nội dung hay phạt ai.',
    'legal.community.reports.b2': 'Một người xem xét nội dung theo đúng các quy tắc dưới đây rồi mới quyết định.',
    'legal.community.reports.b3': 'Bạn có thể ẩn nội dung đó cho riêng mình ngay sau khi báo cáo; người khác vẫn thấy nó cho đến khi có quyết định.',
    'legal.community.reports.b4': 'Nhóm nghiêm trọng (an toàn trẻ em, đe doạ bạo lực, nội dung tình dục, tự hại) được xem trước, mục tiêu trong 24 giờ.',
    'legal.community.reports.b5': 'Bạn xem được trạng thái báo cáo của mình: đã nhận, đang xem xét, đã xử lý hoặc không vi phạm. Người bị báo cáo không biết ai đã báo cáo.',
    'legal.community.reports.note': 'Báo cáo sai có chủ ý, hoặc dùng báo cáo để quấy rối người khác, cũng là vi phạm.',
    'legal.community.exceptions.heading': '3. Ngoại lệ vì lợi ích công cộng',
    'legal.community.exceptions.p1': 'Một số nội dung nhắc tới chủ đề nhạy cảm nhưng nhằm giáo dục, đưa tin hoặc cảnh báo cộng đồng (ví dụ cảnh báo một chiêu lừa đảo) thì có thể được giữ lại, kèm bối cảnh rõ ràng. Người xem xét sẽ cân nhắc từng trường hợp.',
    'legal.community.rules.heading': '4. Các nhóm vi phạm',
    'legal.community.rules.p1': 'Mỗi nhóm dưới đây nói rõ là gì, ví dụ, mức nghiêm trọng và hình phạt tối đa.',
    'legal.community.ladder.heading': '5. Hình phạt theo bậc',
    'legal.community.ladder.lead': 'Mình ưu tiên giải thích và cho cơ hội sửa. Các bậc, từ nhẹ đến nặng:',
    'legal.community.ladder.b1': 'Cảnh cáo: không ảnh hưởng tài khoản.',
    'legal.community.ladder.b2': 'Gỡ nội dung và 1 strike.',
    'legal.community.ladder.b3': `Hạn chế tạm thời: không đăng bài hoặc bình luận trong một số ngày (tối đa ${LADDER.restrictDaysMax} ngày); vẫn xem được.`,
    'legal.community.ladder.b4': 'Khoá tài khoản vĩnh viễn.',
    'legal.community.ladder.note': `Strike được tính theo nhóm vi phạm và tính năng (bài viết, bình luận, tin nhắn). Strike mức thấp hết hạn sau ${d1} ngày, mức vừa sau ${d2} ngày; mức nghiêm trọng không hết hạn. Vi phạm rất nghiêm trọng có thể bị khoá ngay lần đầu, do người xem xét quyết định và ghi rõ lý do. Mốc đề xuất: ${LADDER.restrictAtStrikes} strike còn hiệu lực trong cùng nhóm và tính năng thì cân nhắc hạn chế; ${LADDER.banAtStrikes} strike còn hiệu lực thì cân nhắc khoá. (Đề xuất, chờ chủ sản phẩm duyệt.)`,
    'legal.community.appeal.heading': '6. Thông báo và kháng nghị',
    'legal.community.appeal.p1': `Khi bị xử lý, bạn nhận được thông báo nói rõ nội dung nào, quy tắc nào, hình phạt gì, kéo dài bao lâu và cách kháng nghị. Mỗi quyết định được kháng nghị một lần trong ${LADDER.appealWindowDays} ngày, ở mục Thông báo vi phạm trong ứng dụng hoặc qua email. Nếu kháng nghị đúng, nội dung được khôi phục và strike được gỡ.`,
    'legal.community.contact.heading': '7. Liên hệ',
    'legal.community.contact.p1': 'Câu hỏi về quy tắc, kháng nghị hoặc báo cáo khẩn cấp:',
  })
  else Object.assign(out, {
    'legal.community.title': 'Community Guidelines',
    'legal.community.effective': 'Proposed text, October 2026 — awaiting the product owner’s approval.',
    'legal.community.intro.heading': '1. Why we have rules',
    'legal.community.intro.p1': 'TappyAI is a place where people share real experiences. The rules below keep it safe, trustworthy and fair. They apply to posts, comments, profiles and messages.',
    'legal.community.reports.heading': '2. How reports are handled',
    'legal.community.reports.lead': 'When you report a post, comment or user:',
    'legal.community.reports.b1': 'A report only puts the content in a review queue. The number of reports never automatically removes content, hides it or penalizes anyone.',
    'legal.community.reports.b2': 'A person reviews the content against the rules below, and only then decides.',
    'legal.community.reports.b3': 'You can hide that content for yourself right after reporting; others keep seeing it until a decision is made.',
    'legal.community.reports.b4': 'The most serious groups (child safety, threats of violence, sexual content, self-harm) are reviewed first, with a target of 24 hours.',
    'legal.community.reports.b5': 'You can see the status of your reports: received, in review, actioned, or no violation. The person reported is never told who reported them.',
    'legal.community.reports.note': 'Knowingly false reports, or using reports to harass someone, are violations too.',
    'legal.community.exceptions.heading': '3. Public-interest exceptions',
    'legal.community.exceptions.p1': 'Some content touches sensitive subjects in order to educate, report the news or warn the community (for example warning about a scam). It can stay, with clear context. The reviewer weighs each case.',
    'legal.community.rules.heading': '4. The rule groups',
    'legal.community.rules.p1': 'Each group says what it is, gives examples, its severity and its highest penalty.',
    'legal.community.ladder.heading': '5. Penalties, step by step',
    'legal.community.ladder.lead': 'We prefer to explain and give people a chance to fix things. The steps, mildest first:',
    'legal.community.ladder.b1': 'Warning: no effect on your account.',
    'legal.community.ladder.b2': 'Content removed and 1 strike.',
    'legal.community.ladder.b3': `Temporary restriction: no posting or commenting for some days (at most ${LADDER.restrictDaysMax}); you can still read.`,
    'legal.community.ladder.b4': 'Permanent account lock.',
    'legal.community.ladder.note': `Strikes are counted per rule group and feature (posts, comments, messages). A low-severity strike expires after ${d1} days, a medium one after ${d2} days; a serious one never expires. A very serious violation can lead to a lock on the first occasion, decided by the reviewer with a written reason. Proposed marks: ${LADDER.restrictAtStrikes} active strikes in the same group and feature lead to considering a restriction; ${LADDER.banAtStrikes} active strikes lead to considering a lock. (A proposal, awaiting the product owner’s approval.)`,
    'legal.community.appeal.heading': '6. Notices and appeals',
    'legal.community.appeal.p1': `When action is taken you receive a notice saying which content, which rule, what penalty, for how long, and how to appeal. Each decision can be appealed once within ${LADDER.appealWindowDays} days, from Violation notices in the app or by email. If the appeal succeeds, the content is restored and the strike removed.`,
    'legal.community.contact.heading': '7. Contact',
    'legal.community.contact.p1': 'Questions about the rules, appeals or urgent reports:',
  })
  return out
}

export const communityEn: Record<string, string> = build('en')
export const communityVi: Record<string, string> = build('vi')
