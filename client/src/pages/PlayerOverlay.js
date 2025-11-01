import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Box, Typography, Chip } from '@mui/material';
import { keyframes } from '@emotion/react';
import { useSocket } from '../contexts/SocketContext';
import { useSyncedYouTubePlayer } from '../hooks/useSyncedYouTubePlayer';
import PlayerControlPanel from '../components/PlayerControlPanel';

// High-tech reveal animation
const techReveal = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.85) rotateX(12deg);
    filter: blur(20px) brightness(0.4);
  }
  40% {
    opacity: 0.7;
    filter: blur(8px) brightness(0.8);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotateX(0deg);
    filter: blur(0) brightness(1);
  }
`;

// High-tech hide animation
const techHide = keyframes`
  0% {
    opacity: 1;
    transform: scale(1) rotateX(0deg);
    filter: blur(0) brightness(1);
  }
  60% {
    opacity: 0.3;
    filter: blur(8px) brightness(0.6);
  }
  100% {
    opacity: 0;
    transform: scale(0.85) rotateX(-12deg);
    filter: blur(20px) brightness(0.2);
  }
`;

// Glowing border pulse
const borderPulse = keyframes`
  0%, 100% {
    box-shadow: 
      0 0 20px rgba(0, 200, 255, 0.3),
      0 0 40px rgba(0, 200, 255, 0.2),
      inset 0 0 20px rgba(0, 200, 255, 0.1);
  }
  50% {
    box-shadow: 
      0 0 30px rgba(0, 200, 255, 0.5),
      0 0 60px rgba(0, 200, 255, 0.3),
      inset 0 0 30px rgba(0, 200, 255, 0.2);
  }
`;

// Corner accents animation
const cornerGlow = keyframes`
  0%, 100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
