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
  'LEAVE',
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

class SabotaseGame {
  constructor() {
    this.mode = null; // 'HOST' | 'CLIENT'
    this.playerName = '';
    this.roomCode = '';
    this.players = []; // [{ id, name, isHost, isImpostor }]

    // Game state
    this.selectedCategory = 'random';
    this.currentCategoryName = '';
    this.secretWord = '';
    this.isImpostor = false;
    this.currentImpostorName = '';
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
    this.roomCode = window.realtimeEngine.initHost(
      null,
      (conn) => this.onPlayerConnected(conn),
      (data, conn) => this.onMessageReceived(data, conn),
      (conn) => this.onPlayerDisconnected(conn),
      'SABO'
    );

    this.players = [{ id: 'host', name: this.playerName, isHost: true, isImpostor: false }];
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
    let rawCode = this.joinCodeInput.value.replace(/[^A-Z0-9-]/gi, '').trim().toUpperCase().slice(0, 12);

    if (!name) {
      this.showToast('Silakan masukkan nama Anda.');
      return;
    }
    if (!rawCode) {
      this.showToast('Silakan masukkan Kode Room.');
      return;
    }

    const code = rawCode.includes('-') ? rawCode : `SABO-${rawCode}`;

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
        this.categoryGroup.style.display = 'none';
        this.showScreen('lobby');
      },
      (data) => this.onMessageReceived(data),
      (err) => {
        this.showScreen('welcome');
        this.topMeta.style.display = 'none';
      },
      'SABO'
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
        isHost: false,
        isImpostor: false
      });
    }

    this.updateLobbyUI();
    window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.players });
    this.saveSession();
  }

  onPlayerDisconnected(conn) {
    const discName = conn && conn.metadata ? conn.metadata.name : null;
    if (!discName) return;

    const idx = this.players.findIndex(p => p.name.toLowerCase() === discName.toLowerCase());
    if (idx >= 0 && !this.players[idx].isHost) {
      this.players.splice(idx, 1);
      this.showToast(`${discName} keluar dari room.`);
      this.updateLobbyUI();
      window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.players });

      // If disconnected during voting, adjust threshold
      if (this.screens.voting.classList.contains('active')) {
        delete this.votes[discName];
        const voteCount = Object.keys(this.votes).length;
        const totalCount = this.players.length;
        window.realtimeEngine.broadcast('VOTING_PROGRESS', {
          received: voteCount,
          total: totalCount
        });
        this.votingProgressText.textContent = `${voteCount} dari ${totalCount} pemain telah memilih`;
        if (voteCount >= totalCount && totalCount >= 2) {
          this.tallyVotesAndReveal();
        }
      }
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
    this.currentImpostorName = impostorPlayer.name;

    this.players.forEach((p, idx) => {
      p.isImpostor = (idx === impostorIdx);
    });

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
        window.realtimeEngine.sendDirectToClient(p.name, 'START_ROUND_SECRET', packet);
      }
    });

    this.showScreen('reveal');
  }

  setupLocalPlayerRole(payload) {
    this.currentCategoryName = payload.categoryName;
    if (this.mode !== 'HOST') {
      this.secretWord = payload.secretWord;
    }
    this.isImpostor = Boolean(payload.isImpostor);
    this.turnOrder = payload.turnOrder || [];
    this.votes = {};
    this.hasVoted = false;

    // Reset controls for round
    this.impostorGuessInput.value = '';
    this.btnSubmitImpostorGuess.disabled = false;
    this.finalWinnerBanner.style.display = 'none';

    // Setup Reveal Screen
    this.revealCategoryName.textContent = this.currentCategoryName;
    if (this.isImpostor) {
      this.revealWordText.textContent = '???';
      this.revealRoleBadge.className = 'role-badge badge-impostor';
      this.revealRoleBadge.textContent = 'KAMU IMPOSTOR / CHAMELEON';
      this.revealRoleDesc.textContent = `Kamu tidak tahu kata rahasianya! Kategori umumnya: "${this.currentCategoryName}". Simak petunjuk temanmu dan berbaurlah!`;
    } else {
      this.revealWordText.textContent = this.secretWord;
      this.revealRoleBadge.className = 'role-badge badge-crew';
      this.revealRoleBadge.textContent = 'WARGA CG (CREW)';
      this.revealRoleDesc.textContent = `Ini kata rahasia kalian. Beri petunjuk yang relevan tanpa membocorkannya langsung ke Impostor!`;
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
    let isTie = false;

    for (const [suspect, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count;
        mostVoted = suspect;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    }

    this.mostVotedPlayer = mostVoted;

    const isImpostorCaught = !isTie && (mostVoted.toLowerCase() === this.currentImpostorName.toLowerCase());

    const resultPayload = {
      mostVoted: isTie ? 'SERI (Tidak Ada yang Tereliminasi)' : mostVoted,
      isTie,
      isImpostorCaught,
      impostorName: this.currentImpostorName,
      secretWord: this.secretWord
    };

    // Broadcast results
    window.realtimeEngine.broadcast('SHOW_VOTING_RESULT', resultPayload);
    this.renderVotingResult(resultPayload);
  }

  renderVotingResult(resultPayload) {
    const { mostVoted, isTie, isImpostorCaught, impostorName, secretWord } = resultPayload;
    this.showScreen('result');
    this.resultPlayerName.textContent = mostVoted;

    this.impostorGuessInput.value = '';
    this.btnSubmitImpostorGuess.disabled = false;
    this.finalWinnerBanner.style.display = 'none';

    if (isTie) {
      this.resultRoleReveal.textContent = 'Hasil voting seri! Impostor berhasil berbaur.';
      this.resultRoleReveal.style.color = 'var(--text-muted)';
      this.impostorGuessBox.style.display = 'none';
      this.showFinalWinner(true, 'Impostor Menang!', `Hasil voting seri. Impostor sebenarnya adalah ${impostorName}. Kata rahasianya adalah "${secretWord}".`);
    } else if (isImpostorCaught) {
      if (this.playerName.toLowerCase() === impostorName.toLowerCase()) {
        this.resultRoleReveal.textContent = 'Kamu Tertangkap! Kamu adalah Impostor.';
        this.resultRoleReveal.style.color = 'var(--accent-rose)';
        this.impostorGuessBox.style.display = 'block';
      } else {
        this.resultRoleReveal.textContent = `${mostVoted} Tertangkap sebagai Impostor!`;
        this.resultRoleReveal.style.color = 'var(--accent-emerald)';
        this.impostorGuessBox.style.display = 'none';
        this.showFinalWinner(false, 'Impostor Tertangkap!', `Menunggu apakah ${impostorName} bisa menebak kata rahasia...`);
      }
    } else {
      // Innocent player eliminated!
      this.resultRoleReveal.textContent = `${mostVoted} adalah Warga Tak Bersalah!`;
      this.resultRoleReveal.style.color = 'var(--accent-rose)';
      this.impostorGuessBox.style.display = 'none';
      this.showFinalWinner(true, 'Impostor Menang!', `Warga salah menuduh ${mostVoted}! Impostor sebenarnya adalah ${impostorName}. Kata rahasianya adalah "${secretWord}".`);
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
        desc: `Impostor (${this.currentImpostorName}) berhasil menebak kata rahasia: "${this.secretWord}"!`
      });
      this.showFinalWinner(true, 'Impostor Menang Telak!', `Impostor (${this.currentImpostorName}) berhasil menebak kata rahasia: "${this.secretWord}"!`);
    } else {
      window.realtimeEngine.broadcast('SHOW_FINAL_WINNER', {
        impostorWon: false,
        title: 'Warga Menang!',
        desc: `Tebakan Impostor salah ("${guess}"). Kata rahasianya adalah "${this.secretWord}".`
      });
      this.showFinalWinner(false, 'Warga Menang!', `Tebakan Impostor salah ("${guess}"). Kata rahasianya adalah "${this.secretWord}".`);
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
            isHost: Boolean(p.isHost),
            isImpostor: Boolean(p.isImpostor)
          }));
          this.updateLobbyUI();
        }
        break;

      case 'REJOIN':
        if (this.mode === 'HOST') {
          const playerName = sanitizeString(payload ? payload.name : '', 15);
          if (!playerName) return;

          let currentScreen = 'lobby';
          if (this.screens.reveal.classList.contains('active')) currentScreen = 'reveal';
          else if (this.screens.clue.classList.contains('active')) currentScreen = 'clue';
          else if (this.screens.voting.classList.contains('active')) currentScreen = 'voting';
          else if (this.screens.result.classList.contains('active')) currentScreen = 'result';

          const isImp = this.currentImpostorName && this.currentImpostorName.toLowerCase() === playerName.toLowerCase();
          const rolePacket = {
            categoryName: this.currentCategoryName,
            secretWord: isImp ? null : this.secretWord,
            isImpostor: isImp,
            turnOrder: this.turnOrder
          };

          window.realtimeEngine.sendDirectToClient(playerName, 'SYNC_REJOIN_STATE', {
            screen: currentScreen,
            rolePacket,
            players: this.players,
            currentCategoryName: this.currentCategoryName,
            turnOrder: this.turnOrder,
            votingProgress: {
              received: Object.keys(this.votes).length,
              total: this.players.length
            }
          });
        }
        break;

      case 'SYNC_REJOIN_STATE':
        if (payload) {
          if (payload.players) {
            this.players = payload.players;
            this.updateLobbyUI();
          }
          if (payload.rolePacket && payload.rolePacket.categoryName) {
            this.setupLocalPlayerRole(payload.rolePacket);
            if (payload.screen === 'clue') this.showScreen('clue');
            else if (payload.screen === 'voting') {
              this.startVotingPhase();
              if (payload.votingProgress) {
                this.votingProgressText.textContent = `${payload.votingProgress.received} dari ${payload.votingProgress.total} pemain telah memilih`;
              }
            } else if (payload.screen === 'result') {
              this.showScreen('result');
            }
          }
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
          this.renderVotingResult(payload);
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
