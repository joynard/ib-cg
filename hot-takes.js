/**
 * Hot Takes Radar - Game Engine & Spectrum Controller
 * Real-time stance synchronization over P2P (PeerJS + BroadcastChannel).
 */

const RADAR_STORAGE_KEY = 'HOT_TAKES_RADAR_SESSION_V1';

const ALLOWED_CLIENT_ACTIONS = new Set([
  'JOIN',
  'REJOIN',
  'SUBMIT_STANCE',
  'LEAVE',
  'PING'
]);

const ALLOWED_HOST_ACTIONS = new Set([
  'SYNC_PLAYERS',
  'SYNC_STATEMENT',
  'SYNC_ALL_STANCES',
  'START_DEBATE_TIMER',
  'SYNC_REJOIN_STATE',
  'HOST_RESTART_GAME',
  'PING'
]);

function sanitizeString(str, maxLen = 30) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>&"']/g, '')
    .replace(/[\u0000-\u001F]/g, '')
    .trim()
    .slice(0, maxLen);
}

class HotTakesGame {
  constructor() {
    this.mode = null; // 'HOST' | 'CLIENT'
    this.playerName = '';
    this.roomCode = '';
    this.players = [];

    // Game state
    this.currentStatementIndex = 0;
    this.currentStatementText = '';
    this.myStance = 50;
    this.stances = {}; // { playerName: number }
    this.debateTimerInterval = null;
    this.debateSecondsLeft = 30;
    this.isDebateLocked = false;

    this.initDOM();
    this.bindEvents();
    this.restoreSession();
  }

  initDOM() {
    this.screens = {
      welcome: document.getElementById('screenWelcome'),
      lobby: document.getElementById('screenLobby'),
      radar: document.getElementById('screenRadar')
    };

    // Welcome Screen
    this.playerNameInput = document.getElementById('playerNameInput');
    this.joinCodeInput = document.getElementById('joinCodeInput');
    this.btnCreateRoom = document.getElementById('btnCreateRoom');
    this.btnJoinRoom = document.getElementById('btnJoinRoom');

    // Header
    this.topMeta = document.getElementById('topMeta');
    this.displayRoomCode = document.getElementById('displayRoomCode');

    // Lobby
    this.lobbyCodeBadge = document.getElementById('lobbyCodeBadge');
    this.connectedCount = document.getElementById('connectedCount');
    this.playerListContainer = document.getElementById('playerListContainer');
    this.btnStartGame = document.getElementById('btnStartGame');
    this.lobbyNotice = document.getElementById('lobbyNotice');

    // Radar Screen
    this.statementTag = document.getElementById('statementTag');
    this.statementText = document.getElementById('statementText');
    this.playerPinContainer = document.getElementById('playerPinContainer');
    this.sliderRange = document.getElementById('sliderRange');
    this.sliderValDisplay = document.getElementById('sliderValDisplay');
    this.btnLockStance = document.getElementById('btnLockStance');

    // Showdown Box
    this.showdownBox = document.getElementById('showdownBox');
    this.fighterDisagreeName = document.getElementById('fighterDisagreeName');
    this.fighterAgreeName = document.getElementById('fighterAgreeName');
    this.fighterDisagreeVal = document.getElementById('fighterDisagreeVal');
    this.fighterAgreeVal = document.getElementById('fighterAgreeVal');
    this.debateTimerDisplay = document.getElementById('debateTimerDisplay');
    this.btnStartDebateTimer = document.getElementById('btnStartDebateTimer');
    this.btnNextStatement = document.getElementById('btnNextStatement');
    this.hostControlsSection = document.getElementById('hostControlsSection');

    // Toast
    this.toastNotification = document.getElementById('toastNotification');
  }

