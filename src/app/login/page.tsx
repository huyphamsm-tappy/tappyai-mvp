'use client'

import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ExternalLink, Copy, Check, Sparkles, MapPin, Zap } from 'lucide-react'

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

const EXPLORE_TAGS = [
  { emoji: '🍜', label: 'Ăn uống' },
  { emoji: '✈️', label: 'Du lịch' },
  { emoji: '💆', label: 'Spa & Làm đẹp' },
  { emoji: '🛍️', label: 'Mua sắm' },
  { emoji: '🏨', label: 'Khách sạn' },
  { emoji: '🎉', label: 'Giải trí' },
]

const FEATURES = [
  { icon: Sparkles, text: 'Trợ lý AI cá nhân hóa, hiểu rõ nhu cầu của bạn' },
  { icon: MapPin, text: 'Gợi ý địa điểm, dịch vụ thuần Việt, sát thực tế' },
  { icon: Zap, text: 'Trả lời nhanh, chính xác với AI tiên tiến nhất' },
]

export default function LoginPage() {
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [loadingZalo, setLoadingZalo] = useState(false)
  const [inApp, setInApp] = useState<{ isInApp: boolean; name: string; isAndroid: boolean }>({ isInApp: false, name: '', isAndroid: false })
  const [copied, setCopied] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    setInApp(detectInAppBrowser())
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
      setLoadingGoogle(false)
      return
    }
    window.location.replace(data.url)
  }

  const handleZaloLogin = () => {
    setLoadingZalo(true)
    const urlParams = new URLSearchParams(window.location.search)
    const returnTo = urlParams.get('returnTo') || '/'
    window.location.href = `/api/auth/zalo?returnTo=${encodeURIComponent(returnTo)}`
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

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Hero section */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-6 text-center relative overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80')" }}
      >
        {/* Overlay gradient for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-primary-900/60 pointer-events-none" />

        <div className="relative z-10">
          <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-lg p-3">
            <Image src="/logo.png" alt="TappyAI" width={80} height={80} className="w-full h-full object-contain" />
          </div>
          <div className="brand-title-wrap">
            <h1 className="brand-title text-3xl">TappyAI</h1>
          </div>
          <p className="brand-slogan mt-3 text-sm max-w-xs mx-auto">
            Chạm đến mọi dịch vụ – AI Agent cá nhân hóa cho cuộc sống tại Việt Nam
          </p>

          {/* Explore tags */}
          <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-sm mx-auto">
            {EXPLORE_TAGS.map((tag) => (
              <span
                key={tag.label}
                className="explore-tag inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm"
              >
                <span>{tag.emoji}</span>
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom card */}
      <div className="bg-white dark:bg-gray-950 rounded-t-[2rem] px-6 pt-6 pb-8 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <div className="max-w-sm mx-auto">
          {/* Features */}
          <div className="space-y-3 mb-6">
            {FEATURES.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                    <Icon size={16} className="text-primary-500" />
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-snug">{item.text}</p>
                </div>
              )
            })}
          </div>

          {inApp.isInApp ? (
            <div className="space-y-3">
              {/* Cảnh báo trình duyệt trong app */}
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-4">
                <p className="text-gray-900 dark:text-white font-semibold text-sm mb-1">
                  ⚠️ Không thể đăng nhập Google trong {inApp.name}
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Google không cho phép đăng nhập trong trình duyệt nội bộ của {inApp.name}.
                  Hãy mở trang này bằng <span className="font-medium text-gray-900 dark:text-white">Chrome</span> hoặc{' '}
                  <span className="font-medium text-gray-900 dark:text-white">Safari</span> để đăng nhập.
                </p>
              </div>

              {inApp.isAndroid && (
                <button
                  onClick={handleOpenInChrome}
                  className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg"
                >
                  <ExternalLink size={20} />
                  Mở bằng Chrome
                </button>
              )}

              <button
                onClick={handleCopyLink}
                className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
                {copied ? 'Đã copy link!' : 'Sao chép link để mở ở trình duyệt khác'}
              </button>

              {!inApp.isAndroid && (
                <p className="text-center text-gray-400 text-xs">
                  Trên iPhone: bấm vào biểu tượng <span className="font-medium text-gray-700 dark:text-gray-200">⋯</span> hoặc{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-200">chia sẻ</span> ở góc màn hình và chọn{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-200">&quot;Mở trong Safari&quot;</span>
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Login buttons */}
              <div className="space-y-3">
                {/* Google */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={loadingGoogle || loadingZalo}
                  className="w-full bg-gray-900 hover:bg-gray-800 active:bg-black dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loadingGoogle ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  {loadingGoogle ? 'Đang đăng nhập...' : 'Tiếp tục với Google'}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                  <span className="text-xs text-gray-400">hoặc</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                </div>

                {/* Zalo */}
                <button
                  onClick={handleZaloLogin}
                  disabled={loadingGoogle || loadingZalo}
                  className="w-full bg-[#0068ff] hover:bg-[#0057d9] active:bg-[#0046b3] text-white font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loadingZalo ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
                      <rect width="48" height="48" rx="10" fill="white" fillOpacity="0.15"/>
                      <text x="24" y="34" textAnchor="middle" fontSize="22" fontWeight="bold" fill="white" fontFamily="Arial, sans-serif">Z</text>
                    </svg>
                  )}
                  {loadingZalo ? 'Đang đăng nhập...' : 'Tiếp tục với Zalo'}
                </button>
              </div>

              <p className="text-center text-gray-400 text-xs mt-6">
                Bằng cách tiếp tục, bạn đồng ý với{' '}
                <Link href="/terms" className="text-gray-600 dark:text-gray-300 underline">Điều khoản dịch vụ</Link>
                {' '}và{' '}
                <Link href="/privacy" className="text-gray-600 dark:text-gray-300 underline">Chính sách bảo mật</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
