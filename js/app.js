import * as G from './game.js';
import { RANK_LABEL, svgSuit } from './suits.js';
import { Sound } from './audio.js';
import { celebrate } from './fx.js';
import { Ads } from './ads.js';

const $ = (s) => document.querySelector(s);
const board = $('#board');
const STORE = 'syvkabale.v1';
const KEYS = ['stock', 'waste', 'f0', 'f1', 'f2', 'f3', 't0', 't1', 't2', 't3', 't4', 't5', 't6'];

const TABLES = {
  green: { name: 'Filt', c: ['#2f9563', '#0b3a24'] },
  blue: { name: 'Hav', c: ['#2f72ad', '#0a2140'] },
  wine: { name: 'Bordeaux', c: ['#9a3550', '#350a18'] },
  night: { name: 'Nat', c: ['#454c5a', '#101318'] },
};
const BACKS = {
  red: { c: ['#e5525f', '#8d1323'], line: 'rgba(255,255,255,.2)', rim: 'rgba(255,255,255,.8)' },
  blue: { c: ['#4a7be0', '#132b66'], line: 'rgba(255,255,255,.18)', rim: 'rgba(255,255,255,.8)' },
  green: { c: ['#40b077', '#0d4529'], line: 'rgba(255,255,255,.18)', rim: 'rgba(255,255,255,.8)' },
  gold: { c: ['#3b3b40', '#101013'], line: 'rgba(242,201,76,.3)', rim: '#f2c94c' },
};

const settings = { drawCount: 1, sound: true, autoFound: true, leftHand: false, table: 'green', back: 'red' };
const stats = { played: 0, won: 0, streak: 0, bestStreak: 0, bestTime: 0, bestScore: 0 };

let state = null;
let history = [];
let M = null; // layout metrics
const els = new Map(); // card id -> element
const slots = new Map(); // pile key -> placeholder element
const pos = new Map(); // card id -> last rendered {x, y, z, up}
let busy = false;
let drag = null;
let autoTimer = 0;
let hintTimer = 0;
let skipAutoId = null;
let fx = null;

/* ---------- persistence ---------- */

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!d) return;
    Object.assign(settings, d.settings);
    Object.assign(stats, d.stats);
    if (d.state && !d.state.won) {
      state = d.state;
      history = d.history || [];
    }
  } catch {
    /* corrupted or blocked storage: start fresh */
  }
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ settings, stats, state, history: history.slice(-150) }));
  } catch {
    /* private mode etc. */
  }
}

/* ---------- DOM ---------- */

const cardClass = (suit, r) => `${G.isRed(suit) ? 'red' : 'black'}${r > 10 ? ' court' : ''}${r === 1 ? ' ace' : ''}`;

function faceHtml(suit, r) {
  const art = r > 10 ? `<span class="letter">${RANK_LABEL[r]}</span>` : svgSuit(suit, 'big');
  return `<div class="face"><div class="corner"><span class="rk">${RANK_LABEL[r]}</span>${svgSuit(suit, 'sm')}</div>${art}</div>`;
}

function buildBoard() {
  for (const key of KEYS) {
    const s = document.createElement('div');
    s.className = 'slot slot-' + (key.length > 2 ? key : key[0]);
    s.dataset.key = key;
    if (key === 'stock') s.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>';
    else if (key[0] === 'f') s.innerHTML = '<span>A</span>';
    else if (key[0] === 't') s.innerHTML = '<span>K</span>';
    board.appendChild(s);
    slots.set(key, s);
  }
  for (const suit of G.SUITS) {
    for (let r = 1; r <= 13; r++) {
      const el = document.createElement('div');
      el.className = `card down ${cardClass(suit, r)}`;
      el.dataset.id = suit + r;
      el.innerHTML = `<div class="card-inner">${faceHtml(suit, r)}<div class="back"><i class="emblem"></i></div></div>`;
      board.appendChild(el);
      els.set(suit + r, el);
    }
  }
}

