/**
 * The Anonymous Box — Game Engine & UI State Manager
 * Features: Indonesian Questions & LocalStorage Session Persistence across Page Refresh.
 */

// Questions for the 4 Rounds in Indonesian
const GAME_ROUNDS = [
  {
    id: 1,
    title: "Ronde 1 — Hal Random",
    badge: "RONDE 1 DARI 4",
    question: "Apa hal unik/aneh tentang dirimu atau bakat unik yang belum banyak orang di sini ketahui?"
  },
  {
    id: 2,
    title: "Ronde 2 — Kejutan",
    badge: "RONDE 2 DARI 4",
    question: "Apa satu hal yang awalnya kamu pikir TIDAK AKAN kamu lakukan tahun ini, tapi ternyata malah kamu lakukan?"
  },
  {
    id: 3,
    title: "Ronde 3 — Saat Ini",
    badge: "RONDE 3 DARI 4",
    question: "Apa satu hal dalam hidupmu saat ini yang paling kamu syukuri?"
  },
  {
    id: 4,
    title: "Ronde 4 — Pertanyaan yang Tak Pernah Ditanyakan",
    badge: "RONDE 4 DARI 4",
    question: "Tuliskan sesuatu yang kamu apresiasi dari seseorang di ruangan ini (atau hal yang kamu harap orang pahami tentangmu)."
  }
];

const STORAGE_KEY = 'ANONYMOUS_BOX_SESSION_V1';

class AnonymousBoxGame {
  constructor() {
    this.mode = null; // 'HOST' or 'CLIENT'
    this.playerName = '';
    this.roomCode = '';
    this.players = []; 
    this.currentRoundIndex = 0;
    this.submissions = {};
    this.currentCardIndex = 0;
    this.activeScreenKey = 'welcome';
    
    // Session Timer (10 Minutes)
    this.timerSeconds = 600;
    this.timerInterval = null;

    this.initDOMReferences();
    this.bindEvents();

    // Check for existing session to restore on refresh
    this.restoreSessionState();
  }

  initDOMReferences() {
    // Screens
    this.screens = {
      welcome: document.getElementById('screenWelcome'),
      lobby: document.getElementById('screenLobby'),
      submit: document.getElementById('screenSubmit'),
      waiting: document.getElementById('screenWaiting'),
      reveal: document.getElementById('screenReveal'),
      ending: document.getElementById('screenEnding')
    };

    // Inputs & Buttons
    this.playerNameInput = document.getElementById('playerNameInput');
    this.joinCodeInput = document.getElementById('joinCodeInput');
    this.btnCreateRoom = document.getElementById('btnCreateRoom');
    this.btnJoinRoom = document.getElementById('btnJoinRoom');
    
    // Top bar & Host Menu
    this.topBar = document.querySelector('.top-bar');
    this.topMeta = document.getElementById('topMeta');
    this.displayRoomCode = document.getElementById('displayRoomCode');
    this.sessionTimer = document.getElementById('sessionTimer');
    this.btnHostMenu = document.getElementById('btnHostMenu');

    // Host Modal Sheet
    this.hostModalSheet = document.getElementById('hostModalSheet');
    this.btnHostRestartGame = document.getElementById('btnHostRestartGame');
    this.btnHostEndRoom = document.getElementById('btnHostEndRoom');
    this.btnHostCloseModal = document.getElementById('btnHostCloseModal');

    // Lobby
    this.lobbyCodeText = document.getElementById('lobbyCodeText');
    this.btnCopyCode = document.getElementById('btnCopyCode');
    this.connectedCount = document.getElementById('connectedCount');
    this.playerListContainer = document.getElementById('playerListContainer');
    this.btnStartGame = document.getElementById('btnStartGame');
    this.hostNotice = document.getElementById('hostNotice');

    // Submit
    this.submitRoundBadge = document.getElementById('submitRoundBadge');
    this.submitRoundTitle = document.getElementById('submitRoundTitle');
    this.submitQuestionText = document.getElementById('submitQuestionText');
    this.answerInput = document.getElementById('answerInput');
    this.charCount = document.getElementById('charCount');
    this.btnSubmitAnswer = document.getElementById('btnSubmitAnswer');

    // Waiting
    this.submissionProgressFill = document.getElementById('submissionProgressFill');
    this.submittedCount = document.getElementById('submittedCount');
    this.totalPlayersCount = document.getElementById('totalPlayersCount');

    // Reveal
    this.revealRoundIndicator = document.getElementById('revealRoundIndicator');
    this.authorStatusPill = document.getElementById('authorStatusPill');
    this.revealContentText = document.getElementById('revealContentText');
    this.countRelate = document.getElementById('countRelate');
    this.countUnderstand = document.getElementById('countUnderstand');
    this.countMore = document.getElementById('countMore');
    
    // Story & Trust controls
    this.storyChoiceBox = document.getElementById('storyChoiceBox');
    this.btnTellStory = document.getElementById('btnTellStory');
    this.btnKeepStoryAnon = document.getElementById('btnKeepStoryAnon');
    
    this.trustControls = document.getElementById('trustControls');
    this.btnKeepAnon = document.getElementById('btnKeepAnon');
    this.btnGuessWho = document.getElementById('btnGuessWho');
    this.btnRevealMe = document.getElementById('btnRevealMe');
    
    this.guessVotingBox = document.getElementById('guessVotingBox');
    this.guessChipsGrid = document.getElementById('guessChipsGrid');
    this.guessResult = document.getElementById('guessResult');
    
    this.btnNextCard = document.getElementById('btnNextCard');

    // Ending
    this.finalPlayerCount = document.getElementById('finalPlayerCount');
    this.btnPlayAgain = document.getElementById('btnPlayAgain');
  }