  bindEvents() {
    this.btnCreateRoom.addEventListener('click', () => this.handleCreateRoom());
    this.btnJoinRoom.addEventListener('click', () => this.handleJoinRoom());

    this.btnStartGame.addEventListener('click', () => {
      if (this.mode === 'HOST') {
        this.startStatementRound(0);
      }
    });

    // Slider Input
    this.sliderRange.addEventListener('input', (e) => {
      if (this.isDebateLocked) return;
      this.myStance = parseInt(e.target.value, 10);
      this.updateSliderLabel(this.myStance);
    });

    // Lock & Send Stance
    this.btnLockStance.addEventListener('click', () => {
      if (this.isDebateLocked) {
        this.showToast('Posisi terkunci saat timer adu argumen dimulai!');
        return;
      }
      this.sendStanceUpdate(this.myStance);
      this.showToast('Posisi pandanganmu berhasil dikirim ke Radar!');
      this.btnLockStance.textContent = 'Perbarui Posisi';
    });

    // Host Debate Timer
    this.btnStartDebateTimer.addEventListener('click', () => {
      if (this.mode !== 'HOST') return;
      window.realtimeEngine.broadcast('START_DEBATE_TIMER', { seconds: 30 });
      this.runDebateCountdown(30);
    });

    // Host Next Statement
    this.btnNextStatement.addEventListener('click', () => {
      if (this.mode !== 'HOST') return;
      const nextIdx = (this.currentStatementIndex + 1) % HOT_TAKES_STATEMENTS.length;
      this.startStatementRound(nextIdx);
    });
  }

  showScreen(screenKey) {
    Object.values(this.screens).forEach(s => s && s.classList.remove('active'));
    if (this.screens[screenKey]) {
      this.screens[screenKey].classList.add('active');
    }
  }

