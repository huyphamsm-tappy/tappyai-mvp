import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { ChevronRight } from 'lucide-react'
import { SupertuxPreload } from '@/components/SupertuxPreload'

const GAMES = [
  {
    href: '/game/ban-thien-ha',
    emoji: '🚀',
    title: 'Bắn Thiên Hà',
    desc: 'Phi thuyền tự động bắn — tiêu diệt 5 đợt địch và trùm cuối!',
    gradient: 'from-green-500/20 to-emerald-500/10',
    color: 'bg-green-500',
  },
  {
    href: '/game/dua-xe-vo-tan',
    emoji: '🚗',
    title: 'Đua Xe Vô Tận',
    desc: 'Né xe ngược chiều trên cao tốc — tốc độ tăng dần không ngừng!',
    gradient: 'from-teal-500/20 to-emerald-500/10',
    color: 'bg-teal-500',
  },
  {
    href: '/game/ran-san-moi',
    emoji: '🐍',
    title: 'Rắn Săn Mồi',
    desc: 'Điều khiển rắn ăn mồi, dài ra và tránh va chạm.',
    gradient: 'from-green-500/20 to-emerald-500/10',
    color: 'bg-green-500',
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
    href: '/game/phong-thu-thanh-tri',
    emoji: '🏰',
    title: 'Phòng Thủ Thành Trì',
    desc: 'Đặt tháp ngăn quái vật — 3 loại tháp, 7 đợt tấn công!',
    gradient: 'from-emerald-500/20 to-green-500/10',
    color: 'bg-emerald-500',
  },
]

export default function GameHubPage() {
  const stDataUrl = process.env.NEXT_PUBLIC_SUPERTUX_DATA_URL ?? ''
  const stWasmUrl = process.env.NEXT_PUBLIC_SUPERTUX_WASM_URL ?? ''

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      {/* Invisible background preload — warms the cache for SuperTux assets */}
      <SupertuxPreload dataUrl={stDataUrl} wasmUrl={stWasmUrl} />
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
              7 game miễn phí — không cần cài đặt, chơi ngay trên trình duyệt.
            </p>
          </div>
        </div>

        {/* Featured: third-party open-source game */}
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">
            Game đặc biệt
          </p>
          <Link
            href="/game/supertux"
            className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-sky-500/20 to-blue-500/10 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-3xl flex-shrink-0 shadow-sm">
              🐧
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  SuperTux
                </p>
                <span className="text-xs font-medium bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded-full">GPL</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                Game platformer Mario-style mã nguồn mở — chạy thẳng trên trình duyệt!
              </p>
              <p className="text-xs text-sky-500 mt-0.5">supertux.org</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
          </Link>
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
