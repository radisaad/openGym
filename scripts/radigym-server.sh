#!/usr/bin/env bash
# RadiGym server on Ubuntu with Docker (docs/SERVER_LINUX.md). Run from the repository folder:
#
#   scripts/radigym-server.sh setup    first time: .env, build, start, https through Tailscale Funnel
#   scripts/radigym-server.sh lock     after your profile exists: new profiles need an invite
#   scripts/radigym-server.sh update   pull the latest RadiGym and rebuild
#   scripts/radigym-server.sh status   what runs, and the address
#   scripts/radigym-server.sh backup   a dated archive of the data folder in backups/
#
# Needs Docker (with the compose plugin) and Tailscale, signed in. The address is this machine's
# Tailscale name, https://<machine>.<tailnet>.ts.net, served to the internet by Tailscale Funnel:
# a real certificate (passkeys and the iPhone app need https), no router or domain to set up.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/.env"
PORT="${RADIGYM_PORT:-8080}"

say() { printf '\n== %s\n' "$*"; }
fail() { printf '\n!! %s\n' "$*" >&2; exit 1; }

# docker, or sudo docker when this user is not in the docker group.
DOCKER=(docker)
need_docker() {
  command -v docker >/dev/null || fail 'Docker is not installed (docs/SERVER_LINUX.md, step 1).'
  if ! docker info >/dev/null 2>&1; then
    if sudo -n docker info >/dev/null 2>&1 || sudo docker info >/dev/null 2>&1; then DOCKER=(sudo docker)
    else fail 'Docker is not running. Start it: sudo systemctl start docker'; fi
  fi
  "${DOCKER[@]}" compose version >/dev/null 2>&1 || fail 'The docker compose plugin is missing: sudo apt install docker-compose-plugin'
}

TS=(tailscale)
host_name() {
  command -v tailscale >/dev/null || fail 'Tailscale is not installed: curl -fsSL https://tailscale.com/install.sh | sh'
  local json
  json="$(tailscale status --json 2>/dev/null)" || fail 'Tailscale is not connected: sudo tailscale up'
  local name
  name="$(printf '%s' "$json" | sed -n 's/.*"DNSName": *"\([^"]*\)".*/\1/p' | head -1)"
  [ -n "$name" ] || fail 'Tailscale gave no name for this machine. Is it signed in? sudo tailscale up'
  printf '%s' "${name%.}"
}

# KEY=value in .env, every other line kept as it is.
set_env() {
  local key="$1" value="$2"
  touch "$ENV_FILE"
  if grep -q "^[[:space:]]*$key=" "$ENV_FILE"; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $0 ~ "^[[:space:]]*"k"=" {print k"="v; next} {print}' "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
  else
    [ -s "$ENV_FILE" ] && [ -n "$(tail -c1 "$ENV_FILE")" ] && printf '\n' >> "$ENV_FILE"
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

wait_healthy() {
  say 'Waiting for RadiGym to answer'
  for _ in $(seq 60); do
    if curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; then echo 'RadiGym answers.'; return; fi
    sleep 3
  done
  fail "RadiGym did not answer on port $PORT. Look at: ${DOCKER[*]} compose logs --tail 80"
}

funnel() {
  say 'Opening https on Tailscale Funnel'
  if ! sudo tailscale funnel --bg "$PORT"; then
    echo 'Tailscale needs Funnel switched on for your account once: open the link printed above,'
    echo 'allow HTTPS certificates and Funnel, then run this command again.'
    exit 1
  fi
}

cmd="${1:-status}"
case "$cmd" in
  setup)
    need_docker
    host="$(host_name)"
    say "This server will be https://$host"
    set_env RP_ID "$host"
    set_env ORIGIN "https://$host"
    set_env RP_NAME RadiGym
    set_env WEB_PORT "$PORT"
    set_env FIRST_USER_ADMIN 1
    # Claude on the owner's own Claude plan: RadiGym as a connector inside Claude (docs/MCP_REMOTE.md).
    # No pay-per-use API key anywhere.
    set_env COMPOSE_PROFILES mcp
    set_env MCP on
    say 'Building RadiGym from this folder and starting it (the first build takes several minutes)'
    "${DOCKER[@]}" compose up -d --build
    wait_healthy
    funnel
    say 'Done'
    echo "1. On your iPhone, open https://$host in Safari and create your profile (Face ID makes the passkey)."
    echo '2. Then run:  scripts/radigym-server.sh lock'
    echo '3. In Safari: Settings > Pair the mobile app. In the RadiGym app: Settings > Server & sync,'
    echo "   type https://$host and the code."
    echo "4. Claude: in the Claude app, Customize > Connectors > Add custom connector, name RadiGym,"
    echo "   address https://$host/mcp, then Connect and sign in to RadiGym."
    ;;
  lock)
    need_docker
    set_env INVITE_ONLY 1
    "${DOCKER[@]}" compose up -d
    say 'Invite only: new profiles now need an invite code (Settings > Admin dashboard, in the browser).'
    ;;
  update)
    need_docker
    say 'Getting the latest RadiGym'
    git pull --ff-only
    "${DOCKER[@]}" compose up -d --build
    wait_healthy
    say 'Updated. Your data is untouched (it lives in data/).'
    ;;
  status)
    need_docker
    "${DOCKER[@]}" compose ps
    tailscale funnel status 2>/dev/null || sudo tailscale funnel status || true
    ;;
  backup)
    mkdir -p backups
    out="backups/data-$(date +%Y-%m-%d_%H%M).tar.gz"
    sudo tar -czf "$out" data
    say "Backup written: $out"
    ;;
  *) fail "Unknown command: $cmd (setup, lock, update, status, backup)" ;;
esac
