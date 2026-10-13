// Rules engine for Klondike (js/game.js).
// Run: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../js/game.js';

const card = (suit, rank, up = true) => ({ id: suit + rank, suit, rank, up });
// A hand-made table. Unlisted piles are empty.
function table({ tableau = [], waste = [], stock = [], foundations = [], drawCount = 1, score = 0 } = {}) {
  const t = [[], [], [], [], [], [], []];
  tableau.forEach((p, i) => (t[i] = p));
  const f = [[], [], [], []];
  foundations.forEach((p, i) => (f[i] = p));
  return { seed: 1, drawCount, stock, waste, foundations: f, tableau: t, score, moves: 0, elapsed: 0, passes: 0, started: true, won: false };
}
const run = (suit, from, to) => Array.from({ length: to - from + 1 }, (_, k) => card(suit, from + k));
const allCards = (s) => [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flat()];

describe('deal', () => {
  test('52 different cards: 28 on the table (7 face up), 24 in the stock', () => {
    const s = G.deal(123, 1);
    const ids = allCards(s).map((c) => c.id);
    assert.equal(new Set(ids).size, 52);
    assert.deepEqual(s.tableau.map((p) => p.length), [1, 2, 3, 4, 5, 6, 7]);
    for (const p of s.tableau) {
      assert.ok(G.top(p).up, 'top card is face up');
      assert.ok(p.slice(0, -1).every((c) => !c.up), 'the rest are face down');
    }
    assert.equal(s.stock.length, 24);
    assert.ok(s.stock.every((c) => !c.up));
  });

  test('the same game number always gives the same deal', () => {
    assert.deepEqual(G.deal(52611, 1), G.deal(52611, 1));
    assert.notDeepEqual(G.deal(1, 1).tableau, G.deal(2, 1).tableau);
  });
});

describe('what may go where', () => {
  test('tableau: one lower, opposite colour; only a king on an empty column', () => {
    assert.ok(G.canStack(card('H', 6), card('S', 7)));
    assert.ok(!G.canStack(card('D', 6), card('H', 7)), 'same colour');
    assert.ok(!G.canStack(card('H', 5), card('S', 7)), 'not one lower');
    assert.ok(!G.canStack(card('H', 6), card('S', 7, false)), 'onto a face-down card');
    assert.ok(G.canStack(card('C', 13), undefined));
    assert.ok(!G.canStack(card('C', 12), undefined));
  });

  test('foundation: ace first, then same suit one higher', () => {
    assert.ok(G.canFound(card('H', 1), []));
    assert.ok(!G.canFound(card('H', 2), []));
    assert.ok(G.canFound(card('H', 2), [card('H', 1)]));
    assert.ok(!G.canFound(card('D', 2), [card('H', 1)]));
  });

  test('never onto stock or waste, and only single cards from the waste', () => {
    const s = table({ tableau: [[card('S', 7)]], waste: [card('H', 6)] });
    assert.ok(G.canMove(s, 'waste', 0, 't0'));
    assert.ok(!G.canMove(s, 't0', 0, 'waste'));
    assert.ok(!G.canMove(s, 't0', 0, 'stock'));
    assert.ok(!G.canMove(s, 't0', 0, 't0'));
  });

  test('a face-up run can move together; a face-down card cannot', () => {
    const s = table({ tableau: [[card('C', 9, false), card('H', 8), card('S', 7)], [card('S', 9)]] });
    assert.ok(G.canMove(s, 't0', 1, 't1'));
    assert.ok(!G.canMove(s, 't0', 0, 't1'));
  });
});

