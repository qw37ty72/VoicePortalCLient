import { useState, useRef, useEffect } from 'react';
import { applyNoiseSuppression } from './useNoiseGate';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function useChannelVoice(socket, channelId, enabled, initialMembers = [], localVideoStream = null) {
  const [remotePeers, setRemotePeers] = useState([]);
  const [micMuted, setMicMuted] = useState(false);
  const [headphonesMuted, setHeadphonesMuted] = useState(false);
  const [localStream, setLocalStreamState] = useState(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // socketId -> { pc, userId, user, stream }
  const initialMembersRef = useRef(initialMembers);
  initialMembersRef.current = initialMembers;
  const localVideoStreamRef = useRef(localVideoStream);
  localVideoStreamRef.current = localVideoStream;

  useEffect(() => {
    if (!socket || !channelId || !enabled) {
      return () => {};
    }

    let myStream = null;
    const peers = peersRef.current;

    function addRemotePeer(socketId, userId, user, stream) {
      setRemotePeers((prev) => {
        const next = prev.filter((p) => p.socketId !== socketId);
        if (stream) next.push({ socketId, userId, user, stream });
        return next;
      });
    }

    function removePeer(socketId) {
      const p = peers.get(socketId);
      if (p) {
        p.pc.close();
        peers.delete(socketId);
      }
      setRemotePeers((prev) => prev.filter((r) => r.socketId !== socketId));
    }

    let rawMicStream = null;
    async function startVoice() {
      try {
        rawMicStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        myStream = await applyNoiseSuppression(rawMicStream, 0.032);
        localStreamRef.current = myStream;
        setLocalStreamState(myStream);
      } catch (err) {
        console.error('[useChannelVoice] getUserMedia failed', err);
        if (rawMicStream) rawMicStream.getTracks().forEach((t) => t.stop());
        return;
      }

      function createPeer(remoteSocketId, userId, user, isInitiator) {
        if (peers.has(remoteSocketId)) return peers.get(remoteSocketId).pc;
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        myStream.getTracks().forEach((t) => pc.addTrack(t, myStream));
        const videoStream = localVideoStreamRef.current;
        if (videoStream?.getVideoTracks?.().length) {
          videoStream.getVideoTracks().forEach((t) => pc.addTrack(t, videoStream));
        }
        if (videoStream?.getAudioTracks?.().length) {
          videoStream.getAudioTracks().forEach((t) => pc.addTrack(t, videoStream));
        }
        const combinedStream = new MediaStream();
        peers.set(remoteSocketId, { pc, userId, user, stream: combinedStream, combinedStream });

        pc.ontrack = (e) => {
          const track = e.track;
          if (!track) return;
          const cur = peers.get(remoteSocketId);
          if (!cur?.combinedStream) return;
          cur.combinedStream.addTrack(track);
          cur.stream = cur.combinedStream;
          addRemotePeer(remoteSocketId, userId, user, cur.combinedStream);
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit('webrtc-ice', { to: remoteSocketId, candidate: e.candidate });
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
            removePeer(remoteSocketId);
          }
        };
        return pc;
      }

      function doOffer(remoteSocketId, userId, user) {
        const pc = createPeer(remoteSocketId, userId, user, true);
        pc.createOffer().then((offer) => {
          pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', {
            to: remoteSocketId,
            offer,
            room: 'channel',
            channelId,
          });
        }).catch((err) => console.error('[useChannelVoice] createOffer failed', err));
      }

      function runOffersForMembers(members) {
        (members || []).forEach(({ socketId: sid, userId: uid, user: u }) => {
          if (sid === socket.id) return;
          if (socket.id < sid) doOffer(sid, uid, u);
        });
      }

      socket.on('channel-joined', ({ channelId: chId, members }) => {
        if (chId !== channelId) return;
        runOffersForMembers(members);
      });
      runOffersForMembers(initialMembersRef.current);

      socket.on('user-joined', ({ userId: uid, user: u, socketId: sid }) => {
        if (!sid || sid === socket.id) return;
        if (socket.id < sid) doOffer(sid, uid, u);
      });

      socket.on('user-left', ({ socketId: sid }) => {
        if (sid) removePeer(sid);
      });

      socket.on('webrtc-offer', async ({ from, userId: uid, user: u, offer, room, channelId: chId }) => {
        if (room !== 'channel' || chId !== channelId) return;
        let p = peers.get(from);
        if (!p) {
          createPeer(from, uid, u, false);
          p = peers.get(from);
        }
        const pc = p?.pc;
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc-answer', { to: from, answer });
        } catch (err) {
          console.error('[useChannelVoice] setRemoteDescription/createAnswer failed', err);
        }
      });

      socket.on('webrtc-answer', async ({ from, answer }) => {
        const p = peers.get(from);
        if (!p?.pc) return;
        try {
          await p.pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('[useChannelVoice] setRemoteDescription answer failed', err);
        }
      });

      socket.on('webrtc-ice', async ({ from, candidate }) => {
        const p = peers.get(from);
        if (!p?.pc || !candidate) return;
        try {
          await p.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[useChannelVoice] addIceCandidate failed', err);
        }
      });
    }

    startVoice();

    return () => {
      socket.off('channel-joined');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice');
      peers.forEach((p) => p.pc.close());
      peers.clear();
      setRemotePeers([]);
      if (myStream) myStream.getTracks().forEach((t) => t.stop());
      if (rawMicStream) rawMicStream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStreamState(null);
    };
  }, [socket, channelId, enabled]);

  const prevVideoStreamRef = useRef(null);
  useEffect(() => {
    if (!enabled || !socket || !channelId || prevVideoStreamRef.current === localVideoStream) return;
    prevVideoStreamRef.current = localVideoStream;
    const peers = peersRef.current;
    if (peers.size === 0) return;
    const videoTracks = localVideoStream?.getVideoTracks?.() ?? [];
    const videoAudioTracks = localVideoStream?.getAudioTracks?.() ?? [];
    const myStream = localStreamRef.current;
    const renegotiate = (pc, remoteSocketId) => {
      pc.createOffer()
        .then((offer) => {
          pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', { to: remoteSocketId, offer, room: 'channel', channelId });
        })
        .catch((e) => console.error('[useChannelVoice] renegotiate failed', e));
    };
    peers.forEach((p, sid) => {
      if (!p.pc) return;
      const senders = p.pc.getSenders();
      const videoSenders = senders.filter((s) => s.track?.kind === 'video');
      const audioSendersFromScreen = senders.filter(
        (s) => s.track?.kind === 'audio' && myStream && !myStream.getAudioTracks().includes(s.track)
      );
      const hadVideo = videoSenders.length > 0;
      const hasVideo = videoTracks.length > 0;
      const hadScreenAudio = audioSendersFromScreen.length > 0;
      const hasScreenAudio = videoAudioTracks.length > 0;
      if (!hadVideo && !hasVideo && !hadScreenAudio && !hasScreenAudio) return;
      videoSenders.forEach((s) => p.pc.removeTrack(s));
      audioSendersFromScreen.forEach((s) => p.pc.removeTrack(s));
      if (hasVideo) {
        videoTracks.forEach((t) => p.pc.addTrack(t, localVideoStream));
      }
      if (hasScreenAudio) {
        videoAudioTracks.forEach((t) => p.pc.addTrack(t, localVideoStream));
      }
      renegotiate(p.pc, sid);
    });
  }, [localVideoStream, enabled, socket, channelId]);

  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const muted = micMuted || headphonesMuted;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [micMuted, headphonesMuted]);

  return {
    localStreamRef,
    localStream,
    remotePeers,
    micMuted,
    setMicMuted,
    headphonesMuted,
    setHeadphonesMuted,
  };
}
