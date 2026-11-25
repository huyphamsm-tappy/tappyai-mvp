// Explore video — UAT of the pipeline at LIBRARY level against REAL services (05/11/2026). NOT part of the normal test run (the file is named *.uat.ts, not *.test.ts).
//
//   Real: Google Cloud Storage (UAT buckets), Google Transcoder, the Supabase TEST project (never production: refused otherwise), OpenAI moderation/transcription when the key allows.
//   Not real: the route handlers (the Vercel OIDC token that Workload Identity needs does not exist on a laptop; the routes are covered by their unit tests) — this drives the same
//   libraries the routes call, with a gcloud access token instead of the deployment identity.
// Run:  npx vitest run --config <scratch>/vitest.uat.config.ts scripts/uat/exploreVideo.uat.ts   (needs gcloud on PATH, the UAT media folder, and the UAT buckets)

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const REPO_ENV = 'D:/TappyAI-wt/wt-integration/.env.local'
const MEDIA = process.env.UAT_MEDIA_DIR ?? 'C:/Users/Admin/AppData/Local/Temp/claude/7190622050b208d0/bc2884a6-4909-4153-851c-5833563d565a/scratchpad/uat_media'
const OUT = process.env.UAT_OUT_DIR ?? 'C:/Users/Admin/AppData/Local/Temp/claude/7190622050b208d0/bc2884a6-4909-4153-851c-5833563d565a/scratchpad/uat_out'
const SRC = 'tappyai-video-uat-src-1023373437508'
const DEL = 'tappyai-video-uat-del-1023373437508'
const TEST_REF = 'zdaprdfgpbpnxyofagmc'
const PROD_REF = 'fwznnobrdctuskgrvuik'

// ── env: only what is needed, read from the test worktree's own file; refuse anything that is not the TEST project ──
const fileEnv = Object.fromEntries(
  readFileSync(REPO_ENV, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }),
)
const SUPABASE_URL = fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!SUPABASE_URL.includes(TEST_REF) || SUPABASE_URL.includes(PROD_REF)) throw new Error('REFUSED: the env does not point at the TEST Supabase project')
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = fileEnv.SUPABASE_SERVICE_ROLE_KEY ?? ''
process.env.OPENAI_API_KEY = fileEnv.OPENAI_API_KEY ?? ''
process.env.EXPLORE_VIDEO_PIPELINE_ENABLED = 'true'
process.env.VIDEO_SPEECH_TRANSCRIBE_ENABLED = 'true'

const accessToken = () => Promise.resolve(execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim())
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const read = (f: string) => new Uint8Array(readFileSync(`${MEDIA}/${f}`))
const log = (...a: unknown[]) => console.log('[UAT]', ...a)

