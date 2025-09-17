import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Switch,
  TextField,
  Slider,
  Alert,
  Tabs,
  Tab,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  Paper,
  IconButton,
  Tooltip,
  FormControlLabel,
  useTheme,
  alpha
} from '@mui/material';
import {
  Settings,
  QueueMusic,
  Timer,
  VideoLibrary,
  Save,
  RestartAlt,
  ArrowBack,
  ContentCopy,
  Check
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const TabPanel = ({ children, value, index, ...other }) => (
  <div
    role="tabpanel"
    hidden={value !== index}
    id={`channel-tabpanel-${index}`}
    aria-labelledby={`channel-tab-${index}`}
    {...other}
  >
    {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
  </div>
);

const SettingCard = ({ title, description, children, icon }) => {
  const theme = useTheme();
  
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" alignItems="flex-start" mb={2}>
          <Box
            sx={{
              mr: 2,
              p: 1,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: 'primary.main'
            }}
          >
            {icon}
          </Box>
          <Box flex={1}>
            <Typography variant="h6" gutterBottom>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {description}
            </Typography>
          </Box>
        </Box>
        {children}
      </CardContent>
    </Card>
  );
};

const ChannelManage = () => {
  const { channelName } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channel, setChannel] = useState(null);
  const [settings, setSettings] = useState({});
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchChannel = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/channels/by-name/${channelName}`, {
        withCredentials: true
      });
      setChannel(response.data.channel);
      setSettings(response.data.channel.settings || {});
    } catch (err) {
      console.error('Failed to fetch channel:', err);
      setError('Failed to load channel data');
    } finally {
      setLoading(false);
    }
  }, [channelName]);

  useEffect(() => {
    fetchChannel();
  }, [fetchChannel]);

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Save each setting
      for (const [key, value] of Object.entries(settings)) {
        await axios.put(`/api/channels/${channel.id}/settings/${key}`, {
          value
        }, {
          withCredentials: true
        });
      }

      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = () => {
    if (channel?.settings) {
      setSettings(channel.settings);
    }
  };

  const copyBotCommand = () => {
    const command = `!join ${channelName}`;
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!channel) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">Channel not found</Alert>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" mb={4}>
          <IconButton onClick={() => navigate('/dashboard')} sx={{ mr: 2 }}>
            <ArrowBack />
          </IconButton>
          <Box flex={1}>
            <Typography variant="h4" fontWeight={700}>
              Manage {channelName}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Configure your channel settings and manage your queue
            </Typography>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        {/* Info Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Queue URL
              </Typography>
              <Box display="flex" alignItems="center">
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    fontFamily: 'monospace',
                    bgcolor: 'background.paper',
                    p: 1,
                    borderRadius: 1,
                    mr: 1
                  }}
                >
                  {window.location.origin}/channel/{channelName}
                </Typography>
                <Tooltip title={copied ? "Copied!" : "Copy"}>
                  <IconButton onClick={copyBotCommand}>
                    {copied ? <Check /> : <ContentCopy />}
                  </IconButton>
                </Tooltip>
              </Box>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Bot Status
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Typography variant="body2">
                  The bot is {channel.isActive ? 'connected' : 'disconnected'}
                </Typography>
                <Chip
                  label={channel.isActive ? 'Active' : 'Inactive'}
                  color={channel.isActive ? 'success' : 'default'}
                  size="small"
                />
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 3 }}>
          <Tab label="General Settings" />
          <Tab label="Queue Settings" />
          <Tab label="Commands" />
        </Tabs>

        {/* General Settings Tab */}
        <TabPanel value={activeTab} index={0}>
          <SettingCard
            title="Queue Status"
            description="Enable or disable the queue for your channel"
            icon={<QueueMusic />}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={settings.queue_enabled || false}
                  onChange={(e) => handleSettingChange('queue_enabled', e.target.checked)}
                />
              }
              label={settings.queue_enabled ? 'Queue Enabled' : 'Queue Disabled'}
            />
          </SettingCard>

          <SettingCard
            title="Auto-Play Next"
            description="Automatically advance to the next video when one ends"
            icon={<VideoLibrary />}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={settings.auto_play_next || false}
                  onChange={(e) => handleSettingChange('auto_play_next', e.target.checked)}
                />
              }
              label={settings.auto_play_next ? 'Auto-Play Enabled' : 'Auto-Play Disabled'}
            />
          </SettingCard>

          <SettingCard
            title="Default Volume"
            description="Set the default volume for videos (0-100)"
            icon={<Settings />}
          >
            <Box sx={{ px: 2 }}>
              <Slider
                value={settings.current_volume || 75}
                onChange={(e, value) => handleSettingChange('current_volume', value)}
                min={0}
                max={100}
                marks={[
                  { value: 0, label: '0' },
                  { value: 50, label: '50' },
                  { value: 100, label: '100' }
                ]}
                valueLabelDisplay="auto"
              />
            </Box>
          </SettingCard>
        </TabPanel>

        {/* Queue Settings Tab */}
        <TabPanel value={activeTab} index={1}>
          <SettingCard
            title="Maximum Queue Size"
            description="Maximum number of videos allowed in the queue"
            icon={<QueueMusic />}
          >
            <TextField
              type="number"
              value={settings.max_queue_size || 50}
              onChange={(e) => handleSettingChange('max_queue_size', parseInt(e.target.value))}
              inputProps={{ min: 1, max: 200 }}
              fullWidth
            />
          </SettingCard>

          <SettingCard
            title="Submission Cooldown"
            description="Time in seconds between video submissions per user"
            icon={<Timer />}
          >
            <TextField
              type="number"
              value={settings.submission_cooldown || 30}
              onChange={(e) => handleSettingChange('submission_cooldown', parseInt(e.target.value))}
              inputProps={{ min: 0, max: 600 }}
              helperText="Set to 0 to disable cooldown"
              fullWidth
            />
          </SettingCard>

          <SettingCard
            title="Maximum Video Duration"
            description="Maximum allowed video length in seconds"
            icon={<VideoLibrary />}
          >
            <TextField
              type="number"
              value={settings.max_video_duration || 600}
              onChange={(e) => handleSettingChange('max_video_duration', parseInt(e.target.value))}
              inputProps={{ min: 60, max: 3600 }}
              helperText="Value in seconds (600 = 10 minutes)"
              fullWidth
            />
          </SettingCard>
        </TabPanel>

        {/* Commands Tab */}
        <TabPanel value={activeTab} index={2}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Available Bot Commands
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                These commands can be used in your Twitch chat
              </Typography>
              
              <List>
                <ListItem>
                  <ListItemText
                    primary="!queue on/off"
                    secondary="Enable or disable the queue (Broadcaster/Mods only)"
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary="!skip"
                    secondary="Skip the current video (Broadcaster/Mods only)"
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary="!clear"
                    secondary="Clear the entire queue (Broadcaster/Mods only)"
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary="!remove <id>"
                    secondary="Remove a specific video from the queue (Broadcaster/Mods only)"
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary="!help"
                    secondary="Show available commands (Everyone)"
                  />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemText
                    primary="YouTube URL"
                    secondary="Submit a YouTube video by posting the URL in chat (Everyone, when queue is enabled)"
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </TabPanel>

        {/* Action Buttons */}
        <Box display="flex" justifyContent="flex-end" gap={2} mt={4}>
          <Button
            variant="outlined"
            startIcon={<RestartAlt />}
            onClick={resetSettings}
            disabled={saving}
          >
            Reset Changes
          </Button>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default ChannelManage;
