# Domain 03 — Music (Android ↔ Web parity audit)

**Baseline:** current working tree (uncommitted included), audited against Web prod source (`src/modules/music`, `src/app/sound/[trackId]/page.tsx`, `src/app/api/**`). Web is source of truth.

## Verdict

**Near-complete parity.** Browse / search / detail / play / save / follow / report / use-this-sound and the `{version,trackId,startSec,volume}` review-attach wire contract are all faithfully ported, and music upload is correctly gated off via `TappyComingSoonSheet`. **Two real gaps on the Sound Detail page**, both flagged as migration item 14 and both LEGAL/UX-material: (1) **CC-BY attribution is not rendered on Android** (legal requirement for the Jamendo catalog), and (2) the **"videos using this sound" grid is a text stub** — the DTO does not even parse the `videos[]` the backend returns.

---

## IMPLEMENTED

- `[P3]` Library browse + category tabs + debounced search + infinite pagination — parity with web `/music`.
  EVIDENCE: `android/.../music/MusicLibraryScreen.kt:69-202` (header/search/CategoryTabs/paged list), `MusicApi.kt:19-34` (`api/music/tracks`, `/search`, `/categories`) ↔ web `src/modules/music/api/*`, `src/app/api/music/tracks/route.ts`.
- `[P3]` Preview playback = single-track ExoPlayer seam, mirrors web's single shared `<audio>` (start replaces, toggle pauses/resumes, null-URL no-op).
  EVIDENCE: `android/.../music/AudioPlayer.kt:70-88` ↔ web `page.tsx:122-139` + `MusicRow`/`useMusicTrack`.
- `[P3]` Sound Detail hero: cover, play/pause, title, artist, duration, type badge, trending-rank pill, real stats (video-usage / saved / play counts).
  EVIDENCE: `android/.../music/SoundDetailScreen.kt:166-302`, `SoundDetailViewModel.kt`, `MusicApi.kt:36-42` (`GET api/sound/{id}`, `POST .../play`) ↔ web `page.tsx:190-239`, `src/app/api/sound/[trackId]/route.ts`.
- `[P3]` Save / Follow — optimistic flip + server-count reconcile + revert-on-failure; parity with web `toggle()`.
  EVIDENCE: `SoundDetailViewModel.kt:104-152`, `MusicApi.kt:44-54` (POST/DELETE save & follow) ↔ web `page.tsx:142-168`.
- `[P3]` "Use this sound" → review composer with track pre-attached.
  EVIDENCE: `SoundDetailViewModel.kt:172-177` (`ComposerWithSound(trackId,trackTitle)`) ↔ web `page.tsx:268` (`/reviews/new?sound=<id>`).
- `[P3]` Copyright/abuse report sheet — 4 reasons (copyright/inappropriate/spam/other) + optional details + submit-once + copyright-policy link; wire-identical.
  EVIDENCE: `ReportSoundSheet.kt:32-134`, `MusicApi.kt:56-57`, `MusicDtos.kt:89-92` (`POST api/music/tracks/{id}/report`) ↔ web `page.tsx:83-97,316-355`, `src/app/api/music/tracks/[trackId]/report/route.ts`.
- `[P3]` **Music upload (UGC) correctly GATED OFF** via `TappyComingSoonSheet` (NOT a bug — matches migration item in §4.4).
  EVIDENCE: `MusicLibraryScreen.kt:101-103,195-201` ↔ freeze `11_Android_Migration.md:200` ("Music upload (UGC) | live on Web | `TappyComingSoonSheet`").

---

## MISSING

- `[P1]` **CC-BY attribution line absent on Sound Detail (LEGAL).** Web derives attribution from the track's Jamendo `audioUrl` (`mp3d.jamendo.com/?trackid=<id>`) and renders `"<artist> · CC-BY · Jamendo"` with a link to the source track. Android's Hero shows the type badge but renders no attribution at all, even though `audioUrl` is carried all the way into the domain model.
  EVIDENCE (web): `src/app/sound/[trackId]/page.tsx:51-55` (`attributionFor`), `:213-221` (render). EVIDENCE (android, absent): `music/SoundDetailScreen.kt:166-302` (Hero has no attribution), data available at `music/MusicTrack.kt:16-25` + `MusicMappers.kt:33-52` (`track.audioUrl` mapped but unused for attribution).
  FREEZE-DOC: matches `11_Android_Migration.md:180` item 14 (status `—` = not done). Doc accurate.
