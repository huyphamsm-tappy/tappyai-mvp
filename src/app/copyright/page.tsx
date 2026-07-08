import Header from '@/components/Header'
import Link from 'next/link'

export const metadata = { title: 'Chính sách bản quyền âm nhạc — TappyAI' }

// Static notice-and-takedown policy for Original Sound (user-uploaded music).
export default function CopyrightPolicyPage() {
  return (
    <div className="min-h-dvh bg-white dark:bg-gray-950 pb-24">
      <Header showBack backHref="/music" title="Chính sách bản quyền" />
      <main className="max-w-2xl mx-auto px-5 py-6 prose-sm text-gray-800 dark:text-gray-200 space-y-6">
        <section className="space-y-2">
          <h1 className="text-xl font-bold">Chính sách bản quyền âm nhạc (Original Sound)</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Áp dụng cho nhạc do người dùng đăng tải lên TappyAI.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">1. Điều kiện khi đăng nhạc</h2>
          <p className="text-sm leading-relaxed">Khi đăng một bản nhạc (“Original Sound”), bạn cam kết rằng bạn <strong>sở hữu hoặc có đầy đủ quyền hợp pháp</strong> đối với bản nhạc đó, và cấp cho TappyAI cùng người dùng khác quyền sử dụng nó (chèn vào video, phát lại) trên nền tảng. Bạn <strong>không</strong> được đăng nhạc có bản quyền của người khác khi chưa được phép.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">2. Trách nhiệm</h2>
          <p className="text-sm leading-relaxed">Người đăng chịu trách nhiệm pháp lý về nội dung mình tải lên. TappyAI hoạt động như một nền tảng trung gian và sẽ gỡ bỏ nội dung vi phạm khi nhận được thông báo hợp lệ.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">3. Báo cáo vi phạm (Notice-and-Takedown)</h2>
          <p className="text-sm leading-relaxed">Nếu bạn là chủ sở hữu quyền và cho rằng một bản nhạc trên TappyAI vi phạm bản quyền của bạn, hãy gửi thông báo tới đại diện bản quyền bên dưới, hoặc dùng nút <strong>“Báo cáo”</strong> trên trang bài nhạc. Thông báo cần gồm: (a) bản nhạc/đường dẫn bị vi phạm, (b) bằng chứng bạn là chủ sở hữu, (c) thông tin liên hệ.</p>
          <p className="text-sm leading-relaxed">Chúng tôi sẽ <strong>xem xét và gỡ bỏ nội dung vi phạm trong vòng 24–48 giờ</strong> kể từ khi nhận được thông báo hợp lệ.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">4. Đại diện bản quyền (Copyright Agent)</h2>
          <p className="text-sm leading-relaxed">
            Email: <a href="mailto:copyright@tappyai.com" className="text-primary-500 underline">copyright@tappyai.com</a><br />
            Chúng tôi tiếp nhận và xử lý mọi khiếu nại bản quyền qua địa chỉ này.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">5. Xử lý vi phạm lặp lại</h2>
          <p className="text-sm leading-relaxed">Tài khoản nhiều lần đăng nội dung vi phạm bản quyền có thể bị hạn chế đăng nhạc hoặc khóa.</p>
        </section>

        <p className="text-xs text-gray-400 pt-4">
          Quay lại <Link href="/music" className="underline">Thư viện nhạc</Link>.
        </p>
      </main>
    </div>
  )
}
