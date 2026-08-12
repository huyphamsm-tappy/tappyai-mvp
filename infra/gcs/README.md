# `tappyai-media-prod` bucket configuration

Applied config for the Cloud Storage media bridge. Committed so the live bucket
has a reviewable source of truth rather than only console state.

## CORS (`cors.json`)

Needed because the browser PUTs review video, Original Sound audio and deal
images straight to a resumable upload session URI on `storage.googleapis.com`.
Reads (`<img>`, `<video>`) are not CORS requests and need nothing here.

Restricted deliberately:

- **origin** — only the two real TappyAI origins. Never `*`: a wildcard would
  let any page on the internet drive an upload with a session URI it had
  obtained, and would also make the bucket a usable cross-origin fetch target.
- **method** — `PUT`/`POST`/`OPTIONS` only. No `DELETE`, no `PATCH`; nothing in
  the app deletes an object from the browser.
- **responseHeader** — only what a resumable PUT needs to read back. No
  credential headers are exposed.

### Apply

```bash
gcloud storage buckets update gs://tappyai-media-prod --project=aerobic-lock-498409-u7 --cors-file=infra/gcs/cors.json
```

### Read back

```bash
gcloud storage buckets describe gs://tappyai-media-prod --project=aerobic-lock-498409-u7 --format="json(cors_config)"
```

### Verify the boundary

An allowed origin gets the headers echoed; a disallowed one gets a 200 with no
CORS headers at all, which is what makes the browser refuse the request.

```bash
curl -s -D - -o /dev/null -X OPTIONS "https://storage.googleapis.com/tappyai-media-prod/videos/probe.mp4" -H "Origin: https://evil.test" -H "Access-Control-Request-Method: PUT"
```

### Roll back

The bucket had no CORS configuration before this was applied. To return it to
that state, apply an empty array.

```bash
gcloud storage buckets update gs://tappyai-media-prod --project=aerobic-lock-498409-u7 --clear-cors
```

## What is deliberately NOT here

No IAM. The federated principal holds `roles/iam.workloadIdentityUser` on the
media service account and nothing else, which is why uploads use resumable
session URIs rather than V4 signed URLs — signing would require
`iam.serviceAccounts.signBlob` from `roles/iam.serviceAccountTokenCreator`.
There is no service-account key anywhere.