- `[P1]` **"Videos using this sound" grid is a text stub; `videos[]` not even parsed.** Web renders a 3-col thumbnail grid of reviews using the sound, each linking to `/reviews/{id}` with a like-count overlay. Android renders only a text summary ("N video, grid pending") and the response DTO omits the `videos` array the backend returns, so the thumbnails/links can't be shown without a DTO change.
  EVIDENCE (web): `page.tsx:9-16` (`SoundVideo`), `:35` (`videos: SoundVideo[]`), `:281-311` (grid render). EVIDENCE (android, stub): `music/SoundDetailScreen.kt:379-402` (`VideosSection`, text only), `music/data/MusicDtos.kt:52-60` (`SoundDetailResponseDto` has no `videos` field), `MusicMappers.kt:33-52` (no videos mapped).
  FREEZE-DOC: same item 14. Doc accurate; source code confirms.

---

## DIFFERENT BEHAVIOR

- `[P3]` Localization: Android uses `stringResource` i18n throughout; the web sound page hardcodes Vietnamese (`TYPE_LABEL`, "Quay lại", "Video sử dụng bài nhạc này", etc.). Android is *ahead* here — noted, not a defect.
  EVIDENCE: web `page.tsx:38-44,177,283`; android `SoundDetailScreen.kt` uses `R.string.music_*` throughout.
- `[P3]` AudioPlayer is per-screen (`rememberAudioPlayer` released on dispose); the web uses a per-page `<audio>`. Equivalent single-shared-instance semantics; no cross-screen background playback on either side. Not a defect.
  EVIDENCE: `AudioPlayer.kt:95-103` ↔ web `page.tsx:358`.

---

## BUGS

- None functional. The two Sound-Detail gaps above are tracked as MISSING (incomplete port), not regressions.

---

## REQUIRED BACKEND CONTRACTS

- `[P2]` To close the videos-grid gap, Android must extend `SoundDetailResponseDto` with the backend's already-emitted `videos: [{ id, placeName, body, thumbnail, contentType, likeCount }]` array (`GET /api/sound/{trackId}`). Backend already returns it (web consumes it); this is a **client DTO addition only**, no server change.
  EVIDENCE: web `page.tsx:9-16,35`; android gap at `MusicDtos.kt:52-60`.
- `[P3]` CC-BY attribution needs no new backend field — it is reconstructed client-side from `track.audioUrl` (Jamendo URL regex). Android can port `attributionFor` (`page.tsx:51-55`) directly using the `audioUrl` it already receives.

---

## Contract note — `{version,trackId,startSec,volume}` (freeze-doc clarification)

The frozen shape has **two forms**, and Android handles both correctly:

- **Module-stored `MusicSelection` = `{trackId, startSec, volume}` — NO `version`.**
  EVIDENCE: `src/modules/music/types/selection.ts:3-7`. The memory/freeze phrasing "`{version,trackId,startSec,volume}`" describes the *wire* payload, not this stored type.
- **Review-attach WIRE payload = `{version:1, trackId, startSec, volume}`** — backend hard-requires `music.version === MUSIC_PAYLOAD_VERSION (1)` and adds `origin` server-side.
  EVIDENCE: web `src/app/api/reviews/route.ts:11,71,84,91,152`. Android sends it correctly (version forced on-wire despite `encodeDefaults=false`): `android/.../reviews/data/ReviewNetworkDtos.kt:267-275` (`@EncodeDefault(ALWAYS) version=1, startSec, volume`), attached from Sound Detail via `music/SoundDetailViewModel.kt:172-177`.
  → **No parity defect on the contract.** Client omits `origin` (server-supplied) — correct.
