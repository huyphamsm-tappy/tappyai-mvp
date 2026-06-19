import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'

export default async function PrivacyPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile/settings" title="Chính sách bảo mật" />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="card p-6 space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
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
              Bạn có thể đăng xuất bất kỳ lúc nào. Nếu muốn xóa tài khoản và toàn bộ dữ liệu liên
              quan, vui lòng liên hệ qua email hỗ trợ của TappyAI.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">6. Thay đổi chính sách</h3>
            <p>
              Chính sách này có thể được cập nhật theo thời gian. Mọi thay đổi sẽ được phản ánh
              trong phiên bản mới của trang này.
            </p>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
