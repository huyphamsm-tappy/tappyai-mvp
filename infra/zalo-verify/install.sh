#!/usr/bin/env bash
# zalo-verify -- one-command installer for a fresh Ubuntu 22.04 / 24.04 VPS in Vietnam.
#
#   Copy this directory to the VPS, then ONE of:
#     printf '%s' "$SECRET" | sudo bash install.sh --secret-stdin   # secret shared with Vercel
#     sudo bash install.sh                                          # keep existing / generate one
#
# What it does (idempotent, safe to re-run):
#   1. security updates on, unattended-upgrades for security patches (auto reboot 03:30 VN time)
#   2. Node.js 22 (NodeSource signed apt repo) + Caddy (official signed apt repo)
#   3. system user `zalo-verify`, code in /opt/zalo-verify, secret in /etc/zalo-verify/env (0640)
#   4. systemd unit (hardened), listening on 127.0.0.1:8787 only
#   5. Caddy on 80/443 with automatic HTTPS for $ZALO_VERIFY_DOMAIN (default zalo-verify.tappyai.com)
#   6. ufw: deny all inbound except SSH, 80/tcp, 443/tcp
#   7. SSH: key-only (PasswordAuthentication no). REFUSES this step if the account running the
#      installer has no authorized key -- it will not lock you out.
#
# The secret is NEVER printed, logged or passed on a command line.
set -euo pipefail
umask 077

DOMAIN="${ZALO_VERIFY_DOMAIN:-zalo-verify.tappyai.com}"
PORT=8787
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRET_FROM_STDIN=0
for a in "$@"; do
  case "$a" in
    --secret-stdin) SECRET_FROM_STDIN=1 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$*"; }
warn() { printf '\n!! %s\n' "$*" >&2; }
INCOMPLETE=0

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo bash install.sh)" >&2; exit 1; }
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || { echo "Ubuntu only (found ${ID:-unknown})" >&2; exit 1; }
for f in server.mjs Caddyfile zalo-verify.service; do
  [ -f "$HERE/$f" ] || { echo "missing $HERE/$f" >&2; exit 1; }
done

# Read the secret first, before any apt output, so stdin is consumed cleanly.
SECRET=""
if [ "$SECRET_FROM_STDIN" -eq 1 ]; then
  IFS= read -r SECRET || true
  [ "${#SECRET}" -ge 32 ] || { echo "secret on stdin is missing or shorter than 32 characters" >&2; exit 1; }
fi

export DEBIAN_FRONTEND=noninteractive

say "1/7 packages + security updates"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg openssl ufw unattended-upgrades \
  debian-keyring debian-archive-keyring apt-transport-https
# KEEP the provider's config files. A cloud image ships a modified /etc/cloud/cloud.cfg, and the
# upgrade asks what to do with it -- with no tty that prompt aborts dpkg and left the whole
# install dead at step 1 on CloudFly (2026-09-26). confold/confdef answers it the safe way.
# Non-fatal: the service does not depend on the upgrade, and stopping here installs nothing.
APT_KEEP_CONF='-o Dpkg::Options::=--force-confold -o Dpkg::Options::=--force-confdef'
# shellcheck disable=SC2086
if ! apt-get upgrade -y -q $APT_KEEP_CONF; then
  # A half-configured package from an earlier interrupted run blocks everything after it.
  dpkg --force-confold --configure -a || true
  # shellcheck disable=SC2086
  apt-get upgrade -y -q $APT_KEEP_CONF || { warn "apt-get upgrade failed; continuing (check 'apt-get check' later)"; INCOMPLETE=1; }
fi
timedatectl set-timezone Asia/Ho_Chi_Minh || true
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
cat > /etc/apt/apt.conf.d/52zalo-verify-unattended <<'CONF'
// Security patches install by themselves; reboot at night when a kernel update needs it.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
CONF
chmod 644 /etc/apt/apt.conf.d/20auto-upgrades /etc/apt/apt.conf.d/52zalo-verify-unattended
systemctl enable --now unattended-upgrades >/dev/null

say "2/7 Node.js 22 + Caddy"
install -d -m 755 /etc/apt/keyrings
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  chmod 644 /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  chmod 644 /etc/apt/sources.list.d/nodesource.list
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  chmod 644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  chmod 644 /etc/apt/sources.list.d/caddy-stable.list
fi
apt-get update -q
apt-get install -y -q nodejs caddy
node --version

say "3/7 user, code, secret"
id zalo-verify >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin zalo-verify
install -d -m 755 -o root -g root /opt/zalo-verify
install -m 644 -o root -g root "$HERE/server.mjs" /opt/zalo-verify/server.mjs
install -d -m 750 -o root -g zalo-verify /etc/zalo-verify
ENV_FILE=/etc/zalo-verify/env
if [ -n "$SECRET" ]; then
  : # new secret supplied on stdin
elif [ -f "$ENV_FILE" ] && grep -q '^ZALO_VERIFY_SECRET=.\{32,\}' "$ENV_FILE"; then
  SECRET="$(sed -n 's/^ZALO_VERIFY_SECRET=//p' "$ENV_FILE")"
  echo "keeping the existing secret (not shown)"
  # To add a SECOND secret (e.g. production alongside UAT) without disturbing the first, append
  # it to the same line separated by a comma; the service accepts any listed secret."
