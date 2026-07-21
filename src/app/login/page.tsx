'use client'

import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ExternalLink, Copy, Check, Mail, ArrowLeft, User, ShieldCheck, Users, Sparkles, Globe2, MessageCircle, MapPin, Star } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { AUTH_PROVIDERS } from '@/lib/auth/providers'
import { TappyMascot } from '@/components/TappyMascot'
import { getTappyPose } from '@/lib/TappyMascotState'
import { markAuthPending, emitAuthLoginFailed, getPendingMethod } from '@/lib/analytics/authEvents'

// V1 scope: Email OTP is intentionally hidden from the normal sign-in card
// (owner decision 2026-07-21 — V1 = Google / Zalo / Guest). The OTP machinery
// below stays fully wired because the in-app-browser fallback still relies on
// it (it's the only provider that works inside Zalo/Facebook webviews, where
// Google OAuth is blocked). Flip this to true to re-surface it in the card.
const SHOW_EMAIL_OTP_IN_CARD = false

// Phát hiện trình duyệt nội bộ của các app chat (Google chặn OAuth trong các webview này)
function detectInAppBrowser(): { isInApp: boolean; name: string; isAndroid: boolean } {
  if (typeof navigator === 'undefined') return { isInApp: false, name: '', isAndroid: false }
  const ua = navigator.userAgent || ''
  const isAndroid = /Android/i.test(ua)

  if (/FBAN|FBAV|FB_IAB|FBSV/i.test(ua)) return { isInApp: true, name: 'Facebook', isAndroid }
  if (/Messenger/i.test(ua)) return { isInApp: true, name: 'Messenger', isAndroid }
  if (/Instagram/i.test(ua)) return { isInApp: true, name: 'Instagram', isAndroid }
  if (/Zalo/i.test(ua)) return { isInApp: true, name: 'Zalo', isAndroid }
  if (/Line\//i.test(ua)) return { isInApp: true, name: 'LINE', isAndroid }
  if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return { isInApp: true, name: 'TikTok', isAndroid }
  if (/MicroMessenger/i.test(ua)) return { isInApp: true, name: 'WeChat', isAndroid }

  return { isInApp: false, name: '', isAndroid: false }
}

// Left-column feature bullets (mockup: icon tile + bold title + 2-line description).
const FEATURES = [
  { icon: MessageCircle, tint: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300', titleKey: 'login.f1Title', descKey: 'login.f1Desc' },
  { icon: MapPin, tint: 'bg-rose-100 text-rose-500 dark:bg-rose-900/30 dark:text-rose-300', titleKey: 'login.f2Title', descKey: 'login.f2Desc' },
  { icon: ShieldCheck, tint: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300', titleKey: 'login.f3Title', descKey: 'login.f3Desc' },
  { icon: Star, tint: 'bg-amber-100 text-amber-500 dark:bg-amber-900/30 dark:text-amber-300', titleKey: 'login.f4Title', descKey: 'login.f4Desc' },
]

// Footer trust stats (mockup pills). Values are marketing copy from the design.
const STATS = [
  { icon: Users, tint: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300', value: '1M+', labelKey: 'login.statUsers' },
  { icon: Sparkles, tint: 'bg-amber-100 text-amber-500 dark:bg-amber-900/30 dark:text-amber-300', value: '50+', labelKey: 'login.statServices' },
  { icon: Globe2, tint: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300', value: '100+', labelKey: 'login.statCities' },
  { icon: ShieldCheck, tint: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300', value: '99.9%', labelKey: 'login.statUptime' },
]

// Floating accent chips around the mascot hero (mockup: pastel circles with icons).
const FLOATERS = [
  { emoji: '🎵', className: 'top-2 left-6 bg-violet-100/90', delay: '0s' },
  { emoji: '📍', className: 'top-8 right-2 bg-rose-100/90', delay: '0.6s' },
  { emoji: '💬', className: 'top-1/3 -left-3 bg-sky-100/90', delay: '1.2s' },
  { emoji: '📸', className: 'bottom-10 right-0 bg-pink-100/90', delay: '1.8s' },
  { emoji: '⭐', className: 'bottom-4 left-2 bg-amber-100/90', delay: '2.4s' },
]

export default function LoginPage() {
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [loadingFacebook, setLoadingFacebook] = useState(false)
  const [loadingZalo, setLoadingZalo] = useState(false)
  const [inApp, setInApp] = useState<{ isInApp: boolean; name: string; isAndroid: boolean }>({ isInApp: false, name: '', isAndroid: false })
  const [copied, setCopied] = useState(false)

  // Email OTP — Supabase-native, no password. Step 'email' asks for the address,
  // step 'code' verifies the 6-digit code Supabase emails. Works inside any
  // in-app browser (unlike Google), so it's offered as a fallback there too.
  const [otpStep, setOtpStep] = useState<'closed' | 'email' | 'code'>('closed')
  const [otpEmail, setOtpEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState('')

  const supabase = createClient()
  const router = useRouter()
  const { t } = useTranslation()

  useEffect(() => {
    setInApp(detectInAppBrowser())
  }, [])

  // Zalo (and other OAuth) failures redirect back here with ?error=… — emit the
  // login-failure event once on arrival (method best-effort from the pending
  // marker), then strip the param so a re-render / strict-mode re-run can't re-emit.
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error')
    if (!err) return
    emitAuthLoginFailed(err === 'zalo_failed' ? 'zalo' : (getPendingMethod() ?? 'unknown'), 'oauth_denied')
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    window.history.replaceState({}, '', url.toString())
  }, [])

  useEffect(() => {
    const checkAndRedirect = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const returnTo = new URLSearchParams(window.location.search).get('returnTo')
      const dest =
        returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
          ? returnTo
          : '/'
      router.replace(dest)
    }

    checkAndRedirect()

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) checkAndRedirect()
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGoogleLogin = async () => {
    setLoadingGoogle(true)
    markAuthPending('google')
    const urlParams = new URLSearchParams(window.location.search)
    const returnTo = urlParams.get('returnTo') || '/'
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`,
        skipBrowserRedirect: true,
      },
    })
    if (error || !data?.url) {
      console.error(error)
      emitAuthLoginFailed('google', 'oauth_denied')
      setLoadingGoogle(false)
      return
    }
    window.location.replace(data.url)
  }

  const handleFacebookLogin = async () => {
    setLoadingFacebook(true)
    markAuthPending('facebook')
    const urlParams = new URLSearchParams(window.location.search)
    const returnTo = urlParams.get('returnTo') || '/'
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`,
        skipBrowserRedirect: true,
      },
    })
    if (error || !data?.url) {
      console.error(error)
      emitAuthLoginFailed('facebook', 'oauth_denied')
      setLoadingFacebook(false)
      return
    }
    window.location.replace(data.url)
  }

  const handleZaloLogin = () => {
    setLoadingZalo(true)
    markAuthPending('zalo')
    const urlParams = new URLSearchParams(window.location.search)
    const returnTo = urlParams.get('returnTo') || '/'
    window.location.href = `/api/auth/zalo?returnTo=${encodeURIComponent(returnTo)}`
  }

  const getReturnDest = () => {
    const returnTo = new URLSearchParams(window.location.search).get('returnTo')
    return returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  }

  // Guest = keep browsing anonymously (access policy: browse + share + 5 AI
  // questions/day, no writes). No session is created — we simply leave /login.
  const handleGuest = () => {
    router.replace(getReturnDest())
  }

  // OAuth (Google/Zalo) routes new users through /auth/callback|confirm which check
  // profiles.onboarded before redirecting. The client-side OTP path skips those routes,
  // so mirror the same check here — otherwise a brand-new OTP signup lands on / and never
  // sees the interest/city onboarding (its memory never gets seeded).
  const destWithOnboarding = async (dest: string): Promise<string> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return dest
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarded')
        .eq('id', user.id)
        .maybeSingle()
      if (!profile?.onboarded) {
        return dest !== '/' ? `/onboarding?next=${encodeURIComponent(dest)}` : '/onboarding'
      }
    } catch { /* fall through to dest on any lookup failure */ }
    return dest
  }

  const handleSendOtp = async () => {
    setOtpError('')
    const email = otpEmail.trim()
    if (!email || !email.includes('@')) {
      setOtpError(t('auth.emailOtp.errorInvalidEmail'))
      return
    }
    setOtpLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    setOtpLoading(false)
    if (error) {
      emitAuthLoginFailed('email_otp', 'network')
      setOtpError(t('auth.emailOtp.errorSendFailed'))
      return
    }
    setOtpStep('code')
  }

  const handleVerifyOtp = async () => {
    setOtpError('')
    const code = otpCode.trim()
    if (code.length < 6) {
      setOtpError(t('auth.emailOtp.errorInvalidCode'))
      return
    }
    setOtpLoading(true)
    markAuthPending('email_otp')
    const { error } = await supabase.auth.verifyOtp({
      email: otpEmail.trim(),
      token: code,
      type: 'email',
    })
    setOtpLoading(false)
    if (error) {
      emitAuthLoginFailed('email_otp', 'invalid_credentials')
      setOtpError(t('auth.emailOtp.errorVerifyFailed'))
      return
    }
    // On success the client sets the session → onAuthStateChange (SIGNED_IN) →
    // the global listener emits auth_login_completed (+ signup if first) with the
    // pending 'email_otp' method.
    router.replace(await destWithOnboarding(getReturnDest()))
  }

  const handleOpenInChrome = () => {
    const url = `${location.host}${location.pathname}`
    location.href = `intent://${url}#Intent;scheme=https;package=com.android.chrome;end`
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const anyLoading = loadingGoogle || loadingFacebook || loadingZalo

  return (
    <div className="min-h-dvh bg-[#eef1f8] dark:bg-gray-950 flex items-center justify-center p-3 sm:p-6 lg:p-10">
      {/* Float animation for the hero chips — plain <style> (no styled-jsx: the App
          Router would need a style registry for it; a raw tag needs nothing). */}
      <style>{'@keyframes tappy-float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }'}</style>

      <div className="w-full max-w-6xl bg-white dark:bg-gray-900 rounded-[28px] shadow-[0_24px_80px_rgba(30,41,90,0.12)] overflow-hidden">
        {/* Card header: logo. (Language selection stays with the app's global
            first-visit LanguagePicker modal — rendering it again here duplicated
            the overlay and blocked the whole card.) */}
        <div className="flex items-center justify-between px-6 sm:px-10 pt-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="TappyAI" width={40} height={40} className="w-10 h-10 rounded-xl object-contain" />
            <span className="text-xl font-black tracking-tight text-gray-900 dark:text-white">
              tappy<span className="bg-gradient-to-r from-violet-500 to-primary-500 bg-clip-text text-transparent">ai</span>
              <span className="text-violet-400">✦</span>
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="grid lg:grid-cols-[1fr_minmax(340px,400px)] gap-8 lg:gap-6 px-6 sm:px-10 py-8">
          {/* Left: brand + hero + features */}
          <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
            <div className="flex-1 min-w-0 text-center md:text-left order-2 md:order-1">
              <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">{t('login.welcomeTo')}</p>
              <h1 className="text-5xl sm:text-6xl font-black leading-tight text-gray-900 dark:text-white">
                Tappy{' '}
                <span className="bg-gradient-to-r from-violet-500 via-primary-500 to-primary-400 bg-clip-text text-transparent">AI</span>
                <span className="align-super text-2xl text-violet-400">✦</span>
              </h1>
              <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{t('login.touchEvery')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('login.personalAgent')}</p>

              <div className="mt-7 space-y-4 max-w-sm mx-auto md:mx-0 text-left">
                {FEATURES.map((f) => {
                  const Icon = f.icon
                  return (
                    <div key={f.titleKey} className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${f.tint}`}>
                        <Icon size={17} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{t(f.titleKey)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">{t(f.descKey)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Mascot hero + floating chips (owner's mascot art, never generated) */}
            <div className="relative w-56 sm:w-64 flex-shrink-0 order-1 md:order-2 self-center">
              {FLOATERS.map((fl) => (
                <span
                  key={fl.emoji}
                  aria-hidden
                  className={`absolute z-10 w-10 h-10 rounded-full ${fl.className} dark:bg-white/10 shadow-md flex items-center justify-center text-lg`}
                  style={{ animation: 'tappy-float 3.6s ease-in-out infinite', animationDelay: fl.delay }}
                >
                  {fl.emoji}
                </span>
              ))}
              <Image
                src="/tappy/welcome.png"
                alt="Tappy — your personal AI agent"
                width={512}
                height={512}
                priority
                className="w-full h-auto drop-shadow-xl select-none"
              />
            </div>
          </div>

          {/* Right: sign-in card (or in-app-browser fallback) */}
          <div className="w-full max-w-md mx-auto lg:mx-0">
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-[0_16px_48px_rgba(30,41,90,0.10)] px-6 py-7">
              {inApp.isInApp ? (
                <div className="space-y-3">
                  {/* Cảnh báo trình duyệt trong app */}
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-4">
                    <p className="text-gray-900 dark:text-white font-semibold text-sm mb-1">
                      {t('login.inappTitle', { name: inApp.name })}
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      {t('login.inappDesc', { name: inApp.name })}
                    </p>
                  </div>

                  {inApp.isAndroid && (
                    <button
                      onClick={handleOpenInChrome}
                      className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg"
                    >
                      <ExternalLink size={20} />
                      {t('login.openChrome')}
                    </button>
                  )}

                  <button
                    onClick={handleCopyLink}
                    className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all"
                  >
                    {copied ? <Check size={20} /> : <Copy size={20} />}
                    {copied ? t('login.copied') : t('login.copyLink')}
                  </button>

                  {!inApp.isAndroid && (
                    <p className="text-center text-gray-400 text-xs">
                      {t('login.iosHint')}
                    </p>
                  )}

                  {/* Email OTP works inside any in-app browser (Google is blocked
                      there), so the fallback keeps it even though V1 hides it
                      from the normal card. */}
                  <div className="flex items-center gap-3 pt-2">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                    <span className="text-xs text-gray-400">{t('common.or')}</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                  </div>
                  <EmailOtpBlock
                    otpStep={otpStep} setOtpStep={setOtpStep}
                    otpEmail={otpEmail} setOtpEmail={setOtpEmail}
                    otpCode={otpCode} setOtpCode={setOtpCode}
                    otpLoading={otpLoading} otpError={otpError}
                    onSend={handleSendOtp} onVerify={handleVerifyOtp}
                  />
                </div>
              ) : (
                <>
                  <h2 className="text-center text-lg font-bold text-gray-900 dark:text-white">{t('login.signinTitle')}</h2>
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">{t('login.signinSubtitle')}</p>

                  <div className="space-y-3">
                    {/* Google */}
                    <button
                      onClick={handleGoogleLogin}
                      disabled={anyLoading}
                      className="w-full bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {loadingGoogle ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                      )}
                      {loadingGoogle ? t('login.signingIn') : t('login.continueGoogle')}
                    </button>

                    {/* Facebook — hidden via AUTH_PROVIDERS config; code preserved for re-enabling */}
                    {AUTH_PROVIDERS.facebook.enabled && (
                      <button
                        onClick={handleFacebookLogin}
                        disabled={anyLoading}
                        className="w-full bg-[#1877F2] hover:bg-[#166FE5] active:bg-[#125FC4] text-white font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {loadingFacebook ? (
                          <Loader2 size={20} className="animate-spin" />
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="white"/>
                          </svg>
                        )}
                        {loadingFacebook ? t('login.signingIn') : t('login.continueFacebook')}
                      </button>
                    )}

                    {/* Zalo */}
                    <button
                      onClick={handleZaloLogin}
                      disabled={anyLoading}
                      className="w-full bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {loadingZalo ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <span aria-hidden className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#0068ff] text-white text-[10px] font-black tracking-tight">Zalo</span>
                      )}
                      {loadingZalo ? t('login.signingIn') : t('login.continueZalo')}
                    </button>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                      <span className="text-xs text-gray-400">{t('common.or')}</span>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                    </div>

                    {/* Guest — browse anonymously (5 AI questions/day, read-only social) */}
                    <button
                      onClick={handleGuest}
                      disabled={anyLoading}
                      className="w-full bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      <User size={20} className="text-gray-500 dark:text-gray-300" />
                      {t('login.continueGuest')}
                    </button>

                    {SHOW_EMAIL_OTP_IN_CARD && (
                      <EmailOtpBlock
                        otpStep={otpStep} setOtpStep={setOtpStep}
                        otpEmail={otpEmail} setOtpEmail={setOtpEmail}
                        otpCode={otpCode} setOtpCode={setOtpCode}
                        otpLoading={otpLoading} otpError={otpError}
                        onSend={handleSendOtp} onVerify={handleVerifyOtp}
                      />
                    )}
                  </div>

                  <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-gray-400">
                    <ShieldCheck size={13} className="text-emerald-500 flex-shrink-0" />
                    {t('login.trustLine')}
                  </p>
                  <p className="text-center text-gray-400 text-xs mt-3">
                    {t('login.agreePrefix')}{' '}
                    <Link href="/terms" className="text-primary-500 hover:underline">{t('settings.terms')}</Link>
                    {' '}{t('common.and')}{' '}
                    <Link href="/privacy" className="text-primary-500 hover:underline">{t('settings.privacy')}</Link>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer stats */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-6 sm:px-10 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATS.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.labelKey} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl px-4 py-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.tint}`}>
                    <Icon size={17} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-900 dark:text-white leading-none">{s.value}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">{t(s.labelKey)}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-4">© 2025 TappyAI. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}

// Email OTP (Supabase-native, passwordless) — the one provider that works inside
// any in-app browser, so it stays wired for the in-app fallback even while V1
// hides it from the normal sign-in card (SHOW_EMAIL_OTP_IN_CARD above).
function EmailOtpBlock({
  otpStep, setOtpStep, otpEmail, setOtpEmail, otpCode, setOtpCode, otpLoading, otpError, onSend, onVerify,
}: {
  otpStep: 'closed' | 'email' | 'code'
  setOtpStep: (s: 'closed' | 'email' | 'code') => void
  otpEmail: string
  setOtpEmail: (v: string) => void
  otpCode: string
  setOtpCode: (v: string) => void
  otpLoading: boolean
  otpError: string
  onSend: () => void
  onVerify: () => void
}) {
  const { t } = useTranslation()

  if (otpStep === 'closed') {
    return (
      <button
        onClick={() => setOtpStep('email')}
        className="w-full bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all"
      >
        <Mail size={20} />
        {t('auth.emailOtp.cta')}
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setOtpStep('closed'); setOtpCode('') }}
        className="flex items-center gap-1 text-gray-400 text-xs hover:text-gray-600 dark:hover:text-gray-300"
      >
        <ArrowLeft size={14} /> {t('auth.emailOtp.back')}
      </button>

      {otpStep === 'email' ? (
        <>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t('auth.emailOtp.emailPlaceholder')}
            value={otpEmail}
            onChange={(e) => setOtpEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {otpError && <p className="text-red-500 dark:text-red-400 text-xs">{otpError}</p>}
          <button
            onClick={onSend}
            disabled={otpLoading}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-70"
          >
            {otpLoading ? <Loader2 size={20} className="animate-spin" /> : t('auth.emailOtp.send')}
          </button>
        </>
      ) : (
        <>
          <div className="flex justify-center"><TappyMascot pose={getTappyPose({ category: 'phone' })} size={48} eager animated /></div>
          <p className="text-xs text-gray-400 text-center">{t('auth.emailOtp.codeSentTo', { email: otpEmail })}</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {otpError && <p className="text-red-500 dark:text-red-400 text-xs">{otpError}</p>}
          <button
            onClick={onVerify}
            disabled={otpLoading}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-70"
          >
            {otpLoading ? <Loader2 size={20} className="animate-spin" /> : t('auth.emailOtp.verify')}
          </button>
        </>
      )}
    </div>
  )
}
