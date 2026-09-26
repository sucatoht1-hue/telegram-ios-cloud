#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "verify-macos failed: stage=$1" >&2
  exit 1
}

arch_name="$(uname -m)"
echo "architecture: ${arch_name}"
if [[ "${arch_name}" != "arm64" ]]; then
  fail architecture
fi

macos_ver="$(sw_vers -productVersion 2>/dev/null || echo unknown)"
echo "macos: ${macos_ver}"

xcode_out="$(xcodebuild -version 2>&1 || true)"
xcode_line="$(printf '%s\n' "${xcode_out}" | sed -n '1p')"
echo "xcode: ${xcode_line}"
major="$(printf '%s\n' "${xcode_line}" | sed -n 's/^Xcode \([0-9][0-9]*\).*/\1/p')"
if [[ "${major}" != "26" ]]; then
  fail xcode
fi

if ! runtimes_json="$(xcrun simctl list runtimes -j 2>/dev/null)"; then
  fail simctl
fi

available="$(printf '%s' "${runtimes_json}" | jq -r '
  .runtimes[]?
  | select(.isAvailable == true)
  | select(
      ((.name // "") | test("^iOS 26(\\..*|$)"))
      or ((.identifier // "") | test("\\.iOS-26"))
    )
  | .identifier // empty
')"

if [[ -z "${available}" ]]; then
  fail runtime
fi

echo "ios-26-runtimes:"
printf '%s\n' "${available}"
