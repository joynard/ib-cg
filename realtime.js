/**
 * RealtimeEngine - Resilient Dual-Engine Networking (BroadcastChannel + PeerJS)
 * Features system-wide msgId deduplication to eliminate double-count bugs.
 */

class RealtimeEngine {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.roomCode = null;
    this.connections = []; // For Host: list of client connections
    this.hostConnection = null; // For Client: connection to Host
    this.onMessageCallback = null;
    this.onPlayerConnectCallback = null;
    this.onPlayerDisconnectCallback = null;
    this.heartbeatInterval = null;
    
    // BroadcastChannel for local/offline tab multiplayer
    this.broadcastChannel = null;
    this.playerName = '';
    
    // Reconnection tracking
    this.hasConnectedOnce = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;

    // Deduplication Set for multi-channel packets
    this.processedMsgIds = new Set();
  }

  // Generate short room code like 'BOX-MKFS'
  generateRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `BOX-${code}`;
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
  initHost(roomCode, onPlayerConnect, onMessage) {
    this.isHost = true;
    const rawCode = roomCode || this.generateRoomCode();
    this.roomCode = rawCode.replace(/[^A-Z0-9-]/gi, '').toUpperCase().slice(0, 12);
    this.onPlayerConnectCallback = onPlayerConnect;
    this.onMessageCallback = onMessage;

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
          if (this.isDuplicateMsg(data)) return;
          if (this.onMessageCallback) {
            this.onMessageCallback(data, conn);
          }
        });

        conn.on('close', () => {
          this.connections = this.connections.filter(c => c.peer !== conn.peer);
        });
      });

      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          setTimeout(() => {
            this.initHost(this.roomCode, this.onPlayerConnectCallback, this.onMessageCallback);
          }, 1500);
        }
      });
    } catch (e) {
      console.warn('[Realtime] PeerJS Cloud warning, relying on local channel:', e);
    }

    return this.roomCode;
  }

  // Initialize Client Join
  initClient(roomCode, playerName, onConnected, onMessage) {
    this.isHost = false;
    this.roomCode = (roomCode || '').replace(/[^A-Z0-9-]/gi, '').toUpperCase().slice(0, 12);
    this.playerName = (playerName || '').replace(/[<>&"']/g, '').trim().slice(0, 15);
    this.onMessageCallback = onMessage;
    this.hasConnectedOnce = false;
    this.reconnectAttempts = 0;

    // 1. Setup Local BroadcastChannel
    this.setupBroadcastChannel();

    // Notify Host via BroadcastChannel with slight delay to ensure listener readiness
    setTimeout(() => {
      if (this.broadcastChannel) {
        this.sendToHost('JOIN', { name: playerName });
        this.hasConnectedOnce = true;
        if (onConnected) onConnected();
      }
    }, 80);

    // 2. Setup PeerJS Cloud Peer as secondary fallback
    try {
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
      }

      this.peer = new Peer({ debug: 1 });

      this.peer.on('open', () => {
        this.connectToHost(playerName, onConnected);
      });

      this.peer.on('error', (err) => {
        if (this.hasConnectedOnce) return;

        if (err.type === 'peer-unavailable') {
          if (window.anonymousApp) {
            window.anonymousApp.showToast(`Kode Room "${this.roomCode}" tidak ditemukan atau Host sudah keluar.`);
          }
          localStorage.removeItem('ANONYMOUS_BOX_SESSION_V1');
          return;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            if (!this.hostConnection || !this.hostConnection.open) {
              this.connectToHost(playerName, null);
            }
          }, 2000);
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

    this.broadcastChannel = new BroadcastChannel(`ANONYMOUS_BOX_ROOM_${this.roomCode}`);

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
        }

        if (this.onMessageCallback) {
          this.onMessageCallback(data, mockConn);
        }
      } else if (!this.isHost && type === 'HOST_BROADCAST') {
        if (data.action === 'PING') return;
        if (this.onMessageCallback) {
          this.onMessageCallback(data);
        }
      } else if (!this.isHost && type === 'HOST_DIRECT_TO_CLIENT' && event.data.target === this.playerName) {
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
      this.reconnectAttempts = 0;
      this.sendToHost('REJOIN', { name: playerName });
      if (onConnected) onConnected();
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
      }
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
