# UAT media infrastructure (created 2026-09-28 by the release session, owner-approved option "c")

Purpose: Vercel **Preview** deployments (uat.tappyai.com) upload avatars, covers, Explore photos and clips to a
**UAT-only bucket** through a **UAT-only service account**, and can never use the production one.
Production (pool `vercel-oidc`, provider `vercel`, SA `tappyai-media-bridge`, bucket `tappyai-media-prod`) is UNCHANGED.

| Resource | Value |
|---|---|
| GCP project | `aerobic-lock-498409-u7` (number 1023373437508) |
| Bucket | `gs://tappyai-media-uat` — asia-southeast1, STANDARD, uniform access, soft delete 7 d, lifecycle "abort incomplete multipart after 7 d" (= prod), CORS PUT/POST/OPTIONS for `https://uat.tappyai.com` and `https://tappyai-mvp-git-rc-web-uat-huyphamsm-tappys-projects.vercel.app`, public read (`allUsers` legacyObjectReader, = prod) |
| Service account | `tappyai-media-uat@aerobic-lock-498409-u7.iam.gserviceaccount.com` — `roles/storage.objectUser` on the UAT bucket ONLY |
| WIF pool / provider | `vercel-oidc-uat` / `vercel-preview` — issuer `https://oidc.vercel.com/huyphamsm-tappys-projects`, audience `https://vercel.com/huyphamsm-tappys-projects`, condition `assertion.sub == "owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:preview"` |
| Impersonation | UAT SA `roles/iam.workloadIdentityUser` → `principal://…/workloadIdentityPools/vercel-oidc-uat/subject/owner:…:environment:preview` only |
| Evidence bucket (added 2026-09-29) | `gs://tappyai-uat-evidence` — asia-southeast1, uniform access, **public access prevention = enforced**, no `allUsers`/`allAuthenticatedUsers` binding (anonymous GET → 403). Read with an authenticated `gcloud`. Holds ALL UAT evidence under `evidence/<SHA>/…` (956 objects on 29/09). Not used by the app; no service account or Vercel env points at it. |
| Vercel env (Preview, all branches) | `GCS_MEDIA_BUCKET=tappyai-media-uat`, `GCP_WIF_POOL=vercel-oidc-uat`, `GCP_WIF_PROVIDER=vercel-preview`, `GCP_MEDIA_SERVICE_ACCOUNT=tappyai-media-uat@…`, `GCP_PROJECT_NUMBER=1023373437508` |

### Evidence is NOT in the media bucket (owner rule 2026-09-29)
`gs://tappyai-media-uat` stays public-read because the app's UAT images and clips are served from it, and uniform
bucket-level access cannot make one folder private. So evidence moved to its own private bucket:
- 29/09: the 913 objects under `gs://tappyai-media-uat/evidence/` were copied to `gs://tappyai-uat-evidence/evidence/`
  (same count, same bytes: 61,983,796), then the owner deleted `gs://tappyai-media-uat/evidence/` (913/913). Re-checked:
  no object left under that prefix; an old public evidence URL returns 404.
- Upload new evidence ONLY to `gs://tappyai-uat-evidence/evidence/<SHA>/` (web: SHA from `/api/version`; Android: the APK's
  SHA). Never to the media bucket. Pages for the owner embed the images (artifact) or use a short-lived signed URL.

Code: no bucket is hard-coded — `src/lib/media/index.ts` / `trustedHosts.ts` read the env above (prod values are the defaults).
Code fix found while proving it (4e9f53d): resumable sessions are opened with the caller's origin, or the browser cannot
read the clip PUT response (CORS) — this also affected production.

Evidence (docs/uat/evidence/release-2026-09-28/shots/):
- d97b261/p2a-1..3 (avatar + cover before / after / after reload), p2a-buckets.txt (objects in UAT bucket, none in prod), wif-isolation.txt (IAM of both SAs + both providers)
- 4e9f53d/p3a-2-photo-uploaded.png, p3a-3-clip-uploaded.png ("Video đã tải lên", AI caption), p3a-result.json (PUT 200 on storage.googleapis.com/…/tappyai-media-uat, no console error)

