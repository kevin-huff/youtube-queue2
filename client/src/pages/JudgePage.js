import React, { useState, useEffect, useCallback } from 'react';
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
} from '@mui/icons-material';
import PrecisionSlider from '../components/PrecisionSlider';
import JudgeSettings from '../components/JudgeSettings';
import { useSocket } from '../contexts/SocketContext';
import { useSyncedYouTubePlayer } from '../hooks/useSyncedYouTubePlayer';

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
    seekOverlay
  } = useSocket();
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

  // Synced YouTube player
  const {
    containerRef,
    playLocal,
    pauseLocal,
    seekLocal,
    getCurrentTime,
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
    onLocalPlay: playOverlay,
    onLocalPause: pauseOverlay,
    onLocalSeek: seekOverlay
  });

  // Connect to channel socket
  useEffect(() => {
    if (channelName) {
      connectToChannel(channelName);
      return () => {
        disconnectFromChannel();
      };
    }
  }, [channelName, connectToChannel, disconnectFromChannel]);

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
      ) : (
        <Stack spacing={3}>
          {/* Video Player */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Now Judging
              </Typography>
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
