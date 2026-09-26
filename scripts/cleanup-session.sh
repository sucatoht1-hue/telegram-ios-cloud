#!/usr/bin/env bash
set -u

udid="${1:-}"
baguette_pid="${2:-}"
tunnel_pid="${3:-}"

stop_pid() {
  local pid="$1"
  if [[ "${pid}" =~ ^[0-9]+$ ]]; then
    kill "${pid}" 2>/dev/null || true
  fi
}

if [[ -n "${udid}" ]]; then
  xcrun simctl shutdown "${udid}" >/dev/null 2>&1 || true
  xcrun simctl delete "${udid}" >/dev/null 2>&1 || true
fi

stop_pid "${baguette_pid}"
stop_pid "${tunnel_pid}"
exit 0
