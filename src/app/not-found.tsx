import Link from 'next/link'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <span className="text-5xl">🔍</span>
        <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
          Không tìm thấy trang
        </h2>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
          Trang bạn tìm không tồn tại hoặc đã bị di chuyển.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-all"
        >
          <Home size={16} /> Về trang chủ
        </Link>
      </div>
    </div>
  )
}
