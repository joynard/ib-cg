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
  'JOIN_REJECTED',
  'HOST_STOP_GAME',
  'HOST_RESTART_GAME',
  'HOST_TERMINATE_ROOM',
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
    this.debateEndsAt = 0;
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
    this.showdownBadge = document.getElementById('showdownBadge');
    this.showdownVersusContent = document.getElementById('showdownVersusContent');
    this.consensusNotice = document.getElementById('consensusNotice');
    this.consensusTitle = document.getElementById('consensusTitle');
    this.consensusDesc = document.getElementById('consensusDesc');
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

    // Host Quick Menu DOM
    this.hostMenuContainer = document.getElementById('hostMenuContainer');
    this.btnHostMenu = document.getElementById('btnHostMenu');
    this.hostMenuDropdown = document.getElementById('hostMenuDropdown');
    this.btnMenuStopGame = document.getElementById('btnMenuStopGame');
    this.btnMenuRestartGame = document.getElementById('btnMenuRestartGame');
    this.btnMenuTerminateRoom = document.getElementById('btnMenuTerminateRoom');

    // Confirm Modal
    this.confirmModal = document.getElementById('confirmModal');
    this.confirmModalTitle = document.getElementById('confirmModalTitle');
    this.confirmModalBody = document.getElementById('confirmModalBody');
    this.btnConfirmCancel = document.getElementById('btnConfirmCancel');
    this.btnConfirmOk = document.getElementById('btnConfirmOk');
    this.pendingConfirmAction = null;
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

    // Host Menu Toggle
    if (this.btnHostMenu && this.hostMenuDropdown) {
      this.btnHostMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hostMenuDropdown.classList.toggle('show');
      });

      document.addEventListener('click', (e) => {
        if (!this.hostMenuContainer.contains(e.target)) {
          this.hostMenuDropdown.classList.remove('show');
        }
      });
    }

    // Host Menu Action 1: Stop Game (Return to Room / Lobby)
    if (this.btnMenuStopGame) {
      this.btnMenuStopGame.addEventListener('click', () => {
        this.hostMenuDropdown.classList.remove('show');
        this.promptConfirm(
          'Stop Game',
          'Hentikan permainan saat ini dan bawa seluruh pemain kembali ke Room (Lobby)?',
          () => this.executeStopGame()
        );
      });
    }

    // Host Menu Action 2: Restart Game
    if (this.btnMenuRestartGame) {
      this.btnMenuRestartGame.addEventListener('click', () => {
        this.hostMenuDropdown.classList.remove('show');
        this.promptConfirm(
          'Restart Game',
          'Mulai ulang game dari pernyataan #1? Semua posisi pandangan saat ini akan di-reset.',
          () => this.executeRestartGame()
        );
      });
    }

    // Host Menu Action 3: Terminate Room
    if (this.btnMenuTerminateRoom) {
      this.btnMenuTerminateRoom.addEventListener('click', () => {
        this.hostMenuDropdown.classList.remove('show');
        this.promptConfirm(
          'Terminate Room',
          'PERINGATAN: Room akan dihapus permanen dan semua pemain akan dikeluarkan ke halaman awal.',
          () => this.executeTerminateRoom()
        );
      });
    }

    // Confirm Modal Events
    if (this.btnConfirmCancel && this.confirmModal) {
      this.btnConfirmCancel.addEventListener('click', () => {
        this.confirmModal.style.display = 'none';
        this.pendingConfirmAction = null;
      });
    }

    if (this.btnConfirmOk) {
      this.btnConfirmOk.addEventListener('click', () => {
        this.confirmModal.style.display = 'none';
        if (typeof this.pendingConfirmAction === 'function') {
          this.pendingConfirmAction();
        }
        this.pendingConfirmAction = null;
      });
    }
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

  promptConfirm(title, message, onOk) {
    if (!this.confirmModal) {
      if (window.confirm(`${title}\n\n${message}`)) {
        onOk();
      }
      return;
    }
    this.confirmModalTitle.textContent = title;
    this.confirmModalBody.textContent = message;
    this.pendingConfirmAction = onOk;
    this.confirmModal.style.display = 'flex';
  }

  executeStopGame() {
    if (this.mode !== 'HOST') return;
    if (this.debateTimerInterval) {
      clearInterval(this.debateTimerInterval);
      this.debateTimerInterval = null;
    }
    this.debateEndsAt = 0;
    this.isDebateLocked = false;
    this.stances = {};
    window.realtimeEngine.broadcast('HOST_STOP_GAME', {});
    this.showScreen('lobby');
    this.updateLobbyUI();
    this.saveSession();
    this.showToast('Permainan dihentikan. Kembali ke Lobby.');
  }

  executeRestartGame() {
    if (this.mode !== 'HOST') return;
    if (this.debateTimerInterval) {
      clearInterval(this.debateTimerInterval);
      this.debateTimerInterval = null;
    }
    this.debateEndsAt = 0;
    this.isDebateLocked = false;
    this.stances = {};
    window.realtimeEngine.broadcast('HOST_RESTART_GAME', {});
    this.startStatementRound(0);
    this.showToast('Permainan berhasil di-restart dari awal.');
  }

  executeTerminateRoom() {
    if (this.mode !== 'HOST') return;
    if (this.debateTimerInterval) {
      clearInterval(this.debateTimerInterval);
      this.debateTimerInterval = null;
    }
    this.debateEndsAt = 0;
    window.realtimeEngine.broadcast('HOST_TERMINATE_ROOM', {});
    
    // Clear storage and teardown networking
    localStorage.removeItem(RADAR_STORAGE_KEY);
    setTimeout(() => {
      window.realtimeEngine.destroy();
      window.location.reload();
    }, 150);
  }

  updateSliderLabel(val) {
    let text = `${val}% - Netral`;
    let color = 'var(--color-neutral)';
    if (val === 0) {
      text = '0% - Mentok Kiri';
      color = 'var(--color-disagree)';
    } else if (val === 100) {
      text = '100% - Mentok Kanan';
      color = 'var(--color-agree)';
    } else if (val <= 15) {
      text = `${val}% - Sangat Tidak Setuju!`;
      color = 'var(--color-disagree)';
    } else if (val <= 35) {
      text = `${val}% - Cenderung Tidak Setuju`;
      color = 'rgba(244, 63, 94, 0.85)';
    } else if (val >= 85) {
      text = `${val}% - Sangat Setuju Banget!`;
      color = 'var(--color-agree)';
    } else if (val >= 65) {
      text = `${val}% - Cenderung Setuju`;
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
    if (this.hostMenuContainer) {
      this.hostMenuContainer.style.display = 'flex';
    }

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
        if (this.hostMenuContainer) {
          this.hostMenuContainer.style.display = 'none';
        }
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

  // Public roster: never leak sessionId (identity token) or peer ids to clients
  publicPlayers() {
    return this.players.map(p => ({ name: p.name, isHost: Boolean(p.isHost), isOffline: Boolean(p.isOffline) }));
  }

  normalizePlayers(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 30).map(p => ({
      name: sanitizeString(p && p.name, 15),
      isHost: Boolean(p && p.isHost),
      isOffline: Boolean(p && p.isOffline)
    })).filter(p => p.name);
  }

  normalizeStances(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.entries(obj).slice(0, 30).forEach(([k, v]) => {
      const name = sanitizeString(k, 15);
      const val = parseInt(v, 10);
      if (name && !isNaN(val)) out[name] = Math.min(100, Math.max(0, val));
    });
    return out;
  }

  rejectConnection(conn, reason) {
    const packet = { action: 'JOIN_REJECTED', payload: { reason }, msgId: `REJ-${Date.now()}-${Math.random()}` };
    try { if (conn && typeof conn.send === 'function') conn.send(packet); } catch (e) {}
    conn.__rejected = true;
    setTimeout(() => { try { if (conn.close) conn.close(); } catch (e) {} }, 600);
  }

  buildRejoinState() {
    const now = Date.now();
    const secondsLeft = this.isDebateLocked && this.debateEndsAt
      ? Math.max(0, Math.ceil((this.debateEndsAt - now) / 1000))
      : 0;
    return {
      players: this.publicPlayers(),
      statementIndex: this.currentStatementIndex,
      statementText: this.currentStatementText,
      stances: this.stances,
      inRound: this.screens.radar.classList.contains('active'),
      debateLocked: this.isDebateLocked,
      debateSecondsLeft: secondsLeft
    };
  }

  onPlayerConnected(conn) {
    const rawName = conn.metadata ? conn.metadata.name : '';
    const safeName = sanitizeString(rawName, 15);
    if (!safeName) {
      this.rejectConnection(conn, 'Nama tidak valid.');
      return;
    }
    const sessionId = (conn.metadata && conn.metadata.sessionId)
      ? String(conn.metadata.sessionId).slice(0, 64)
      : `sess-${safeName}`;
    const key = safeName.toLowerCase();

    const bySession = this.players.findIndex(p => p.sessionId && p.sessionId === sessionId);
    const byName = this.players.findIndex(p => p.name.toLowerCase() === key);

    // Name collision with a different device that is still online (or the host): reject
    if (byName >= 0 && byName !== bySession) {
      const other = this.players[byName];
      if (other.isHost || !other.isOffline) {
        this.rejectConnection(conn, `Nama "${safeName}" sudah dipakai pemain lain. Gunakan nama lain.`);
        return;
      }
    }

    const existingIdx = bySession >= 0 ? bySession : byName;

    if (existingIdx < 0 && this.players.length >= 24) {
      this.rejectConnection(conn, 'Room penuh (maksimal 24 pemain).');
      return;
    }

    // Cancel pending purge timers for this player
    if (this.disconnectTimers) {
      [key, existingIdx >= 0 ? this.players[existingIdx].name.toLowerCase() : null].forEach(k => {
        if (k && this.disconnectTimers[k]) {
          clearTimeout(this.disconnectTimers[k]);
          delete this.disconnectTimers[k];
        }
      });
    }

    if (existingIdx >= 0) {
      const p = this.players[existingIdx];
      // Same device rejoined under a new name: carry stance over
      if (p.name !== safeName && Object.prototype.hasOwnProperty.call(this.stances, p.name)) {
        this.stances[safeName] = this.stances[p.name];
        delete this.stances[p.name];
      }
      p.id = (conn.peer && !String(conn.peer).startsWith('local-')) ? conn.peer : (p.id || conn.peer);
      p.sessionId = sessionId;
      p.name = safeName;
      p.isOffline = false;
    } else {
      this.players.push({ id: conn.peer, sessionId, name: safeName, isHost: false, isOffline: false });
    }

    this.updateLobbyUI();
    window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.publicPlayers() });

    // Always push full state to the (re)joining client
    window.realtimeEngine.sendDirectToClient(safeName, 'SYNC_REJOIN_STATE', this.buildRejoinState());

    this.saveSession();
  }

  schedulePurge(name, ms) {
    if (!this.disconnectTimers) this.disconnectTimers = {};
    const key = name.toLowerCase();
    clearTimeout(this.disconnectTimers[key]);
    this.disconnectTimers[key] = setTimeout(() => {
      delete this.disconnectTimers[key];
      const curIdx = this.players.findIndex(p => p.name.toLowerCase() === key);
      if (curIdx >= 0 && this.players[curIdx].isOffline && !this.players[curIdx].isHost) {
        const realName = this.players[curIdx].name;
        this.players.splice(curIdx, 1);
        delete this.stances[realName];
        this.showToast(`${realName} keluar dari room.`);
        this.updateLobbyUI();
        window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.publicPlayers() });
        window.realtimeEngine.broadcast('SYNC_ALL_STANCES', { stances: this.stances });
        if (this.screens.radar.classList.contains('active')) this.renderSpectrumPins(this.stances);
        this.saveSession();
      }
    }, ms);
  }

  onPlayerDisconnected(conn) {
    if (!conn || conn.__rejected) return;
    const discName = conn.metadata ? sanitizeString(conn.metadata.name, 15) : '';
    if (!discName) return;

    const idx = this.players.findIndex(p => p.name.toLowerCase() === discName.toLowerCase());
    if (idx < 0 || this.players[idx].isHost) return;

    // Stale close from a superseded connection: player already reconnected on a new peer
    const p = this.players[idx];
    if (p.id && conn.peer && !String(conn.peer).startsWith('local-') && p.id !== conn.peer) return;

    p.isOffline = true;
    this.updateLobbyUI();
    window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.publicPlayers() });
    this.schedulePurge(p.name, 35000);
  }

  updateLobbyUI() {
    const onlineCount = this.players.filter(p => !p.isOffline).length;
    this.connectedCount.textContent = onlineCount;
    this.playerListContainer.innerHTML = '';

    const frag = document.createDocumentFragment ? document.createDocumentFragment() : this.playerListContainer;
    this.players.forEach(p => {
      const chip = document.createElement('div');
      chip.className = p.isOffline ? 'player-chip is-offline' : 'player-chip';
      if (p.isHost) {
        const hostTag = document.createElement('span');
        hostTag.className = 'host-tag';
        hostTag.textContent = 'HOST';
        chip.appendChild(hostTag);
      }
      chip.appendChild(document.createTextNode(p.name));
      frag.appendChild(chip);
    });
    if (frag !== this.playerListContainer) this.playerListContainer.appendChild(frag);

    if (this.mode === 'HOST') {
      const canStart = onlineCount >= 2;
      this.btnStartGame.style.display = 'inline-flex';
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
    this.saveSession();
  }

  setupLocalStatement(index, text) {
    if (this.debateTimerInterval) {
      clearInterval(this.debateTimerInterval);
      this.debateTimerInterval = null;
    }
    this.debateEndsAt = 0;
    this.debateSecondsLeft = 30;
    this.debateTimerDisplay.textContent = '30s';
    this.debateTimerDisplay.classList.remove('critical');

    if (this.btnStartDebateTimer) {
      this.btnStartDebateTimer.disabled = false;
    }

    this.currentStatementIndex = index;
    this.currentStatementText = text;
    this.myStance = 50;
    this.isDebateLocked = false;
    this.sliderRange.disabled = false;
    this.btnLockStance.disabled = false;
    this.sliderRange.value = 50;
    this.updateSliderLabel(50);
    this.btnLockStance.textContent = 'Kirim Posisi Pandangan';

    this.statementTag.textContent = `#${index + 1} DARI ${HOT_TAKES_STATEMENTS.length}`;
    this.statementText.textContent = `“${text}”`;

    // Clear plotted pins and showdown box
    this.playerPinContainer.innerHTML = '';
    this.showdownBox.style.display = 'none';

    // Restrict moderator-only controls
    if (this.mode === 'HOST') {
      this.hostControlsSection.style.setProperty('display', 'flex', 'important');
      this.btnStartDebateTimer.style.setProperty('display', 'inline-flex', 'important');
    } else {
      this.hostControlsSection.style.setProperty('display', 'none', 'important');
      this.btnStartDebateTimer.style.setProperty('display', 'none', 'important');
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
    this.saveSession();
  }

  renderSpectrumPins(stances) {
    this.playerPinContainer.innerHTML = '';

    const entries = Object.entries(stances);
    if (entries.length === 0) {
      this.showdownBox.style.display = 'none';
      return;
    }

    // Sort ascending by stance value
    const sortedEntries = [...entries].sort((a, b) => a[1] - b[1]);

    // Group close proximity pins (difference <= 4%) into smart clusters
    const clusters = [];
    sortedEntries.forEach(([name, val]) => {
      const isMe = (name.toLowerCase() === this.playerName.toLowerCase());
      if (clusters.length === 0) {
        clusters.push({ avgVal: val, players: [{ name, val, isMe }] });
      } else {
        const lastCluster = clusters[clusters.length - 1];
        if (Math.abs(val - lastCluster.avgVal) <= 4) {
          lastCluster.players.push({ name, val, isMe });
          const sum = lastCluster.players.reduce((acc, p) => acc + p.val, 0);
          lastCluster.avgVal = Math.round(sum / lastCluster.players.length);
        } else {
          clusters.push({ avgVal: val, players: [{ name, val, isMe }] });
        }
      }
    });

    clusters.forEach(cluster => {
      const pin = document.createElement('div');
      const val = cluster.avgVal;
      const hasMe = cluster.players.some(p => p.isMe);

      // Horizontal boundary clamping classes
      let alignClass = 'pin-centered';
      if (val <= 15) alignClass = 'pin-edge-left';
      else if (val >= 85) alignClass = 'pin-edge-right';

      pin.className = `player-pin ${alignClass} ${hasMe ? 'is-me' : ''}`;
      pin.style.left = `calc(12px + (${val} / 100) * (100% - 24px))`;

      const dot = document.createElement('div');
      dot.className = 'player-pin-dot';
      pin.appendChild(dot);

      const label = document.createElement('div');
      label.className = 'player-pin-name';

      if (cluster.players.length === 1) {
        const p = cluster.players[0];
        label.textContent = `${p.name} (${p.val}%)`;
      } else if (cluster.players.length === 2) {
        label.textContent = `${cluster.players[0].name}, ${cluster.players[1].name} (${val}%)`;
      } else {
        label.textContent = `${cluster.players[0].name}, ${cluster.players[1].name} +${cluster.players.length - 2} (${val}%)`;
      }

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
    const minVal = disagreePlayer[1];
    const maxVal = agreePlayer[1];
    const spread = maxVal - minVal;

    const allKontra = maxVal <= 30;
    const allPro = minVal >= 70;
    const isConsensus = allKontra || allPro || spread <= 15;

    this.showdownBox.style.display = 'block';

    if (isConsensus) {
      if (this.showdownVersusContent) this.showdownVersusContent.style.display = 'none';
      if (this.consensusNotice) this.consensusNotice.style.display = 'block';
      if (this.showdownBadge) this.showdownBadge.textContent = 'SESI DISKUSI BERSAMA';

      if (allKontra) {
        if (this.consensusTitle) {
          this.consensusTitle.textContent = 'Semua Pemain Kompak Kontra';
          this.consensusTitle.style.color = 'var(--color-disagree)';
        }
        if (this.consensusDesc) {
          this.consensusDesc.textContent = 'Seluruh pemain memilih di bawah atau sama dengan 30%. Tidak ada adu argumen, lanjut diskusi biasa.';
        }
      } else if (allPro) {
        if (this.consensusTitle) {
          this.consensusTitle.textContent = 'Semua Pemain Kompak Pro';
          this.consensusTitle.style.color = 'var(--color-agree)';
        }
        if (this.consensusDesc) {
          this.consensusDesc.textContent = 'Seluruh pemain memilih di atas atau sama dengan 70%. Tidak ada adu argumen, lanjut diskusi biasa.';
        }
      } else {
        if (this.consensusTitle) {
          this.consensusTitle.textContent = 'Pandangan Pemain Searah';
          this.consensusTitle.style.color = 'var(--color-neutral)';
        }
        if (this.consensusDesc) {
          this.consensusDesc.textContent = 'Jarak pandangan antar pemain sangat dekat. Tidak ada adu argumen, lanjut diskusi biasa.';
        }
      }
      return;
    }

    if (this.showdownVersusContent) this.showdownVersusContent.style.display = 'block';
    if (this.consensusNotice) this.consensusNotice.style.display = 'none';
    if (this.showdownBadge) this.showdownBadge.textContent = 'DUA POSISI PALING BERSEBERANGAN';

    this.btnStartDebateTimer.style.setProperty('display', (this.mode === 'HOST') ? 'inline-flex' : 'none', 'important');
    this.fighterDisagreeName.textContent = disagreePlayer[0];
    this.fighterDisagreeVal.textContent = `${disagreePlayer[1]}%`;
    this.fighterAgreeName.textContent = agreePlayer[0];
    this.fighterAgreeVal.textContent = `${agreePlayer[1]}%`;
  }

  runDebateCountdown(seconds = 30) {
    if (this.debateTimerInterval) clearInterval(this.debateTimerInterval);
    this.debateSecondsLeft = seconds;
    this.debateEndsAt = Date.now() + seconds * 1000;
    this.debateTimerDisplay.textContent = `${this.debateSecondsLeft}s`;
    if (this.debateSecondsLeft <= 10 && this.debateSecondsLeft > 0) {
      this.debateTimerDisplay.classList.add('critical');
    } else {
      this.debateTimerDisplay.classList.remove('critical');
    }

    // Lock stance changes across all players when debate timer starts
    this.isDebateLocked = true;
    this.sliderRange.disabled = true;
    this.btnLockStance.disabled = true;
    this.btnLockStance.textContent = 'Posisi Terkunci (Sedang Adu Argumen)';
    if (this.btnStartDebateTimer) {
      this.btnStartDebateTimer.disabled = true;
    }

    if (seconds <= 0) {
      this.debateEndsAt = 0;
      this.debateTimerDisplay.textContent = '0s';
      this.debateTimerDisplay.classList.remove('critical');
      return;
    }

    this.debateTimerInterval = setInterval(() => {
      this.debateSecondsLeft--;
      if (this.debateSecondsLeft <= 0) {
        clearInterval(this.debateTimerInterval);
        this.debateTimerInterval = null;
        this.debateEndsAt = 0;
        this.debateTimerDisplay.textContent = '0s';
        this.debateTimerDisplay.classList.remove('critical');
        this.showToast('Waktu adu argumen 30 detik selesai!');
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
      case 'JOIN_REJECTED':
        window.realtimeEngine.clearActiveSession();
        window.realtimeEngine.destroy();
        this.topMeta.style.display = 'none';
        this.showScreen('welcome');
        this.showToast((payload && payload.reason) ? payload.reason : 'Tidak dapat bergabung ke room.');
        break;

      case 'SYNC_PLAYERS':
        if (payload && Array.isArray(payload.players)) {
          this.players = this.normalizePlayers(payload.players);
          this.updateLobbyUI();
        }
        break;

      case 'REJOIN':
        if (this.mode === 'HOST' && payload) {
          const safeName = sanitizeString(payload.name, 15);
          if (safeName) {
            window.realtimeEngine.sendDirectToClient(safeName, 'SYNC_REJOIN_STATE', this.buildRejoinState());
          }
        }
        break;

      case 'SYNC_REJOIN_STATE':
        if (payload) {
          if (payload.players) {
            this.players = this.normalizePlayers(payload.players);
            this.updateLobbyUI();
          }
          if (payload.inRound && payload.statementText) {
            this.setupLocalStatement(payload.statementIndex || 0, payload.statementText);
            if (payload.stances) {
              this.stances = this.normalizeStances(payload.stances);
              this.renderSpectrumPins(this.stances);
              if (Object.prototype.hasOwnProperty.call(this.stances, this.playerName)) {
                const ownVal = this.stances[this.playerName];
                this.myStance = ownVal;
                this.sliderRange.value = ownVal;
                this.updateSliderLabel(ownVal);
                this.btnLockStance.textContent = 'Perbarui Posisi';
              }
            }
            if (payload.debateLocked) {
              this.runDebateCountdown(payload.debateSecondsLeft || 0);
            }
          } else {
            this.showScreen('lobby');
          }
        }
        break;

      case 'SYNC_STATEMENT':
        if (payload && typeof payload.statementText === 'string') {
          this.stances = {};
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
          this.stances = this.normalizeStances(payload.stances);
          this.renderSpectrumPins(this.stances);
        }
        break;

      case 'START_DEBATE_TIMER':
        this.runDebateCountdown((payload && payload.seconds) || 30);
        break;

      case 'HOST_STOP_GAME':
        if (this.debateTimerInterval) {
          clearInterval(this.debateTimerInterval);
          this.debateTimerInterval = null;
        }
        this.debateEndsAt = 0;
        this.isDebateLocked = false;
        this.stances = {};
        this.showScreen('lobby');
        this.updateLobbyUI();
        this.showToast('Host menghentikan permainan. Kembali ke Lobby.');
        break;

      case 'HOST_RESTART_GAME':
        if (this.debateTimerInterval) {
          clearInterval(this.debateTimerInterval);
          this.debateTimerInterval = null;
        }
        this.debateEndsAt = 0;
        this.isDebateLocked = false;
        this.stances = {};
        this.showToast('Host me-restart permainan dari awal.');
        break;

      case 'HOST_TERMINATE_ROOM':
        if (this.debateTimerInterval) {
          clearInterval(this.debateTimerInterval);
          this.debateTimerInterval = null;
        }
        this.debateEndsAt = 0;
        localStorage.removeItem(RADAR_STORAGE_KEY);
        window.realtimeEngine.destroy();
        this.showToast('Room telah dibubarkan oleh Host.');
        setTimeout(() => {
          window.location.reload();
        }, 800);
        break;
    }
  }

  saveSession() {
    if (!this.mode || !this.roomCode) return;
    localStorage.setItem(RADAR_STORAGE_KEY, JSON.stringify({
      mode: this.mode,
      playerName: this.playerName,
      roomCode: this.roomCode,
      inRound: this.screens.radar ? this.screens.radar.classList.contains('active') : false,
      currentStatementIndex: this.currentStatementIndex,
      currentStatementText: this.currentStatementText,
      stances: this.stances,
      players: this.publicPlayers(),
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

      if (data.mode === 'CLIENT' && data.playerName && data.roomCode) {
        setTimeout(() => {
          this.handleJoinRoom();
        }, 300);
      } else if (data.mode === 'HOST' && data.playerName && data.roomCode) {
        setTimeout(() => {
          this.playerName = sanitizeString(data.playerName, 15);
          this.mode = 'HOST';
          this.roomCode = window.realtimeEngine.initHost(
            data.roomCode,
            (conn) => this.onPlayerConnected(conn),
            (d, conn) => this.onMessageReceived(d, conn),
            (conn) => this.onPlayerDisconnected(conn),
            'TAKE'
          );
          const restoredPlayers = this.normalizePlayers(data.players || []).map(p => ({
            ...p,
            isOffline: !p.isHost
          }));
          if (!restoredPlayers.some(p => p.isHost)) {
            restoredPlayers.unshift({ id: 'host', name: this.playerName, isHost: true, isOffline: false });
          }
          this.players = restoredPlayers;
          this.displayRoomCode.textContent = this.roomCode;
          this.lobbyCodeBadge.textContent = this.roomCode;
          this.topMeta.style.display = 'flex';
          if (this.hostMenuContainer) {
            this.hostMenuContainer.style.display = 'flex';
          }
          this.updateLobbyUI();
          if (data.inRound && data.currentStatementText) {
            this.setupLocalStatement(data.currentStatementIndex || 0, data.currentStatementText);
            this.stances = this.normalizeStances(data.stances || {});
            this.renderSpectrumPins(this.stances);
            if (Object.prototype.hasOwnProperty.call(this.stances, this.playerName)) {
              const ownVal = this.stances[this.playerName];
              this.myStance = ownVal;
              this.sliderRange.value = ownVal;
              this.updateSliderLabel(ownVal);
              this.btnLockStance.textContent = 'Perbarui Posisi';
            }
          } else {
            this.showScreen('lobby');
          }
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
