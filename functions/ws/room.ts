interface RoomClient {
  clientId: string;
  ws: WebSocket;
  name: string;
  avatar: string;
  isMuted: boolean;
  joinedAt: number;
}

interface Room {
  id: string;
  clients: Map<string, RoomClient>;
  playerState: {
    isPlaying: boolean;
    time: number;
    episode?: string;
    kodikVideo?: any;
    nativeAudioTrack?: number;
    updatedAt: number;
  };
}

// Global in-memory co-watching rooms for this Cloudflare instance PoP
const rooms = new Map<string, Room>();

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  // 1. Confirm this is indeed an upgrade request
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade connection', { status: 426 });
  }

  // 2. Parse query descriptors
  const roomId = url.searchParams.get('roomId');
  const clientId = url.searchParams.get('clientId') || Math.random().toString(36).substring(2, 9);
  const name = url.searchParams.get('name') || 'Guest';
  const avatar = url.searchParams.get('avatar') || '';

  if (!roomId) {
    return new Response('Room ID is required', { status: 400 });
  }

  // 3. Initiate WebSocketPair for edge handshaking
  const pair = new WebSocketPair();
  const [clientSocket, serverSocket] = Object.values(pair);

  serverSocket.accept();

  // 4. Retrieve or initialize Room container
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      clients: new Map(),
      playerState: {
        isPlaying: false,
        time: 0,
        updatedAt: Date.now()
      }
    };
    rooms.set(roomId, room);
  }

  const client: RoomClient = {
    clientId,
    ws: serverSocket,
    name,
    avatar,
    isMuted: true,
    joinedAt: Date.now()
  };

  room.clients.set(clientId, client);

  // Sorted list of clients to determine host by longest connection duration
  const getHostClientId = (r: Room) => {
    const clientsSorted = Array.from(r.clients.values()).sort((a, b) => a.joinedAt - b.joinedAt);
    return clientsSorted[0]?.clientId;
  };

  const sendJson = (ws: WebSocket, obj: any) => {
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      console.error('[WS] Send failed:', e);
    }
  };

  const broadcastToRoom = (msg: any, excludeId?: string) => {
    if (!room) return;
    const msgStr = JSON.stringify(msg);
    room.clients.forEach((c) => {
      if (c.clientId !== excludeId) {
        try {
          c.ws.send(msgStr);
        } catch (e) {
          console.error('[WS] Broadcast send failed:', e);
        }
      }
    });
  };

  const getClientList = () => {
    if (!room) return [];
    const currentHostId = getHostClientId(room);
    return Array.from(room.clients.values()).map(c => ({
      clientId: c.clientId,
      name: c.name,
      avatar: c.avatar,
      isMuted: c.isMuted,
      isHost: c.clientId === currentHostId
    }));
  };

  const hostClientId = getHostClientId(room);

  // Send initialization pack to joining attendee
  sendJson(serverSocket, {
    type: 'init-state',
    clientId,
    role: clientId === hostClientId ? 'host' : 'viewer',
    users: getClientList(),
    playerState: room.playerState
  });

  // Notify other peers about the joiner
  broadcastToRoom({
    type: 'room-users-updated',
    users: getClientList()
  }, clientId);

  // Message relay receiver
  serverSocket.addEventListener('message', (event) => {
    try {
      if (!room || !room.clients.has(clientId)) return;

      const data = JSON.parse(String(event.data));

      switch (data.type) {
        case 'player-state-update': {
          room.playerState = {
            isPlaying: data.isPlaying,
            time: data.time,
            episode: data.episode,
            kodikVideo: data.kodikVideo,
            nativeAudioTrack: data.nativeAudioTrack,
            updatedAt: Date.now()
          };

          broadcastToRoom({
            type: 'player-state-broadcast',
            senderId: clientId,
            ...room.playerState
          }, clientId);
          break;
        }

        case 'webrtc-signal': {
          const target = room.clients.get(data.targetId);
          if (target) {
            sendJson(target.ws, {
              type: 'webrtc-signal-relay',
              senderId: clientId,
              signal: data.signal
            });
          }
          break;
        }

        case 'voice-state-update': {
          client.isMuted = !!data.isMuted;
          broadcastToRoom({
            type: 'room-users-updated',
            users: getClientList()
          });
          break;
        }
      }
    } catch (e) {
      console.error('[WS] Error processing frame:', e);
    }
  });

  // Clean-up handler
  const handleClose = () => {
    if (!room) return;
    room.clients.delete(clientId);

    if (room.clients.size === 0) {
      rooms.delete(roomId);
    } else {
      const remaining = Array.from(room.clients.values()).sort((a, b) => a.joinedAt - b.joinedAt);
      const newHost = remaining[0];
      if (newHost) {
        sendJson(newHost.ws, {
          type: 'role-change',
          role: 'host'
        });
      }

      broadcastToRoom({
        type: 'room-users-updated',
        users: getClientList()
      });
    }
  };

  serverSocket.addEventListener('close', handleClose);
  serverSocket.addEventListener('error', handleClose);

  // Handshake response carrying the accepted WebSocket client
  return new Response(null, {
    status: 101,
    webSocket: clientSocket
  });
};
