# Poker With Friends (Texas Hold'em MVP)

Multiplayer web app prototype for playing Texas Hold'em over the internet.

## Features

- Real-time room-based play with Socket.IO
- 2+ players per room
- Core hand flow: blinds, hole cards, flop/turn/river, showdown
- Actions: fold, check, call, raise
- Automatic hand ranking (high card through straight flush)

## Current MVP limitations

- No side-pot calculation yet (all-ins are simplified)
- No persistent accounts/history
- No host/admin controls beyond starting a hand

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in two browser windows/devices and join the same room code.

## Deploy notes

This app is a standard Node.js server. You can deploy it to Render, Fly.io, Railway, or a VPS.
Set `PORT` in production if your host requires it.
