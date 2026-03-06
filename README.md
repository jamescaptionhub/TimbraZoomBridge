# Caption Bridge

Forward CaptionHub captions to Zoom closed captioning in real time.

## What It Does

Caption Bridge connects to a CaptionHub Timbra flow via WebSocket and automatically forwards every caption to Zoom's third-party closed captioning API. It's an internal operations tool designed for live events where CaptionHub provides the captions and Zoom needs to display them.

## How It Works

```
CaptionHub Timbra Flow
        |
        | WebSocket (via SDK)
        v
  Caption Bridge Server
        |
        | HTTP POST (with retry)
        v
  Zoom Closed Captioning API
```

1. The operator opens the web UI and enters the **CaptionHub Flow ID** and the **Zoom caption API URL**
2. The server uses the official `@captionhub/captionhub-node-sdk` to subscribe to the flow via `timbra.subscribe()`
3. The SDK establishes a Pusher WebSocket connection and delivers structured caption events
4. Each caption is immediately POSTed to Zoom's `/closedcaption` endpoint with a sequence number and language tag
5. If a Zoom POST fails (5xx or network error), it retries up to 3 times with exponential backoff and jitter
6. The web UI polls for status every 3 seconds and displays a live log of the last 20 forwarded captions

## Project Structure

```
├── client/                    # React frontend
│   └── src/
│       ├── App.tsx            # App routing
│       ├── pages/
│       │   └── home.tsx       # Main UI (connection form, status, log)
│       ├── components/ui/     # Shadcn UI components
│       ├── hooks/             # Custom React hooks
│       └── lib/               # Query client and utilities
├── server/                    # Express backend
│   ├── index.ts               # Server entry point
│   ├── routes.ts              # API routes and CaptionHub/Zoom integration
│   └── storage.ts             # In-memory state management
├── shared/
│   └── schema.ts              # Shared types, Zod schemas, language list
└── package.json
```

### Key Files

| File | Purpose |
|------|---------|
| `server/routes.ts` | API endpoints, CaptionHub SDK subscription, Zoom forwarding with retry logic |
| `server/storage.ts` | In-memory state: connection status, caption log (last 20), sequence counter |
| `shared/schema.ts` | Zod validation schemas, TypeScript types, supported language list |
| `client/src/pages/home.tsx` | Single-page UI with connection form, live status indicator, and caption log |

## Setup

### Prerequisites

- Node.js 18+
- npm
- A CaptionHub account with API access
- A Zoom meeting with third-party closed captioning enabled

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CAPTIONHUB_API_KEY` | Optional | CaptionHub API token. If set, the UI skips the token input field and uses this automatically. If not set, the operator must enter it in the UI each time. |
| `SESSION_SECRET` | No | Express session secret (not currently used but available) |

### Install and Run

```bash
npm install
npm run dev
```

The app starts on port 5000 (or the port specified by the `PORT` environment variable). Both the API and frontend are served from the same port.

### Build for Production

```bash
npm run build
npm start
```

## Usage

1. Open the web UI in your browser
2. If `CAPTIONHUB_API_KEY` is not set, enter your CaptionHub API token
3. Enter the **CaptionHub Flow ID** (e.g. `8ccea7c864e5`)
4. Select a **Caption Language** to filter (or leave as "All Languages" to forward everything)
5. Paste the **Zoom Caption API URL** from your Zoom meeting
6. Click **Connect**

The status indicator will show "Connected" once the WebSocket is established. Captions will appear in the log panel as they are forwarded.

Click **Disconnect** to stop forwarding.

### Getting the Zoom Caption URL

In your Zoom meeting:
1. Click the **CC** (Closed Caption) button in the toolbar
2. Select **Set Up Manual Captioner**
3. Copy the **API token URL** — it looks like `https://wmcc.zoom.us/closedcaption?id=...&ns=...&expire=...`

**Important:** This URL is session-scoped. You need a fresh one at the start of each Zoom meeting.

## API Reference

### `GET /api/config`

Returns server configuration.

**Response:**
```json
{
  "hasCaptionHubKey": true
}
```

### `POST /api/connect`

Start caption forwarding.

**Request body:**
```json
{
  "flowId": "8ccea7c864e5",
  "zoomToken": "https://wmcc.zoom.us/closedcaption?id=...",
  "captionHubToken": "optional-if-env-var-set",
  "language": "EN"
}
```

- `flowId` (required) — CaptionHub Timbra flow ID
- `zoomToken` (required) — Full Zoom closedcaption URL (must contain `closedcaption` and `id=`)
- `captionHubToken` (optional) — Falls back to `CAPTIONHUB_API_KEY` env var
- `language` (optional) — 2-letter language code (e.g. `EN`, `ES`, `FR`). Empty string or omitted means all languages.

### `POST /api/disconnect`

Stop caption forwarding and reset all state.

### `GET /api/status`

Returns current connection status and recent caption log. Polled by the frontend every 3 seconds.

**Response:**
```json
{
  "connectionStatus": "connected",
  "lastCaptionAt": "2024-01-01T10:00:00.000Z",
  "recentLog": [
    {
      "timestamp": "2024-01-01T10:00:00.000Z",
      "text": "Hello, welcome to the session.",
      "status": 200,
      "retries": 0
    }
  ],
  "language": "EN"
}
```

`connectionStatus` is one of: `disconnected`, `connecting`, `connected`, `error`.

## Language Filtering

When a language is selected, only captions matching that language code are forwarded to Zoom. Captions in other languages are skipped. The language code is also mapped to a Zoom-compatible locale (e.g. `EN` becomes `en-US`, `ES` becomes `es-ES`) and sent in the `lang` query parameter to Zoom.

Supported languages: English, Spanish, French, German, Italian, Portuguese, Dutch, Polish, Russian, Japanese, Korean, Chinese, Arabic, Hindi, Turkish, Swedish, Danish, Norwegian, Finnish, Czech, Hungarian, Romanian, Ukrainian, Hebrew, Thai, Vietnamese, Indonesian, Malay.

## Retry Logic

When a Zoom POST fails:

1. **5xx errors** and **network failures** trigger retries (up to 3 attempts)
2. Each retry waits with exponential backoff: `100ms * 2^attempt`
3. Jitter of +/-50ms is added to prevent thundering herd
4. **4xx errors** are not retried (these indicate a client-side issue like an expired URL)
5. If all retries fail, the caption is logged with status `failed` and the app moves on

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Backend:** Express
- **Frontend:** React, Tailwind CSS, Shadcn UI, TanStack Query
- **CaptionHub:** `@captionhub/captionhub-node-sdk` (handles Pusher WebSocket internally)
- **Validation:** Zod
- **Build:** Vite + esbuild
