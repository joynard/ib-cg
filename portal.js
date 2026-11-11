/**
 * IB Game Hub - Portal Engine & Game Registry
 * Untuk menambah game baru, cukup tambahkan object ke array `GAMES_DATA`.
 */

const GAMES_DATA = [
  {
    id: 'anonymous-box',
    title: 'Anonymous Box',
    icon: '📦',
    featured: true,
    tags: ['👥 2-12 Pemain', '⏱️ 10-15 Mnt', '🔒 P2P Anonim'],
    url: 'anonymous-box.html',
    btnLabel: 'Mainkan Game'
  }
];

function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

class GamePortal {
  constructor() {
    this.games = GAMES_DATA;
    this.gridElement = document.getElementById('gamesGrid');
    this.init();
  }

  init() {
    this.render();
  }

  render() {
    if (!this.gridElement) return;

    this.gridElement.innerHTML = '';

    this.games.forEach(game => {
      const card = document.createElement('article');
      card.className = `game-card ${game.featured ? 'featured' : ''}`;

      const tagsHtml = (game.tags || []).map(tag => `<span class="meta-tag">${escapeHTML(tag)}</span>`).join('');

      card.innerHTML = `
        <div class="card-top">
          <div class="card-icon">${escapeHTML(game.icon || '🎮')}</div>
        </div>

        <div class="card-content">
          <h2 class="game-title">${escapeHTML(game.title)}</h2>
          <div class="game-meta-tags">${tagsHtml}</div>
        </div>

        <div class="card-actions">
          <a href="${encodeURI(game.url)}" class="btn-play">${escapeHTML(game.btnLabel || 'Mainkan')} ➔</a>
        </div>
      `;

      this.gridElement.appendChild(card);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new GamePortal();
});
