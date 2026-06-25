'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowLeft } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password.length < 6) {
      setError('Mật khẩu cần ít nhất 6 ký tự')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    // Nếu Supabase đã trả session ngay (email confirmation tắt) → vào app luôn
    if (data.session) {
      router.push('/')
      router.refresh()
      return
    }

    // Ngược lại cần xác nhận email
    setDone(true)
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-primary-500 via-primary-600 to-accent-500 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-4xl font-black text-white">T</span>
          </div>
          <h1 className="text-3xl font-black text-white">TappyAI</h1>
          <p className="text-primary-100 mt-2 text-sm">Tạo tài khoản mới</p>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-6">
              <p className="text-white font-semibold mb-2">Kiểm tra email của bạn 📩</p>
              <p className="text-primary-100 text-sm">
                Chúng tôi đã gửi link xác nhận tới <span className="text-white font-medium">{email}</span>.
                Hãy mở email và bấm vào link để hoàn tất đăng ký.
              </p>
            </div>
            <Link href="/login" className="text-white underline text-sm">
              Về trang đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <Link href="/login" className="flex items-center gap-2 text-white/80 text-sm mb-2">
              <ArrowLeft size={16} /> Quay lại đăng nhập
            </Link>

            {error && (
              <div className="bg-red-500/20 border border-red-300/40 text-white text-sm rounded-2xl px-4 py-3 text-center">
                {error}
              </div>
            )}

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3">
              <label className="text-primary-100 text-xs">Họ và tên</label>
              <input
                type="text"
                required
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full bg-transparent text-white placeholder-white/40 outline-none text-lg mt-1"
              />
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3">
              <label className="text-primary-100 text-xs">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@email.com"
                className="w-full bg-transparent text-white placeholder-white/40 outline-none text-lg mt-1"
              />
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3">
              <label className="text-primary-100 text-xs">Mật khẩu</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full bg-transparent text-white placeholder-white/40 outline-none text-lg mt-1"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !fullName || !email || !password}
              className="w-full bg-white hover:bg-gray-50 text-gray-900 font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-70"
            >
              {loading && <Loader2 size={20} className="animate-spin" />}
              {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
            </button>

            <p className="text-center text-primary-100/70 text-xs mt-2">
              Bằng cách tạo tài khoản, bạn đồng ý với{' '}
              <span className="text-white underline cursor-pointer">Điều khoản dịch vụ</span>
              {' '}và{' '}
              <span className="text-white underline cursor-pointer">Chính sách bảo mật</span>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
