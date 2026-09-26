# Telegram iOS Cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-cost proof of concept where an authorized Telegram user can request a temporary real Apple iOS Simulator session on a GitHub Actions `macos-26` Apple Silicon runner and open/control it through Baguette over a temporary HTTPS tunnel.

**Architecture:** A small TypeScript Telegram webhook deployed on Vercel dispatches and manages a GitHub Actions workflow. The workflow boots one iOS 26 Simulator, starts a Cloudflare Quick Tunnel, starts Baguette with the generated tunnel host explicitly trusted, verifies the remote Baguette endpoint, sends the temporary URL to Telegram, and stays alive for a short bounded session. GitHub Actions remains the source of session state; no database is used in milestone 1.

**Tech Stack:** TypeScript, Node.js 22+, Vercel Functions, GitHub REST API, GitHub Actions `macos-26`, Bash, `xcrun simctl`, Xcode 26, Homebrew, Baguette, Cloudflare Quick Tunnels, Telegram Bot API, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-telegram-ios-cloud-design.md`

## Global Constraints

- Proof of concept only; GitHub Actions is not production hosting.
- The session must use the real Apple CoreSimulator, never an HTML/CSS iPhone mockup.
- Runner label is exactly `macos-26`; architecture must verify as `arm64` before continuing.
- Xcode major version must be 26; an available iOS 26 Simulator runtime is required.
- Milestone 1 boots exactly one simulator.
- Prefer `iPhone 17 Pro`; fall back to another available iPhone device type only when `iPhone 17 Pro` is unavailable, and report the actual selection.
- Baguette is installed with native Apple Silicon Homebrew and served on `127.0.0.1:8421`.
- Baguette must trust only the exact generated `*.trycloudflare.com` hostname for the current session via `--allowed-hosts`.
- Cloudflare Quick Tunnel is development-only, temporary, HTTPS, and must terminate with the workflow.
- Default session duration is 20 minutes; accepted configured range is 5–30 minutes.
- Initial Telegram access is restricted to one `TELEGRAM_ALLOWED_CHAT_ID`.
- Secrets are never committed, echoed, or placed in Telegram messages or public workflow output.
- The GitHub workflow is triggered only by `workflow_dispatch`; it must not run on `push` or `pull_request`.
- Repository can be public for zero-cost standard GitHub-hosted runners, but live tunnel URLs must be masked from Actions logs before they are written to outputs.
- No payments, multi-user support, Apple ID automation, App Store automation, IP rotation, device fingerprint manipulation, or promotion/fraud bypass features in this milestone.

## File Structure

```text
telegram-ios-cloud/
├── .github/
│   └── workflows/
│       └── ios-cloud.yml                 # macOS runner lifecycle and session orchestration
├── bot/
│   ├── api/
│   │   └── telegram.ts                   # thin Vercel HTTP adapter
│   ├── scripts/
│   │   └── configure-webhook.ts          # one-time Telegram webhook configuration
│   ├── src/
│   │   ├── config.ts                     # validated environment configuration
│   │   ├── github.ts                     # GitHub Actions dispatch/status/cancel client
│   │   ├── index.ts                      # command router and use-case orchestration
│   │   ├── session-key.ts                # stable non-reversible chat session key
│   │   ├── state.ts                      # workflow/job -> user-facing session state
│   │   ├── telegram.ts                   # Telegram Bot API client + update parsing
│   │   └── types.ts                      # shared domain types
│   ├── tests/
│   │   ├── github.test.ts
│   │   ├── index.test.ts
│   │   ├── session-key.test.ts
│   │   ├── state.test.ts
│   │   └── telegram.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── vercel.json
│   └── vitest.config.ts
├── scripts/
│   ├── boot-simulator.sh                 # discover/create/boot fresh iOS 26 simulator
│   ├── start-baguette.sh                 # start Baguette with exact tunnel hostname trust
│   ├── start-tunnel.sh                   # start Quick Tunnel and return masked URL/hostname
│   └── verify-macos.sh                   # hard-gate environment checks + diagnostics
├── tests/
│   └── scripts/
│       ├── boot-simulator.test.sh
│       ├── start-tunnel.test.sh
│       └── verify-macos.test.sh
├── docs/
│   └── superpowers/
│       ├── plans/
│       │   └── 2026-09-26-telegram-ios-cloud.md
│       └── specs/
│           └── 2026-09-26-telegram-ios-cloud-design.md
├── .env.example
├── .gitignore
└── README.md
```

## Review Focus

1. **Proxy origin rejection:** a valid Quick Tunnel hostname must be passed to Baguette as the exact allowed host, otherwise remote browser requests/WebSockets receive `403`; Task 4 tests hostname validation and Task 5 performs a remote `/simulators.json` smoke test.
2. **Runner image drift:** if `macos-26` changes Xcode/runtime/device availability, the workflow must fail at the correct stage or select a compatible fallback iPhone rather than silently using the wrong platform; Tasks 2 and 3 test these paths.
3. **Unauthorized/spoofed Telegram requests:** wrong webhook secret or wrong chat ID must cause zero GitHub mutations; Task 7 tests both conditions.
4. **Duplicate `/iphone` requests:** a second start while a matching run is queued/in-progress must not dispatch another workflow; Tasks 6 and 7 test active-run filtering and duplicate rejection.
5. **Tunnel startup/remote readiness failure:** the bot must never announce “iPhone online” until HTTPS and Baguette respond remotely; Tasks 4 and 5 test URL parsing/timeouts and gate notification on a successful remote smoke test.

---

### Task 1: Bootstrap the TypeScript control service

**Files:**
- Create: `bot/package.json`
- Create: `bot/tsconfig.json`
- Create: `bot/vitest.config.ts`
- Create: `bot/src/types.ts`
- Create: `bot/src/config.ts`
- Create: `bot/tests/session-key.test.ts`
- Create: `bot/src/session-key.ts`
- Create: `.env.example`
- Create: `.gitignore`

**Interfaces:**
- Produces: `SessionState`, `SessionStatus`, `WorkflowRunSummary`, `WorkflowJobSummary`, `TelegramUpdate`, and `BotConfig` domain types.
- Produces: `computeSessionKey(chatId: string, secret: string): string` returning the first 16 lowercase hex characters of HMAC-SHA256.
- Produces: `loadConfig(env: NodeJS.ProcessEnv): BotConfig` that validates required environment variables and bounds `SESSION_DURATION_MINUTES` to `5..30` with default `20`.

- [ ] **Step 1: Write failing tests for stable session-key generation and config validation**

`bot/tests/session-key.test.ts` asserts that the same `chatId` + secret is deterministic, changing either input changes the key, and the returned value matches `/^[0-9a-f]{16}$/`.

Add config tests in the same first test cycle or a dedicated `config.test.ts` if needed: missing `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, or `SESSION_HMAC_SECRET` throws; duration defaults to `20`; values below `5` or above `30` throw.

