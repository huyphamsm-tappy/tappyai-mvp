'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import {
  Volume2, VolumeX, Copy, Check, ChevronDown, Mic, MicOff, Globe, Languages, FileText, Sparkles,
  ArrowRight, Info, Zap, Users, X, Loader2, AlertCircle, type LucideIcon,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { inputLocaleFor } from '@/lib/voice/config'
import TappyPresence from '@/components/v3/TappyPresence'

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

/** The route's `too_long` guard is 2000; the textarea's maxLength and the counter say the same number. */
const MAX_CHARS = 2000

/**
 * Three supporting claims, each one true of the code above: the request is a single round trip,
 * `LANGUAGES` holds the targets, and the route requires no account while the result card reads aloud.
 * The reference's "accurate" tile is a quality claim no model can promise, so it is not a tile.
 */
const FEATURES: { titleKey: string; descKey: string; icon: LucideIcon; tone: 'blue' | 'green' | 'violet' }[] = [
  { titleKey: 'translate.featFast', descKey: 'translate.featFastDesc', icon: Zap, tone: 'blue' },
  { titleKey: 'translate.featLangs', descKey: 'translate.featLangsDesc', icon: Languages, tone: 'green' },
  { titleKey: 'translate.featEasy', descKey: 'translate.featEasyDesc', icon: Users, tone: 'violet' },
]

