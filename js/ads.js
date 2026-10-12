// Ad layer. The rest of the game only talks to `Ads`, so going live later means
// replacing the placeholders below with AdMob (via Capacitor) — nothing else changes.
//
// Policy we follow (kind to players, and what AdMob recommends for games):
//  - full-screen ad (interstitial) only at a natural break: between two games
//  - never at app launch and never in the middle of a game
//  - at most one full-screen ad every 3 minutes; the first one at the earliest 3 minutes after launch
//  - a small banner at the bottom of the screen while the victory screen is showing

const CONFIG = {
  mode: 'off', // 'off' | 'placeholder' | 'admob'
  minGapMs: 3 * 60 * 1000,
  closeAfterSec: 5,
};

// Add ?reklame=demo to the address to preview the placeholders without waiting.
if (new URLSearchParams(location.search).get('reklame') === 'demo') {
  CONFIG.mode = 'placeholder';
  CONFIG.minGapMs = 0;
}

let lastShown = CONFIG.minGapMs ? Date.now() : 0; // counts as "just shown" so the first minutes are ad-free

export const Ads = {
  get showing() {
    return document.getElementById('adInterstitial')?.classList.contains('open') ?? false;
  },

  // Call between two games. Resolves once the ad is closed (or straight away if none is due).
  async interstitial() {
    if (CONFIG.mode === 'off' || this.showing) return;
    if (Date.now() - lastShown < CONFIG.minGapMs) return;
    lastShown = Date.now();
    if (CONFIG.mode === 'placeholder') await showPlaceholder();
  },

  // Bottom banner, shown while the victory screen is up.
  showBanner() {
    if (CONFIG.mode === 'off') return;
    if (CONFIG.mode === 'placeholder') document.body.classList.add('ad-banner-on');
  },

  hideBanner() {
    document.body.classList.remove('ad-banner-on');
  },
};

function showPlaceholder() {
  const layer = document.getElementById('adInterstitial');
  const close = layer.querySelector('.ad-close');
  const count = layer.querySelector('.ad-count');
  let left = CONFIG.closeAfterSec;
  count.textContent = left;
  close.disabled = true;
  layer.classList.add('open');
  return new Promise((resolve) => {
    const tick = setInterval(() => {
      left--;
      count.textContent = left > 0 ? left : '✕';
      if (left <= 0) {
        clearInterval(tick);
        close.disabled = false;
      }
    }, 1000);
    close.onclick = () => {
      layer.classList.remove('open');
      close.onclick = null;
      resolve();
    };
  });
}
