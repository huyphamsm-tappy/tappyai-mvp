import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { ChevronRight, Lock } from 'lucide-react'

const GAMES = [
  {
    href: '/game/biet-kich-sam-set',
    emoji: '⚡',
    title: 'Biệt Kích Sấm Sét',
    desc: 'Bắn súng cuộn ngang — tiêu diệt kẻ thù, vượt qua màn chơi.',
    gradient: 'from-emerald-500/15 to-emerald-500/5',
    available: true,
  },
  {
    href: '#',
    emoji: '🌴',
    title: 'Phiêu lưu rừng rậm',
    desc: 'Sắp ra mắt — khám phá khu rừng bí ẩn đầy thử thách.',
    gradient: 'from-green-500/10 to-green-500/3',
    available: false,
  },
  {
    href: '#',
    emoji: '🚀',
    title: 'Đại chiến không gian',
    desc: 'Sắp ra mắt — bảo vệ thiên hà khỏi đội quân xâm lược.',
    gradient: 'from-blue-500/10 to-blue-500/3',
    available: false,
  },
  {
    href: '#',
    emoji: '🏯',
    title: 'Kiếm sĩ thành cổ',
    desc: 'Sắp ra mắt — chặt đường qua những pháo đài cổ đại.',
    gradient: 'from-orange-500/10 to-orange-500/3',
    available: false,
  },
]

export default function GameHubPage() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header showBack backHref="/" title="Game" />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Hero banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-6 pb-7 shadow-lg shadow-emerald-500/20">
          <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative">
            <p className="text-white/80 text-sm font-medium mb-1">Mini Games 🎮</p>
            <h1 className="text-white text-2xl sm:text-3xl font-black leading-tight">
              Chơi game ngay<br />trên TappyAI!
            </h1>
            <p className="text-white/80 text-sm mt-2">
              Các mini-game miễn phí, chơi ngay trên trình duyệt — không cần cài đặt.
            </p>
          </div>
        </div>

        {/* Game cards */}
        <div className="space-y-3">
          {GAMES.map((g) => {
            const card = (
              <div
                className={`group flex items-center gap-4 rounded-2xl bg-gradient-to-br ${g.gradient} bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm transition-all ${g.available ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
              >
                <div className="w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 flex items-center justify-center text-3xl flex-shrink-0 shadow-sm">
                  {g.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold text-gray-900 dark:text-white transition-colors ${g.available ? 'group-hover:text-primary-600 dark:group-hover:text-primary-400' : ''}`}>
                      {g.title}
                    </p>
                    {!g.available && (
                      <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">
                        Sắp ra mắt
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{g.desc}</p>
                </div>
                {g.available
                  ? <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  : <Lock size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                }
              </div>
            )

            return g.available
              ? <Link key={g.href} href={g.href}>{card}</Link>
              : <div key={g.title}>{card}</div>
          })}
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
