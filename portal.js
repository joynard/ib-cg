/**
 * IB Game Hub - Portal Engine & Game Registry
 */

const GAMES_DATA = [
  {
    id: 'anonymous-box',
    title: 'Anonymous Box',
    description: 'Tulis cerita atau rahasia kecilmu secara anonim ke dalam Box. Tebak siapa penulisnya dan rasakan momen seru bersama teman CG-mu.',
    url: 'anonymous-box.html',
    btnLabel: 'Mainkan Game',
    isLocked: true
  },
  {
    id: 'sabotase-kata',
    title: 'Sabotase Kata',
    description: 'Semua peserta mendapatkan satu kata rahasia yang sama kecuali satu orang Impostor. Sebutkan satu kata petunjuk bergiliran di dunia nyata, cari siapa yang mencurigakan, dan lakukan voting!',
    url: 'sabotase-kata.html',
    btnLabel: 'Mainkan Game',
    isLocked: true
  },
  {
    id: 'hot-takes-radar',
    title: 'Hot Takes Radar',
    description: 'Pernyataan kontroversial ringan untuk menguji pandangan anggota CG. Geser slider dari Sangat Tidak Setuju (0%) sampai Sangat Setuju (100%), lihat petanya di garis spektrum realtime, dan adu argumen!',
    url: 'hot-takes-radar.html',
    btnLabel: 'Mainkan Game',
    isLocked: false
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
    this.modal = document.getElementById('scheduleModal');
    this.btnModalClose = document.getElementById('btnModalClose');
    this.modalDesc = document.getElementById('modalDesc');

    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  bindEvents() {
    if (this.btnModalClose && this.modal) {
      this.btnModalClose.addEventListener('click', () => {
        this.closeModal();
      });

      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.closeModal();
        }
      });
    }
  }

  openModal(gameTitle) {
    if (!this.modal) return;
    if (this.modalDesc) {
      this.modalDesc.innerHTML = `Game <strong>${escapeHTML(gameTitle)}</strong> sedang tidak aktif minggu ini.`;
    }
    this.modal.classList.add('active');
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.remove('active');
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
          <button type="button" class="btn-play" data-game-id="${escapeHTML(game.id)}">${escapeHTML(game.btnLabel || 'Mainkan Game')}</button>
        </div>
      `;

      const btn = card.querySelector('.btn-play');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (game.isLocked) {
            this.openModal(game.title);
          } else {
            window.location.href = game.url;
          }
        });
      }

      this.gridElement.appendChild(card);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new GamePortal();
});
