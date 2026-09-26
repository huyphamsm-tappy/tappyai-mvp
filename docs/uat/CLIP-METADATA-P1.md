# P1 — clips publish the phone's location and identifiers (2026-09-26)

**Report only. Nothing implemented for this item — owner chooses an option.**
Evidence: `docs/uat/evidence/clip-gps-2026-09-26/` (synthetic files only, temporary non-public bucket
`gs://tappyai-media-audit`, deleted afterwards — 404). `tappyai-media-prod` was not touched.

## 1. Facts

### Which layer was tested
The app's real clip path, in-process: `uploadMedia()` (the function the web composer calls with the
picked `File`, `src/app/(app)/reviews/new/page.tsx:398-478` — **no compression, no re-encode**) →
`createUploadSessionResponse()` (what `POST /api/upload/video` runs) → bytes PUT to the resumable
session (what the browser transport does) → `completeUploadResponse()` → GCS. Not exercised: the Next
route wrapper (auth / 18+ / rate limit — none touches bytes), the Workload Identity token (owner's
gcloud token instead), and the phone's own file picker.

### Result — every byte survives

| synthetic file | uploaded via | stored bytes | location | device / identity fields that survived |
|---|---|---|---|---|
| Android-style MP4 (`udta/©xyz`) | clip path, `video/mp4` | **identical** (sha256) | **+10.7725 +106.6980** | creation time, `com.android.version`, manufacturer, model |
| iPhone-style MOV (QuickTime keys) | clip path, `video/quicktime` | **identical** | **+10.7725 +106.6980** | make, model, software version, creation date **with timezone** |
| JPEG with EXIF | clip path (`kind:'video'` accepts images at the API) | **identical** | **10.7725, 106.698** | Make, Model, Software, **Artist (author name)**, DateTimeOriginal, **BodySerialNumber**, LensModel |
| same JPEG | server path (`stripImageMetadata`: avatars, covers, review photos) | re-encoded | **removed** | **all removed** (EXIF empty) |

So: **the clip path publishes whatever metadata the phone put in the file, unchanged.** Photos that go
through the server path (avatar, cover, review photos) are already clean.

### What real phones put in clips (documented behaviour, not measured on a device here)
- **iPhone** (AVFoundation QuickTime metadata): `com.apple.quicktime.location.ISO6709` when Camera has
  location access, plus `make`, `model`, `software`, `creationdate`. No serial number in video.
- **Android**: `MediaRecorder.setLocation` writes `©xyz` when the camera app has location tagging on;
  creation time always; extra vendor boxes vary by manufacturer.
- **Photos (JPEG/HEIC)**: EXIF GPS, make/model, often lens and time; serial and author occasionally.

### Do phone browsers strip it already?
**UNVERIFIED** — needs real phones; I have none here. What is known is not enough to rely on: iOS and
recent Android photo pickers can drop location in some flows and not others, and behaviour changes
between OS versions and between "photo" and "video". The design must assume the location CAN arrive.
A 5-minute device check is possible without uploading anything (a page that reads the picked file in
the browser and reports the fields) — offered, not built.

### Which upload paths are affected

| path | who uses it | metadata |
|---|---|---|
| `POST /api/upload/video` → client-direct (`video`, `videoThumbnail`) | web composer (clips); iOS app `CreateReviewService` (iOS not shipping) | **kept** |
| thumbnail of a clip | web composer draws a video frame to `<canvas>` | none (a canvas export has no EXIF) |
| `POST /api/reviews/upload`, `POST /api/profile` (avatar, cover), group avatar | web, Android, iOS | stripped server-side |
| deals (`dealLogo`, `dealBanner`) | admins | kept (admin artwork; low risk) |
| Android app | uploads avatars only (server path) | stripped |

## 2. Options

