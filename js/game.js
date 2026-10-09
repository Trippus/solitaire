// Pure game rules for Syvkabale (Klondike). No DOM in here.
// Piles are addressed by key: 'stock', 'waste', 'f0'..'f3' (foundations), 't0'..'t6' (tableau).

export const SUITS = ['S', 'H', 'D', 'C'];
export const isRed = (suit) => suit === 'H' || suit === 'D';
export const top = (p) => p[p.length - 1];

export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deal(seed, drawCount) {
  const rnd = mulberry32(seed);
  const cards = [];
  for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) cards.push({ id: suit + rank, suit, rank, up: false });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  // Deal row by row, left to right — like at a real table.
  const tableau = [[], [], [], [], [], [], []];
  let k = 0;
  for (let row = 0; row < 7; row++) for (let c = row; c < 7; c++) tableau[c].push(cards[k++]);
  tableau.forEach((p) => (top(p).up = true));
  return {
    seed, drawCount,
    stock: cards.slice(k), waste: [], foundations: [[], [], [], []], tableau,
    score: 0, moves: 0, elapsed: 0, passes: 0, started: false, won: false,
  };
}

export function pile(state, key) {
  if (key === 'stock') return state.stock;
  if (key === 'waste') return state.waste;
  if (key[0] === 'f') return state.foundations[+key[1]];
  return state.tableau[+key[1]];
}

export function canStack(card, onto) {
  if (!onto) return card.rank === 13;
  return onto.up && onto.rank === card.rank + 1 && isRed(onto.suit) !== isRed(card.suit);
}

export function canFound(card, f) {
  if (!f.length) return card.rank === 1;
  const t = top(f);
  return t.suit === card.suit && t.rank === card.rank - 1;
}

export function canMove(state, from, index, to) {
  if (from === to || to === 'stock' || to === 'waste') return false;
  const src = pile(state, from);
  const cards = src.slice(index);
  if (!cards.length || !cards[0].up) return false;
  if (from !== 'stock' && from[0] !== 't' && cards.length !== 1) return false;
  if (from === 'stock') return false;
  const dst = pile(state, to);
  if (to[0] === 'f') return cards.length === 1 && canFound(cards[0], dst);
  return canStack(cards[0], top(dst));
}

export function move(state, from, index, to) {
  const src = pile(state, from);
  const dst = pile(state, to);
  const cards = src.splice(index);
  dst.push(...cards);
  let pts = 0;
  if (to[0] === 'f' && from[0] !== 'f') pts += 10;
  if (from === 'waste' && to[0] === 't') pts += 5;
  if (from[0] === 'f' && to[0] === 't') pts -= 15;
  let flipped = null;
  if (from[0] === 't' && src.length && !top(src).up) {
    top(src).up = true;
    flipped = top(src);
    pts += 5;
  }
  state.score = Math.max(0, state.score + pts);
  state.moves++;
  return { cards, flipped };
}

export function draw(state) {
  if (state.stock.length) {
    const n = Math.min(state.drawCount, state.stock.length);
    for (let i = 0; i < n; i++) {
      const c = state.stock.pop();
      c.up = true;
      state.waste.push(c);
    }
    state.moves++;
    return 'draw';
  }
  if (state.waste.length) {
    state.stock = state.waste.reverse();
    state.stock.forEach((c) => (c.up = false));
    state.waste = [];
    state.passes++;
    if (state.drawCount === 1) state.score = Math.max(0, state.score - 100);
    state.moves++;
    return 'recycle';
  }
  return null;
}

// Where should a tapped card go? Foundation first, then a built-up column, then an empty one.
export function bestTarget(state, from, index) {
  const src = pile(state, from);
  if (index === src.length - 1 && from[0] !== 'f') {
    for (let f = 0; f < 4; f++) if (canMove(state, from, index, 'f' + f)) return 'f' + f;
  }
  let empty = null;
  for (let t = 0; t < 7; t++) {
    const key = 't' + t;
    if (!canMove(state, from, index, key)) continue;
    if (pile(state, key).length) return key;
    empty ??= key;
  }
  // Don't shuffle a king back and forth between empty columns.
  if (empty && !(from[0] === 't' && index === 0)) return empty;
  return null;
}

function faceUpSources(state) {
  const out = [];
  if (state.waste.length) out.push(['waste', state.waste.length - 1]);
  state.tableau.forEach((p, t) => {
    const first = p.findIndex((c) => c.up);
    if (first >= 0) for (let i = first; i < p.length; i++) out.push(['t' + t, i]);
  });
  return out;
}

export function findHint(state) {
  const sources = faceUpSources(state);
  // 1. Anything that can go to a foundation.
  for (const [from, index] of sources) {
    if (index !== pile(state, from).length - 1) continue;
    for (let f = 0; f < 4; f++) if (canMove(state, from, index, 'f' + f)) return { from, index, to: 'f' + f };
  }
  // 2. Move a whole face-up run to reveal a hidden card, or to free a column a king is waiting for.
  const kingWaiting =
    (state.waste.length && top(state.waste).rank === 13) ||
    state.tableau.some((p) => p.some((c, i) => c.up && c.rank === 13 && i > 0));
  for (const [from, index] of sources) {
    if (from[0] !== 't') continue;
    const p = pile(state, from);
    if (index !== p.findIndex((c) => c.up)) continue;
    if (index === 0 && !kingWaiting) continue;
    for (let t = 0; t < 7; t++) {
      const to = 't' + t;
      if (canMove(state, from, index, to) && !(index === 0 && !pile(state, to).length)) return { from, index, to };
    }
  }
  // 3. Play the waste card onto the tableau.
  if (state.waste.length) {
    const index = state.waste.length - 1;
    for (let t = 0; t < 7; t++) if (canMove(state, 'waste', index, 't' + t)) return { from: 'waste', index, to: 't' + t };
  }
  // 4. Turn the stock.
  if (state.stock.length || state.waste.length) return { draw: true };
  return null;
}

// Moves that can never hurt: a card whose opposite-colour foundations are already close behind.
export function safeAutoMove(state, excludeId) {
  const level = { S: 0, H: 0, D: 0, C: 0 };
  state.foundations.forEach((f) => f.length && (level[f[0].suit] = f.length));
  const cands = [];
  if (state.waste.length) cands.push(['waste', state.waste.length - 1]);
  state.tableau.forEach((p, t) => p.length && top(p).up && cands.push(['t' + t, p.length - 1]));
  for (const [from, index] of cands) {
    const c = pile(state, from)[index];
    if (c.id === excludeId) continue;
    const opp = isRed(c.suit) ? Math.min(level.S, level.C) : Math.min(level.H, level.D);
    if (c.rank > 2 && c.rank > opp + 1) continue;
    for (let f = 0; f < 4; f++) if (canMove(state, from, index, 'f' + f)) return { from, index, to: 'f' + f };
  }
  return null;
}

export const canAutoComplete = (state) =>
  !state.stock.length && !state.waste.length && state.tableau.every((p) => p.every((c) => c.up)) && !isWon(state);

export function autoCompleteStep(state) {
  let best = null;
  state.tableau.forEach((p, t) => {
    if (!p.length) return;
    const c = top(p);
    for (let f = 0; f < 4; f++) {
      if (canFound(c, state.foundations[f]) && (!best || c.rank < best.rank)) best = { from: 't' + t, index: p.length - 1, to: 'f' + f, rank: c.rank };
    }
  });
  return best;
}

export const isWon = (state) => state.foundations.every((f) => f.length === 13);
