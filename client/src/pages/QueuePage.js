import React, { useState, useEffect, useMemo } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  EmojiEvents as TrophyIcon,
  Star as StarIcon,
  HowToVote as VoteIcon,
  QueueMusic as QueueIcon,
} from '@mui/icons-material';
import { useSocket } from '../contexts/SocketContext';

const getAlias = (item) =>
  item?.submitterAlias || item?.submitter?.alias || null;

const getQueueDisplayName = (item) => getAlias(item) || 'Anonymous';

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

const VideoCard = ({ video, isPlaying = false, onPlay, onRemove, isTopEight = false }) => {
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
            {getQueueDisplayName(video)}
          </Typography>
        </Box>
        
        {isTopEight && (
          <Box sx={{ mt: 1 }}>
            <Chip
              icon={<StarIcon />}
              label="Top 8"
              size="small"
              color="warning"
              sx={{ fontWeight: 600 }}
            />
          </Box>
        )}
        
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

const CurrentlyPlaying = ({
  video,
  onSkip,
  onVote,
  onNext,
  skipDisabled = false,
  voteDisabled = false,
  nextDisabled = false,
  errorMessage = null
}) => {
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
              label={getQueueDisplayName(video)}
              variant="outlined"
            />
          </Box>
          
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<SkipIcon />}
              onClick={onSkip}
              disabled={skipDisabled}
            >
              Skip
            </Button>
            
            <Button
              variant="contained"
              color="primary"
              startIcon={<VoteIcon />}
              onClick={() => onVote?.(video.id)}
              disabled={voteDisabled}
            >
              Vote
            </Button>

            <Button
              variant="outlined"
              startIcon={<QueueIcon />}
              onClick={onNext}
              disabled={nextDisabled}
            >
              Next From Queue
            </Button>
          </Stack>

          {errorMessage && (
            <Alert severity="error" sx={{ mt: 2, maxWidth: 420 }}>
              {errorMessage}
            </Alert>
          )}
        </Grid>
      </Grid>
    </Paper>
  );
};

