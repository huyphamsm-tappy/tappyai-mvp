'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { Loader2, ExternalLink, Copy, Check } from 'lucide-react'

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

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [inApp, setInApp] = useState<{ isInApp: boolean; name: string; isAndroid: boolean }>({ isInApp: false, name: '', isAndroid: false })
  const [copied, setCopied] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    setInApp(detectInAppBrowser())
  }, [])

  const handleGoogleLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    })
    if (error) {
      console.error(error)
      setLoading(false)
    }
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
    <div className="min-h-dvh bg-gradient-to-br from-primary-500 via-primary-600 to-accent-500 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-4xl font-black text-white">T</span>
          </div>
          <h1 className="text-3xl font-black text-white">TappyAI</h1>
          <p className="text-primary-100 mt-2 text-sm">Chạm đến mọi dịch vụ – AI Agent cá nhân hóa</p>
        </div>

        {/* Features */}
        <div className="space-y-3 mb-8">
          {[
            { emoji: '🎯', text: 'Thông tin chính xác, không chung chung' },
            { emoji: '🇻🇳', text: 'Thuần Việt, hiểu văn hóa người Việt' },
            { emoji: '⚡', text: 'Trả lời nhanh với AI tiên tiến nhất' },
          ].map((item) => (
            <div key={item.text} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3">
              <span className="text-xl">{item.emoji}</span>
              <p className="text-white text-sm font-medium">{item.text}</p>
            </div>
          ))}
        </div>

        {inApp.isInApp ? (
          <div className="space-y-3">
            {/* Cảnh báo trình duyệt trong app */}
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-4">
              <p className="text-white font-semibold text-sm mb-1">
                ⚠️ Không thể đăng nhập Google trong {inApp.name}
              </p>
              <p className="text-primary-100 text-sm">
                Google không cho phép đăng nhập trong trình duyệt nội bộ của {inApp.name}.
                Hãy mở trang này bằng <span className="text-white font-medium">Chrome</span> hoặc{' '}
                <span className="text-white font-medium">Safari</span> để đăng nhập.
              </p>
            </div>

            {inApp.isAndroid && (
              <button
                onClick={handleOpenInChrome}
                className="w-full bg-white hover:bg-gray-50 text-gray-900 font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg"
              >
                <ExternalLink size={20} />
                Mở bằng Chrome
              </button>
            )}

            <button
              onClick={handleCopyLink}
              className="w-full bg-white/15 hover:bg-white/25 text-white font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all backdrop-blur-sm"
            >
              {copied ? <Check size={20} /> : <Copy size={20} />}
              {copied ? 'Đã copy link!' : 'Sao chép link để mở ở trình duyệt khác'}
            </button>

            {!inApp.isAndroid && (
              <p className="text-center text-primary-100 text-xs">
                Trên iPhone: bấm vào biểu tượng <span className="font-medium text-white">⋯</span> hoặc{' '}
                <span className="font-medium text-white">chia sẻ</span> ở góc màn hình và chọn{' '}
                <span className="font-medium text-white">&quot;Mở trong Safari&quot;</span>
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Login button */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-900 font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin text-gray-500" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {loading ? 'Đang đăng nhập...' : 'Tiếp tục với Google'}
            </button>

            <p className="text-center text-primary-100/70 text-xs mt-6">
              Bằng cách tiếp tục, bạn đồng ý với{' '}
              <span className="text-white underline cursor-pointer">Điều khoản dịch vụ</span>
              {' '}và{' '}
              <span className="text-white underline cursor-pointer">Chính sách bảo mật</span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
