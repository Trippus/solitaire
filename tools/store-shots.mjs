// Renders the Google Play store graphics with headless Microsoft Edge:
// phone screenshots (1080×1920) and the feature graphic (1024×500).
// Usage: start the dev server (npm start), then: node tools/store-shots.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'http://localhost:5180/';
const PORT = 9333;
const out = fileURLToPath(new URL('../store/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- a tiny Chrome DevTools Protocol client --------------------------------
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
      return await res.json();
    } catch {
      await sleep(200);
    }
  }
  throw new Error('Edge did not start');
}

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      listeners.get(msg.method)(msg.params);
      listeners.delete(msg.method);
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  return {
    ready,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    once: (method) => new Promise((r) => listeners.set(method, r)),
    close: () => ws.close(),
  };
}

// --- shots -------------------------------------------------------------------
const PHONE = { width: 412, height: 732, deviceScaleFactor: 2.625, mobile: true }; // → 1081×1921
const BANNER = { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false };

// A believable game in progress: replay hint moves on a fixed deal.
const MID_GAME = `
  document.querySelector('#iNew').click();
  await new Promise(r => setTimeout(r, 1600));
  const S = window.__syv, G = S.G;
  const st = G.deal(52611, 1);
  for (let i = 0, draws = 0; i < 400; i++) {
    const h = G.findHint(st);
    if (!h || st.foundations.flat().length >= 14) break;
    if (h.draw) { if (++draws > 30) break; G.draw(st); continue; }
    draws = 0; G.move(st, h.from, h.index, h.to);
  }
  st.started = true; st.elapsed = 214; st.score = 385;
  S.state = st;
  await new Promise(r => setTimeout(r, 900));`;

const WIN = `
  document.querySelector('#iNew').click();
  await new Promise(r => setTimeout(r, 1600));
  const S = window.__syv;
  const st = S.G.deal(1, 1), A = ['S','H','C','D'], B = ['H','S','D','C'];
  st.tableau = [[],[],[],[],[],[],[]]; st.stock = []; st.waste = []; st.foundations = [[],[],[],[]];
  for (let c = 0; c < 4; c++) for (let r = 13; r >= 1; r--) { const s = r % 2 ? A[c] : B[c]; st.tableau[c].push({ id: s + r, suit: s, rank: r, up: true }); }
  st.started = true; st.elapsed = 248; st.moves = 131; st.score = 655;
  S.state = st;
  await new Promise(r => setTimeout(r, 500));
  document.querySelector('#autoBtn').click();
  await new Promise(r => setTimeout(r, 8500));`;

const STATS = JSON.stringify({
  settings: { drawCount: 1, sound: true, autoFound: true, leftHand: false, table: 'green', back: 'red' },
  stats: { played: 48, won: 19, streak: 3, bestStreak: 5, bestTime: 162, bestScore: 6120 },
});
const MENU = `
  document.querySelector('#iNew').click();
  await new Promise(r => setTimeout(r, 2400));
  document.querySelector('#menuBtn').click();
  await new Promise(r => setTimeout(r, 700));`;

const shots = [
  { file: 'screenshots/1-intro.png', view: PHONE, url: BASE, setup: 'await new Promise(r => setTimeout(r, 1800));' },
  { file: 'screenshots/2-spil.png', view: PHONE, url: BASE, setup: MID_GAME },
  { file: 'screenshots/3-sejr.png', view: PHONE, url: BASE, setup: WIN },
  { file: 'screenshots/4-menu.png', view: PHONE, url: BASE, storage: STATS, setup: MENU },
  { file: 'feature-graphic-da.png', view: BANNER, url: BASE + 'store/feature-graphic.html', setup: 'await new Promise(r => setTimeout(r, 800));' },
  { file: 'feature-graphic-en.png', view: BANNER, url: BASE + 'store/feature-graphic.html?lang=en', setup: 'await new Promise(r => setTimeout(r, 800));' },
];

const profile = mkdtempSync(path.join(tmpdir(), 'store-shots-'));
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--hide-scrollbars', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });

try {
  const target = await connect();
  const cdp = client(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  mkdirSync(out + 'screenshots', { recursive: true });

  for (const shot of shots) {
    await cdp.send('Emulation.setDeviceMetricsOverride', shot.view);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: shot.view.mobile });
    // Start every shot from a clean slate (optionally with saved stats). The storage is
    // prepared on a page without the game, so the game can't save over it on unload.
    let loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: BASE + 'privacy.html' });
    await loaded;
    const seed = shot.storage ? `localStorage.setItem('syvkabale.v1', ${JSON.stringify(shot.storage)});` : '';
    await cdp.send('Runtime.evaluate', { expression: `localStorage.clear(); ${seed}` });
    loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: shot.url });
    await loaded;
    await cdp.send('Runtime.evaluate', { expression: `(async () => { ${shot.setup} })()`, awaitPromise: true });
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out + shot.file, Buffer.from(data, 'base64'));
    console.log('store/' + shot.file);
  }
  cdp.close();
} finally {
  edge.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* Edge may still hold a lock on its temp profile; the OS cleans it up */
  }
}