else
  SECRET="$(openssl rand -hex 32)"
  echo "generated a new secret (not shown). Read it with: sudo cat $ENV_FILE"
fi
TMP_ENV="$(mktemp /etc/zalo-verify/.env.XXXXXX)"
printf 'ZALO_VERIFY_SECRET=%s\nPORT=%s\n' "$SECRET" "$PORT" > "$TMP_ENV"
chown root:zalo-verify "$TMP_ENV"
chmod 640 "$TMP_ENV"
mv -f "$TMP_ENV" "$ENV_FILE"
SECRET=""

say "4/7 systemd service"
install -m 644 -o root -g root "$HERE/zalo-verify.service" /etc/systemd/system/zalo-verify.service
systemctl daemon-reload
systemctl enable zalo-verify >/dev/null
systemctl restart zalo-verify

say "5/7 Caddy (automatic HTTPS for $DOMAIN)"
if [ -f /etc/caddy/Caddyfile ] && ! cmp -s "$HERE/Caddyfile" /etc/caddy/Caddyfile; then
  cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d%H%M%S)"
fi
install -m 644 -o root -g root "$HERE/Caddyfile" /etc/caddy/Caddyfile
install -d -m 755 /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=ZALO_VERIFY_DOMAIN=%s\n' "$DOMAIN" > /etc/systemd/system/caddy.service.d/zalo-verify.conf
chmod 644 /etc/systemd/system/caddy.service.d/zalo-verify.conf
ZALO_VERIFY_DOMAIN="$DOMAIN" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl daemon-reload
systemctl enable caddy >/dev/null
systemctl restart caddy

say "6/7 firewall: SSH + 80/tcp + 443/tcp only"
# Every port SSH could be on: sshd's config, what sshd / ssh.socket listens on, and the port of
# the session running this script. Opening one port too many beats locking the operator out.
SSH_PORTS="$( {
  sshd -T 2>/dev/null | awk '$1=="port"{print $2}' || true
  ss -ltnpH 2>/dev/null | awk '/"sshd"/ {n=split($4,a,":"); print a[n]}' || true
  systemctl show ssh.socket -p Listen 2>/dev/null | grep -oE '[0-9]+ \(Stream\)' | awk '{print $1}' || true
  if [ -n "${SSH_CONNECTION:-}" ]; then echo "$SSH_CONNECTION" | awk '{print $4}'; fi
} | grep -E '^[0-9]+$' | sort -un || true )"
[ -n "$SSH_PORTS" ] || SSH_PORTS=22
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
for p in $SSH_PORTS; do ufw allow "$p/tcp" comment ssh >/dev/null; done
ufw allow 80/tcp comment 'acme + redirect' >/dev/null
ufw allow 443/tcp comment https >/dev/null
ufw --force enable >/dev/null
for p in $SSH_PORTS; do [ "$p" = 22 ] || warn "SSH listens on port $p (not 22); it was opened so you are not locked out."; done
ufw status verbose

say "7/7 SSH: key-only"
LOGIN_USER="${SUDO_USER:-root}"
LOGIN_HOME="$(getent passwd "$LOGIN_USER" | cut -d: -f6)"
if [ -s "$LOGIN_HOME/.ssh/authorized_keys" ] && grep -Eq '^(ssh-|ecdsa-|sk-)' "$LOGIN_HOME/.ssh/authorized_keys"; then
  cat > /etc/ssh/sshd_config.d/00-zalo-verify-hardening.conf <<'CONF'
# Installed by zalo-verify/install.sh. 00- so it wins over cloud-init's 50-cloud-init.conf
# (sshd keeps the FIRST value it reads for each keyword).
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin prohibit-password
MaxAuthTries 3
X11Forwarding no
CONF
  chmod 644 /etc/ssh/sshd_config.d/00-zalo-verify-hardening.conf
  sshd -t
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  echo "password login disabled; '$LOGIN_USER' keeps key access"
else
  warn "'$LOGIN_USER' has no key in $LOGIN_HOME/.ssh/authorized_keys -- NOT disabling password login (you would be locked out). Add your public key, then re-run."
  INCOMPLETE=1
fi

say "checks"
sleep 1
systemctl is-active --quiet zalo-verify && echo "zalo-verify: active" || { warn "zalo-verify is not running: journalctl -u zalo-verify"; INCOMPLETE=1; }
systemctl is-active --quiet caddy && echo "caddy: active" || { warn "caddy is not running: journalctl -u caddy"; INCOMPLETE=1; }
echo "healthz:        $(curl -s -m 5 http://127.0.0.1:$PORT/healthz || echo FAIL)"
echo "no secret:      HTTP $(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"at":"x"}' http://127.0.0.1:$PORT/verify) (expect 401)"
echo "listening on:   $(ss -ltnH "sport = :$PORT" | awk '{print $4}' | tr '\n' ' ')(expect 127.0.0.1 only)"
echo "egress IP:      $(curl -s -m 5 https://api.ipify.org || echo unknown)  (must be Vietnamese for Zalo)"
echo
echo "Next: A record $DOMAIN -> this IP (DNS only), then https://$DOMAIN/healthz."
if [ "$INCOMPLETE" -ne 0 ]; then echo "INSTALL FINISHED WITH WARNINGS (see !! above)"; exit 3; fi
echo "INSTALL OK"
