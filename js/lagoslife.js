/* Retro Classic Games — Lagos Life host adapter (Vatar Games SDK, https://lagoslife.app/developers/docs).
   Does nothing on the open web. The whole arcade is one Lagos Life listing: inside the Vatar game player
   this loads the SDK on every page, signs the player in, passes on pause/resume, sends daily challenge
   scores to the Lagos Life board and handles the premium colour pack. */
'use strict';
(() => {
  let framed = true;
  try { framed = window.self !== window.top; } catch (_) { /* cross-origin parent: framed */ }
  if (!framed) return;

  const SDK = 'https://lagoslife.app/sdk/vatar-games-v1.js';
  const SCORE_GAP = 20500; // the SDK keeps one score per 20 s per player
  const root = document.documentElement;
  root.classList.add('in-host');

  const listeners = { pause: [], resume: [], owned: [] };
  const emit = (k, v) => listeners[k].forEach((fn) => { try { fn(v); } catch (_) { /* keep going */ } });
  const purchaseId = (p) => p && (p.purchaseId || p.id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let V = null;

  // The docs load the SDK with a script tag; here it is only fetched when the page is framed.
  const loadSdk = () => new Promise((resolve, reject) => {
    if (window.Vatar) { resolve(window.Vatar); return; }
    const s = document.createElement('script');
    s.src = SDK;
    s.async = true;
    s.onload = () => (window.Vatar ? resolve(window.Vatar) : reject(new Error('no sdk')));
    s.onerror = () => reject(new Error('sdk failed'));
    document.head.appendChild(s);
  });

  // Every page load signs in again (10 per minute), so fast game switching can hit the limit.
  async function init() {
    for (let tries = 0; ; tries++) {
      try { return await V.init(); } catch (e) {
        if (!e || e.code !== 'rate_limited' || tries >= 3) throw e;
        await sleep(6000);
      }
    }
  }

  const LL = {
    active: true, // optimistic until init answers, so the page never offers links out of the frame
    player: null,
    mode: null,
    pack: 'console_pack',
    owned: new Set(),
    on(k, fn) { listeners[k].push(fn); },
    ready: null,
    refresh,
    submitScore,
    leaderboard,
    buy,
  };

  LL.ready = loadSdk()
    .then((sdk) => { V = sdk; return init(); })
    .then(({ player, mode }) => {
      LL.player = player;
      LL.mode = mode;
      V.onPause(() => emit('pause'));
      V.onResume(() => emit('resume'));
      V.onPurchase((p) => sync([purchaseId(p)]).catch(() => {})); // paid while the game was away
      return LL;
    })
    .catch(() => {
      // not_framed or no SDK: behave like the normal website
      LL.active = false;
      root.classList.remove('in-host');
      return null;
    });

  const need = async () => { if (!(await LL.ready)) throw Object.assign(new Error('not_framed'), { code: 'not_framed' }); };

  /* Our server checks each purchase with Vatar, grants it and marks it delivered,
     then answers with everything this player owns. Items are never granted on the game's word. */
  async function sync(ids = []) {
    const { session } = await V.session();
    const r = await fetch('/api/vatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: LL.mode, session, purchaseIds: ids.filter(Boolean) }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const { owned } = await r.json();
    LL.owned = new Set(owned || []);
    emit('owned', LL.owned);
    return LL.owned;
  }

  /* What the player owns, claiming any paid but undelivered purchases on the way. */
  async function refresh() {
    await need();
    const list = await V.purchases().catch(() => []);
    return sync((list || []).map(purchaseId));
  }

  async function buy(productId = LL.pack) {
    await need();
    try {
      const p = await V.purchase(productId);
      await sync([purchaseId(p)]);
    } catch (e) {
      if (e && e.code === 'owned') await sync();
      else throw e;
    }
    return LL.owned.has(productId);
  }

  /* One score per 20 s counts, so a quick second game waits and sends the higher of the two. */
  let pending = 0, sentAt = 0, queued = null;
  async function submitScore(n) {
    await need();
    pending = Math.max(pending, Math.floor(n));
    if (queued) return queued;
    const wait = Math.max(0, sentAt + SCORE_GAP - Date.now());
    queued = sleep(wait).then(() => {
      const s = pending;
      pending = 0;
      queued = null;
      sentAt = Date.now();
      return V.submitScore(s).catch((e) => {
        if (e && (e.code === 'too_soon' || e.code === 'rate_limited')) return submitScore(s);
        throw e;
      });
    });
    return queued;
  }

  async function leaderboard() {
    await need();
    return V.leaderboard();
  }

  window.LagosLife = LL;
})();
