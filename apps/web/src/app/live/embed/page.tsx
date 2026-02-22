'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Room, RoomEvent, Track } from 'livekit-client';

const isWatchMode = (m: string) => m === 'watch';

function LiveEmbedContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const url = searchParams.get('url');
  const mode = searchParams.get('mode') ?? 'watch';
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>('Connecting…');
  const [error, setError] = useState<string | null>(null);
  const [showTapForSound, setShowTapForSound] = useState(false);
  const roomRef = useRef<Room | null>(null);

  const enableSound = useCallback(() => {
    const el = videoRef.current;
    if (el) {
      el.muted = false;
      el.play().catch(() => {});
    }
    setShowTapForSound(false);
  }, []);

  useEffect(() => {
    if (!token || !url) {
      setError('Missing token or url');
      return;
    }

    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.Connected, () => setStatus('Connected'));
    room.on(RoomEvent.Disconnected, () => setStatus('Disconnected'));
    room.on(RoomEvent.MediaDevicesError, (e) => setError(String(e)));
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video && videoRef.current) {
        track.attach(videoRef.current);
      }
    });

    (async () => {
      try {
        await room.connect(url, token, {
          autoSubscribe: true,
        });

        if (mode === 'broadcast') {
          setStatus('Starting camera…');
          await room.localParticipant.enableCameraAndMicrophone();
          setStatus('You are live');
          const pubs = Array.from(room.localParticipant.videoTrackPublications.values());
          const pub = pubs[0];
          if (pub?.track && videoRef.current) pub.track.attach(videoRef.current);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      room.disconnect();
      roomRef.current = null;
    };
  }, [token, url, mode]);

  // Watch mode: ensure sound on; show "Tap to enable sound" if browser muted autoplay
  useEffect(() => {
    if (mode !== 'watch' || !videoRef.current) return;
    const el = videoRef.current;
    const checkMuted = () => {
      if (el.muted) setShowTapForSound(true);
    };
    el.addEventListener('loadeddata', checkMuted);
    const t = setTimeout(checkMuted, 1500);
    return () => {
      el.removeEventListener('loadeddata', checkMuted);
      clearTimeout(t);
    };
  }, [mode]);

  // Lock to inline only: prevent fullscreen so video stays in top half (no fullscreen takeover)
  useEffect(() => {
    if (mode !== 'watch') return;
    const exitFullscreen = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    document.addEventListener('fullscreenchange', exitFullscreen);
    const id = setTimeout(() => {
      const el = videoRef.current;
      if (el) {
        const noop = () => Promise.reject(new Error('Fullscreen disabled'));
        if (typeof el.requestFullscreen === 'function') (el as HTMLVideoElement).requestFullscreen = noop;
        const webkitEl = el as HTMLVideoElement & { webkitRequestFullscreen?: () => void };
        if (typeof webkitEl.webkitRequestFullscreen === 'function') webkitEl.webkitRequestFullscreen = noop;
      }
    }, 100);
    return () => {
      clearTimeout(id);
      document.removeEventListener('fullscreenchange', exitFullscreen);
    };
  }, [mode]);

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <p className="text-red-400 text-center">{error}</p>
      </div>
    );
  }

  const muted = mode === 'broadcast';

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center relative">
      <p className="text-white/80 text-sm mb-2">{status}</p>
      {/* Viewers: sound on (unmuted); no fullscreen so layout stays top-half only in app */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nofullscreen nodownload noremoteplayback"
        className="w-full max-w-2xl aspect-video bg-slate-900 rounded-lg object-contain"
      />
      {isWatchMode(mode) && (
        <p className="text-white/60 text-xs mt-1">Sound on — tap below if you don’t hear audio</p>
      )}
      {showTapForSound && (
        <button
          type="button"
          onClick={enableSound}
          className="absolute inset-0 flex items-center justify-center bg-black/60 text-white font-medium py-2 px-4 rounded-lg"
        >
          Tap to enable sound
        </button>
      )}
    </div>
  );
}

export default function LiveEmbedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center p-4"><p className="text-white/80">Loading…</p></div>}>
      <LiveEmbedContent />
    </Suspense>
  );
}