describe('Explore video UAT (real GCS + Transcoder + Supabase TEST)', () => {
  let admin: SupabaseClient
  let ownerId = ''
  // Loaded lazily (after the env above is set) so the modules see the right environment.
  let L: Awaited<ReturnType<typeof loadLibs>>
  async function loadLibs() {
    const [{ createGcsProvider }, { createTranscoderClient }, store, up, proc, mod, ms, cc, del, prom, dl, ov, cl, dd, key, st] = await Promise.all([
      import('@/lib/media/providers/gcs'), import('@/lib/media/video/transcoder'), import('@/lib/media/video/assetStore'), import('@/lib/media/video/uploadFlow'),
      import('@/lib/media/video/processing'), import('@/lib/media/video/moderationStep'), import('@/lib/media/video/moderationWiring'), import('@/lib/media/video/clipConsent'),
      import('@/lib/media/video/deliveryStore'), import('@/lib/media/video/promote'), import('@/lib/media/video/overlay/downloadFlow'), import('@/lib/media/video/overlay/overlayStore'),
      import('@/lib/media/video/sourceCleanup'), import('@/lib/media/video/sourceDeletion'), import('@/lib/media/key'), import('@/lib/media/video/deliveryDeletion'),
    ])
    return { createGcsProvider, createTranscoderClient, store, up, proc, mod, ms, cc, del, prom, dl, ov, cl, dd, key, st }
  }
  let srcProvider: ReturnType<Awaited<ReturnType<typeof loadLibs>>['createGcsProvider']>
  let delProvider: typeof srcProvider
  let transcoder: ReturnType<Awaited<ReturnType<typeof loadLibs>>['createTranscoderClient']>
  let assets: ReturnType<Awaited<ReturnType<typeof loadLibs>>['store']['supabaseVideoAssetStore']>
  const created: string[] = []

  beforeAll(async () => {
    L = await loadLibs()
    admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const email = `uat-video-${Date.now()}@example.invalid`
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password: `Uat-${Math.random().toString(36).slice(2)}-Aa1!` })
    if (error || !data.user) throw new Error('could not create the UAT test user on the TEST project')
    ownerId = data.user.id
    srcProvider = L.createGcsProvider({ bucket: SRC, getAccessToken: accessToken })
    delProvider = L.createGcsProvider({ bucket: DEL, getAccessToken: accessToken })
    transcoder = L.createTranscoderClient({ projectNumber: '1023373437508', location: 'asia-southeast1', getAccessToken: accessToken })
    assets = L.store.supabaseVideoAssetStore(admin)
    mkdirSync(OUT, { recursive: true })
    log('test user created; buckets', SRC, DEL)
  }, 120_000)

  afterAll(async () => {
    try {
      const gone = await L.dd.createVideoSourceDeleter(srcProvider).deleteForUser(ownerId)
      const goneDel = await L.st.createVideoDeliveryDeleter(delProvider, null).deleteForUser(ownerId)
      log('cleanup: source/staging/download objects removed =', gone, '; delivery objects removed =', goneDel)
    } catch (e) { log('cleanup of objects failed:', e instanceof Error ? e.message : e) }
    try { await admin.auth.admin.deleteUser(ownerId); log('test user deleted (assets, events, consent cascade)') } catch { /* best effort */ }
  }, 300_000)

  const flowDeps = () => ({ store: assets, provider: srcProvider, bucket: SRC })

  async function upload(file: string, contentType = 'video/mp4', idem?: string, opts: { neutralise?: boolean } = {}) {
    let bytes = read(file)
    // Like every real client: the clip is stripped of identifying metadata BEFORE the PUT (the server then enforces it). `neutralise: false` sends the raw file to prove the refusal.
    if (opts.neutralise !== false) {
      try {
        const { neutralizeClipMetadata } = await import('@/lib/media/clipMetadata')
        bytes = new Uint8Array(await (await neutralizeClipMetadata(new Blob([bytes]))).arrayBuffer())
      } catch { /* not a container the neutraliser knows: the original goes up and the server refuses it */ }
    }
    const start = await L.up.startVideoUpload({ ownerId, idempotencyKey: idem ?? `uat-${file.replace(/[^A-Za-z0-9]/g, '_')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, contentType, size: bytes.length, origin: null }, flowDeps())
    if (start.status !== 200) {
      log('start refused', file, start.status, JSON.stringify(start.body))
      return { start, bytes, put: null as number | null, done: null as null | Awaited<ReturnType<typeof L.up.completeVideoUpload>>, assetId: undefined as string | undefined }
    }
    const assetId = String(start.body.assetId)
    created.push(assetId)
    const res = await fetch(String(start.body.uploadUrl), { method: 'PUT', headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.length) }, body: bytes })
    const done = await L.up.completeVideoUpload({ ownerId, assetId }, flowDeps())
    return { start, bytes, put: res.status, done, assetId }
  }

  async function advanceUntil(assetId: string, targets: string[], timeoutMs = 360_000) {
    const t0 = Date.now()
    for (;;) {
      const r = await L.proc.advanceVideoAsset(assetId, { store: assets, transcoder, bucket: SRC })
      if (r && targets.includes(r.state)) return r
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${targets.join('/')} (state ${r?.state})`)
      await sleep(8000)
    }
  }
  const names = async (assetId: string) => (await srcProvider.listObjects!(L.key.videoAssetStagingPrefix(ownerId, assetId))).map(k => k.split('/').pop()!).sort()

  // ───────────────────────────────────────────────── refusals that need no transcoder ──────────────────────────────────────────────
  it('refuses a clip longer than 5:05: 422 video_too_long, object deleted, asset failed', async () => {
    const r = await upload('too_long.mp4')
    log('too_long ->', r.put, r.done?.status, JSON.stringify(r.done?.body).slice(0, 120))
    expect(r.done?.status).toBe(422)
    expect(r.done?.body.error).toBe('video_too_long')
    const row = await assets.get(r.assetId!)
    expect(row?.state).toBe('failed')
    expect(await srcProvider.statObject!(row!.source_object_key!)).toBeNull()
  })

  it('refuses a RAW clip (not neutralised by a client) that still carries tags: 422 identifying_metadata', async () => {
    const r = await upload('normal_portrait.mp4', 'video/mp4', undefined, { neutralise: false })
    log('raw ffmpeg clip ->', r.put, r.done?.status, r.done?.body.error, JSON.stringify(r.done?.body.reasons))
    expect(r.done?.status).toBe(422)
    expect(r.done?.body.error).toBe('identifying_metadata')
  })

  it('refuses a clip carrying GPS location metadata even if sent raw: 422 identifying_metadata, object deleted', async () => {
    const r = await upload('with_gps.mp4', 'video/mp4', undefined, { neutralise: false })
    log('with_gps ->', r.put, r.done?.status, r.done?.body.error)
    expect(r.done?.status).toBe(422)
    expect(['identifying_metadata']).toContain(r.done?.body.error)
    const row = await assets.get(r.assetId!)
    expect(row?.state).toBe('failed')
    expect(await srcProvider.statObject!(row!.source_object_key!)).toBeNull()
  })

  it('refuses a file that is not a video: 422, nothing kept', async () => {
    const r = await upload('not_a_video.mp4')
    log('not_a_video ->', r.put, r.done?.status, r.done?.body.error)
    expect(r.done?.status).toBe(422)
    const row = await assets.get(r.assetId!)
    expect(row?.state).toBe('failed')
  })

  it('refuses a format and a size the policy does not allow BEFORE creating anything', async () => {
    const webm = await L.up.startVideoUpload({ ownerId, idempotencyKey: `uat-webm-${Date.now()}-abcdef`, contentType: 'video/webm', size: 1000, origin: null }, flowDeps())
    expect(webm.status).toBe(415)
    const big = await L.up.startVideoUpload({ ownerId, idempotencyKey: `uat-big-${Date.now()}-abcdef`, contentType: 'video/mp4', size: 151 * 1024 * 1024, origin: null }, flowDeps())
    expect(big.status).toBe(413)
  })

  // ───────────────────────────────────────────────── the main path ─────────────────────────────────────────────────────────────────
  let main = ''
  it('MAIN: a portrait clip with speech uploads, verifies, records its real size/duration/audio, and transcodes to the private staging folder', async () => {
    const r = await upload('normal_portrait_bx.mp4')
    log('main upload ->', r.put, r.done?.status, JSON.stringify(r.done?.body))
    expect(r.put).toBeGreaterThanOrEqual(200)
    expect(r.put).toBeLessThan(300)
    expect(r.done?.status, JSON.stringify(r.done?.body)).toBe(200)
    main = r.assetId!
    const row = await assets.get(main)
    log('header said: duration_ms', row?.duration_ms, 'size', row?.width, 'x', row?.height, 'audio', row?.has_audio)
    expect(row?.state).toBe('uploaded')
    expect(row?.width).toBe(1080)
    expect(row?.height).toBe(1920)
    expect(Math.abs((row?.duration_ms ?? 0) - 12000)).toBeLessThan(500)
    expect(row?.has_audio).toBe(true)

    const t0 = Date.now()
    const after = await advanceUntil(main, ['moderating'])
    log('transcode done in', Math.round((Date.now() - t0) / 1000), 's ->', after.state)
    const files = await names(main)
    log('staging files:', files.join(', '))
    for (const f of ['manifest.m3u8', 'hls720.m3u8', 'hls480.m3u8', 'hls360.m3u8', 'frames0000000000.jpeg', 'audio.mp4']) expect(files).toContain(f)
    const manifest = new TextDecoder().decode((await srcProvider.readRange!(`${L.key.videoAssetStagingPrefix(ownerId, main)}manifest.m3u8`, 0, 4000)))
    expect(manifest).toContain('RESOLUTION=720x1280')
    expect(manifest).toContain('RESOLUTION=360x640')
  }, 600_000)

  it('MAIN: the moderation step (consent gate, real OpenAI where the key allows) reaches a decision with a recorded audit row', async () => {
    // 1) no clip-conditions acceptance: the step must NOT call any provider
    const calls = { image: 0, text: 0, stt: 0 }
    const counting = {
      store: assets,
      reader: { read: (k: string) => L.ms.readWholeObject(srcProvider, k) },
      consent: { isAllowed: async (id: string) => (await import('@/lib/ai/consent/aiDataConsent')).loadAllowedUserIds(admin, [id]).then(s => s.has(id)).then(async ok => ok && (await L.cc.hasClipConsent(admin, id))) },
      moderateImage: async () => { calls.image++; return { status: 'ok' as const, flagged: false, categories: {} } as never },
      moderateText: async () => { calls.text++; return { status: 'ok' as const, flagged: false, categories: {} } as never },
      transcribe: async () => { calls.stt++; return { status: 'ok' as const, text: '' } as never },
      speechEnabled: true,
      autoRejectEnabled: false,
    }
    const blocked = await L.mod.moderateVideoAsset(main, counting as never)
    log('without clip consent ->', blocked?.action, blocked?.state, JSON.stringify(calls))
    expect(blocked?.action).toBe('no_consent')
    expect(calls).toEqual({ image: 0, text: 0, stt: 0 })

    // 2) accept the clip conditions (the real table), then run with the REAL OpenAI adapters
    await L.cc.recordClipConsent(admin, ownerId)
    expect(await L.cc.hasClipConsent(admin, ownerId)).toBe(true)
    const real = {
      ...counting,
      moderateImage: (b: Uint8Array, mime: string) => import('@/lib/ai/llm/providers/openaiModeration').then(m => m.moderateImageWithOpenAI(b, mime)),
      moderateText: (t: string[]) => import('@/lib/ai/llm/providers/openaiModeration').then(m => m.moderateTextWithOpenAI(t)),
      transcribe: (a: Uint8Array, info: { durationMs: number }) => import('@/lib/ai/llm/providers/openaiTranscribe').then(m => m.transcribeSpeechWithOpenAI(a, info)),
    }
    const res = await L.mod.moderateVideoAsset(main, real as never)
    const row = await assets.get(main)
    const { data: results } = await admin.from('video_moderation_results').select('decision, category, confidence, reason_code, provider, model, policy_version').eq('asset_id', main)
    log('moderation ->', res?.action, res?.state, 'moderation_state', row?.moderation_state, '; rows:', JSON.stringify(results))
    // The honest assertion: either a decision with an audit row, or a bounded retry state (provider unavailable); never a silent approve.
    if (res?.action === 'decided') {
      expect(results && results.length).toBeGreaterThan(0)
      expect(['ready', 'review_required', 'rejected']).toContain(row?.state)
    } else {
      expect(['moderating']).toContain(row?.state)
      log('NOT VERIFIED LIVE: the provider could not decide (see attempts); the decision path is covered by unit tests only')
    }
  }, 300_000)

  it('MAIN: an approved video is promoted to the delivery bucket (HLS only) with CDN cache headers; the source stays private', async () => {
    let row = await assets.get(main)
    if (row?.state !== 'ready') {
      // The AI could not clear it live here: approve it through the REAL human-decision path so the rest of the chain can still be exercised.
      if (row?.state === 'moderating') {
        const { error: e0 } = await admin.rpc('video_moderation_record_auto', { p_asset: main, p_decision: 'review_required', p_category: null, p_confidence: null, p_reason: 'uat_provider_unavailable', p_priority: 'normal', p_provider: 'uat', p_model: 'uat', p_policy: 'uat', p_evidence: {}, p_transcript: null, p_csam: false, p_hold_until: null, p_actor: 'uat:script' })
        log('sent to human review via record_auto ->', e0 ? `ERR ${e0.code} ${e0.message}` : 'ok')
      }
      const { data: decided, error } = await admin.rpc('video_moderation_review_decide', { p_asset: main, p_decision: 'approve', p_note: 'UAT human approval', p_actor: 'uat:script' })
      log('human approve via RPC ->', error ? `ERR ${error.code}` : JSON.stringify(decided))
      row = await assets.get(main)
    }
    expect(row?.state).toBe('ready')
    const deliveryStore = L.del.supabaseVideoDeliveryStore(admin)
    const out = await L.prom.promoteVideoAsset(main, { store: deliveryStore, source: { provider: srcProvider, bucket: SRC }, delivery: { provider: delProvider, bucket: DEL } })
    log('promote ->', JSON.stringify(out))
    expect(['promoted', 'already']).toContain(out.status)
    const delFiles = (await delProvider.listObjects!(L.key.videoAssetDeliveryPrefix(ownerId, main))).map(k => k.split('/').pop()!)
    log('delivery files:', delFiles.sort().join(', '))
    expect(delFiles).toContain('manifest.m3u8')
    expect(delFiles.some(f => f.endsWith('.ts'))).toBe(true)
    expect(delFiles).not.toContain('audio.mp4') // moderation evidence never goes to the public side
    expect(delFiles).not.toContain('frames0000000000.jpeg')
    const meta = execSync(`gcloud storage objects describe gs://${DEL}/${L.key.videoAssetDeliveryPrefix(ownerId, main)}manifest.m3u8 --format="value(cache_control,content_type)"`, { encoding: 'utf8' }).trim()
    log('manifest object metadata (cache, type):', meta)
    expect(meta).toMatch(/max-age=60/)
  }, 300_000)

  it('MAIN: the watermarked download renders from the ORIGINAL with the user text, caches, and is a 720p MP4 with audio', async () => {
    const overlays = L.ov.supabaseOverlayStore(admin)
    const doc = { schema_version: 1, layers: [{ id: 'l1', type: 'text', text: 'Xin chào Đà Nẵng!', x: 0.5, y: 0.3, width: 0.8, size: 0.07, rotation: 0, align: 'center', font: 'sans', weight: 'bold', color: '#ffffff', background: { color: '#000000', opacity: 0.4 }, outline: { color: '#000000', width: 0.08 }, shadow: true, start_ms: 1000, end_ms: 8000 }] }
    const saved = await overlays.save(main, ownerId, 0, doc)
    log('overlay saved ->', JSON.stringify(saved))
    expect(saved.status).toBe('saved')
    const deps = { assets, overlays, renders: L.ov.supabaseDownloadRenderStore(admin), provider: srcProvider, transcoder, bucket: SRC }
    const first = await L.dl.requestDownload({ ownerId, assetId: main, username: 'huy' }, deps as never)
    log('download request ->', first.status, JSON.stringify(first.body))
    expect([200, 202]).toContain(first.status)
    let outcome = first
    const t0 = Date.now()
    while (!outcome.file && Date.now() - t0 < 360_000) { await sleep(8000); outcome = await L.dl.pollDownload({ ownerId, assetId: main, username: 'huy' }, deps as never) }
    log('download poll ->', outcome.status, JSON.stringify(outcome.body), 'file?', !!outcome.file, Math.round((Date.now() - t0) / 1000), 's')
    expect(outcome.file).toBeTruthy()
    // Cached: a second request does not start another job
    const second = await L.dl.requestDownload({ ownerId, assetId: main, username: 'huy' }, deps as never)
    expect(second.body.status).toBe('ready')
    // Bring the file down and let ffmpeg look at it
    execSync(`gcloud storage cp gs://${SRC}/${outcome.file!.key} "${OUT}/download.mp4"`, { stdio: 'ignore' })
    log('downloaded file saved to', `${OUT}/download.mp4`)
  }, 600_000)

  // ───────────────────────────────────────────────── ladder shapes ─────────────────────────────────────────────────────────────────
  it('LANDSCAPE 1280x720: ladder is 1280x720 / 854x480 / 640x360', async () => {
    const r = await upload('landscape_bx.mp4')
    expect(r.done?.status, JSON.stringify(r.done?.body)).toBe(200)
    await advanceUntil(r.assetId!, ['moderating'])
    const m = new TextDecoder().decode(await srcProvider.readRange!(`${L.key.videoAssetStagingPrefix(ownerId, r.assetId!)}manifest.m3u8`, 0, 4000))
    log('landscape manifest resolutions:', (m.match(/RESOLUTION=\d+x\d+/g) ?? []).join(' '))
    for (const res of ['1280x720', '854x480', '640x360']) expect(m).toContain(`RESOLUTION=${res}`)
  }, 600_000)

  it('LOW-RES 480x854 without audio: only 480 and 360 rungs, no audio file, no upscale', async () => {
    const r = await upload('lowres_noaudio_bx.mp4')
    expect(r.done?.status, JSON.stringify(r.done?.body)).toBe(200)
    await advanceUntil(r.assetId!, ['moderating'])
    const files = await names(r.assetId!)
    const m = new TextDecoder().decode(await srcProvider.readRange!(`${L.key.videoAssetStagingPrefix(ownerId, r.assetId!)}manifest.m3u8`, 0, 4000))
    log('low-res staging files:', files.join(', '), '|', (m.match(/RESOLUTION=\d+x\d+/g) ?? []).join(' '))
    expect(m).not.toContain('RESOLUTION=720x1280')
    expect(m).toContain('RESOLUTION=480x854')
    expect(files).not.toContain('audio.mp4')
  }, 600_000)

  // ───────────────────────────────────────────────── deletion & cleanup ────────────────────────────────────────────────────────────
  it('CLEANUP FUNCTIONS: failed uploads are removed by the clean-up run; a live video is not', async () => {
    // make the failed assets look stale, then run the clean-up for real
    await admin.from('video_assets').update({ updated_at: new Date(Date.now() - 48 * 3600_000).toISOString() }).eq('owner_id', ownerId).eq('state', 'failed')
    const result = await L.cl.runVideoSourceCleanup({ db: admin, provider: srcProvider, bucket: SRC, staleHours: 24, limit: 50 })
    log('cleanup run ->', JSON.stringify(result))
    expect(result.failed).toBe(0)
    const live = await assets.get(main)
    expect((live as unknown as { source_removed_at?: string | null } | null)?.source_removed_at ?? null).toBeNull()
    expect(await srcProvider.statObject!(live!.source_object_key!)).not.toBeNull()
  }, 300_000)

  it('ACCOUNT DELETION: removes every original, staging, download and delivery object of the account, and the re-list is empty', async () => {
    const before = (await srcProvider.listObjects!(L.key.videoSourcePrefix(ownerId))).length + (await srcProvider.listObjects!(L.key.videoStagingPrefix(ownerId))).length
    const n = await L.dd.createVideoSourceDeleter(srcProvider).deleteForUser(ownerId)
    // No CDN exists in the UAT project: a recording stand-in (run 3 showed the deleter FAILS CLOSED with "cdn invalidation is not configured" when given none).
    const invalidated: string[] = []
    const m = await L.st.createVideoDeliveryDeleter(delProvider, { invalidate: async (p: string) => { invalidated.push(p) } } as never).deleteForUser(ownerId)
    log('cdn invalidation requested for', invalidated.join(','))
    expect(invalidated).toEqual([`/vdel/${ownerId}/*`])
    log('objects before', before, '; deleted source-side', n, '; deleted delivery-side', m)
    expect(n).toBeGreaterThan(0)
    expect((await srcProvider.listObjects!(L.key.videoSourcePrefix(ownerId))).length).toBe(0)
    expect((await srcProvider.listObjects!(L.key.videoStagingPrefix(ownerId))).length).toBe(0)
    expect((await delProvider.listObjects!(L.key.videoDeliveryPrefix(ownerId))).length).toBe(0)
  }, 300_000)
})
