import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Switch,
  FormControlLabel,
  TextField,
  Alert,
  Chip,
  Divider,
  Stack,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  alpha
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  SkipNext as SkipIcon,
  Clear as ClearIcon,
  Settings as SettingsIcon,
  SmartToy as BotIcon,
  Queue as QueueIcon,
  Delete as DeleteIcon,
  VolumeUp as VolumeIcon,
  Pause as PauseIcon,
  WarningAmber as WarningIcon
} from '@mui/icons-material';
import { useSocket } from '../contexts/SocketContext';

const formatTimestamp = (value) => {
  if (!value) return 'Just now';
  try {
    const date = new Date(value);
    return date.toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return value;
  }
};

const getSubmitterAlias = (item) =>
  item?.submitterAlias || item?.submitter?.alias || 'Anonymous';

const getSubmitterUsername = (item) =>
  item?.submitter?.twitchUsername || item?.submitterUsername || null;

const formatSubmitterLabel = (item, { includeReal = false } = {}) => {
  const alias = getSubmitterAlias(item);
  if (!includeReal) {
    return alias;
  }

  const real = getSubmitterUsername(item);
  if (real && real !== alias) {
    return `${alias} (real: ${real})`;
  }

  return alias;
};

const AdminPage = () => {
  const {
    connected,
    queue,
    queueEnabled,
    currentlyPlaying,
    enableQueue,
    disableQueue,
    playNext,
    skipCurrent,
    clearQueue,
    removeVideoFromQueue,
    updateSetting,
    settings,
    channelId,
    playOverlay,
    pauseOverlay,
    channelConnected
  , vipQueue
  } = useSocket();

  const [localSettings, setLocalSettings] = useState({
    maxQueueSize: '1000',
    submissionCooldown: '30',
    maxVideoDuration: '600',
    autoPlayNext: true,
    currentVolume: '75',
  });

  const [botStatus, setBotStatus] = useState({
    connected: false,
    channel: '',
    moderators: [],
    bannedUsers: [],
  });

  const [pendingSubmissions, setPendingSubmissions] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState(null);
  const [pendingActionId, setPendingActionId] = useState(null);

  const loadPendingSubmissions = useCallback(async () => {
    if (!channelId) {
      setPendingSubmissions([]);
      return;
    }

    try {
      setPendingLoading(true);
      setPendingError(null);

      const response = await fetch(`/api/channels/${channelId}/submissions?status=PENDING`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to load submissions');
      }

      const data = await response.json();
      setPendingSubmissions(data.submissions || []);
    } catch (error) {
      console.error('Failed to load submissions:', error);
      setPendingError(error.message || 'Failed to load submissions');
    } finally {
      setPendingLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    loadPendingSubmissions();
  }, [loadPendingSubmissions]);

  const handleSubmissionAction = async (itemId, action) => {
    if (!channelId) {
      return;
    }

    try {
      setPendingActionId(itemId);
      setPendingError(null);

      const response = await fetch(`/api/channels/${channelId}/submissions/${itemId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ action })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update submission');
      }

      setPendingSubmissions((prev) => prev.filter((item) => item.id !== itemId));
      await loadPendingSubmissions();
    } catch (error) {
      console.error('Failed to update submission:', error);
      setPendingError(error.message || 'Failed to update submission');
    } finally {
      setPendingActionId(null);
    }
  };

  // Fetch bot status on component mount
  useEffect(() => {
    const fetchBotStatus = async () => {
      try {
        const response = await fetch('/api/bot/status');
        const data = await response.json();
        setBotStatus(data);
      } catch (error) {
        console.error('Failed to fetch bot status:', error);
      }
    };

    fetchBotStatus();
  }, []);

  // Update local settings when socket settings change
  useEffect(() => {
    if (settings) {
      setLocalSettings(prev => ({
        ...prev,
        ...settings,
      }));
    }
  }, [settings]);

  const handleToggleQueue = () => {
    if (queueEnabled) {
      disableQueue();
    } else {
      enableQueue();
    }
  };

  const handleUpdateSetting = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value,
    }));
    updateSetting(key, value);
  };

  const handlePlayNext = () => {
    playNext();
  };

  const handleSkip = () => {
    skipCurrent();
  };

  const handleClearQueue = () => {
    if (window.confirm('Are you sure you want to clear the entire queue?')) {
      clearQueue();
    }
  };

  const handleRemoveVideo = (videoId) => {
    removeVideoFromQueue(videoId);
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
        Admin Dashboard
      </Typography>

      <Grid container spacing={3}>
        {/* Queue Controls */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <QueueIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Queue Controls
                </Typography>
              </Box>

              <Stack spacing={2}>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <FormControlLabel
                    control={
                      <Switch
                        checked={queueEnabled}
                        onChange={handleToggleQueue}
                        color="primary"
                      />
                    }
                    label={`Queue ${queueEnabled ? 'Enabled' : 'Disabled'}`}
                  />
                  {channelId && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => window.open(`/player/${channelId}`, '_blank')}
                    >
                      Open Player
                    </Button>
                  )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={`${queue.length} videos in queue`}
                    color="primary"
                    variant="outlined"
                  />
                  {currentlyPlaying && (
                    <Chip
                      label="Now Playing"
                      color="success"
                      size="small"
                    />
                  )}
                </Box>

                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    startIcon={<PlayIcon />}
                    onClick={handlePlayNext}
                    disabled={queue.length === 0}
                    size="small"
                  >
                    Play Next
                  </Button>
                  
                  <Button
                    variant="outlined"
                    startIcon={<SkipIcon />}
                    onClick={handleSkip}
                    disabled={!currentlyPlaying}
                    size="small"
                  >
                    Skip
                  </Button>
                  
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<ClearIcon />}
                    onClick={handleClearQueue}
                    disabled={queue.length === 0}
                    size="small"
                  >
                    Clear
                  </Button>
                  
                  <Button
                    variant="outlined"
                    startIcon={<PlayIcon />}
                    onClick={playOverlay}
                    size="small"
                    color="secondary"
                    disabled={!channelConnected}
                  >
                    Play
                  </Button>
                  
                  <Button
                    variant="outlined"
                    startIcon={<PauseIcon />}
                    onClick={pauseOverlay}
                    size="small"
                    color="secondary"
                    disabled={!channelConnected}
                  >
                    Pause
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Moderation Queue */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <QueueIcon sx={{ mr: 1, color: 'warning.main' }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Moderation Queue
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={loadPendingSubmissions}
                  disabled={pendingLoading}
                >
                  Refresh
                </Button>
              </Box>

              {pendingError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {pendingError}
                </Alert>
              )}

              {pendingLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : pendingSubmissions.length === 0 ? (
                <Alert severity="info">
                  No pending submissions right now. You&rsquo;re all caught up!
                </Alert>
              ) : (
                <List disablePadding>
                  {pendingSubmissions.map((submission) => (
                    <ListItem key={submission.id} divider alignItems="flex-start" sx={{ py: 1.5 }}>
                      <ListItemText
                        primary={submission.title || 'Untitled Video'}
                        secondary={`Submitted by ${formatSubmitterLabel(submission, { includeReal: true })} • ${formatTimestamp(submission.createdAt)}`}
                      />
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => handleSubmissionAction(submission.id, 'APPROVE')}
                          disabled={pendingActionId === submission.id}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          color={Array.isArray(vipQueue) && vipQueue.includes(submission.id) ? 'secondary' : 'primary'}
                          onClick={() => handleSubmissionAction(submission.id, Array.isArray(vipQueue) && vipQueue.includes(submission.id) ? 'UNVIP' : 'VIP')}
                          disabled={pendingActionId === submission.id}
                        >
                          {Array.isArray(vipQueue) && vipQueue.includes(submission.id) ? 'Un-VIP' : 'VIP'}
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          onClick={() => handleSubmissionAction(submission.id, 'REJECT')}
                          disabled={pendingActionId === submission.id}
                        >
                          Reject
                        </Button>
                        {pendingActionId === submission.id && (
                          <CircularProgress size={16} />
                        )}
                      </Stack>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Bot Status */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <BotIcon sx={{ mr: 1, color: 'secondary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Twitch Bot Status
                </Typography>
              </Box>

              <Stack spacing={2}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={botStatus.connected ? 'Connected' : 'Disconnected'}
                    color={botStatus.connected ? 'success' : 'error'}
                    size="small"
                  />
                  {botStatus.channel && (
                    <Chip
                      label={`#${botStatus.channel}`}
                      variant="outlined"
                      size="small"
                    />
                  )}
                </Box>

                {botStatus.moderators && botStatus.moderators.length > 0 && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Moderators: {botStatus.moderators.join(', ')}
                    </Typography>
                  </Box>
                )}

                {!botStatus.connected && (
                  <Alert severity="warning" size="small">
                    Bot is not connected. Check your Twitch credentials in the .env file.
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* VIP Queue */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <QueueIcon sx={{ mr: 1, color: 'secondary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  VIP Queue
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Chip
                  label={`${Array.isArray(vipQueue) ? vipQueue.length : 0} VIP${Array.isArray(vipQueue) && vipQueue.length === 1 ? '' : 's'}`}
                  size="small"
                  color="secondary"
                  variant="outlined"
                />
              </Box>

              {(!Array.isArray(vipQueue) || vipQueue.length === 0) ? (
                <Alert severity="info">No VIP items right now.</Alert>
              ) : (
                <List dense>
                  {vipQueue.map((id, index) => {
                    const item = queue.find((q) => q.id === id) || null;
                    return (
                      <ListItem key={`vip-${id}`} divider>
                        <ListItemText
                          primary={item ? (item.title || 'Untitled Video') : `Queue Item #${id}`}
                          secondary={item ? `#${index + 1} • by ${formatSubmitterLabel(item, { includeReal: true })}` : `#${index + 1}`}
                        />
                        <ListItemSecondaryAction>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip label={`#${index + 1}`} size="small" color="secondary" variant="outlined" />
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleSubmissionAction(id, 'UNVIP')}
                            >
                              Un-VIP
                            </Button>
                          </Stack>
                        </ListItemSecondaryAction>
                      </ListItem>
                    );
                  })}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Settings */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <SettingsIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Queue Settings
                </Typography>
              </Box>

              <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Max Queue Size"
                    type="number"
                    value={localSettings.maxQueueSize}
                    onChange={(e) => handleUpdateSetting('max_queue_size', e.target.value)}
                    inputProps={{ min: 1, max: 200 }}
                    fullWidth
                    size="small"
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Submission Cooldown (seconds)"
                    type="number"
                    value={localSettings.submissionCooldown}
                    onChange={(e) => handleUpdateSetting('submission_cooldown', e.target.value)}
                    inputProps={{ min: 0, max: 300 }}
                    fullWidth
                    size="small"
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Max Video Duration (seconds)"
                    type="number"
                    value={localSettings.maxVideoDuration}
                    onChange={(e) => handleUpdateSetting('max_video_duration', e.target.value)}
                    inputProps={{ min: 30, max: 3600 }}
                    fullWidth
                    size="small"
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Volume"
                    type="number"
                    value={localSettings.currentVolume}
                    onChange={(e) => handleUpdateSetting('current_volume', e.target.value)}
                    inputProps={{ min: 0, max: 100 }}
                    InputProps={{
                      startAdornment: <VolumeIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                      endAdornment: '%',
                    }}
                    fullWidth
                    size="small"
                  />
                </Grid>

                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={localSettings.autoPlayNext === 'true' || localSettings.autoPlayNext === true}
                        onChange={(e) => handleUpdateSetting('auto_play_next', e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Auto-play next video when current video ends"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Current Queue Management */}
        {queue.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  Queue Management ({queue.length} videos)
                </Typography>

                <List dense>
                  {queue.map((video, index) => (
                    <React.Fragment key={video.id}>
                      <ListItem
                        alignItems="flex-start"
                        sx={{
                          ...(video.moderationStatus === 'WARNING'
                            ? {
                                borderLeft: '4px solid',
                                borderColor: 'warning.main',
                                bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08)
                              }
                            : {})
                        }}
                      >
                        <ListItemText
                          primary={video.title || 'Untitled Video'}
                          secondary={
                            <Box
                              component="span"
                              sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}
                            >
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  flexWrap: 'wrap'
                                }}
                              >
                                <Chip
                                  label={video.platform}
                                  size="small"
                                  variant="outlined"
                                />
                                <span>by {formatSubmitterLabel(video, { includeReal: true })}</span>
                                {video.duration && (
                                  <span>
                                    • {Math.floor(video.duration / 60)}:
                                    {(video.duration % 60).toString().padStart(2, '0')}
                                  </span>
                                )}
                              </Box>

                              {video.moderationStatus === 'WARNING' && (
                                <Alert
                                  severity="warning"
                                  icon={<WarningIcon fontSize="inherit" />}
                                  sx={{ py: 0.75, px: 1, borderRadius: 1 }}
                                >
                                  <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                                    Flagged by {video.moderatedByDisplayName || video.moderatedBy || 'Moderator'}
                                    {video.moderatedAt ? ` — ${formatTimestamp(video.moderatedAt)}` : ''}
                                  </Typography>
                                  {video.moderationNote && (
                                    <Typography variant="caption">
                                      {video.moderationNote}
                                    </Typography>
                                  )}
                                </Alert>
                              )}

                              {video.moderationStatus !== 'WARNING' && video.moderatedBy && (
                                <Typography variant="caption" color="success.main">
                                  Approved by {video.moderatedByDisplayName || video.moderatedBy}
                                  {video.moderatedAt ? ` — ${formatTimestamp(video.moderatedAt)}` : ''}
                                  {video.moderationNote ? ` — ${video.moderationNote}` : ''}
                                </Typography>
                              )}
                            </Box>
                          }
                        />
                        <ListItemSecondaryAction>
                          <Stack direction="row" spacing={1} alignItems="center">
                            {video.moderationStatus === 'WARNING' && (
                              <Chip
                                label="Warning"
                                color="warning"
                                size="small"
                                icon={<WarningIcon fontSize="small" />}
                              />
                            )}
                              {(Array.isArray(vipQueue) && vipQueue.includes(video.id)) && (
                                <Chip label="VIP" color="secondary" size="small" />
                              )}
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => handleSubmissionAction(video.id, Array.isArray(vipQueue) && vipQueue.includes(video.id) ? 'UNVIP' : 'VIP')}
                              >
                                {Array.isArray(vipQueue) && vipQueue.includes(video.id) ? 'Un-VIP' : 'VIP'}
                              </Button>
                              <IconButton
                                edge="end"
                                onClick={() => handleRemoveVideo(video.id)}
                                color="error"
                                size="small"
                              >
                                <DeleteIcon />
                              </IconButton>
                          </Stack>
                        </ListItemSecondaryAction>
                      </ListItem>
                      {index < queue.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Bot Commands Help */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                Available Twitch Commands
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                    Moderator Commands:
                  </Typography>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="!queue on/off"
                        secondary="Enable or disable the queue"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="!skip"
                        secondary="Skip the current video"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="!clear"
                        secondary="Clear the entire queue"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="!volume <0-100>"
                        secondary="Set the volume"
                      />
                    </ListItem>
                  </List>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                    Viewer Commands:
                  </Typography>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Drop YouTube/TikTok/Instagram links in chat"
                        secondary="When queue is open, videos will be automatically added"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="!queue"
                        secondary="Check current queue status"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="!help"
                        secondary="Show available commands"
                      />
                    </ListItem>
                  </List>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminPage;
