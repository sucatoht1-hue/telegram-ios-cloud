#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
script="${root}/scripts/verify-macos.sh"
failures=0

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

make_bin() {
  local bin="$1"
  mkdir -p "${bin}"
  cat > "${bin}/uname" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "-m" ]]; then
  printf '%s\n' "${FAKE_ARCH:-arm64}"
else
  printf 'Darwin\n'
fi
EOF
  cat > "${bin}/sw_vers" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "-productVersion" ]]; then
  printf '26.0\n'
else
  printf 'ProductVersion: 26.0\n'
fi
EOF
  cat > "${bin}/xcodebuild" <<'EOF'
#!/usr/bin/env bash
if [[ "${FAKE_XCODE_MISSING:-}" == "1" ]]; then
  exit 1
fi
printf 'Xcode %s\n' "${FAKE_XCODE:-26.0.1}"
printf 'Build version 17A400\n'
EOF
  cat > "${bin}/xcrun" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "simctl" && "${2:-}" == "list" && "${3:-}" == "runtimes" && "${4:-}" == "-j" ]]; then
  cat "${FAKE_RUNTIMES:?}"
  exit 0
fi
echo "unexpected xcrun $*" >&2
exit 1
EOF
  chmod +x "${bin}/uname" "${bin}/sw_vers" "${bin}/xcodebuild" "${bin}/xcrun"
}

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
bin="${tmp}/bin"
make_bin "${bin}"

empty="${tmp}/empty.json"
printf '%s\n' '{"runtimes":[{"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-18-0","name":"iOS 18.0","version":"18.0","isAvailable":true},{"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-26-0","name":"iOS 26.0","version":"26.0","isAvailable":false}]}' > "${empty}"

ok="${tmp}/ok.json"
printf '%s\n' '{"runtimes":[{"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-18-5","name":"iOS 18.5","version":"18.5","isAvailable":true},{"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-26-0","name":"iOS 26.0","version":"26.0","isAvailable":true}]}' > "${ok}"

PATH="${bin}:${PATH}" assert_fail "x86_64" architecture env FAKE_ARCH=x86_64 FAKE_RUNTIMES="${ok}" bash "${script}"
PATH="${bin}:${PATH}" assert_fail "xcode 27" xcode env FAKE_ARCH=arm64 FAKE_XCODE=27.0 FAKE_RUNTIMES="${ok}" bash "${script}"
PATH="${bin}:${PATH}" assert_fail "no ios 26" runtime env FAKE_ARCH=arm64 FAKE_XCODE=26.0.1 FAKE_RUNTIMES="${empty}" bash "${script}"

stdout="$(mktemp)"
if PATH="${bin}:${PATH}" env FAKE_ARCH=arm64 FAKE_XCODE=26.0.1 FAKE_RUNTIMES="${ok}" bash "${script}" > "${stdout}"; then
  if grep -q "architecture: arm64" "${stdout}" && grep -q "com.apple.CoreSimulator.SimRuntime.iOS-26-0" "${stdout}" && ! grep -q "iOS-18-5" "${stdout}"; then
    echo "PASS success"
  else
    echo "FAIL success: unexpected stdout" >&2
    cat "${stdout}" >&2
    failures=$((failures + 1))
  fi
else
  echo "FAIL success: exit non-zero" >&2
  failures=$((failures + 1))
fi

if (( failures > 0 )); then
  echo "${failures} failed" >&2
  exit 1
fi
echo "all verify-macos fixtures passed"
