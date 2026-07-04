'use client'

import { useState, useRef, useCallback } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Volume2, VolumeX, Copy, Check, ChevronDown } from 'lucide-react'

const LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt', tts: 'vi-VN' },
  { code: 'en', name: 'English', tts: 'en-US' },
  { code: 'ja', name: '日本語', tts: 'ja-JP' },
  { code: 'ko', name: '한국어', tts: 'ko-KR' },
  { code: 'zh-CN', name: '中文（简体）', tts: 'zh-CN' },
  { code: 'zh-TW', name: '中文（繁體）', tts: 'zh-TW' },
  { code: 'fr', name: 'Français', tts: 'fr-FR' },
  { code: 'de', name: 'Deutsch', tts: 'de-DE' },
  { code: 'es', name: 'Español', tts: 'es-ES' },
  { code: 'it', name: 'Italiano', tts: 'it-IT' },
  { code: 'pt', name: 'Português', tts: 'pt-PT' },
  { code: 'ar', name: 'العربية', tts: 'ar-SA' },
  { code: 'th', name: 'ภาษาไทย', tts: 'th-TH' },
  { code: 'id', name: 'Bahasa Indonesia', tts: 'id-ID' },
  { code: 'ms', name: 'Bahasa Melayu', tts: 'ms-MY' },
  { code: 'hi', name: 'हिंदी', tts: 'hi-IN' },
  { code: 'ru', name: 'Русский', tts: 'ru-RU' },
  { code: 'nl', name: 'Nederlands', tts: 'nl-NL' },
  { code: 'pl', name: 'Polski', tts: 'pl-PL' },
  { code: 'tr', name: 'Türkçe', tts: 'tr-TR' },
  { code: 'sv', name: 'Svenska', tts: 'sv-SE' },
  { code: 'da', name: 'Dansk', tts: 'da-DK' },
  { code: 'no', name: 'Norsk', tts: 'nb-NO' },
  { code: 'fi', name: 'Suomi', tts: 'fi-FI' },
  { code: 'cs', name: 'Čeština', tts: 'cs-CZ' },
  { code: 'hu', name: 'Magyar', tts: 'hu-HU' },
  { code: 'ro', name: 'Română', tts: 'ro-RO' },
  { code: 'el', name: 'Ελληνικά', tts: 'el-GR' },
  { code: 'he', name: 'עברית', tts: 'he-IL' },
  { code: 'uk', name: 'Українська', tts: 'uk-UA' },
]

export default function TranslatePage() {
  const [inputText, setInputText] = useState('')
  const [targetLang, setTargetLang] = useState('vi')
  const [translation, setTranslation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const selectedLang = LANGUAGES.find(l => l.code === targetLang) || LANGUAGES[0]

  const translate = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return
    setLoading(true)
    setError('')
    setTranslation('')
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLang }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Có lỗi xảy ra. Vui lòng thử lại.')
      } else {
        setTranslation(data.translation)
      }
    } catch {
      setError('Không thể kết nối. Vui lòng kiểm tra mạng.')
    } finally {
      setLoading(false)
    }
  }, [inputText, targetLang])

  const speak = useCallback((text: string, ttsLang: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = ttsLang
    const voices = window.speechSynthesis.getVoices()
    const match = voices.find(v => v.lang === ttsLang) || voices.find(v => v.lang.startsWith(ttsLang.slice(0, 2)))
    if (match) utter.voice = match
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utter)
  }, [speaking])

  const copy = useCallback(() => {
    if (!translation) return
    navigator.clipboard.writeText(translation).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [translation])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <Header title="Dịch ngôn ngữ" />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-5 pb-24 space-y-4">
        {/* Hero banner */}
        <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 p-5 text-white shadow-lg">
          <div className="text-3xl mb-2">🌐</div>
          <h2 className="text-xl font-bold leading-tight">Dịch ngôn ngữ tức thì</h2>
          <p className="text-white/70 text-sm mt-1">30 ngôn ngữ · Không cần đăng nhập · Đọc to kết quả</p>
        </div>

        {/* Input */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Văn bản cần dịch</p>
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Nhập hoặc dán văn bản vào đây..."
              rows={5}
              maxLength={2000}
              className="w-full resize-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 text-sm leading-relaxed outline-none"
            />
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-400">{inputText.length}/2000</span>
            {inputText.trim() && (
              <button
                onClick={() => { setInputText(''); setTranslation(''); setError(''); textareaRef.current?.focus() }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Xóa
              </button>
            )}
          </div>
        </div>

        {/* Language picker */}
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dịch sang</p>
          </div>
          <button
            onClick={() => setShowLangPicker(v => !v)}
            className="w-full flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3.5 shadow-sm hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
          >
            <span className="font-medium text-gray-900 dark:text-white">{selectedLang.name}</span>
            <ChevronDown size={18} className={`text-gray-400 transition-transform ${showLangPicker ? 'rotate-180' : ''}`} />
          </button>

          {showLangPicker && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => { setTargetLang(lang.code); setShowLangPicker(false) }}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    lang.code === targetLang
                      ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-semibold'
                      : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Translate button */}
        <button
          onClick={translate}
          disabled={loading || !inputText.trim()}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold text-base shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Đang dịch...
            </span>
          ) : 'Dịch ngay'}
        </button>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
            <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Result */}
        {translation && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-violet-500 uppercase tracking-wider">Kết quả · {selectedLang.name}</p>
              </div>
              <p className="text-gray-900 dark:text-white text-base leading-relaxed whitespace-pre-wrap">{translation}</p>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => speak(translation, selectedLang.tts)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  speaking
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-700'
                }`}
              >
                {speaking ? <VolumeX size={15} /> : <Volume2 size={15} />}
                {speaking ? 'Dừng' : 'Đọc to'}
              </button>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-700 text-sm font-medium transition-colors"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Đã chép!' : 'Sao chép'}
              </button>
            </div>
          </div>
        )}

        {/* Tip */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 px-4">
          Miễn phí · Tối đa 30 lần/ngày · Không cần tài khoản
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
