#!/usr/bin/env bash
set -euo pipefail

host="${1:?allowed host required}"
if [[ ! "${host}" =~ ^[a-z0-9-]+\.trycloudflare\.com$ ]]; then
  echo "baguette failed: stage=hostname" >&2
  exit 1
fi

wait_seconds="${BAGUETTE_WAIT_SECONDS:-30}"
log_file="$(mktemp /tmp/baguette.XXXXXX.log)"
baguette serve --host 127.0.0.1 --port 8421 --allowed-hosts "${host}" >"${log_file}" 2>&1 &
pid="$!"
disown "${pid}" 2>/dev/null || true

deadline=$((SECONDS + wait_seconds))
ready=0
while (( SECONDS < deadline )); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:8421/simulators.json" || true)"
  if [[ "${code}" =~ ^2 ]]; then
    ready=1
    break
  fi
  if ! kill -0 "${pid}" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

if [[ "${ready}" != "1" ]]; then
  kill "${pid}" 2>/dev/null || true
  echo "baguette failed: stage=health" >&2
  exit 1
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "pid=${pid}"
    echo "log_file=${log_file}"
  } >> "${GITHUB_OUTPUT}"
fi

echo "baguette ready"
