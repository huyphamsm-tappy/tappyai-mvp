import SwiftUI

struct PrivacyPolicyView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text("Chính sách bảo mật")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)

                Group {
                    section("1. Thu thập dữ liệu", """
                    TappyAI thu thập thông tin cần thiết để cung cấp dịch vụ: tên, email, sở thích ăn uống, lịch sử chat. \
                    Chúng tôi KHÔNG thu thập dữ liệu nhạy cảm ngoài phạm vi dịch vụ.
                    """)

                    section("2. Sử dụng dữ liệu", """
                    Dữ liệu của bạn được dùng để: cá nhân hóa gợi ý, cải thiện chất lượng AI, \
                    gửi thông báo bạn đã đồng ý nhận.
                    """)

                    section("3. Bảo mật", """
                    Mọi dữ liệu được mã hóa khi truyền tải (TLS) và lưu trữ. \
                    Token xác thực lưu trong Keychain, không chia sẻ với bên thứ ba.
                    """)

                    section("4. Quyền của bạn", """
                    Bạn có quyền: xem dữ liệu Tappy nhớ về bạn, xóa bộ nhớ bất cứ lúc nào, \
                    ngắt kết nối ứng dụng, xóa tài khoản.
                    """)

                    section("5. Liên hệ", """
                    Câu hỏi về quyền riêng tư? Email: privacy@tappyai.vn
                    """)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Bảo mật")
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
                Text("Điều khoản sử dụng")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)

                Group {
                    section("1. Chấp nhận điều khoản", """
                    Khi sử dụng TappyAI, bạn đồng ý với các điều khoản này. \
                    Nếu không đồng ý, vui lòng ngừng sử dụng dịch vụ.
                    """)

                    section("2. Dịch vụ", """
                    TappyAI là trợ lý AI cá nhân hỗ trợ gợi ý nhà hàng, dịch vụ, du lịch tại Việt Nam. \
                    Nội dung AI mang tính tham khảo, không phải lời khuyên chuyên môn.
                    """)

                    section("3. Tài khoản", """
                    Bạn chịu trách nhiệm bảo mật tài khoản. Không chia sẻ thông tin đăng nhập. \
                    Thông báo ngay nếu phát hiện truy cập trái phép.
                    """)

                    section("4. Nội dung người dùng", """
                    Bạn sở hữu nội dung bạn tạo (review, ảnh). Bằng việc đăng tải, bạn cho phép \
                    TappyAI hiển thị nội dung trên nền tảng.
                    """)

                    section("5. Giới hạn trách nhiệm", """
                    TappyAI không chịu trách nhiệm về chất lượng dịch vụ của các cơ sở được gợi ý. \
                    Đặt chỗ là kết nối trực tiếp giữa bạn và cơ sở.
                    """)

                    section("6. Liên hệ", """
                    Câu hỏi về điều khoản? Email: support@tappyai.vn
                    """)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Điều khoản")
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
