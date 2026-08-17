import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface SyncState {
  isPlaying: boolean;
  time: number;
  episode?: string;
  kodikVideo?: any;
  nativeAudioTrack?: number;
}

export interface RoomUser {
  clientId: string;
  name: string;
  avatar: string;
  isMuted: boolean;
  isHost: boolean;
}

const playRemoteStream = (peerId: string, stream: MediaStream) => {
  let audioEl = document.getElementById(`audio-peer-${peerId}`) as HTMLAudioElement;
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.id = `audio-peer-${peerId}`;
    audioEl.autoplay = true;
    audioEl.muted = false;
    audioEl.style.display = 'none';
    audioEl.setAttribute('controls', 'false');
    audioEl.setAttribute('playsinline', 'true');
    document.body.appendChild(audioEl);
  }
  if (audioEl.srcObject !== stream) {
    console.log(`[WebRTC] Binding remote audio stream for peer ${peerId}`);
    audioEl.srcObject = stream;
    audioEl.muted = false;
    audioEl.play().catch(err => {
      console.warn(`[WebRTC] audio.play() was prevented for peer ${peerId}, waiting for user interaction:`, err);
    });
  }
};

const removeRemoteStream = (peerId: string) => {
  const audioEl = document.getElementById(`audio-peer-${peerId}`);
  if (audioEl) {
    audioEl.remove();
  }
};

