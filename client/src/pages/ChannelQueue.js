import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Container,
  Divider,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Skeleton,
  Typography,
  alpha,
  useTheme
} from '@mui/material';
import {
  AccessTime,
  LiveTv,
  Person,
  QueueMusic,
  Refresh,
  SkipNext
} from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';

const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) {
    return 'N/A';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const VideoPlayer = ({ video, queueEnabled }) => {
  const theme = useTheme();

  if (!video) {
    return (
      <Paper
        sx={{
          p: 6,
          textAlign: 'center',
          background: alpha(theme.palette.background.paper, 0.5),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
        }}
      >
        <QueueMusic sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          No video currently playing
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Queue is {queueEnabled ? 'enabled' : 'disabled'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Card sx={{ position: 'relative', paddingTop: '56.25%' }}>
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
      >
        <iframe
          width="100%"
          height="100%"
          src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1`}
          title={video.title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </Box>
    </Card>
  );
};

const QueueItem = ({ video, index }) => {
  const theme = useTheme();

  return (
    <ListItem
      sx={{
        bgcolor: 'background.paper',
        mb: 1,
        borderRadius: 1,
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        transition: 'all 0.3s ease',
        '&:hover': {
          bgcolor: alpha(theme.palette.primary.main, 0.05),
          transform: 'translateX(4px)'
        }
      }}
    >
      <ListItemAvatar>
        <Avatar
          sx={{
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            color: 'primary.main',
            fontWeight: 700
          }}
        >
          {index + 1}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={
          <Typography variant="subtitle1" noWrap fontWeight={600}>
            {video.title}
          </Typography>
        }
        secondary={
          <Box display="flex" alignItems="center" gap={2} mt={0.5}>
            <Chip
              size="small"
              icon={<Person />}
              label={video.submitter?.twitchUsername || video.submitterUsername || video.requestedBy || 'Anonymous'}
              variant="outlined"
            />
            <Chip
              size="small"
              icon={<AccessTime />}
              label={formatDuration(video.duration)}
              variant="outlined"
            />
          </Box>
        }
      />
      {video.thumbnailUrl || video.thumbnail ? (
        <CardMedia
          component="img"
          sx={{ width: 120, height: 67, borderRadius: 1, ml: 2 }}
          image={video.thumbnailUrl || video.thumbnail}
          alt={video.title}
        />
      ) : null}
    </ListItem>
  );
};

const ChannelQueue = () => {
  const { channelName } = useParams();
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    connectToChannel,
    disconnectFromChannel,
    queue,
    currentlyPlaying,
    queueEnabled,
    channelConnected
  } = useSocket();

  useEffect(() => {
    const loadChannel = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/channels/public/${channelName}`);
        setChannel(response.data.channel);
      } catch (err) {
        console.error('Failed to fetch channel data:', err);
        setError(err.response?.data?.error || 'Failed to load channel information');
      } finally {
        setLoading(false);
      }
    };

    loadChannel();
  }, [channelName]);

  useEffect(() => {
    if (!channelName) return;
    connectToChannel(channelName);
    return () => {
      disconnectFromChannel();
    };
  }, [channelName, connectToChannel, disconnectFromChannel]);

  const totalDuration = useMemo(() => {
    return queue.reduce((sum, item) => sum + (item.duration || 0), 0);
  }, [queue]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Skeleton variant="rectangular" height={450} sx={{ borderRadius: 1 }} />
          </Grid>
          <Grid item xs={12} md={4}>
            <Skeleton variant="rectangular" height={450} sx={{ borderRadius: 1 }} />
          </Grid>
        </Grid>
      </Container>
    );
  }

  if (error || !channel) {
    return (
      <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
        <LiveTv sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          Channel Not Found
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {error || `The channel "${channelName}" does not exist or is not available.`}
        </Typography>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box display="flex" alignItems="center" mb={4}>
          <Avatar
            src={channel.profileImageUrl || undefined}
            alt={channel.displayName}
            sx={{ width: 72, height: 72, mr: 2 }}
          >
            {channel.displayName?.charAt(0)?.toUpperCase() || channel.id?.charAt(0)?.toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="h4" fontWeight={700}>
              {channel.displayName || channel.id}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Live queue for {channel.id}
            </Typography>
          </Box>
        </Box>

        <Grid container spacing={4}>
          <Grid item xs={12} md={7}>
            <VideoPlayer video={currentlyPlaying} queueEnabled={queueEnabled} />

            <Paper sx={{ mt: 3, p: 3 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6" fontWeight={600}>
                  Queue
                </Typography>
                <Chip
                  icon={<SkipNext />}
                  label={`${queue.length} videos`}
                  color="primary"
                  variant="outlined"
                />
              </Box>

              {!channelConnected ? (
                <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                  <LinearProgress sx={{ width: '100%' }} />
                  <Typography variant="body2" color="text.secondary">
                    Connecting to live queue...
                  </Typography>
                </Box>
              ) : queue.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }} variant="outlined">
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No videos in queue
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Videos submitted through Twitch chat will appear here in real time.
                  </Typography>
                </Paper>
              ) : (
                <List>
                  {queue.map((video, index) => (
                    <QueueItem key={video.id || index} video={video} index={index} />
                  ))}
                </List>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={5}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <LiveTv color="primary" />
                  <Typography variant="h6" fontWeight={600}>
                    Channel Status
                  </Typography>
                  <Chip
                    label={queueEnabled ? 'Queue Open' : 'Queue Closed'}
                    color={queueEnabled ? 'success' : 'default'}
                    size="small"
                    sx={{ ml: 'auto' }}
                  />
                </Box>

                <Alert severity={queueEnabled ? 'success' : 'warning'} sx={{ mb: 2 }}>
                  Queue is {queueEnabled ? 'OPEN' : 'CLOSED'}
                </Alert>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Live Metrics
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText
                      primary="Socket Connection"
                      secondary={channelConnected ? 'Connected' : 'Connecting...'}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Videos in Queue"
                      secondary={queue.length}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Total Duration"
                      secondary={formatDuration(totalDuration)}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Now Playing"
                      secondary={currentlyPlaying?.title || 'Nothing playing'}
                    />
                  </ListItem>
                </List>

                <Divider sx={{ my: 2 }} />

                <Box display="flex" alignItems="center" gap={1}>
                  <Refresh fontSize="small" />
                  <Typography variant="caption" color="text.secondary">
                    Data updates automatically in real time.
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default ChannelQueue;
