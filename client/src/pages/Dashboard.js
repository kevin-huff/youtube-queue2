import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Skeleton,
  Chip,
  Avatar,
  Tooltip,
  useTheme,
  alpha,
  Fab,
  Divider,
  Paper
} from '@mui/material';
import {
  Add,
  Delete,
  Settings,
  LiveTv,
  QueueMusic,
  TrendingUp,
  Refresh,
  ContentCopy,
  Check,
  PlayArrow,
  Visibility
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const StatCard = ({ icon, title, value, color = 'primary' }) => {
  const theme = useTheme();
  
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography color="text.secondary" variant="body2" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {value}
            </Typography>
          </Box>
          <Avatar
            sx={{
              bgcolor: alpha(theme.palette[color].main, 0.1),
              color: `${color}.main`,
              width: 56,
              height: 56
            }}
          >
            {icon}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );
};

const ChannelCard = ({ channel, onDelete, onRefresh }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/channel/${channel.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleViewQueue = () => {
    navigate(`/channel/${channel.id}`);
  };

  const handleManage = () => {
    navigate(`/channel/${channel.id}/manage`);
  };

  return (
    <Card 
      sx={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: theme.shadows[8]
        }
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Box display="flex" alignItems="center" mb={2}>
          <LiveTv sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={600}>
            {channel.displayName || channel.id}
          </Typography>
          {channel.isActive && (
            <Chip 
              label="Active" 
              size="small" 
              color="success" 
              sx={{ ml: 'auto' }}
            />
          )}
        </Box>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Queue Size
              </Typography>
              <Typography variant="h6">
                {channel.queueStats?.size || 0}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Total Views
              </Typography>
              <Typography variant="h6">
                {channel.queueStats?.currentlyPlaying ? 1 : 0}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Queue Status
        </Typography>
        <Chip 
          label={channel.settings?.queue_enabled === 'true' || channel.queueStats?.enabled ? 'Enabled' : 'Disabled'}
          color={channel.settings?.queue_enabled === 'true' || channel.queueStats?.enabled ? 'success' : 'default'}
          size="small"
          sx={{ mb: 2 }}
        />

        <Divider sx={{ my: 2 }} />

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Channel URL
        </Typography>
        <Box display="flex" alignItems="center">
          <Typography 
            variant="body2" 
            sx={{ 
              flex: 1, 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {window.location.origin}/channel/{channel.id}
          </Typography>
          <Tooltip title={copied ? "Copied!" : "Copy link"}>
            <IconButton size="small" onClick={handleCopyLink}>
              {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </CardContent>

      <CardActions sx={{ p: 2, pt: 0 }}>
        <Button 
          size="small" 
          startIcon={<Visibility />}
          onClick={handleViewQueue}
        >
          View
        </Button>
        <Button 
          size="small" 
          startIcon={<Settings />}
          onClick={handleManage}
        >
          Manage
        </Button>
        <IconButton 
          size="small" 
          color="error"
          onClick={() => onDelete(channel)}
          sx={{ ml: 'auto' }}
        >
          <Delete />
        </IconButton>
      </CardActions>
    </Card>
  );
};

const Dashboard = () => {
  const theme = useTheme();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchChannels();
    }
  }, [user]);

  const fetchChannels = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/channels', {
        withCredentials: true
      });
      setChannels(response.data.channels || []);
    } catch (err) {
      console.error('Failed to fetch channels:', err);
      setError('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!channelName.trim()) return;

    try {
      setAdding(true);
      const response = await axios.post('/api/channels', {
        name: channelName.trim()
      }, {
        withCredentials: true
      });
      
      setChannels([...channels, response.data.channel]);
      setAddDialogOpen(false);
      setChannelName('');
    } catch (err) {
      console.error('Failed to add channel:', err);
      setError(err.response?.data?.error || 'Failed to add channel');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteChannel = async (channel) => {
    if (!window.confirm(`Are you sure you want to remove ${channel.displayName || channel.id}?`)) {
      return;
    }

    try {
      await axios.delete(`/api/channels/${channel.id}`, {
        withCredentials: true
      });
      setChannels(channels.filter(c => c.id !== channel.id));
    } catch (err) {
      console.error('Failed to delete channel:', err);
      setError('Failed to remove channel');
    }
  };

  if (authLoading || loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map(i => (
            <Grid item xs={12} md={6} lg={3} key={i}>
              <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

  const totalQueueItems = channels.reduce((sum, ch) => sum + (ch.queueStats?.size || 0), 0);
  const activeChannels = channels.filter(ch => ch.isActive).length;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Welcome back, {user?.displayName || user?.username}!
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your Twitch channel queues from one dashboard
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Stats Overview */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon={<LiveTv />}
              title="Total Channels"
              value={channels.length}
              color="primary"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon={<PlayArrow />}
              title="Active Channels"
              value={activeChannels}
              color="success"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon={<QueueMusic />}
              title="Queue Items"
              value={totalQueueItems}
              color="info"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon={<TrendingUp />}
              title="Total Views"
              value={0}
              color="warning"
            />
          </Grid>
        </Grid>

        {/* Channels Section */}
        <Box display="flex" alignItems="center" mb={3}>
          <Typography variant="h5" fontWeight={600}>
            Your Channels
          </Typography>
          <IconButton onClick={fetchChannels} sx={{ ml: 2 }}>
            <Refresh />
          </IconButton>
        </Box>

        {channels.length === 0 ? (
          <Paper
            sx={{
              p: 6,
              textAlign: 'center',
              background: alpha(theme.palette.primary.main, 0.05),
              border: `2px dashed ${alpha(theme.palette.primary.main, 0.3)}`
            }}
          >
            <LiveTv sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              No channels yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Add your first Twitch channel to get started
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setAddDialogOpen(true)}
            >
              Add Channel
            </Button>
          </Paper>
        ) : (
          <>
            <Grid container spacing={3}>
              {channels.map(channel => (
                <Grid item xs={12} md={6} lg={4} key={channel.id}>
                  <ChannelCard
                    channel={channel}
                    onDelete={handleDeleteChannel}
                    onRefresh={fetchChannels}
                  />
                </Grid>
              ))}
            </Grid>
          </>
        )}

        {/* Floating Action Button */}
        {channels.length > 0 && (
          <Fab
            color="primary"
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
            }}
            onClick={() => setAddDialogOpen(true)}
          >
            <Add />
          </Fab>
        )}

        {/* Add Channel Dialog */}
        <Dialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Add Twitch Channel</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Enter your Twitch channel name. The bot will automatically join your channel.
            </Typography>
            <TextField
              autoFocus
              fullWidth
              label="Channel Name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="your_channel_name"
              helperText="Without the # symbol"
              disabled={adding}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddDialogOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button
              onClick={handleAddChannel}
              variant="contained"
              disabled={!channelName.trim() || adding}
            >
              {adding ? 'Adding...' : 'Add Channel'}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
};

export default Dashboard;
