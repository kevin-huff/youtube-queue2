import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useSocket } from '../contexts/SocketContext';
import { useSyncedYouTubePlayer } from '../hooks/useSyncedYouTubePlayer';

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
    channelConnected
  } = useSocket();

  useEffect(() => {
    if (!channelName) return;
    connectToChannel(channelName);
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
    onLocalPlay: playOverlay,
    onLocalPause: pauseOverlay,
    onLocalSeek: seekOverlay
  });

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
    </OverlayContainer>
  );
};

export default JudgeOverlay;