describe('moves and score', () => {
  test('moving off a face-down card turns it over (+5)', () => {
    const s = table({ tableau: [[card('C', 4, false), card('H', 8)], [card('S', 9)]] });
    const res = G.move(s, 't0', 1, 't1');
    assert.equal(res.flipped.id, 'C4');
    assert.ok(s.tableau[0][0].up);
    assert.equal(s.score, 5);
    assert.equal(s.moves, 1);
  });

  test('to a foundation +10, waste to table +5, back from a foundation -15 (never below 0)', () => {
    const s = table({ waste: [card('H', 1)], tableau: [[card('S', 2)]] });
    G.move(s, 'waste', 0, 'f0');
    assert.equal(s.score, 10);
    const s2 = table({ waste: [card('H', 6)], tableau: [[card('S', 7)]] });
    G.move(s2, 'waste', 0, 't0');
    assert.equal(s2.score, 5);
    const s3 = table({ foundations: [run('H', 1, 6)], tableau: [[card('S', 7)]], score: 4 });
    G.move(s3, 'f0', 5, 't0');
    assert.equal(s3.score, 0);
  });
});

describe('stock', () => {
  test('draw 1 turns one card, draw 3 turns three', () => {
    const s1 = G.deal(9, 1);
    assert.equal(G.draw(s1), 'draw');
    assert.equal(s1.waste.length, 1);
    assert.ok(s1.waste[0].up);
    const s3 = G.deal(9, 3);
    G.draw(s3);
    assert.equal(s3.waste.length, 3);
    assert.equal(s3.stock.length, 21);
  });

  test('an empty stock is refilled from the waste in the same order; draw 1 costs 100 points', () => {
    const s = table({ stock: [], waste: [card('H', 3), card('S', 4), card('D', 5)], score: 150 });
    assert.equal(G.draw(s), 'recycle');
    assert.deepEqual(s.stock.map((c) => c.id), ['D5', 'S4', 'H3']);
    assert.ok(s.stock.every((c) => !c.up));
    assert.equal(s.passes, 1);
    assert.equal(s.score, 50);
    G.draw(s);
    assert.equal(s.waste[0].id, 'H3', 'the first card drawn comes back first');
  });

  test('nothing happens when stock and waste are both empty', () => {
    assert.equal(G.draw(table()), null);
  });
});

describe('helpers', () => {
  test('a tapped ace goes to a foundation', () => {
    const s = table({ tableau: [[card('S', 1)]] });
    assert.match(G.bestTarget(s, 't0', 0), /^f/);
  });

  test('a king alone in a column is not moved to another empty column', () => {
    const s = table({ tableau: [[card('S', 13)]] });
    assert.equal(G.bestTarget(s, 't0', 0), null);
  });

  test('a hint exists on a fresh deal, and suggests drawing when nothing else works', () => {
    assert.ok(G.findHint(G.deal(1, 1)));
    const s = table({ tableau: [[card('S', 13)]], stock: [card('H', 9, false)] });
    assert.deepEqual(G.findHint(s), { draw: true });
    assert.equal(G.findHint(table({ tableau: [[card('S', 13)]] })), null);
  });

  test('a safe auto-move puts an ace up', () => {
    const s = table({ waste: [card('D', 1)] });
    assert.deepEqual(G.safeAutoMove(s), { from: 'waste', index: 0, to: 'f0' });
  });

  test('auto-complete finishes a fully revealed game', () => {
    const s = table({ tableau: [run('S', 1, 13).reverse(), run('H', 1, 13).reverse(), run('C', 1, 13).reverse(), run('D', 1, 13).reverse()] });
    assert.ok(G.canAutoComplete(s));
    let m;
    let steps = 0;
    while ((m = G.autoCompleteStep(s)) && steps++ < 60) G.move(s, m.from, m.index, m.to);
    assert.ok(G.isWon(s));
    assert.ok(!G.canAutoComplete(s));
  });
});

describe('invariants over many games', () => {
  test('following hints only ever makes legal moves and never loses a card', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = G.deal(seed, seed % 2 ? 1 : 3);
      let draws = 0;
      for (let i = 0; i < 400; i++) {
        const h = G.findHint(s);
        if (!h || draws > 60) break;
        if (h.draw) {
          draws++;
          G.draw(s);
        } else {
          draws = 0;
          assert.ok(G.canMove(s, h.from, h.index, h.to), `game ${seed}: hint ${JSON.stringify(h)} is legal`);
          G.move(s, h.from, h.index, h.to);
        }
        const ids = allCards(s).map((c) => c.id);
        assert.equal(new Set(ids).size, 52, `game ${seed}: still 52 cards`);
      }
    }
  });
});