## Rollback
```
gcloud iam service-accounts remove-iam-policy-binding tappyai-media-uat@aerobic-lock-498409-u7.iam.gserviceaccount.com --role=roles/iam.workloadIdentityUser --member="principal://iam.googleapis.com/projects/1023373437508/locations/global/workloadIdentityPools/vercel-oidc-uat/subject/owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:preview"
gcloud iam workload-identity-pools delete vercel-oidc-uat --location=global --project=aerobic-lock-498409-u7
gcloud iam service-accounts delete tappyai-media-uat@aerobic-lock-498409-u7.iam.gserviceaccount.com
gcloud storage rm -r gs://tappyai-media-uat   # deletes UAT media — only when UAT is retired
gcloud storage rm -r gs://tappyai-uat-evidence   # deletes ALL UAT evidence — only when the owner says so
vercel env rm GCS_MEDIA_BUCKET preview; vercel env rm GCP_WIF_POOL preview; vercel env rm GCP_WIF_PROVIDER preview; vercel env rm GCP_MEDIA_SERVICE_ACCOUNT preview; vercel env rm GCP_PROJECT_NUMBER preview
```

## Exact commands run (log)
```
$ gcloud storage buckets create gs://tappyai-media-uat --project=aerobic-lock-498409-u7 --location=asia-southeast1 --default-storage-class=STANDARD --uniform-bucket-level-access --soft-delete-duration=7d
$ gcloud storage buckets update gs://tappyai-media-uat --cors-file=C:/Users/Admin/AppData/Local/Temp/claude/D--Claude-Projects-TappyAI--worktrees-g1-growth/252826a6-7ad2-4155-ad14-6de6aee19cdd/scratchpad/cors-uat.json --lifecycle-file=C:/Users/Admin/AppData/Local/Temp/claude/D--Claude-Projects-TappyAI--worktrees-g1-growth/252826a6-7ad2-4155-ad14-6de6aee19cdd/scratchpad/lifecycle-uat.json
$ gcloud iam service-accounts create tappyai-media-uat --project=aerobic-lock-498409-u7 --display-name=TappyAI media bridge (UAT/preview only)
$ gcloud storage buckets add-iam-policy-binding gs://tappyai-media-uat --member=serviceAccount:tappyai-media-uat@aerobic-lock-498409-u7.iam.gserviceaccount.com --role=roles/storage.objectUser
$ gcloud storage buckets add-iam-policy-binding gs://tappyai-media-uat --member=allUsers --role=roles/storage.legacyObjectReader
$ gcloud iam workload-identity-pools create vercel-oidc-uat --project=aerobic-lock-498409-u7 --location=global --display-name=Vercel OIDC (preview/UAT only)
$ gcloud iam workload-identity-pools providers create-oidc vercel-preview --project=aerobic-lock-498409-u7 --location=global --workload-identity-pool=vercel-oidc-uat --issuer-uri=https://oidc.vercel.com/huyphamsm-tappys-projects --allowed-audiences=https://vercel.com/huyphamsm-tappys-projects --attribute-mapping=google.subject=assertion.sub --attribute-condition=assertion.sub == "owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:preview"
$ gcloud iam service-accounts add-iam-policy-binding tappyai-media-uat@aerobic-lock-498409-u7.iam.gserviceaccount.com --project=aerobic-lock-498409-u7 --role=roles/iam.workloadIdentityUser --member=principal://iam.googleapis.com/projects/1023373437508/locations/global/workloadIdentityPools/vercel-oidc-uat/subject/owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:preview
$ vercel env add GCS_MEDIA_BUCKET preview (value: tappyai-media-uat)
$ vercel env add GCP_WIF_POOL preview (value: vercel-oidc-uat)
$ vercel env add GCP_WIF_PROVIDER preview (value: vercel-preview)
$ vercel env add GCP_MEDIA_SERVICE_ACCOUNT preview (value: tappyai-media-uat@aerobic-lock-498409-u7.iam.gserviceaccount.com)
$ vercel env add GCP_PROJECT_NUMBER preview (value: 1023373437508)
# 2026-09-29 — private evidence bucket
$ gcloud storage buckets create gs://tappyai-uat-evidence --project=aerobic-lock-498409-u7 --location=ASIA-SOUTHEAST1 --uniform-bucket-level-access --public-access-prevention
$ gcloud storage rsync -r gs://tappyai-media-uat/evidence gs://tappyai-uat-evidence/evidence
# owner: gcloud storage rm -r gs://tappyai-media-uat/evidence/   (913/913)
```
