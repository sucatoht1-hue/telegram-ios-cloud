#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
tunnel="${root}/scripts/start-tunnel.sh"
baguette="${root}/scripts/start-baguette.sh"
failures=0
tmp="$(mktemp -d)"
pids=()
trap 'for pid in "${pids[@]:-}"; do kill "${pid}" 2>/dev/null || true; done; rm -rf "${tmp}"' EXIT

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1" >&2; failures=$((failures + 1)); }

mask_line="$(grep -n 'echo "::add-mask::' "${tunnel}" | head -n 1 | cut -d: -f1)"
write_line="$(grep -n '>> "${GITHUB_OUTPUT}"' "${tunnel}" | head -n 1 | cut -d: -f1)"
if [[ -n "${mask_line}" && -n "${write_line}" && "${mask_line}" -lt "${write_line}" ]]; then
  pass "mask precedes output in script"
else
  fail "mask precedes output in script"
fi

bin="${tmp}/bin"
mkdir -p "${bin}"
cat > "${bin}/cloudflared" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${CALL_LOG:?}"
if [[ -n "${FAKE_TUNNEL_URL:-}" ]]; then
  printf 'request served by %s\n' "${FAKE_TUNNEL_URL}"
  if [[ -n "${FAKE_TUNNEL_NOISE:-}" ]]; then
    printf '%s\n' "${FAKE_TUNNEL_NOISE}"
  fi
fi
sleep "${FAKE_SLEEP:-60}"
EOF
chmod +x "${bin}/cloudflared"
cat > "${bin}/python3" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${PROXY_LOG:?}"
sleep "${FAKE_SLEEP:-60}"
EOF
chmod +x "${bin}/python3"

call_log="${tmp}/cloudflared.log"
proxy_log="${tmp}/proxy.log"
: > "${call_log}"
: > "${proxy_log}"
output="${tmp}/output"
: > "${output}"
stdout="${tmp}/stdout"
url="https://random-otter-42.trycloudflare.com"
if CALL_LOG="${call_log}" PROXY_LOG="${proxy_log}" FAKE_TUNNEL_URL="${url}" FAKE_TUNNEL_NOISE="https://evil.example.com" \
  TUNNEL_WAIT_SECONDS=3 GITHUB_OUTPUT="${output}" PATH="${bin}:${PATH}" \
  bash "${tunnel}" > "${stdout}"; then
  if grep -q "::add-mask::${url}" "${stdout}" \
    && grep -q "^url=${url}$" "${output}" \
    && grep -q "^host=random-otter-42.trycloudflare.com$" "${output}" \
    && grep -q "tunnel --url http://127.0.0.1:8422 --no-autoupdate" "${call_log}" \
    && grep -q "stream-proxy.py" "${proxy_log}" \
    && ! grep -q "evil.example.com" "${output}"; then
    pass "parse and mask quick tunnel"
  else
    fail "parse and mask quick tunnel"
    cat "${stdout}" >&2 || true
    cat "${output}" >&2 || true
    cat "${call_log}" >&2 || true
    cat "${proxy_log}" >&2 || true
  fi
  pid_line="$(grep '^pid=' "${output}" | cut -d= -f2- || true)"
  proxy_pid_line="$(grep '^proxy_pid=' "${output}" | cut -d= -f2- || true)"
  if [[ -n "${pid_line}" ]]; then
    pids+=("${pid_line}")
  fi
  if [[ -n "${proxy_pid_line}" ]]; then
    pids+=("${proxy_pid_line}")
  fi
else
  fail "parse and mask quick tunnel"
fi

timeout_log="${tmp}/timeout.log"
: > "${timeout_log}"
stderr="${tmp}/timeout.err"
if CALL_LOG="${timeout_log}" PROXY_LOG="${tmp}/timeout-proxy.log" FAKE_TUNNEL_URL="" TUNNEL_WAIT_SECONDS=1 PATH="${bin}:${PATH}" \
  bash "${tunnel}" > /dev/null 2>"${stderr}"; then
  fail "missing url times out"
else
  if grep -q "stage=timeout" "${stderr}"; then
    pass "missing url times out"
  else
    fail "missing url times out"
    cat "${stderr}" >&2 || true
  fi
fi

stderr_host="${tmp}/host.err"
if bash "${baguette}" "evil.example.com" > /dev/null 2>"${stderr_host}"; then
  fail "reject invalid baguette host"
elif grep -q "stage=hostname" "${stderr_host}"; then
  pass "reject invalid baguette host"
else
  fail "reject invalid baguette host"
  cat "${stderr_host}" >&2 || true
fi

if bash "${baguette}" "Not-Lower.trycloudflare.com" > /dev/null 2>"${stderr_host}"; then
  fail "reject uppercase host"
else
  pass "reject uppercase host"
fi

health_bin="${tmp}/health-bin"
mkdir -p "${health_bin}"
cat > "${health_bin}/baguette" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${CALL_LOG:?}"
sleep 30
EOF
cat > "${health_bin}/curl" <<'EOF'
#!/usr/bin/env bash
printf '200'
EOF
chmod +x "${health_bin}/baguette" "${health_bin}/curl"
health_log="${tmp}/baguette.log"
: > "${health_log}"
health_out="${tmp}/baguette.out"
: > "${health_out}"
if CALL_LOG="${health_log}" GITHUB_OUTPUT="${health_out}" BAGUETTE_WAIT_SECONDS=3 PATH="${health_bin}:${PATH}" \
  bash "${baguette}" "random-otter-42.trycloudflare.com" > /dev/null; then
  if grep -q "serve --host 127.0.0.1 --port 8421 --allowed-hosts random-otter-42.trycloudflare.com" "${health_log}" \
    && grep -q "^pid=" "${health_out}"; then
    pass "baguette trusts exact host"
  else
    fail "baguette trusts exact host"
    cat "${health_log}" >&2 || true
  fi
  pid_line="$(grep '^pid=' "${health_out}" | cut -d= -f2- || true)"
  if [[ -n "${pid_line}" ]]; then
    pids+=("${pid_line}")
  fi
else
  fail "baguette trusts exact host"
fi

if (( failures > 0 )); then
  echo "${failures} failed" >&2
  exit 1
fi
echo "all tunnel fixtures passed"