- [ ] **Step 2: Run tests and verify they fail because implementations do not exist**

Run: `cd bot && npm test -- --run`

Expected: FAIL with unresolved imports/functions.

- [ ] **Step 3: Add minimal package/tooling and implement domain types, config loading, and session key generation**

Use Node built-in `crypto.createHmac`; do not add a crypto dependency. Keep runtime dependencies empty unless Vercel type packages are needed as development dependencies.

- [ ] **Step 4: Run unit tests and TypeScript typecheck**

Run: `cd bot && npm test -- --run && npm run typecheck`

Expected: all tests PASS and `tsc --noEmit` exits `0`.

- [ ] **Step 5: Commit**

```bash
git add bot .env.example .gitignore
git commit -m "chore: bootstrap telegram ios cloud control service"
```

---

### Task 2: Hard-gate the GitHub macOS runner environment

**Files:**
- Create: `scripts/verify-macos.sh`
- Create: `tests/scripts/verify-macos.test.sh`
- Create: `.github/workflows/ios-cloud.yml` (initial probe-only form)

**Interfaces:**
- Produces: `scripts/verify-macos.sh` with exit `0` only when architecture is `arm64`, Xcode major version is `26`, `xcrun simctl` works, and at least one available iOS 26 runtime exists.
- Produces on stdout only non-secret diagnostics: architecture, macOS version, Xcode version, and available iOS 26 runtimes.
- Workflow exposes inputs `session_key` (required string), `chat_id` (required string), and `duration_minutes` (required string) and uses `run-name: iOS Cloud ${{ inputs.session_key }}`.