`;

const OverlayContainer = ({ children }) => (
  <Box
    sx={{
      width: '100vw',
      height: '100vh',
      bgcolor: 'transparent',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}
  >
    {children}
  </Box>
);

const Metadata = ({ title, submitter, sx }) => {
  if (!title) return null;

  return (
    <Box
      sx={{
        minWidth: '40vw',
        maxWidth: '70vw',
        bgcolor: 'rgba(0,0,0,0.7)',
        borderRadius: 2,
        px: 3,
        py: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        ...sx
      }}
    >
      <Typography variant="h5" fontWeight={700} noWrap>
        {title}
      </Typography>
      {submitter && (
        <Chip
          size="small"
          label={`Submitted by ${submitter}`}
          sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
        />
      )}
    </Box>
  );
};

const formatTimestamp = (seconds) => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const getQueueAlias = (item) =>
  item?.submitterAlias || item?.submitter?.alias || null;

const PlayerOverlay = () => {
  const { channelName } = useParams();
  const [searchParams] = useSearchParams();
  const hideQueue = searchParams.get('queue') === 'hide';
  const showControls = searchParams.get('controls') === 'show' && !hideQueue;

  const {
    connectToChannel,
    disconnectFromChannel,
    queue,
    currentlyPlaying,
    playNext,
    skipCurrent,
    playOverlay,
    pauseOverlay,
    seekOverlay,
    addChannelListener,
    removeChannelListener,
    channelConnected,
    votingState,
    startVotingSession,
    overlayShowPlayer
  } = useSocket();

  const [pendingSeek, setPendingSeek] = useState(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [shouldShowPlayer, setShouldShowPlayer] = useState(false);
  const [previousVideoId, setPreviousVideoId] = useState(null);

  const currentVideoId = currentlyPlaying?.id ?? null;
  
  // Check if voting is active for the CURRENT video that's playing
  const votingActive = useMemo(() => {
    if (!votingState || !votingState.stage || votingState.stage === 'cancelled') {
      return false;
    }
    // Only consider voting active if it's for the current video
    return votingState.queueItemId === currentVideoId;
  }, [votingState, currentVideoId]);
  const currentCupId = useMemo(
    () => currentlyPlaying?.cupId || votingState?.cupId || null,
    [currentlyPlaying?.cupId, votingState?.cupId]
  );

  const handleVote = useCallback(async () => {
    if (!currentVideoId || !currentCupId || votingActive) {
      return;
    }
    try {
      await startVotingSession(currentVideoId, currentCupId);
    } catch (error) {
      console.error('Failed to start voting session from overlay:', error);
    }
  }, [currentVideoId, currentCupId, startVotingSession, votingActive]);

  const skipDisabled = !currentVideoId;
  const playNextDisabled = !Array.isArray(queue) || queue.length === 0;
  const voteDisabled = !currentVideoId || !currentCupId || votingActive;

  useEffect(() => {
    const previousBodyBg = document.body.style.backgroundColor;
    const previousBodyImage = document.body.style.backgroundImage;
    const previousHtmlBg = document.documentElement.style.backgroundColor;
    const rootElement = document.getElementById('root');
    const previousRootBg = rootElement ? rootElement.style.backgroundColor : null;

    document.body.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    document.body.style.backgroundImage = 'none';
    document.documentElement.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    if (rootElement) {
      rootElement.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    }

    return () => {
      document.body.style.backgroundColor = previousBodyBg;
      document.body.style.backgroundImage = previousBodyImage;
      document.documentElement.style.backgroundColor = previousHtmlBg;
      if (rootElement && previousRootBg !== null) {
        rootElement.style.backgroundColor = previousRootBg;
      }
    };
  }, []);

  useEffect(() => {
    if (!channelName) return;
    connectToChannel(channelName, { explicit: true });
    return () => disconnectFromChannel();
  }, [channelName, connectToChannel, disconnectFromChannel]);

  useEffect(() => {
    setPendingSeek(null);
    setIsSeeking(false);
  }, [currentlyPlaying?.id]);

  // Track video changes and show/hide player
  // Hide player when voting is active; otherwise honor manual override if present
  useEffect(() => {
    const vidId = currentlyPlaying?.videoId;
    const autoShow = Boolean(vidId) && !votingActive;
    const manual = (overlayShowPlayer === true || overlayShowPlayer === false) ? overlayShowPlayer : null;
    const finalShow = !votingActive && (manual !== null ? manual : Boolean(vidId));

    setShouldShowPlayer(finalShow);
    if (finalShow && vidId) {
      setPreviousVideoId(vidId);
    } else if (!vidId) {
      setPreviousVideoId(null);
    }
  }, [currentlyPlaying?.videoId, votingActive, overlayShowPlayer]);

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
    videoId: currentlyPlaying?.videoId,
    channelConnected,
    addChannelListener,
    removeChannelListener,
    initialVolume: 100,
    defaultMuted: false,
    // Only broadcast playback events if NOT in viewer mode (controls=show)
    // Viewer mode should be read-only
    onLocalPlay: showControls ? undefined : playOverlay,
    onLocalPause: showControls ? undefined : pauseOverlay,
    onLocalSeek: showControls ? undefined : seekOverlay
  });

  const resolvedDuration = typeof duration === 'number' && duration > 0 ? duration : 0;
  const sliderDisabled = !channelConnected || !hasVideo || resolvedDuration === 0;
  const displayTime = isSeeking && typeof pendingSeek === 'number'
    ? pendingSeek
    : (typeof currentTime === 'number' ? currentTime : 0);
  const sliderValue = resolvedDuration > 0
    ? Math.min(Math.max(displayTime, 0), resolvedDuration)
    : 0;

  const handleSeekChange = (_, value) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next !== 'number' || Number.isNaN(next)) {
      return;
    }
    setIsSeeking(true);
    setPendingSeek(Math.max(0, next));
  };

  const handleSeekCommit = (_, value) => {
    const next = Array.isArray(value) ? value[0] : value;
    setIsSeeking(false);
    setPendingSeek(null);

    if (sliderDisabled || typeof next !== 'number' || Number.isNaN(next)) {
      return;
    }

    const targetTime = Math.min(Math.max(next, 0), resolvedDuration);
    seekLocal(targetTime);
  };

  const volumeSliderDisabled = !channelConnected || !hasVideo;
  const normalizedVolume = typeof volume === 'number' ? volume : 0;
  const volumeSliderValue = muted ? 0 : normalizedVolume;
  const volumeLabel = muted ? 'Muted' : `${Math.round(normalizedVolume)}%`;

  const handleVolumeChange = (_, value) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next !== 'number' || Number.isNaN(next)) {
      return;
    }
    setPlayerVolume(next);
  };

  const handleVolumeToggle = () => {
    toggleMute();
  };

  const handlePlay = useCallback(() => {
    if (!channelConnected || !hasVideo) {
      return;
    }
    const time = typeof currentTime === 'number' && !Number.isNaN(currentTime) ? currentTime : 0;
    playLocal(time);
    playOverlay(time);
  }, [channelConnected, hasVideo, currentTime, playLocal, playOverlay]);

  const handlePause = useCallback(() => {
    if (!channelConnected || !hasVideo) {
      return;
    }
    const time = typeof currentTime === 'number' && !Number.isNaN(currentTime) ? currentTime : 0;
    pauseLocal(time);
    pauseOverlay(time);
  }, [channelConnected, hasVideo, currentTime, pauseLocal, pauseOverlay]);

  const playDisabled = !channelConnected || !hasVideo;
  const pauseDisabled = playDisabled;

  const outerStyles = showControls
    ? {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: { xs: 3, sm: 4 },
        px: { xs: '5vw', sm: '6vw' },
        py: { xs: '4vh', sm: '6vh' },
        position: 'relative'
      }
    : {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center'
      };

  const videoWrapperStyles = showControls
    ? {
        width: { xs: '100%', sm: '72vw', md: '68vw', lg: '960px' },
        maxWidth: '1280px',
        borderRadius: 1,
        border: hasVideo ? 'none' : '4px solid rgba(255,255,255,0.1)',
        aspectRatio: '16 / 9'
      }
    : {
        width: '100%',
        height: '100%',
        borderRadius: 0,
        border: 'none'
      };

  return (
    <OverlayContainer>
      <Box sx={outerStyles}>
        {/* Player container with high-tech reveal/hide animation */}
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            display: shouldShowPlayer ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'transparent',
            ...videoWrapperStyles,
            // High-tech border effect when video is playing
            ...(shouldShowPlayer && !showControls ? {
              border: '2px solid rgba(0, 200, 255, 0.4)',
              borderRadius: 2,
              animation: `${techReveal} 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards, ${borderPulse} 3s ease-in-out infinite`,
              '&::before': {
                content: '""',
                position: 'absolute',
                top: -2,
                left: -2,
                right: -2,
                bottom: -2,
                background: 'linear-gradient(45deg, rgba(0, 200, 255, 0.3), rgba(0, 150, 255, 0.1), rgba(0, 200, 255, 0.3))',
                borderRadius: 2,
                zIndex: -1,
                filter: 'blur(8px)'
              }
            } : {}),
            // Corner accents
            ...(shouldShowPlayer ? {
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: -4,
                background: `
                  linear-gradient(90deg, rgba(0, 200, 255, 0.6) 0%, transparent 15%) top left,
                  linear-gradient(0deg, rgba(0, 200, 255, 0.6) 0%, transparent 15%) top left,
                  linear-gradient(270deg, rgba(0, 200, 255, 0.6) 0%, transparent 15%) top right,
                  linear-gradient(0deg, rgba(0, 200, 255, 0.6) 0%, transparent 15%) top right,
                  linear-gradient(90deg, rgba(0, 200, 255, 0.6) 0%, transparent 15%) bottom left,
                  linear-gradient(180deg, rgba(0, 200, 255, 0.6) 0%, transparent 15%) bottom left,
                  linear-gradient(270deg, rgba(0, 200, 255, 0.6) 0%, transparent 15%) bottom right,
                  linear-gradient(180deg, rgba(0, 200, 255, 0.6) 0%, transparent 15%) bottom right
                `,
                backgroundSize: '40px 40px, 40px 40px',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'top left, top left, top right, top right, bottom left, bottom left, bottom right, bottom right',
                pointerEvents: 'none',
                zIndex: 10,
                animation: `${cornerGlow} 2s ease-in-out infinite`
              }
            } : {})
          }}
        >
          <Box 
            ref={containerRef} 
            id="overlay-player" 
            sx={{ 
              position: 'absolute', 
              inset: 0,
              zIndex: 1
            }} 
          />
          {showControls && !hideQueue && shouldShowPlayer && (
            <Metadata
              title={currentlyPlaying?.title}
              submitter={getQueueAlias(currentlyPlaying)}
              sx={{
                position: 'absolute',
                left: '50%',
                bottom: { xs: '4%', sm: '3%' },
                transform: 'translateX(-50%)',
                minWidth: { xs: '60vw', sm: '48vw' },
                maxWidth: { xs: '85vw', sm: '60vw' },
                zIndex: 2
              }}
            />
          )}
        </Box>

        {showControls && (
          <Box sx={{ width: { xs: '100%', sm: '72vw', md: '68vw', lg: '960px' }, maxWidth: '1280px' }}>
            <PlayerControlPanel
              variant="overlay"
              statusChips={[
                {
                  label: channelConnected ? 'Live' : 'Connecting…',
                  color: channelConnected ? 'success' : 'warning'
                },
                {
                  label: hasVideo ? 'On Air' : 'Idle',
                  color: hasVideo ? 'info' : 'default'
                }
              ]}
              headerLabel="Playback Actions"
              currentTimeLabel={formatTimestamp(Math.max(displayTime, 0))}
              durationLabel={formatTimestamp(resolvedDuration)}
              sliderValue={sliderValue}
              sliderMax={resolvedDuration || 1}
              onSeekChange={handleSeekChange}
              onSeekCommit={handleSeekCommit}
              seekDisabled={sliderDisabled}
              onPlay={handlePlay}
              onPause={handlePause}
              onSkip={skipCurrent}
              onVote={handleVote}
              onPlayNext={playNext}
              playDisabled={playDisabled}
              pauseDisabled={pauseDisabled}
              skipDisabled={skipDisabled}
              voteDisabled={voteDisabled}
              playNextDisabled={playNextDisabled}
              volumeValue={volumeSliderValue}
              volumeLabel={volumeLabel}
              muted={muted}
              onVolumeChange={handleVolumeChange}
              onVolumeToggle={handleVolumeToggle}
              volumeDisabled={volumeSliderDisabled}
            />
          </Box>
        )}
      </Box>
    </OverlayContainer>
  );
};

export default PlayerOverlay;
