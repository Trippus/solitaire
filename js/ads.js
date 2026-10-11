// Ad layer. The rest of the game only talks to `Ads`, so going live later means
// replacing the placeholder below with AdMob (via Capacitor) — nothing else changes.
//
// Policy we follow (kind to players, and what AdMob recommends for games):
//  - one full-screen ad (interstitial) at a natural break: between two games
//  - never at app launch and never in the middle of a game
//  - at most one ad every 3 minutes; the first one at the earliest 3 minutes after launch

const CONFIG = {
  mode: 'off', // 'off' | 'placeholder' | 'admob'
  minGapMs: 3 * 60 * 1000,
  closeAfterSec: 5,
};

let lastShown = Date.now(); // counts as "just shown" so the first minutes are ad-free

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
