'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Sparkles, ArrowUp, Smile, Mic } from 'lucide-react'
import { cn } from '@/lib/utils'

const EMOJIS = [
  '😀','😄','😂','🤣','😊','😍',
  '🥰','😘','😎','🤩','😋','😅',
  '😳','😬','🙈','🤭','🤔','😏',
  '😢','😭','😞','😤','😡','😱',
  '👍','❤️','🙏','🎉','🔥','💯',
]

interface SearchBarProps {
  placeholder?: string
  onSearch?: (q: string) => void
  variant?: 'default' | 'hero'
}

export default function SearchBar({ placeholder, onSearch, variant = 'default' }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [showEmojiPanel, setShowEmojiPanel] = useState(false)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const [isListening, setIsListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  // After dictation ends, auto-submit with a short grace window the user can cancel.
  const [pendingSend, setPendingSend] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const voiceBaseRef = useRef('')
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voiceSpokeRef = useRef(false)

  const cancelAutoSend = useCallback(() => {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current)
      autoSendTimerRef.current = null
    }
    setPendingSend(false)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    cancelAutoSend()
    if (!query.trim()) return
    if (onSearch) { onSearch(query) } else { router.push(`/chat?q=${encodeURIComponent(query)}`) }
  }

  const insertEmoji = (emoji: string) => {
    const inp = inputRef.current
    if (!inp) {
      setQuery(prev => prev + emoji)
      setShowEmojiPanel(false)
      return
    }
    const start = inp.selectionStart ?? query.length
    const end = inp.selectionEnd ?? query.length
    const newVal = query.slice(0, start) + emoji + query.slice(end)
    setQuery(newVal)
    setShowEmojiPanel(false)
    requestAnimationFrame(() => {
      inp.focus()
      inp.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const openEmojiPanel = () => {
    if (!showEmojiPanel && emojiButtonRef.current) {
      const rect = emojiButtonRef.current.getBoundingClientRect()
      setPanelStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 8,
        right: window.innerWidth - rect.right,
        zIndex: 50,
      })
    }
    setShowEmojiPanel(v => !v)
  }

  // Voice input: fills the box live, then auto-submits (opens chat) after a 2s
  // grace window the user can cancel. Mirrors the /chat ChatInterface behavior.
  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setVoiceError('Trình duyệt chưa hỗ trợ nhập bằng giọng nói. Hãy dùng Chrome hoặc Edge nhé.')
      return
    }
    setVoiceError(null)
    cancelAutoSend()
    voiceSpokeRef.current = false
    const recognition = new SR()
    recognition.lang = 'vi-VN'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition
    voiceBaseRef.current = query ? query.replace(/\s+$/, '') + ' ' : ''

    recognition.onstart = () => { setIsListening(true); setVoiceError(null) }
    recognition.onend = () => {
      setIsListening(false)
      if (voiceSpokeRef.current) {
        setPendingSend(true)
        autoSendTimerRef.current = setTimeout(() => {
          autoSendTimerRef.current = null
          setPendingSend(false)
          formRef.current?.requestSubmit()
        }, 2000)
      }
    }
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false)
      cancelAutoSend()
      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          setVoiceError('Cần cấp quyền micro để nói. Hãy bật quyền cho trang rồi thử lại nhé.')
          break
        case 'no-speech':
          setVoiceError('Mình chưa nghe thấy gì — bấm micro và nói lại nhé.')
          break
        case 'audio-capture':
          setVoiceError('Không tìm thấy micro trên thiết bị.')
          break
        case 'aborted':
          break
        default:
          setVoiceError('Có trục trặc khi nhận giọng nói, thử lại nhé.')
      }
    }
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript
      if (transcript.trim()) voiceSpokeRef.current = true
      setQuery(voiceBaseRef.current + transcript)
    }
    setIsListening(true)
    try {
      recognition.start()
    } catch {
      setIsListening(false)
      setVoiceError('Không khởi động được micro. Tải lại trang rồi thử lại nhé.')
    }
  }, [query, cancelAutoSend])

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  // Clean up any live recognition / pending timer on unmount.
  useEffect(() => {
    return () => {
      const r = recognitionRef.current
      if (r) {
        r.onstart = null; r.onend = null; r.onerror = null; r.onresult = null
        try { r.abort() } catch { /* already stopped */ }
        recognitionRef.current = null
      }
      if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current)
    }
  }, [])

  if (variant === 'hero') {
    return (
      <>
        {/* Click-outside overlay — fixed so it escapes overflow:hidden */}
        {showEmojiPanel && (
          <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPanel(false)} />
        )}

        {/* Emoji panel — fixed so it escapes the hero overflow:hidden */}
        {showEmojiPanel && (
          <div
            className="w-64 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/60 dark:shadow-black/40 p-3"
            style={panelStyle}
          >
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-0.5">
              Chọn biểu cảm
            </p>
            <div className="grid grid-cols-6 gap-1">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  className="w-9 h-9 flex items-center justify-center text-xl rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="relative">
          <Sparkles size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              if (voiceError) setVoiceError(null)
              if (pendingSend) cancelAutoSend()
              setQuery(e.target.value)
            }}
            placeholder={placeholder || 'Hỏi TappyAI bất cứ điều gì...'}
            className="w-full bg-white dark:bg-gray-900 rounded-2xl pl-11 pr-[130px] py-4 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/60 text-base shadow-lg transition-all"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {/* Emoji */}
            <button
              ref={emojiButtonRef}
              type="button"
              onClick={openEmojiPanel}
              aria-label="Chọn emoji"
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                showEmojiPanel
                  ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-500'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-accent-50 dark:hover:bg-accent-900/20 hover:text-accent-500'
              )}
            >
              <Smile size={18} />
            </button>
            {/* Mic — listening shows a white mic on a pulsing orange button
               (not a slashed MicOff, which read as "mic disabled"). */}
            <button
              type="button"
              onClick={isListening ? stopVoice : startVoice}
              aria-label={isListening ? 'Dừng nghe' : 'Nói để nhập'}
              aria-pressed={isListening}
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                isListening
                  ? 'bg-[#FF9500] animate-pulse shadow-md shadow-orange-300/50'
                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-orange-50 dark:hover:bg-orange-900/20'
              )}
            >
              <Mic size={18} className={isListening ? 'text-white' : 'text-[#FF9500]'} />
            </button>
            {/* Submit */}
            <button
              type="submit"
              disabled={!query.trim()}
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                query.trim() ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600'
              )}
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </form>

        {/* Voice status — user always knows the state */}
        {isListening && (
          <div role="status" aria-live="polite" className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs bg-white/90 dark:bg-gray-900/90 text-[#FF9500] shadow">
            <span className="w-2 h-2 rounded-full bg-[#FF9500] animate-pulse flex-shrink-0" />
            <span>Đang nghe… nói xong Tappy tự mở chat (bạn có 2 giây để sửa trước).</span>
          </div>
        )}
        {!isListening && pendingSend && (
          <button
            type="button"
            onClick={() => { cancelAutoSend(); inputRef.current?.focus() }}
            className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs bg-white/90 dark:bg-gray-900/90 text-[#FF9500] shadow hover:bg-white dark:hover:bg-gray-900 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-[#FF9500] animate-pulse flex-shrink-0" />
            <span>Đang mở chat trong giây lát… chạm để sửa trước.</span>
          </button>
        )}
        {!isListening && !pendingSend && voiceError && (
          <div role="status" aria-live="polite" className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs bg-white/90 dark:bg-gray-900/90 text-red-600 dark:text-red-400 shadow">
            <span>{voiceError}</span>
          </div>
        )}
      </>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder || 'Hỏi TappyAI về ăn uống, du lịch, spa...'}
        className="w-full bg-gray-100 dark:bg-gray-800 rounded-2xl pl-11 pr-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 text-base transition-all"
      />
      {query && (
        <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 bg-primary-500 text-white rounded-xl px-3 py-1.5 text-sm font-medium">
          Hỏi
        </button>
      )}
    </form>
  )
}