const CupStandings = ({ standings, cupTitle }) => {
  if (!standings || standings.length === 0) {
    return null;
  }

  // Sort by social score (averageScore in the standings data)
  const sortedStandings = [...standings].sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    // Social score is stored in averageScore field (aggregate of user's videos)
    const scoreA = a.averageScore || a.totalScore || 0;
    const scoreB = b.averageScore || b.totalScore || 0;
    return scoreB - scoreA;
  });

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <TrophyIcon sx={{ fontSize: 32, color: 'warning.main' }} />
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {cupTitle || 'Cup'} Standings - Social Score Rankings
        </Typography>
      </Box>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Rankings based on aggregate performance across all submitted videos
      </Typography>
      
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Rank</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>Social Score</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>Videos Scored</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedStandings.map((standing, index) => {
                      const socialScore = standing.averageScore || standing.totalScore;
              return (
                <TableRow 
                  key={standing.id || `${standing.submitterUsername}-${index}`}
                  sx={{ 
                    '&:nth-of-type(odd)': { backgroundColor: 'action.hover' },
                    '&:hover': { backgroundColor: 'action.selected' }
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {standing.rank || index + 1}
                      {index === 0 && (
                        <TrophyIcon sx={{ fontSize: 18, color: 'gold' }} />
                      )}
                      {index === 1 && (
                        <TrophyIcon sx={{ fontSize: 18, color: 'silver' }} />
                      )}
                      {index === 2 && (
                        <TrophyIcon sx={{ fontSize: 18, color: '#CD7F32' }} />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {standing.submitterUsername || 'Anonymous'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip 
                      label={socialScore ? Number(socialScore).toFixed(5) : '—'}
                      size="small"
                      color={index < 3 ? 'primary' : 'default'}
                      sx={{ fontWeight: 600, minWidth: 70 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {standing.judgeCount || 0}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
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
    settings,
    cupStandings,
    refreshCupStandings,
    votingState,
    startVotingSession,
  } = useSocket();

  const [activeCupId, setActiveCupId] = useState(null);
  const [cupInfo, setCupInfo] = useState(null);
  const [controlError, setControlError] = useState(null);

  // Get active cup from settings or queue items
  useEffect(() => {
    if (settings?.activeCupId) {
      setActiveCupId(settings.activeCupId);
    } else if (queue.length > 0) {
      const cupId = queue.find(item => item.cupId)?.cupId;
      if (cupId) {
        setActiveCupId(cupId);
      }
    }
  }, [settings, queue]);

  // Fetch cup info when activeCupId changes
  useEffect(() => {
    if (!activeCupId) {
      setCupInfo(null);
      return;
    }

    const fetchCupInfo = async () => {
      try {
        // Try to refresh standings to get cup info
        refreshCupStandings(activeCupId);
        
        // Also fetch cup details
        const channelId = settings?.channelId || window.location.pathname.split('/')[2];
        if (channelId) {
          const response = await fetch(`/api/channels/${channelId}/cups/${activeCupId}`, {
            credentials: 'include'
          });
          if (response.ok) {
            const data = await response.json();
            setCupInfo(data.cup || data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch cup info:', error);
      }
    };

    fetchCupInfo();
  }, [activeCupId, settings, refreshCupStandings]);

  const currentStandings = useMemo(() => {
    return activeCupId ? cupStandings[activeCupId] : null;
  }, [activeCupId, cupStandings]);

  const topEightVideos = useMemo(() => {
    return queue.filter(video => video.status === 'TOP_EIGHT');
  }, [queue]);

  const otherQueueVideos = useMemo(() => {
    return queue.filter(video => video.status !== 'TOP_EIGHT' && video.id !== currentlyPlaying?.id);
  }, [queue, currentlyPlaying]);

  const currentCupId = useMemo(
    () => currentlyPlaying?.cupId || activeCupId || null,
    [currentlyPlaying?.cupId, activeCupId]
  );
  const votingActive = useMemo(
    () => Boolean(votingState && votingState.stage && votingState.stage !== 'cancelled'),
    [votingState]
  );
  const voteDisabled = !currentlyPlaying || !currentCupId || votingActive;
  const skipDisabled = !currentlyPlaying;
  const nextDisabled = queue.length === 0;

  const handlePlayVideo = () => {
    setControlError(null);
    playNext();
  };

  const handleRemoveVideo = (videoId) => {
    removeVideoFromQueue(videoId);
  };

  const handleSkip = () => {
    setControlError(null);
    skipCurrent();
  };

  const handleVote = async () => {
    if (!currentlyPlaying || !currentCupId) {
      setControlError('Assign this video to a cup before starting voting.');
      return;
    }

    if (votingActive) {
      return;
    }

    try {
      setControlError(null);
      await startVotingSession(currentlyPlaying.id, currentCupId);
    } catch (error) {
      console.error('Failed to start voting:', error);
      setControlError(error.message || 'Failed to start voting');
    }
  };

  const handlePlayNext = () => {
    setControlError(null);
    playNext();
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

      {/* Cup Info Banner */}
      {cupInfo && (
        <Alert 
          severity="info" 
          icon={<TrophyIcon />}
          sx={{ mb: 3 }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {cupInfo.title || 'Active Cup'}
          </Typography>
          {cupInfo.theme && (
            <Typography variant="body2" color="text.secondary">
              Theme: {cupInfo.theme}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            Status: {cupInfo.status || 'LIVE'}
          </Typography>
        </Alert>
      )}

      {/* Cup Standings - Show user rankings based on social scores */}
      {currentStandings && currentStandings.length > 0 && (
        <CupStandings 
          standings={currentStandings} 
          cupTitle={cupInfo?.title}
        />
      )}

      {/* Queue Status */}
      <Alert 
        severity={queueEnabled ? 'success' : 'info'} 
        sx={{ mb: 3 }}
      >
        Queue is currently {queueEnabled ? 'OPEN' : 'CLOSED'}. 
        {queueEnabled 
          ? ' Viewers can submit videos through Twitch chat throughout the night.' 
          : ' Video submissions are disabled.'
        }
      </Alert>

      {/* Currently Playing */}
      <CurrentlyPlaying
        video={currentlyPlaying}
        onSkip={handleSkip}
        onVote={handleVote}
        onNext={handlePlayNext}
        skipDisabled={skipDisabled}
        voteDisabled={voteDisabled}
        nextDisabled={nextDisabled}
        errorMessage={controlError}
      />

      {/* Top 8 Section */}
      {topEightVideos.length > 0 && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <StarIcon sx={{ fontSize: 28, color: 'warning.main' }} />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Top 8 - Up Next
            </Typography>
          </Box>
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {topEightVideos.map((video) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={video.id}>
                <VideoCard
                  video={video}
                  onPlay={handlePlayVideo}
                  onRemove={handleRemoveVideo}
                  isTopEight={true}
                />
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* Rest of Queue */}
      {otherQueueVideos.length > 0 && (
        <>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
            Queue ({otherQueueVideos.length})
          </Typography>
          <Grid container spacing={3}>
            {otherQueueVideos.map((video) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={video.id}>
                <VideoCard
                  video={video}
                  onPlay={handlePlayVideo}
                  onRemove={handleRemoveVideo}
                  isTopEight={false}
                />
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {queue.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No videos in queue
          </Typography>
          <Typography color="text.secondary">
            Videos submitted through Twitch chat will appear here.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default QueuePage;
