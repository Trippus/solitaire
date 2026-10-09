// The victory lap: cards leap off the foundations and bounce across the table,
// leaving trails — a tribute to the classic desktop solitaire ending.
import { SUIT_PATHS, RANK_LABEL } from './suits.js';
import { isRed } from './game.js';

const INK = { red: '#d22c3c', black: '#1d2129' };
const pathCache = {};
const suitPaths = (s) => pathCache[s] || (pathCache[s] = SUIT_PATHS[s].map((d) => new Path2D(d)));

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) return ctx.roundRect(x, y, w, h, r);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSuit(ctx, suit, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  for (const p of suitPaths(suit)) ctx.fill(p);
  ctx.restore();
}

export function drawCard(ctx, card, w, h) {
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, w * 0.1);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#efebe1');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = isRed(card.suit) ? INK.red : INK.black;
  ctx.font = `800 ${w * 0.36}px ui-rounded, -apple-system, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(RANK_LABEL[card.rank], w * 0.08, h * 0.05);
  drawSuit(ctx, card.suit, w * 0.68, h * 0.06, w * 0.24);
  if (card.rank > 10) {
    ctx.font = `700 ${w * 0.6}px ui-serif, "New York", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(RANK_LABEL[card.rank], w / 2, h * 0.9);
  } else {
    const s = card.rank === 1 ? w * 0.68 : w * 0.58;
    drawSuit(ctx, card.suit, (w - s) / 2, h - s - h * 0.07, s);
  }
}

export function celebrate({ canvas, cards, cw, ch }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.classList.add('show');
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const sprites = cards.map((c) => {
    const oc = document.createElement('canvas');
    oc.width = Math.ceil(cw * dpr);
    oc.height = Math.ceil(ch * dpr);
    const o = oc.getContext('2d');
    o.scale(dpr, dpr);
    drawCard(o, c.card, cw, ch);
    return oc;
  });

  const s = cw / 50; // physics scale relative to an iPhone-sized card
  const gravity = 0.42 * s;
  const floor = H - ch - 2;
  const live = [];
  let next = 0;
  let sinceLaunch = 99;
  let raf = 0;
  let prev = performance.now();
  let acc = 0;
  let stopped = false;

  function launch() {
    const c = cards[next];
    if (c.el) c.el.style.visibility = 'hidden';
    live.push({
      x: c.x, y: c.y, sp: sprites[next],
      vx: (Math.random() * 3.5 + 1.6) * s * (Math.random() < 0.5 ? -1 : 1),
      vy: -(Math.random() * 6 + 1) * s,
    });
    next++;
    sinceLaunch = 0;
  }

  function step() {
    if (next < cards.length && live.length < 4 && sinceLaunch > 8) launch();
    sinceLaunch++;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += gravity;
      if (p.y > floor) {
        p.y = floor;
        p.vy = -p.vy * (0.6 + Math.random() * 0.15);
      }
      ctx.drawImage(p.sp, p.x, p.y, cw, ch);
      if (p.x < -cw || p.x > W) live.splice(i, 1);
    }
  }

  function frame(now) {
    if (stopped) return;
    acc += Math.min(100, now - prev);
    prev = now;
    while (acc >= 16.67) {
      step();
      acc -= 16.67;
    }
    if (next < cards.length || live.length) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      canvas.classList.remove('show');
      setTimeout(() => ctx.clearRect(0, 0, W, H), 500);
    },
  };
}
