/* Scoreboard — everything saved on this device */
'use strict';
(() => {
  const { GAMES, Stats, store, fmt, dailyGame, dayKey } = window.BrickArcade;
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

  document.querySelector('[data-reset]')?.addEventListener('click', () => {
    if (!confirm('Reset every score and stat saved on this device?')) return;
    Object.keys(localStorage).filter((k) => k.startsWith('brick.hi.') || k.startsWith('brick.daily.') || k === 'brick.stats').forEach((k) => localStorage.removeItem(k));
    location.reload();
  });
})();