function layout() {
  const W = board.clientWidth;
  const H = board.clientHeight;
  const pad = Math.max(6, Math.min(W, H) * 0.02);
  let cw = (W - 2 * pad) / (7 + 6 * 0.12);
  // The floor guards against a zero-sized window (hidden tab, mid-rotation).
  cw = Math.max(16, Math.floor(Math.min(cw, (H - 2 * pad) / (1.4 * 3.3), 124)));
  const ch = Math.round(cw * 1.4);
  const gap = Math.min(cw * 0.5, Math.max(cw * 0.06, (W - 2 * pad - 7 * cw) / 6));
  const x0 = (W - (7 * cw + 6 * gap)) / 2;
  const colX = (i) => Math.round(x0 + i * (cw + gap));
  const topY = Math.round(pad);
  const tabY = Math.round(topY + ch + Math.max(gap * 1.4, ch * 0.14));
  const L = settings.leftHand;
  const slotPos = { stock: [colX(L ? 6 : 0), topY], waste: [colX(L ? 5 : 1), topY] };
  for (let f = 0; f < 4; f++) slotPos['f' + f] = [colX(L ? f : 3 + f), topY];
  for (let t = 0; t < 7; t++) slotPos['t' + t] = [colX(t), tabY];
  M = { W, H, cw, ch, tabY, bottom: H - pad, slotPos, fanDir: L ? -1 : 1 };
  board.style.setProperty('--cw', cw + 'px');
  board.style.setProperty('--ch', ch + 'px');
  for (const [k, [x, y]] of Object.entries(slotPos)) slots.get(k).style.transform = `translate(${x}px,${y}px)`;
}

function fanOffsets(p) {
  let down = M.ch * 0.12;
  let up = M.ch * 0.28;
  const nd = p.filter((c) => !c.up).length;
  const need = nd * down + Math.max(0, p.length - nd - 1) * up;
  const avail = M.bottom - M.tabY - M.ch;
  if (need > avail) {
    const f = avail / need;
    down *= f;
    up *= f;
  }
  return { down, up };
}

function computeTargets() {
  const T = new Map();
  const { cw, slotPos } = M;
  const put = (c, x, y, z) => T.set(c.id, { x: Math.round(x), y: Math.round(y), z, up: c.up });
  state.stock.forEach((c, i) => put(c, slotPos.stock[0], slotPos.stock[1], i + 1));
  const w = state.waste;
  const fanN = Math.min(state.drawCount === 3 ? 3 : 1, w.length);
  w.forEach((c, i) => {
    const k = i - (w.length - fanN);
    put(c, slotPos.waste[0] + (k > 0 ? k * cw * 0.3 * M.fanDir : 0), slotPos.waste[1], i + 1);
  });
  state.foundations.forEach((f, fi) => f.forEach((c, i) => put(c, ...slotPos['f' + fi], i + 1)));
  state.tableau.forEach((p, t) => {
    const [x, y0] = slotPos['t' + t];
    const { down, up } = fanOffsets(p);
    let y = y0;
    p.forEach((c, i) => {
      put(c, x, y, i + 1);
      y += c.up ? up : down;
    });
  });
  return T;
}

function render(opts = {}) {
  const T = computeTargets();
  const force = opts.force || [];
  for (const [id, t] of T) {
    const el = els.get(id);
    const prev = pos.get(id);
    const moved = !opts.instant && (!prev || prev.x !== t.x || prev.y !== t.y || force.includes(id));
    const d = opts.delay ? opts.delay(id) : 0;
    el.style.setProperty('--d', d + 'ms');
    el.classList.toggle('down', !t.up);
    clearTimeout(el._zt);
    if (moved) {
      // Fly above everything while travelling, then settle into the pile.
      el.style.zIndex = 1000 + t.z;
      el._zt = setTimeout(() => (el.style.zIndex = t.z), 420 + d);
    } else {
      el.style.zIndex = t.z;
    }
    el.style.transform = `translate3d(${t.x}px,${t.y}px,0)`;
    pos.set(id, t);
  }
  updateHud();
}