- [ ] **Step 1: Write shell tests using fake commands injected through `PATH`**

`tests/scripts/verify-macos.test.sh` covers: `x86_64` fails with stage text `architecture`; Xcode 27 fails with stage text `xcode`; no iOS 26 runtime fails with stage text `runtime`; arm64 + Xcode 26 + available iOS 26 runtime succeeds.

- [ ] **Step 2: Run the shell test and verify failure**

Run: `bash tests/scripts/verify-macos.test.sh`

Expected: FAIL because `verify-macos.sh` does not exist.

- [ ] **Step 3: Implement `verify-macos.sh` and the probe workflow**

Workflow requirements: `runs-on: macos-26`, `timeout-minutes: 35`, `permissions: { contents: read }`, trigger only `workflow_dispatch`, checkout then run `bash scripts/verify-macos.sh`. Do not echo workflow inputs.

- [ ] **Step 4: Run shell tests locally and YAML sanity review**

Run: `bash tests/scripts/verify-macos.test.sh`

Expected: PASS for all four fixtures.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-macos.sh tests/scripts/verify-macos.test.sh .github/workflows/ios-cloud.yml
git commit -m "ci: verify apple silicon ios runner"
```

---

### Task 3: Discover, create, and boot one fresh iOS 26 Simulator

**Files:**
- Create: `scripts/boot-simulator.sh`
- Create: `tests/scripts/boot-simulator.test.sh`
- Modify: `.github/workflows/ios-cloud.yml`

**Interfaces:**
- Produces: `boot-simulator.sh` writing exactly these GitHub step outputs when `GITHUB_OUTPUT` is set: `udid`, `device_name`, `runtime_name`, `runtime_id`.
- Selection rule: highest available iOS 26 runtime; preferred device type exact name `iPhone 17 Pro`; fallback first available device type whose name begins with `iPhone `.
- Creates a fresh device named `Telegram iPhone <short-session-key>` via `xcrun simctl create`, then runs `xcrun simctl boot` and `xcrun simctl bootstatus <udid> -b`.

- [ ] **Step 1: Write shell tests with fixture JSON and a fake `xcrun`**

Tests assert: highest iOS 26 runtime wins; `iPhone 17 Pro` wins when present; fallback iPhone is used when it is absent; no iOS 26 runtime exits non-zero with `runtime`; no iPhone device type exits non-zero with `device-type`; successful flow calls `simctl create`, `boot`, and `bootstatus` with the selected identifiers.

- [ ] **Step 2: Run the test and verify failure**

Run: `bash tests/scripts/boot-simulator.test.sh`

Expected: FAIL because implementation does not exist.

- [ ] **Step 3: Implement `boot-simulator.sh` using `xcrun simctl ... -j` + `jq`**

Signature: `bash scripts/boot-simulator.sh <session-key>`. Do not assume a hard-coded simulator UDID.

- [ ] **Step 4: Add workflow step `Boot iOS Simulator` and run shell tests**

Run: `bash tests/scripts/boot-simulator.test.sh`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/boot-simulator.sh tests/scripts/boot-simulator.test.sh .github/workflows/ios-cloud.yml
git commit -m "feat: boot disposable ios simulator"
```

