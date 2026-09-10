/* Scoreboard — everything saved on this device */
'use strict';
(() => {
  const { GAMES, Stats, store, fmt, dailyGame, dayKey, Leaderboard } = window.BrickArcade;
  const stats = Stats.read();
  const streak = Stats.streak();
  const plays = Object.values(stats.played).reduce((a, b) => a + b, 0);

  document.querySelector('[data-streak]').textContent = streak;
  document.querySelector('[data-plays]').textContent = fmt(plays);
  document.querySelector('[data-days]').textContent = Object.keys(stats.days).length;

  const g = dailyGame();
  const dailyBest = Number(store.get(`brick.daily.${g.id}.${dayKey()}`)) || 0;
  document.querySelector('[data-daily-name]').textContent = g.name.toUpperCase();
  document.querySelector('[data-daily-best]').textContent = dailyBest ? fmt(dailyBest) : '—';
  document.querySelector('[data-daily-link]').href = `/${g.id}?mode=daily`;

  const rows = GAMES.map((game) => {
    const best = Number(store.get('brick.hi.' + game.id)) || 0;
    const n = stats.played[game.id] || 0;
    const avg = n ? Math.round((stats.total[game.id] || 0) / n) : 0;
    return `<tr>
      <td><a href="/${game.id}" style="--c:${game.color}"><i class="dot"></i>${game.name.toUpperCase()}</a></td>
      <td class="num">${best ? fmt(best) : '—'}</td>
      <td class="num">${n || '—'}</td>
      <td class="num">${avg ? fmt(avg) : '—'}</td>
      <td class="num">${stats.last[game.id] || '—'}</td>
    </tr>`;
  }).join('');
  document.querySelector('[data-rows]').innerHTML = rows;

  /* ---------- World leaderboard ---------- */
  const nameEl = document.querySelector('[data-name]');
  const showName = () => { nameEl.textContent = Leaderboard.name() || 'NOBODY YET'; };
  showName();
  document.querySelector('[data-set-name]')?.addEventListener('click', () => { Leaderboard.askName(); showName(); loadWorld(); });

  let current = dailyGame().id, mode = 'alltime';
  const tabs = document.querySelector('[data-game-tabs]');
  tabs.innerHTML = GAMES.map((g) => `<button type="button" class="tab" data-game="${g.id}" style="--c:${g.color}">${g.name.toUpperCase()}</button>`).join('');
  const syncTabs = () => {
    tabs.querySelectorAll('[data-game]').forEach((b) => b.classList.toggle('is-on', b.dataset.game === current));
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === mode));
  };
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-game]'); if (b) { current = b.dataset.game; syncTabs(); loadWorld(); } });
  document.querySelector('.tabs--mode').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) { mode = b.dataset.mode; syncTabs(); loadWorld(); } });

  const worldRows = document.querySelector('[data-world-rows]');
  const worldRank = document.querySelector('[data-world-rank]');
  async function loadWorld() {
    syncTabs();
    worldRows.innerHTML = '<tr><td colspan="3" class="muted">Loading…</td></tr>';
    worldRank.textContent = '';
    try {
      const r = await Leaderboard.fetch(current, { day: dayKey(), limit: 25 });
      const list = r[mode];
      worldRows.innerHTML = list.length
        ? list.map((e) => `<tr class="${e.you ? 'is-you' : ''}"><td>${e.rank}</td><td>${e.name}${e.you ? ' (YOU)' : ''}</td><td class="num">${fmt(e.score)}</td></tr>`).join('')
        : `<tr><td colspan="3" class="muted">No scores ${mode === 'daily' ? 'today' : 'yet'}. Play a round and be the first.</td></tr>`;
      const rk = r.rank && r.rank[mode];
      const total = r.counts[mode];
      worldRank.textContent = rk ? `You are #${fmt(rk)} of ${fmt(total)} ${mode === 'daily' ? 'today' : 'all time'}.` : (Leaderboard.name() ? `Not on this board yet. ${fmt(total)} players so far.` : 'Pick a name above and your next score joins the board.');
    } catch (_) {
      worldRows.innerHTML = '<tr><td colspan="3" class="muted">The world board is unavailable right now.</td></tr>';
    }
  }
  loadWorld();

  document.querySelector('[data-reset]')?.addEventListener('click', () => {
    if (!confirm('Reset every score and stat saved on this device?')) return;
    Object.keys(localStorage).filter((k) => k.startsWith('brick.hi.') || k.startsWith('brick.daily.') || k === 'brick.stats').forEach((k) => localStorage.removeItem(k));
    location.reload();
  });
})();
