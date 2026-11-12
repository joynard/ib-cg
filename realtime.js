/**
 * RealtimeEngine - Resilient Dual-Engine Networking (BroadcastChannel + PeerJS WebRTC)
 * Features system-wide msgId deduplication, true handshake confirmation,
 * bidirectional disconnect tracking, and zero-leak state synchronization.
 */

class RealtimeEngine {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.roomCode = null;
    this.codePrefix = 'BOX';
    this.connections = []; // For Host: list of client WebRTC connections
    this.hostConnection = null; // For Client: WebRTC connection to Host
    this.onMessageCallback = null;
    this.onPlayerConnectCallback = null;
    this.onPlayerDisconnectCallback = null;
    this.onConnectedCallback = null;
    this.onDisconnectCallback = null;
    this.heartbeatInterval = null;
    this.connectTimeout = null;
    
    // BroadcastChannel for local/offline tab multiplayer
    this.broadcastChannel = null;
    this.playerName = '';
    
    // Reconnection tracking
    this.hasConnectedOnce = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;

    // Deduplication Set for multi-channel packets
    this.processedMsgIds = new Set();

    // Listen for tab unload to gracefully notify host
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (!this.isHost && this.hasConnectedOnce && this.playerName) {
          this.sendToHost('LEAVE', { name: this.playerName });
        }
      });
    }
  }

  // Generate short room code like 'BOX-MKFS' or 'SABO-MKFS'
  generateRoomCode(prefix = 'BOX') {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${code}`;
  }

  // Universal Toast Notification
  showErrorToast(msg) {
    if (window.activeGame && typeof window.activeGame.showToast === 'function') {
      window.activeGame.showToast(msg);
    } else if (window.sabotaseGame && typeof window.sabotaseGame.showToast === 'function') {
      window.sabotaseGame.showToast(msg);
    } else if (window.hotTakesGame && typeof window.hotTakesGame.showToast === 'function') {
      window.hotTakesGame.showToast(msg);
    } else if (window.anonymousApp && typeof window.anonymousApp.showToast === 'function') {
      window.anonymousApp.showToast(msg);
    } else {
      console.warn('[Realtime Error]', msg);
    }
  }

  // Clear all game session keys
  clearActiveSession() {
    try {
      localStorage.removeItem('ANONYMOUS_BOX_SESSION_V1');
      localStorage.removeItem('SABOTASE_KATA_SESSION_V1');
      localStorage.removeItem('HOT_TAKES_RADAR_SESSION_V1');
    } catch (e) {}
  }

  // Deduplicate and validate incoming packets
  isDuplicateMsg(data) {
    if (!data || typeof data !== 'object') return true;
    if (!data.msgId || typeof data.msgId !== 'string' || data.msgId.length > 64) return false;
    if (this.processedMsgIds.has(data.msgId)) {
      return true;
    }
    this.processedMsgIds.add(data.msgId);
    setTimeout(() => this.processedMsgIds.delete(data.msgId), 3000);
    return false;
  }

  // Validate incoming packet integrity and payload boundary (max 32KB)
  isValidPacket(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.action !== 'string' || data.action.length > 32) return false;
    try {
      if (JSON.stringify(data).length > 32768) {
        console.warn('[Security] Dropped packet exceeding maximum payload size.');
        return false;
      }
    } catch (e) {
      return false;
    }
    return true;
  }

  // Initialize Host Room
  initHost(roomCode, onPlayerConnect, onMessage, onPlayerDisconnect, codePrefix = 'BOX') {
    this.isHost = true;
    this.codePrefix = codePrefix;
    const rawCode = roomCode || this.generateRoomCode(codePrefix);
    this.roomCode = rawCode.replace(/[^A-Z0-9-]/gi, '').toUpperCase().slice(0, 12);
    this.onPlayerConnectCallback = onPlayerConnect;
    this.onMessageCallback = onMessage;
    this.onPlayerDisconnectCallback = onPlayerDisconnect;

    // 1. Setup Local BroadcastChannel
    this.setupBroadcastChannel();

    // 2. Setup PeerJS Cloud Peer
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }

    try {
      this.peer = new Peer(this.roomCode, { debug: 1 });

      this.peer.on('open', (id) => {
        console.log('[Realtime] Host PeerJS ready with ID:', id);
        this.startHeartbeat();
      });

      this.peer.on('connection', (conn) => {
        conn.on('open', () => {
          this.connections = this.connections.filter(c => c.peer !== conn.peer);
          this.connections.push(conn);
          if (this.onPlayerConnectCallback) {
            this.onPlayerConnectCallback(conn);
          }
        });

        conn.on('data', (data) => {
          if (!this.isValidPacket(data)) return;
          if (data && data.action === 'PING') return;
          if (data && data.action === 'LEAVE') {
            if (this.onPlayerDisconnectCallback) {
              this.onPlayerDisconnectCallback(conn);
            }
            return;
          }
          if (this.isDuplicateMsg(data)) return;
          if (this.onMessageCallback) {
            this.onMessageCallback(data, conn);
          }
        });

        conn.on('close', () => {
          this.connections = this.connections.filter(c => c.peer !== conn.peer);
          if (this.onPlayerDisconnectCallback) {
            this.onPlayerDisconnectCallback(conn);
          }
        });

        conn.on('error', () => {
          this.connections = this.connections.filter(c => c.peer !== conn.peer);
          if (this.onPlayerDisconnectCallback) {
            this.onPlayerDisconnectCallback(conn);
          }
        });
      });

      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          setTimeout(() => {
            this.initHost(this.roomCode, this.onPlayerConnectCallback, this.onMessageCallback, this.onPlayerDisconnectCallback, this.codePrefix);
          }, 1500);
        }
      });
    } catch (e) {
      console.warn('[Realtime] PeerJS Cloud warning, relying on local channel:', e);
    }

    return this.roomCode;
  }

  // Initialize Client Join
  initClient(roomCode, playerName, onConnected, onMessage, onDisconnect, codePrefix = 'BOX') {
    this.isHost = false;
    this.codePrefix = codePrefix;
    this.roomCode = (roomCode || '').replace(/[^A-Z0-9-]/gi, '').toUpperCase().slice(0, 12);
    this.playerName = (playerName || '').replace(/[<>&"']/g, '').trim().slice(0, 15);
    this.onConnectedCallback = onConnected;
    this.onMessageCallback = onMessage;
    this.onDisconnectCallback = onDisconnect;
    this.hasConnectedOnce = false;
    this.reconnectAttempts = 0;

    if (this.connectTimeout) clearTimeout(this.connectTimeout);
    this.connectTimeout = setTimeout(() => {
      if (!this.hasConnectedOnce) {
        this.showErrorToast(`Waktu koneksi habis. Pastikan Kode Room benar dan Host aktif.`);
        this.clearActiveSession();
        if (this.onDisconnectCallback) this.onDisconnectCallback(new Error('timeout'));
      }
    }, 12000);

    // 1. Setup Local BroadcastChannel
    this.setupBroadcastChannel();

    // Query Host via local BroadcastChannel
    if (this.broadcastChannel) {
      this.sendToHost('JOIN', { name: playerName });
    }

    // 2. Setup PeerJS Cloud Peer for cross-device multiplayer
    try {
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
      }

      this.peer = new Peer({ debug: 1 });

      this.peer.on('open', () => {
        this.connectToHost(playerName, onConnected);
      });

      this.peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
          if (this.connectTimeout) clearTimeout(this.connectTimeout);
          this.showErrorToast(`Kode Room "${this.roomCode}" tidak ditemukan atau Host sudah offline.`);
          this.clearActiveSession();
          if (this.onDisconnectCallback) this.onDisconnectCallback(err);
          return;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            if (!this.hostConnection || !this.hostConnection.open) {
              this.connectToHost(playerName, null);
            }
          }, 2000);
        } else {
          if (this.connectTimeout) clearTimeout(this.connectTimeout);
          this.showErrorToast(`Gagal terhubung ke room "${this.roomCode}".`);
          this.clearActiveSession();
          if (this.onDisconnectCallback) this.onDisconnectCallback(err);
        }
      });
    } catch (e) {
      console.warn('[Realtime] PeerJS Client fallback warning:', e);
    }
  }

  setupBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    if (this.broadcastChannel) {
      try { this.broadcastChannel.close(); } catch (e) {}
    }

    const channelName = `${this.codePrefix}_ROOM_${this.roomCode}`;
    this.broadcastChannel = new BroadcastChannel(channelName);

    this.broadcastChannel.onmessage = (event) => {
      const { sender, type, data } = event.data || {};
      if (!data || !this.isValidPacket(data)) return;

      if (this.isDuplicateMsg(data)) return;

      if (this.isHost && type === 'CLIENT_TO_HOST') {
        const mockConn = {
          peer: `local-${sender}`,
          metadata: { name: sender },
          open: true,
          send: (packet) => {
            if (this.broadcastChannel) {
              this.broadcastChannel.postMessage({
                target: sender,
                type: 'HOST_DIRECT_TO_CLIENT',
                data: packet
              });
            }
          }
        };

        if (data.action === 'JOIN' || data.action === 'REJOIN') {
          if (this.onPlayerConnectCallback) {
            this.onPlayerConnectCallback(mockConn);
          }
          // Send ACK back so client confirms local channel connection
          if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
              target: sender,
              type: 'HOST_ACK_JOIN',
              data: { action: 'HOST_ACK_JOIN', msgId: `ack-${Date.now()}` }
            });
          }
        } else if (data.action === 'LEAVE') {
          if (this.onPlayerDisconnectCallback) {
            this.onPlayerDisconnectCallback(mockConn);
          }
          return;
        }

        if (this.onMessageCallback) {
          this.onMessageCallback(data, mockConn);
        }
      } else if (!this.isHost && (type === 'HOST_ACK_JOIN' || type === 'HOST_BROADCAST')) {
        if (!this.hasConnectedOnce) {
          this.hasConnectedOnce = true;
          if (this.connectTimeout) clearTimeout(this.connectTimeout);
          if (this.onConnectedCallback) {
            this.onConnectedCallback();
            this.onConnectedCallback = null;
          }
        }
        if (data.action === 'PING' || data.action === 'HOST_ACK_JOIN') return;
        if (this.onMessageCallback) {
          this.onMessageCallback(data);
        }
      } else if (!this.isHost && type === 'HOST_DIRECT_TO_CLIENT' && event.data.target === this.playerName) {
        if (!this.hasConnectedOnce) {
          this.hasConnectedOnce = true;
          if (this.connectTimeout) clearTimeout(this.connectTimeout);
          if (this.onConnectedCallback) {
            this.onConnectedCallback();
            this.onConnectedCallback = null;
          }
        }
        if (this.onMessageCallback) {
          this.onMessageCallback(data);
        }
      }
    };
  }

  connectToHost(playerName, onConnected) {
    if (!this.peer) return;
    this.hostConnection = this.peer.connect(this.roomCode, {
      metadata: { name: playerName },
      reliable: true
    });

    this.hostConnection.on('open', () => {
      this.hasConnectedOnce = true;
      if (this.connectTimeout) clearTimeout(this.connectTimeout);
      this.reconnectAttempts = 0;
      this.sendToHost('REJOIN', { name: playerName });
      if (this.onConnectedCallback) {
        this.onConnectedCallback();
        this.onConnectedCallback = null;
      }
      this.startHeartbeat();
    });

    this.hostConnection.on('data', (data) => {
      if (!this.isValidPacket(data)) return;
      if (data && data.action === 'PING') return;
      if (this.isDuplicateMsg(data)) return;
      if (this.onMessageCallback) {
        this.onMessageCallback(data);
      }
    });

    this.hostConnection.on('close', () => {
      if (this.hasConnectedOnce && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connectToHost(playerName, null), 2000);
      } else if (this.hasConnectedOnce) {
        this.showErrorToast('Koneksi ke Host terputus.');
        if (this.onDisconnectCallback) this.onDisconnectCallback(new Error('closed'));
      }
    });

    this.hostConnection.on('error', (err) => {
      console.warn('[Realtime] Host connection error:', err);
    });
  }

  startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.isHost) {
        this.broadcast('PING', {});
      } else if (this.hostConnection && this.hostConnection.open) {
        this.sendToHost('PING', {});
      }
    }, 4000);
  }

  broadcast(action, payload) {
    const msgId = `${action}-${Date.now()}-${Math.random()}`;
    const packet = { action, payload, msgId };

    if (this.isHost && this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        sender: 'HOST',
        type: 'HOST_BROADCAST',
        data: packet
      });
    }

    if (this.isHost) {
      this.connections.forEach(conn => {
        if (conn.open && !conn.peer.startsWith('local-')) {
          try { conn.send(packet); } catch (e) {}
        }
      });
    }
  }

  sendDirectToClient(clientName, action, payload) {
    const msgId = `${action}-${Date.now()}-${Math.random()}`;
    const packet = { action, payload, msgId };

    if (this.isHost && this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        target: clientName,
        type: 'HOST_DIRECT_TO_CLIENT',
        data: packet
      });
    }

    if (this.isHost) {
      const conn = this.connections.find(c => c.metadata && c.metadata.name === clientName);
      if (conn && conn.open && !conn.peer.startsWith('local-')) {
        try { conn.send(packet); } catch (e) {}
      }
    }
  }

  sendToHost(action, payload) {
    const msgId = `${action}-${Date.now()}-${Math.random()}`;
    const packet = { action, payload, msgId };

    if (!this.isHost && this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        sender: this.playerName,
        type: 'CLIENT_TO_HOST',
        data: packet
      });
    }

    if (!this.isHost && this.hostConnection && this.hostConnection.open) {
      try { this.hostConnection.send(packet); } catch (e) {}
    }
  }
}

window.realtimeEngine = new RealtimeEngine();