---

### Task 4: Start a masked Cloudflare Quick Tunnel and Baguette with the exact trusted host

**Files:**
- Create: `scripts/start-tunnel.sh`
- Create: `scripts/start-baguette.sh`
- Create: `tests/scripts/start-tunnel.test.sh`
- Modify: `.github/workflows/ios-cloud.yml`

**Interfaces:**
- Produces: `start-tunnel.sh` that starts `cloudflared tunnel --url http://127.0.0.1:8421 --no-autoupdate`, captures logs to a temp file, extracts one `https://*.trycloudflare.com` URL within 45 seconds, emits `::add-mask::<url>` before writing it to `GITHUB_OUTPUT`, and outputs `url`, `host`, `pid`, `log_file`.
- Produces: `start-baguette.sh <allowed-host>` that validates `<allowed-host>` matches `^[a-z0-9-]+\.trycloudflare\.com$`, starts `baguette serve --host 127.0.0.1 --port 8421 --allowed-hosts <allowed-host>` in the background, waits up to 30 seconds for `GET /simulators.json`, then outputs `pid` and `log_file`.
- Workflow installs `/opt/homebrew/bin/brew install baguette cloudflared` before starting either process.

- [ ] **Step 1: Write failing tunnel parser/timeout/hostname tests**

`tests/scripts/start-tunnel.test.sh` uses a fake `cloudflared` to assert a valid random Quick Tunnel URL is parsed, an invalid hostname is rejected by the Baguette starter, the URL is masked before output, and a missing URL times out non-zero.

- [ ] **Step 2: Run test and verify failure**

Run: `bash tests/scripts/start-tunnel.test.sh`

Expected: FAIL because scripts do not exist.

- [ ] **Step 3: Implement tunnel first, then Baguette with the exact generated hostname**

This ordering intentionally differs from the conceptual spec diagram: Cloudflare can connect before the local service is ready, and Baguette needs the generated public hostname before startup so its Host/Origin protection can trust exactly that proxy host.

- [ ] **Step 4: Extend workflow with install, `Start HTTPS tunnel`, and `Start Baguette` steps**

The workflow must not `cat` tunnel logs or echo the URL. Store background PIDs for cleanup.

- [ ] **Step 5: Run shell tests**

Run: `bash tests/scripts/start-tunnel.test.sh`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/start-tunnel.sh scripts/start-baguette.sh tests/scripts/start-tunnel.test.sh .github/workflows/ios-cloud.yml
git commit -m "feat: expose baguette through temporary tunnel"
```

---

### Task 5: Complete the GitHub Actions session lifecycle and remote readiness gate

**Files:**
- Modify: `.github/workflows/ios-cloud.yml`
- Create: `scripts/notify-telegram.sh`
- Create: `scripts/cleanup-session.sh`

**Interfaces:**
- Produces stable workflow step names consumed later by status mapping: `Verify macOS runner`, `Boot iOS Simulator`, `Start HTTPS tunnel`, `Start Baguette`, `Verify remote Baguette`, `Notify Telegram`, `Keep session alive`, `Shutdown Simulator`.
- `Verify remote Baguette` retries `GET <tunnel-url>/simulators.json` for up to 45 seconds and succeeds only on HTTP 2xx.
- `notify-telegram.sh success <chat-id> <url> <udid> <device-name> <runtime-name>` sends one Telegram message with inline button `ABRIR IPHONE` targeting `<url>/simulators/<udid>`.
- `notify-telegram.sh failure <chat-id> <stage> <reason>` sends the concise stage-specific failure format from the spec.
- `cleanup-session.sh <udid> <baguette-pid> <tunnel-pid>` shuts down the simulator/processes best-effort and never prints secrets.

- [ ] **Step 1: Add workflow-level failure-stage calculation before writing notification code**

Use step `outcome` values to resolve one of: `Environment`, `CoreSimulator`, `Tunnel`, `Baguette`, `Remote verification`, `Telegram`. No generic “unknown” while one of those steps has failed.

- [ ] **Step 2: Implement success/failure Telegram notification script using `TELEGRAM_BOT_TOKEN` only from environment**

The workflow requires repository secret `TELEGRAM_BOT_TOKEN`; never interpolate it into shell command text or output. Use `curl --data-urlencode`/JSON body without debug mode.

- [ ] **Step 3: Add remote smoke test, bounded keep-alive, expiration message, and cleanup**

Convert `duration_minutes` to integer and reject outside `5..30`. `Keep session alive` sleeps for exactly that bounded duration. Normal completion sends an expiration message, then shuts down. Workflow `timeout-minutes` remains 35 as a hard outer bound.

- [ ] **Step 4: Add cleanup on failure/normal completion and document cancellation behavior**

On explicit GitHub cancellation the hosted runner is disposable; best-effort signal traps may run, but no persistence is relied upon.

- [ ] **Step 5: Review workflow logs for accidental tunnel URL/token output**

Expected: public logs show stages/device/runtime but not bot token and not the live tunnel URL.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ios-cloud.yml scripts/notify-telegram.sh scripts/cleanup-session.sh
git commit -m "feat: complete temporary ios session lifecycle"
```