function renderInstant() {
  board.classList.add('no-anim');
  render({ instant: true });
  void board.offsetWidth;
  board.classList.remove('no-anim');
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function updateHud() {
  $('#score').textContent = state.score;
  $('#time').textContent = fmtTime(state.elapsed | 0);
  $('#moves').textContent = state.moves;
  $('#undoBtn').disabled = !history.length || state.won;
  $('#autoBtn').classList.toggle('show', !busy && G.canAutoComplete(state));
  const stock = slots.get('stock');
  stock.classList.toggle('can-recycle', !state.stock.length && state.waste.length > 0);
}

/* ---------- actions ---------- */

function begin() {
  if (!state.started) {
    state.started = true;
    stats.played++;
  }
  history.push(JSON.stringify(state));
  if (history.length > 300) history.shift();
  clearHints();
}

function after() {
  save();
  if (G.isWon(state)) return win();
  updateHud();
  scheduleAuto();
}

function doMove(from, index, to, auto = false) {
  const src = G.pile(state, from);
  const card = src[index];
  const ids = src.slice(index).map((c) => c.id);
  if (!auto) {
    begin();
    skipAutoId = from[0] === 'f' ? card.id : null;
  }
  const res = G.move(state, from, index, to);
  if (to[0] === 'f') Sound.play('found', { rank: card.rank });
  else Sound.play('place');
  if (res.flipped) Sound.play('flip', { delay: 0.12 });
  render({ force: ids });
  after();
}

function doDraw() {
  if (!state.stock.length && !state.waste.length) return;
  clearTimeout(autoTimer);
  begin();
  const before = state.waste.length;
  const result = G.draw(state);
  if (result === 'draw') {
    const fresh = state.waste.slice(before).map((c) => c.id);
    render({ delay: (id) => Math.max(0, fresh.indexOf(id)) * 70 });
    fresh.forEach((_, i) => Sound.play('flip', { delay: i * 0.07 }));
  } else {
    render();
    Sound.play('shuffle');
  }
  after();
}

function undo() {
  if (busy || !history.length || state.won) return;
  clearTimeout(autoTimer);
  clearHints();
  const prev = JSON.parse(history.pop());
  prev.elapsed = state.elapsed;
  prev.started = true;
  state = prev;
  skipAutoId = null;
  Sound.play('place', { vol: 0.6 });
  render();
  save();
}

function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!settings.autoFound || busy || state.won) return;
  autoTimer = setTimeout(() => {
    if (drag || busy) return scheduleAuto();
    const m = G.safeAutoMove(state, skipAutoId);
    if (m) doMove(m.from, m.index, m.to, true);
  }, 240);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function autoComplete() {
  if (busy || !G.canAutoComplete(state)) return;
  clearTimeout(autoTimer);
  begin();
  busy = true;
  updateHud();
  let m;
  while ((m = G.autoCompleteStep(state))) {
    const card = G.pile(state, m.from)[m.index];
    G.move(state, m.from, m.index, m.to);
    Sound.play('found', { rank: card.rank, vol: 0.7 });
    render({ force: [card.id] });
    await sleep(80);
  }
  busy = false;
  after();
}

function clearHints() {
  clearTimeout(hintTimer);
  document.querySelectorAll('.hint').forEach((el) => el.classList.remove('hint'));
}

function hint() {
  if (busy || state.won) return;
  clearHints();
  const h = G.findHint(state);
  if (!h) {
    toast('Ingen flere træk. Prøv Fortryd – eller start et nyt spil.');
    Sound.play('error');
    return;
  }
  const mark = [];
  if (h.draw) {
    mark.push(state.stock.length ? els.get(G.top(state.stock).id) : slots.get('stock'));
  } else {
    G.pile(state, h.from).slice(h.index).forEach((c) => mark.push(els.get(c.id)));
    const dst = G.pile(state, h.to);
    mark.push(dst.length ? els.get(G.top(dst).id) : slots.get(h.to));
  }
  mark.forEach((el) => el.classList.add('hint'));
  hintTimer = setTimeout(clearHints, 1800);
}

