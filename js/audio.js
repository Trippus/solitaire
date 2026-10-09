// All sounds are synthesized with Web Audio — no audio files to download.
let ctx = null;
let master = null;
let noise = null;

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

export const Sound = {
  enabled: true,

  // iOS only allows audio to start from inside a user gesture.
  unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.8;
        master.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 0.4);
        noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch {
      /* no audio — the game works fine without it */
    }
  },

  play(name, opt = {}) {
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + (opt.delay || 0);
    const vol = opt.vol ?? 1;
    switch (name) {
      case 'flip':
        burst(t, 3200, 0.9, 0.05, 0.35 * vol);
        break;
      case 'place':
        burst(t, 900, 0.7, 0.07, 0.45 * vol);
        tone(t, 150, 0.08, 0.2 * vol, 'sine', 90);
        break;
      case 'shuffle':
        for (let i = 0; i < 9; i++) burst(t + i * 0.03, 2400 + Math.random() * 1600, 1, 0.04, 0.22 * vol);
        break;
      case 'found': {
        const f = 392 * 2 ** (PENTATONIC[(opt.rank || 1) - 1] / 12);
        burst(t, 1400, 0.8, 0.05, 0.25 * vol);
        tone(t, f, 0.4, 0.14 * vol, 'sine');
        tone(t, f * 2, 0.22, 0.04 * vol, 'sine');
        break;
      }
      case 'error':
        tone(t, 220, 0.14, 0.22 * vol, 'sine', 120);
        break;
      case 'win':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(t + i * 0.09, 523.25 * 2 ** (s / 12), 0.6, 0.12 * vol, 'triangle'));
        break;
    }
  },
};

function burst(t, freq, q, dur, gain) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.3, dur + 0.02);
}

function tone(t, freq, dur, gain, type, endFreq) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
