'use client'

import { useChat } from 'ai/react'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Send, Loader2, Sparkles, Mic, MicOff, Volume2, VolumeX, Smile } from 'lucide-react'
import { cn, CATEGORIES, type CategoryId } from '@/lib/utils'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'
import { EMOTES } from '@/components/chat/emotes'

const QUICK_PROMPTS: Record<string, string[]> = {
  food: ['Quán bún bò ngon ở TP.HCM?', 'Cafe view đẹp Hà Nội?', 'Nhà hàng hải sản tươi sống?'],
  shopping: ['Trung tâm mua sắm lớn Sài Gòn?', 'Mua đồ hiệu uy tín?', 'Chợ đêm lưu niệm?'],
  entertainment: ['Rạp chiếu phim IMAX?', 'Quán karaoke bao phòng?', 'Bar rooftop view đẹp?'],
  travel: ['Lịch trình Đà Nẵng 3 ngày?', 'Khách sạn Phú Quốc 1 triệu?', 'Địa điểm check-in Hội An?'],
  spa: ['Spa massage giá bình dân?', 'Nail salon gel tốt?', 'Trung tâm dưỡng da uy tín?'],
  general: ['Ăn gì ngon hôm nay?', 'Cuối tuần đi đâu vui?', 'Quán cafe làm việc yên tĩnh?'],
}

interface CTAButton {
  label: string
  type: 'maps' | 'call' | 'zalo' | 'website' | 'booking' | 'search' | 'internal_booking'
  url: string
  primary: boolean
}

interface ChatInterfaceProps {
  initialMessage?: string
  initialCategory?: string
  conversationId?: string
  savedMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  onSave?: (messages: Array<{ role: string; content: string }>, title: string) => void
}

function parseCTA(content: string): { text: string; buttons: CTAButton[] } {
  const ctaMatch = content.match(/\[CTA_BUTTONS\]([\s\S]*?)\[\/CTA_BUTTONS\]/i)
  if (!ctaMatch) return { text: content, buttons: [] }

  const text = content
    .replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/i, '')
    .trimEnd()

  try {
    const parsed = JSON.parse(ctaMatch[1].trim())
    const buttons: CTAButton[] = Array.isArray(parsed.buttons) ? parsed.buttons : []
    return { text, buttons }
  } catch {
    return { text, buttons: [] }
  }
}

function logCTAClick(button: CTAButton) {
  try {
    fetch('/api/cta-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: button.type, label: button.label, url: button.url, ts: Date.now() }),
    }).catch(() => {})
  } catch {}
}