function shake(ids) {
  Sound.play('error', { vol: 0.6 });
  ids.forEach((id) => {
    const el = els.get(id);
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  });
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;

function newGame(seed) {
  clearTimeout(autoTimer);
  clearHints();
  closeModal('#winModal');
  Ads.hideBanner();
  if (fx) {
    fx.stop();
    fx = null;
  }
  if (state && state.started && !state.won) stats.streak = 0;
  state = G.deal(seed ?? randomSeed(), settings.drawCount);
  history = [];
  skipAutoId = null;

  // Gather the whole deck on the stock, then deal it out one card at a time.
  const [sx, sy] = M.slotPos.stock;
  board.classList.add('no-anim');
  els.forEach((el, id) => {
    el.style.visibility = '';
    el.classList.add('down');
    el.style.transform = `translate3d(${sx}px,${sy}px,0)`;
    pos.set(id, { x: sx, y: sy });
  });
  void board.offsetWidth;
  board.classList.remove('no-anim');

  const order = new Map();
  let k = 0;
  for (let row = 0; row < 7; row++) for (let c = row; c < 7; c++) order.set(state.tableau[c][row].id, k++);
  busy = true;
  render({ delay: (id) => (order.has(id) ? order.get(id) * 38 : 0) });
  for (let i = 0; i < 28; i += 2) Sound.play('flip', { delay: i * 0.038, vol: 0.5 });
  setTimeout(() => {
    busy = false;
    updateHud();
    scheduleAuto();
  }, 28 * 38 + 450);
  $('#seedNo').textContent = state.seed;
  save();
}

/* ---------- winning ---------- */

function win() {
  if (state.won) return;
  state.won = true;
  clearTimeout(autoTimer);
  const t = state.elapsed;
  const bonus = t > 30 ? Math.round(700000 / t) : 0; // the classic time bonus
  state.score += bonus;
  stats.won++;
  stats.streak++;
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  const newTime = !stats.bestTime || t < stats.bestTime;
  const newScore = state.score > stats.bestScore;
  if (newTime) stats.bestTime = t;
  if (newScore) stats.bestScore = state.score;
  save();
  busy = true;
  updateHud();
  Sound.play('win');
  setTimeout(() => {
    const r = board.getBoundingClientRect();
    const list = [];
    for (let rank = 13; rank >= 1; rank--) {
      for (const f of state.foundations) {
        const c = f[rank - 1];
        const p = pos.get(c.id);
        list.push({ card: c, x: r.left + p.x, y: r.top + p.y, el: els.get(c.id) });
      }
    }
    setTimeout(() => showWin({ bonus, newTime, newScore }), 1600);
    try {
      fx = celebrate({ canvas: $('#fx'), cards: list, cw: M.cw, ch: M.ch });
    } catch {
      // The victory lap is decoration; the win dialog must appear regardless.
    }
  }, 500);
}

function showWin({ bonus, newTime, newScore }) {
  $('#wScore').textContent = state.score;
  $('#wTime').textContent = fmtTime(state.elapsed);
  $('#wMoves').textContent = state.moves;
  const badges = [];
  if (bonus) badges.push(`Tidsbonus +${bonus}`);
  if (newTime && stats.won > 1) badges.push('Ny bedste tid!');
  if (newScore && stats.won > 1) badges.push('Ny rekord!');
  if (stats.streak > 1) badges.push(`${stats.streak} sejre i træk`);
  $('#wBadges').innerHTML = badges.map((b) => `<span>${b}</span>`).join('');
  openModal('#winModal');
  Ads.showBanner();
  busy = false;
}

/* ---------- input ---------- */

function locate(id) {
  for (const key of KEYS) {
    const index = G.pile(state, key).findIndex((c) => c.id === id);
    if (index >= 0) return { key, index };
  }
  return null;
}

function findDrop(d, dx, dy) {
  const p0 = pos.get(d.ids[0]);
  const ax = p0.x + dx;
  const ay = p0.y + dy;
  const { cw, ch } = M;
  const keys = [];
  if (d.ids.length === 1) keys.push('f0', 'f1', 'f2', 'f3');
  for (let t = 0; t < 7; t++) keys.push('t' + t);
  let best = null;
  let bestArea = 0;
  for (const key of keys) {
    if (!G.canMove(state, d.key, d.index, key)) continue;
    const [sx, sy] = M.slotPos[key];
    const p = G.pile(state, key);
    const bottom = (p.length ? pos.get(G.top(p).id).y : sy) + ch;
    const ox = Math.min(ax + cw, sx + cw) - Math.max(ax, sx);
    const oy = Math.min(ay + ch, bottom) - Math.max(ay, sy);
    if (ox > 0 && oy > 0 && ox * oy > bestArea) {
      bestArea = ox * oy;
      best = key;
    }
  }
  return best;
}

function dropTargetEl(key) {
  if (!key) return null;
  const p = G.pile(state, key);
  return p.length ? els.get(G.top(p).id) : slots.get(key);
}

function onDown(e) {
  if (busy || drag || state.won || e.button > 0) return;
  const cardEl = e.target.closest('.card');
  const slotEl = e.target.closest('.slot');
  if (!cardEl) {
    if (slotEl && slotEl.dataset.key === 'stock') doDraw();
    return;
  }
  const loc = locate(cardEl.dataset.id);
  if (!loc) return;
  if (loc.key === 'stock') return doDraw();
  const p = G.pile(state, loc.key);
  if (!p[loc.index].up) return;
  if (loc.key[0] !== 't' && loc.index !== p.length - 1) return;
  e.preventDefault();
  drag = {
    key: loc.key, index: loc.index, ids: p.slice(loc.index).map((c) => c.id),
    x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, started: false, target: null, targetEl: null,
  };
}

function onMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.x0;
  const dy = e.clientY - drag.y0;
  if (!drag.started) {
    if (Math.hypot(dx, dy) < 7) return;
    drag.started = true;
    clearHints();
    drag.ids.forEach((id, i) => {
      const el = els.get(id);
      clearTimeout(el._zt);
      el.classList.add('dragging');
      el.style.zIndex = 3000 + i;
    });
  }
  drag.ids.forEach((id) => {
    const p = pos.get(id);
    els.get(id).style.transform = `translate3d(${p.x + dx}px,${p.y + dy}px,0)`;
  });
  const target = findDrop(drag, dx, dy);
  if (target !== drag.target) {
    drag.targetEl?.classList.remove('drop-ok');
    drag.target = target;
    drag.targetEl = dropTargetEl(target);
    drag.targetEl?.classList.add('drop-ok');
  }
}

function onUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  d.targetEl?.classList.remove('drop-ok');
  if (!d.started) {
    if (d.key[0] === 'f') return;
    const to = G.bestTarget(state, d.key, d.index);
    return to ? doMove(d.key, d.index, to) : shake(d.ids);
  }
  d.ids.forEach((id) => els.get(id).classList.remove('dragging'));
  const to = e.type === 'pointercancel' ? null : findDrop(d, e.clientX - d.x0, e.clientY - d.y0);
  if (to) doMove(d.key, d.index, to);
  else render({ force: d.ids });
}

/* ---------- chrome: modals, menu, toast ---------- */

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function openModal(sel) {
  $(sel).classList.add('open');
  if (sel !== '#winModal') $('#backdrop').classList.add('open');
}
function closeModal(sel) {
  $(sel).classList.remove('open');
  if (!document.querySelector('.sheet.open, #confirmModal.open')) $('#backdrop').classList.remove('open');
}
function closeAll() {
  $('#menu').classList.remove('open');
  $('#confirmModal').classList.remove('open');
  $('#backdrop').classList.remove('open');
}

function openMenu() {
  if (busy) return;
  renderStats();
  syncSettingsUi();
  $('#menu').classList.add('open');
  $('#backdrop').classList.add('open');
}

function renderStats() {
  const pct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const rows = [
    ['Spil', stats.played], ['Vundet', stats.won], ['Vinder-%', pct + '%'],
    ['Bedste tid', stats.bestTime ? fmtTime(stats.bestTime) : '–'], ['Rekord', stats.bestScore || '–'],
    ['Bedste stime', stats.bestStreak],
  ];
  $('#statsGrid').innerHTML = rows.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
}