export default function TranslatePage() {
  const { t, locale } = useTranslation()
  const [inputText, setInputText] = useState('')
  const [targetLang, setTargetLang] = useState('vi')
  const [translation, setTranslation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const voiceBaseRef = useRef('')

  const selectedLang = LANGUAGES.find(l => l.code === targetLang) || LANGUAGES[0]

  // ── Speech input ──────────────────────────────────────────────────────────
  // Dictation feeds the SOURCE box; translation and read-aloud are unchanged downstream. The
  // translated text stays on screen throughout — speech is additive here, never a replacement for
  // something the user can read.
  //
  // Dictation listens in the app language (the shared contract), which is separate from the 30
  // TRANSLATION targets below: we can translate INTO Japanese without being able to listen in it.
  const startVoice = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) { setVoiceError(t('voice.unsupportedBrowser')); return }
    const inputLocale = inputLocaleFor(locale)
    if (!inputLocale) { setVoiceError(t('voice.languageUnsupported')); return }

    setVoiceError('')
    const recognition = new Ctor()
    recognition.lang = inputLocale
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition
    voiceBaseRef.current = inputText ? inputText.replace(/\s+$/, '') + ' ' : ''

    recognition.onstart = () => { setIsListening(true); setVoiceError('') }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false)
      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed': setVoiceError(t('voice.permissionDenied')); break
        case 'no-speech': setVoiceError(t('voice.noSpeech')); break
        case 'audio-capture': setVoiceError(t('voice.audioCapture')); break
        case 'aborted': break // user or unmount stopped it
        default: setVoiceError(t('voice.recognitionError'))
      }
    }
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript
      setInputText(voiceBaseRef.current + transcript)
    }

    setIsListening(true)
    try { recognition.start() } catch { setIsListening(false); setVoiceError(t('voice.startFailed')) }
  }, [inputText, locale, t])

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  // Never leave the microphone open, or a callback pointing at an unmounted page.
  useEffect(() => () => {
    const r = recognitionRef.current
    if (r) {
      r.onstart = null; r.onend = null; r.onerror = null; r.onresult = null
      try { r.abort() } catch { /* already stopped */ }
      recognitionRef.current = null
    }
  }, [])

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
        setError(data.message || t('translate.errorGeneric'))
      } else {
        setTranslation(data.translation)
      }
    } catch {
      setError(t('translate.errorNetwork'))
    } finally {
      setLoading(false)
    }
  }, [inputText, targetLang, t])

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

  const langCount = String(LANGUAGES.length)

  return (
    // `v3-theme` brings the shared tokens to a page that keeps its legacy header and bottom nav.
    <div className="v3-theme v3-tr-page flex min-h-dvh flex-col">
      <Header title={t('translate.headerTitle')} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pt-7" data-tr-main>
        {/* ── Hero ── */}
        <section className="v3-tr-hero" aria-labelledby="tr-hero-title" data-tr-hero>
          <div className="v3-tr-stars" aria-hidden="true" />
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8 md:flex-row md:items-center lg:gap-8">
            <div className="min-w-0 flex-1">
              <span className="v3-tr-eyebrow inline-flex min-h-[36px] items-center gap-2 rounded-full px-4 text-[13px] font-medium">
                <Globe size={15} aria-hidden="true" />
                {t('translate.heroEyebrow')}
              </span>
              <h1 id="tr-hero-title" className="mt-4 text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[40px] lg:text-[46px]">
                {t('translate.heroTitle1')}
                <br />
                <span className="v3-tr-hero-accent">{t('translate.heroTitle2')}</span>
              </h1>
              {/* Both lines are the code's numbers: 30 targets, no account, read-aloud on the result. */}
              <p className="v3-tr-hero-muted mt-4 max-w-[46ch] text-[14.5px] leading-relaxed sm:text-[16px]">
                {t('translate.heroBody', { n: langCount })}
              </p>
              <p className="v3-tr-hero-dim mt-1 text-[13.5px] sm:text-[15px]">{t('translate.heroSubtitle')}</p>
            </div>

            {/* The scene: globe, orbit, greeting bubbles and Tappy waving (the owner's `welcome`
                pose). Illustration — nothing here is a translation of the user's text. */}
            <div className="relative mx-auto h-[230px] w-full max-w-[360px] flex-shrink-0 sm:h-[270px] md:w-[46%] md:max-w-[440px]" aria-hidden="true" data-tr-scene>
              <span className="v3-tr-globe" style={{ width: '68%', height: '68%', right: '-2%', top: '2%', aspectRatio: '1' }} />
              <span className="v3-tr-orbit" style={{ width: '118%', height: '118%', left: '-9%', top: '-8%' }} />
              <span className="v3-tr-bubble" data-tone="blue" style={{ left: '6%', top: '8%' }}>Hello</span>
              {/* The greetings are fixed-language samples; the Vietnamese one is the name of the
                  language the way LANGUAGES spells it — no UI copy is authored here. */}
              <span className="v3-tr-bubble" data-tone="violet" style={{ right: '0%', top: '16%' }} lang="vi">{LANGUAGES[0].name}</span>
              <span className="v3-tr-bubble" data-tone="slate" style={{ left: '0%', top: '50%' }} lang="ja">こんにちは</span>
              <span className="v3-tr-bubble" data-tone="slate" style={{ right: '2%', top: '58%' }} lang="ko">안녕하세요</span>
              <div className="v3-tr-mascot absolute inset-x-0 bottom-0 flex justify-center">
                <TappyPresence pose="welcome" size={230} aura="calm" className="max-w-[210px] sm:max-w-[250px]" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Source text ── */}
        <section className="v3-tr-card mt-5 p-4 sm:mt-6 sm:p-5" aria-labelledby="tr-source-title" data-tr-source>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }} aria-hidden="true">
              <FileText size={17} />
            </span>
            <h2 id="tr-source-title" className="v3-tr-card-title flex-1 text-[12.5px] font-bold uppercase">{t('translate.inputLabel')}</h2>
            {/* The counter and the textarea share MAX_CHARS, which is the route's own limit. */}
            <span className="text-[12.5px] tabular-nums" style={{ color: 'var(--v3-fg-muted)' }} aria-live="polite" data-tr-counter>
              {inputText.length}/{MAX_CHARS}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            id="tr-source"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={t('translate.inputPlaceholder')}
            rows={5}
            maxLength={MAX_CHARS}
            aria-label={t('translate.inputLabel')}
            className="v3-tr-textarea mt-3 w-full resize-none rounded-2xl px-4 py-3.5 text-[15px] leading-relaxed sm:text-[16px]"
          />
          {/* Source language is detected by the model — there is no source selector, and the page says so. */}
          <p className="mt-2 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }} data-tr-source-auto>{t('translate.sourceAuto')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={isListening ? stopVoice : startVoice}
              aria-pressed={isListening}
              aria-label={isListening ? t('voice.stopListening') : t('voice.micHint')}
              title={isListening ? t('voice.stopListening') : t('voice.micHint')}
              className="v3-tr-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold"
              data-tr-voice
            >
              {isListening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
              {isListening ? t('voice.listening') : t('voice.micHint')}
            </button>
            {inputText.trim() && (
              <button
                type="button"
                onClick={() => { setInputText(''); setTranslation(''); setError(''); textareaRef.current?.focus() }}
                className="v3-tr-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold"
              >
                <X size={15} aria-hidden="true" />
                {t('translate.clear')}
              </button>
            )}
          </div>
          {voiceError && (
            <p role="status" className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-[13px]" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--v3-amber)' }}>
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              {voiceError}
            </p>
          )}
        </section>

        {/* ── Target language ── */}
        <section className="relative mt-5" data-tr-target>
          <p id="tr-target-label" className="v3-tr-card-title mb-2 flex items-center gap-2 text-[12.5px] font-bold uppercase">
            <Languages size={15} aria-hidden="true" />
            {t('translate.targetLangLabel')}
          </p>
          <button
            type="button"
            onClick={() => setShowLangPicker(v => !v)}
            aria-haspopup="listbox"
            aria-expanded={showLangPicker}
            aria-labelledby="tr-target-label"
            className="v3-tr-select flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-4 text-left"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }} aria-hidden="true">
              <Globe size={17} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{selectedLang.name}</span>
            <ChevronDown size={18} className={`flex-shrink-0 transition-transform ${showLangPicker ? 'rotate-180' : ''}`} style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true" />
          </button>

          {showLangPicker && (
            <ul
              role="listbox"
              aria-label={t('translate.langPickerLabel')}
              className="v3-tr-menu absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl p-1.5"
            >
              {LANGUAGES.map(lang => (
                <li key={lang.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={lang.code === targetLang}
                    onClick={() => { setTargetLang(lang.code); setShowLangPicker(false) }}
                    className="v3-tr-option flex min-h-[44px] w-full items-center rounded-xl px-3.5 text-left text-[14px]"
                  >
                    {lang.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Translate ── */}
        <button
          type="button"
          onClick={translate}
          disabled={loading || !inputText.trim()}
          className="v3-tr-cta mt-5 flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl px-6 text-[17px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
          data-tr-submit
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
              {t('translate.translating')}
            </>
          ) : (
            <>
              <Sparkles size={20} aria-hidden="true" />
              {t('translate.translateNow')}
              <ArrowRight size={20} aria-hidden="true" />
            </>
          )}
        </button>

        {/* The limit line: DAILY_LIMIT and the no-account fact, from the existing key. */}
        <p className="v3-tr-note mt-4 flex items-center justify-center gap-2 px-4 text-center text-[13px]" data-tr-tip>
          <Info size={15} className="flex-shrink-0" aria-hidden="true" />
          {t('translate.footerTip')}
        </p>

        {/* ── Error ── */}
        {error && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-[14px]"
            style={{ background: 'rgba(248,113,113,0.10)', borderColor: 'var(--v3-rose)', color: 'var(--v3-rose)' }}
          >
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Loading: the result slot shimmers, no percentage is invented ── */}
        {loading && (
          <section className="v3-tr-card v3-tr-result mt-5 p-4 sm:p-5" aria-busy="true" aria-label={t('translate.translating')} data-tr-loading>
            <div className="v3-tr-shimmer h-4 w-1/3" />
            <div className="v3-tr-shimmer mt-4 h-4 w-full" />
            <div className="v3-tr-shimmer mt-2 h-4 w-11/12" />
            <div className="v3-tr-shimmer mt-2 h-4 w-3/4" />
          </section>
        )}

        {/* ── Result ── */}
        {translation && (
          <section className="v3-tr-card v3-tr-result mt-5 p-4 sm:p-5" aria-labelledby="tr-result-title" aria-live="polite" data-tr-result>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }} aria-hidden="true">
                <Languages size={17} />
              </span>
              <h2 id="tr-result-title" className="v3-tr-card-title text-[12.5px] font-bold uppercase" style={{ color: 'var(--v3-accent)' }}>
                {t('translate.resultLabel', { lang: selectedLang.name })}
              </h2>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-[16px] leading-relaxed sm:text-[17px]" style={{ color: 'var(--v3-fg)' }} lang={selectedLang.code}>{translation}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => speak(translation, selectedLang.tts)}
                aria-pressed={speaking}
                className="v3-tr-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold"
                data-tr-speak
              >
                {speaking ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
                {speaking ? t('translate.stopSpeaking') : t('translate.readAloud')}
              </button>
              <button
                type="button"
                onClick={copy}
                className="v3-tr-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold"
                data-tr-copy
              >
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? t('translate.copied') : t('translate.copy')}
              </button>
            </div>
          </section>
        )}

        {/* ── Three true things about this tool ── */}
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3" data-tr-features>
          {FEATURES.map(f => (
            <li key={f.titleKey} className="v3-tr-feat" data-tone={f.tone}>
              <span className="v3-tr-feat-icon" aria-hidden="true"><f.icon size={24} /></span>
              <span className="min-w-0">
                <span className="v3-tr-feat-title block text-[15px] font-bold leading-tight">{t(f.titleKey, { n: langCount })}</span>
                <span className="v3-tr-feat-desc mt-0.5 block text-[12.5px] leading-snug">{t(f.descKey)}</span>
              </span>
            </li>
          ))}
        </ul>
      </main>

      <BottomNav />
    </div>
  )
}
