#!/usr/bin/env python3
"""Wait for App Store Connect to accept or reject an uploaded build.

`xcodebuild -exportArchive` reports "Upload succeeded" once the file is transferred; Apple's
processing (which can still reject the build, e.g. ITMS-90683 for a missing purpose string) runs
afterwards and is invisible to it. Build 16 went green in CI and was rejected minutes later. This
script turns that verdict into the job's exit code.

Stdlib only; the ES256 JWT is signed with the `openssl` CLI.

Env: ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID, BUILD_NUMBER
     BUNDLE_ID (default com.tappyai.ios), TIMEOUT_MIN (default 45), GITHUB_STEP_SUMMARY (optional)
Exit: 0 = build VALID (or not confirmed before the timeout, with a warning); 1 = rejected.
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = 'https://api.appstoreconnect.apple.com'
KEY_PATH = os.environ['ASC_KEY_PATH']
KEY_ID = os.environ['ASC_KEY_ID']
ISSUER = os.environ['ASC_ISSUER_ID']
BUILD = os.environ['BUILD_NUMBER']
BUNDLE_ID = os.environ.get('BUNDLE_ID', 'com.tappyai.ios')
TIMEOUT = int(os.environ.get('TIMEOUT_MIN', '45')) * 60
POLL = 30


def b64u(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()


def der_to_raw(der):
    """ECDSA-Sig-Value (DER SEQUENCE of two INTEGERs) -> the 64-byte r||s a JWT carries."""
    i = 2 if der[1] < 0x80 else 2 + (der[1] & 0x7F)
    out = b''
    for _ in range(2):
        n = der[i + 1]
        out += der[i + 2:i + 2 + n].lstrip(b'\x00').rjust(32, b'\x00')
        i += 2 + n
    return out


def token():
    now = int(time.time())
    head = b64u(json.dumps({'alg': 'ES256', 'kid': KEY_ID, 'typ': 'JWT'}).encode())
    body = b64u(json.dumps({'iss': ISSUER, 'iat': now, 'exp': now + 900,
                            'aud': 'appstoreconnect-v1'}).encode())
    signing_input = f'{head}.{body}'.encode()
    der = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', KEY_PATH], input=signing_input,
                         capture_output=True, check=True).stdout
    return f'{head}.{body}.{b64u(der_to_raw(der))}'


def get(path):
    req = urllib.request.Request(API + path, headers={'Authorization': 'Bearer ' + token()})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        print(f'  API {e.code} on {path.split("?")[0]}; retrying', flush=True)
        return {}
    except urllib.error.URLError as e:
        print(f'  network error ({e.reason}); retrying', flush=True)
        return {}


def summary(line):
    print(line, flush=True)
    path = os.environ.get('GITHUB_STEP_SUMMARY')
    if path:
        with open(path, 'a', encoding='utf-8') as f:
            f.write(line + '\n')


def main():
    apps = get(f'/v1/apps?filter[bundleId]={BUNDLE_ID}').get('data', [])
    if not apps:
        print(f'::error::no App Store Connect app for {BUNDLE_ID}')
        return 1
    app = apps[0]['id']
    print(f'Waiting for Apple to process build {BUILD} of {BUNDLE_ID} (up to {TIMEOUT // 60} min)',
          flush=True)

    deadline, last = time.time() + TIMEOUT, None
    while time.time() < deadline:
        upload = next((u for u in get(f'/v1/apps/{app}/buildUploads?limit=20').get('data', [])
                       if u['attributes'].get('cfBundleVersion') == BUILD), None)
        if upload:
            state = upload['attributes'].get('state') or {}
            errors = state.get('errors') or []
            for w in state.get('warnings') or []:
                print(f"::warning::Apple {w.get('code')}: {w.get('description')}")
            if errors or state.get('state') == 'FAILED':
                summary(f'### ❌ Apple rejected build {BUILD} during processing')
                for e in errors:
                    summary(f"- **ITMS-{e.get('code')}**: {e.get('description')}")
                    print(f"::error::ITMS-{e.get('code')}: {e.get('description')}")
                return 1

        builds = get(f'/v1/builds?filter[app]={app}&filter[version]={BUILD}'
                     '&fields[builds]=processingState').get('data', [])
        processing = builds[0]['attributes']['processingState'] if builds else None
        now = (upload and (upload['attributes'].get('state') or {}).get('state'), processing)
        if now != last:
            print(f'  [{time.strftime("%H:%M:%S")}] upload={now[0]} build={now[1]}', flush=True)
            last = now
        if processing == 'VALID':
            summary(f'### ✅ Build {BUILD} processed by Apple (VALID) — available in TestFlight')
            return 0
        if processing in ('INVALID', 'FAILED'):
            summary(f'### ❌ Build {BUILD} processing state: {processing}')
            return 1
        time.sleep(POLL)

    summary(f'### ⚠️ Build {BUILD} uploaded, but Apple had not finished processing it after '
            f'{TIMEOUT // 60} min. Check App Store Connect → TestFlight.')
    print(f'::warning::build {BUILD} not confirmed VALID within {TIMEOUT // 60} min')
    return 0


if __name__ == '__main__':
    sys.exit(main())
