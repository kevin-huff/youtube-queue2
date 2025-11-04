import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Chip,
  Grid,
  Paper,
  Typography,
  alpha
} from '@mui/material';
import { keyframes } from '@emotion/react';
import { useSocket } from '../contexts/SocketContext';
import VotingOverlay from '../components/VotingOverlay';

const SHUFFLE_DURATION_MS = 30000;
const DEFAULT_SHUFFLE_AUDIO_SRC = process.env.REACT_APP_SHUFFLE_AUDIO || '/media/shuffle-theme.mp3';
const RING_TILT_DEG = 16;
// Phase timing (must sum to <= SHUFFLE_DURATION_MS)
const SCATTER_END_MS = 9000;   // initial scatter
const RIFFLE_END_MS = 14000;   // card-like shuffle interleave
const STAR_PHASE_START_MS = RIFFLE_END_MS; // maintain legacy name usage
const SCATTER_PHASE_MS = 20000; // end of star flyby, then settle

const STAR_POSITIONS = [
  { x: 0, y: -260, z: 220 },
  { x: 110, y: -90, z: -180 },
  { x: 230, y: -40, z: 140 },
  { x: 140, y: 60, z: -160 },
  { x: 190, y: 210, z: 100 },
  { x: 0, y: 120, z: 200 },
  { x: -190, y: 210, z: 80 },
  { x: -140, y: 60, z: -180 },
  { x: -230, y: -40, z: 120 },
  { x: -110, y: -90, z: -140 }
];

const floatKeyframes = keyframes`
  0% { transform: perspective(1200px) rotateX(7deg) rotateY(-6deg) translateY(0); }
  40% { transform: perspective(1200px) rotateX(5deg) rotateY(-5deg) translateY(-6px); }
  70% { transform: perspective(1200px) rotateX(7deg) rotateY(-7deg) translateY(3px); }
  100% { transform: perspective(1200px) rotateX(7deg) rotateY(-6deg) translateY(0); }
`;

const pulseKeyframes = keyframes`
  0% { box-shadow: 0 0 0 rgba(20, 220, 255, 0); }
  60% { box-shadow: 0 0 35px rgba(20, 220, 255, 0.35); }
  100% { box-shadow: 0 0 0 rgba(20, 220, 255, 0); }
`;

const auroraKeyframes = keyframes`
  0% { opacity: 0; transform: scale(1.1) rotate(0deg); }
  15% { opacity: 0.9; }
  50% { opacity: 1; transform: scale(1) rotate(14deg); }
  80% { opacity: 0.85; transform: scale(1.08) rotate(-8deg); }
  100% { opacity: 0; transform: scale(1.04) rotate(0deg); }
`;

const nebulaDriftKeyframes = keyframes`
  0% { transform: translate(-12%, -10%) scale(1); opacity: 0.35; }
  35% { opacity: 0.7; }
  60% { transform: translate(8%, 6%) scale(1.25); opacity: 0.9; }
  100% { transform: translate(-18%, 8%) scale(1.1); opacity: 0.4; }
`;

const ringSpinKeyframes = keyframes`
  0% { transform: scale(0.98) rotateZ(0deg); }
  40% { transform: scale(1.04) rotateZ(240deg); }
  70% { transform: scale(1.08) rotateZ(540deg); }
  100% { transform: scale(1.02) rotateZ(720deg); }
`;

const cardFlipKeyframes = keyframes`
  0% { transform: rotateY(90deg) translateZ(-180px) scale(0.45); opacity: 0; filter: blur(18px); }
  12% { opacity: 1; filter: blur(0); }
  46% { transform: rotateY(0deg) translateZ(42px) scale(1.12); }
  82% { transform: rotateY(-28deg) translateZ(58px) scale(1.1); }
  100% { transform: rotateY(-420deg) translateZ(0px) scale(1); opacity: 0.9; }
`;

const streakKeyframes = keyframes`
  0% { transform: translate3d(-140%, -160%, 0) scale(0.6); opacity: 0; }
  15% { opacity: 0.6; }
  60% { transform: translate3d(120%, 120%, 0) scale(1.2); opacity: 0.35; }
  100% { transform: translate3d(180%, 160%, 0) scale(0.2); opacity: 0; }
`;

const pulseTextKeyframes = keyframes`
  0% { opacity: 0.65; text-shadow: 0 0 24px rgba(92, 225, 255, 0.4); }
  50% { opacity: 1; text-shadow: 0 0 40px rgba(255, 130, 236, 0.65); }
  100% { opacity: 0.65; text-shadow: 0 0 24px rgba(92, 225, 255, 0.4); }
`;

const flybyGlowKeyframes = keyframes`
  0% { box-shadow: 0 0 18px rgba(92, 225, 255, 0.38); filter: brightness(0.9); }
  35% { box-shadow: 0 0 65px rgba(255, 157, 255, 0.55); filter: brightness(1.25); }
  70% { box-shadow: 0 0 52px rgba(92, 225, 255, 0.45); filter: brightness(1.1); }
  100% { box-shadow: 0 0 18px rgba(92, 225, 255, 0.38); filter: brightness(0.95); }
`;

const starPulseKeyframes = keyframes`
  0% { box-shadow: 0 0 20px rgba(255, 157, 255, 0.45); filter: saturate(1); }
  45% { box-shadow: 0 0 55px rgba(255, 202, 255, 0.65); filter: saturate(1.25); }
  100% { box-shadow: 0 0 20px rgba(255, 157, 255, 0.45); filter: saturate(1); }
`;

