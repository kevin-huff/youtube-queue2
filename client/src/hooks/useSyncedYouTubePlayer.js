import { useCallback, useEffect, useRef, useState } from 'react';

const YT_API_SRC = 'https://www.youtube.com/iframe_api';

const isValidVideoId = (id) => typeof id === 'string' && id.length === 11;
const clampVolume = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return Math.min(Math.max(Math.round(value), 0), 100);
};

export const useSyncedYouTubePlayer = ({
  videoId,
  channelConnected,
  addChannelListener,
  removeChannelListener,
  initialVolume,
  defaultMuted,
  onLocalPlay,
  onLocalPause,
  onLocalSeek,
  onLocalEnd,
  autoPlayOnReady = true
}) => {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [apiReady, setApiReady] = useState(() => !!(window.YT && window.YT.Player));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const initialVolumeState = clampVolume(initialVolume);
  const [volume, setVolume] = useState(() => initialVolumeState ?? 100);
  const [muted, setMuted] = useState(() => Boolean(defaultMuted));
  const callbacksRef = useRef({ onLocalPlay, onLocalPause, onLocalSeek, onLocalEnd });
  const lastKnownTimeRef = useRef(0);
  const suppressUntilRef = useRef(0);
  const previousReportedTimeRef = useRef(0);
  const lastNonZeroVolumeRef = useRef(
    initialVolumeState && initialVolumeState > 0 ? initialVolumeState : 50
  );

  useEffect(() => {
    callbacksRef.current = {
      onLocalPlay: typeof onLocalPlay === 'function' ? onLocalPlay : undefined,
      onLocalPause: typeof onLocalPause === 'function' ? onLocalPause : undefined,
      onLocalSeek: typeof onLocalSeek === 'function' ? onLocalSeek : undefined,
      onLocalEnd: typeof onLocalEnd === 'function' ? onLocalEnd : undefined
    };
  }, [onLocalPlay, onLocalPause, onLocalSeek, onLocalEnd]);

  const markSuppressed = useCallback(() => {
    suppressUntilRef.current = Date.now() + 750;
  }, []);

  const ensurePlayerSize = useCallback(() => {
    const iframe = playerRef.current?.getIframe?.();
    if (!iframe) return;
    if (iframe.style.width !== '100%') iframe.style.width = '100%';
    if (iframe.style.height !== '100%') iframe.style.height = '100%';
  }, []);

  const handlePlayerReady = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    ensurePlayerSize();

    const dur = player.getDuration?.();
    if (typeof dur === 'number' && dur > 0 && !Number.isNaN(dur)) {
      setDuration(dur);
    }

    const time = player.getCurrentTime?.();
    if (typeof time === 'number' && !Number.isNaN(time)) {
      lastKnownTimeRef.current = time;
      previousReportedTimeRef.current = time;
      setCurrentTime(time);
    }

    // Start playback when ready only if allowed
    if (autoPlayOnReady && typeof player.playVideo === 'function') {
      player.playVideo();
    }

    if (typeof initialVolumeState === 'number') {
      const clamped = initialVolumeState;
      player.setVolume(clamped);
      setVolume(clamped);
      if (clamped <= 0) {
        player.mute();
        setMuted(true);
      } else {
        player.unMute();
        setMuted(false);
        lastNonZeroVolumeRef.current = clamped;
      }
      return;
    }

    if (defaultMuted) {
      player.mute();
      setMuted(true);
      return;
    }

    player.unMute();
    setMuted(false);
    const currentVolume = clampVolume(player.getVolume?.());
    if (typeof currentVolume === 'number') {
      setVolume(currentVolume);
      if (currentVolume > 0) {
        lastNonZeroVolumeRef.current = currentVolume;
      }
    }
  }, [defaultMuted, initialVolumeState, ensurePlayerSize, autoPlayOnReady]);

  const handlePlayerStateChange = useCallback((event = {}) => {
    if (!window.YT) return;

    const player = event.target || playerRef.current;
    if (!player) return;

    const now = Date.now();
    const time = player.getCurrentTime?.();
    const dur = player.getDuration?.();

    if (typeof dur === 'number' && dur > 0 && !Number.isNaN(dur)) {
      setDuration(dur);
    }

    let current = previousReportedTimeRef.current;
    if (typeof time === 'number' && !Number.isNaN(time)) {
      current = time;
      lastKnownTimeRef.current = time;
      setCurrentTime((prev) => (typeof prev === 'number' && Math.abs(prev - time) < 0.05 ? prev : time));
    }

    const suppressed = suppressUntilRef.current && suppressUntilRef.current > now;
    const playerState = event.data;
    const previous = previousReportedTimeRef.current;
    const delta = Math.abs(current - previous);

    if (suppressed) {
      if (playerState === window.YT.PlayerState.PLAYING ||
          playerState === window.YT.PlayerState.PAUSED ||
          playerState === window.YT.PlayerState.BUFFERING) {
        // consume one suppression window per state change to avoid loops
        if (now > suppressUntilRef.current - 250) {
          suppressUntilRef.current = 0;
        }
      }
      previousReportedTimeRef.current = current;
      return;
    }

    if (playerState === window.YT.PlayerState.BUFFERING) {
      if (delta > 0.5 && callbacksRef.current.onLocalSeek) {
        callbacksRef.current.onLocalSeek(current);
      }
      previousReportedTimeRef.current = current;
      return;
    }

    if (playerState === window.YT.PlayerState.PAUSED) {
      if (delta > 0.5 && callbacksRef.current.onLocalSeek) {
        callbacksRef.current.onLocalSeek(current);
      }
      if (callbacksRef.current.onLocalPause) {
        callbacksRef.current.onLocalPause(current);
      }
      previousReportedTimeRef.current = current;
      return;
    }

    if (playerState === window.YT.PlayerState.PLAYING) {
      if (delta > 0.5 && callbacksRef.current.onLocalSeek) {
        callbacksRef.current.onLocalSeek(current);
      }
      if (callbacksRef.current.onLocalPlay) {
        callbacksRef.current.onLocalPlay(current);
      }
      previousReportedTimeRef.current = current;
      return;
    }

    if (playerState === window.YT.PlayerState.ENDED) {
      // Treat as a pause at end + explicit end signal
      if (callbacksRef.current.onLocalPause) {
        callbacksRef.current.onLocalPause(current);
      }
      if (callbacksRef.current.onLocalEnd) {
        callbacksRef.current.onLocalEnd(current);
      }
      previousReportedTimeRef.current = current;
      return;
    }

    previousReportedTimeRef.current = current;
  }, []);

  useEffect(() => {
    if (apiReady) return;

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousCallback) previousCallback();
      setApiReady(true);
    };

    if (!document.querySelector(`script[src="${YT_API_SRC}"]`)) {
      const tag = document.createElement('script');
      tag.src = YT_API_SRC;
      document.body.appendChild(tag);
    }

    return () => {
      window.onYouTubeIframeAPIReady = previousCallback || null;
    };
  }, [apiReady]);

  useEffect(() => {
    if (!apiReady) return;
    if (!containerRef.current) return;

    if (!playerRef.current) {
      if (!isValidVideoId(videoId)) {
        return; // wait until we have an actual video before creating the player
      }

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: autoPlayOnReady ? 1 : 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          disablekb: 1,
          fs: 1,
          playsinline: 1
        },
        events: {
          onReady: handlePlayerReady,
          onStateChange: handlePlayerStateChange
        }
      });
      ensurePlayerSize();
      return;
    }

    if (!isValidVideoId(videoId)) {
      playerRef.current.stopVideo();
      setCurrentTime(0);
      lastKnownTimeRef.current = 0;
      previousReportedTimeRef.current = 0;
      return;
    }

    const currentVideo = playerRef.current.getVideoData()?.video_id;
    if (currentVideo !== videoId) {
      playerRef.current.loadVideoById(videoId);
      setCurrentTime(0);
      lastKnownTimeRef.current = 0;
      previousReportedTimeRef.current = 0;
    } else {
      const player = playerRef.current;
      if (autoPlayOnReady && player && typeof player.playVideo === 'function') {
        player.playVideo();
      }
    }
    ensurePlayerSize();
  }, [apiReady, videoId, handlePlayerReady, handlePlayerStateChange, ensurePlayerSize, autoPlayOnReady]);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  const playLocal = useCallback((time, options = {}) => {
    const player = playerRef.current;
    if (!player || typeof player.playVideo !== 'function') return;
    const { source = 'local' } = options;
    if (source === 'remote') {
      markSuppressed();
    }
    
    // Get current time if not provided
    const currentTime = typeof time === 'number' ? time : (player.getCurrentTime?.() ?? 0);
    
    if (typeof time === 'number') {
      const current = player.getCurrentTime?.() ?? 0;
      if (Math.abs(current - time) > 0.5) {
        player.seekTo(time, true);
      }
      setCurrentTime(time);
      lastKnownTimeRef.current = time;
    }
    player.playVideo();
    
    // If this is a local action (user clicked play), broadcast it
    if (source === 'local' && callbacksRef.current.onLocalPlay) {
      callbacksRef.current.onLocalPlay(currentTime);
    }
  }, [markSuppressed]);

  const pauseLocal = useCallback((time, options = {}) => {
    const player = playerRef.current;
    if (!player || typeof player.pauseVideo !== 'function') return;
    const { source = 'local' } = options;
    if (source === 'remote') {
      markSuppressed();
    }
    
    // Get current time if not provided
    const currentTime = typeof time === 'number' ? time : (player.getCurrentTime?.() ?? 0);
    
    if (typeof time === 'number') {
      player.seekTo(time, true);
      setCurrentTime(time);
      lastKnownTimeRef.current = time;
    }
    player.pauseVideo();
    
    // If this is a local action (user clicked pause), broadcast it
    if (source === 'local' && callbacksRef.current.onLocalPause) {
      callbacksRef.current.onLocalPause(currentTime);
    }
  }, [markSuppressed]);

  const getCurrentTime = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.getCurrentTime !== 'function') return undefined;
    return player.getCurrentTime?.();
  }, []);

  const setVolumeLocal = useCallback((value) => {
    const player = playerRef.current;
    if (!player) return;

    const clamped = clampVolume(value) ?? 0;
    player.setVolume(clamped);
    setVolume(clamped);

    if (clamped <= 0) {
      if (!player.isMuted?.()) {
        player.mute();
      }
      setMuted(true);
    } else {
      if (player.isMuted?.()) {
        player.unMute();
      }
      setMuted(false);
      lastNonZeroVolumeRef.current = clamped;
    }
  }, []);

  const muteLocal = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (typeof volume === 'number' && volume > 0) {
      lastNonZeroVolumeRef.current = volume;
    }
    if (!player.isMuted?.()) {
      player.mute();
    }
    setMuted(true);
  }, [volume]);

  const unmuteLocal = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    const fallback = clampVolume(volume) ?? 50;
    const target = lastNonZeroVolumeRef.current && lastNonZeroVolumeRef.current > 0
      ? lastNonZeroVolumeRef.current
      : fallback > 0
        ? fallback
        : 50;

    if (player.isMuted?.()) {
      player.unMute();
    }
    player.setVolume(target);
    setMuted(false);
    setVolume(target);
    lastNonZeroVolumeRef.current = target;
  }, [volume]);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const mutedFlag = player.isMuted?.();
    if (mutedFlag || muted) {
      unmuteLocal();
    } else {
      muteLocal();
    }
  }, [muteLocal, unmuteLocal, muted]);

  const seekLocal = useCallback((time, options = {}) => {
    const player = playerRef.current;
    if (!player || typeof player.seekTo !== 'function' || typeof time !== 'number') return;
    const { source = 'local' } = options;
    if (source === 'remote') {
      markSuppressed();
    }
    player.seekTo(time, true);
    setCurrentTime(time);
    lastKnownTimeRef.current = time;
  }, [markSuppressed]);

  useEffect(() => {
    if (!apiReady) return undefined;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) {
        return;
      }

      ensurePlayerSize();

      const time = player.getCurrentTime?.();
      const dur = player.getDuration?.();

      if (typeof time === 'number' && !Number.isNaN(time)) {
        setCurrentTime(time);
        lastKnownTimeRef.current = time;
      }

      if (typeof dur === 'number' && dur > 0 && !Number.isNaN(dur)) {
        setDuration(dur);
      }

      const vol = clampVolume(player.getVolume?.());
      if (typeof vol === 'number') {
        setVolume((prev) => {
          if (typeof prev === 'number' && Math.abs(prev - vol) < 0.51) {
            return prev;
          }
          if (vol > 0) {
            lastNonZeroVolumeRef.current = vol;
          }
          return vol;
        });
      }

      const mutedFlag = player.isMuted?.();
      if (typeof mutedFlag === 'boolean') {
        setMuted((prev) => (prev === mutedFlag ? prev : mutedFlag));
      }
    }, 500);

    return () => clearInterval(interval);
  }, [apiReady, videoId, ensurePlayerSize]);

  useEffect(() => {
    if (!channelConnected) return;
    const playHandler = ({ time } = {}) => playLocal(time, { source: 'remote' });
    const pauseHandler = ({ time } = {}) => pauseLocal(time, { source: 'remote' });
    const seekHandler = ({ time } = {}) => seekLocal(time, { source: 'remote' });
    const playRegistered = addChannelListener('player:play', playHandler);
    const pauseRegistered = addChannelListener('player:pause', pauseHandler);
    const seekRegistered = addChannelListener('player:seek', seekHandler);

    return () => {
      if (playRegistered) removeChannelListener('player:play', playHandler);
      if (pauseRegistered) removeChannelListener('player:pause', pauseHandler);
      if (seekRegistered) removeChannelListener('player:seek', seekHandler);
    };
  }, [channelConnected, addChannelListener, removeChannelListener, playLocal, pauseLocal, seekLocal]);

  return {
    containerRef,
    playLocal,
    pauseLocal,
    getCurrentTime,
    seekLocal,
    setVolume: setVolumeLocal,
    mute: muteLocal,
    unmute: unmuteLocal,
    toggleMute,
    currentTime,
    duration,
    volume,
    muted,
    hasVideo: isValidVideoId(videoId)
  };
};
