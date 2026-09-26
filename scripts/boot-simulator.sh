#!/usr/bin/env bash
set -euo pipefail

session_key="${1:?session key required}"
short="${session_key:0:8}"

fail() {
  echo "boot-simulator failed: stage=$1" >&2
  exit 1
}

runtimes_json="$(xcrun simctl list runtimes -j)"
runtime_id="$(printf '%s' "${runtimes_json}" | jq -r '
  [ .runtimes[]?
    | select(.isAvailable == true)
    | select(
        ((.name // "") | test("^iOS 26(\\..*|$)"))
        or ((.identifier // "") | test("\\.iOS-26"))
      )
    | {id: .identifier, name: .name, version: (.version // "0")}
  ]
  | sort_by(.version | split(".") | map(tonumber? // 0))
  | last
  | .id // empty
')"

if [[ -z "${runtime_id}" || "${runtime_id}" == "null" ]]; then
  fail runtime
fi

runtime_name="$(printf '%s' "${runtimes_json}" | jq -r --arg id "${runtime_id}" '
  .runtimes[]? | select(.identifier == $id) | .name // empty
' | sed -n '1p')"

devices_json="$(xcrun simctl list devicetypes -j)"
device_id="$(printf '%s' "${devices_json}" | jq -r '
  (.devicetypes // []) as $all
  | ([$all[] | select(.name == "iPhone 17 Pro")][0])
    // ([$all[] | select((.name // "") | startswith("iPhone "))][0])
    // empty
  | .identifier // empty
')"

if [[ -z "${device_id}" || "${device_id}" == "null" ]]; then
  fail device-type
fi

device_name="$(printf '%s' "${devices_json}" | jq -r --arg id "${device_id}" '
  .devicetypes[]? | select(.identifier == $id) | .name // empty
' | sed -n '1p')"

if [[ -z "${device_name}" ]]; then
  fail device-type
fi

echo "selected_runtime=${runtime_id}"
echo "selected_device=${device_name}"
udid="$(xcrun simctl create "Telegram iPhone ${short}" "${device_id}" "${runtime_id}" | tr -d '[:space:]')"
xcrun simctl boot "${udid}"
xcrun simctl bootstatus "${udid}" -b

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "udid=${udid}"
    echo "device_name=${device_name}"
    echo "runtime_name=${runtime_name}"
    echo "runtime_id=${runtime_id}"
  } >> "${GITHUB_OUTPUT}"
fi

echo "device_name=${device_name}"
echo "runtime_name=${runtime_name}"
echo "udid=${udid}"
