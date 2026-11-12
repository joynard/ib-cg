/**
 * IB Game Hub - Portal Engine & Game Registry
 */

const GAMES_DATA = [
  {
    id: 'anonymous-box',
    title: 'Anonymous Box',
    description: 'Tulis cerita atau rahasia kecilmu secara anonim ke dalam Box. Tebak siapa penulisnya dan rasakan momen seru bersama teman CG-mu.',
    url: 'anonymous-box.html',
    btnLabel: 'Mainkan Game'
  },
  {
    id: 'sabotase-kata',
    title: 'Sabotase Kata',
    description: 'Semua peserta mendapatkan satu kata rahasia yang sama kecuali satu orang Impostor. Sebutkan satu kata petunjuk bergiliran di dunia nyata, cari siapa yang mencurigakan, dan lakukan voting!',
    url: 'sabotase-kata.html',
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
      card.className = 'game-card';

      card.innerHTML = `
        <div class="card-content">
          <h2 class="game-title">${escapeHTML(game.title)}</h2>
          <p class="game-description">${escapeHTML(game.description)}</p>
        </div>

        <div class="card-actions">
          <a href="${encodeURI(game.url)}" class="btn-play">${escapeHTML(game.btnLabel || 'Mainkan Game')} ➔</a>
        </div>
      `;

      this.gridElement.appendChild(card);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new GamePortal();
});
