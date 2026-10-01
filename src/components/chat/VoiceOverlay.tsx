'use client'

import { Square, Mic, Send, X, AudioLines } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// The voice screen (owner 01/10, mockup 03 «Voice / Chat Input Active»; docs/design/voice/).
//
// Presentational only: ChatInterface owns the recognition session (the shared voice contract lives there) and passes state in.
//   · the bottom box shows the SAMPLE sentence until recognition produces text, then the recognised text replaces it;
//   · the sample is never sent and never copied into the input (Send is disabled while `text` is blank);
//   · the centre button stops listening (keeps the text) — when stopped it starts listening again;
//   · «Hủy» discards, «Gửi» sends the recognised text.

interface Props {
  listening: boolean
  text: string
  error: string | null
  firstUse: boolean
  onToggle: () => void
  onCancel: () => void
  onSend: () => void
}

export default function VoiceOverlay({ listening, text, error, firstUse, onToggle, onCancel, onSend }: Props) {
  const { t } = useTranslation()
  const hasText = text.trim().length > 0
  return (
    <div role="dialog" aria-modal="true" aria-label={t('voice.overlay.title')} data-voice-overlay
      className="absolute inset-0 z-40 flex flex-col items-center overflow-y-auto px-5 pb-6 pt-4 text-white"
      style={{ background: 'radial-gradient(120% 80% at 50% 25%, #121a3a 0%, #070b1c 60%, #04060f 100%)' }}>
      <img src="/tappy/wave.png" alt="" width={190} height={190} className="mt-2 h-[170px] w-[170px] select-none object-contain" draggable={false} />
      <h2 className="mt-4 text-[22px] font-extrabold" data-voice-title>{listening ? t('voice.overlay.title') : t('voice.overlay.titlePaused')}</h2>
      <p className="mt-1.5 max-w-[300px] text-center text-[14px] leading-snug text-white/70">{listening ? t('voice.overlay.subtitle') : t('voice.overlay.subtitlePaused')}</p>

      <div className="relative mt-8 flex h-[150px] w-[150px] items-center justify-center">
        {listening && <>
          <span className="voice-ring absolute inset-0 rounded-full" style={{ border: '1.5px solid rgba(139,92,246,.55)' }} />
          <span className="voice-ring voice-ring-2 absolute inset-0 rounded-full" style={{ border: '1.5px solid rgba(139,92,246,.35)' }} />
        </>}
        <span className="absolute inset-3 rounded-full" style={{ background: 'radial-gradient(circle, rgba(124,92,255,.35) 0%, rgba(124,92,255,.08) 70%)' }} />
        <button type="button" onClick={onToggle} data-voice-toggle
          aria-label={listening ? t('voice.stopListening') : t('voice.resume')}
          className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full shadow-[0_0_40px_rgba(124,92,255,.55)]"
          style={{ background: 'linear-gradient(160deg,#8b6cff,#5b3df5)' }}>
          {listening ? <Square size={26} className="fill-white text-white" /> : <Mic size={30} className="text-white" />}
        </button>
      </div>

      <div className="mt-8 flex w-full max-w-[360px] gap-3">
        <button type="button" onClick={onCancel} data-voice-cancel
          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 text-[15px] font-semibold">
          <X size={18} />{t('voice.cancel')}
        </button>
        <button type="button" onClick={onSend} disabled={!hasText} data-voice-send
          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'linear-gradient(160deg,#8b6cff,#5b3df5)' }}>
          <Send size={17} />{t('voice.send')}
        </button>
      </div>

      <div className="mt-5 flex w-full max-w-[360px] items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5" data-voice-box>
        <AudioLines size={22} className={listening ? 'mt-0.5 shrink-0 text-violet-400' : 'mt-0.5 shrink-0 text-white/40'} />
        {hasText
          ? <p className="text-[15px] leading-snug text-white" data-voice-text>{text}</p>
          : <p className="text-[15px] leading-snug text-white/45" data-voice-sample>{t('voice.overlay.example')}</p>}
      </div>

      {error
        ? <p role="alert" className="mt-4 max-w-[340px] text-center text-[13px] text-red-300" data-voice-error>{error}</p>
        : firstUse && <p className="mt-4 max-w-[340px] text-center text-[12.5px] text-white/55" data-voice-reason>{t('voice.overlay.reason')}</p>}

      <style>{`
        @keyframes voiceRing { 0% { transform: scale(.78); opacity: .9 } 100% { transform: scale(1.25); opacity: 0 } }
        .voice-ring { animation: voiceRing 2s ease-out infinite }
        .voice-ring-2 { animation-delay: 1s }
        @media (prefers-reduced-motion: reduce) { .voice-ring { animation: none; opacity: .5 } }
      `}</style>
    </div>
  )
}
