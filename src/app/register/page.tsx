'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, ArrowRight, User, Mail, Lock, Compass, Heart, Sparkles } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { markAuthPending, emitAuthLoginFailed } from '@/lib/analytics/authEvents'
import { TappyMascot } from '@/components/TappyMascot'

// Visual layer redesigned 2026-09-26 (owner brief: light, two-column, real brand assets).
// Everything the page DOES — the fields, `signUp`, validation, the age-check hand-off, the
// check-your-email state, the fields' behaviour — is unchanged; no control was added. What it shows:
//   · top-left: `/branding/otter-logo.png`, the approved lockup (mascot + wordmark in one image).
//   · card: the approved `welcome` pose. There is no icon-only logo asset yet, and brand rules
//     forbid cropping the lockup, so the pose stands in for "the logo without the wordmark".
//   · left column: `/branding/otter-mascot.png`, the approved full-body illustration.

const BENEFITS = [
  { icon: Compass, title: 'register.benefit1Title', desc: 'register.benefit1Desc', tone: 'bg-primary-50 text-primary-500' },
  { icon: Heart, title: 'register.benefit2Title', desc: 'register.benefit2Desc', tone: 'bg-accent-50 text-accent-500' },
  { icon: Sparkles, title: 'register.benefit3Title', desc: 'register.benefit3Desc', tone: 'bg-primary-50 text-primary-500' },
] as const