  bindEvents() {
    // Mode Creation & Joining
    this.btnCreateRoom.addEventListener('click', () => this.handleCreateRoom());
    this.btnJoinRoom.addEventListener('click', () => this.handleJoinRoom());

    // Host Menu Modal
    this.btnHostMenu.addEventListener('click', () => {
      if (this.hostModalSheet) this.hostModalSheet.style.display = 'flex';
    });
    this.btnHostCloseModal.addEventListener('click', () => {
      if (this.hostModalSheet) this.hostModalSheet.style.display = 'none';
    });
    this.btnHostRestartGame.addEventListener('click', () => this.handleHostRestartGame());
    this.btnHostEndRoom.addEventListener('click', () => this.handleHostEndRoom());

    // Copy Code
    this.btnCopyCode.addEventListener('click', () => {
      navigator.clipboard.writeText(this.roomCode);
      this.showToast(`Kode room ${this.roomCode} berhasil disalin!`);
    });

    // Start Game from Lobby
    this.btnStartGame.addEventListener('click', () => this.handleStartGame());

    // Text Area Char Count
    this.answerInput.addEventListener('input', () => {
      this.charCount.textContent = this.answerInput.value.length;
    });

    // Submit Answer
    this.btnSubmitAnswer.addEventListener('click', () => this.handleSubmitAnswer());

    // Reactions
    document.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-reaction');
        this.handleReaction(type);
      });
    });

    // Trust Controls
    this.btnKeepAnon.addEventListener('click', () => this.handleKeepAnon());
    this.btnGuessWho.addEventListener('click', () => this.handleGuessWho());
    this.btnRevealMe.addEventListener('click', () => this.handleRevealAuthor());

    // Story Choices (Round 3)
    this.btnTellStory.addEventListener('click', () => this.handleStoryChoice(true));
    this.btnKeepStoryAnon.addEventListener('click', () => this.handleStoryChoice(false));

    // Next Card / Next Round
    this.btnNextCard.addEventListener('click', () => this.handleNextCard());

    // Play Again / Reset
    this.btnPlayAgain.addEventListener('click', () => this.clearSessionAndReload());
  }

  showScreen(screenKey) {
    this.activeScreenKey = screenKey;
    Object.values(this.screens).forEach(s => s.classList.remove('active'));
    if (this.screens[screenKey]) {
      this.screens[screenKey].classList.add('active');
    }

    if (this.topBar) {
      if (screenKey === 'welcome') {
        this.topBar.classList.add('is-home');
        if (this.topMeta) this.topMeta.style.display = 'none';
      } else {
        this.topBar.classList.remove('is-home');
      }
    }

    this.saveSessionState();
  }

  // --- SESSION PERSISTENCE (LOCALSTORAGE) ---

  saveSessionState() {
    if (!this.mode || !this.roomCode) return;
    const sessionData = {
      mode: this.mode,
      playerName: this.playerName,
      roomCode: this.roomCode,
      players: this.players,
      currentRoundIndex: this.currentRoundIndex,
      submissions: this.submissions,
      currentCardIndex: this.currentCardIndex,
      activeScreenKey: this.activeScreenKey,
      timerSeconds: this.timerSeconds,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
  }

  restoreSessionState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      // Expire session if older than 2 hours
      if (Date.now() - data.timestamp > 2 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      this.mode = data.mode;
      this.playerName = data.playerName;
      this.roomCode = data.roomCode;
      this.players = data.players || [];
      this.currentRoundIndex = data.currentRoundIndex || 0;
      this.submissions = data.submissions || {};
      this.currentCardIndex = data.currentCardIndex || 0;
      this.timerSeconds = data.timerSeconds || 600;

      // Re-initialize peer connection
      if (this.mode === 'HOST') {
        window.realtimeEngine.initHost(this.roomCode,
          (conn) => this.onPlayerConnected(conn),
          (msg, conn) => this.onMessageReceived(msg, conn)
        );
      } else if (this.mode === 'CLIENT') {
        window.realtimeEngine.initClient(this.roomCode, this.playerName,
          () => console.log('[Session] Reconnected to room'),
          (msg) => this.onMessageReceived(msg)
        );
      }

      this.lobbyCodeText.textContent = this.roomCode;
      this.displayRoomCode.textContent = this.roomCode;
      this.updateLobbyUI();

      // Resume screen & state
      if (data.activeScreenKey && data.activeScreenKey !== 'welcome') {
        if (data.activeScreenKey === 'reveal') {
          this.renderCurrentRevealCard();
        } else if (data.activeScreenKey === 'submit') {
          this.startRound(this.currentRoundIndex);
        }
        
        if (['submit', 'waiting', 'reveal'].includes(data.activeScreenKey)) {
          this.startSessionTimer();
        }
        
        this.showScreen(data.activeScreenKey);
      }
    } catch (e) {
      console.error('[Session Restore Error]', e);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  clearSessionAndReload() {
    localStorage.removeItem(STORAGE_KEY);
    if (window.realtimeEngine) {
      if (window.realtimeEngine.peer) {
        try { window.realtimeEngine.peer.destroy(); } catch (e) {}
      }
      if (window.realtimeEngine.broadcastChannel) {
        try { window.realtimeEngine.broadcastChannel.close(); } catch (e) {}
      }
    }
    window.location.href = window.location.origin + window.location.pathname;
  }

  startSessionTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.topMeta.style.display = 'flex';
    this.displayRoomCode.textContent = this.roomCode;

    if (this.mode === 'HOST' && this.btnHostMenu) {
      this.btnHostMenu.style.display = 'inline-flex';
    }

    this.timerInterval = setInterval(() => {
      this.timerSeconds--;
      
      const absSecs = Math.abs(this.timerSeconds);
      const mins = Math.floor(absSecs / 60).toString().padStart(2, '0');
      const secs = (absSecs % 60).toString().padStart(2, '0');
      const prefix = this.timerSeconds < 0 ? '+' : '';
      this.sessionTimer.textContent = `${prefix}${mins}:${secs}`;
      
      if (this.timerSeconds <= 0) {
        this.sessionTimer.classList.add('timer-expired');
      } else {
        this.sessionTimer.classList.remove('timer-expired');
      }

      if (Math.abs(this.timerSeconds) % 10 === 0) {
        this.saveSessionState();
      }
    }, 1000);
  }

  handleHostRestartGame() {
    if (this.mode !== 'HOST') return;
    if (this.hostModalSheet) this.hostModalSheet.style.display = 'none';

    this.currentRoundIndex = 0;
    this.submissions = {};
    this.currentCardIndex = 0;

    window.realtimeEngine.broadcast('HOST_RESTART_GAME', {});
    this.startRound(0);
    this.showToast('Sesi game di-restart ke Ronde 1!');
  }

  handleHostEndRoom() {
    if (this.mode !== 'HOST') return;
    if (this.hostModalSheet) this.hostModalSheet.style.display = 'none';

    window.realtimeEngine.broadcast('HOST_END_ROOM', {});
    this.showToast('Sesi room telah diakhiri oleh Host.');
    setTimeout(() => this.clearSessionAndReload(), 1000);
  }

  showToast(message, duration = 3000) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // --- ROOM SETUP LOGIC ---

  handleCreateRoom() {
    const name = this.playerNameInput.value.trim();
    if (!name) {
      this.showToast('Silakan masukkan nama Anda terlebih dahulu.');
      return;
    }
    this.playerName = name;
    this.mode = 'HOST';

    this.roomCode = window.realtimeEngine.initHost(null, 
      (conn) => this.onPlayerConnected(conn),
      (data, conn) => this.onMessageReceived(data, conn)
    );

    this.players = [{ id: 'host', name: this.playerName, isHost: true }];
    this.lobbyCodeText.textContent = this.roomCode;
    this.displayRoomCode.textContent = this.roomCode;
    this.updateLobbyUI();
    this.showScreen('lobby');
  }

  handleJoinRoom() {
    const name = this.playerNameInput.value.trim();
    const code = this.joinCodeInput.value.trim().toUpperCase();

    if (!name) {
      this.showToast('Silakan masukkan nama Anda terlebih dahulu.');
      return;
    }
    if (!code) {
      this.showToast('Silakan masukkan Kode Room (contoh: BOX-8492).');
      return;
    }

    this.playerName = name;
    this.roomCode = code;
    this.mode = 'CLIENT';

    window.realtimeEngine.initClient(code, name, 
      () => {
        this.lobbyCodeText.textContent = this.roomCode;
        this.displayRoomCode.textContent = this.roomCode;
        this.showScreen('lobby');
      },
      (data) => this.onMessageReceived(data)
    );
  }

  onPlayerConnected(conn) {
    const name = conn.metadata ? conn.metadata.name : `Pemain ${this.players.length + 1}`;
    
    const existingIndex = this.players.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    if (existingIndex >= 0) {
      this.players[existingIndex].id = conn.peer;
    } else if (this.players.length < 12) {
      this.players.push({
        id: conn.peer,
        name: name,
        isHost: false
      });
    }

    this.updateLobbyUI();
    window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.players });
    this.saveSessionState();
  }

  updateLobbyUI() {
    this.connectedCount.textContent = this.players.length;
    this.playerListContainer.innerHTML = '';

    this.players.forEach(p => {
      const chip = document.createElement('div');
      chip.className = `player-chip ${p.isHost ? 'is-host' : ''}`;
      chip.innerHTML = `${p.isHost ? '<span class="host-tag">HOST</span>' : ''} ${p.name}`;
      this.playerListContainer.appendChild(chip);
    });

    if (this.mode === 'HOST') {
      if (this.players.length >= 2) {
        this.btnStartGame.disabled = false;
        this.btnStartGame.textContent = 'Mulai Game Icebreaker';
      } else {
        this.btnStartGame.disabled = true;
        this.btnStartGame.textContent = 'Butuh minimal 2 pemain';
      }
      this.hostNotice.style.display = 'none';
    } else {
      this.btnStartGame.style.display = 'none';
      this.hostNotice.style.display = 'block';
    }
  }

  // --- GAME FLOW LOGIC ---

  handleStartGame() {
    if (this.mode === 'HOST') {
      window.realtimeEngine.broadcast('START_ROUND', { roundIndex: 0 });
      this.startRound(0);
    }
  }

  startRound(roundIndex) {
    this.currentRoundIndex = roundIndex;
    this.currentCardIndex = 0; // Reset card index for new round
    this.hasSubmittedThisRound = false; // Reset submission flag for new round
    const roundConfig = GAME_ROUNDS[roundIndex];

    if (roundIndex === 0 && !this.timerInterval) {
      this.startSessionTimer();
    }

    this.submitRoundBadge.textContent = roundConfig.badge;
    this.submitRoundTitle.textContent = roundConfig.title;
    this.submitQuestionText.textContent = roundConfig.question;
    this.answerInput.value = '';
    this.answerInput.placeholder = '';
    this.charCount.textContent = '0';

    this.showScreen('submit');
  }

  handleSubmitAnswer() {
    const text = this.answerInput.value.trim();
    if (!text) {
      this.showToast('Silakan tulis jawaban sebelum mengirim.');
      return;
    }

    this.hasSubmittedThisRound = true;

    const payload = {
      roundIndex: this.currentRoundIndex,
      text: text,
      authorName: this.playerName
    };

    if (this.mode === 'CLIENT') {
      window.realtimeEngine.sendToHost('SUBMIT_ANSWER', payload);
      this.showWaitingScreen(1, this.players.length);
    } else if (this.mode === 'HOST') {
      this.recordSubmission(payload, 'host');
    }
  }

  recordSubmission(payload, senderId) {
    const roundIdx = payload.roundIndex;
    if (!this.submissions[roundIdx]) {
      this.submissions[roundIdx] = [];
    }

    // Deduplicate by authorName so duplicate packets (BroadcastChannel + PeerJS) never double count!
    this.submissions[roundIdx] = this.submissions[roundIdx].filter(
      s => s.authorName.toLowerCase() !== payload.authorName.toLowerCase()
    );

    this.submissions[roundIdx].push({
      id: `sub-${Date.now()}-${Math.random()}`,
      senderId: senderId,
      text: payload.text,
      authorName: payload.authorName,
      reactions: { relate: 0, understand: 0, moredetails: 0 },
      revealed: false
    });

    const receivedCount = this.submissions[roundIdx].length;
    const totalCount = this.players.length;

    window.realtimeEngine.broadcast('PROGRESS_UPDATE', {
      received: receivedCount,
      total: totalCount
    });

    this.showWaitingScreen(receivedCount, totalCount);

    if (receivedCount >= totalCount) {
      for (let i = this.submissions[roundIdx].length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.submissions[roundIdx][i], this.submissions[roundIdx][j]] = [this.submissions[roundIdx][j], this.submissions[roundIdx][i]];
      }

      window.realtimeEngine.broadcast('START_REVEAL_PHASE', {
        roundIndex: roundIdx,
        cards: this.submissions[roundIdx]
      });

      this.startRevealPhase();
    }
    this.saveSessionState();
  }

  showWaitingScreen(received, total) {
    this.submittedCount.textContent = received;
    this.totalPlayersCount.textContent = total;
    const pct = Math.round((received / total) * 100);
    this.submissionProgressFill.style.width = `${pct}%`;
    
    // Switch to waiting screen ONLY if this player has submitted their answer!
    if (this.hasSubmittedThisRound) {
      this.showScreen('waiting');
    }
  }

  // --- REVEAL PHASE ---

  startRevealPhase() {
    this.currentCardIndex = 0;
    this.renderCurrentRevealCard();
    this.showScreen('reveal');
  }

  renderCurrentRevealCard() {
    const cardList = this.submissions[this.currentRoundIndex] || [];
    if (this.currentCardIndex >= cardList.length) {
      if (this.currentRoundIndex < GAME_ROUNDS.length - 1) {
        if (this.mode === 'HOST') {
          this.currentRoundIndex++;
          window.realtimeEngine.broadcast('START_ROUND', { roundIndex: this.currentRoundIndex });
          this.startRound(this.currentRoundIndex);
        }
      } else {
        if (this.mode === 'HOST') {
          window.realtimeEngine.broadcast('SHOW_ENDING', {});
        }
        this.showEndingScreen();
      }
      return;
    }

    const currentCard = cardList[this.currentCardIndex];
    this.revealRoundIndicator.textContent = `RONDE ${this.currentRoundIndex + 1} • KARTU ${this.currentCardIndex + 1} DARI ${cardList.length}`;
    this.revealContentText.textContent = currentCard.text;
    
    if (currentCard.revealed) {
      this.authorStatusPill.textContent = `PENULIS: ${currentCard.authorName.toUpperCase()}`;
      this.authorStatusPill.style.color = '#FFFFFF';
      this.authorStatusPill.style.background = 'var(--red-primary)';
    } else {
      this.authorStatusPill.textContent = `ENTRY ANONIM #${this.currentCardIndex + 1}`;
      this.authorStatusPill.style.color = 'var(--red-primary)';
      this.authorStatusPill.style.background = 'rgba(220, 38, 38, 0.08)';
    }

    this.countRelate.textContent = currentCard.reactions.relate || 0;
    this.countUnderstand.textContent = currentCard.reactions.understand || 0;
    this.countMore.textContent = currentCard.reactions.moredetails || 0;

    this.guessVotingBox.style.display = 'none';
    this.guessResult.style.display = 'none';

    // Round 3 Special Story Choice (Only for Author)
    const isAuthor = (currentCard.authorName && currentCard.authorName.toLowerCase() === this.playerName.toLowerCase());

    if (this.currentRoundIndex === 2 && !currentCard.revealed && isAuthor) {
      this.storyChoiceBox.style.display = 'block';
    } else {
      this.storyChoiceBox.style.display = 'none';
    }

    // "Ungkap Penulis" button is ONLY visible on the author's own device!
    if (isAuthor && !currentCard.revealed) {
      this.btnRevealMe.style.display = 'inline-flex';
      this.btnRevealMe.textContent = "Ungkap Ini Saya";
    } else {
      this.btnRevealMe.style.display = 'none';
    }

    // Button Next Card label & host control visibility
    if (this.mode === 'HOST') {
      this.btnNextCard.style.display = 'inline-flex';
      if (this.currentCardIndex === cardList.length - 1) {
        this.btnNextCard.textContent = (this.currentRoundIndex === GAME_ROUNDS.length - 1) ? 'Selesai & Lihat Ending' : 'Lanjut ke Ronde Berikutnya';
      } else {
        this.btnNextCard.textContent = 'Entry Selanjutnya';
      }
    } else {
      this.btnNextCard.style.display = 'none';
    }
  }

  handleReaction(reactionType) {
    const cardList = this.submissions[this.currentRoundIndex];
    if (!cardList || !cardList[this.currentCardIndex]) return;

    const currentCard = cardList[this.currentCardIndex];
    currentCard.reactions[reactionType] = (currentCard.reactions[reactionType] || 0) + 1;

    if (this.mode === 'CLIENT') {
      window.realtimeEngine.sendToHost('REACTION', {
        roundIndex: this.currentRoundIndex,
        cardIndex: this.currentCardIndex,
        reactionType: reactionType
      });
    } else if (this.mode === 'HOST') {
      window.realtimeEngine.broadcast('SYNC_CARD_UPDATE', {
        cardIndex: this.currentCardIndex,
        card: currentCard
      });
    }

    this.renderCurrentRevealCard();
    this.saveSessionState();
  }

  handleKeepAnon() {
    this.showToast('Entry tetap 100% Anonim.');
  }

  handleGuessWho() {
    this.guessVotingBox.style.display = 'block';
    this.guessChipsGrid.innerHTML = '';

    this.players.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'guess-chip';
      chip.textContent = p.name;
      chip.addEventListener('click', () => {
        const cardList = this.submissions[this.currentRoundIndex];
        const currentCard = cardList[this.currentCardIndex];
        
        this.guessResult.style.display = 'block';
        if (p.name.toLowerCase() === currentCard.authorName.toLowerCase()) {
          this.guessResult.textContent = `Tepat! Jawaban ini ditulis oleh ${p.name}.`;
          this.handleRevealAuthor();
        } else {
          this.guessResult.textContent = `Bukan ${p.name}. Silakan diskusikan lagi dengan grup.`;
        }
      });
      this.guessChipsGrid.appendChild(chip);
    });
  }

  handleRevealAuthor() {
    const cardList = this.submissions[this.currentRoundIndex];
    if (!cardList || !cardList[this.currentCardIndex]) return;

    const currentCard = cardList[this.currentCardIndex];
    currentCard.revealed = true;

    if (this.mode === 'HOST') {
      window.realtimeEngine.broadcast('SYNC_CARD_UPDATE', {
        cardIndex: this.currentCardIndex,
        card: currentCard
      });
    } else if (this.mode === 'CLIENT') {
      window.realtimeEngine.sendToHost('REVEAL_AUTHOR', {
        roundIndex: this.currentRoundIndex,
        cardIndex: this.currentCardIndex
      });
    }

    this.renderCurrentRevealCard();
    this.saveSessionState();
  }

  handleStoryChoice(willTell) {
    if (willTell) {
      this.handleRevealAuthor();
      this.showToast("Penulis menceritakan kisahnya secara langsung!");
    } else {
      this.showToast("Penulis memilih untuk tetap anonim.");
    }
    this.storyChoiceBox.style.display = 'none';
  }

  handleNextCard() {
    const cardList = this.submissions[this.currentRoundIndex] || [];
    if (this.currentCardIndex < cardList.length - 1) {
      this.currentCardIndex++;
      if (this.mode === 'HOST') {
        window.realtimeEngine.broadcast('SYNC_CARD_INDEX', { cardIndex: this.currentCardIndex });
      }
      this.renderCurrentRevealCard();
    } else {
      // Reached last card in this round
      if (this.currentRoundIndex < GAME_ROUNDS.length - 1) {
        if (this.mode === 'HOST') {
          this.currentRoundIndex++;
          window.realtimeEngine.broadcast('START_ROUND', { roundIndex: this.currentRoundIndex });
          this.startRound(this.currentRoundIndex);
        }
      } else {
        if (this.mode === 'HOST') {
          window.realtimeEngine.broadcast('SHOW_ENDING', {});
        }
        this.showEndingScreen();
      }
    }
    this.saveSessionState();
  }

  showEndingScreen() {
    this.finalPlayerCount.textContent = this.players.length;
    this.showScreen('ending');
  }

  // --- NETWORK MESSAGE RECEIVER ---

  onMessageReceived(data, conn) {
    const { action, payload } = data;

    switch (action) {
      case 'REJOIN':
        if (this.mode === 'HOST') {
          // Re-add player if missing
          if (payload && payload.name) {
            const exists = this.players.some(p => p.name.toLowerCase() === payload.name.toLowerCase());
            if (!exists && conn) {
              this.players.push({
                id: conn.peer,
                name: payload.name,
                isHost: false
              });
            }
          }
          // Broadcast player list update
          window.realtimeEngine.broadcast('SYNC_PLAYERS', { players: this.players });

          // Send full current game state back to the rejoining client
          if (conn && conn.open) {
            conn.send({
              action: 'SYNC_FULL_STATE',
              payload: {
                currentRoundIndex: this.currentRoundIndex,
                activeScreenKey: this.activeScreenKey,
                submissions: this.submissions,
                currentCardIndex: this.currentCardIndex,
                timerSeconds: this.timerSeconds,
                players: this.players
              }
            });
          }
          this.saveSessionState();
        }
        break;

      case 'SYNC_FULL_STATE':
        if (payload) {
          this.currentRoundIndex = payload.currentRoundIndex || 0;
          this.submissions = payload.submissions || {};
          this.currentCardIndex = payload.currentCardIndex || 0;
          this.timerSeconds = payload.timerSeconds || this.timerSeconds;
          if (payload.players) this.players = payload.players;
          this.updateLobbyUI();

          if (payload.activeScreenKey && payload.activeScreenKey !== 'welcome') {
            if (payload.activeScreenKey === 'reveal') {
              this.renderCurrentRevealCard();
            } else if (payload.activeScreenKey === 'submit') {
              this.startRound(this.currentRoundIndex);
            }
            if (['submit', 'waiting', 'reveal'].includes(payload.activeScreenKey)) {
              this.startSessionTimer();
            }
            this.showScreen(payload.activeScreenKey);
          }
        }
        break;

      case 'SYNC_PLAYERS':
        this.players = payload.players;
        this.updateLobbyUI();
        this.saveSessionState();
        break;

      case 'START_ROUND':
        this.startRound(payload.roundIndex);
        break;

      case 'SUBMIT_ANSWER':
        if (this.mode === 'HOST') {
          this.recordSubmission(payload, conn ? conn.peer : 'client');
        }
        break;

      case 'PROGRESS_UPDATE':
        this.showWaitingScreen(payload.received, payload.total);
        break;

      case 'START_REVEAL_PHASE':
        this.submissions[payload.roundIndex] = payload.cards;
        this.startRevealPhase();
        break;

      case 'REACTION':
        if (this.mode === 'HOST') {
          const card = this.submissions[payload.roundIndex][payload.cardIndex];
          card.reactions[payload.reactionType] = (card.reactions[payload.reactionType] || 0) + 1;
          window.realtimeEngine.broadcast('SYNC_CARD_UPDATE', {
            cardIndex: payload.cardIndex,
            card: card
          });
          this.renderCurrentRevealCard();
          this.saveSessionState();
        }
        break;

      case 'REVEAL_AUTHOR':
        if (this.mode === 'HOST') {
          const card = this.submissions[payload.roundIndex][payload.cardIndex];
          card.revealed = true;
          window.realtimeEngine.broadcast('SYNC_CARD_UPDATE', {
            cardIndex: payload.cardIndex,
            card: card
          });
          this.renderCurrentRevealCard();
          this.saveSessionState();
        }
        break;

      case 'SYNC_CARD_UPDATE':
        this.submissions[this.currentRoundIndex][payload.cardIndex] = payload.card;
        this.renderCurrentRevealCard();
        this.saveSessionState();
        break;

      case 'SYNC_CARD_INDEX':
        this.currentCardIndex = payload.cardIndex;
        this.renderCurrentRevealCard();
        this.saveSessionState();
        break;

      case 'SHOW_ENDING':
        this.showEndingScreen();
        break;

      case 'HOST_RESTART_GAME':
        this.currentRoundIndex = 0;
        this.submissions = {};
        this.currentCardIndex = 0;
        this.showToast('Host telah mengulang sesi game dari Ronde 1.');
        this.startRound(0);
        break;

      case 'HOST_END_ROOM':
        this.showToast('Host telah mengakhiri sesi room.');
        setTimeout(() => this.clearSessionAndReload(), 1200);
        break;
    }
  }
}

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.anonymousApp = new AnonymousBoxGame();
});