---

### Task 6: Implement GitHub Actions control and user-facing state mapping

**Files:**
- Create: `bot/tests/github.test.ts`
- Create: `bot/tests/state.test.ts`
- Create: `bot/src/github.ts`
- Create: `bot/src/state.ts`

**Interfaces:**
- Produces `createGitHubClient(config, fetchImpl = fetch)` with methods:
  - `startSession(input: { sessionKey: string; chatId: string; durationMinutes: number }): Promise<void>`
  - `findLatestSessionRun(sessionKey: string): Promise<WorkflowRunSummary | null>`
  - `getSessionStatus(sessionKey: string): Promise<SessionStatus>`
  - `cancelSession(sessionKey: string): Promise<{ cancelled: boolean; runId?: number }>`
- Uses repository `${owner}/${repo}` from `GITHUB_REPOSITORY` and workflow file `ios-cloud.yml` on ref `main`.
- Active duplicate definition: latest matching run whose `display_title === "iOS Cloud <sessionKey>"` and `status` is `queued` or `in_progress`.
- `mapWorkflowState(run, jobs)` maps: no run -> `idle`; queued -> `starting`; in-progress before `Keep session alive` -> `starting`; in-progress with `Keep session alive` step in progress -> `online`; completed failure -> `failed`; completed success -> `expired`; completed cancelled -> `idle`.

- [ ] **Step 1: Write failing REST-contract tests with an injected fake `fetch`**

Tests pin exact GitHub endpoints/methods: dispatch `POST /actions/workflows/ios-cloud.yml/dispatches`; list runs `GET /actions/workflows/ios-cloud.yml/runs`; jobs `GET /actions/runs/{run_id}/jobs`; cancel `POST /actions/runs/{run_id}/cancel`.

- [ ] **Step 2: Add state-mapping tests including Review Focus duplicate and online-step cases**

Assert active-run filtering ignores another session key and completed runs; assert a matching queued/in-progress run is active; assert `Keep session alive` is required before reporting `online`.

- [ ] **Step 3: Run tests and verify failure**

Run: `cd bot && npm test -- --run tests/github.test.ts tests/state.test.ts`

Expected: FAIL on missing modules.

- [ ] **Step 4: Implement GitHub client and pure state mapper**

Use native `fetch`; Authorization header is `Bearer ${GITHUB_TOKEN}` and API version header is `2022-11-28`. Never return the GitHub token in errors.

- [ ] **Step 5: Run tests and typecheck**