const settleGlideKeyframes = keyframes`
  0% { box-shadow: 0 0 15px rgba(92, 225, 255, 0.35); filter: brightness(1); }
  50% { box-shadow: 0 0 28px rgba(92, 225, 255, 0.55); filter: brightness(1.12); }
  100% { box-shadow: 0 0 15px rgba(92, 225, 255, 0.35); filter: brightness(1); }
`;

const hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33 + value.charCodeAt(i)) >>> 0; // eslint-disable-line no-bitwise
  }
  return hash;
};

// Seeded RNG (mulberry32) for deterministic shuffles per shuffle event
const makeSeededRng = (seed) => {
  let t = seed >>> 0; // eslint-disable-line no-bitwise
  return () => {
    // mulberry32
    t += 0x6D2B79F5; // eslint-disable-line no-bitwise
    let x = t; // eslint-disable-line no-bitwise
    x = Math.imul(x ^ (x >>> 15), 1 | x); // eslint-disable-line no-bitwise
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); // eslint-disable-line no-bitwise
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296; // eslint-disable-line no-bitwise
  };
};

const seededShuffle = (arr, seed) => {
  const a = arr.slice();
  const rand = makeSeededRng(seed || 1);
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
};

const computeCardSeed = (item, index) => {
  const base =
    item?.id ??
    item?.queueItemId ??
    item?.videoId ??
    item?.title ??
    item?.submitterUsername ??
    'card';
  return hashString(`${base}:${index}`);
};

const getScatterTransform = (seed) => {
  const angle = seed % 360;
  const radians = (angle * Math.PI) / 180;
  const distance = 260 + (seed % 210);
  const x = Math.cos(radians) * distance;
  const y = Math.sin(radians) * distance;
  const z = ((seed >> 3) % 360) - 180; // eslint-disable-line no-bitwise
  const tilt = ((seed >> 5) % 60) - 30; // eslint-disable-line no-bitwise
  const spin = ((seed >> 7) % 120) - 60; // eslint-disable-line no-bitwise
  const scale = 0.92 + ((seed % 50) / 100);

  return {
    transform: `translate3d(${x}px, ${y}px, ${z}px) rotateX(${tilt}deg) rotateZ(${spin}deg) scale(${scale.toFixed(
      2
    )})`,
    jitterDelay: seed % 320
  };
};

