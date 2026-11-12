/**
 * Sabotase Kata (CG Chameleon / Undercover) - Game Engine
 * Fully client-authoritative over P2P (PeerJS + BroadcastChannel).
 */

const SABO_STORAGE_KEY = 'SABOTASE_KATA_SESSION_V1';

const ALLOWED_CLIENT_ACTIONS = new Set([
  'JOIN',
  'REJOIN',
  'SUBMIT_VOTE',
  'SUBMIT_IMPOSTOR_GUESS',
  'PING'
]);

const ALLOWED_HOST_ACTIONS = new Set([
  'SYNC_PLAYERS',
  'START_ROUND_SECRET',
  'SYNC_TURN_ORDER',
  'START_VOTING_PHASE',
  'VOTING_PROGRESS',
  'SHOW_VOTING_RESULT',
  'SHOW_FINAL_WINNER',
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

class SabotaseGame {
  constructor() {
    this.mode = null; // 'HOST' | 'CLIENT'
    this.playerName = '';
    this.roomCode = '';
    this.players = []; // [{ id, name, isHost }]

    // Game state
    this.selectedCategory = 'random';
    this.currentCategoryName = '';
    this.secretWord = '';
    this.isImpostor = false;
    this.turnOrder = [];
    this.votes = {}; // { voterName: suspectName }
    this.mostVotedPlayer = null;
    this.hasVoted = false;

    this.initDOM();
    this.bindEvents();
    this.restoreSession();
  }

  initDOM() {
    this.screens = {
      welcome: document.getElementById('screenWelcome'),
      lobby: document.getElementById('screenLobby'),
      reveal: document.getElementById('screenReveal'),
      clue: document.getElementById('screenClue'),
      voting: document.getElementById('screenVoting'),
      result: document.getElementById('screenResult')
    };

    // Welcome Screen
    this.playerNameInput = document.getElementById('playerNameInput');
    this.joinCodeInput = document.getElementById('joinCodeInput');
    this.btnCreateRoom = document.getElementById('btnCreateRoom');
    this.btnJoinRoom = document.getElementById('btnJoinRoom');

    // Header Meta
    this.topMeta = document.getElementById('topMeta');
    this.displayRoomCode = document.getElementById('displayRoomCode');
    this.btnHostMenu = document.getElementById('btnHostMenu');

    // Lobby Screen
    this.lobbyCodeBadge = document.getElementById('lobbyCodeBadge');
    this.connectedCount = document.getElementById('connectedCount');
    this.playerListContainer = document.getElementById('playerListContainer');
    this.categorySelect = document.getElementById('categorySelect');
    this.categoryGroup = document.getElementById('categoryGroup');
    this.btnStartGame = document.getElementById('btnStartGame');
    this.lobbyNotice = document.getElementById('lobbyNotice');

    // Reveal Screen
    this.peekShield = document.getElementById('peekShield');
    this.revealCategoryName = document.getElementById('revealCategoryName');
    this.revealWordText = document.getElementById('revealWordText');
    this.revealRoleBadge = document.getElementById('revealRoleBadge');
    this.revealRoleDesc = document.getElementById('revealRoleDesc');
    this.btnDonePeeking = document.getElementById('btnDonePeeking');

    // Clue Turn Order Screen
    this.turnOrderContainer = document.getElementById('turnOrderContainer');
    this.clueRoundCategory = document.getElementById('clueRoundCategory');
    this.btnStartVoting = document.getElementById('btnStartVoting');
    this.clueNotice = document.getElementById('clueNotice');

    // Voting Screen
    this.votingGrid = document.getElementById('votingGrid');
    this.votingProgressText = document.getElementById('votingProgressText');
    this.btnSubmitVote = document.getElementById('btnSubmitVote');

    // Result Screen
    this.resultEliminatedBox = document.getElementById('resultEliminatedBox');
    this.resultPlayerName = document.getElementById('resultPlayerName');
    this.resultRoleReveal = document.getElementById('resultRoleReveal');
    this.impostorGuessBox = document.getElementById('impostorGuessBox');
    this.impostorGuessInput = document.getElementById('impostorGuessInput');
    this.btnSubmitImpostorGuess = document.getElementById('btnSubmitImpostorGuess');
    this.finalWinnerBanner = document.getElementById('finalWinnerBanner');
    this.finalWinnerTitle = document.getElementById('finalWinnerTitle');
    this.finalWinnerDesc = document.getElementById('finalWinnerDesc');
    this.btnNextRound = document.getElementById('btnNextRound');

    // Toast
    this.toastNotification = document.getElementById('toastNotification');
  }

  bindEvents() {
    // Welcome
    this.btnCreateRoom.addEventListener('click', () => this.handleCreateRoom());
    this.btnJoinRoom.addEventListener('click', () => this.handleJoinRoom());

    // Lobby
    this.btnStartGame.addEventListener('click', () => this.handleStartRound());

    // Reveal Screen Peek Hold
    const startPeek = () => { this.peekShield.classList.add('peeking'); };
    const endPeek = () => { this.peekShield.classList.remove('peeking'); };

    this.peekShield.addEventListener('mousedown', startPeek);
    this.peekShield.addEventListener('mouseup', endPeek);
    this.peekShield.addEventListener('touchstart', (e) => { e.preventDefault(); startPeek(); });
    this.peekShield.addEventListener('touchend', endPeek);

    this.btnDonePeeking.addEventListener('click', () => {
      this.showScreen('clue');
    });

    // Clue Phase -> Voting
    this.btnStartVoting.addEventListener('click', () => {
      if (this.mode !== 'HOST') return;
      window.realtimeEngine.broadcast('START_VOTING_PHASE', {});
      this.startVotingPhase();
    });

    // Impostor Guess
    this.btnSubmitImpostorGuess.addEventListener('click', () => {
      const guess = sanitizeString(this.impostorGuessInput.value, 40);
      if (!guess) {
        this.showToast('Masukkan tebakan katamu terlebih dahulu.');
        return;
      }
      if (this.mode === 'CLIENT') {
        window.realtimeEngine.sendToHost('SUBMIT_IMPOSTOR_GUESS', { guess });
      } else if (this.mode === 'HOST') {
        this.evaluateImpostorGuess(guess);
      }
      this.btnSubmitImpostorGuess.disabled = true;
    });

    // Next Round
    this.btnNextRound.addEventListener('click', () => {
      if (this.mode === 'HOST') {
        this.handleStartRound();
      }
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

  // --- HOST & CLIENT INITIALIZATION ---

  handleCreateRoom() {
    const name = sanitizeString(this.playerNameInput.value, 15);
    if (!name) {
      this.showToast('Silakan masukkan nama Anda.');
      return;
    }

    this.playerName = name;
    this.mode = 'HOST';
    this.roomCode = window.realtimeEngine.initHost(null,
      (conn) => this.onPlayerConnected(conn),
      (data, conn) => this.onMessageReceived(data, conn)
    );

    this.players = [{ id: 'host', name: this.playerName, isHost: true }];
    this.displayRoomCode.textContent = this.roomCode;
    this.lobbyCodeBadge.textContent = this.roomCode;
    this.topMeta.style.display = 'flex';
    this.categoryGroup.style.display = 'block';

    this.updateLobbyUI();
    this.showScreen('lobby');
    this.saveSession();
  }

  handleJoinRoom() {
    const name = sanitizeString(this.playerNameInput.value, 15);
    const code = this.joinCodeInput.value.replace(/[^A-Z0-9-]/gi, '').trim().toUpperCase().slice(0, 12);

    if (!name) {
      this.showToast('Silakan masukkan nama Anda.');
      return;
    }
    if (!code) {
      this.showToast('Silakan masukkan Kode Room.');
      return;
    }

    this.playerName = name;
    this.roomCode = code;
    this.mode = 'CLIENT';

    window.realtimeEngine.initClient(code, name,
      () => {
        this.displayRoomCode.textContent = this.roomCode;
        this.lobbyCodeBadge.textContent = this.roomCode;
        this.topMeta.style.display = 'flex';
        this.categoryGroup.style.display = 'none';
        this.showScreen('lobby');
      },
      (data) => this.onMessageReceived(data)
    );

    this.saveSession();
  }

  onPlayerConnected(conn) {
    const rawName = conn.metadata ? conn.metadata.name : `Pemain ${this.players.length + 1}`;
    const safeName = sanitizeString(rawName, 15) || `Pemain ${this.players.length + 1}`;

    const existingIdx = this.players.findIndex(p => p.name.toLowerCase() === safeName.toLowerCase());
    if (existingIdx >= 0) {
      this.players[existingIdx].id = conn.peer;
    } else if (this.players.length < 12) {
      this.players.push({
        id: conn.peer,
        name: safeName,
        isHost: false
      });
    }

    this.updateLobbyUI();
    window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.players });
    this.saveSession();
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
      const canStart = this.players.length >= 3;
      this.btnStartGame.disabled = !canStart;
      this.btnStartGame.textContent = canStart ? 'Mulai Babak Sabotase' : 'Butuh Minimal 3 Pemain';
      this.lobbyNotice.style.display = 'none';
    } else {
      this.btnStartGame.style.display = 'none';
      this.lobbyNotice.style.display = 'block';
    }
  }

  // --- ROUND LOGIC (HOST) ---

  handleStartRound() {
    if (this.mode !== 'HOST') return;
    if (this.players.length < 3) {
      this.showToast('Minimal 3 pemain untuk memulai game sabotase.');
      return;
    }

    // 1. Pick category
    let catKey = this.categorySelect ? this.categorySelect.value : 'random';
    const availableCategories = Object.keys(SABOTASE_WORDS);

    if (catKey === 'random' || !SABOTASE_WORDS[catKey]) {
      catKey = availableCategories[Math.floor(Math.random() * availableCategories.length)];
    }

    const catData = SABOTASE_WORDS[catKey];
    this.currentCategoryName = catData.categoryName;

    // 2. Pick secret word
    const wordList = catData.words;
    this.secretWord = wordList[Math.floor(Math.random() * wordList.length)];

    // 3. Pick random impostor
    const impostorIdx = Math.floor(Math.random() * this.players.length);
    const impostorPlayer = this.players[impostorIdx];

    // 4. Randomize turn order
    this.turnOrder = [...this.players].sort(() => Math.random() - 0.5).map(p => p.name);

    // 5. Send individualized packets (Impostor NEVER gets secretWord!)
    this.players.forEach(p => {
      const isImp = p.name.toLowerCase() === impostorPlayer.name.toLowerCase();
      const packet = {
        categoryName: this.currentCategoryName,
        secretWord: isImp ? null : this.secretWord,
        isImpostor: isImp,
        turnOrder: this.turnOrder
      };

      if (p.isHost) {
        this.setupLocalPlayerRole(packet);
      } else {
        // Send directly or via BroadcastChannel mock
        if (window.realtimeEngine.broadcastChannel) {
          window.realtimeEngine.broadcastChannel.postMessage({
            target: p.name,
            type: 'HOST_DIRECT_TO_CLIENT',
            data: { action: 'START_ROUND_SECRET', payload: packet }
          });
        }
        const conn = window.realtimeEngine.connections.find(c => c.metadata && c.metadata.name === p.name);
        if (conn && conn.open) {
          conn.send({ action: 'START_ROUND_SECRET', payload: packet });
        }
      }
    });

    this.showScreen('reveal');
  }

  setupLocalPlayerRole(payload) {
    this.currentCategoryName = payload.categoryName;
    this.secretWord = payload.secretWord;
    this.isImpostor = Boolean(payload.isImpostor);
    this.turnOrder = payload.turnOrder || [];
    this.votes = {};
    this.hasVoted = false;

    // Setup Reveal Screen
    this.revealCategoryName.textContent = this.currentCategoryName;
    if (this.isImpostor) {
      this.revealWordText.textContent = '???';
      this.revealRoleBadge.className = 'role-badge impostor';
      this.revealRoleBadge.textContent = 'KAMU IMPOSTOR';
      this.revealRoleDesc.textContent = 'Kamu TIDAK tahu kata rahasia! Dengarkan petunjuk orang lain dan berpura-puralah tahu.';
    } else {
      this.revealWordText.textContent = this.secretWord;
      this.revealRoleBadge.className = 'role-badge citizen';
      this.revealRoleBadge.textContent = 'KAMU WARGA BIASA';
      this.revealRoleDesc.textContent = 'Beri 1 kata petunjuk yang relevan tanpa membuat Impostor menebak kata rahasia ini.';
    }

    // Setup Clue Screen
    this.clueRoundCategory.textContent = this.currentCategoryName;
    this.turnOrderContainer.innerHTML = '';
    this.turnOrder.forEach((name, idx) => {
      const item = document.createElement('div');
      item.className = 'turn-item';
      item.innerHTML = `<span class="turn-num">${idx + 1}</span> <span>${sanitizeString(name, 15)}</span>`;
      this.turnOrderContainer.appendChild(item);
    });

    if (this.mode === 'HOST') {
      this.btnStartVoting.style.display = 'block';
      this.clueNotice.style.display = 'none';
    } else {
      this.btnStartVoting.style.display = 'none';
      this.clueNotice.style.display = 'block';
    }

    this.showScreen('reveal');
  }

  // --- VOTING PHASE ---

  startVotingPhase() {
    this.showScreen('voting');
    this.hasVoted = false;
    this.votingGrid.innerHTML = '';
    this.votingProgressText.textContent = `0 dari ${this.players.length} pemain telah memilih`;

    // Render voting buttons
    this.players.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'vote-btn';
      btn.textContent = p.name;
      btn.addEventListener('click', () => {
        if (this.hasVoted) return;
        document.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        this.hasVoted = true;
        this.showToast(`Kamu mencurigai ${p.name}!`);

        if (this.mode === 'CLIENT') {
          window.realtimeEngine.sendToHost('SUBMIT_VOTE', {
            voterName: this.playerName,
            suspectName: p.name
          });
        } else if (this.mode === 'HOST') {
          this.recordVote(this.playerName, p.name);
        }
      });
      this.votingGrid.appendChild(btn);
    });
  }

  recordVote(voterName, suspectName) {
    if (this.mode !== 'HOST') return;
    this.votes[voterName] = suspectName;

    const voteCount = Object.keys(this.votes).length;
    const totalCount = this.players.length;

    window.realtimeEngine.broadcast('VOTING_PROGRESS', {
      received: voteCount,
      total: totalCount
    });
    this.votingProgressText.textContent = `${voteCount} dari ${totalCount} pemain telah memilih`;

    if (voteCount >= totalCount) {
      this.tallyVotesAndReveal();
    }
  }

  tallyVotesAndReveal() {
    if (this.mode !== 'HOST') return;

    // Count votes per suspect
    const tally = {};
    Object.values(this.votes).forEach(suspect => {
      tally[suspect] = (tally[suspect] || 0) + 1;
    });

    let maxVotes = 0;
    let mostVoted = null;
    for (const [suspect, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count;
        mostVoted = suspect;
      }
    }

    this.mostVotedPlayer = mostVoted;

    // Broadcast results
    window.realtimeEngine.broadcast('SHOW_VOTING_RESULT', {
      mostVoted: mostVoted,
      votesTally: tally,
      secretWord: this.secretWord
    });

    this.renderVotingResult(mostVoted, this.secretWord);
  }

  renderVotingResult(mostVoted, secretWord) {
    this.showScreen('result');
    this.resultPlayerName.textContent = mostVoted;

    // Check if the eliminated person is the impostor
    const wasImpostor = (this.isImpostor && this.playerName === mostVoted) || 
      (this.mode === 'HOST' && this.players.find(p => p.name === mostVoted)?.isImpostor);

    // For Host / authoritative evaluation:
    if (this.isImpostor && this.playerName === mostVoted) {
      this.resultRoleReveal.textContent = 'Kamu Tertangkap! Kamu adalah Impostor.';
      this.resultRoleReveal.style.color = 'var(--accent-rose)';
      // Give Impostor 1 last chance to guess secret word!
      this.impostorGuessBox.style.display = 'block';
    } else if (this.isImpostor) {
      this.resultRoleReveal.textContent = 'Impostor Berhasil Lolos!';
      this.resultRoleReveal.style.color = 'var(--accent-rose)';
      this.showFinalWinner(false, 'Impostor Menang!', `${mostVoted} yang dituduh adalah warga tak bersalah.`);
    } else {
      this.resultRoleReveal.textContent = `Tersangka utama tereliminasi.`;
    }

    if (this.mode === 'HOST') {
      this.btnNextRound.style.display = 'block';
    } else {
      this.btnNextRound.style.display = 'none';
    }
  }

  evaluateImpostorGuess(guess) {
    if (this.mode !== 'HOST') return;

    const isCorrect = guess.toLowerCase().trim() === this.secretWord.toLowerCase().trim();
    if (isCorrect) {
      window.realtimeEngine.broadcast('SHOW_FINAL_WINNER', {
        impostorWon: true,
        title: 'Impostor Menang Telak!',
        desc: `Impostor berhasil menebak kata rahasia: "${this.secretWord}"!`
      });
      this.showFinalWinner(true, 'Impostor Menang Telak!', `Impostor berhasil menebak kata rahasia: "${this.secretWord}"!`);
    } else {
      window.realtimeEngine.broadcast('SHOW_FINAL_WINNER', {
        impostorWon: false,
        title: 'Warga Menang!',
        desc: `Tebakan Impostor salah ("${guess}"). Kata rahasianya adalah "${this.secretWord}".`
      });
      this.showFinalWinner(false, 'Warga Menang!', `Tebakan Impostor salah. Kata rahasianya adalah "${this.secretWord}".`);
    }
  }

  showFinalWinner(impostorWon, title, desc) {
    this.finalWinnerBanner.style.display = 'block';
    this.impostorGuessBox.style.display = 'none';
    this.finalWinnerTitle.textContent = title;
    this.finalWinnerTitle.style.color = impostorWon ? 'var(--accent-rose)' : 'var(--accent-emerald)';
    this.finalWinnerDesc.textContent = desc;
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

      case 'START_ROUND_SECRET':
        this.setupLocalPlayerRole(payload);
        break;

      case 'START_VOTING_PHASE':
        this.startVotingPhase();
        break;

      case 'SUBMIT_VOTE':
        if (this.mode === 'HOST' && payload) {
          const voter = sanitizeString(payload.voterName, 15);
          const suspect = sanitizeString(payload.suspectName, 15);
          if (voter && suspect) {
            this.recordVote(voter, suspect);
          }
        }
        break;

      case 'VOTING_PROGRESS':
        if (payload && typeof payload.received === 'number') {
          this.votingProgressText.textContent = `${payload.received} dari ${payload.total} pemain telah memilih`;
        }
        break;

      case 'SHOW_VOTING_RESULT':
        if (payload) {
          this.renderVotingResult(payload.mostVoted, payload.secretWord);
        }
        break;

      case 'SUBMIT_IMPOSTOR_GUESS':
        if (this.mode === 'HOST' && payload) {
          this.evaluateImpostorGuess(sanitizeString(payload.guess, 40));
        }
        break;

      case 'SHOW_FINAL_WINNER':
        if (payload) {
          this.showFinalWinner(payload.impostorWon, payload.title, payload.desc);
        }
        break;
    }
  }

  saveSession() {
    if (!this.mode || !this.roomCode) return;
    localStorage.setItem(SABO_STORAGE_KEY, JSON.stringify({
      mode: this.mode,
      playerName: this.playerName,
      roomCode: this.roomCode,
      timestamp: Date.now()
    }));
  }

  restoreSession() {
    const raw = localStorage.getItem(SABO_STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > 2 * 60 * 60 * 1000) {
        localStorage.removeItem(SABO_STORAGE_KEY);
        return;
      }
      this.playerNameInput.value = data.playerName || '';
      this.joinCodeInput.value = data.roomCode || '';
    } catch (e) {
      localStorage.removeItem(SABO_STORAGE_KEY);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.sabotaseGame = new SabotaseGame();
});
