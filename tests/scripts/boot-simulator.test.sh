#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
script="${root}/scripts/boot-simulator.sh"
failures=0
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

assert_fail() {
  local name="$1"
  local stage="$2"
  shift 2
  local stderr_file
  stderr_file="$(mktemp)"
  if "$@" > /dev/null 2>"${stderr_file}"; then
    echo "FAIL ${name}: expected non-zero" >&2
    failures=$((failures + 1))
  elif ! grep -q "stage=${stage}" "${stderr_file}"; then
    echo "FAIL ${name}: missing stage=${stage}" >&2
    cat "${stderr_file}" >&2
    failures=$((failures + 1))
  else
    echo "PASS ${name}"
  fi
  rm -f "${stderr_file}"
}

run_case() {
  local name="$1"
  local runtimes="$2"
  local devices="$3"
  local key="$4"
  local expect_device="$5"
  local expect_runtime_id="$6"
  local call_log="${tmp}/${name}.log"
  : > "${call_log}"
  local bin="${tmp}/${name}-bin"
  mkdir -p "${bin}"
  cat > "${bin}/xcrun" <<EOF
#!/usr/bin/env bash
if [[ "\${1:-}" != "simctl" ]]; then
  echo "unexpected \$*" >&2
  exit 1
fi
case "\${2:-}" in
  list)
    if [[ "\${3:-}" == "runtimes" ]]; then
      cat "${runtimes}"
    elif [[ "\${3:-}" == "devicetypes" ]]; then
      cat "${devices}"
    else
      echo "unexpected list \$*" >&2
      exit 1
    fi
    ;;
  create|boot|bootstatus)
    printf '%s\n' "\$*" >> "${call_log}"
    if [[ "\${2:-}" == "create" ]]; then
      printf 'UDID-001\n'
    fi
    ;;
  *)
    echo "unexpected \$*" >&2
    exit 1
    ;;
esac
EOF
  chmod +x "${bin}/xcrun"
  local output="${tmp}/${name}.out"
  : > "${output}"
  if ! PATH="${bin}:${PATH}" GITHUB_OUTPUT="${output}" bash "${script}" "${key}" > /dev/null; then
    echo "FAIL ${name}: script failed" >&2
    failures=$((failures + 1))
    return
  fi
  local ok=1
  grep -q "device_name=${expect_device}" "${output}" || ok=0
  grep -q "runtime_id=${expect_runtime_id}" "${output}" || ok=0
  grep -q "udid=UDID-001" "${output}" || ok=0
  grep -q "create Telegram iPhone ${key:0:8} " "${call_log}" || ok=0
  grep -q "${expect_runtime_id}" "${call_log}" || ok=0
  grep -q "boot UDID-001" "${call_log}" || ok=0
  grep -q "bootstatus UDID-001 -b" "${call_log}" || ok=0
  if [[ "${ok}" != "1" ]]; then
    echo "FAIL ${name}" >&2
    echo "--- output ---" >&2
    cat "${output}" >&2
    echo "--- calls ---" >&2
    cat "${call_log}" >&2
    failures=$((failures + 1))
  else
    echo "PASS ${name}"
  fi
}

preferred_runtime="${tmp}/runtimes.json"
cat > "${preferred_runtime}" <<'EOF'
{"runtimes":[
  {"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-26-0","name":"iOS 26.0","version":"26.0","isAvailable":true},
  {"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-26-1","name":"iOS 26.1","version":"26.1","isAvailable":true},
  {"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-18-5","name":"iOS 18.5","version":"18.5","isAvailable":true}
]}
EOF

preferred_devices="${tmp}/devices.json"
cat > "${preferred_devices}" <<'EOF'
{"devicetypes":[
  {"name":"iPad Pro 13-inch","identifier":"com.apple.CoreSimulator.SimDeviceType.iPad-Pro"},
  {"name":"iPhone 16","identifier":"com.apple.CoreSimulator.SimDeviceType.iPhone-16"},
  {"name":"iPhone 17 Pro","identifier":"com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro"}
]}
EOF

fallback_devices="${tmp}/fallback-devices.json"
cat > "${fallback_devices}" <<'EOF'
{"devicetypes":[
  {"name":"iPad mini","identifier":"com.apple.CoreSimulator.SimDeviceType.iPad-mini"},
  {"name":"iPhone 16","identifier":"com.apple.CoreSimulator.SimDeviceType.iPhone-16"},
  {"name":"iPhone 17","identifier":"com.apple.CoreSimulator.SimDeviceType.iPhone-17"}
]}
EOF

no_runtime="${tmp}/no-runtime.json"
printf '%s\n' '{"runtimes":[{"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-18-0","name":"iOS 18.0","version":"18.0","isAvailable":true}]}' > "${no_runtime}"

no_phone="${tmp}/no-phone.json"
printf '%s\n' '{"devicetypes":[{"name":"iPad Pro","identifier":"com.apple.CoreSimulator.SimDeviceType.iPad-Pro"}]}' > "${no_phone}"

run_case "preferred" "${preferred_runtime}" "${preferred_devices}" "deadbeefcafebabe" "iPhone 17 Pro" "com.apple.CoreSimulator.SimRuntime.iOS-26-1"
run_case "fallback" "${preferred_runtime}" "${fallback_devices}" "abc12345ffffeeee" "iPhone 16" "com.apple.CoreSimulator.SimRuntime.iOS-26-1"

no_bin="${tmp}/no-bin"
mkdir -p "${no_bin}"
cp "${tmp}/preferred-bin/xcrun" "${no_bin}/xcrun" 2>/dev/null || true
# dedicated fakes for failure cases
fail_bin="${tmp}/fail-bin"
mkdir -p "${fail_bin}"
cat > "${fail_bin}/xcrun" <<EOF
#!/usr/bin/env bash
case "\${3:-\${2:-}}" in
  runtimes) cat "${no_runtime}" ;;
  devicetypes) cat "${preferred_devices}" ;;
  *) exit 0 ;;
esac
EOF
chmod +x "${fail_bin}/xcrun"
PATH="${fail_bin}:${PATH}" assert_fail "no runtime" runtime bash "${script}" "deadbeefcafebabe"

phone_bin="${tmp}/phone-bin"
mkdir -p "${phone_bin}"
cat > "${phone_bin}/xcrun" <<EOF
#!/usr/bin/env bash
if [[ "\${2:-}" == "list" && "\${3:-}" == "runtimes" ]]; then
  cat "${preferred_runtime}"
elif [[ "\${2:-}" == "list" && "\${3:-}" == "devicetypes" ]]; then
  cat "${no_phone}"
else
  echo "should not mutate \$*" >&2
  exit 1
fi
EOF
chmod +x "${phone_bin}/xcrun"
PATH="${phone_bin}:${PATH}" assert_fail "no iphone" device-type bash "${script}" "deadbeefcafebabe"

if (( failures > 0 )); then
  echo "${failures} failed" >&2
  exit 1
fi
echo "all boot-simulator fixtures passed"