Run: `cd bot && npm test -- --run && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bot/src/github.ts bot/src/state.ts bot/tests/github.test.ts bot/tests/state.test.ts
git commit -m "feat: control github ios session runs"
```

---

### Task 7: Implement the secured Telegram webhook commands

**Files:**
- Create: `bot/tests/telegram.test.ts`
- Create: `bot/tests/index.test.ts`
- Create: `bot/src/telegram.ts`
- Create: `bot/src/index.ts`
- Create: `bot/api/telegram.ts`
- Create: `bot/vercel.json`

**Interfaces:**
- Produces `createTelegramClient(token: string, fetchImpl = fetch)` with `sendMessage(chatId: string, text: string, options?: { inlineKeyboard?: Array<Array<{ text: string; url?: string; callback_data?: string }>> }): Promise<void>`.
- Produces `handleTelegramUpdate(update: TelegramUpdate, deps: BotDependencies): Promise<void>`.
- Produces Vercel HTTP adapter that first verifies `X-Telegram-Bot-Api-Secret-Token === TELEGRAM_WEBHOOK_SECRET`; mismatch returns HTTP `401` without parsing/processing commands.
- Command behavior:
  - `/start`: send concise command help.
  - `/iphone`: if chat ID unauthorized, no GitHub call; if an active matching run exists, reply that it is already starting/online; otherwise dispatch and reply `🍎 Preparando seu iPhone...`.
  - `/status`: return the mapped session state from Task 6.
  - `/desligar`: cancel active run and reply `⏹ Encerrando sessão...`; if none, report no active session.

- [ ] **Step 1: Write failing Telegram client tests**

Assert `sendMessage` calls `https://api.telegram.org/bot<TOKEN>/sendMessage` with the expected chat ID/text and optional inline keyboard JSON; errors redact `<TOKEN>`.

- [ ] **Step 2: Write failing command-router tests**

Cover all four commands, unauthorized chat, duplicate `/iphone`, no active `/desligar`, unknown text, and GitHub API failure. The unauthorized and duplicate cases must assert `startSession` was not called.

- [ ] **Step 3: Write webhook adapter security test**

Wrong/missing Telegram webhook secret returns `401` and causes zero Telegram/GitHub calls. Correct header reaches the command router.

- [ ] **Step 4: Run tests and verify failure**

Run: `cd bot && npm test -- --run`

Expected: FAIL on missing implementations.

- [ ] **Step 5: Implement Telegram client, command router, and Vercel adapter**

Keep the HTTP response fast: acknowledge the webhook with `200` after the requested GitHub/Telegram API calls complete; do not long-poll Telegram.

- [ ] **Step 6: Run full bot tests and typecheck**

Run: `cd bot && npm test -- --run && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add bot/api bot/src bot/tests bot/vercel.json
git commit -m "feat: add telegram ios cloud commands"
```

---

### Task 8: Configure deployment/webhook setup and document the end-to-end POC

**Files:**
- Create: `bot/scripts/configure-webhook.ts`
- Modify: `bot/package.json`
- Create: `README.md`
- Modify: `.env.example`
- Modify: `docs/superpowers/specs/2026-09-26-telegram-ios-cloud-design.md` (status only: Draft -> Approved)

**Interfaces:**
- Produces command `npm run configure-webhook -- <https-public-bot-url>` that calls Telegram `setWebhook` with URL `<base>/api/telegram` and `secret_token = TELEGRAM_WEBHOOK_SECRET`.
- README lists exactly the required secrets/configuration locations:
  - Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `SESSION_HMAC_SECRET`, optional `SESSION_DURATION_MINUTES`.
  - GitHub Actions repository secret: `TELEGRAM_BOT_TOKEN`.
- `GITHUB_TOKEN` should be a fine-grained token scoped only to the new repository with Actions read/write and Metadata read.

