'use client'

// Ascending "ting" chime (C5 → E5 → G5) followed by "Tappy" spoken via vi-VN TTS.
// Plays only when the page is in foreground — background push uses OS sound.
export function playTappyChime(): void {
  if (typeof window === 'undefined') return

  const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (AudioCtx) {
    const ctx = new AudioCtx()
    const notes = [523.25, 659.25, 783.99] // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = ctx.currentTime + i * 0.13
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(0.28, t0 + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45)
      osc.start(t0)
      osc.stop(t0 + 0.45)
    })
  }

  // Say "Tappy" in Vietnamese after the chime finishes
  if (window.speechSynthesis) {
    setTimeout(() => {
      const utter = new SpeechSynthesisUtterance('Tappy')
      utter.lang = 'vi-VN'
      utter.rate = 1
      const voices = window.speechSynthesis.getVoices()
      const viVoice = voices.find(v => v.lang.startsWith('vi'))
      if (viVoice) utter.voice = viVoice
      window.speechSynthesis.speak(utter)
    }, 450)
  }
}
