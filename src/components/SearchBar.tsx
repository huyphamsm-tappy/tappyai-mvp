'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Sparkles, ArrowUp, Smile, Mic, MicOff } from 'lucide-react'
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
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
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

  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SR) { alert('Trình duyệt không hỗ trợ nhận giọng nói. Hãy dùng Chrome hoặc Edge.'); return }
    const recognition = new SR()
    recognition.lang = 'vi-VN'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition
    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const t = event.results[0][0].transcript.trim()
      if (t) setQuery(t)
    }
    recognition.start()
  }, [])

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
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

        <form onSubmit={handleSubmit} className="relative">
          <Sparkles size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
            {/* Mic */}
            <button
              type="button"
              onClick={isListening ? stopVoice : startVoice}
              aria-label={isListening ? 'Dừng mic' : 'Nhập bằng giọng nói'}
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                isListening
                  ? 'bg-[#FF9500] animate-pulse shadow-md shadow-orange-300/50'
                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-orange-50 dark:hover:bg-orange-900/20'
              )}
            >
              {isListening
                ? <MicOff size={18} className="text-white" />
                : <Mic size={18} className="text-[#FF9500]" />
              }
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