const getStarTransform = (seed, index) => {
  const point = STAR_POSITIONS[index % STAR_POSITIONS.length];
  const swayX = ((seed >> 3) % 60) - 30; // eslint-disable-line no-bitwise
  const swayY = ((seed >> 2) % 60) - 30; // eslint-disable-line no-bitwise
  const depth = point.z + (((seed >> 4) % 220) - 110); // eslint-disable-line no-bitwise
  const tilt = ((seed >> 5) % 28) - 14; // eslint-disable-line no-bitwise
  const spin = ((seed >> 6) % 50) - 25; // eslint-disable-line no-bitwise
  const scale = 0.88 + ((seed % 45) / 100);

  return `translate3d(${point.x + swayX}px, ${point.y + swayY}px, ${depth}px) rotateX(${tilt}deg) rotateZ(${spin}deg) scale(${scale.toFixed(2)})`;
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Riffle/bridge-like shuffle transform: two piles slide/arc and interleave
const getRiffleTransform = (seed, index, t) => {
  const leftSide = (seed & 1) === 0; // eslint-disable-line no-bitwise
  const randX = ((seed >> 2) % 80) - 40; // eslint-disable-line no-bitwise
  const randY = ((seed >> 3) % 120) - 60; // eslint-disable-line no-bitwise
  const depth = ((seed >> 4) % 160) - 80; // eslint-disable-line no-bitwise
  const tiltY = ((seed >> 5) % 20) - 10; // eslint-disable-line no-bitwise
  const spinZ = ((seed >> 6) % 28) - 14; // eslint-disable-line no-bitwise

  const fromX = (leftSide ? -280 : 280) + randX;
  const toX = randX * 0.25;
  const fromY = randY * 1.2;
  const toY = randY * 0.3;
  const fromZ = -120 + depth * 0.3;
  const toZ = 40 + depth * 0.2;

  const tt = clamp01(t);
  const x = lerp(fromX, toX, tt);
  const y = lerp(fromY, toY, tt);
  const z = lerp(fromZ, toZ, tt);

  // Add a slight arc using tt easing
  const arc = Math.sin(tt * Math.PI) * 18;

  return `translate3d(${x}px, ${y - arc}px, ${z}px) rotateX(${tiltY}deg) rotateZ(${leftSide ? -10 : 10 + spinZ}deg) scale(${(0.9 + tt * 0.12).toFixed(2)})`;
};

const formatDuration = (seconds) => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds <= 0) {
    return '--:--';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getQueueAlias = (item) =>
  item?.submitterAlias || item?.submitter?.alias || 'Anonymous';

const QueueOverlay = () => {
  const { channelName } = useParams();
  const {
    connectToChannel,
    disconnectFromChannel,
    queue,
    currentlyPlaying,
    channelConnected,
    topEight,
    vipQueue,
    lastShuffle,
    votingState,
    settings,
    addChannelListener,
    removeChannelListener
  } = useSocket();
  const [shuffleVisual, setShuffleVisual] = useState(null);
  const [progress, setProgress] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [sbAudioError, setSbAudioError] = useState(false);
  // Removed predicted placement feature; no active cup tracking needed
  const [socialRevealActive, setSocialRevealActive] = useState(false);
  const shuffleSignatureRef = useRef(null);
  const audioRef = useRef(null);
  // Track multiple concurrent soundboard audio instances
  const sbAudiosRef = useRef(new Set());
  const timerRef = useRef(null);
  const rafRef = useRef(null);
  const lockSoundCtxRef = useRef(null);
  const lockedJudgeIdsRef = useRef(new Set());
  const previousVotingItemRef = useRef(null);
  // removed: requestedCupIdsRef (no standings prefetch)
  const socialRevealItemRef = useRef(null);
  const elapsedMs = useMemo(() => (progress / 100) * SHUFFLE_DURATION_MS, [progress]);
  const shuffleStage = useMemo(() => {
    if (!shuffleVisual) {
      return 'idle';
    }
    if (elapsedMs < SCATTER_END_MS) return 'scatter';
    if (elapsedMs < RIFFLE_END_MS) return 'riffle';
    if (elapsedMs < SCATTER_PHASE_MS) return 'star';
    return 'settle';
  }, [shuffleVisual, elapsedMs]);
  const isScatterStage = shuffleStage === 'scatter';
  const isRiffleStage = shuffleStage === 'riffle';
  const isStarStage = shuffleStage === 'star';
  const isSettleStage = shuffleStage === 'settle';

  // removed: derivedCupId/activeCupId logic used only for predictions

  const SERVER_BASE = process.env.REACT_APP_SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const shuffleAudioSrc = useMemo(() => {
    const raw = settings?.shuffle_audio_url;
    const base = (SERVER_BASE || '').replace(/\/$/, '');
    if (typeof raw === 'string' && raw.trim().length) {
      const val = raw.trim();
      if (val.startsWith('/')) return `${base}${val}`;
      return val;
    }
    return DEFAULT_SHUFFLE_AUDIO_SRC;
  }, [settings?.shuffle_audio_url, SERVER_BASE]);

  // removed: standings prefetch effect (no predictions)

  // removed: predicted placement logic entirely

  const playLockTone = useCallback(async () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }

      let ctx = lockSoundCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContextClass();
        lockSoundCtxRef.current = ctx;
      }

      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(880, now);

      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.16, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + 0.5);
    } catch (error) {
      console.warn('Failed to play lock tone:', error);
    }
  }, []);

  useEffect(() => {
    if (!channelName) {
      return undefined;
    }
    connectToChannel(channelName, { explicit: true, loadSettings: true });
    return () => disconnectFromChannel();
  }, [channelName, connectToChannel, disconnectFromChannel]);

  useEffect(() => () => {
    if (lockSoundCtxRef.current) {
      try {
        lockSoundCtxRef.current.close();
      } catch (error) {
        // ignore cleanup errors
      }
      lockSoundCtxRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!votingState || !Array.isArray(votingState.judges)) {
      lockedJudgeIdsRef.current = new Set();
      previousVotingItemRef.current = null;
      socialRevealItemRef.current = null;
      setSocialRevealActive(false);
      return;
    }

    if (previousVotingItemRef.current !== votingState.queueItemId) {
      lockedJudgeIdsRef.current = new Set();
      previousVotingItemRef.current = votingState.queueItemId;
      socialRevealItemRef.current = votingState.queueItemId;
      setSocialRevealActive(false);
    }

    const knownLocks = new Set(lockedJudgeIdsRef.current);

    votingState.judges.forEach((judge) => {
      if (judge?.id && judge.locked && !knownLocks.has(judge.id)) {
        knownLocks.add(judge.id);
        void playLockTone();
      }
    });

    lockedJudgeIdsRef.current = knownLocks;
  }, [votingState, playLockTone]);

  useEffect(() => {
    if (!votingState) {
      socialRevealItemRef.current = null;
      setSocialRevealActive(false);
      return;
    }

    const currentItemId = votingState.queueItemId ?? null;
    if (socialRevealItemRef.current !== currentItemId) {
      socialRevealItemRef.current = currentItemId;
      setSocialRevealActive(false);
    }

    const stage = (votingState.stage || '').toLowerCase();
    const revealedSocial =
      typeof votingState.revealedSocial === 'number' ||
      Boolean(votingState.socialBreakdown);
    if (stage === 'social' || stage === 'completed' || revealedSocial) {
      setSocialRevealActive(true);
    }
  }, [votingState]);

  useEffect(() => {
    if (!lastShuffle) {
      return;
    }
    const signature = `${lastShuffle?.timestamp || ''}:${lastShuffle?.seed || ''}:${lastShuffle?.initiatedBy || ''}`;
    if (shuffleSignatureRef.current === signature) {
      return;
    }
    shuffleSignatureRef.current = signature;
    setShuffleVisual({
      payload: lastShuffle,
      startedAt: Date.now()
    });
  }, [lastShuffle]);

  const shuffleSeed = useMemo(() => {
    if (!shuffleVisual) return null;
    try {
      const seedRaw = `${shuffleVisual?.payload?.seed ?? ''}:${shuffleVisual?.startedAt ?? ''}`;
      return hashString(`shuffle:${seedRaw}`);
    } catch (_) {
      return hashString(`shuffle:${Date.now()}`);
    }
  }, [shuffleVisual]);

  useEffect(() => {
    if (!shuffleVisual) {
      setProgress(0);
      shuffleSignatureRef.current = null;
      return;
    }

    setAudioError(false);

    let shuffleUrl = shuffleAudioSrc;
    try {
      const u = new URL(shuffleUrl, window.location.origin);
      // If page is HTTPS and URL is HTTP, prefer HTTPS scheme for the same host
      if (window.location.protocol === 'https:' && u.protocol === 'http:') {
        shuffleUrl = `https://${u.host}${u.pathname}${u.search}${u.hash}`;
      } else {
        shuffleUrl = u.toString();
      }
    } catch (_) {
      // leave as-is on URL parse issues
    }
    // eslint-disable-next-line no-console
    console.info('QueueOverlay: attempting to play shuffle audio', shuffleUrl);
    const audio = new Audio(shuffleUrl);
    try { audio.crossOrigin = 'anonymous'; } catch (_) {}
    audioRef.current = audio;
    audio.volume = 1;

    const playAudio = async () => {
      try {
        await audio.play();
      } catch (error) {
        console.warn('Shuffle audio playback failed:', error);
        setAudioError(true);
      }
    };

    void playAudio();

    const start = shuffleVisual.startedAt;
    let cancelled = false;

    const tick = () => {
      if (cancelled) {
        return;
      }
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / SHUFFLE_DURATION_MS) * 100);
      setProgress(pct);
      if (elapsed < SHUFFLE_DURATION_MS) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    timerRef.current = setTimeout(() => {
      setShuffleVisual(null);
    }, SHUFFLE_DURATION_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    };
  }, [shuffleVisual, shuffleAudioSrc]);

  // Soundboard playback: play sounds intended for overlay or all
  useEffect(() => {
    if (!channelConnected) {
      return () => {};
    }
    const handler = (payload = {}) => {
      try {
        // Debug: confirm event reception
        // eslint-disable-next-line no-console
        console.info('soundboard:play received (overlay):', payload);
        if (!payload.url) return;
        let url = payload.url;
        const base = (SERVER_BASE || '').replace(/\/$/, '');
        if (url.startsWith('/')) {
          url = `${base}${url}`;
        }
        try {
          const u = new URL(url, window.location.origin);
          if (window.location.protocol === 'https:' && u.protocol === 'http:') {
            url = `https://${u.host}${u.pathname}${u.search}${u.hash}`;
          } else {
            url = u.toString();
          }
        } catch (_) {
          // leave as-is on URL parse issues
        }
        const audio = new Audio(url);
        try { audio.crossOrigin = 'anonymous'; } catch (_) {}
        audio.volume = 1;
        audio.play().catch((err) => {
          console.warn('Soundboard audio playback failed:', err);
          setSbAudioError(true);
        });
        // Keep track so multiple can overlap and we can clean up when they finish
        try {
          sbAudiosRef.current.add(audio);
          const cleanup = () => {
            try { sbAudiosRef.current.delete(audio); } catch (_) {}
          };
          audio.addEventListener('ended', cleanup, { once: true });
          audio.addEventListener('error', cleanup, { once: true });
        } catch (_) {}
      } catch (_) {}
    };
    addChannelListener('soundboard:play', handler);
    return () => removeChannelListener('soundboard:play', handler);
  }, [addChannelListener, removeChannelListener, channelConnected]);

  // Cleanup all active soundboard audio on unmount
  useEffect(() => () => {
    try {
      for (const a of sbAudiosRef.current) {
        try { a.pause(); } catch (_) {}
        try { a.currentTime = 0; } catch (_) {}
      }
      sbAudiosRef.current.clear?.();
    } catch (_) {}
  }, []);

  const vipIndexMap = useMemo(() => {
    try {
      const ids = Array.isArray(vipQueue) ? vipQueue.map((v) => Number(v)) : [];
      return new Map(ids.map((id, idx) => [id, idx]));
    } catch (_) {
      return new Map();
    }
  }, [vipQueue]);

  const sortedQueue = useMemo(() => {
    const items = queue.slice();

    const isVip = (id) => vipIndexMap.has(Number(id));
    const vipPos = (id) => vipIndexMap.get(Number(id));

    return items.sort((a, b) => {
      // 1) Currently playing always first
      const aNow = currentlyPlaying?.id === a.id;
      const bNow = currentlyPlaying?.id === b.id;
      if (aNow && !bNow) return -1;
      if (bNow && !aNow) return 1;

      // 2) VIPs next, FIFO using vipQueue order
      const aVip = isVip(a.id);
      const bVip = isVip(b.id);
      if (aVip && !bVip) return -1;
      if (bVip && !aVip) return 1;
      if (aVip && bVip) return vipPos(a.id) - vipPos(b.id);

      // 3) Top Eight after VIPs (preserve earlier intent)
      const aTop = a.status === 'TOP_EIGHT';
      const bTop = b.status === 'TOP_EIGHT';
      if (aTop && !bTop) return -1;
      if (bTop && !aTop) return 1;

      // 4) Fallback by position
      const apos = a.position ?? Number.MAX_SAFE_INTEGER;
      const bpos = b.position ?? Number.MAX_SAFE_INTEGER;
      return apos - bpos;
    });
  }, [queue, currentlyPlaying, vipIndexMap]);

  const shuffleItems = useMemo(() => {
    // During a shuffle animation, randomize the display order to avoid overfeaturing top items
    if (shuffleVisual) {
      const base = sortedQueue.slice();
      return seededShuffle(base, shuffleSeed || 1);
    }

    // When not shuffling, keep any topEight emphasis for static overlay state
    if (Array.isArray(topEight) && topEight.length) {
      const seen = new Set(topEight.map((item) => item.id));
      const remainder = sortedQueue.filter((item) => (item && item.id ? !seen.has(item.id) : true));
      return [...topEight, ...remainder];
    }

    return sortedQueue;
  }, [shuffleVisual, shuffleSeed, topEight, sortedQueue]);

  const finalRankMap = useMemo(() => {
    const map = new Map();
    if (shuffleVisual?.payload?.finalOrder?.length) {
      shuffleVisual.payload.finalOrder.forEach((item, index) => {
        map.set(item.id, index + 1);
      });
    }
    return map;
  }, [shuffleVisual]);

