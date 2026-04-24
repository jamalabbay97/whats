# WhatsApp Group Forward Bot

A production-ready Node.js bot that listens to a **SOURCE** WhatsApp group and instantly forwards all supported messages to a **TARGET** group using `whatsapp-web.js`.

## Features

- QR login with `qrcode-terminal`
- Session persistence via `LocalAuth` (no repeated QR scans)
- Real-time forwarding from source group to target group
- Supports text and media forwarding:
  - text
  - images
  - videos
  - documents
  - voice notes
- Caption preservation for media messages
- Ignores bot's own messages
- Duplicate-forward prevention
- Retry on send failures
- Basic rate limiting to reduce ban risk
- Graceful shutdown (`SIGINT`, `SIGTERM`)
- Clear structured logging
- PM2 friendly (`npm start`)

## Project Structure

- `index.js` - main entry point and WhatsApp lifecycle handlers
- `config.js` - environment config parsing/validation
- `logger.js` - simple leveled logger
- `messageHandler.js` - forwarding logic, retries, and dedupe

## Requirements

- Node.js 20+ (LTS recommended)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env`:

   - `SOURCE_GROUP_NAME` must match group subject exactly
   - `TARGET_GROUP_NAME` must match group subject exactly

## Run

```bash
npm start
```

On first run, scan the QR code shown in terminal.

## Environment Variables

- `SOURCE_GROUP_NAME` (required)
- `TARGET_GROUP_NAME` (required)
- `MAX_RETRY_ATTEMPTS` (optional, default `3`)
- `RETRY_DELAY_MS` (optional, default `1500`)
- `RATE_LIMIT_MS` (optional, default `400`)
- `DEDUPE_TTL_MS` (optional, default `300000`)
- `LOG_LEVEL` (optional: `error|warn|info|debug`, default `info`)

## PM2 Example

```bash
pm2 start npm --name whatsapp-forward-bot -- start
pm2 logs whatsapp-forward-bot
```

## Security Notes

- `.env`, auth/session files, and cache files are gitignored.
- Never commit `.wwebjs_auth` directory.
- Keep the machine secure because authentication session lives on disk.