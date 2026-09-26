# Telegram iOS Cloud — design

Status: Approved

## Intent

A single authorized Telegram chat can ask for one temporary, real Apple iOS Simulator on a GitHub-hosted `macos-26` Apple Silicon runner and open it through Baguette over a Cloudflare Quick Tunnel.

This is a proof of concept. GitHub Actions is not production hosting. The session must use CoreSimulator. An HTML/CSS iPhone is not a successful session.

## Boundaries

- One simulator per session. Prefer device type `iPhone 17 Pro`; otherwise the first available device type whose name starts with `iPhone `.
- Runner label `macos-26`, architecture `arm64`, Xcode major 26, at least one available iOS 26 runtime. Fail closed otherwise.
- Baguette listens on `127.0.0.1:8421` and trusts only the exact generated `*.trycloudflare.com` hostname via `--allowed-hosts`.
- The Quick Tunnel is temporary HTTPS, development-only, and dies with the workflow.
- Session length defaults to 20 minutes and must be an integer from 5 to 30. The job timeout is 35 minutes.
- Access is one `TELEGRAM_ALLOWED_CHAT_ID`. The webhook requires `X-Telegram-Bot-Api-Secret-Token`.
- Workflow trigger is only `workflow_dispatch`. Run name is `iOS Cloud <sessionKey>`.
- No database. GitHub Actions is the session store.
- Secrets are never committed, echoed, or sent in Telegram. Tunnel URLs are masked before they are written to outputs.
- Out of scope: payments, multi-user, Apple ID automation, App Store automation, IP rotation, fingerprint changes, promotion or fraud bypass.

## Control plane

The Vercel function verifies the webhook secret before parsing the update. Commands:

- `/iphone` dispatches `ios-cloud.yml` on `main` unless that chat already has a queued or in-progress run with the same session title.
- `/status` maps the latest relevant run: no run `idle`; queued or in progress before `Keep session alive` `starting`; `Keep session alive` in progress `online`; failure `failed`; success `expired`; cancelled `idle`.
- `/desligar` cancels the active run.

The session key is the first 16 hex characters of HMAC-SHA256(chat id, `SESSION_HMAC_SECRET`).

## Runner

Stable step names: `Verify macOS runner`, `Boot iOS Simulator`, `Start HTTPS tunnel`, `Start Baguette`, `Verify remote Baguette`, `Notify Telegram`, `Keep session alive`, `Shutdown Simulator`.

Telegram is told the iPhone is online only after a remote `GET /simulators.json` returns HTTP 2xx. The button `ABRIR IPHONE` targets `<tunnel>/simulators/<udid>`. Failure messages name the stage: Environment, CoreSimulator, Tunnel, Baguette, Remote verification, or Telegram.

## Exit condition

A Telegram-triggered browser session controls a real CoreSimulator through Baguette: the picture is the simulator, and tap/swipe changes it.
