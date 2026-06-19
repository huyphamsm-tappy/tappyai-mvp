import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/login" className="p-2 -ml-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-semibold text-gray-900 dark:text-white">Chính sách bảo mật</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          <p className="text-gray-400 dark:text-gray-500 text-xs">Cập nhật lần cuối: 13/06/2026</p>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">1. Thông tin chúng tôi thu thập</h3>
            <p>
              Khi bạn đăng nhập bằng Google, TappyAI lưu lại tên, email và ảnh đại diện từ tài khoản
              Google của bạn. Chúng tôi cũng lưu lịch sử trò chuyện với trợ lý AI để bạn có thể xem
              lại sau này.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">2. Cách chúng tôi sử dụng thông tin</h3>
            <p>
              Thông tin được sử dụng để cung cấp và cải thiện trải nghiệm trò chuyện, ghi nhớ lịch sử
              hội thoại của bạn, và hiển thị thông tin tài khoản trong phần Hồ sơ. Chúng tôi không
              bán thông tin cá nhân của bạn cho bên thứ ba.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">3. Chia sẻ với bên thứ ba</h3>
            <p>
              Để trả lời câu hỏi về giá cả, địa điểm và dịch vụ, TappyAI gửi nội dung câu hỏi của bạn
              tới các dịch vụ AI và tìm kiếm (Anthropic Claude, Google Search) để lấy kết quả. Các
              dịch vụ này xử lý dữ liệu theo chính sách riêng của họ.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">4. Bảo mật dữ liệu</h3>
            <p>
              Dữ liệu của bạn được lưu trữ trên Supabase với cơ chế xác thực và phân quyền theo tài
              khoản. Chỉ bạn mới có thể xem lịch sử trò chuyện và thông tin hồ sơ của chính mình.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">5. Quyền của bạn</h3>
            <p>
              Bạn có thể yêu cầu xóa tài khoản và toàn bộ dữ liệu liên quan bất kỳ lúc nào thông qua
              phần Cài đặt tài khoản trong ứng dụng.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">6. Liên hệ</h3>
            <p>
              Nếu có thắc mắc về chính sách bảo mật, vui lòng liên hệ:{' '}
              <span className="text-primary-500">huypham.sm@gmail.com</span>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-2 text-sm text-primary-500 font-medium hover:underline">
            <ArrowLeft size={14} />
            Quay lại đăng nhập
          </Link>
        </div>
      </main>
    </div>
  )
}