- [ ] **Step 1: Add a failing unit test or dry-run test for webhook URL normalization**

Input `https://example.vercel.app/` must resolve to exactly `https://example.vercel.app/api/telegram`; non-HTTPS URLs are rejected.

- [ ] **Step 2: Implement webhook configuration script and package command**

The script must not print the bot token or webhook secret.

- [ ] **Step 3: Write README with a one-flow verification checklist**

Checklist: `/iphone` -> workflow appears -> `arm64`/Xcode 26/iOS 26 verified -> simulator created -> Quick Tunnel created -> Baguette remote check passes -> Telegram gets `ABRIR IPHONE` -> browser displays real iOS Simulator -> tap/swipe works -> `/status` says online -> `/desligar` cancels the run.

- [ ] **Step 4: Run all local tests**

Run:

```bash
cd bot && npm test -- --run && npm run typecheck
cd .. && bash tests/scripts/verify-macos.test.sh
bash tests/scripts/boot-simulator.test.sh
bash tests/scripts/start-tunnel.test.sh
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example bot/scripts bot/package.json docs/superpowers/specs/2026-09-26-telegram-ios-cloud-design.md
git commit -m "docs: add telegram ios cloud deployment guide"
```

---

### Task 9: Run the real GitHub Actions + Telegram acceptance test

**Files:**
- Modify only if the real runner exposes a documented compatibility difference discovered by the test.

**Interfaces:**
- Consumes the complete repository from Tasks 1–8.
- Produces evidence for the spec exit condition: a Telegram-triggered browser session controlling a real CoreSimulator through Baguette.

- [ ] **Step 1: Provision the external configuration without committing secrets**

Create the GitHub repository, deploy `bot/` to Vercel, configure the Vercel environment variables, add GitHub Actions secret `TELEGRAM_BOT_TOKEN`, and configure the Telegram webhook. If repository creation or secret-writing is not exposed by the active connector, this is the only manual/Work-mode provisioning step; all project files remain generated from this plan.

- [ ] **Step 2: Send `/iphone` from the authorized Telegram chat**

Expected immediately: `🍎 Preparando seu iPhone...`; exactly one `ios-cloud.yml` run is dispatched.

- [ ] **Step 3: Verify the runner evidence**

Expected Actions logs: `arm64`, macOS 26, Xcode 26.x, an available iOS 26 runtime, selected iPhone device name, fresh simulator UDID, Baguette local health success, remote health success. The tunnel URL and bot token must not appear in public logs.

- [ ] **Step 4: Open the Telegram `ABRIR IPHONE` button**

Expected: Baguette single-device page loads over HTTPS, the screen is a real iOS Simulator, and tap/swipe input changes the simulator UI. A static imitation is a failure.

- [ ] **Step 5: Verify `/status` and `/desligar`**

While the `Keep session alive` step is active, `/status` must report online. `/desligar` must request run cancellation; a later `/status` must no longer report online.

- [ ] **Step 6: Run regression tests after any runner-specific fix**

Run the full commands from Task 8, then re-run the acceptance flow once.

- [ ] **Step 7: Final commit only if acceptance testing required compatibility changes**

```bash
git add -A
git commit -m "fix: align ios cloud poc with github macos runner"
```

## Self-Review Results

- **Spec coverage:** All success criteria, non-goals, lifecycle states, security boundaries, observability requirements, dynamic simulator selection, timeout, and real-Simulator exit condition map to Tasks 2–9.
- **Step scan:** Each step is one checkable action; environment-specific code is validated by shell fixtures before the real runner acceptance test.
- **Type consistency:** `sessionKey`, workflow run title, step names, and `SessionState` are defined once and consumed consistently by the workflow and bot state mapper.
- **Review Focus:** All five high-risk failure classes have an owning test/task.
- **Proportion:** The plan specifies interfaces and assertions but leaves implementation bodies to execution; no subsystem beyond the POC spec was added.