function syncSettingsUi() {
  document.querySelectorAll('#drawSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.draw === settings.drawCount));
  $('#optSound').checked = settings.sound;
  $('#optAuto').checked = settings.autoFound;
  $('#optLeft').checked = settings.leftHand;
  document.querySelectorAll('#tableSw button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.table));
  document.querySelectorAll('#backSw button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.back));
  $('#seedNo').textContent = state.seed;
}

function applyTheme() {
  const t = TABLES[settings.table] || TABLES.green;
  const b = BACKS[settings.back] || BACKS.red;
  const s = document.documentElement.style;
  s.setProperty('--felt1', t.c[0]);
  s.setProperty('--felt2', t.c[1]);
  s.setProperty('--back1', b.c[0]);
  s.setProperty('--back2', b.c[1]);
  s.setProperty('--backline', b.line);
  s.setProperty('--backrim', b.rim);
  document.querySelector('meta[name=theme-color]').content = t.c[1];
  Sound.enabled = settings.sound;
}

function buildMenu() {
  $('#tableSw').innerHTML = Object.entries(TABLES)
    .map(([k, v]) => `<button data-v="${k}" aria-label="${v.name}" style="background:radial-gradient(circle at 40% 35%,${v.c[0]},${v.c[1]})"></button>`)
    .join('');
  $('#backSw').innerHTML = Object.entries(BACKS)
    .map(([k, v]) => `<button data-v="${k}" class="mini-back" style="--back1:${v.c[0]};--back2:${v.c[1]};--backline:${v.line};--backrim:${v.rim}"></button>`)
    .join('');

  $('#drawSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.drawCount = +b.dataset.draw;
    syncSettingsUi();
    save();
    if (state.drawCount !== settings.drawCount) toast(`Træk ${settings.drawCount} gælder fra næste spil`);
  });
  $('#optSound').addEventListener('change', (e) => {
    settings.sound = e.target.checked;
    applyTheme();
    save();
  });
  $('#optAuto').addEventListener('change', (e) => {
    settings.autoFound = e.target.checked;
    save();
    scheduleAuto();
  });
  $('#optLeft').addEventListener('change', (e) => {
    settings.leftHand = e.target.checked;
    save();
    layout();
    render();
  });
  $('#tableSw').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.table = b.dataset.v;
    applyTheme();
    syncSettingsUi();
    save();
  });
  $('#backSw').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.back = b.dataset.v;
    applyTheme();
    syncSettingsUi();
    save();
  });
  $('#mNew').addEventListener('click', () => {
    closeAll();
    nextGame();
  });
  $('#mRestart').addEventListener('click', () => {
    closeAll();
    nextGame(state.seed);
  });
  $('#mReset').addEventListener('click', () => {
    Object.assign(stats, { played: 0, won: 0, streak: 0, bestStreak: 0, bestTime: 0, bestScore: 0 });
    save();
    renderStats();
    toast('Statistikken er nulstillet');
  });
}

function requestNewGame() {
  if (busy) return;
  if (state.started && !state.won && state.moves > 0) openModal('#confirmModal');
  else nextGame();
}

// Moving on from one game to the next is the natural break where an ad may show.
let advancing = false;
async function nextGame(seed) {
  if (advancing) return;
  advancing = true;
  try {
    if (state.started) await Ads.interstitial();
    newGame(seed);
  } finally {
    advancing = false;
  }
}

/* ---------- intro screen ---------- */

const introOpen = () => $('#intro').classList.contains('open');

