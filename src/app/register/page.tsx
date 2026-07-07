'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowLeft } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()
  const { t } = useTranslation()

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
      setError(t('register.errPasswordLen'))
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

    // Nếu Supabase đã trả session ngay (email confirmation tắt) → một tài khoản
    // vừa tạo luôn chưa onboarded, nên đưa thẳng vào onboarding (thay vì "/",
    // vốn bỏ qua bước seed sở thích/thành phố — giống các flow OAuth khác).
    if (data.session) {
      router.push('/onboarding')
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
          <p className="text-primary-100 mt-2 text-sm">{t('register.subtitle')}</p>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-6">
              <p className="text-white font-semibold mb-2">{t('register.checkEmailTitle')}</p>
              <p className="text-primary-100 text-sm">
                {t('register.checkEmailDesc', { email })}
              </p>
            </div>
            <Link href="/login" className="text-white underline text-sm">
              {t('register.backToLogin')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <Link href="/login" className="flex items-center gap-2 text-white/80 text-sm mb-2">
              <ArrowLeft size={16} /> {t('register.backToLogin')}
            </Link>

            {error && (
              <div className="bg-red-500/20 border border-red-300/40 text-white text-sm rounded-2xl px-4 py-3 text-center">
                {error}
              </div>
            )}

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3">
              <label className="text-primary-100 text-xs">{t('register.fullName')}</label>
              <input
                type="text"
                required
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('register.fullNamePlaceholder')}
                className="w-full bg-transparent text-white placeholder-white/40 outline-none text-lg mt-1"
              />
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3">
              <label className="text-primary-100 text-xs">{t('register.email')}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('register.emailPlaceholder')}
                className="w-full bg-transparent text-white placeholder-white/40 outline-none text-lg mt-1"
              />
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3">
              <label className="text-primary-100 text-xs">{t('register.password')}</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('register.passwordPlaceholder')}
                className="w-full bg-transparent text-white placeholder-white/40 outline-none text-lg mt-1"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !fullName || !email || !password}
              className="w-full bg-white hover:bg-gray-50 text-gray-900 font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-70"
            >
              {loading && <Loader2 size={20} className="animate-spin" />}
              {loading ? t('register.creating') : t('register.submit')}
            </button>

            <p className="text-center text-primary-100/70 text-xs mt-2">
              {t('register.agreePrefix')}{' '}
              <span className="text-white underline cursor-pointer">{t('settings.terms')}</span>
              {' '}{t('common.and')}{' '}
              <span className="text-white underline cursor-pointer">{t('settings.privacy')}</span>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
