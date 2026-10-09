# Syvkabale

Klondike solitaire ("syvkabale") as an installable iPhone web app (PWA). No App Store or Mac needed. Install it from Safari and it runs full screen and offline, like a native app.

## Features
- Drag and drop, or tap a card to send it to the best spot
- Draw 1 or Draw 3, unlimited undo, hints, safe auto-play to the foundations
- "Afslut automatisk" button once every card is face up, then the classic bouncing-cards victory lap
- Animated dealing and 3D card flips. Sounds are synthesized with Web Audio, so there are no audio files
- Score with time bonus, timer, statistics (win %, best time, record, streaks)
- Table colors, card backs, left-handed layout
- Saves the game in progress automatically and works offline through a service worker

## Run locally
```bash
npm start
```
Open http://localhost:5180. The server also prints a LAN address, so you can try the game on your iPhone over the same Wi-Fi. Offline mode and service workers need HTTPS, so they only work once the app is hosted.

## Install on iPhone
Host the folder on any HTTPS static host, such as GitHub Pages, Netlify or Cloudflare Pages. Open the URL in Safari, tap **Del** (Share), then **Føj til hjemmeskærm** (Add to Home Screen).

## Structure
- `js/game.js`: pure rules (deal, moves, hints, auto-play), with no DOM code
- `js/app.js`: rendering, input, persistence and UI
- `js/fx.js`: canvas card rendering and the victory animation
- `js/audio.js`: synthesized sound effects
- `tools/make-icons.mjs`: renders the app icons to PNG with no dependencies
- `sw.js`: offline cache. Bump `VERSION` when you ship changes
