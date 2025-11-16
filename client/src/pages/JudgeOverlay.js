import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useSocket } from '../contexts/SocketContext';
import { useSyncedYouTubePlayer } from '../hooks/useSyncedYouTubePlayer';
import { getActiveGongEntries, GONG_IMAGE_URL, GONG_AUDIO_URL } from '../constants/gongs';

const OverlayContainer = ({ children }) => (
  <Box
    sx={{
      width: '100vw',
      height: '100vh',
      bgcolor: 'black',
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

const JudgeOverlay = () => {
  const { channelName } = useParams();

  const {
    connectToChannel,
    disconnectFromChannel,
    currentlyPlaying,
    playOverlay,
    pauseOverlay,
    seekOverlay,
    addChannelListener,
    removeChannelListener,
    channelConnected,
    gongState
  } = useSocket();

  useEffect(() => {
    if (!channelName) return;
    connectToChannel(channelName, { explicit: true });
    return () => disconnectFromChannel();
  }, [channelName, connectToChannel, disconnectFromChannel]);

  const {
    containerRef,
    hasVideo
  } = useSyncedYouTubePlayer({
    videoId: currentlyPlaying?.videoId,
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

  const activeGongs = useMemo(
    () => getActiveGongEntries(gongState, currentlyPlaying?.id || null),
    [gongState, currentlyPlaying?.id]
  );

  const gongSeenRef = useRef(new Set());

  const playGongAudio = useCallback(() => {
    if (!GONG_AUDIO_URL) {
      return;
    }
    try {
      const audio = new Audio(GONG_AUDIO_URL);
      audio.volume = 1;
      audio.play().catch(() => {});
    } catch (_) {
      // ignore playback errors on overlay
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

  if (!hasVideo || !currentlyPlaying) {
    return (
      <OverlayContainer>
        <Typography variant="h4" color="rgba(255,255,255,0.5)">
          Waiting for video...
        </Typography>
      </OverlayContainer>
    );
  }

  return (
    <OverlayContainer>
      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      />
      {activeGongs.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: { xs: '4%', sm: '5%' },
            right: { xs: '4%', sm: '5%' },
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
            pointerEvents: 'none'
          }}
        >
          {activeGongs.map((entry) => (
            <Box
              key={entry.id}
              sx={{
                bgcolor: 'rgba(0,0,0,0.45)',
                borderRadius: 2,
                px: 1.5,
                py: 1,
                minWidth: 96,
                textAlign: 'center'
              }}
            >
              <Box
                component="img"
                src={GONG_IMAGE_URL}
                alt="Gong"
                sx={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 1, mb: 0.5 }}
              />
              <Typography variant="subtitle2" fontWeight={700}>
                {entry.displayName || 'Judge'}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </OverlayContainer>
  );
};

export default JudgeOverlay;