| | A. Strip server-side after upload | B. Strip client-side before upload (in place, no re-encode) | C. Refuse uploads that carry location |
|---|---|---|---|
| How | at completion, download the object, neutralise metadata, re-upload, only then return the URL | before the PUT, rewrite the metadata boxes of the picked file in the browser — retype `©xyz`/`meta`/XMP boxes to `free` (same length, so no sample offsets move) and zero the `mvhd` times | at completion, range-read the `moov` box (a few KB–1 MB) and answer 422 "this clip contains your location" if any identifying field is present |
| Covers | every client, old app versions, API callers | only clients that run the new code | every client |
| Latency (estimate) | seconds to tens of seconds per clip (up to 150 MB down + up), user waits for the URL | <1 s on a phone (reads the file once) | +0.2–0.5 s (3–5 small range reads) |
| Money (list prices, approximate) | GCS→Vercel egress ≈ $0.12/GB per clip + function time (≈ $0.02 per 150 MB clip); or a Cloud Run worker in-region (no egress, more infra) | none | negligible |
| Failure modes | 60 s function limit vs 150 MB clips; memory unless streamed; a crash between upload and cleanup leaves a public object with metadata (must stage privately first → a second bucket/prefix) | a modified or old client skips it; unusual layouts (fragmented MP4, WebM tags, XMP) must be handled or the file refused; never trusted alone | users filming at home get refused and do not know how to turn location off; drop-off on the upload funnel |

Re-encoding client-side (ffmpeg.wasm / WebCodecs) was considered and rejected: ~25 MB download,
minutes of CPU on a phone, quality loss.

## 3. Recommendation — B + server enforcement ("strip in the browser, verify on the server")
1. **Client (B):** neutralise location, device and time fields in place before the PUT. Fast, free, no
   quality change, no new infra.
2. **Server (enforcement from C, not user-facing refusal in the normal case):** at completion, range-read
   `moov` and check for any location/device key. Normal web clients never trip it because step 1
   already cleaned the file. A client that skipped step 1 (old build, iOS native, direct API) gets
   422 and nothing is published — the object is deleted.
3. Remove `image/*` from the `video` kind (the composer never sends images there; images belong on the
   server-stripped photo path).

Why not A: it is the only option that costs real money and latency per clip, and it has a window in
which the unstripped object is already public unless a private staging area is added.

## 4. Clips already uploaded
- By construction every clip already in `tappyai-media-prod/videos/` carries whatever its phone wrote —
  location wherever the phone had location on. **Not inspected** (no real user file may be opened).
  Count in production: unknown (production DB not queried). The audit DB has 4 reviews whose clips are
  in the production bucket.
- **Clean-up** would be a one-off job: list `videos/`, range-read each `moov`, and for files that carry
  identifying fields download → neutralise in place (same technique as B) → re-upload to the **same key**
  (URL unchanged, no DB change). Cost ≈ one download + one upload per affected clip.
- **What clean-up cannot reach:** copies already saved by viewers' browsers or apps. Those clips were
  written with `max-age=31536000` (one year) before 1318b95, so a device that played one may keep its
  copy up to a year — and, measured 2026-09-26, **Google's shared edge cache keeps serving a cleaned or
  deleted object's OLD bytes until its max-age runs out**, with no way to invalidate it
  (`CACHE-AFTER-DELETE-2026-09-26.md`). Re-uploading clean bytes to the same key therefore does not
  retract a copy already cached at an edge for up to a year. Rewriting `Cache-Control` of existing objects
  only helps copies that are not yet cached.

## 5. IAM of tappyai-media-prod
**UNVERIFIED since 2026-09-22.** The last reading (PHASE7-AUDIT §8.1): `allUsers` =
`roles/storage.legacyObjectReader` (object GET only), anonymous LIST → 403. Nothing in this session
read it. Check it yourself before deploy:
```bash
gcloud storage buckets get-iam-policy gs://tappyai-media-prod
```
Expect `allUsers` only on `roles/storage.legacyObjectReader`, and no `roles/storage.objectViewer`.
