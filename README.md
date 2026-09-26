# Telegram iOS Cloud

Prova de conceito, custo zero: um chat autorizado no Telegram pede um iPhone, o GitHub Actions sobe **um** simulador Apple de verdade (`macos-26`, arm64, Xcode 26, iOS 26) e o Baguette entrega a tela por um túnel HTTPS temporário.

Isto não é um iPhone desenhado em HTML. Se o navegador não estiver controlando o CoreSimulator, a prova falhou.

## Fluxo

1. `/iphone` no Telegram.
2. O bot na Vercel dispara `ios-cloud.yml` (`workflow_dispatch` apenas).
3. O runner confere arquitetura, Xcode e runtime, cria um `iPhone 17 Pro` (ou o primeiro iPhone disponível) e inicia o simulador.
4. Um Cloudflare Quick Tunnel expõe `127.0.0.1:8421`.
5. O Baguette sobe confiando **somente** aquele hostname `*.trycloudflare.com`.
6. O workflow só avisa o Telegram depois que `GET /simulators.json` responde 2xx pelo túnel.
7. O botão `ABRIR IPHONE` abre `/simulators/<udid>`.
8. A sessão dura de 5 a 90 minutos (padrão 60) e depois desliga.

O estado fica no GitHub Actions. Não há banco neste marco.

## Segredos

Vercel (projeto do diretório `bot/`):

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ALLOWED_CHAT_ID`
- `GITHUB_TOKEN`
- `GITHUB_REPOSITORY` (`owner/telegram-ios-cloud`)
- `SESSION_HMAC_SECRET`
- `SESSION_DURATION_MINUTES` (opcional, 5–90, padrão 60)

GitHub Actions, secret do repositório:

- `TELEGRAM_BOT_TOKEN`

`GITHUB_TOKEN` deve ser um token fine-grained só deste repositório, com Actions leitura/escrita e Metadata leitura. Nada de segredo entra no git, no chat ou no log público. A URL do túnel é mascarada com `::add-mask::` antes de ir para `GITHUB_OUTPUT`.

## Webhook

Na Vercel, depois do deploy:

```bash
cd bot
npm run configure-webhook -- https://seu-projeto.vercel.app
```

Isso chama `setWebhook` em `https://seu-projeto.vercel.app/api/telegram` com `secret_token`. O script não imprime o token nem o segredo.

## Comandos

- `/start` — ajuda
- `/iphone` — dispara uma sessão, ou avisa se já existe uma na fila / online
- `/status` — `idle`, `iniciando`, `online`, `falhou` ou `expirada`
- `/desligar` — cancela o run ativo

Chat diferente de `TELEGRAM_ALLOWED_CHAT_ID` não dispara nada no GitHub.

## Checklist de aceitação

1. `/iphone` responde `🍎 Preparando seu iPhone...` e existe **um** run de `ios-cloud.yml`.
2. O log mostra `arm64`, macOS 26, Xcode 26.x e um runtime iOS 26.
3. O simulador é criado com o iPhone escolhido e um UDID novo.
4. O Quick Tunnel sobe e o Baguette passa no teste remoto.
5. O Telegram recebe o botão `ABRIR IPHONE`.
6. No navegador, a tela é o simulador real; toque e swipe mudam a interface. Uma imitação estática é falha.
7. `/status` diz online enquanto `Keep session alive` está em progresso.
8. `/desligar` cancela o run e um `/status` seguinte não diz mais online.

A URL do túnel e o token do bot não podem aparecer no log público.

## O que este marco não faz

Pagamento, vários usuários, Apple ID, App Store, rotação de IP, fingerprint ou qualquer atalho de fraude. GitHub Actions não é hospedagem de produção. O Quick Tunnel morre com o workflow.

## Testes locais

```bash
cd bot && npm test -- --run && npm run typecheck
cd .. && bash tests/scripts/verify-macos.test.sh
bash tests/scripts/boot-simulator.test.sh
bash tests/scripts/start-tunnel.test.sh
```

O teste final com runner, Telegram e toque real depende de um repositório GitHub `macos-26` e dos segredos acima. Criar o repositório vazio e gravar o secret do Actions são passos manuais.
