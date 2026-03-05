# Caption Bridge — CaptionHub to Zoom

## Overview
A Node.js Express app that subscribes to CaptionHub captions via Pusher WebSocket and forwards them in real time to Zoom's third-party closed captioning REST API.

## Architecture
- **Frontend**: React + Shadcn UI, single page at `/`
- **Backend**: Express API with in-memory state (no database)
- **Integration**: CaptionHub Pusher WebSocket -> Zoom closed captioning POST

## Key Files
- `shared/schema.ts` - Zod schemas and TypeScript types for the connection config and log entries
- `server/routes.ts` - API routes (`/api/connect`, `/api/disconnect`, `/api/status`) and Pusher/Zoom integration logic
- `server/storage.ts` - In-memory state management (connection status, log entries, seq counter)
- `client/src/pages/home.tsx` - Main UI page with connection form, status indicator, and caption log
- `client/src/App.tsx` - App routing

## How It Works
1. Operator enters CaptionHub API token, Flow ID, and Zoom caption URL
2. Backend calls CaptionHub API to get Pusher connection details
3. Backend subscribes to Pusher channel and listens for caption events
4. Each caption is POSTed to Zoom's closedcaption URL with sequence numbers
5. Failed Zoom POSTs are retried with exponential backoff (3 retries, jittered delays)

## Dependencies
- `pusher-js` - WebSocket client for CaptionHub's Pusher channel
- `express` - HTTP server
- Standard template packages (React, Shadcn, TanStack Query, etc.)

## Routes
- `GET /` - Web UI
- `POST /api/connect` - Start caption forwarding
- `POST /api/disconnect` - Stop caption forwarding
- `GET /api/status` - Connection status and recent log (polled every 3s)
