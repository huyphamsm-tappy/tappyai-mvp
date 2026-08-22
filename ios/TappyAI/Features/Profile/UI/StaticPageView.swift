import SwiftUI

struct PrivacyPolicyView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text(NSLocalizedString("legal.privacy.heading", comment: ""))
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)

                Group {
                    section(NSLocalizedString("legal.privacy.s1", comment: ""), """
                    TappyAI thu thập thông tin cần thiết để cung cấp dịch vụ: tên, email, sở thích ăn uống, lịch sử chat. \
                    Chúng tôi KHÔNG thu thập dữ liệu nhạy cảm ngoài phạm vi dịch vụ.
                    """)

                    section(NSLocalizedString("legal.privacy.s2", comment: ""), """
                    Dữ liệu của bạn được dùng để: cá nhân hóa gợi ý, cải thiện chất lượng AI, \
                    gửi thông báo bạn đã đồng ý nhận.
                    """)

                    section(NSLocalizedString("legal.privacy.s3", comment: ""), """
                    Mọi dữ liệu được mã hóa khi truyền tải (TLS) và lưu trữ. \
                    Token xác thực lưu trong Keychain, không chia sẻ với bên thứ ba.
                    """)

                    section(NSLocalizedString("legal.privacy.s4", comment: ""), """
                    Bạn có quyền: xem dữ liệu Tappy nhớ về bạn, xóa bộ nhớ bất cứ lúc nào, \
                    ngắt kết nối ứng dụng, xóa tài khoản.
                    """)

                    section(NSLocalizedString("legal.privacy.s5", comment: ""), """
                    Câu hỏi về quyền riêng tư? Email: privacy@tappyai.vn
                    """)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle(NSLocalizedString("legal.privacy.navTitle", comment: ""))
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func section(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            Text(body)
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct TermsOfServiceView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text(NSLocalizedString("legal.terms.heading", comment: ""))
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)

                Group {
                    section(NSLocalizedString("legal.terms.s1", comment: ""), """
                    Khi sử dụng TappyAI, bạn đồng ý với các điều khoản này. \
                    Nếu không đồng ý, vui lòng ngừng sử dụng dịch vụ.
                    """)

                    section(NSLocalizedString("legal.terms.s2", comment: ""), """
                    TappyAI là trợ lý AI cá nhân hỗ trợ gợi ý nhà hàng, dịch vụ, du lịch tại Việt Nam. \
                    Nội dung AI mang tính tham khảo, không phải lời khuyên chuyên môn.
                    """)

                    section(NSLocalizedString("legal.terms.s3", comment: ""), """
                    Bạn chịu trách nhiệm bảo mật tài khoản. Không chia sẻ thông tin đăng nhập. \
                    Thông báo ngay nếu phát hiện truy cập trái phép.
                    """)

                    section(NSLocalizedString("legal.terms.s4", comment: ""), """
                    Bạn sở hữu nội dung bạn tạo (review, ảnh). Bằng việc đăng tải, bạn cho phép \
                    TappyAI hiển thị nội dung trên nền tảng.
                    """)

                    section(NSLocalizedString("legal.terms.s5", comment: ""), """
                    TappyAI không chịu trách nhiệm về chất lượng dịch vụ của các cơ sở được gợi ý. \
                    Đặt chỗ là kết nối trực tiếp giữa bạn và cơ sở.
                    """)

                    section(NSLocalizedString("legal.terms.s6", comment: ""), """
                    Câu hỏi về điều khoản? Email: support@tappyai.vn
                    """)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle(NSLocalizedString("legal.terms.navTitle", comment: ""))
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func section(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            Text(body)
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
