import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  Stack,
  Chip,
  CircularProgress,
  IconButton,
  Slider,
} from '@mui/material';
import {
  Lock as LockIcon,
  LockOpen as UnlockIcon,
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
  OpenInNew as OpenInNewIcon,
  Sync as SyncIcon,
  Gavel as GavelIcon,
  Undo as UndoIcon
} from '@mui/icons-material';
import PrecisionSlider from '../components/PrecisionSlider';
import JudgeSettings from '../components/JudgeSettings';
import { useSocket } from '../contexts/SocketContext';
import { useSyncedYouTubePlayer } from '../hooks/useSyncedYouTubePlayer';
import {
  getActiveGongEntries,
  findGongEntry,
  GONG_IMAGE_URL,
  GONG_AUDIO_URL,
  GONG_OWNER_ID
} from '../constants/gongs';

const JudgePage = () => {
  const { channelName, cupId } = useParams();
  const [searchParams] = useSearchParams();
  const judgeToken = searchParams.get('token');
  const { 
    connectToChannel, 
    disconnectFromChannel, 
    currentlyPlaying,
    channelConnected,
    addChannelListener,
    removeChannelListener,
    playOverlay,
    pauseOverlay,
    seekOverlay,
    gongState
  } = useSocket();
  // Track multiple concurrent soundboard audio instances
  const sbAudiosRef = useRef(new Set());
  const [sbAudioError, setSbAudioError] = useState(false);
  const SERVER_BASE = process.env.REACT_APP_SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const [session, setSession] = useState(null);
  const [score, setScore] = useState(2.5);
  const [isLocked, setIsLocked] = useState(false);
  const [lockType, setLockType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [pendingSeek, setPendingSeek] = useState(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [forceReloadKey, setForceReloadKey] = useState(0);
  const [sbItems, setSbItems] = useState([]);
  const [sbLoading, setSbLoading] = useState(false);
  const [sbError, setSbError] = useState(null);
  const [gongBusy, setGongBusy] = useState(false);
  const [gongError, setGongError] = useState(null);
  const gongSeenRef = useRef(new Set());

  // Synced YouTube player
  const {
    containerRef,
    playLocal,
    pauseLocal,
    seekLocal,
    setVolume: setPlayerVolume,
    toggleMute,
    currentTime,
    duration,
    volume,
    muted,
    hasVideo
  } = useSyncedYouTubePlayer({
    videoId: forceReloadKey === 0 ? currentlyPlaying?.videoId : null,
    channelConnected,
    addChannelListener,
    removeChannelListener,
    initialVolume: 100,
    defaultMuted: false,
    autoPlayOnReady: false,
    onLocalPlay: playOverlay,
    onLocalPause: pauseOverlay,
    onLocalSeek: seekOverlay
  });

  // Connect to channel socket
  useEffect(() => {
    if (channelName) {
      connectToChannel(channelName, { explicit: true });
      return () => {
        disconnectFromChannel();
      };
    }
  }, [channelName, connectToChannel, disconnectFromChannel]);

  // Soundboard playback listener
  useEffect(() => {
    if (!channelConnected) {
      return () => {};
    }
    const handler = (payload = {}) => {
      try {
        // eslint-disable-next-line no-console
        console.info('soundboard:play received (judge):', payload);
        if (!payload.url) return;
        let url = payload.url;
        const base = (SERVER_BASE || '').replace(/\/$/, '');
        if (url.startsWith('/')) {
          url = `${base}${url}`;
        }
        try {
          const u = new URL(url, window.location.origin);
          if (window.location.protocol === 'https:' && u.protocol === 'http:') {
            url = u.pathname + u.search;
          } else if (!/^https?:/i.test(url)) {
            url = u.pathname + u.search;
          } else {
            url = u.toString();
          }
        } catch (_) {}
        // eslint-disable-next-line no-console
        console.info('JudgePage: resolved audio url', url);
        const audio = new Audio(url);
        audio.volume = 1;
        audio.play().catch((err) => {
          console.warn('Soundboard audio playback failed:', err);
          setSbAudioError(true);
        });
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
  }, [addChannelListener, removeChannelListener, channelConnected, SERVER_BASE]);

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

  // Playback control handlers
  const handlePlayPause = () => {
    if (isPlaying) {
      pauseLocal();
      setIsPlaying(false);
    } else {
      playLocal();
      setIsPlaying(true);
    }
  };

  const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) {
      return '0:00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeekChange = (_, value) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next !== 'number' || Number.isNaN(next)) return;
    setIsSeeking(true);
    setPendingSeek(next);
  };

  const handleSeekCommit = (_, value) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next !== 'number' || Number.isNaN(next)) return;
    seekLocal(next);
    setIsSeeking(false);
    setPendingSeek(null);
  };

  const handleVolumeChange = (_, value) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next !== 'number' || Number.isNaN(next)) return;
    setPlayerVolume(next);
  };

  const handleResyncVideo = useCallback(() => {
    if (!currentlyPlaying?.videoId || !channelConnected) return;
    
    setSuccess('Resyncing video...');
    
    // Request current player state from server
    const stateHandler = (state) => {
      removeChannelListener('player:state_response', stateHandler);
      
      // Force player reload
      setForceReloadKey(1);
      
      setTimeout(() => {
        setForceReloadKey(0);
        
        // Apply the received state after player reloads
        setTimeout(() => {
          if (state && typeof state.time === 'number') {
            seekLocal(state.time, { source: 'remote' });
            
            if (state.playing) {
              playLocal(state.time, { source: 'remote' });
            } else {
              pauseLocal(state.time, { source: 'remote' });
            }
          }
          
          setSuccess('Video resynced!');
          setTimeout(() => setSuccess(null), 2000);
        }, 1000);
      }, 500);
    };
    
    addChannelListener('player:state_response', stateHandler);
    
    // Emit the state request
    if (window.io && channelName) {
      const socket = window.io(`/channel/${channelName}`);
      socket.emit('player:state_request');
    }
  }, [currentlyPlaying?.videoId, channelConnected, channelName, addChannelListener, removeChannelListener, seekLocal, playLocal, pauseLocal]);

  // Auto-sync player state on initial page load if video is already playing
  useEffect(() => {
    if (!channelConnected || !currentlyPlaying?.videoId || forceReloadKey !== 0 || !hasVideo) {
      return;
    }
    
    // Wait for player to be ready, then request sync
    const timeout = setTimeout(() => {
      handleResyncVideo();
    }, 2500);
    
    return () => clearTimeout(timeout);
  }, [channelConnected, currentlyPlaying?.videoId, forceReloadKey, hasVideo, handleResyncVideo]);

  const judgeIdentifier = useMemo(() => (
    session?.judgeTokenId || session?.judgeAccountId || null
  ), [session?.judgeTokenId, session?.judgeAccountId]);

  const activeGongs = useMemo(
    () => getActiveGongEntries(gongState, currentlyPlaying?.id || null),
    [gongState, currentlyPlaying?.id]
  );

  const judgeGongEntry = useMemo(
    () => findGongEntry(gongState, currentlyPlaying?.id || null, judgeIdentifier),
    [gongState, currentlyPlaying?.id, judgeIdentifier]
  );

  const hasGonged = Boolean(judgeGongEntry);

  const playGongAudio = useCallback(() => {
    if (!GONG_AUDIO_URL) {
      return;
    }
    try {
      const audio = new Audio(GONG_AUDIO_URL);
      audio.volume = 1;
      audio.play().catch(() => {});
    } catch (err) {
      console.warn('Failed to play gong audio in judge panel', err);
    }
  }, []);

  useEffect(() => {
    gongSeenRef.current = new Set();
  }, [currentlyPlaying?.id]);

  useEffect(() => {
    const previous = gongSeenRef.current || new Set();
    const next = new Set();
    activeGongs.forEach((entry) => {
      next.add(entry.id);
      if (!previous.has(entry.id)) {
        playGongAudio();
      }
    });
    gongSeenRef.current = next;
  }, [activeGongs, playGongAudio]);

  useEffect(() => {
    setGongError(null);
  }, [currentlyPlaying?.id]);

  const GongControlCard = () => (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ xs: 'stretch', md: 'center' }}
          justifyContent="space-between"
          spacing={2}
        >
          <Box>
            <Typography variant="h6" gutterBottom>
              Gong Control
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Smash the gong once per video. Producers can undo accidents if needed.
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            color={hasGonged ? 'warning' : 'error'}
            startIcon={hasGonged ? <UndoIcon /> : <GavelIcon />}
            onClick={handleToggleGong}
            disabled={gongBusy || !currentlyPlaying?.id || !judgeToken || !session}
          >
            {hasGonged ? 'Undo Gong' : 'Gong'}
          </Button>
        </Stack>
        {gongError && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setGongError(null)}>
            {gongError}
          </Alert>
        )}
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Active Gongs
          </Typography>
          {activeGongs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No gongs yet. You could be the first smash.
            </Typography>
          ) : (
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              {activeGongs.map((entry) => (
                <Box
                  key={entry.id}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: entry.id === judgeIdentifier ? 'warning.main' : 'divider',
                    px: 1.5,
                    py: 1,
                    minWidth: 96,
                    bgcolor: entry.id === judgeIdentifier ? 'rgba(255,193,7,0.08)' : 'transparent'
                  }}
                >
                  <Box
                    component="img"
                    src={GONG_IMAGE_URL}
                    alt="Gong"
                    sx={{
                      width: 56,
                      height: 56,
                      objectFit: 'cover',
                      borderRadius: 1,
                      mb: 0.75
                    }}
                  />
                  <Typography variant="body2" fontWeight={600} align="center">
                    {entry.displayName || (entry.id === GONG_OWNER_ID ? 'Host' : 'Judge')}
                  </Typography>
                  {entry.id === GONG_OWNER_ID && (
                    <Typography variant="caption" color="text.secondary">
                      Host Gong
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </CardContent>
    </Card>
  );

  const handleToggleGong = useCallback(async () => {
    if (!channelName || !cupId || !currentlyPlaying?.id || !judgeToken || !judgeIdentifier) {
      return;
    }
    setGongBusy(true);
    setGongError(null);
    try {
      const response = await fetch(
        `/api/channels/${channelName}/cups/${cupId}/items/${currentlyPlaying.id}/gong`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${judgeToken}`
          },
          body: JSON.stringify({ active: !hasGonged })
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to update gong');
      }
    } catch (err) {
      setGongError(err.message || 'Failed to update gong');
    } finally {
      setGongBusy(false);
    }
  }, [channelName, cupId, currentlyPlaying?.id, judgeToken, judgeIdentifier, hasGonged]);

  const resolvedDuration = typeof duration === 'number' && duration > 0 ? duration : 0;
  const displayTime = isSeeking && typeof pendingSeek === 'number'
    ? pendingSeek
    : (typeof currentTime === 'number' ? currentTime : 0);
  const sliderValue = resolvedDuration > 0
    ? Math.min(Math.max(displayTime, 0), resolvedDuration)
    : 0;

  // Helper to get headers with judge token
  const getHeaders = useCallback(() => {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (judgeToken) {
      headers['Authorization'] = `Bearer ${judgeToken}`;
    }
    return headers;
  }, [judgeToken]);

  // Load soundboard items for judges
  const loadSoundboard = useCallback(async () => {
    if (!channelName || !cupId) return;
    try {
      setSbLoading(true);
      setSbError(null);
      const response = await fetch(`/api/channels/${channelName}/cups/${cupId}/soundboard`, {
        credentials: 'include',
        headers: getHeaders(),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to load soundboard');
      }
      const data = await response.json();
      setSbItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setSbError(err.message || 'Failed to load soundboard');
      setSbItems([]);
    } finally {
      setSbLoading(false);
    }
  }, [channelName, cupId, getHeaders]);

  useEffect(() => { loadSoundboard(); }, [loadSoundboard]);

  const handlePlaySb = useCallback(async (itemId) => {
    if (!channelName || !cupId || !itemId) return;
    try {
      await fetch(`/api/channels/${channelName}/cups/${cupId}/soundboard/play`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId })
      });
    } catch (_) {}
  }, [channelName, cupId, getHeaders]);

  // Fetch or create session on mount
  useEffect(() => {
    const startSession = async () => {
      try {
        setLoading(true);
        const url = judgeToken 
          ? `/api/channels/${channelName}/cups/${cupId}/judge/session/start?token=${judgeToken}`
          : `/api/channels/${channelName}/cups/${cupId}/judge/session/start`;
        
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: getHeaders(),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || payload.message || 'Failed to start session');
        }

        const data = await response.json();
        setSession(data.session);
      } catch (err) {
        console.error('Failed to start session:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (channelName && cupId) {
      startSession();
    }
  }, [channelName, cupId, judgeToken, getHeaders]);

  // Load current item and existing score
  const loadCurrentScore = useCallback(async (itemId) => {
    if (!channelName || !cupId || !itemId) return;

    // Reset to defaults first
    setScore(2.5);
    setIsLocked(false);
    setLockType(null);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/channels/${channelName}/cups/${cupId}/items/${itemId}/score`,
        {
          credentials: 'include',
          headers: getHeaders(),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.judgeScore) {
          setScore(Number(data.judgeScore.score));
          setIsLocked(data.judgeScore.isLocked || false);
          setLockType(data.judgeScore.lockType);
        }
      }
    } catch (err) {
      console.error('Failed to load existing score:', err);
    }
  }, [channelName, cupId, getHeaders]);

  useEffect(() => {
    if (currentlyPlaying?.id) {
      loadCurrentScore(currentlyPlaying.id);
    }
  }, [currentlyPlaying, loadCurrentScore]);

  const handleLockIn = async () => {
    if (!currentlyPlaying) return;

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      // Submit score first to ensure latest value is saved
      const scoreResponse = await fetch(
        `/api/channels/${channelName}/cups/${cupId}/items/${currentlyPlaying.id}/score`,
        {
          method: 'POST',
          headers: getHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            score,
          })
        }
      );

      const scorePayload = await scoreResponse.json().catch(() => ({}));

      if (!scoreResponse.ok) {
        throw new Error(scorePayload.error || 'Failed to save score before locking');
      }

      const response = await fetch(
        `/api/channels/${channelName}/cups/${cupId}/items/${currentlyPlaying.id}/lock`,
        {
          method: 'POST',
          credentials: 'include',
          headers: getHeaders(),
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to lock vote');
      }

      const lockedScore = payload.judgeScore || scorePayload.judgeScore || null;

      setIsLocked(true);
      setLockType(lockedScore?.lockType || 'MANUAL');
      setSuccess('Score locked in!');
    } catch (err) {
      console.error('Failed to lock in score:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockVote = async () => {
    if (!currentlyPlaying) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/channels/${channelName}/cups/${cupId}/items/${currentlyPlaying.id}/unlock`,
        {
          method: 'POST',
          credentials: 'include',
          headers: getHeaders(),
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to unlock vote');
      }

      setIsLocked(false);
      setLockType(null);
      setSuccess('Vote unlocked!');
    } catch (err) {
      console.error('Failed to unlock vote:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !session) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Starting judge session...
        </Typography>
      </Box>
    );
  }

  if (error && !session) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Judge Panel
          </Typography>
          {session?.cup && (
            <Typography variant="subtitle1" color="text.secondary">
              {session.cup.title} {session.cup.theme && `• ${session.cup.theme}`}
            </Typography>
          )}
          {session?.judgeName && (
            <Typography variant="body2" color="text.secondary">
              Judging as: <strong>{session.judgeName}</strong>
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          {session && judgeToken && (
            <JudgeSettings
              session={session}
              channelName={channelName}
              cupId={cupId}
              judgeToken={judgeToken}
              onNameUpdate={(newName) => {
                setSession({ ...session, judgeName: newName });
              }}
            />
          )}
          {session && judgeToken && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<OpenInNewIcon />}
              onClick={() => {
                const overlayUrl = `/judge/${channelName}/${cupId}/overlay?token=${judgeToken}`;
                window.open(overlayUrl, '_blank');
              }}
            >
              Open Overlay
            </Button>
          )}
          {session && (
            <Chip
              label={`Session: ${session.status}`}
              color="success"
              variant="outlined"
            />
          )}
          {isLocked && (
            <Chip
              icon={<LockIcon />}
              label={lockType === 'FORCED' ? 'Force Locked' : 'Locked'}
              color={lockType === 'FORCED' ? 'error' : 'warning'}
            />
          )}
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {!currentlyPlaying ? (
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" align="center" color="text.secondary">
                Waiting for video...
              </Typography>
              <Typography variant="body2" align="center" color="text.secondary" sx={{ mt: 1 }}>
                The host will start the next video soon.
              </Typography>
              {!channelConnected && (
                <Typography variant="caption" display="block" align="center" color="warning.main" sx={{ mt: 2 }}>
                  Connecting to channel...
                </Typography>
              )}
            </CardContent>
          </Card>

          <GongControlCard />

          {/* Soundboard (Judges can trigger) */}
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Soundboard</Typography>
                <Button size="small" onClick={loadSoundboard} disabled={sbLoading}>Refresh</Button>
              </Box>
              {sbAudioError && (
                <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setSbAudioError(false)}>
                  Sound playback blocked by the browser. Click anywhere on the page once, then try again.
                </Alert>
              )}
              {sbError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSbError(null)}>
                  {sbError}
                </Alert>
              )}
              {sbItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {sbLoading ? 'Loading sounds…' : 'No sounds available yet.'}
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {sbItems.map((it) => (
                    <Button key={it.id} variant="outlined" size="small" onClick={() => handlePlaySb(it.id)}>
                      {it.name}
                    </Button>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Stack>
      ) : (
        <Stack spacing={3}>
          {/* Video Player */}
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6" gutterBottom>
                  Now Judging
                </Typography>
                {currentlyPlaying?.hasDuplicateHistory && (
                  <Chip label="Duplicate Submission" color="warning" size="small" />
                )}
              </Box>
              <Box
                sx={{
                  position: 'relative',
                  paddingTop: '56.25%', // 16:9 aspect ratio
                  backgroundColor: 'black',
                  borderRadius: 1,
                  overflow: 'hidden',
                  border: hasVideo ? 'none' : '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <Box
                  ref={containerRef}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                  }}
                />
              </Box>
              
              {/* Playback Controls */}
              <Box sx={{ mt: 2 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <IconButton 
                    onClick={handlePlayPause} 
                    disabled={!hasVideo}
                    color="primary"
                  >
                    {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                  </IconButton>
                  
                  <IconButton 
                    onClick={handleResyncVideo} 
                    disabled={!hasVideo}
                    color="secondary"
                    title="Resync video if playback is broken"
                  >
                    <SyncIcon />
                  </IconButton>
                  
                  <Typography variant="caption" sx={{ minWidth: 40 }}>
                    {formatTime(displayTime)}
                  </Typography>
                  
                  <Slider
                    value={sliderValue}
                    onChange={handleSeekChange}
                    onChangeCommitted={handleSeekCommit}
                    min={0}
                    max={resolvedDuration}
                    disabled={!hasVideo || resolvedDuration === 0}
                    sx={{ flex: 1 }}
                  />
                  
                  <Typography variant="caption" sx={{ minWidth: 40 }}>
                    {formatTime(resolvedDuration)}
                  </Typography>
                  
                  <IconButton 
                    onClick={toggleMute} 
                    disabled={!hasVideo}
                    size="small"
                  >
                    {muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
                  </IconButton>
                  
                  <Slider
                    value={volume}
                    onChange={handleVolumeChange}
                    min={0}
                    max={100}
                    disabled={!hasVideo}
                    sx={{ width: 100 }}
                  />
                </Stack>
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Submitter identity hidden until reveal
              </Typography>
            </CardContent>
          </Card>

          <GongControlCard />

          {/* Soundboard (Judges can trigger) */}
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Soundboard</Typography>
                <Button size="small" onClick={loadSoundboard} disabled={sbLoading}>Refresh</Button>
              </Box>
              {sbError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSbError(null)}>
                  {sbError}
                </Alert>
              )}
              {sbItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {sbLoading ? 'Loading sounds…' : 'No sounds available yet.'}
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {sbItems.map((it) => (
                    <Button key={it.id} variant="outlined" size="small" onClick={() => handlePlaySb(it.id)}>
                      {it.name}
                    </Button>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          {/* Rating Slider */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Your Rating
              </Typography>
              <PrecisionSlider
                value={score}
                onChange={setScore}
                disabled={isLocked}
                min={0}
                max={5}
                step={0.00001}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardContent>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<LockIcon />}
                  onClick={handleLockIn}
                  disabled={isLocked || loading}
                  fullWidth
                >
                  {isLocked ? 'Locked In' : 'Lock In'}
                </Button>

                {isLocked && lockType === 'MANUAL' && (
                  <Button
                    variant="outlined"
                    size="large"
                    color="warning"
                    startIcon={<UnlockIcon />}
                    onClick={handleUnlockVote}
                    disabled={loading}
                    sx={{ minWidth: 150 }}
                  >
                    Unlock Vote
                  </Button>
                )}

                {lockType === 'FORCED' && (
                  <Alert severity="warning" sx={{ flex: 1 }}>
                    Host has locked all votes. You cannot change your score.
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      )}
    </Box>
  );
};

export default JudgePage;
