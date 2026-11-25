'use client'

import type { Locale } from '@/lib/i18n/dictionaries'
import { TappyMascot } from '@/components/TappyMascot'

// The language question itself (flags + two buttons), with no opinion on WHERE it is shown:
//   · LanguagePicker.tsx   — the first-visit modal inside the app (the (app) layout mounts it);
//   · LoginLanguageChooser — the same question on /login and /register, BEFORE the person signs in.
// Bilingual on purpose so it reads whatever the visitor's language is. The flags are drawn as SVG on
// purpose: flag emoji render as two letters ("VN", "GB") on Windows, which is where many visitors are.

export function FlagVN({ className = 'h-6 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={`${className} rounded-[3px] shadow-sm`} role="img" aria-label="Vietnam">
      <rect width="30" height="20" fill="#DA251D" />
      <polygon fill="#FFFF00" points="15,4 16.8,8.9 22,9.1 17.9,12.3 19.3,17.3 15,14.4 10.7,17.3 12.1,12.3 8,9.1 13.2,8.9" />
    </svg>
  )
}

export function FlagUK({ className = 'h-6 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" className={`${className} rounded-[3px] shadow-sm`} role="img" aria-label="United Kingdom">
      <clipPath id="tappy-flag-uk-s"><path d="M0,0 v30 h60 v-30 z" /></clipPath>
      <clipPath id="tappy-flag-uk-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <g clipPath="url(#tappy-flag-uk-s)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#tappy-flag-uk-t)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  )
}

const OPTION =
  'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 border-gray-100 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950/30 active:scale-[0.98] transition-all'

export default function LanguageChoiceModal({ onChoose }: { onChoose: (lang: Locale) => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="tappy-language-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
        <div className="text-center mb-5">
          <div className="flex justify-center mb-2">
            <TappyMascot pose="welcome" size={72} eager animated />
          </div>
          <h2 id="tappy-language-title" className="text-lg font-bold text-gray-900 dark:text-white">Chọn ngôn ngữ</h2>
          <p className="text-sm text-content-secondary">Choose your language</p>
        </div>
        <div className="space-y-3">
          <button type="button" onClick={() => onChoose('vi')} className={OPTION}>
            <FlagVN />
            <span className="font-semibold text-gray-900 dark:text-white">Tiếng Việt</span>
          </button>
          <button type="button" onClick={() => onChoose('en')} className={OPTION}>
            <FlagUK />
            <span className="font-semibold text-gray-900 dark:text-white">English</span>
          </button>
        </div>
      </div>
    </div>
  )
}
