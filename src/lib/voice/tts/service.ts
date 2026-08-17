// ── Voice service wiring ─────────────────────────────────────────────────────
//
// Builds the TTS provider from environment configuration, using a SEPARATE service account from the
// media/GCS one. That separation is the point: the media identity holds storage permissions and
// nothing else, the voice identity holds `roles/speech.client` and nothing else, and neither can do
// the other's job if it is ever compromised.
//
// The credential path is the same proven one the media bridge uses — Vercel OIDC → STS → impersonate
// — so no new key material exists anywhere and nothing is stored on disk. Only the service account
// and the scope differ.
//
// The cache and metrics are module-level on purpose: they must survive across requests within a
// warm serverless instance, which is exactly where repeated playback of the same reply happens.

import { createWifTokenSource, readDeploymentOidcToken } from '@/lib/media/gcpAuth'
import { SELECTED_VOICE } from '../googleVoices'
import { createGoogleTtsProvider, TTS_SCOPE, type GoogleTtsProvider } from './googleTts'
import { createTtsCache } from './cache'
import { createTtsMetrics } from './metrics'

/** Shared across requests in a warm instance — where the repeat-playback wins actually occur. */
const cache = createTtsCache()
const metrics = createTtsMetrics()

export function ttsMetricsSnapshot() {
  return metrics.snapshot()
}

export interface VoiceEnvConfig {
  projectNumber: string
  poolId: string
  providerId: string
  serviceAccountEmail: string
}

/** Reads the voice identity from env. Returns null when the deployment has not been configured. */
export function readVoiceConfig(env: NodeJS.ProcessEnv = process.env): VoiceEnvConfig | null {
  const projectNumber = env.GCP_PROJECT_NUMBER
  const poolId = env.GCP_WIF_POOL
  const providerId = env.GCP_WIF_PROVIDER
  // Its own variable — never falls back to the media service account. A fallback here would quietly
  // route TTS through the storage identity and defeat the split.
  const serviceAccountEmail = env.GCP_VOICE_SERVICE_ACCOUNT
  if (!projectNumber || !poolId || !providerId || !serviceAccountEmail) return null
  return { projectNumber, poolId, providerId, serviceAccountEmail }
}

/** True when both the credential path and a chosen voice are in place. */
export function isVoiceServiceReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return readVoiceConfig(env) !== null
}

/**
 * The provider, or null when the deployment is not configured for voice.
 *
 * Null rather than a throwing stub so a route can answer 503 with a localized message instead of a
 * 500 — an unconfigured deployment is an expected state right now, not a crash.
 */
export function getTtsProvider(
  req?: Request,
  env: NodeJS.ProcessEnv = process.env
): GoogleTtsProvider | null {
  const config = readVoiceConfig(env)
  if (!config) return null

  return createGoogleTtsProvider({
    getAccessToken: createWifTokenSource({
      config,
      getOidcToken: () => readDeploymentOidcToken(req, env),
      // The voice account's own scope. The media account keeps its storage-only default.
      scopes: [TTS_SCOPE],
    }),
    selectedVoice: SELECTED_VOICE,
    cache,
    metrics,
  })
}
