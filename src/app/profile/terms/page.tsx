import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'

export default async function TermsPage() {
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
      <Header user={userInfo} showBack backHref="/profile/settings" title="Điều khoản dịch vụ" />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="card p-6 space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          <p className="text-gray-400 dark:text-gray-500 text-xs">Cập nhật lần cuối: 13/06/2026</p>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">1. Giới thiệu</h3>
            <p>
              TappyAI là trợ lý AI giúp bạn tìm kiếm địa điểm ăn uống, mua sắm, spa, giải trí, du lịch
              và các thông tin tham khảo liên quan. Khi sử dụng TappyAI, bạn đồng ý với các điều khoản
              dưới đây.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">2. Tài khoản</h3>
            <p>
              Bạn cần đăng nhập bằng tài khoản Google để sử dụng TappyAI. Bạn chịu trách nhiệm bảo
              mật tài khoản của mình và các hoạt động diễn ra dưới tài khoản đó.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">3. Thông tin do AI cung cấp</h3>
            <p>
              Giá cả, địa điểm, đánh giá và các thông tin khác do TappyAI cung cấp chỉ mang tính
              tham khảo, được tổng hợp từ các nguồn tìm kiếm công khai và có thể thay đổi theo thời
              gian, chi nhánh hoặc thời điểm. TappyAI không đảm bảo tính chính xác tuyệt đối và
              không chịu trách nhiệm cho các quyết định dựa trên thông tin này.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">4. Sử dụng hợp lý</h3>
            <p>
              Bạn đồng ý không sử dụng TappyAI cho mục đích bất hợp pháp, gây hại hoặc vi phạm
              quyền của người khác.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">5. Thay đổi điều khoản</h3>
            <p>
              TappyAI có thể cập nhật điều khoản này theo thời gian. Việc tiếp tục sử dụng dịch vụ
              sau khi có thay đổi đồng nghĩa với việc bạn chấp nhận các điều khoản mới.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">6. Liên hệ</h3>
            <p>Nếu có thắc mắc về điều khoản, vui lòng liên hệ qua email hỗ trợ của TappyAI.</p>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