  showToast(message, duration = 3000) {
    if (!this.toastNotification) return;
    this.toastNotification.textContent = message;
    this.toastNotification.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastNotification.classList.remove('show');
    }, duration);
  }

  updateSliderLabel(val) {
    let text = `${val}% — Netral`;
    let color = 'var(--color-neutral)';
    if (val <= 15) {
      text = `${val}% — Sangat Tidak Setuju!`;
      color = 'var(--color-disagree)';
    } else if (val <= 35) {
      text = `${val}% — Cenderung Tidak Setuju`;
      color = 'rgba(244, 63, 94, 0.85)';
    } else if (val >= 85) {
      text = `${val}% — Sangat Setuju Banget!`;
      color = 'var(--color-agree)';
    } else if (val >= 65) {
      text = `${val}% — Cenderung Setuju`;
      color = 'rgba(16, 185, 129, 0.85)';
    }

    this.sliderValDisplay.textContent = text;
    this.sliderValDisplay.style.color = color;
  }

  // --- ROOM SETUP ---

  handleCreateRoom() {
    const name = sanitizeString(this.playerNameInput.value, 15);
    if (!name) {
      this.showToast('Silakan masukkan nama Anda.');
      return;
    }

    this.playerName = name;
    this.mode = 'HOST';
    this.roomCode = window.realtimeEngine.initHost(
      null,
      (conn) => this.onPlayerConnected(conn),
      (data, conn) => this.onMessageReceived(data, conn),
      (conn) => this.onPlayerDisconnected(conn),
      'TAKE'
    );

    this.players = [{ id: 'host', name: this.playerName, isHost: true }];
    this.displayRoomCode.textContent = this.roomCode;
    this.lobbyCodeBadge.textContent = this.roomCode;
    this.topMeta.style.display = 'flex';

    this.updateLobbyUI();
    this.showScreen('lobby');
    this.saveSession();
  }

  handleJoinRoom() {
    const name = sanitizeString(this.playerNameInput.value, 15);
    let rawCode = this.joinCodeInput.value.replace(/[^A-Z0-9-]/gi, '').trim().toUpperCase().slice(0, 12);

    if (!name) {
      this.showToast('Silakan masukkan nama Anda.');
      return;
    }
    if (!rawCode) {
      this.showToast('Silakan masukkan Kode Room.');
      return;
    }

    const code = rawCode.includes('-') ? rawCode : `TAKE-${rawCode}`;

    this.playerName = name;
    this.roomCode = code;
    this.mode = 'CLIENT';

    window.realtimeEngine.initClient(
      code,
      name,
      () => {
        this.displayRoomCode.textContent = this.roomCode;
        this.lobbyCodeBadge.textContent = this.roomCode;
        this.topMeta.style.display = 'flex';
        this.showScreen('lobby');
      },
      (data) => this.onMessageReceived(data),
      (err) => {
        this.showScreen('welcome');
        this.topMeta.style.display = 'none';
      },
      'TAKE'
    );

    this.saveSession();
  }

  onPlayerConnected(conn) {
    const rawName = conn.metadata ? conn.metadata.name : `Pemain ${this.players.length + 1}`;
    const safeName = sanitizeString(rawName, 15) || `Pemain ${this.players.length + 1}`;
    const sessionId = (conn.metadata && conn.metadata.sessionId) ? String(conn.metadata.sessionId) : `sess-${safeName}`;

    // Cancel any pending disconnect purge timer for this player
    if (this.disconnectTimers && this.disconnectTimers[safeName.toLowerCase()]) {
      clearTimeout(this.disconnectTimers[safeName.toLowerCase()]);
      delete this.disconnectTimers[safeName.toLowerCase()];
    }

    const existingIdx = this.players.findIndex(p => 
      (p.sessionId && p.sessionId === sessionId) || p.name.toLowerCase() === safeName.toLowerCase()
    );

    if (existingIdx >= 0) {
      this.players[existingIdx].id = conn.peer;
      this.players[existingIdx].sessionId = sessionId;
      this.players[existingIdx].name = safeName;
      this.players[existingIdx].isOffline = false;
    } else if (this.players.length < 24) {
      this.players.push({
        id: conn.peer,
        sessionId: sessionId,
        name: safeName,
        isHost: false,
        isOffline: false
      });
    }

    this.updateLobbyUI();
    window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.players });

    // If client connects mid-game, synchronize current statement and stances
    if (this.mode === 'HOST' && this.screens.radar.classList.contains('active')) {
      window.realtimeEngine.sendDirectToClient(safeName, 'SYNC_REJOIN_STATE', {
        players: this.players,
        statementIndex: this.currentStatementIndex,
        statementText: this.currentStatementText,
        stances: this.stances,
        inRound: true
      });
    }

    this.saveSession();
  }

  onPlayerDisconnected(conn) {
    const discName = conn && conn.metadata ? conn.metadata.name : null;
    if (!discName) return;

    if (!this.disconnectTimers) this.disconnectTimers = {};

    const idx = this.players.findIndex(p => p.name.toLowerCase() === discName.toLowerCase());
    if (idx >= 0 && !this.players[idx].isHost) {
      // Mark as temporarily offline instead of deleting immediately
      this.players[idx].isOffline = true;
      this.updateLobbyUI();
      window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.players });

      // Grace period: allow 35 seconds to reconnect before purging
      if (this.disconnectTimers[discName.toLowerCase()]) {
        clearTimeout(this.disconnectTimers[discName.toLowerCase()]);
      }

      this.disconnectTimers[discName.toLowerCase()] = setTimeout(() => {
        const curIdx = this.players.findIndex(p => p.name.toLowerCase() === discName.toLowerCase());
        if (curIdx >= 0 && this.players[curIdx].isOffline) {
          this.players.splice(curIdx, 1);
          delete this.stances[discName];
          this.showToast(`${discName} keluar dari room.`);
          this.updateLobbyUI();
          window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.players });
          window.realtimeEngine.broadcast('SYNC_ALL_STANCES', { stances: this.stances });
          this.renderSpectrumPins(this.stances);
        }
        delete this.disconnectTimers[discName.toLowerCase()];
      }, 35000);
    }
  }

  updateLobbyUI() {
    this.connectedCount.textContent = this.players.length;
    this.playerListContainer.innerHTML = '';

    this.players.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      if (p.isHost) {
        const hostTag = document.createElement('span');
        hostTag.className = 'host-tag';
        hostTag.textContent = 'HOST';
        chip.appendChild(hostTag);
      }
      chip.appendChild(document.createTextNode(p.name));
      this.playerListContainer.appendChild(chip);
    });

    if (this.mode === 'HOST') {
      const canStart = this.players.length >= 2;
      this.btnStartGame.disabled = !canStart;
      this.btnStartGame.textContent = canStart ? 'Mulai Hot Takes Radar' : 'Butuh Minimal 2 Pemain';
      this.lobbyNotice.style.display = 'none';
    } else {
      this.btnStartGame.style.display = 'none';
      this.lobbyNotice.style.display = 'block';
    }
  }

  // --- ROUND & SPECTRUM LOGIC ---

  startStatementRound(statementIndex) {
    if (this.mode !== 'HOST') return;

    this.currentStatementIndex = statementIndex;
    this.currentStatementText = HOT_TAKES_STATEMENTS[statementIndex];
    this.stances = {};

    window.realtimeEngine.broadcast('SYNC_STATEMENT', {
      statementIndex: this.currentStatementIndex,
      statementText: this.currentStatementText
    });

    this.setupLocalStatement(this.currentStatementIndex, this.currentStatementText);
  }

  setupLocalStatement(index, text) {
    if (this.debateTimerInterval) {
      clearInterval(this.debateTimerInterval);
      this.debateTimerInterval = null;
    }
    this.debateSecondsLeft = 30;
    this.debateTimerDisplay.textContent = '30s';

    this.currentStatementIndex = index;
    this.currentStatementText = text;
    this.myStance = 50;
    this.isDebateLocked = false;
    this.sliderRange.disabled = false;
    this.btnLockStance.disabled = false;
    this.sliderRange.value = 50;
    this.updateSliderLabel(50);
    this.btnLockStance.textContent = 'Kirim Posisi Pandangan';

    this.statementTag.textContent = `HOT TAKE #${index + 1} DARI ${HOT_TAKES_STATEMENTS.length}`;
    this.statementText.textContent = `“${text}”`;

    // Clear plotted pins and showdown box
    this.playerPinContainer.innerHTML = '';
    this.showdownBox.style.display = 'none';

    // Restrict moderator-only controls
    if (this.mode === 'HOST') {
      this.hostControlsSection.style.display = 'block';
      this.btnStartDebateTimer.style.display = 'inline-flex';
    } else {
      this.hostControlsSection.style.display = 'none';
      this.btnStartDebateTimer.style.display = 'none';
    }

    this.showScreen('radar');
  }

  sendStanceUpdate(val) {
    if (this.isDebateLocked) return;
    const safeVal = Math.min(100, Math.max(0, parseInt(val, 10)));
    this.myStance = safeVal;

    if (this.mode === 'CLIENT') {
      window.realtimeEngine.sendToHost('SUBMIT_STANCE', {
        playerName: this.playerName,
        value: safeVal
      });
    } else if (this.mode === 'HOST') {
      this.recordStance(this.playerName, safeVal);
    }
  }

  recordStance(playerName, value) {
    if (this.mode !== 'HOST') return;
    if (this.isDebateLocked) return;

    this.stances[playerName] = value;

    // Broadcast full stances map
    window.realtimeEngine.broadcast('SYNC_ALL_STANCES', {
      stances: this.stances
    });

    this.renderSpectrumPins(this.stances);
  }

  renderSpectrumPins(stances) {
    this.playerPinContainer.innerHTML = '';

    const entries = Object.entries(stances);
    if (entries.length === 0) {
      this.showdownBox.style.display = 'none';
      return;
    }

    // Sort ascending by value to calculate non-overlapping tiers
    const sortedEntries = [...entries].sort((a, b) => a[1] - b[1]);
    let currentTier = 0;
    let prevVal = -999;

    sortedEntries.forEach(([name, val]) => {
      // If within 15% of previous pin, bump tier to avoid label collision
      if (Math.abs(val - prevVal) < 15) {
        currentTier = (currentTier + 1) % 3;
      } else {
        currentTier = 0;
      }
      prevVal = val;

      const isMe = (name.toLowerCase() === this.playerName.toLowerCase());
      const pin = document.createElement('div');

      // Horizontal boundary clamping classes
      let alignClass = 'pin-centered';
      if (val <= 15) alignClass = 'pin-edge-left';
      else if (val >= 85) alignClass = 'pin-edge-right';

      pin.className = `player-pin tier-${currentTier} ${alignClass} ${isMe ? 'is-me' : ''}`;
      pin.style.left = `calc(12px + (${val} / 100) * (100% - 24px))`;

      const dot = document.createElement('div');
      dot.className = 'player-pin-dot';
      pin.appendChild(dot);

      if (currentTier > 0) {
        const stem = document.createElement('div');
        stem.className = 'player-pin-stem';
        pin.appendChild(stem);
      }

      const label = document.createElement('div');
      label.className = 'player-pin-name';
      label.textContent = `${name} (${val}%)`;

      pin.appendChild(label);
      this.playerPinContainer.appendChild(pin);
    });

    // Check if at least 2 people have submitted to show the 30-sec Showdown
    if (entries.length >= 2) {
      this.updateShowdownFighters(entries);
    } else {
      this.showdownBox.style.display = 'none';
    }
  }

  updateShowdownFighters(entries) {
    // Sort ascending by stance value
    const sorted = [...entries].sort((a, b) => a[1] - b[1]);
    const disagreePlayer = sorted[0]; // Lowest value (closest to 0%)
    const agreePlayer = sorted[sorted.length - 1]; // Highest value (closest to 100%)

    // If there is actual difference in stance
    if (agreePlayer[1] > disagreePlayer[1]) {
      this.showdownBox.style.display = 'block';
      this.btnStartDebateTimer.style.display = (this.mode === 'HOST') ? 'inline-flex' : 'none';
      this.fighterDisagreeName.textContent = disagreePlayer[0];
      this.fighterDisagreeVal.textContent = `${disagreePlayer[1]}%`;
      this.fighterAgreeName.textContent = agreePlayer[0];
      this.fighterAgreeVal.textContent = `${agreePlayer[1]}%`;
    } else {
      this.showdownBox.style.display = 'none';
    }
  }

  runDebateCountdown(seconds = 30) {
    if (this.debateTimerInterval) clearInterval(this.debateTimerInterval);
    this.debateSecondsLeft = seconds;
    this.debateTimerDisplay.textContent = `${this.debateSecondsLeft}s`;
    this.debateTimerDisplay.classList.remove('critical');

    // Lock stance changes across all players when debate timer starts
    this.isDebateLocked = true;
    this.sliderRange.disabled = true;
    this.btnLockStance.disabled = true;
    this.btnLockStance.textContent = '🔒 Posisi Terkunci (Sedang Adu Argumen)';
    if (this.btnStartDebateTimer) {
      this.btnStartDebateTimer.disabled = true;
    }

    this.debateTimerInterval = setInterval(() => {
      this.debateSecondsLeft--;
      if (this.debateSecondsLeft <= 0) {
        clearInterval(this.debateTimerInterval);
        this.debateTimerDisplay.textContent = '0s';
        this.debateTimerDisplay.classList.remove('critical');
        this.showToast('⏱️ Waktu adu argumen 30 detik selesai!');
      } else {
        this.debateTimerDisplay.textContent = `${this.debateSecondsLeft}s`;
        if (this.debateSecondsLeft <= 10) {
          this.debateTimerDisplay.classList.add('critical');
        } else {
          this.debateTimerDisplay.classList.remove('critical');
        }
      }
    }, 1000);
  }

  // --- NETWORK MESSAGE RECEIVER ---

  onMessageReceived(data, conn) {
    if (!data || typeof data !== 'object' || typeof data.action !== 'string') return;
    const { action, payload } = data;

    if (this.mode === 'HOST' && !ALLOWED_CLIENT_ACTIONS.has(action)) return;
    if (this.mode === 'CLIENT' && !ALLOWED_HOST_ACTIONS.has(action)) return;

    switch (action) {
      case 'SYNC_PLAYERS':
        if (payload && Array.isArray(payload.players)) {
          this.players = payload.players.map(p => ({
            id: String(p.id || '').slice(0, 32),
            name: sanitizeString(p.name, 15),
            isHost: Boolean(p.isHost)
          }));
          this.updateLobbyUI();
        }
        break;

      case 'REJOIN':
        if (this.mode === 'HOST' && payload) {
          const safeName = sanitizeString(payload.name, 15);
          if (safeName) {
            window.realtimeEngine.sendDirectToClient(safeName, 'SYNC_REJOIN_STATE', {
              players: this.players,
              statementIndex: this.currentStatementIndex,
              statementText: this.currentStatementText,
              stances: this.stances,
              inRound: this.screens.radar.classList.contains('active')
            });
          }
        }
        break;

      case 'SYNC_REJOIN_STATE':
        if (payload) {
          if (payload.players) {
            this.players = payload.players;
            this.updateLobbyUI();
          }
          if (payload.inRound && payload.statementText) {
            this.setupLocalStatement(payload.statementIndex, payload.statementText);
            if (payload.stances) {
              this.stances = payload.stances;
              this.renderSpectrumPins(this.stances);
            }
          }
        }
        break;

      case 'SYNC_STATEMENT':
        if (payload && typeof payload.statementText === 'string') {
          this.setupLocalStatement(payload.statementIndex || 0, payload.statementText);
        }
        break;

      case 'SUBMIT_STANCE':
        if (this.mode === 'HOST' && payload) {
          const safeName = sanitizeString(payload.playerName, 15);
          const safeVal = Math.min(100, Math.max(0, parseInt(payload.value, 10)));
          if (safeName && !isNaN(safeVal)) {
            this.recordStance(safeName, safeVal);
          }
        }
        break;

      case 'SYNC_ALL_STANCES':
        if (payload && payload.stances) {
          this.stances = payload.stances;
          this.renderSpectrumPins(this.stances);
        }
        break;

      case 'START_DEBATE_TIMER':
        this.runDebateCountdown(payload.seconds || 30);
        break;
    }
  }

  saveSession() {
    if (!this.mode || !this.roomCode) return;
    localStorage.setItem(RADAR_STORAGE_KEY, JSON.stringify({
      mode: this.mode,
      playerName: this.playerName,
      roomCode: this.roomCode,
      timestamp: Date.now()
    }));
  }

  restoreSession() {
    const raw = localStorage.getItem(RADAR_STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > 2 * 60 * 60 * 1000) {
        localStorage.removeItem(RADAR_STORAGE_KEY);
        return;
      }
      if (data.playerName) this.playerNameInput.value = data.playerName;
      if (data.roomCode) this.joinCodeInput.value = data.roomCode;

      // Auto-reconnect if client disconnected and reloads page
      if (data.mode === 'CLIENT' && data.playerName && data.roomCode) {
        console.log('[HotTakes] Auto-reconnecting client to session:', data.roomCode);
        setTimeout(() => {
          this.handleJoinRoom();
        }, 300);
      }
    } catch (e) {
      localStorage.removeItem(RADAR_STORAGE_KEY);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.hotTakesGame = new HotTakesGame();
});
