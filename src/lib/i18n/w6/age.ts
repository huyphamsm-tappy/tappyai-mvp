// /age-check — the 18+ eligibility flow.
//
// Three distinct situations, three distinct sets of words. They are separated
// here rather than shared because a user who has simply never been asked must
// not read a sentence written for a user who has been refused.

export const vi: Record<string, string> = {
  // ── Asking (status: unknown) ───────────────────────────────────────────────
  'age.ask.title': 'Bạn sinh ngày nào?',
  'age.ask.desc': 'TappyAI dành cho người từ 18 tuổi trở lên. Chúng tôi cần ngày sinh của bạn để tiếp tục.',
  'age.ask.privacy': 'Ngày sinh của bạn được giữ riêng tư. Nó không hiển thị trên trang cá nhân và không được chia sẻ với người dùng khác.',
  'age.field.day': 'Ngày',
  'age.field.month': 'Tháng',
  'age.field.year': 'Năm',
  'age.submit': 'Tiếp tục',
  'age.submitting': 'Đang lưu...',
  'age.error.invalid': 'Ngày sinh không hợp lệ. Vui lòng kiểm tra lại.',
  'age.error.failed': 'Không thể lưu. Vui lòng thử lại.',

  // ── Refusing (status: ineligible) ─────────────────────────────────────────
  'age.blocked.title': 'TappyAI dành cho người từ 18 tuổi',
  'age.blocked.desc': 'Theo ngày sinh bạn cung cấp, bạn chưa đủ 18 tuổi nên chưa thể sử dụng TappyAI.',
  // Offered only while the single self-correction is still available.
  'age.blocked.correctCta': 'Tôi nhập sai ngày sinh',
  'age.correct.title': 'Sửa ngày sinh',
  'age.correct.desc': 'Bạn chỉ có thể sửa ngày sinh một lần. Hãy kiểm tra kỹ trước khi lưu.',
  'age.correct.submit': 'Lưu ngày sinh',
  'age.blocked.exhausted': 'Bạn đã sửa ngày sinh một lần. Hãy liên hệ hỗ trợ nếu thông tin vẫn chưa đúng.',
  'age.blocked.signOut': 'Đăng xuất',

  // ── Demographic + professional profile ────────────────────────────────────
  'profile.about.title': 'Giới thiệu',
  'profile.about.desc': 'Không bắt buộc. Giúp Tappy gợi ý hợp với bạn hơn.',
  'profile.gender': 'Giới tính',
  'profile.gender.female': 'Nữ',
  'profile.gender.male': 'Nam',
  'profile.gender.other': 'Khác',
  'profile.gender.selfDescribe': 'Bạn muốn mô tả thế nào?',
  'profile.gender.preferNotToSay': 'Không muốn tiết lộ',
  'profile.city': 'Thành phố',
  'profile.country': 'Quốc gia',
  'profile.work.title': 'Công việc',
  'profile.occupation': 'Nghề nghiệp',
  'profile.industry': 'Ngành',
  'profile.education.title': 'Học vấn',
  'profile.educationLevel': 'Trình độ học vấn',
  'profile.ageBand': 'Nhóm tuổi',
  'profile.save': 'Lưu',
  'profile.saved': 'Đã lưu',
  'profile.saveFailed': 'Không thể lưu. Vui lòng thử lại.',
  'profile.private': 'Riêng tư — chỉ mình bạn thấy',
}

export const en: Record<string, string> = {
  'age.ask.title': 'What is your date of birth?',
  'age.ask.desc': 'TappyAI is for people aged 18 and over. We need your date of birth to continue.',
  'age.ask.privacy': 'Your date of birth is kept private. It is never shown on your profile and is never shared with other users.',
  'age.field.day': 'Day',
  'age.field.month': 'Month',
  'age.field.year': 'Year',
  'age.submit': 'Continue',
  'age.submitting': 'Saving...',
  'age.error.invalid': "That date of birth isn't valid. Please check it.",
  'age.error.failed': "Couldn't save. Please try again.",

  'age.blocked.title': 'TappyAI is for people aged 18 and over',
  'age.blocked.desc': "Based on the date of birth you gave, you're not yet 18, so you can't use TappyAI.",
  'age.blocked.correctCta': 'I entered the wrong date',
  'age.correct.title': 'Correct your date of birth',
  'age.correct.desc': 'You can change your date of birth only once. Please check it carefully before saving.',
  'age.correct.submit': 'Save date of birth',
  'age.blocked.exhausted': "You've already changed your date of birth once. Please contact support if it's still wrong.",
  'age.blocked.signOut': 'Sign out',

  'profile.about.title': 'About',
  'profile.about.desc': 'Optional. Helps Tappy suggest things that suit you.',
  'profile.gender': 'Gender',
  'profile.gender.female': 'Female',
  'profile.gender.male': 'Male',
  'profile.gender.other': 'Other',
  'profile.gender.selfDescribe': 'How would you describe it?',
  'profile.gender.preferNotToSay': 'Prefer not to say',
  'profile.city': 'City',
  'profile.country': 'Country',
  'profile.work.title': 'Work',
  'profile.occupation': 'Occupation',
  'profile.industry': 'Industry',
  'profile.education.title': 'Education',
  'profile.educationLevel': 'Level of education',
  'profile.ageBand': 'Age group',
  'profile.save': 'Save',
  'profile.saved': 'Saved',
  'profile.saveFailed': "Couldn't save. Please try again.",
  'profile.private': 'Private — only you can see this',
}
