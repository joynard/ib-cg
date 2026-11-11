/**
 * CG Game Hub - Portal Engine & Game Registry
 * Untuk menambah game baru, cukup tambahkan object baru ke array `GAMES_DATA` di bawah.
 */

const GAMES_DATA = [
  {
    id: 'anonymous-box',
    title: 'Anonymous Box',
    category: 'icebreaker',
    icon: '📦',
    status: 'ready', // 'ready' | 'coming_soon'
    statusLabel: 'Siap Main',
    featured: true,
    tags: ['👥 2-12 Pemain', '⏱️ 10-15 Mnt', '🔒 P2P Anonim'],
    description: 'Tulis cerita atau rahasia kecilmu secara anonim ke dalam Box. Tebak siapa penulisnya dan rasakan momen seru bersama teman CG-mu.',
    url: 'anonymous-box.html',
    btnLabel: 'Mainkan Game'
  },
  {
    id: 'two-truths-lie',
    title: 'Two Truths & A Lie',
    category: 'icebreaker',
    icon: '🎭',
    status: 'coming_soon',
    statusLabel: 'Segera Hadir',
    featured: false,
    tags: ['👥 3-10 Pemain', '⏱️ 10 Mnt', '🎯 Bluffing'],
    description: 'Kirimkan 2 fakta benar dan 1 fakta bohong tentang dirimu. Anggota lain harus menebak mana cerita yang cuma rekayasa.',
    url: '#',
    btnLabel: 'Dalam Pengembangan'
  },
  {
    id: 'deep-talk-roulette',
    title: 'Deep Talk Roulette',
    category: 'deeptalk',
    icon: '💬',
    status: 'coming_soon',
    statusLabel: 'Segera Hadir',
    featured: false,
    tags: ['👥 2-8 Pemain', '⏱️ 15-20 Mnt', '❤️ Heart-to-Heart'],
    description: 'Putar pertanyaan reflektif berjenjang: dari Icebreaker ringan, deeper moments, hingga pertanyaan iman dan kehidupan nyata.',
    url: '#',
    btnLabel: 'Dalam Pengembangan'
  },
  {
    id: 'who-said-it',
    title: 'Who Said It? (CG Quotes)',
    category: 'trivia',
    icon: '🗣️',
    status: 'coming_soon',
    statusLabel: 'Segera Hadir',
    featured: false,
    tags: ['👥 4-15 Pemain', '⏱️ 10 Mnt', '⚡ Tebak Cepat'],
    description: 'Kumpulan quotes atau kalimat ikonik yang pernah diucapkan anggota CG. Bisakah kalian menebak siapa orang di baliknya?',
    url: '#',
    btnLabel: 'Dalam Pengembangan'
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
    this.currentFilter = 'all';
    
    this.gridElement = document.getElementById('gamesGrid');
    this.filterButtons = document.querySelectorAll('.filter-btn');
    
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  bindEvents() {
    this.filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter || 'all';
        this.render();
      });
    });
  }

  render() {
    if (!this.gridElement) return;

    const filteredGames = this.currentFilter === 'all'
      ? this.games
      : this.games.filter(g => g.category === this.currentFilter);

    this.gridElement.innerHTML = '';

    filteredGames.forEach(game => {
      const card = document.createElement('article');
      card.className = `game-card ${game.featured ? 'featured' : ''}`;
      
      const isReady = game.status === 'ready';

      // Meta tags HTML
      const tagsHtml = game.tags.map(tag => `<span class="meta-tag">${escapeHTML(tag)}</span>`).join('');

      card.innerHTML = `
        <div class="card-top">
          <div class="card-icon">${escapeHTML(game.icon)}</div>
          <span class="status-pill ${isReady ? 'ready' : 'soon'}">${escapeHTML(game.statusLabel)}</span>
        </div>

        <div class="card-content">
          <h2 class="game-title">${escapeHTML(game.title)}</h2>
          <div class="game-meta-tags">${tagsHtml}</div>
          <p class="game-description">${escapeHTML(game.description)}</p>
        </div>

        <div class="card-actions">
          ${
            isReady 
              ? `<a href="${encodeURI(game.url)}" class="btn-play">${escapeHTML(game.btnLabel)} ➔</a>` 
              : `<div class="btn-disabled">${escapeHTML(game.btnLabel)}</div>`
          }
        </div>
      `;

      this.gridElement.appendChild(card);
    });

    // Add placeholder "Tambah Game Baru" card
    const addCard = document.createElement('article');
    addCard.className = 'game-card add-card';
    addCard.innerHTML = `
      <div class="add-icon">+</div>
      <h3 class="add-title">Tambah Game Baru</h3>
      <p class="add-subtitle">Tinggal tambahkan item di array GAMES_DATA untuk memasukkan game baru ke portal.</p>
    `;
    this.gridElement.appendChild(addCard);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new GamePortal();
});
