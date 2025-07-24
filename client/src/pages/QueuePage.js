import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardMedia,
  Grid,
  Button,
  Chip,
  IconButton,
  Stack,
  Skeleton,
  Alert,
  Paper,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  SkipNext as SkipIcon,
  Delete as DeleteIcon,
  YouTube as YouTubeIcon,
  VideoLibrary as TikTokIcon,
  Instagram as InstagramIcon,
  AccessTime as TimeIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useSocket } from '../contexts/SocketContext';

const formatDuration = (seconds) => {
  if (!seconds) return 'Unknown';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const getPlatformIcon = (platform) => {
  switch (platform) {
    case 'YOUTUBE':
      return <YouTubeIcon sx={{ color: '#FF0000' }} />;
    case 'TIKTOK':
      return <TikTokIcon sx={{ color: '#000000' }} />;
    case 'INSTAGRAM':
      return <InstagramIcon sx={{ color: '#E4405F' }} />;
    default:
      return <YouTubeIcon />;
  }
};

const VideoCard = ({ video, isPlaying = false, onPlay, onRemove }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <Card 
      sx={{ 
        height: '100%',
        border: isPlaying ? '2px solid' : '1px solid',
        borderColor: isPlaying ? 'primary.main' : 'divider',
        backgroundColor: isPlaying ? 'action.selected' : 'background.paper',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
    >
      <Box sx={{ position: 'relative' }}>
        {video.thumbnailUrl && !imageError ? (
          <>
            {!imageLoaded && (
              <Skeleton variant="rectangular" height={180} />
            )}
            <CardMedia
              component="img"
              height="180"
              image={video.thumbnailUrl}
              alt={video.title}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              sx={{ 
                display: imageLoaded ? 'block' : 'none',
                objectFit: 'cover',
              }}
            />
          </>
        ) : (
          <Box 
            sx={{ 
              height: 180, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: 'grey.800',
            }}
          >
            {getPlatformIcon(video.platform)}
          </Box>
        )}
        
        {/* Duration overlay */}
        {video.duration && (
          <Chip
            icon={<TimeIcon />}
            label={formatDuration(video.duration)}
            size="small"
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
            }}
          />
        )}
        
        {/* Platform indicator */}
        <Chip
          icon={getPlatformIcon(video.platform)}
          label={video.platform}
          size="small"
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
          }}
        />
      </Box>
      
      <CardContent sx={{ p: 2 }}>
        <Typography 
          variant="h6" 
          sx={{ 
            fontWeight: 500,
            fontSize: '1rem',
            lineHeight: 1.3,
            height: '2.6em',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
          }}
        >
          {video.title || 'Untitled Video'}
        </Typography>
        
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            {video.submitter?.twitchUsername || video.submitterUsername}
          </Typography>
        </Box>
        
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayIcon />}
            onClick={() => onPlay(video)}
            fullWidth
            disabled={isPlaying}
          >
            {isPlaying ? 'Playing' : 'Play'}
          </Button>
          
          <IconButton
            size="small"
            onClick={() => onRemove(video.id)}
            color="error"
            sx={{ minWidth: 40 }}
          >
            <DeleteIcon />
          </IconButton>
        </Stack>
      </CardContent>
    </Card>
  );
};

const CurrentlyPlaying = ({ video, onSkip, onMarkPlayed }) => {
  if (!video) return null;

  return (
    <Paper 
      sx={{ 
        p: 3, 
        mb: 3, 
        border: '2px solid',
        borderColor: 'primary.main',
        backgroundColor: 'action.selected',
      }}
    >
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
        Now Playing
      </Typography>
      
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} md={4}>
          {video.thumbnailUrl ? (
            <Box
              component="img"
              src={video.thumbnailUrl}
              alt={video.title}
              sx={{
                width: '100%',
                height: 200,
                objectFit: 'cover',
                borderRadius: 1,
              }}
            />
          ) : (
            <Box 
              sx={{ 
                width: '100%',
                height: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'grey.800',
                borderRadius: 1,
              }}
            >
              {getPlatformIcon(video.platform)}
            </Box>
          )}
        </Grid>
        
        <Grid item xs={12} md={8}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
            {video.title}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Chip
              icon={getPlatformIcon(video.platform)}
              label={video.platform}
              color="primary"
            />
            
            {video.duration && (
              <Chip
                icon={<TimeIcon />}
                label={formatDuration(video.duration)}
                variant="outlined"
              />
            )}
            
            <Chip
              icon={<PersonIcon />}
              label={video.submitter?.twitchUsername || video.submitterUsername}
              variant="outlined"
            />
          </Box>
          
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<SkipIcon />}
              onClick={onSkip}
            >
              Skip
            </Button>
            
            <Button
              variant="outlined"
              onClick={() => onMarkPlayed(video.id)}
            >
              Mark as Played
            </Button>
          </Stack>
        </Grid>
      </Grid>
    </Paper>
  );
};

const QueuePage = () => {
  const {
    connected,
    queue,
    queueEnabled,
    currentlyPlaying,
    removeVideoFromQueue,
    playNext,
    skipCurrent,
    markAsPlayed,
  } = useSocket();

  const handlePlayVideo = (video) => {
    playNext();
  };

  const handleRemoveVideo = (videoId) => {
    removeVideoFromQueue(videoId);
  };

  const handleSkip = () => {
    skipCurrent();
  };

  const handleMarkPlayed = (videoId) => {
    markAsPlayed(videoId);
  };

  if (!connected) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Connecting to server...
        </Alert>
        <Typography variant="h6" color="text.secondary">
          Please wait while we establish connection.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        Video Queue
      </Typography>

      {/* Queue Status */}
      <Alert 
        severity={queueEnabled ? 'success' : 'info'} 
        sx={{ mb: 3 }}
      >
        Queue is currently {queueEnabled ? 'OPEN' : 'CLOSED'}. 
        {queueEnabled 
          ? ' Viewers can submit videos through Twitch chat.' 
          : ' Video submissions are disabled.'
        }
      </Alert>

      {/* Currently Playing */}
      <CurrentlyPlaying
        video={currentlyPlaying}
        onSkip={handleSkip}
        onMarkPlayed={handleMarkPlayed}
      />

      {/* Queue List */}
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
        Up Next ({queue.length})
      </Typography>

      {queue.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No videos in queue
          </Typography>
          <Typography color="text.secondary">
            Videos submitted through Twitch chat will appear here.
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {queue.map((video, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={video.id}>
              <VideoCard
                video={video}
                onPlay={handlePlayVideo}
                onRemove={handleRemoveVideo}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default QueuePage;
