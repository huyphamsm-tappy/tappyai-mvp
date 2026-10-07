// The web microphone switch (Settings → Micrô). ON unless the user turned it off.
export const MIC_ENABLED_KEY = 'tappy_mic_enabled'
export function readMicEnabled(): boolean {
  try { return localStorage.getItem(MIC_ENABLED_KEY) !== '0' } catch { return true }
}
