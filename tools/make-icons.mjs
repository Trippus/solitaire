// Renders the app icon (two fanned cards on green felt) to PNG without any dependencies.
// Usage: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../icons/', import.meta.url));

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function sdRoundRect(px, py, hw, hh, r) {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
const local = (u, v, c) => {
  const dx = u - c.x;
  const dy = v - c.y;
  const ca = Math.cos(-c.a);
  const sa = Math.sin(-c.a);
  return [dx * ca - dy * sa, dx * sa + dy * ca];
};
// Heart curve: (x²+y²-1)³ - x²y³ ≤ 0 (y up). Flip y to get a spade's body.
const heart = (x, y) => (x * x + y * y - 1) ** 3 - x * x * y * y * y <= 0;
function spade(x, y, s) {
  const X = x / s;
  const Y = y / s + 0.32;
  if (heart(X * 1.05, Y)) return true;
  if (Y > 0.55 && Y < 1.75) {
    const t = (Y - 0.55) / 1.2;
    return Math.abs(X) < 0.07 + 0.42 * t * t;
  }
  return false;
}

const FELT_IN = hex('#35a26c');
const FELT_OUT = hex('#0a3420');
const BACK_IN = hex('#e5525f');
const BACK_OUT = hex('#8d1323');
const WHITE = hex('#ffffff');
const CREAM = hex('#ece6d8');
const INK = hex('#1d2129');
const RED = hex('#d22c3c');

const back = { x: 0.4, y: 0.53, a: -0.26 };
const front = { x: 0.6, y: 0.5, a: 0.16 };
const HW = 0.2;
const HH = 0.28;
const R = 0.035;

// Returns [r, g, b, alpha]. `scale` shrinks the cards toward the centre (for maskable /
// adaptive icons that get cropped); `felt: false` leaves the background transparent.
function shade(u0, v0, { scale = 1, felt = true, cards = true } = {}) {
  let col = felt ? mix(FELT_IN, FELT_OUT, smooth(0, 0.8, Math.hypot(u0 - 0.5, v0 - 0.35))) : [0, 0, 0];
  let alpha = felt ? 1 : 0;
  if (!cards) return [...col, alpha];
  const u = 0.5 + (u0 - 0.5) / scale;
  const v = 0.5 + (v0 - 0.5) / scale;
  for (const card of [back, front]) {
    // soft drop shadow, composited "over" whatever is below
    const [sx, sy] = local(u - 0.012, v - 0.028, card);
    const sd = sdRoundRect(sx, sy, HW, HH, R);
    const s = 0.4 * (1 - smooth(-0.01, 0.05, sd));
    const outA = s + alpha * (1 - s);
    if (outA > 0) col = col.map((c) => (c * alpha * (1 - s)) / outA);
    alpha = outA;
    const [x, y] = local(u, v, card);
    const d = sdRoundRect(x, y, HW, HH, R);
    if (d > 0) continue;
    alpha = 1;
    if (card === back) {
      col = mix(BACK_IN, BACK_OUT, smooth(0, 0.35, Math.hypot(x + 0.06, y + 0.1)));
      const inner = sdRoundRect(x, y, HW - 0.028, HH - 0.028, R * 0.6);
      if (Math.abs(inner) < 0.006) col = WHITE;
      else if (inner < 0) {
        const k = 38;
        const a = (((x + y) * k) % 1 + 1) % 1;
        const b = (((x - y) * k) % 1 + 1) % 1;
        if (a < 0.22 || b < 0.22) col = mix(col, WHITE, 0.25);
      }
    } else {
      col = mix(WHITE, CREAM, smooth(-0.3, 0.3, x + y));
      if (d > -0.004) col = mix(col, [150, 150, 150], 0.5);
      if (spade(x, y - 0.02, 0.105)) col = INK;
      // little red heart pip in the corner
      if (heart((x + 0.125) / 0.036, -(y + 0.19) / 0.036)) col = RED;
    }
  }
  return [...col, alpha];
}

function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // average premultiplied samples so transparent edges stay clean
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, opts);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const i = (py * size + px) * 4;
      buf[i] = a ? Math.round(r / a) : 0;
      buf[i + 1] = a ? Math.round(g / a) : 0;
      buf[i + 2] = a ? Math.round(b / a) : 0;
      buf[i + 3] = Math.round((a / SS / SS) * 255);
    }
  }
  return png(size, size, buf);
}

const resDir = fileURLToPath(new URL('../resources/', import.meta.url));
const outputs = [
  // web app (PWA)
  [outDir, 'icon-180.png', 180, {}],
  [outDir, 'icon-192.png', 192, {}],
  [outDir, 'icon-512.png', 512, {}],
  [outDir, 'icon-maskable-512.png', 512, { scale: 0.72 }],
  // Android app (Capacitor's icon generator reads these). The adaptive-icon
  // foreground must keep its content inside the middle ~60%.
  [resDir, 'icon-only.png', 1024, {}],
  [resDir, 'icon-foreground.png', 1024, { scale: 0.6, felt: false }],
  [resDir, 'icon-background.png', 1024, { cards: false }],
];
mkdirSync(outDir, { recursive: true });
mkdirSync(resDir, { recursive: true });
for (const [dir, name, size, opts] of outputs) {
  writeFileSync(dir + name, render(size, opts));
  console.log(name);
}