export const usePlayerSync = (
  roomId: string | null,
  iframeRef: React.RefObject<HTMLIFrameElement>,
  nativeVideoRef: React.RefObject<HTMLVideoElement>,
  isCustomPlayer: boolean
) => {
  const { user } = useAuth();
  const userName = user?.name || `Аноним_${Math.floor(Math.random() * 900 + 100)}`;
  const userAvatar = user?.avatar || `https://picsum.photos/seed/${userName}/200`;

  const socketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef(Math.random().toString(36).substring(2, 9));

  const [role, setRole] = useState<'host' | 'viewer' | null>(null);
  const [usersCount, setUsersCount] = useState(0);
  const [joinedUsers, setJoinedUsers] = useState<RoomUser[]>([]);

  // Voice WebRTC states
  const [isVoiceMuted, setIsVoiceMuted] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const candidatesQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const lastTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const viewerKodikHashRef = useRef<string | null>(null);
  const hostStateRef = useRef<SyncState>({ isPlaying: false, time: 0 });

  const navigate = useNavigate();
  const params = useParams();
  const id = params.id;
  const starParam = params['*'];
  const episode = starParam?.startsWith('episode/') ? starParam.split('episode/')[1]?.split('/')[0] : undefined;

  const currentContextRef = useRef({ id, episode, isCustomPlayer });
  useEffect(() => {
    currentContextRef.current = { id, episode, isCustomPlayer };
  }, [id, episode, isCustomPlayer]);

  const lastStateUpdateStrRef = useRef<string>('');
  const updateTimeoutRef = useRef<any>(null);
  const pendingStateUpdatesRef = useRef<Partial<SyncState>>({});

  const roleRef = useRef<'host' | 'viewer' | null>(null);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  const sendVoiceState = (muted: boolean) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'voice-state-update',
        isMuted: muted,
      }));
    }
  };

  const toggleVoiceMute = () => {
    const newMuted = !isVoiceMuted;
    setIsVoiceMuted(newMuted);

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted;
        try {
          track.applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }).catch(console.warn);
        } catch (e) {}
      });
    }
    sendVoiceState(newMuted);
  };

  // Acquire microphone with robust noise filtering and echo cancellation to prevent feedback loop
  useEffect(() => {
    if (!roomId) return;
    let isActive = true;

    const requestMic = async () => {
      try {
        console.log('[VoiceChat] Obtaining pristine microphone stream with hardware filtering...');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false
        });

        if (!isActive) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        localStreamRef.current = stream;
        stream.getAudioTracks().forEach(t => {
          t.enabled = !isVoiceMuted;
        });

        console.log('[VoiceChat] Micro acquired successfully. Attaching track to peers');
        pcsRef.current.forEach((pc) => {
          stream.getTracks().forEach(track => {
            const alreadyAdded = pc.getSenders().some(s => s.track === track);
            if (!alreadyAdded) {
              pc.addTrack(track, stream);
            }
          });
        });
      } catch (err: any) {
        console.warn('[VoiceChat] Mic access rejected or unavailable:', err.message || err);
        setVoiceError('Разрешите доступ к микрофону для разговора в комнате.');
      }
    };

    requestMic();

    return () => {
      isActive = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
    };
  }, [roomId]);

  // WebRTC Peer Connection Helper
  const getOrCreatePeerConnection = (peerId: string) => {
    let pc = pcsRef.current.get(peerId);
    if (!pc) {
      console.log(`[WebRTC] Building peer connection for: ${peerId}`);
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'webrtc-signal',
            targetId: peerId,
            signal: { candidate: event.candidate }
          }));
        }
      };

      pc.ontrack = (event) => {
        console.log(`[WebRTC] Remote track detected from attendee ${peerId}`);
        if (event.streams && event.streams[0]) {
          playRemoteStream(peerId, event.streams[0]);
        }
      };

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          const alreadyAdded = pc!.getSenders().some(s => s.track === track);
          if (!alreadyAdded) {
            pc!.addTrack(track, localStreamRef.current!);
          }
        });
      }

      pcsRef.current.set(peerId, pc);
    }
    return pc;
  };

  const updateHostState = async (state: Partial<SyncState>) => {
    if (roleRef.current !== 'host' || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

    pendingStateUpdatesRef.current = { ...pendingStateUpdatesRef.current, ...state };

    if (updateTimeoutRef.current) return;

    updateTimeoutRef.current = setTimeout(async () => {
      updateTimeoutRef.current = null;
      if (roleRef.current !== 'host' || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

      const currentEpisodeStr = document.location.pathname.split('/episode/')[1]?.split('/')[0] || episode;

      const newState = {
        isPlaying: isPlayingRef.current,
        time: lastTimeRef.current,
        episode: currentEpisodeStr,
        kodikVideo: hostStateRef.current.kodikVideo,
        nativeAudioTrack: hostStateRef.current.nativeAudioTrack,
        ...pendingStateUpdatesRef.current
      };

      pendingStateUpdatesRef.current = {};

      const stateStr = JSON.stringify(newState);
      if (stateStr === lastStateUpdateStrRef.current) {
        return;
      }
      lastStateUpdateStrRef.current = stateStr;
      hostStateRef.current = { ...hostStateRef.current, ...newState };

      console.log('[WS-SYNC] Broadcasting Host State:', newState);
      socketRef.current.send(JSON.stringify({
        type: 'player-state-update',
        ...newState
      }));
    }, 400);
  };

  // Connect to native WebSocket backend server
  useEffect(() => {
    if (!roomId) return;

    const myId = clientIdRef.current;
    
    // Construct absolute socket path mapping localhost to ws: and safe SSL fallback
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socketUrl = `${protocol}//${host}/ws/room?roomId=${roomId}&clientId=${myId}&name=${encodeURIComponent(userName)}&avatar=${encodeURIComponent(userAvatar)}`;

    console.log(`[WS] Initializing connection to ${socketUrl}`);
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('[WS] Connected to Hono co-watching WebSocket backend.');
      sendVoiceState(isVoiceMuted);
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[WS] Payload received:`, data);

        if (data.type === 'init-state') {
          setRole(data.role || 'viewer');
          setUsersCount(data.users?.length || 0);
          setJoinedUsers(data.users || []);

          if (data.playerState) {
            hostStateRef.current = data.playerState;
            if (data.role === 'viewer') {
              console.log('[WS-SYNC] Initial sync state applied from host:', data.playerState);
              // Wait for component to mount correctly, then sync player
              setTimeout(() => {
                syncToPlayer(data.playerState, true);
              }, 1200);
            }
          }
        } 
        
        else if (data.type === 'room-users-updated') {
          const remoteUsers = data.users || [];
          setJoinedUsers(remoteUsers);
          setUsersCount(remoteUsers.length);

          const meInRoom = remoteUsers.find((u: RoomUser) => u.clientId === myId);
          if (meInRoom && meInRoom.isHost && roleRef.current !== 'host') {
            console.log('[WS] Assigned host role.');
            setRole('host');
          }

          // Trigger WebRTC connections safely
          remoteUsers.forEach((user: RoomUser) => {
            if (user.clientId !== myId) {
              const pc = getOrCreatePeerConnection(user.clientId);
              const isInitiator = myId < user.clientId;
              if (isInitiator && pc.connectionState === 'new') {
                console.log(`[WebRTC] Opening channel offer with ${user.clientId}`);
                pc.createOffer()
                  .then((offer) => pc.setLocalDescription(offer))
                  .then(() => {
                    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                      socketRef.current.send(JSON.stringify({
                        type: 'webrtc-signal',
                        targetId: user.clientId,
                        signal: { sdp: pc.localDescription }
                      }));
                    }
                  })
                  .catch((e) => console.error('[WebRTC] Offer error', e));
              }
            }
          });

          // Prune closed / disconnected attendees
          pcsRef.current.forEach((pc, peerId) => {
            const exists = remoteUsers.some((u: RoomUser) => u.clientId === peerId);
            if (!exists) {
              console.log(`[WebRTC] Pruning connection for disconnected user ${peerId}`);
              pc.close();
              pcsRef.current.delete(peerId);
              removeRemoteStream(peerId);
            }
          });
        } 
        
        else if (data.type === 'player-state-broadcast') {
          if (roleRef.current !== 'viewer') return;
          const remoteState: SyncState = {
            isPlaying: data.isPlaying,
            time: data.time,
            episode: data.episode,
            kodikVideo: data.kodikVideo,
            nativeAudioTrack: data.nativeAudioTrack,
          };

          const diff = Math.abs(remoteState.time - lastTimeRef.current);
          const needsSync = remoteState.episode !== hostStateRef.current.episode ||
                            remoteState.isPlaying !== hostStateRef.current.isPlaying ||
                            diff > 4 ||
                            remoteState.kodikVideo?.hash !== hostStateRef.current.kodikVideo?.hash;

          if (needsSync) {
            console.log('[WS-SYNC] Received peer boardcast sync event:', remoteState);
            const force = remoteState.kodikVideo?.hash !== hostStateRef.current.kodikVideo?.hash;
            hostStateRef.current = remoteState;
            syncToPlayer(remoteState, force);
          }
        } 
        
        else if (data.type === 'webrtc-signal-relay') {
          const peerId = data.senderId;
          const sig = data.signal;
          const pc = getOrCreatePeerConnection(peerId);

          if (sig.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
            if (sig.sdp.type === 'offer') {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({
                  type: 'webrtc-signal',
                  targetId: peerId,
                  signal: { sdp: pc.localDescription }
                }));
              }
            }

            // Process any queued ICE candidates now that remote description is set
            const queue = candidatesQueueRef.current.get(peerId);
            if (queue) {
              console.log(`[WebRTC] Processing ${queue.length} queued ICE candidates for ${peerId}`);
              for (const cand of queue) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (e) {
                  console.warn('[WebRTC] Error adding queued candidate:', e);
                }
              }
              candidatesQueueRef.current.delete(peerId);
            }
          } else if (sig.candidate) {
            if (pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
              } catch (e) {
                console.warn('[WebRTC] Error adding received candidate:', e);
              }
            } else {
              // Remote description not yet set, queue Candidate to prevent WebRTC handshake breakdown
              console.log(`[WebRTC] Queueing candidate for peer ${peerId}`);
              let queue = candidatesQueueRef.current.get(peerId);
              if (!queue) {
                queue = [];
                candidatesQueueRef.current.set(peerId, queue);
              }
              queue.push(sig.candidate);
            }
          }
        } 
        
        else if (data.type === 'role-change') {
          console.log('[WS] Role upgraded to:', data.role);
          setRole(data.role);
        }
      } catch (e) {
        console.warn('[WS] Failed parsing package:', e);
      }
    };

    socket.onerror = (e) => {
      console.warn('[WS] Socket error details:', e);
    };

    socket.onclose = () => {
      console.log('[WS] Connection closed, cleaning dependencies');
      pcsRef.current.forEach((pc, id) => {
        pc.close();
        removeRemoteStream(id);
      });
      pcsRef.current.clear();
    };

    return () => {
      console.log('[WS] Executing useEffect cleanup - closing WebSocket');
      socket.close();
      socketRef.current = null;
    };
  }, [roomId]);

  // Periodic heartbeat / status report to the backend from Host
  useEffect(() => {
    if (role !== 'host') return;
    const interval = setInterval(() => {
      updateHostState({});
    }, 4000);
    return () => clearInterval(interval);
  }, [role, episode]);

  // Handle native video listeners
  useEffect(() => {
    if (!roomId || !isCustomPlayer) return;
    let boundVideo: any = null;

    const handlePlay = () => {
      isPlayingRef.current = true;
      if (roleRef.current === 'host') updateHostState({ isPlaying: true });
    };
    const handlePause = () => {
      isPlayingRef.current = false;
      if (roleRef.current === 'host') updateHostState({ isPlaying: false });
    };
    const handleSeeked = () => {
      if (boundVideo) lastTimeRef.current = boundVideo.currentTime;
      if (roleRef.current === 'host' && boundVideo) updateHostState({ time: boundVideo.currentTime });
    };
    const handleTimeUpdate = () => {
      if (boundVideo) lastTimeRef.current = boundVideo.currentTime;
    };
    const handleAudioTrackChange = (e: any) => {
      if (roleRef.current === 'host') {
        const trackId = e.detail;
        console.log('[WS-SYNC] Host loaded track:', trackId);
        updateHostState({ nativeAudioTrack: trackId });
      }
    };

    const attachListeners = (video: any) => {
      if (!video) return;
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('seeked', handleSeeked);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('audiotrackchange', handleAudioTrackChange);
    };

    const detachListeners = (video: any) => {
      if (!video) return;
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('audiotrackchange', handleAudioTrackChange);
    };

    const interval = setInterval(() => {
      const currentVideo = nativeVideoRef.current;
      if (currentVideo !== boundVideo) {
        detachListeners(boundVideo);
        boundVideo = currentVideo;
        attachListeners(boundVideo);
      }
    }, 500);

    return () => {
      clearInterval(interval);
      detachListeners(boundVideo);
    };
  }, [roomId, isCustomPlayer, role]);

  // Bind Kodik player event emitter messaging
  useEffect(() => {
    if (!roomId || !iframeRef.current || isCustomPlayer) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.key === 'kodik_player_ready') {
        console.log('[WS-SYNC] Player ready callback');
        if (roleRef.current === 'viewer' && hostStateRef.current) {
          syncToPlayer(hostStateRef.current, true);
        }
      }

      if (data.key === 'kodik_player_current_episode' || data.key === 'kodik_player_video_change') {
         const v = data.value || {};
         const tempTrans = typeof v.translation === 'object' ? v.translation?.id : v.translation;
         const tempSeason = typeof v.season === 'object' ? undefined : v.season;
         const tempEpisode = typeof v.episode === 'object' ? undefined : v.episode;
         viewerKodikHashRef.current = v.hash || `${tempTrans}-${tempSeason}-${tempEpisode}`;
      }

      if (data.key === 'kodik_player_time_update') {
        const newTime = data.value;
        const jump = Math.abs(newTime - lastTimeRef.current);
        lastTimeRef.current = newTime;

        if (roleRef.current === 'host' && jump > 2) {
          updateHostState({ time: newTime });
        }
      } else if (data.key === 'kodik_player_api' && data.value?.kodik_player_time_update) {
        const newTime = data.value.kodik_player_time_update;
        const jump = Math.abs(newTime - lastTimeRef.current);
        lastTimeRef.current = newTime;

        if (roleRef.current === 'host' && jump > 2) {
          updateHostState({ time: newTime });
        }
      }

      if (data.key === 'kodik_player_play') {
        isPlayingRef.current = true;
      } else if (data.key === 'kodik_player_pause') {
        isPlayingRef.current = false;
      }

      if (roleRef.current === 'host') {
        if (data.key === 'kodik_player_current_episode' || data.key === 'kodik_player_video_change') {
           const v = data.value || {};
           const cleanTrans = typeof v.translation === 'object' ? v.translation?.id : v.translation;
           const cleanSeason = typeof v.season === 'object' ? undefined : v.season;
           const cleanEp = typeof v.episode === 'object' ? undefined : v.episode;
           const cleanKodikVideo = {
             hash: v.hash ? String(v.hash).substring(0, 100) : `${cleanTrans}-${cleanSeason}-${cleanEp}`,
             translation: cleanTrans,
             season: cleanSeason,
             episode: cleanEp,
           };
           updateHostState({ kodikVideo: cleanKodikVideo });
        }

        if (data.key === 'kodik_player_play') {
          updateHostState({ isPlaying: true });
        } else if (data.key === 'kodik_player_pause') {
          updateHostState({ isPlaying: false });
        } else if (data.key === 'kodik_player_api') {
          const value = data.value;
          if (value.kodik_player_play) {
            isPlayingRef.current = true;
            updateHostState({ isPlaying: true });
          } else if (value.kodik_player_pause) {
            isPlayingRef.current = false;
            updateHostState({ isPlaying: false });
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [roomId, iframeRef, role, episode]);

  const syncToPlayer = (state: SyncState, force = false) => {
    const { id: refId, isCustomPlayer: refIsCustomPlayer } = currentContextRef.current;
    const currentEpisodeStr = document.location.pathname.split('/episode/')[1]?.split('/')[0] || episode;

    if (state.episode && state.episode !== currentEpisodeStr) {
      console.log(`[WS-SYNC] Episode mismatch: ${state.episode} -> Navigation initiated.`);
      navigate(`/anime/${refId}/episode/${state.episode}?room=${roomId}`);
      return;
    }

    if (refIsCustomPlayer) {
      if (!nativeVideoRef.current) return;
      const video = nativeVideoRef.current as HTMLVideoElement;

      console.log(`[WS-SYNC] Processing view Native Player alignment:`, state);

      if (state.nativeAudioTrack !== undefined) {
         const art = (video as any).art;
         if (art?.hls && art.hls.audioTrack !== state.nativeAudioTrack) {
            art.hls.audioTrack = state.nativeAudioTrack;
         }
      }

      if (force || state.isPlaying !== isPlayingRef.current) {
        isPlayingRef.current = state.isPlaying;
        if (state.isPlaying) {
          const playPromise = video.play();
          if (playPromise) {
            playPromise.catch((e: any) => {
               console.warn('[WS-SYNC] Play prevented, fallback to muted play:', e);
               video.muted = true;
               video.play().catch(console.error);
            });
          }
        } else {
          video.pause();
        }
      }

      const timeDiff = Math.abs(state.time - video.currentTime);
      if (force || timeDiff > 3) {
        video.currentTime = state.time;
      }
      return;
    }

    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    const target = iframeRef.current.contentWindow;

    console.log(`[WS-SYNC] Processing view Iframe Player alignment:`, state);

    if (state.kodikVideo) {
      if (viewerKodikHashRef.current !== state.kodikVideo.hash) {
         viewerKodikHashRef.current = state.kodikVideo.hash;
         target.postMessage({ key: 'kodik_player_api', value: { method: 'change_video', autoplay: true, ...state.kodikVideo } }, '*');

         setTimeout(() => {
           if (state.isPlaying) {
             target.postMessage({ key: 'kodik_player_api', value: { method: 'play' } }, '*');
           }
           if (state.time > 0) {
             console.log(`[WS-SYNC] Relocating seek index: ${state.time}`);
             target.postMessage({ key: 'kodik_player_api', value: { method: 'seek', seconds: state.time } }, '*');
             target.postMessage({ key: 'kodik_player_api', value: { method: 'seek', time: state.time } }, '*');
           }
         }, 1000);
      }
    }

    if (force || state.isPlaying !== isPlayingRef.current) {
      isPlayingRef.current = state.isPlaying;
      const cmd = state.isPlaying ? 'play' : 'pause';

      target.postMessage({ key: 'kodik_player_api', value: { method: cmd } }, '*');
      target.postMessage(JSON.stringify({ key: 'kodik_player_api', value: { method: cmd } }), '*');
      target.postMessage({ key: `kodik_player_${cmd}` }, '*');
      target.postMessage(JSON.stringify({ key: `kodik_player_${cmd}` }), '*');
    }

    const timeDiff = Math.abs(state.time - lastTimeRef.current);
    if (force || timeDiff > 3) {
      target.postMessage({ key: 'kodik_player_api', value: { method: 'seek', seconds: state.time } }, '*');
      target.postMessage({ key: 'kodik_player_api', value: { method: 'seek', time: state.time } }, '*');
      target.postMessage(JSON.stringify({ key: 'kodik_player_api', value: { method: 'seek', seconds: state.time } }), '*');
    }
  };

  const sync = () => {
    if (roleRef.current === 'viewer' && hostStateRef.current) {
      console.log('[WS] Forced manual synchronization request');
      syncToPlayer(hostStateRef.current, true);
    }
  };

  const [exposedHostState, setExposedHostState] = useState<SyncState>({ isPlaying: false, time: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      setExposedHostState({ ...hostStateRef.current });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    role,
    usersCount,
    myId: clientIdRef.current,
    sync,
    hostState: exposedHostState,
    isVoiceMuted,
    toggleVoiceMute,
    joinedUsers,
    voiceError
  };
};
