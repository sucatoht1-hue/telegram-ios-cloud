#!/usr/bin/env bash
set -euo pipefail

wait_seconds="${TUNNEL_WAIT_SECONDS:-45}"
log_file="$(mktemp /tmp/cloudflared.XXXXXX.log)"
cloudflared tunnel --url http://127.0.0.1:8421 --no-autoupdate >"${log_file}" 2>&1 &
pid="$!"
disown "${pid}" 2>/dev/null || true

url=""
deadline=$((SECONDS + wait_seconds))
while (( SECONDS < deadline )); do
  url="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "${log_file}" | head -n 1 || true)"
  if [[ -n "${url}" ]]; then
    break
  fi
  if ! kill -0 "${pid}" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

if [[ -z "${url}" ]]; then
  kill "${pid}" 2>/dev/null || true
  echo "tunnel failed: stage=timeout" >&2
  exit 1
fi

host="${url#https://}"
echo "::add-mask::${url}"
echo "::add-mask::${host}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "url=${url}"
    echo "host=${host}"
    echo "pid=${pid}"
    echo "log_file=${log_file}"
  } >> "${GITHUB_OUTPUT}"
fi

echo "tunnel ready"