const ringLayout = useMemo(() => {
    if (!shuffleItems.length) {
      return [];
    }

    const maxRingSize = (() => {
      if (!shuffleItems.length) return 0;
      if (shuffleSeed) {
        const size = 6 + (shuffleSeed % 5); // 6..10
        return Math.min(shuffleItems.length, size);
      }
      return shuffleItems.length <= 8 ? shuffleItems.length : 8;
    })();
    const groups = [];

    shuffleItems.forEach((item, index) => {
      const ringIndex = Math.floor(index / maxRingSize);
      const indexWithin = index % maxRingSize;

    if (!groups[ringIndex]) {
      groups[ringIndex] = [];
    }

    groups[ringIndex].push({
      item,
      globalIndex: index,
      indexWithin
    });
    });

    return groups;
  }, [shuffleItems]);

  const overlayBackground = `
    radial-gradient(circle at 18% 15%, rgba(66, 189, 255, 0.18), transparent 40%),
    radial-gradient(circle at 82% 8%, rgba(255, 110, 199, 0.25), transparent 45%),
    radial-gradient(circle at 52% 92%, rgba(126, 255, 173, 0.18), transparent 45%),
    #04060f
  `;
  const votingStage = (votingState?.stage || '').toLowerCase();
  const showVotingOverlay = Boolean(
    votingState && !['completed', 'cancelled'].includes(votingStage)
  );

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: overlayBackground,
        color: '#ffffff',
        p: { xs: 3, md: 5, xl: 7 },
        boxSizing: 'border-box',
        fontFamily: '"Poppins", "Roboto", "Inter", sans-serif',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {showVotingOverlay && (
        <VotingOverlay
          votingState={votingState}
          currentlyPlaying={currentlyPlaying}
        />
      )}
      {shuffleVisual && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            pointerEvents: 'none',
            overflow: 'hidden'
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: '-35%',
              background: `
                radial-gradient(circle at center, ${alpha('#5ce1ff', 0.45)}, transparent 62%),
                radial-gradient(circle at 30% 40%, ${alpha('#ff89df', 0.35)}, transparent 55%)
              `,
              filter: 'blur(95px)',
              animation: `${auroraKeyframes} ${SHUFFLE_DURATION_MS}ms ease-in-out forwards`
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isScatterStage ? 1 : 0,
              transition: 'opacity 500ms ease-out'
            }}
          >
            <Box
              sx={{
                width: 'min(34vw, 320px)',
                height: 'min(34vw, 320px)',
                borderRadius: '28% 72% 63% 37% / 42% 41% 59% 58%',
                background: `linear-gradient(130deg, ${alpha('#1d3f70', 0.6)}, transparent)`,
                filter: 'blur(12px)',
                position: 'relative',
                animation: `${nebulaDriftKeyframes} 4000ms ease-in-out infinite`
              }}
            >
              {Array.from({ length: 14 }).map((_, idx) => (
                <Box
                  // eslint-disable-next-line react/no-array-index-key
                  key={`spark-${idx}`}
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: alpha(idx % 2 === 0 ? '#5ce1ff' : '#ff9dff', 0.85),
                    transform: `rotate(${(360 / 14) * idx}deg) translateX(${idx % 2 === 0 ? '46%' : '60%'})`,
                    boxShadow: `0 0 18px ${alpha(idx % 2 === 0 ? '#5ce1ff' : '#ff9dff', 0.75)}`,
                    animation: `${pulseKeyframes} ${1400 + idx * 55}ms ease-in-out infinite`
                  }}
                />
              ))}
            </Box>
          </Box>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: `
                conic-gradient(from 210deg, ${alpha('#061434', 0.85)}, ${alpha('#10264a', 0.45)}, ${alpha('#060b1a', 0.92)})
              `,
              mixBlendMode: 'screen',
              animation: `${nebulaDriftKeyframes} ${SHUFFLE_DURATION_MS}ms ease-in-out forwards`
            }}
          />
          {Array.from({ length: 6 }).map((_, index) => (
            <Box
              // eslint-disable-next-line react/no-array-index-key
              key={`streak-${index}`}
              sx={{
                position: 'absolute',
                top: `${8 + index * 14}%`,
                left: '-45%',
                width: `${55 + index * 10}%`,
                height: 3,
                background: `linear-gradient(90deg, transparent, ${alpha('#5ce1ff', 0.5)}, transparent)`,
                opacity: 0.25 + index * 0.1,
                transform: `rotate(${8 + index * 4}deg)`,
                animation: `${streakKeyframes} ${10000 + index * 800}ms ease-out ${index * 280}ms forwards`
              }}
            />
          ))}

          {Array.from({ length: 3 }).map((_, idx) => (
            <Box
              // eslint-disable-next-line react/no-array-index-key
              key={`ring-${idx}`}
              sx={{
                position: 'absolute',
                top: `${15 + idx * 18}%`,
                left: '50%',
                width: `${idx === 0 ? 60 : idx === 1 ? 38 : 24}vw`,
                height: `${idx === 0 ? 60 : idx === 1 ? 38 : 24}vw`,
                maxWidth: `${idx === 0 ? 720 : idx === 1 ? 460 : 300}px`,
                maxHeight: `${idx === 0 ? 720 : idx === 1 ? 460 : 300}px`,
                borderRadius: '50%',
                border: `1px dashed ${alpha('#5ce1ff', 0.15 + idx * 0.05)}`,
                transform: 'translateX(-50%)',
                animation: `${pulseTextKeyframes} ${2600 + idx * 420}ms ease-in-out infinite`,
                opacity: isScatterStage ? 1 : 0,
                transition: 'opacity 600ms ease'
              }}
            />
          ))}

          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(92vw, 920px)',
              height: 'min(92vw, 920px)',
              perspective: '2400px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                height: '100%',
                transformStyle: 'preserve-3d',
                transform: `rotateX(${RING_TILT_DEG}deg)`
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  transformStyle: 'preserve-3d',
                  animation: `${ringSpinKeyframes} ${SHUFFLE_DURATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards`,
                  animationPlayState: isSettleStage ? 'running' : 'paused'
                }}
              >
                {ringLayout.map((ringItems, ringIndex) => {
                  const ringCount = ringItems.length;
                  const ringHash = hashString(`ring:${shuffleSeed ?? 0}:${ringIndex}`);
                  const offsetDeg = (ringHash % 360); // eslint-disable-line no-bitwise
                  const radiusJitter = ((ringHash % 41) - 20); // [-20, 20] px
                  const baseRadius = 260 + ringIndex * 180;
                  const radius = baseRadius + radiusJitter;
                  const baseScale = Math.max(0.85, 1 - ringIndex * 0.05);
                  const scaleJitter = (((ringHash % 9) - 4) / 100); // ~ +/-0.04
                  const cardScale = Math.max(0.8, baseScale + scaleJitter);
                  const cardWidth = Math.max(240 - ringIndex * 30, 160);

                  return ringItems.map(({ item, globalIndex, indexWithin }) => {
                    const angle = offsetDeg + (360 / ringCount) * indexWithin;
                    const rank = finalRankMap.get(item.id);
                    const seed = computeCardSeed(item, globalIndex);
                    const scatter = getScatterTransform(seed);
                    const finalTransform = `rotateZ(${angle}deg) translateY(-${radius}px) rotateZ(${-angle}deg) rotateX(${-RING_TILT_DEG}deg)`;
                    const midTransform = `translate3d(${(seed % 180) - 90}px, ${((seed >> 2) % 180) - 90}px, ${((seed >> 4) % 240) - 120}px) rotateX(${((seed >> 3) % 30) - 15}deg) rotateZ(${((seed >> 5) % 60) - 30}deg) scale(0.96)`;
                    const starTransform = getStarTransform(seed, globalIndex);

                    let transformValue = scatter.transform;
                    if (isSettleStage) {
                      transformValue = finalTransform;
                    } else if (isStarStage) {
                      transformValue = starTransform;
                    } else if (isRiffleStage) {
                      const riffleT = (elapsedMs - SCATTER_END_MS) / Math.max(1, (RIFFLE_END_MS - SCATTER_END_MS));
                      transformValue = getRiffleTransform(seed, globalIndex, riffleT);
                    } else if (elapsedMs > SCATTER_END_MS * 0.7) {
                      transformValue = midTransform;
                    }

                    const transitionDuration = isSettleStage
                      ? 1100 + (seed % 360)
                      : isStarStage
                        ? 520 + (seed % 260)
                        : isRiffleStage
                          ? 260 + (seed % 160)
                          : 320 + (seed % 200);

                    const transitionEasing = isSettleStage
                      ? 'cubic-bezier(0.19, 1, 0.22, 1)'
                      : isStarStage
                        ? 'cubic-bezier(0.16, 0.84, 0.24, 0.99)'
                        : isRiffleStage
                          ? 'cubic-bezier(0.2, 0.8, 0.2, 1)'
                          : 'cubic-bezier(0.37, 0.01, 0.67, 1.01)';

                    const transitionDelay = isSettleStage
                      ? `${Math.min(globalIndex * 24 + (seed % 80), 420)}ms`
                      : isStarStage
                        ? `${seed % 160}ms`
                        : isRiffleStage
                          ? `${seed % 80}ms`
                          : `${scatter.jitterDelay}ms`;

                    const glowAnimation = isSettleStage
                      ? `${settleGlideKeyframes} ${2600 + (seed % 700)}ms ease-in-out ${(seed % 320)}ms infinite alternate`
                      : isStarStage
                        ? `${starPulseKeyframes} ${1900 + (seed % 600)}ms ease-in-out ${(seed % 380)}ms infinite`
                        : isRiffleStage
                          ? `${flybyGlowKeyframes} ${1200 + (seed % 400)}ms ease-in-out ${(seed % 220)}ms infinite`
                          : `${flybyGlowKeyframes} ${1500 + (seed % 600)}ms ease-in-out ${(seed % 260)}ms infinite`;

                    const delayJitter = seed % 60; // eslint-disable-line no-bitwise
                    const animationString = `${cardFlipKeyframes} ${SHUFFLE_DURATION_MS}ms ease-in-out ${globalIndex * 80 + delayJitter}ms forwards, ${glowAnimation}`;

                    const isVip = vipIndexMap.has(Number(item.id));

                    return (
                      <Box
                        key={`${item.id || item.videoId || globalIndex}-ring-${ringIndex}`}
                        sx={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transformStyle: 'preserve-3d',
                          transform: transformValue,
                          transition: `transform ${transitionDuration}ms ${transitionEasing}`,
                          transitionDelay,
                          width: `${cardWidth}px`,
                          maxWidth: '32vw'
                        }}
                      >
                        <Box
                          sx={{
                            position: 'relative',
                            borderRadius: 3,
                            overflow: 'hidden',
                            background: `
                              linear-gradient(160deg, ${alpha('#102742', 0.92)}, ${alpha('#091025', 0.78)}),
                              ${alpha('#0c162f', 0.85)}
                            `,
                            border: isVip
                              ? `2px solid ${alpha('#ffd54f', 0.9)}`
                              : `1px solid ${alpha('#5ce1ff', 0.35)}`,
                            boxShadow: isVip
                              ? `
                                  0 0 0 2px ${alpha('#ffd54f', 0.28)},
                                  0 22px 48px -18px ${alpha('#ffc107', 0.55)},
                                  0 8px 16px -10px ${alpha('#ffc107', 0.35)}
                                `
                              : '0 28px 58px -22px rgba(38, 142, 255, 0.45)',
                            transformStyle: 'preserve-3d',
                            transform: `scale(${cardScale})`,
                            filter: 'brightness(1)',
                            animation: animationString
                          }}
                        >
                          <Box
                            sx={{
                              position: 'relative',
                              height: 0,
                              paddingBottom: '56%',
                              overflow: 'hidden',
                              background: item.thumbnailUrl
                                ? undefined
                                : `repeating-linear-gradient(135deg, ${alpha('#5ce1ff', 0.18)}, ${alpha('#5ce1ff', 0.18)} 12px, transparent 12px, transparent 24px)`
                            }}
                          >
                            {item.thumbnailUrl && (
                              <Box
                                component="img"
                                src={item.thumbnailUrl}
                                alt={item.title}
                                sx={{
                                  position: 'absolute',
                                  inset: 0,
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  filter: 'saturate(1.12) contrast(1.04) brightness(0.95)'
                                }}
                              />
                            )}
                            <Box
                              sx={{
                                position: 'absolute',
                                inset: 0,
                                background: `linear-gradient(180deg, transparent, ${alpha('#060915', 0.88)})`
                              }}
                            />
                            {isVip && (
                              <Chip
                                size="small"
                                label="VIP"
                                sx={{
                                  position: 'absolute',
                                  top: 8,
                                  left: 8,
                                  bgcolor: alpha('#ffc107', 0.4),
                                  color: '#ffeb7a',
                                  fontWeight: 700,
                                  borderRadius: '999px',
                                  letterSpacing: 1
                                }}
                              />
                            )}
                            {/* Removed rank/index badges per request */}
                          </Box>
                          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                            <Typography
                              variant="subtitle2"
                              sx={{
                                fontWeight: 700,
                                letterSpacing: 0.6,
                                lineHeight: 1.3,
                                color: '#f8fbff'
                              }}
                              noWrap
                            >
                              {item.title || 'Mystery Clip'}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color: alpha('#ffffff', 0.64),
                                letterSpacing: 1.4,
                                textTransform: 'uppercase'
                              }}
                            >
                              {getQueueAlias(item)}
                            </Typography>
                            
                          </Box>
                        </Box>
                      </Box>
                    );
                  });
                })}
              </Box>
            </Box>
          </Box>

          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: '#f4fbff',
              textTransform: 'uppercase'
            }}
          >
            <Typography
              variant="h2"
              sx={{
                fontWeight: 800,
                letterSpacing: { xs: 4, md: 10 },
                fontSize: { xs: '7vw', md: '3.4vw' },
                animation: `${pulseTextKeyframes} 3.6s ease-in-out infinite`
              }}
            >
              Shuffle it up!
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mt: 1.5,
                letterSpacing: 4,
                fontWeight: 600,
                color: alpha('#5ce1ff', 0.92)
              }}
            >
              Very Kinda Random Shuffle Tech™️
            </Typography>
          </Box>

          <Box
            sx={{
              position: 'absolute',
              bottom: '8%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'min(240px, 48vw)',
              aspectRatio: '1',
              borderRadius: '50%',
              background: `conic-gradient(rgba(92, 225, 255, 0.95) ${progress}%, rgba(92, 225, 255, 0.08) ${progress}% 100%)`,
              border: `1px solid ${alpha('#5ce1ff', 0.28)}`,
              boxShadow: '0 0 55px rgba(92, 225, 255, 0.32)'
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: '9%',
                borderRadius: '50%',
                background: alpha('#020714', 0.9),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5
              }}
            >
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '6vw', md: '2.6vw' }
                }}
              >
                {Math.round(progress)}%
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  letterSpacing: 3,
                  color: alpha('#ffffff', 0.55)
                }}
              >
                Fate Calculating
              </Typography>
            </Box>
          </Box>

          {audioError && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                px: 2.6,
                py: 1.1,
                borderRadius: 999,
                background: alpha('#ff4f6b', 0.16),
                color: '#ff98a9',
                fontSize: 12,
                letterSpacing: 1.4,
                textTransform: 'uppercase'
              }}
            >
              Shuffle audio blocked. Current source: {shuffleAudioSrc}
            </Box>
          )}
          {sbAudioError && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 46,
                left: '50%',
                transform: 'translateX(-50%)',
                px: 2.6,
                py: 1.1,
                borderRadius: 999,
                background: alpha('#ffcc00', 0.16),
                color: '#ffd166',
                fontSize: 12,
                letterSpacing: 1.2,
                textTransform: 'uppercase'
              }}
            >
              Soundboard audio blocked. Click the overlay once to enable audio.
            </Box>
          )}
        </Box>
      )}
      <Grid
        container
        spacing={{ xs: 2.5, md: 3.5 }}
        sx={{
          transition: 'opacity 500ms ease, filter 500ms ease, transform 600ms ease',
          opacity: shuffleVisual ? 0 : 1,
          filter: shuffleVisual ? 'blur(6px)' : 'none',
          transform: shuffleVisual ? 'scale(0.98)' : 'none',
          pointerEvents: shuffleVisual ? 'none' : 'auto'
        }}
      >
        {sortedQueue.length === 0 ? (
          <Grid item xs={12}>
            <Paper
              sx={{
                height: '100%',
                minHeight: 260,
                borderRadius: 4,
                background: alpha('#ffffff', 0.06),
                border: `1px solid ${alpha('#ffffff', 0.08)}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: alpha('#ffffff', 0.65),
                fontSize: 22,
                letterSpacing: 3,
                textTransform: 'uppercase'
              }}
            >
              {channelConnected ? 'Queue is empty' : 'Connecting…'}
            </Paper>
          </Grid>
        ) : (
          sortedQueue.slice(0, 20).map((item, index) => {
            const isCurrent = currentlyPlaying?.id === item.id;
            const isTop = item.status === 'TOP_EIGHT';
            const isVip = vipIndexMap.has(Number(item.id));
            

            return (
              <Grid item xs={12} sm={6} md={3} key={item.id || index}>
                <Paper
                  sx={{
                    position: 'relative',
                    p: 2.5,
                    borderRadius: 4,
                    background: `
                      linear-gradient(150deg, ${alpha('#10162d', 0.86)}, ${alpha('#090b18', 0.97)}),
                      radial-gradient(circle at top left, ${alpha('#55d8ff', 0.24)}, transparent 48%)
                    `,
                    border: isVip
                      ? `2px solid ${alpha('#ffd54f', 0.9)}`
                      : `1px solid ${alpha('#5ce1ff', isCurrent ? 0.65 : 0.2)}`,
                    boxShadow: isCurrent
                      ? '0 28px 58px -24px rgba(86, 226, 255, 0.55)'
                      : (isVip
                        ? `0 0 0 2px ${alpha('#ffd54f', 0.28)}, 0 28px 58px -24px ${alpha('#ffc107', 0.6)}, 0 10px 20px -12px ${alpha('#ffc107', 0.4)}`
                        : '0 20px 46px -30px rgba(6, 12, 38, 0.9)'),
                    overflow: 'hidden',
                    transformStyle: 'preserve-3d',
                    animation: `${floatKeyframes} ${12 + index}s ease-in-out infinite`
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: '-35% -35%',
                      background: `radial-gradient(circle, ${alpha('#5ce1ff', 0.12)}, transparent 60%)`,
                      opacity: isCurrent ? 1 : 0.4,
                      filter: 'blur(40px)',
                      pointerEvents: 'none'
                    }}
                  />

                  <Box
                    sx={{
                      position: 'relative',
                      borderRadius: 3,
                      overflow: 'hidden',
                      height: 0,
                      paddingBottom: '56.25%',
                      background: alpha('#0f1729', 0.9),
                      border: `1px solid ${alpha('#ffffff', 0.08)}`
                    }}
                  >
                    {item.thumbnailUrl ? (
                      <Box
                        component="img"
                        src={item.thumbnailUrl}
                        alt={item.title}
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          filter: 'saturate(1.05) brightness(0.96)'
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          background: `repeating-linear-gradient(135deg, ${alpha('#5ce1ff', 0.1)}, ${alpha('#5ce1ff', 0.1)} 12px, transparent 12px, transparent 24px)`
                        }}
                      />
                    )}

                    <Box sx={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 1 }}>
                      <Chip
                        size="small"
                        label={`#${index + 1}`}
                        sx={{
                          bgcolor: alpha('#030712', 0.75),
                          color: alpha('#ffffff', 0.85),
                          fontWeight: 600,
                          borderRadius: '999px',
                          textTransform: 'uppercase',
                          letterSpacing: 1
                        }}
                      />
                      
                      {isVip && (
                        <Chip
                          size="small"
                          label="VIP"
                          sx={{
                            bgcolor: alpha('#ffc107', 0.3),
                            color: '#ffd54f',
                            fontWeight: 700,
                            borderRadius: '999px'
                          }}
                        />
                      )}
                      
                      {isCurrent && (
                        <Chip
                          size="small"
                          label="Now Playing"
                          sx={{
                            bgcolor: alpha('#5ce1ff', 0.25),
                            color: '#5ce1ff',
                            fontWeight: 700,
                            borderRadius: '999px',
                            animation: `${pulseKeyframes} 2400ms ease-in-out infinite`
                          }}
                        />
                      )}
                      {isTop && !isCurrent && (
                        <Chip
                          size="small"
                          label="Top 8"
                          sx={{
                            bgcolor: alpha('#ff89df', 0.22),
                            color: '#ff89df',
                            fontWeight: 600,
                            borderRadius: '999px'
                          }}
                        />
                      )}
                    </Box>

                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: 12,
                        right: 12,
                        px: 1.6,
                        py: 0.55,
                        borderRadius: 999,
                        background: alpha('#020714', 0.7),
                        color: alpha('#ffffff', 0.87),
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: 0.6
                      }}
                    >
                      {formatDuration(item.duration)}
                    </Box>
                  </Box>

                  <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        lineHeight: 1.35,
                        color: '#ffffff'
                      }}
                      noWrap
                    >
                      {item.title || 'Untitled Video'}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: alpha('#ffffff', 0.65), textTransform: 'uppercase', letterSpacing: 1.5 }}
                    >
                      {getQueueAlias(item)}
                    </Typography>
                    
                    <Typography
                      variant="caption"
                      sx={{ color: alpha('#ffffff', 0.45), letterSpacing: 0.6 }}
                    >
                      {item.platform || 'Unknown Platform'}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            );
          })
        )}
      </Grid>
    </Box>
  );
};

export default QueueOverlay;
