// Regression tests for reported bugs in the rules (js/game.js). One test per bug, named
// after its report in bugs/: test('BUG-001: …', …). See bugs/README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../js/game.js';

// Example of the shape (not a real bug):
// test('BUG-001: recycling the stock in Draw 3 keeps the card order', () => {
//   const s = G.deal(42, 3);
//   while (s.stock.length) G.draw(s);
//   const order = s.waste.map((c) => c.id);
//   G.draw(s);
//   assert.deepEqual(s.stock.map((c) => c.id), order.reverse());
// });

test('regression suite loads', () => assert.equal(G.SUITS.length, 4));