function formatMessage(content: string) {
  return content
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 underline font-medium break-all">$1</a>')
    .replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 underline break-all">$2</a>')
    .replace(/^### (.+)$\n?/gm, '<div class="font-semibold mt-3 mb-1">$1</div>')
    .replace(/^## (.+)$\n?/gm, '<div class="font-semibold text-base mt-3 mb-1">$1</div>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^(\d+)\.\s+(.+)$\n?/gm, '<div class="flex gap-2 my-1"><span class="text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0">$1.</span><span>$2</span></div>')
    .replace(/^- (.+)$\n?/gm, '<li>$1</li>')
    .replace(/(?:<li>.*?<\/li>)+/g, (m) => `<ul class="list-disc pl-5 my-2 space-y-1">${m}</ul>`)
}

export default function ChatInterface({
  initialMessage,
  initialCategory = 'general',
  conversationId,
  savedMessages,
  onSave,
}: ChatInterfaceProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const category = initialCategory as CategoryId
  const catInfo = CATEGORIES.find(c => c.id === category)
  const [hasMemory, setHasMemory] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [showEmojiPanel, setShowEmojiPanel] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, append } = useChat({
    api: '/api/chat',
    initialMessages: savedMessages?.map((m, i) => ({ id: String(i), role: m.role, content: m.content })),
    onFinish: async (message) => {
      const all = [...messages, message]
      if (onSave) {
        await onSave(all.map(m => ({ role: m.role, content: m.content })), all[0]?.content?.slice(0, 50) || 'Chat')
      }
      fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: all.map(m => ({ role: m.role, content: m.content })) }),
      }).then(() => setHasMemory(true)).catch(() => {})
    },
  })

  // Khởi tạo SpeechRecognition (Web Speech API)
  const startVoice = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Trình duyệt không hỗ trợ nhận giọng nói. Hãy dùng Chrome hoặc Edge.')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'vi-VN'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      if (transcript.trim()) {
        // Auto-submit ngay sau khi nhận giọng
        append({ role: 'user', content: transcript.trim() })
      }
    }
    recognition.start()
  }, [append])

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  // TTS — đọc tin nhắn AI bằng browser SpeechSynthesis
  const [speakingId, setSpeakingId] = useState<string | null>(null)

  const speak = useCallback((msgId: string, text: string) => {
    if (!window.speechSynthesis) return
    // Đang đọc msg này → dừng
    if (speakingId === msgId) {
      window.speechSynthesis.cancel()
      setSpeakingId(null)
      return
    }
    // Dừng msg cũ nếu đang đọc
    window.speechSynthesis.cancel()

    // Loại bỏ markdown và ký tự đặc biệt trước khi đọc
    const clean = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,3}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/gi, '')
      .trim()

    const utter = new SpeechSynthesisUtterance(clean)
    utter.lang = 'vi-VN'
    utter.rate = 1.05
    utter.pitch = 1

    // Ưu tiên giọng Việt nếu có
    const voices = window.speechSynthesis.getVoices()
    const viVoice = voices.find(v => v.lang.startsWith('vi'))
    if (viVoice) utter.voice = viVoice

    utter.onstart = () => setSpeakingId(msgId)
    utter.onend = () => setSpeakingId(null)
    utter.onerror = () => setSpeakingId(null)

    window.speechSynthesis.speak(utter)
  }, [speakingId])

  // Dừng TTS khi user navigate đi
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel() }
  }, [])

  useEffect(() => {
    fetch('/api/memory')
      .then(r => r.json())
      .then(d => { if (d.memory) setHasMemory(true) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      setInput(initialMessage)
      setTimeout(() => {
        const form = document.getElementById('chat-form') as HTMLFormElement
        form?.requestSubmit()
      }, 100)
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-focus input on mount and when conversationId changes
  useEffect(() => {
    inputRef.current?.focus()
  }, [conversationId])

  const insertEmoji = (emoji: string) => {
    const ta = inputRef.current
    if (!ta) {
      setInput(prev => prev + emoji)
      setShowEmojiPanel(false)
      return
    }
    const start = ta.selectionStart ?? input.length
    const end = ta.selectionEnd ?? input.length
    const newVal = input.slice(0, start) + emoji + input.slice(end)
    setInput(newVal)
    setShowEmojiPanel(false)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + emoji.length
      ta.selectionStart = pos
      ta.selectionEnd = pos
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) {
        handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>)
      }
    }
  }

  // Dynamic prompts cho 'general' (theo giờ VN), static cho các category cụ thể
  const quickPrompts = useMemo(() => {
    if (category === 'general' || !QUICK_PROMPTS[category]) {
      const vnHour = (new Date().getUTCHours() + 7) % 24
      const vnDay = new Date().getUTCDay()
      return getDynamicPrompts(vnHour, vnDay, null, 3).map(p => p.text)
    }
    return QUICK_PROMPTS[category]
  }, [category])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-3xl">{catInfo?.emoji || '🤖'}</span>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{catInfo?.label || 'TappyAI'}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Tôi có thể giúp bạn tìm thông tin chính xác</p>
                {hasMemory && (
                  <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-medium">
                    🎯 Đã cá nhân hóa cho bạn
                  </span>
                )}
              </div>
              <div className="w-full space-y-2">
                {quickPrompts.map((prompt) => (
                  <button key={prompt} onClick={() => append({ role: 'user', content: prompt })} className="w-full text-left px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm transition-all border border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <Sparkles size={14} className="text-primary-400 flex-shrink-0" />
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-6">
            {messages.map((msg) => {
              if (msg.role === 'assistant') {
                const { text, buttons } = parseCTA(msg.content)
                return (
                  <div key={msg.id} className="animate-slide-up flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-[11px] font-bold">T</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] leading-[1.6] text-gray-800 dark:text-gray-100 pt-0.5">
                        <div className="message-content whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatMessage(text) }} />
                      </div>
                      {/* Nút loa TTS */}
                      <button
                        onClick={() => speak(msg.id, text)}
                        className={cn(
                          'mt-1.5 flex items-center gap-1 text-xs transition-colors',
                          speakingId === msg.id
                            ? 'text-primary-500'
                            : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400'
                        )}
                      >
                        {speakingId === msg.id
                          ? <><VolumeX size={13} /> Dừng đọc</>
                          : <><Volume2 size={13} /> Đọc to</>
                        }
                      </button>
                      {buttons.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {buttons.map((btn, i) => (
                            <a
                              key={i}
                              href={btn.url}
                              target={btn.type === 'internal_booking' ? undefined : '_blank'}
                              rel={btn.type === 'internal_booking' ? undefined : 'noopener noreferrer'}
                              onClick={() => logCTAClick(btn)}
                              className={cn(
                                'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                                btn.primary
                                  ? 'bg-primary-500 hover:bg-primary-600 text-white shadow-sm shadow-primary-200 dark:shadow-primary-900/30'
                                  : 'border border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'
                              )}
                            >
                              {btn.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              return (
                <div key={msg.id} className="animate-slide-up flex justify-end">
                  <div className="max-w-[85%] bg-primary-500 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-[1.6]">
                    <div className="message-content whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                  </div>
                </div>
              )
            })}
            {isLoading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-[11px] font-bold">T</span>
                </div>
                <div className="flex items-center h-7 gap-1">
                  <span className="typing-dot text-gray-400" />
                  <span className="typing-dot text-gray-400" />
                  <span className="typing-dot text-gray-400" />
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
        {/* Emoji panel overlay — click outside to close */}
        {showEmojiPanel && (
          <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPanel(false)} />
        )}
        <form id="chat-form" onSubmit={handleSubmit} className="max-w-2xl mx-auto w-full flex gap-2 items-end">
          <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                handleInputChange(e)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder="Nhắn tin với TappyAI..."
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-none transition-all overflow-hidden"
            />
          {/* Nút emoji */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowEmojiPanel(v => !v)}
              className={cn(
                'w-11 h-11 rounded-2xl flex items-center justify-center transition-all',
                showEmojiPanel
                  ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-500'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-accent-50 dark:hover:bg-accent-900/20 hover:text-accent-500'
              )}
              aria-label="Chọn emoji"
            >
              <Smile size={20} />
            </button>
            {/* Emoji panel */}
            {showEmojiPanel && (
              <div className="absolute bottom-14 right-0 z-20 w-64 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/60 dark:shadow-black/40 p-3">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-0.5">Chọn biểu cảm</p>
                <div className="grid grid-cols-6 gap-1">
                  {EMOTES.map((emote) => (
                    <button
                      key={emote.id}
                      type="button"
                      title={emote.label}
                      onClick={() => insertEmoji(emote.emoji)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-90"
                    >
                      <emote.Component size={30} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Nút microphone màu cam #FF9500 */}
          <button
            type="button"
            onClick={isListening ? stopVoice : startVoice}
            disabled={isLoading}
            className={cn(
              'w-11 h-11 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-40',
              isListening
                ? 'bg-[#FF9500] animate-pulse shadow-lg shadow-orange-300/50'
                : 'bg-gray-100 dark:bg-gray-800 hover:bg-orange-50 dark:hover:bg-orange-900/20'
            )}
          >
            {isListening
              ? <MicOff size={18} className="text-white" />
              : <Mic size={18} className="text-[#FF9500]" />
            }
          </button>
          <button type="submit" disabled={isLoading || !input.trim()} className="w-11 h-11 rounded-2xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0">{isLoading ? <Loader2 size={18} className="text-white animate-spin" /> : <Send size={18} className="text-white" />}</button>
        </form>
      </div>
    </div>
  )
}
