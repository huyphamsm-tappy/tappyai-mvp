import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { ChevronRight } from 'lucide-react'

const GAMES = [
  {
    href: '/game/ran-san-moi',
    emoji: '🐍',
    title: 'Rắn Săn Mồi',
    desc: 'Điều khiển rắn ăn mồi, dài ra và tránh va chạm.',
    gradient: 'from-green-500/20 to-emerald-500/10',
    color: 'bg-green-500',
  },
  {
    href: '/game/rong-bay',
    emoji: '🐉',
    title: 'Rồng Bay',
    desc: 'Chạm màn hình để giữ rồng bay, vượt qua chướng ngại vật.',
    gradient: 'from-orange-500/20 to-red-500/10',
    color: 'bg-orange-500',
  },
  {
    href: '/game/ghep-boi',
    emoji: '🔮',
    title: 'Ghép Bói',
    desc: 'Hoán đổi bài bói để ghép 3 — phá combo, giành điểm cao.',
    gradient: 'from-purple-500/20 to-violet-500/10',
    color: 'bg-purple-500',
  },
  {
    href: '/game/nhay-vo-cuc',
    emoji: '🌙',
    title: 'Nhảy Vô Cực',
    desc: 'Nhảy từ nền tảng này sang nền tảng khác, leo càng cao càng tốt.',
    gradient: 'from-indigo-500/20 to-blue-500/10',
    color: 'bg-indigo-500',
  },
  {
    href: '/game/dap-gach',
    emoji: '🧱',
    title: 'Đập Gạch',
    desc: 'Điều khiển thanh chắn, bắn bóng phá gạch — cổ điển mà nghiện.',
    gradient: 'from-cyan-500/20 to-teal-500/10',
    color: 'bg-cyan-500',
  },
  {
    href: '/game/hop-nhat',
    emoji: '🔢',
    title: 'Hợp Nhất 2048',
    desc: 'Trượt ô số để ghép và đạt đến 2048 — tư duy chiến lược.',
    gradient: 'from-amber-500/20 to-yellow-500/10',
    color: 'bg-amber-500',
  },
  {
    href: '/game/xep-khoi',
    emoji: '🟦',
    title: 'Xếp Khối',
    desc: 'Xếp các khối rơi xuống thành hàng ngang để ghi điểm.',
    gradient: 'from-blue-500/20 to-sky-500/10',
    color: 'bg-blue-500',
  },
  {
    href: '/game/lat-the',
    emoji: '🃏',
    title: 'Lật Thẻ Ghi Nhớ',
    desc: 'Lật 2 thẻ cùng lúc, ghi nhớ và tìm các cặp giống nhau.',
    gradient: 'from-pink-500/20 to-rose-500/10',
    color: 'bg-pink-500',
  },
  {
    href: '/game/ban-bong',
    emoji: '🫧',
    title: 'Bắn Bóng',
    desc: 'Nhắm và bắn bóng màu, ghép 3+ cùng màu để nổ tung.',
    gradient: 'from-teal-500/20 to-cyan-500/10',
    color: 'bg-teal-500',
  },
  {
    href: '/game/doan-chu',
    emoji: '🔤',
    title: 'Đoán Chữ',
    desc: 'Đoán từ tiếng Việt bí ẩn trong 6 lần thử — thử trí nhớ.',
    gradient: 'from-lime-500/20 to-green-500/10',
    color: 'bg-lime-600',
  },
  {
    href: '/game/do-vui',
    emoji: '⭐',
    title: 'Đố Vui Bói Toán',
    desc: 'Trắc nghiệm vui về chiêm tinh, con giáp và vận mệnh.',
    gradient: 'from-violet-500/20 to-purple-500/10',
    color: 'bg-violet-500',
  },
]

export default function GameHubPage() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header showBack backHref="/" title="Mini Games" />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-6 pb-7 shadow-lg shadow-emerald-500/20">
          <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative">
            <p className="text-white/80 text-sm font-medium mb-1">Mini Games 🎮</p>
            <h1 className="text-white text-2xl sm:text-3xl font-black leading-tight">
              Chơi game ngay<br />trên TappyAI!
            </h1>
            <p className="text-white/70 text-sm mt-2">
              11 game miễn phí — không cần cài đặt, chơi ngay trên trình duyệt.
            </p>
          </div>
        </div>

        {/* Game grid */}
        <div className="grid grid-cols-1 gap-3">
          {GAMES.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className={`group flex items-center gap-4 rounded-2xl bg-gradient-to-br ${g.gradient} bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all`}
            >
              <div className="w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 flex items-center justify-center text-3xl flex-shrink-0 shadow-sm">
                {g.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {g.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{g.desc}</p>
              </div>
              <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
            </Link>
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
