'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const handleGoogleLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback` } })
    if (error) { console.error(error); setLoading(false) }
  }
  return (
    <div className="min-h-dvh bg-gradient-to-br from-primary-500 via-primary-600 to-accent-500 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-4xl font-black text-white">T</span>
          </div>
          <h1 className="text-3xl font-black text-white">TappyAI</h1>
          <p className="text-primary-100 mt-2 text-sm">Chạm đến moi dịch vụ – AI Agent cá nhân hóa</p>
        </div>
        <div className="space-y-3 mb-8">
          {[{emoji: '🎯', text: 'Thông tin chính xác, không chung chung'}, {emoji: '🇻🇳', text: 'Thuần Việt, hiểu văn hóa người Việt'}, {emoji: '⚡', text: 'Trả lời nhanh với AI tiên tiến nhất'}].map(item => (
            <div key={item.text} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3">
              <span className="text-xl">{item.emoji}</span>
              <p className="text-white text-sm font-medium">{item.text}</p>
            </div>
          ))}
        </div>
        <button onClick={handleGoogleLogin} disabled={loading} className="w-full bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-900 font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed">
          {loading ? <Loader2 size={20} className="animate-spin text-gray-500" /> : (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>)}
          {loading ? 'Đang đăng nhập...' : 'Tiếp tục với Google'}
        </button>
      </div>
    </div>
  )
}
