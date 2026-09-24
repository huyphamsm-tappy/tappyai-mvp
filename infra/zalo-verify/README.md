# zalo-verify

Turns a Zalo access token into a Zalo user id, from a **Vietnamese** IP. `graph.zalo.me/v2.0/me`
answers `-501 region restricted` to Vercel, Cloud Run US and Cloud Run Singapore (measured
2026-09-24), so `/api/auth/zalo/complete` asks this service instead. Background and contract:
`docs/uat/ZALO-REGION-PROBE.md` section 5; app side: `createZaloVerifier` in
`src/lib/zalo/identity.ts`.

| File | What |
|---|---|
| `server.mjs` | the service, zero dependencies, Node >= 20, listens on `127.0.0.1:8787` |
| `Caddyfile` | HTTPS for `zalo-verify.tappyai.com`, automatic certificate, no access log |
| `zalo-verify.service` | hardened systemd unit, runs as user `zalo-verify` |
| `install.sh` | one-command setup on Ubuntu 22.04 / 24.04 |

## Install

VPS in Vietnam, Ubuntu 22.04/24.04, your SSH **public** key already in `authorized_keys`.
Point `A zalo-verify.tappyai.com -> <VPS IP>` (Cloudflare: DNS only, grey cloud) before or right
after, so Caddy can get its certificate.

```bash
scp -r infra/zalo-verify <user>@<ip>:/tmp/
# the secret goes over stdin, never on a command line and never printed:
printf '%s' "$SECRET" | ssh <user>@<ip> 'sudo bash /tmp/zalo-verify/install.sh --secret-stdin'
```

Without `--secret-stdin` it keeps an existing secret or generates one into
`/etc/zalo-verify/env` (mode 0640, read it with `sudo cat`). Re-running is safe.

It also: enables unattended security upgrades (auto reboot 03:30 VN time if a kernel needs
it), opens only SSH + 80/tcp + 443/tcp in ufw, and turns SSH password login off -- but only if
the account running it has a key, so it cannot lock you out.

## Operate

```bash
sudo systemctl status zalo-verify caddy
sudo journalctl -u zalo-verify -n 50     # outcome lines only: "POST /verify 200 id 180ms"
curl -s https://zalo-verify.tappyai.com/healthz
```

Rotate the secret: re-run the install with a new `--secret-stdin`, then update
`ZALO_VERIFY_SECRET` on Vercel (Preview `rc/web-uat` for UAT) and redeploy. Until both match,
Zalo login answers 503 -- by design.
