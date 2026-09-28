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
| Vercel env (Preview, all branches) | `GCS_MEDIA_BUCKET=tappyai-media-uat`, `GCP_WIF_POOL=vercel-oidc-uat`, `GCP_WIF_PROVIDER=vercel-preview`, `GCP_MEDIA_SERVICE_ACCOUNT=tappyai-media-uat@…`, `GCP_PROJECT_NUMBER=1023373437508` |

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
```
