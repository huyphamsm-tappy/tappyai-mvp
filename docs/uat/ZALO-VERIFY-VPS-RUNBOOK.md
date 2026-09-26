# zalo-verify VPS — runbook

Rebuilding the Vietnam verifier from nothing, on a new box, in about 15 minutes. Why it exists
and what it does: `infra/zalo-verify/README.md` and `docs/uat/ZALO-REGION-PROBE.md`.

## Current box (trial — expires 29/09/2026 11:23)

| | |
|---|---|
| Provider | CloudFly, "Việt Nam 04" (Đà Nẵng) |
| IP | `222.255.182.169` (VNPT, AS45899 — geolocates VN, which is what Zalo checks) |
| OS | Ubuntu 24.04 LTS, 1 vCPU / 1 GB / 20 GB |
| SSH | `root`, port 22, key `~/.ssh/tappyai_zalo_verify` (password login disabled by the installer) |
| DNS | `zalo-verify.tappyai.com` → A → the IP, **DNS only** (Cloudflare, grey cloud) |
| Service | `zalo-verify.service` on `127.0.0.1:8787`, Caddy in front on 80/443 |
| Secret | `/etc/zalo-verify/env`, mode 0640; the same value is `ZALO_VERIFY_SECRET` in Vercel **Preview, branch rc/web-uat** |

**Ask CloudFly before the trial ends: does converting from trial to paid keep the same IP?**
If it does, nothing below changes. If it does not, the only work is re-running the installer on
the new box and editing the one A record — the app needs no change, because it addresses the
service by name, not by IP.

## Buying the real one

1 vCPU, 1 GB RAM, 20 GB SSD, Ubuntu 24.04 LTS, **static IPv4 physically in Vietnam**. Any of
Viettel IDC, VNPT, FPT Cloud, BizFly, Vietnix, CloudFly. Roughly 100–200k VND/month. Verify the IP
really is Vietnamese before trusting it — some "VN" plans sit in Singapore, and Zalo answers those
with -501:

```bash
ssh root@<ip> 'curl -s https://ipinfo.io/json; whois $(curl -s https://api.ipify.org) | grep -i ^country'
```

Paste the public key into the provider's SSH-key field when creating the machine:

```bash
cat ~/.ssh/tappyai_zalo_verify.pub
```

## Install (one command)

```bash
scp -i ~/.ssh/tappyai_zalo_verify -r infra/zalo-verify root@<ip>:/tmp/
ssh -i ~/.ssh/tappyai_zalo_verify root@<ip> 'cd /tmp/zalo-verify && bash install.sh'
```

It generates a secret into `/etc/zalo-verify/env` without printing it. To install a secret you
already have, pipe it in instead — never on a command line:

```bash
printf '%s' "$SECRET" | ssh -i ~/.ssh/tappyai_zalo_verify root@<ip> \
  'bash /tmp/zalo-verify/install.sh --secret-stdin'
```

The installer is idempotent: packages + security updates, Node 22, Caddy, the `zalo-verify` user
and service, ufw (SSH + 80 + 443 only), key-only SSH (skipped, with a warning, if the account
running it has no authorized key), unattended security upgrades with a 03:30 reboot window.

It ends with `INSTALL OK`, or `INSTALL FINISHED WITH WARNINGS` and exit 3 — read the `!!` lines.

## DNS

Cloudflare → tappyai.com → DNS → Records → **Add record**: A, name `zalo-verify`, IPv4 the new
address, proxy **off** (must read "DNS only" — proxied breaks both the ACME challenge and the
direct TLS). Change nothing else on the zone; the 2026-09-24 backup of all other records is in
`docs/uat/dns-backup-2026-09-24.txt`.

Then force the certificate instead of waiting for Caddy's retry backoff:

```bash
ssh -i ~/.ssh/tappyai_zalo_verify root@<ip> 'systemctl restart caddy'
curl -s https://zalo-verify.tappyai.com/healthz            # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://zalo-verify.tappyai.com/verify   # 401
```

## Vercel

```bash
printf 'https://zalo-verify.tappyai.com/verify' | vercel env add ZALO_VERIFY_URL preview rc/web-uat
ssh -i ~/.ssh/tappyai_zalo_verify root@<ip> 'sed -n "s/^ZALO_VERIFY_SECRET=//p" /etc/zalo-verify/env' \
  | tr -d '\r\n' | vercel env add ZALO_VERIFY_SECRET preview rc/web-uat
```

The secret goes VPS → Vercel through a pipe; it is never printed and never written to a local
file. Then redeploy so the running lambda picks the variables up:

```bash
vercel redeploy <latest rc/web-uat preview url>
```

Production takes the same URL and a **different** secret (release checklist RULE 3): append the
second secret to `ZALO_VERIFY_SECRET` in `/etc/zalo-verify/env`, comma-separated — the service
accepts any secret in the list — and give Vercel Production only the new one.

## Verify end to end

Sign in with Zalo on the site, then:

```bash
ssh -i ~/.ssh/tappyai_zalo_verify root@<ip> 'journalctl -u zalo-verify -n 20 --no-pager'
```

`POST /verify 200 id` means Zalo accepted the region and the shared secret matched.
`401 unauthorized` means the Vercel secret and the VPS secret differ.
`502 region_restricted` means the IP is not seen as Vietnamese — the box is in the wrong place.

The logs carry outcomes only: no token, no secret, no id, no name. Caddy writes no access log.

## Known traps

* **Cloud images break `apt-get upgrade`.** CloudFly's `/etc/cloud/cloud.cfg` differs from the
  package's, dpkg asks what to do, and with no tty the whole run dies. The installer now answers
  "keep the provider's file" and continues on failure — but if a box was left half-configured by
  an older run, clear it first with `dpkg --force-confold --configure -a`.
* **Do not proxy the DNS record.** Orange cloud = no certificate and no direct TLS.
* **Caddy backs off** after a failed certificate attempt. `systemctl restart caddy` retries now.
* **The trial machine can vanish.** Nothing on it is precious: the code is in `infra/zalo-verify/`
  and the secret is reissued by a reinstall. Losing it takes Zalo login down (fail-closed, users
  see `?error=zalo_unavailable`) until the new box is up.
