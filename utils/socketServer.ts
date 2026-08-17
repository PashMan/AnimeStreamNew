
interface RoomClient {
  clientId: string;
  ws: any; // Context for Hono WS connection
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

const rooms = new Map<string, Room>();

export const makeRoomWebSocketHandler = (upgradeWebSocket: any) => upgradeWebSocket((c: any) => {
  const roomId = c.req.query('roomId');
  const clientId = c.req.query('clientId') || Math.random().toString(36).substring(2, 9);
  const name = c.req.query('name') || 'Guest';
  const avatar = c.req.query('avatar') || '';

  if (!roomId) {
    return {
      onOpen(event: any, ws: any) {
        ws.close(1008, 'Room ID required');
      }
    };
  }

  let room = rooms.get(roomId);
  let client: RoomClient | null = null;

  return {
    onOpen(event: any, ws: any) {
      console.log(`[WS] Client ${clientId} (${name}) connecting to room ${roomId}`);

      room = rooms.get(roomId!);
      if (!room) {
        room = {
          id: roomId!,
          clients: new Map(),
          playerState: {
            isPlaying: false,
            time: 0,
            updatedAt: Date.now()
          }
        };
        rooms.set(roomId!, room);
      }

      client = {
        clientId,
        ws,
        name,
        avatar,
        isMuted: true, // Default to muted for safety
        joinedAt: Date.now()
      };

      room.clients.set(clientId, client);

      const getHostClientId = (r: Room) => {
        const clientsSorted = Array.from(r.clients.values()).sort((a, b) => a.joinedAt - b.joinedAt);
        return clientsSorted[0]?.clientId;
      };

      const sendJson = (targetWs: any, obj: any) => {
        try {
          targetWs.send(JSON.stringify(obj));
        } catch (e) {
          console.error('[WS] Send error', e);
        }
      };

      const broadcastToRoom = (msg: any, excludeClientId?: string) => {
        if (!room) return;
        const msgStr = JSON.stringify(msg);
        room.clients.forEach((c) => {
          if (c.clientId !== excludeClientId) {
            try {
              c.ws.send(msgStr);
            } catch (e) {
              console.error('[WS] Broadcast send error', e);
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

      // 1. Send initialization data back to joining user
      sendJson(ws, {
        type: 'init-state',
        clientId,
        role: clientId === hostClientId ? 'host' : 'viewer',
        users: getClientList(),
        playerState: room.playerState
      });

      // 2. Broadcast updated user list to everyone in the room
      broadcastToRoom({
        type: 'room-users-updated',
        users: getClientList()
      });
    },

    onMessage(event: any, ws: any) {
      if (!room || !client) return;
      try {
        const data = JSON.parse(String(event.data));

        const getHostClientId = (r: Room) => {
          const clientsSorted = Array.from(r.clients.values()).sort((a, b) => a.joinedAt - b.joinedAt);
          return clientsSorted[0]?.clientId;
        };

        const sendJson = (targetWs: any, obj: any) => {
          try {
            targetWs.send(JSON.stringify(obj));
          } catch (e) {
            console.error('[WS] Send error', e);
          }
        };

        const broadcastToRoom = (msg: any, excludeClientId?: string) => {
          if (!room) return;
          const msgStr = JSON.stringify(msg);
          room.clients.forEach((c) => {
            if (c.clientId !== excludeClientId) {
              try {
                c.ws.send(msgStr);
              } catch (e) {
                console.error('[WS] Broadcast send error', e);
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

        switch (data.type) {
          case 'player-state-update': {
            // Update the authoritative player state on the server
            room.playerState = {
              isPlaying: data.isPlaying,
              time: data.time,
              episode: data.episode,
              kodikVideo: data.kodikVideo,
              nativeAudioTrack: data.nativeAudioTrack,
              updatedAt: Date.now()
            };

            // Broadcast player state to other peers in room
            broadcastToRoom({
              type: 'player-state-broadcast',
              senderId: clientId,
              ...room.playerState
            }, clientId);
            break;
          }

          case 'webrtc-signal': {
            const targetClient = room.clients.get(data.targetId);
            if (targetClient) {
              sendJson(targetClient.ws, {
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
      } catch (err) {
        console.error('[WS] Error processing message:', err);
      }
    },

    onClose(event: any, ws: any) {
      if (!room) return;
      console.log(`[WS] Client ${clientId} disconnected from room ${roomId}`);
      room.clients.delete(clientId);

      const getHostClientId = (r: Room) => {
        const clientsSorted = Array.from(r.clients.values()).sort((a, b) => a.joinedAt - b.joinedAt);
        return clientsSorted[0]?.clientId;
      };

      const sendJson = (targetWs: any, obj: any) => {
        try {
          targetWs.send(JSON.stringify(obj));
        } catch (e) {
          console.error('[WS] Send error', e);
        }
      };

      const broadcastToRoom = (msg: any, excludeClientId?: string) => {
        if (!room) return;
        const msgStr = JSON.stringify(msg);
        room.clients.forEach((c) => {
          if (c.clientId !== excludeClientId) {
            try {
              c.ws.send(msgStr);
            } catch (e) {
              console.error('[WS] Broadcast send error', e);
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

      if (room.clients.size === 0) {
        rooms.delete(roomId!);
        console.log(`[WS] Room ${roomId} is empty and was destroyed`);
      } else {
        const remainingClients = Array.from(room.clients.values()).sort((a, b) => a.joinedAt - b.joinedAt);
        const newHostId = remainingClients[0]?.clientId;

        // Inform the new host if their role changed to host
        const newHost = remainingClients[0];
        if (newHost) {
          sendJson(newHost.ws, {
            type: 'role-change',
            role: 'host'
          });
        }

        // Send updated user list to remaining users
        broadcastToRoom({
          type: 'room-users-updated',
          users: getClientList()
        });
      }
    }
  };
});