function buildIntro() {
  // Four sevens around the ace of spades — a nod to the name.
  const fan = [['D', 7], ['C', 7], ['S', 1], ['H', 7], ['S', 7]];
  $('#introCards').innerHTML = fan
    .map(([s, r], i) => `<div class="icard ${cardClass(s, r)}" style="--i:${i - 2}">${faceHtml(s, r)}</div>`)
    .join('');

  $('#iDrawSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.drawCount = +b.dataset.draw;
    syncIntro();
    save();
  });
  $('#iContinue').addEventListener('click', () => closeIntro());
  $('#iNew').addEventListener('click', () => closeIntro(true));
  $('#iRules').addEventListener('click', () => {
    const open = $('#introRules').hidden;
    $('#introRules').hidden = !open;
    $('#iRules').textContent = open ? 'Skjul reglerne' : 'Sådan spiller du';
  });
}

function syncIntro() {
  const resumable = state.started && !state.won && state.moves > 0;
  $('#iContinue').hidden = !resumable;
  $('#iNew').className = resumable ? 'secondary wide' : 'primary wide';
  document.querySelectorAll('#iDrawSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.draw === settings.drawCount));
  $('#introStats').textContent = stats.played ? `Du har vundet ${stats.won} af ${stats.played} spil` : '';
}

function openIntro() {
  syncIntro();
  $('#intro').classList.add('open');
}

function closeIntro(fresh = false) {
  $('#intro').classList.remove('open');
  // The intro covers the launch, so no ad here — just deal.
  if (fresh) setTimeout(() => newGame(), 250);
  setTimeout(installHint, 900);
}

function installHint() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let seen = false;
  try {
    seen = !!localStorage.getItem('syvkabale.installHint');
  } catch {}
  if (!ios || standalone || seen) return;
  const el = $('#install');
  el.classList.add('show');
  el.querySelector('button').addEventListener('click', () => {
    el.classList.remove('show');
    try {
      localStorage.setItem('syvkabale.installHint', '1');
    } catch {}
  });
}

/* ---------- boot ---------- */

function init() {
  load();
  applyTheme();
  buildBoard();
  buildMenu();
  layout();

  board.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) document.addEventListener(ev, () => Sound.unlock(), { capture: true });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  $('#newBtn').addEventListener('click', requestNewGame);
  $('#undoBtn').addEventListener('click', undo);
  $('#hintBtn').addEventListener('click', hint);
  $('#menuBtn').addEventListener('click', openMenu);
  $('#autoBtn').addEventListener('click', autoComplete);
  $('#backdrop').addEventListener('click', closeAll);
  $('#menuClose').addEventListener('click', closeAll);
  $('#wNew').addEventListener('click', () => nextGame());
  $('#confirmModal').addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    closeAll();
    if (act === 'ok') nextGame();
  });

  window.addEventListener('keydown', (e) => {
    if (document.querySelector('.sheet.open, .modal.open, .intro.open, .ad-layer.open')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') return undo();
    if (e.key === 'h') hint();
    else if (e.key === 'n') requestNewGame();
    else if (e.key === ' ') doDraw();
    else if (e.key === 'a') autoComplete();
  });

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      layout();
      renderInstant();
    }, 60);
  });

  setInterval(() => {
    const paused = document.hidden || introOpen() || Ads.showing || document.querySelector('.sheet.open');
    if (state && state.started && !state.won && !paused) {
      state.elapsed++;
      $('#time').textContent = fmtTime(state.elapsed);
    }
  }, 1000);
  document.addEventListener('visibilitychange', () => document.hidden && save());
  window.addEventListener('pagehide', save);

  // Lay out the saved game (or a fresh, untouched deal) behind the intro screen.
  if (!state) state = G.deal(randomSeed(), settings.drawCount);
  renderInstant();
  $('#seedNo').textContent = state.seed;
  buildIntro();
  openIntro();

  if ('serviceWorker' in navigator && !/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Debugging hook for the browser console.
  window.__syv = {
    get state() { return state; },
    set state(s) { state = s; history = []; render(); updateHud(); },
    G,
  };
}

init();