const inputClass =
  'h-[54px] w-full rounded-[14px] border border-slate-200 bg-white pl-11 text-[15px] text-slate-900 ' +
  'placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] ' +
  'hover:border-slate-300 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10'

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

    markAuthPending('email')
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
      emitAuthLoginFailed('email', 'invalid_credentials')
      setError(error.message)
      return
    }
    // On immediate session (email confirmation off), onAuthStateChange fires and
    // the global listener emits auth_signup_completed + auth_login_completed
    // (is_first_login=true) with method 'email'.

    // Nếu Supabase đã trả session ngay (email confirmation tắt) → một tài khoản
    // vừa tạo luôn chưa onboarded, nên đích đến là onboarding (thay vì "/",
    // vốn bỏ qua bước seed sở thích/thành phố — giống các flow OAuth khác).
    //
    // 🔑 QUA /age-check, KHÔNG ĐI THẲNG ONBOARDING (owner decision 2026-09-10).
    //    Nhánh này bỏ qua hoàn toàn phần kiểm tra tuổi: nó là con đường DUY NHẤT
    //    vào sản phẩm mà không đi qua `/auth/callback`, nơi `getAgeEligibility`
    //    vốn quyết định điểm đến. Hiện tại nhánh này không chạy trên production
    //    vì Supabase đang bật "Confirm email" — nhưng nó sẽ chạy ngay khi thiết
    //    lập đó bị tắt, và khi ấy thứ tự màn hình sẽ sai một cách âm thầm.
    //
    //    `/age-check` tự nó là điểm quyết định: guard phía server ở đó đọc cùng
    //    một `getAgeEligibility()` rồi chuyển tiếp thẳng tới `next` nếu đã đủ
    //    tuổi, nên KHÔNG có logic tuổi nào bị nhân bản ở đây và người dùng đã
    //    xác minh không bao giờ nhìn thấy màn hình này.
    //
    //    Đây là thứ tự màn hình, không phải hàng rào bảo mật: mọi product API
    //    vẫn tự từ chối caller chưa đủ điều kiện.
    if (data.session) {
      router.push(`/age-check?next=${encodeURIComponent('/onboarding')}`)
      router.refresh()
      return
    }

    // Ngược lại cần xác nhận email
    setDone(true)
  }

  // `{brand}` in the headline is where the TappyAI name goes; split so it can carry the brand colour.
  const [titleBefore, titleAfter = ''] = t('register.heroTitle').split('{brand}')

  return (
    <div
      className="relative min-h-dvh overflow-x-hidden bg-white text-slate-900 sm:bg-[#FAFCFF]"
      style={{
        backgroundImage:
          'radial-gradient(circle at 8% 14%, rgba(0,122,255,0.07), transparent 36%),' +
          'radial-gradient(circle at 94% 88%, rgba(0,122,255,0.05), transparent 40%)',
      }}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col px-5 sm:px-8 lg:px-10">
        {/* Header — the real lockup. On a phone the card's own mascot is the brand, so the
            header is not rendered there at all. */}
        <header className="hidden items-center py-5 sm:flex">
          <Image
            src="/branding/otter-logo.png"
            alt="TappyAI"
            width={112}
            height={112}
            priority
            className="h-14 w-14 rounded-[16px] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
          />
        </header>

        <main className="grid flex-1 items-center gap-12 pb-10 pt-10 sm:pt-2 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-14 lg:pb-8 lg:pt-0 xl:gap-20">
          {/* LEFT — brand introduction. Desktop only: on a phone the card is the screen. */}
          <section className="hidden lg:block">
            <h1 className="text-[44px] font-bold leading-[1.1] tracking-[-0.02em] text-slate-900 xl:text-[52px]">
              {titleBefore}
              <span className="text-primary-500">TappyAI</span>
              {titleAfter}
            </h1>
            <p className="mt-4 max-w-[460px] text-[17px] leading-relaxed text-slate-600">{t('register.heroDesc')}</p>

            <div className="mt-9 flex items-center gap-6 xl:gap-10">
              <ul className="min-w-0 flex-1 space-y-5">
                {BENEFITS.map(({ icon: Icon, title, desc, tone }) => (
                  <li key={title} className="flex items-start gap-3.5">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
                      <Icon size={18} aria-hidden />
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className="block text-[15px] font-semibold leading-tight text-slate-900">{t(title)}</span>
                      <span className="mt-1 block text-[14px] leading-snug text-slate-500">{t(desc)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Image
                src="/branding/otter-mascot.png"
                alt=""
                aria-hidden
                width={560}
                height={761}
                priority
                className="h-auto w-[180px] shrink-0 xl:w-[210px]"
              />
            </div>
          </section>

          {/* RIGHT — the card. On a phone it drops its frame and becomes the page. */}
          <div className="mx-auto w-full max-w-[460px] rounded-[24px] sm:border sm:border-black/[0.06] sm:bg-white sm:px-10 sm:py-8 sm:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-16px_rgba(15,23,42,0.14)]">
            <div className="flex flex-col items-center text-center">
              <span className="grid h-[76px] w-[76px] place-items-center overflow-hidden rounded-full bg-primary-50 ring-1 ring-primary-100">
                <TappyMascot pose="welcome" size={104} alt="" eager className="h-[104px] w-[104px] max-w-none translate-y-2" />
              </span>
              <h2 className="mt-3 text-[22px] font-bold tracking-[-0.01em] text-slate-900">{t('register.subtitle')}</h2>
            </div>

            {done ? (
              <div className="mt-7 space-y-5 text-center">
                <div className="rounded-2xl border border-primary-100 bg-primary-50/60 px-5 py-6">
                  <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-white text-primary-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                    <Mail size={20} aria-hidden />
                  </span>
                  <p className="font-semibold text-slate-900">{t('register.checkEmailTitle')}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {t('register.checkEmailDesc', { email })}
                  </p>
                </div>
                <Link href="/login" className="inline-block text-sm font-semibold text-primary-500 hover:text-primary-600">
                  {t('register.backToLogin')}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="mt-7 space-y-4">
                {error && (
                  <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="register-name" className="mb-1.5 block text-[13px] font-medium text-slate-700">{t('register.fullName')}</label>
                  <span className="relative block">
                    <User size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                    <input
                      id="register-name"
                      type="text"
                      required
                      autoFocus
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('register.fullNamePlaceholder')}
                      className={`${inputClass} pr-4`}
                    />
                  </span>
                </div>

                <div>
                  <label htmlFor="register-email" className="mb-1.5 block text-[13px] font-medium text-slate-700">{t('register.email')}</label>
                  <span className="relative block">
                    <Mail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                    <input
                      id="register-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('register.emailPlaceholder')}
                      className={`${inputClass} pr-4`}
                    />
                  </span>
                </div>

                <div>
                  <label htmlFor="register-password" className="mb-1.5 block text-[13px] font-medium text-slate-700">{t('register.password')}</label>
                  <span className="relative block">
                    <Lock size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                    <input
                      id="register-password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('register.passwordPlaceholder')}
                      className={`${inputClass} pr-4`}
                    />
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading || !fullName || !email || !password}
                  className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-primary-500 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/25 disabled:cursor-not-allowed disabled:bg-primary-500/45"
                >
                  {loading && <Loader2 size={18} className="animate-spin" aria-hidden />}
                  {loading ? t('register.creating') : t('register.submit')}
                  {!loading && <ArrowRight size={18} aria-hidden />}
                </button>

                <p className="text-center text-[12.5px] leading-relaxed text-slate-500">
                  {t('register.agreePrefix')}{' '}
                  <span className="cursor-pointer font-medium text-slate-700 underline decoration-slate-300 underline-offset-2">
                    {t('settings.terms')}
                  </span>
                  {' '}{t('common.and')}{' '}
                  <span className="cursor-pointer font-medium text-slate-700 underline decoration-slate-300 underline-offset-2">
                    {t('settings.privacy')}
                  </span>
                </p>

                <p className="border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
                  {t('register.haveAccount')}{' '}
                  <Link href="/login" className="font-semibold text-primary-500 hover:text-primary-600">
                    {t('register.backToLogin')}
                  </Link>
                </p>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
