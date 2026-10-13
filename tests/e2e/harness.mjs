// Shared setup for the end-to-end tests: starts the game's own dev server on a free
// port and a headless Edge, and gives each test a fresh page with empty storage.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchEdge, sleep } from '../../tools/edge.mjs';

export { sleep };
export const PHONE = { width: 390, height: 844, deviceScaleFactor: 1, mobile: true };

const root = fileURLToPath(new URL('../../', import.meta.url));

export async function startGame() {
  const port = 5600 + Math.floor(Math.random() * 300);
  const server = spawn(process.execPath, ['tools/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => String(d).includes('running at') && resolve());
    server.on('exit', (code) => reject(new Error(`dev server exited (${code})`)));
  });
  const base = `http://localhost:${port}/`;
  const { page, close } = await launchEdge();

  return {
    page,
    base,
    // Opens the game with clean storage, optionally seeded with a saved game (an object).
    async fresh(saved = null, query = '') {
      await page.open(base + 'privacy.html', PHONE);
      await page.eval(`localStorage.clear(); ${saved ? `localStorage.setItem('syvkabale.v1', ${JSON.stringify(JSON.stringify(saved))});` : ''}`);
      page.errors.length = 0;
      await page.open(base + query, PHONE);
      await sleep(300);
    },
    async reload() {
      await page.eval('window.dispatchEvent(new Event("pagehide"))');
      await page.open(base, PHONE);
      await sleep(300);
    },
    async stop() {
      await close();
      server.kill();
    },
  };
}

// Small DOM helpers that run inside the page. They act through the real buttons and
// the board's pointer events, the same way a player does.
export const DOM = `
  const $ = (s) => document.querySelector(s);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const A = window.__syv, G = A.G;
  const cardEl = (id) => document.querySelector('.card[data-id="' + id + '"]');
  // A tap: press and release on the same spot without moving.
  const tapCard = (id) => {
    const el = cardEl(id);
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, pointerId: 1, button: 0, clientX: r.left + r.width / 2, clientY: r.top + 10 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    window.dispatchEvent(new PointerEvent('pointerup', opts));
  };
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  const where = (id) => { for (const k of ['stock', 'waste', 'f0', 'f1', 'f2', 'f3', 't0', 't1', 't2', 't3', 't4', 't5', 't6']) if (G.pile(A.state, k).some((c) => c.id === id)) return k; };
  // Starts a new game from the intro and waits for the deal animation.
  const deal = async () => { $('#iNew').click(); await wait(1900); };
`;
