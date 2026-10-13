// End-to-end tests: the real game in headless Edge, driven through its buttons and cards.
// Run: npm run test:e2e
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, DOM } from './harness.mjs';
import * as G from '../../js/game.js';

// Game numbers picked by the rules engine, so every test has the situation it needs.
const seedWhere = (ok) => { for (let s = 1; s < 5000; s++) if (ok(G.deal(s, 1))) return s; throw new Error('no such deal'); };
const TAP_SEED = seedWhere((st) => { const h = G.findHint(st); return h && !h.draw && h.to[0] === 't' && !G.safeAutoMove(st); });
const DRAW_SEED = seedWhere((st) => !G.safeAutoMove(st) && G.draw(st) && !G.safeAutoMove(st));
const STUCK_SEED = seedWhere((st) => !G.safeAutoMove(st) && st.tableau.some((p, t) => !G.bestTarget(st, 't' + t, p.length - 1)));

let g;
before(async () => (g = await startGame()));
after(async () => g?.stop());
beforeEach(async () => g.fresh());
afterEach(() => assert.deepEqual(g.page.errors, [], 'no errors in the browser console'));

const run = (js) => g.page.eval(DOM + js);

test('intro shows on launch and "Nyt spil" deals 7 columns', async () => {
  const r = await run(`
    const introOpen = $('#intro').classList.contains('open');
    await deal();
    const faceUp = [...document.querySelectorAll('.card')].filter((el) => !el.classList.contains('down')).length;
    return { introOpen, introAfter: $('#intro').classList.contains('open'), cards: document.querySelectorAll('.card').length,
      columns: A.state.tableau.map((p) => p.length), faceUp, stock: A.state.stock.length };
  `);
  assert.equal(r.introOpen, true);
  assert.equal(r.introAfter, false);
  assert.equal(r.cards, 52);
  assert.deepEqual(r.columns, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(r.stock, 24);
  assert.ok(r.faceUp >= 7, 'the seven top cards are face up');
});

test('space turns a card from the stock, and undo puts it back', async () => {
  const r = await run(`
    await deal();
    A.state = G.deal(${DRAW_SEED}, 1); await wait(300);
    const stock = A.state.stock.length;
    key(' '); await wait(400);
    const afterDraw = { stock: A.state.stock.length, waste: A.state.waste.length, moves: $('#moves').textContent };
    $('#undoBtn').click(); await wait(300);
    return { stock, afterDraw, undone: { stock: A.state.stock.length, waste: A.state.waste.length } };
  `);
  assert.equal(r.afterDraw.stock, r.stock - 1);
  assert.equal(r.afterDraw.moves, '1');
  assert.deepEqual(r.undone, { stock: r.stock, waste: 0 });
});

test('"Træk 3 kort" turns three cards at a time', async () => {
  const r = await run(`
    $('#iDrawSeg [data-draw="3"]').click();
    await deal();
    const stock = A.state.stock.length;
    key(' '); await wait(400);
    return { drawCount: A.state.drawCount, taken: stock - A.state.stock.length };
  `);
  assert.equal(r.drawCount, 3);
  assert.equal(r.taken, 3);
});

test('tapping a card that can move sends it to a legal spot', async () => {
  const r = await run(`
    await deal();
    A.state = G.deal(${TAP_SEED}, 1); await wait(300);
    const h = G.findHint(A.state);
    const id = G.pile(A.state, h.from)[h.index].id;
    tapCard(id); await wait(500);
    return { id, from: h.from, now: where(id), moves: A.state.moves };
  `);
  assert.notEqual(r.now, r.from, `${r.id} moved away from ${r.from}`);
});

test('a card with nowhere to go shakes and stays put', async () => {
  const r = await run(`
    await deal();
    A.state = G.deal(${STUCK_SEED}, 1); await wait(300);
    const st = A.state;
    // a top card on the table with no legal destination
    const t = st.tableau.findIndex((p, t) => !G.bestTarget(st, 't' + t, p.length - 1));
    const id = G.top(st.tableau[t]).id;
    const moves = st.moves;
    tapCard(id); await wait(60);
    return { shook: cardEl(id).classList.contains('shake'), still: where(id) === 't' + t, moves: A.state.moves - moves };
  `);
  assert.equal(r.shook, true);
  assert.equal(r.still, true);
  assert.equal(r.moves, 0);
});

test('hint highlights a move', async () => {
  const r = await run(`
    await deal();
    $('#hintBtn').click(); await wait(100);
    return document.querySelectorAll('.hint').length;
  `);
  assert.ok(r >= 1);
});

test('"Nyt spil" mid-game asks first, and "Spil videre" keeps the game', async () => {
  const r = await run(`
    await deal();
    key(' '); await wait(300);
    const seed = A.state.seed;
    $('#newBtn').click(); await wait(200);
    const asked = $('#confirmModal').classList.contains('open');
    $('#confirmModal [data-act="cancel"]').click(); await wait(200);
    return { asked, same: A.state.seed === seed, closed: !$('#confirmModal').classList.contains('open') };
  `);
  assert.deepEqual(r, { asked: true, same: true, closed: true });
});

test('"Afslut automatisk" finishes a solved table and shows the win screen', async () => {
  const r = await run(`
    await deal();
    const st = G.deal(1, 1), A1 = ['S','H','C','D'], B1 = ['H','S','D','C'];
    st.tableau = [[],[],[],[],[],[],[]]; st.stock = []; st.waste = []; st.foundations = [[],[],[],[]];
    for (let c = 0; c < 4; c++) for (let r = 13; r >= 1; r--) { const s = r % 2 ? A1[c] : B1[c]; st.tableau[c].push({ id: s + r, suit: s, rank: r, up: true }); }
    st.started = true; st.elapsed = 248; st.moves = 131;
    A.state = st; await wait(300);
    const shown = $('#autoBtn').classList.contains('show');
    $('#autoBtn').click(); await wait(7500);
    const saved = JSON.parse(localStorage.getItem('syvkabale.v1'));
    return { shown, won: G.isWon(A.state), modal: $('#winModal').classList.contains('open'), wonStat: saved.stats.won };
  `);
  assert.equal(r.shown, true);
  assert.equal(r.won, true);
  assert.equal(r.modal, true);
  assert.equal(r.wonStat, 1);
});

test('a game in progress survives a reload and can be continued', async () => {
  const before = await run(`
    await deal();
    key(' '); await wait(400);
    return JSON.stringify(A.state.tableau) + A.state.stock.length;
  `);
  await g.reload();
  const r = await run(`
    const cont = !$('#iContinue').hidden;
    $('#iContinue').click(); await wait(300);
    return { cont, same: JSON.stringify(A.state.tableau) + A.state.stock.length };
  `);
  assert.equal(r.cont, true);
  assert.equal(r.same, before);
});

test('menu: settings stick after a reload', async () => {
  await run(`
    await deal();
    $('#menuBtn').click(); await wait(200);
    $('#optLeft').click();
    $('#tableSw [data-v="blue"]').click();
    $('#menuClose').click();
  `);
  await g.reload();
  const r = await run(`
    const saved = JSON.parse(localStorage.getItem('syvkabale.v1')).settings;
    return { left: saved.leftHand, table: saved.table, felt: getComputedStyle(document.documentElement).getPropertyValue('--felt2').trim() };
  `);
  assert.equal(r.left, true);
  assert.equal(r.table, 'blue');
  assert.equal(r.felt, '#0a2140');
});
