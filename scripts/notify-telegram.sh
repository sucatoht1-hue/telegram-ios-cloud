#!/usr/bin/env bash
set -euo pipefail

mode="${1:?mode required}"
chat_id="${2:?chat id required}"

exec python3 - "$mode" "$chat_id" "${3:-}" "${4:-}" "${5:-}" "${6:-}" "${7:-}" <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

mode = sys.argv[1]
chat_id = sys.argv[2]
token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
if not token:
    print("notify failed: missing token", file=sys.stderr)
    sys.exit(1)

def send(payload: dict) -> None:
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status < 200 or response.status >= 300:
                print(f"notify failed: telegram http {response.status}", file=sys.stderr)
                sys.exit(1)
    except urllib.error.HTTPError as exc:
        print(f"notify failed: telegram http {exc.code}", file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("notify failed: telegram request", file=sys.stderr)
        sys.exit(1)

if mode == "success":
    url, udid, device_name, runtime_name = sys.argv[3:7]
    if not url.startswith("https://") or not udid:
        print("notify failed: invalid session target", file=sys.stderr)
        sys.exit(1)
    button = f"{url.rstrip('/')}/simulators/{udid}"
    send(
        {
            "chat_id": chat_id,
            "text": (
                "🍎 iPhone online\n"
                f"Dispositivo: {device_name}\n"
                f"Runtime: {runtime_name}\n"
                "A sessão é temporária."
            ),
            "reply_markup": {
                "inline_keyboard": [[{"text": "ABRIR IPHONE", "url": button}]]
            },
        }
    )
elif mode == "failure":
    stage = sys.argv[3]
    reason = sys.argv[4]
    send(
        {
            "chat_id": chat_id,
            "text": (
                "Não consegui deixar o iPhone online.\n"
                f"Etapa: {stage}\n"
                f"{reason}"
            ),
        }
    )
elif mode == "expired":
    send(
        {
            "chat_id": chat_id,
            "text": "A sessão expirou e o iPhone temporário foi desligado.",
        }
    )
else:
    print("notify failed: unknown mode", file=sys.stderr)
    sys.exit(1)
PY
