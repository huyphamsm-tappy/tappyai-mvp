import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { ChevronRight } from 'lucide-react'
import { SupertuxPreload } from '@/components/SupertuxPreload'

// Product scope: SuperTux is the only game surfaced. The former mini-game grid
// (Bắn Thiên Hà, Đua Xe, Rắn Săn Mồi, Đập Gạch, 2048, Phòng Thủ) was removed.

export default function GameHubPage() {
  const stDataUrl = process.env.NEXT_PUBLIC_SUPERTUX_DATA_URL ?? ''
  const stWasmUrl = process.env.NEXT_PUBLIC_SUPERTUX_WASM_URL ?? ''

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      {/* Invisible background preload — warms the cache for SuperTux assets */}
      <SupertuxPreload dataUrl={stDataUrl} wasmUrl={stWasmUrl} />
      <Header showBack backHref="/" title="Game" />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-600 p-6 pb-7 shadow-lg shadow-blue-500/20">
          <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative">
            <p className="text-white/80 text-sm font-medium mb-1">Game 🎮</p>
            <h1 className="text-white text-2xl sm:text-3xl font-black leading-tight">
              Chơi SuperTux<br />ngay trên TappyAI!
            </h1>
            <p className="text-white/70 text-sm mt-2">
              Game platformer mã nguồn mở — miễn phí, không cần cài đặt, chơi thẳng trên trình duyệt.
            </p>
          </div>
        </div>

        {/* SuperTux — the one game */}
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
      </main>

      <BottomNav />
    </div>
  )
}
