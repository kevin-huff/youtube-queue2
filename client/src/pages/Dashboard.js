import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Alert,
  Skeleton,
  Chip,
  Avatar,
  useTheme,
  alpha,
  Paper,
  Switch,
  FormControlLabel,
  TextField,
  Slider,
  Divider,
  Snackbar,
  CircularProgress,
  Tabs,
  Tab,
  Stack,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Collapse
} from '@mui/material';
import {
  Settings,
  LiveTv,
  QueueMusic,
  TrendingUp,
  ContentCopy,
  PlayArrow,
  Timer,
  VideoLibrary,
  CheckCircle,
  Person,
  Delete,
  ThumbUp,
  WarningAmber,
  OpenInNew as OpenInNewIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { MenuItem } from '@mui/material';
import { useSocket } from '../contexts/SocketContext';
import ChannelQueue from './ChannelQueue';
import CupAdmin from './CupAdmin';

const DEFAULT_CHANNEL_SETTINGS = {
  queue_enabled: 'false',
  auto_play_next: 'false',
  current_volume: '75',
  max_queue_size: '0',
  submission_cooldown: '30',
  max_video_duration: '300',
  max_per_user: '3'
};

const normalizeSettings = (raw = {}) => {
  const normalized = { ...DEFAULT_CHANNEL_SETTINGS };
  Object.entries(raw || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    normalized[key] = typeof value === 'string' ? value : value.toString();
  });
  normalized.auto_play_next = 'false';
  return normalized;
};

const formatTimestamp = (value) => {
  if (!value) {
    return 'Just now';
  }
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

const formatSubmitterLabel = (item) => {
  const alias = getSubmitterAlias(item);
  const username = getSubmitterUsername(item);
  if (username && username !== alias) {
    return `${alias} (real: ${username})`;
  }
  return alias;
};

const StatCard = ({ icon, title, value, color = 'primary' }) => {
  const theme = useTheme();
  
  // Map color names to valid palette colors
  const colorMap = {
    'default': 'grey',
    'primary': 'primary',
    'secondary': 'secondary',
    'info': 'info',
    'success': 'success',
    'warning': 'warning',
    'error': 'error'
  };
  
  const validColor = colorMap[color] || 'primary';
  const paletteColor = validColor === 'grey' ? theme.palette.grey[500] : theme.palette[validColor].main;
  
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
              bgcolor: alpha(paletteColor, 0.1),
              color: paletteColor,
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

const Dashboard = () => {
  const theme = useTheme();
  const { user, loading: authLoading, hasChannelRole, findChannelAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { clearQueue, connectToChannel, disconnectFromChannel, addChannelListener, removeChannelListener } = useSocket();
  const [channel, setChannel] = useState(null);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState({ ...DEFAULT_CHANNEL_SETTINGS });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [clearingQueue, setClearingQueue] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [moderationItems, setModerationItems] = useState([]);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationError, setModerationError] = useState(null);
  const [moderationActionId, setModerationActionId] = useState(null);
  const [showAutoOnly, setShowAutoOnly] = useState(false);
  const [playedInCupCount, setPlayedInCupCount] = useState(0);
  // Summary stats for header and overview
  const [statusCounts, setStatusCounts] = useState({});
  const [warningsTotal, setWarningsTotal] = useState(0);
  const [autoApprovedTotal, setAutoApprovedTotal] = useState(0);
  const [topModerator, setTopModerator] = useState({ name: null, count: 0 });
  // Deprecated: per-night count replaced by per-cup count
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [warningNote, setWarningNote] = useState('');
  const [warningTarget, setWarningTarget] = useState(null);
  const [producerAccessDenied, setProducerAccessDenied] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [soundboardItems, setSoundboardItems] = useState([]);
  const [sbUploading, setSbUploading] = useState(false);
  const [sbError, setSbError] = useState(null);
  const [sbName, setSbName] = useState('');
  const [sbBusyId, setSbBusyId] = useState(null);
  const [sbToast, setSbToast] = useState(null);
  const SERVER_BASE = process.env.REACT_APP_SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const [sbExpanded, setSbExpanded] = useState(false);
  const WARNING_NOTE_LIMIT = 280;
  const saveTimeoutRef = useRef(null);
  const settingsSectionRef = useRef(null);
  // Track selected channel id across renders to avoid refetch loops
  const selectedChannelIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const sbFileInputRef = useRef(null);
  const currentChannelId = channel?.id || null;

  const channelAccess = useMemo(
    () => findChannelAccess(currentChannelId || undefined),
    [currentChannelId, findChannelAccess]
  );

  const canModerate = useMemo(
    () => hasChannelRole(currentChannelId || undefined, ['OWNER', 'MANAGER', 'PRODUCER', 'MODERATOR']),
    [currentChannelId, hasChannelRole]
  );

  const canProduce = useMemo(
    () => hasChannelRole(currentChannelId || undefined, ['OWNER', 'MANAGER', 'PRODUCER']),
    [currentChannelId, hasChannelRole]
  );

  const canManageSettings = useMemo(
    () => hasChannelRole(currentChannelId || undefined, ['OWNER', 'MANAGER']),
    [currentChannelId, hasChannelRole]
  );

  const roleLabels = useMemo(() => {
    if (!channelAccess) {
      return [];
    }
    const combined = new Set(channelAccess.roles || []);
    if (channelAccess.ownershipRole) {
      combined.add(channelAccess.ownershipRole);
    }
    return Array.from(combined);
  }, [channelAccess]);

  const availableTabs = useMemo(() => {
    const tabs = [{ value: 'overview', label: 'Overview' }];
    if (canProduce && Array.isArray(channels) && channels.length > 0) {
      tabs.push({ value: 'producer', label: 'Producer' });
      tabs.push({ value: 'cups', label: 'Manage Cups' });
    }
    if (canModerate) tabs.push({ value: 'moderation', label: 'Moderation' });
    return tabs;
  }, [canProduce, canModerate, channels]);

  // Auto-save with debounce
  const autoSaveSettings = useCallback(async (settingsToSave) => {
    if (!channel) return;

    try {
      setSaving(true);

      // Save each setting
      for (const [key, value] of Object.entries(settingsToSave)) {
        await axios.put(`/api/channels/${channel.id}/settings/${key}`, {
          value
        }, {
          withCredentials: true
        });
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [channel]);

  const fetchChannelSettings = useCallback(async (channelId) => {
    if (!channelId) {
      return;
    }

    try {
      const response = await axios.get(`/api/channels/${channelId}/settings`, {
        withCredentials: true
      });

      const fetchedSettings = normalizeSettings(response.data.settings || {});

      if (fetchedSettings.auto_play_next !== 'false') {
        try {
          await axios.put(
            `/api/channels/${channelId}/settings/auto_play_next`,
            { value: false },
            { withCredentials: true }
          );
        } catch (autoErr) {
          console.warn('Failed to disable auto play next:', autoErr);
        }
        fetchedSettings.auto_play_next = 'false';
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      setSettings(fetchedSettings);
    } catch (err) {
      console.error('Failed to fetch channel settings:', err);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      setSettings({ ...DEFAULT_CHANNEL_SETTINGS });
    }
  }, []);

  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/channels', {
        withCredentials: true
      });
      const fetched = response.data.channels || [];
      setChannels(fetched);

      // Keep current selection if still valid, else default to first
      const currentSelectedId = selectedChannelIdRef.current;
      let next = null;
      if (currentSelectedId) {
        next = fetched.find((c) => c.id === currentSelectedId) || null;
      }
      if (!next) {
        next = fetched[0] || null;
      }

      if (next) {
        // Only update state if the selected id actually changes
        if (next.id !== currentSelectedId) {
          selectedChannelIdRef.current = next.id;
          setChannel(next);
        }
        await fetchChannelSettings(next.id);
      } else {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        setSettings({ ...DEFAULT_CHANNEL_SETTINGS });
      }
    } catch (err) {
      console.error('Failed to fetch channel:', err);
      if (err.response?.status === 401) {
        setError('You need to log in with Twitch to access your dashboard');
      } else {
        setError('Failed to load channel');
      }
    } finally {
      setLoading(false);
    }
  }, [fetchChannelSettings]);

  const handleChannelSwitch = useCallback(async (nextId) => {
    try {
      const next = channels.find((c) => c.id === nextId) || null;
      setChannel(next);
      if (next) {
        await fetchChannelSettings(next.id);
      } else {
        setSettings({ ...DEFAULT_CHANNEL_SETTINGS });
      }
    } catch (err) {
      console.error('Failed to switch channel:', err);
    }
  }, [channels, fetchChannelSettings]);

  const handleSettingChange = useCallback((key, value) => {
    const normalizedValue = value === undefined || value === null ? '' : value.toString();

    setSettings((prev) => ({
      ...prev,
      [key]: normalizedValue
    }));

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      autoSaveSettings({ [key]: normalizedValue });
    }, 800);
  }, [autoSaveSettings]);

  const updateNumericSetting = useCallback((key, value, { min, max } = {}) => {
    let numeric = typeof value === 'number' ? value : parseInt(value, 10);
    if (Number.isNaN(numeric)) {
      numeric = min !== undefined ? min : 0;
    }
    if (min !== undefined) {
      numeric = Math.max(min, numeric);
    }
    if (max !== undefined) {
      numeric = Math.min(max, numeric);
    }
    handleSettingChange(key, numeric);
  }, [handleSettingChange]);

  const handleClearQueue = useCallback(async () => {
    if (!window.confirm('Are you sure you want to clear the entire queue? This cannot be undone.')) {
      return;
    }

    try {
      setClearingQueue(true);
      await clearQueue();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to clear queue:', err);
      setError('Failed to clear queue');
      setTimeout(() => setError(null), 3000);
    } finally {
      setClearingQueue(false);
    }
  }, [clearQueue]);

  const shuffleAudioUrl = settings.shuffle_audio_url || '';

  const triggerShuffleAudioDialog = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  const handleShuffleAudioSelected = useCallback(async (event) => {
    if (!channel?.id) return;
    const file = event?.target?.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadingAudio(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await axios.post(`/api/channels/${channel.id}/uploads/shuffle-audio`, form, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const url = res?.data?.url;
      if (typeof url === 'string') {
        handleSettingChange('shuffle_audio_url', url);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to upload shuffle audio:', err);
      const message = err?.response?.data?.error || err?.message || 'Upload failed';
      setUploadError(message);
    } finally {
      setUploadingAudio(false);
    }
  }, [channel?.id, handleSettingChange]);

  const handleResetShuffleAudio = useCallback(() => {
    handleSettingChange('shuffle_audio_url', '');
  }, [handleSettingChange]);

  // Soundboard helpers
  const refreshSoundboard = useCallback(async () => {
    if (!channel?.id) return;
    try {
      const res = await axios.get(`/api/channels/${channel.id}/soundboard`, { withCredentials: true });
      setSoundboardItems(Array.isArray(res.data.items) ? res.data.items : []);
    } catch (err) {
      console.warn('Failed to load soundboard:', err);
      setSoundboardItems([]);
    }
  }, [channel?.id]);

  useEffect(() => {
    refreshSoundboard();
  }, [refreshSoundboard]);

  const triggerSbFilePicker = useCallback(() => {
    if (sbFileInputRef.current) {
      sbFileInputRef.current.value = '';
      sbFileInputRef.current.click();
    }
  }, []);

  const handleSbFileSelected = useCallback(async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !channel?.id) return;
    setSbError(null);
    setSbUploading(true);
    try {
      const form = new FormData();
      if (sbName && sbName.trim()) form.append('name', sbName.trim());
      form.append('file', file);
      const res = await axios.post(`/api/channels/${channel.id}/soundboard/upload`, form, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const item = res?.data?.item;
      if (item) setSoundboardItems((prev) => [item, ...prev]);
      setSbName('');
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || 'Upload failed';
      setSbError(message);
    } finally {
      setSbUploading(false);
    }
  }, [channel?.id, sbName]);

  const handlePlaySound = useCallback(async (itemId) => {
    if (!channel?.id || !itemId) return;
    try {
      setSbBusyId(itemId);
      // eslint-disable-next-line no-console
      console.info('[soundboard] sending play', { channelId: channel.id, itemId });
      const res = await axios.post(`/api/channels/${channel.id}/soundboard/play`, { itemId }, { withCredentials: true });
      const name = soundboardItems.find((it) => it.id === itemId)?.name || 'Sound';
      if (res?.data?.ok) {
        setSbToast(`Sent “${name}” to all clients`);
        // eslint-disable-next-line no-console
        console.info('[soundboard] play acknowledged', res.data);
      } else {
        setSbToast(`Triggered “${name}”`);
        // eslint-disable-next-line no-console
        console.info('[soundboard] play response (no ok flag)', res.data);
      }
      // Optional: local preview (comment out if undesired)
      try {
        let url = soundboardItems.find((it) => it.id === itemId)?.url;
        if (url) {
          const base = (SERVER_BASE || '').replace(/\/$/, '');
          if (url.startsWith('/')) {
            url = `${base}${url}`;
          }
          const a = new Audio(url);
          a.volume = 1;
          a.play().catch(() => {});
        }
      } catch(_) {}
    } catch (err) {
      console.warn('Failed to play soundboard item:', err);
      setSbToast('Failed to send sound');
    } finally {
      setSbBusyId(null);
    }
  }, [channel?.id, soundboardItems]);

  const resolveItemUrl = useCallback((item) => {
    const base = (SERVER_BASE || '').replace(/\/$/, '');
    const rel = item?.url || item?.absoluteUrl || '';
    if (!rel) return '';
    return rel.startsWith('/') ? `${base}${rel}` : rel;
  }, [SERVER_BASE]);

  // Build a review URL for a submission's underlying video
  const getModerationItemUrl = useCallback((item) => {
    if (!item) return '';
    const raw = (item.videoUrl || '').toString();
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) {
      const base = (SERVER_BASE || '').replace(/\/$/, '');
      return `${base}${raw}`;
    }
    if ((!raw || raw.length === 0) && item.videoId) {
      // Fallback for YouTube IDs when URL is absent
      return `https://www.youtube.com/watch?v=${item.videoId}`;
    }
    return raw;
  }, [SERVER_BASE]);

  const handleCopyUrl = useCallback(async (item) => {
    try {
      const url = resolveItemUrl(item);
      if (!url) return;
      await navigator.clipboard.writeText(url);
      setSbToast('Copied URL');
    } catch (err) {
      console.warn('Copy failed', err);
      setSbToast('Copy failed');
    }
  }, [resolveItemUrl]);

  const handleDeleteSound = useCallback(async (itemId) => {
    if (!channel?.id || !itemId) return;
    try {
      await axios.delete(`/api/channels/${channel.id}/soundboard/${itemId}`, { withCredentials: true });
      setSoundboardItems((prev) => prev.filter((it) => it.id !== itemId));
    } catch (err) {
      console.warn('Failed to delete soundboard item:', err);
    }
  }, [channel?.id]);

  const loadPendingSubmissions = useCallback(async () => {
    if (!currentChannelId || !canModerate) {
      setModerationItems([]);
      return;
    }

    try {
      setModerationLoading(true);
      setModerationError(null);
      // Exclude terminal/played items and ignore inactive cups
      const response = await axios.get(`/api/channels/${currentChannelId}/submissions`, {
        params: { status: 'PENDING,APPROVED,TOP_EIGHT,PLAYING', limit: 'ALL', activeCupsOnly: true },
        withCredentials: true
      });
      const submissions = Array.isArray(response?.data?.submissions)
        ? response.data.submissions
        : [];
      setModerationItems(submissions);
    } catch (err) {
      console.error('Failed to load moderation submissions:', err);
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load submissions';
      setModerationError(message);
    } finally {
      setModerationLoading(false);
    }
  }, [currentChannelId, canModerate]);

  const handleModerationAction = useCallback(async (itemId, action, extra = {}) => {
    if (!currentChannelId || !canModerate) {
      return;
    }

    const normalizedAction = action?.toString().toUpperCase();
    if (!normalizedAction) {
      return;
    }

    let success = false;

    try {
      setModerationActionId(itemId);
      setModerationError(null);
      const payload = { action: normalizedAction };

      if (extra.note !== undefined) {
        const rawNote =
          extra.note === null || extra.note === undefined
            ? null
            : extra.note.toString();
        payload.note = rawNote;
      }

      if (extra.position !== undefined) {
        payload.position = extra.position;
      }

      if (extra.reason !== undefined) {
        payload.reason = extra.reason;
      }

      await axios.post(
        `/api/channels/${currentChannelId}/submissions/${itemId}/review`,
        payload,
        { withCredentials: true }
      );
      await loadPendingSubmissions();
      success = true;
    } catch (err) {
      console.error('Failed to update submission:', err);
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update submission';
      setModerationError(message);
      success = false;
    } finally {
      setModerationActionId(null);
    }
    return success;
  }, [currentChannelId, canModerate, loadPendingSubmissions]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  const openWarningDialog = useCallback((item) => {
    if (!item) {
      return;
    }
    setWarningTarget(item);
    setWarningNote((item.moderationNote || '').slice(0, WARNING_NOTE_LIMIT));
    setWarningDialogOpen(true);
  }, [WARNING_NOTE_LIMIT]);

  const closeWarningDialog = useCallback(() => {
    setWarningDialogOpen(false);
    setWarningTarget(null);
    setWarningNote('');
  }, []);

  const submitWarning = useCallback(async () => {
    if (!warningTarget) {
      return;
    }
    const trimmedNote = warningNote.trim();
    if (!trimmedNote) {
      return;
    }
    const success = await handleModerationAction(warningTarget.id, 'WARN', {
      note: trimmedNote
    });
    if (success) {
      closeWarningDialog();
    }
  }, [handleModerationAction, warningNote, warningTarget, closeWarningDialog]);

  useEffect(() => {
    if (user) {
      fetchChannels();
    }
  }, [user]);

  // (moved) Refresh status summary when channel changes defined later

  // Keep a ref of the currently selected channel id to avoid setState loops
  useEffect(() => {
    selectedChannelIdRef.current = channel?.id || null;
  }, [channel?.id]);

  useEffect(() => {
    if (authLoading || loading) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const requestedTab = params.get('tab');

    if (requestedTab === 'moderation') {
      if (!canModerate) {
        if (activeTab !== 'overview') {
          setActiveTab('overview');
        }
        params.delete('tab');
        const nextSearch = params.toString();
        navigate(
          {
            pathname: location.pathname,
            search: nextSearch ? `?${nextSearch}` : ''
          },
          { replace: true }
        );
        return;
      }

      if (activeTab !== 'moderation') {
        setActiveTab('moderation');
      }
      return;
    }

    if (requestedTab === 'producer') {
      if (!canProduce) {
        if (activeTab !== 'overview') {
          setActiveTab('overview');
        }
        setProducerAccessDenied(true);
        params.delete('tab');
        const nextSearch = params.toString();
        navigate(
          {
            pathname: location.pathname,
            search: nextSearch ? `?${nextSearch}` : ''
          },
          { replace: true }
        );
        return;
      }

      if (activeTab !== 'producer') {
        setActiveTab('producer');
      }
      return;
    }

    if (requestedTab === 'cups') {
      if (!canProduce) {
        if (activeTab !== 'overview') {
          setActiveTab('overview');
        }
        params.delete('tab');
        const nextSearch = params.toString();
        navigate(
          {
            pathname: location.pathname,
            search: nextSearch ? `?${nextSearch}` : ''
          },
          { replace: true }
        );
        return;
      }
      if (activeTab !== 'cups') {
        setActiveTab('cups');
      }
      return;
    }

    if (activeTab !== 'overview') {
      setActiveTab('overview');
    }
  }, [location.pathname, location.search, canModerate, canProduce, navigate, activeTab, authLoading, loading]);

  // Connect to channel socket when channel is loaded
  useEffect(() => {
    if (channel?.id) {
      connectToChannel(channel.id, { explicit: true });
      return () => {
        disconnectFromChannel();
      };
    }
  }, [channel?.id, connectToChannel, disconnectFromChannel]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'moderation' && canModerate) {
      loadPendingSubmissions();
    }
  }, [activeTab, canModerate, loadPendingSubmissions]);

  // Live‑update moderation items while on the Moderation tab
  useEffect(() => {
    if (activeTab !== 'moderation') return undefined;

    const TERMINAL = new Set(['SCORED', 'PLAYED', 'SKIPPED', 'REMOVED', 'REJECTED', 'ELIMINATED']);

    const sortItems = (arr) => {
      return [...arr].sort((a, b) => {
        const at = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (at !== bt) return at - bt;
        return (a.id || 0) - (b.id || 0);
      });
    };

    const handleItemUpdated = (payload = {}) => {
      const item = payload?.item || payload;
      if (!item || !item.id) return;
      // Drop items that moved to terminal states
      if (item.status && TERMINAL.has(String(item.status).toUpperCase())) {
        setModerationItems((prev) => prev.filter((it) => it.id !== item.id));
        return;
      }
      setModerationItems((prev) => {
        const idx = prev.findIndex((it) => it.id === item.id);
        if (idx === -1) {
          return sortItems([...prev, item]);
        }
        const next = [...prev];
        next[idx] = { ...next[idx], ...item };
        return sortItems(next);
      });
    };

    const handleItemAdded = (item = {}) => {
      if (!item || !item.id) return;
      // Ignore items from inactive cups if info present
      const cupStatus = item?.cup?.status ? String(item.cup.status).toUpperCase() : null;
      if (cupStatus && cupStatus !== 'LIVE') return;
      setModerationItems((prev) => {
        if (prev.some((it) => it.id === item.id)) return prev;
        return sortItems([...prev, item]);
      });
    };

    const handleItemRemoved = (payload = {}) => {
      const id = payload?.id ?? payload?.itemId;
      if (!id) return;
      setModerationItems((prev) => prev.filter((it) => it.id !== id));
    };

    const handleItemStatus = ({ id, status }) => {
      if (!id) return;
      const s = String(status || '').toUpperCase();
      if (!s) return;
      if (['SCORED', 'PLAYED', 'SKIPPED', 'REMOVED', 'REJECTED', 'ELIMINATED'].includes(s)) {
        setModerationItems((prev) => prev.filter((it) => it.id !== id));
      }
    };

    addChannelListener('queue:item_updated', handleItemUpdated);
    addChannelListener('queue:video_added', handleItemAdded);
    addChannelListener('queue:video_removed', handleItemRemoved);
    addChannelListener('queue:item_status', handleItemStatus);
    const handleItemScored = ({ queueItemId }) => handleItemRemoved({ id: queueItemId });
    addChannelListener('queue:item_scored', handleItemScored);

    return () => {
      removeChannelListener('queue:item_updated', handleItemUpdated);
      removeChannelListener('queue:video_added', handleItemAdded);
      removeChannelListener('queue:video_removed', handleItemRemoved);
      removeChannelListener('queue:item_status', handleItemStatus);
      removeChannelListener('queue:item_scored', handleItemScored);
    };
  }, [activeTab, addChannelListener, removeChannelListener]);

  useEffect(() => {
    setModerationItems([]);
    setModerationError(null);
    closeWarningDialog();
  }, [currentChannelId, closeWarningDialog]);

  useEffect(() => {
    if (activeTab !== 'moderation') {
      setModerationActionId(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (warningDialogOpen && activeTab !== 'moderation') {
      closeWarningDialog();
    }
  }, [activeTab, warningDialogOpen, closeWarningDialog]);

  // Ensure active tab is valid if tabs change (e.g., no channels → hide Producer)
  useEffect(() => {
    const exists = availableTabs.some((t) => t.value === activeTab);
    if (!exists) {
      setActiveTab('overview');
      const params = new URLSearchParams(location.search);
      params.delete('tab');
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : ''
        },
        { replace: true }
      );
    }
  }, [availableTabs, activeTab, navigate, location.pathname, location.search]);

  const handleTabChange = useCallback((event, newValue) => {
    if (newValue === activeTab) {
      return;
    }
    if (newValue === 'moderation' && !canModerate) {
      return;
    }
    if (newValue === 'producer' && !canProduce) {
      return;
    }
    if (newValue === 'cups' && !canProduce) {
      return;
    }

    setActiveTab(newValue);
    const params = new URLSearchParams(location.search);
    if (newValue === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', newValue);
    }
    const nextSearch = params.toString();

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : ''
      },
      { replace: true }
    );
  }, [activeTab, canModerate, canProduce, navigate, location.pathname, location.search]);

  const warningCount = useMemo(
    () => moderationItems.filter((item) => item.moderationStatus === 'WARNING').length,
    [moderationItems]
  );
  const moderationCountDisplay = moderationLoading ? '…' : warningCount;
  const warningActionInFlight = Boolean(warningTarget && moderationActionId === warningTarget.id);
  const warningNoteLength = warningNote.length;
  const filteredModerationItems = useMemo(
    () => (showAutoOnly
      ? moderationItems.filter((item) => item.moderationStatus !== 'WARNING' && !item.moderatedBy)
      : moderationItems
    ),
    [moderationItems, showAutoOnly]
  );

  const fetchStatusSummary = useCallback(async () => {
    if (!currentChannelId) return;
    try {
      setSummaryLoading(true);
      const response = await axios.get(`/api/channels/${currentChannelId}/submissions`, {
        params: { status: 'ALL', limit: 'ALL', activeCupsOnly: true },
        withCredentials: true
      });
      const list = Array.isArray(response?.data?.submissions) ? response.data.submissions : [];

      const counts = {};
      let warnings = 0;
      let autoApproved = 0;
      const modCounts = new Map();

      for (const it of list) {
        const s = String(it.status || 'UNKNOWN').toUpperCase();
        counts[s] = (counts[s] || 0) + 1;
        if (it.moderationStatus === 'WARNING') warnings += 1;
        if (it.moderationStatus !== 'WARNING' && !it.moderatedBy) autoApproved += 1;
        if (it.moderatedBy) {
          const key = it.moderatedByDisplayName || it.moderatedBy;
          modCounts.set(key, (modCounts.get(key) || 0) + 1);
        }
        // No-op: per-cup played count handled separately
      }

      let top = { name: null, count: 0 };
      for (const [name, count] of modCounts.entries()) {
        if (count > top.count) top = { name, count };
      }

      setStatusCounts(counts);
      setWarningsTotal(warnings);
      setAutoApprovedTotal(autoApproved);
      setTopModerator(top);
    } catch (err) {
      console.warn('Failed to fetch summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, [currentChannelId]);

  const fetchPlayedInActiveCup = useCallback(async () => {
    if (!currentChannelId) return;
    try {
      const cupsRes = await axios.get(`/api/channels/${currentChannelId}/cups`, { withCredentials: true });
      const cups = Array.isArray(cupsRes?.data?.cups) ? cupsRes.data.cups : [];
      const activeCup = cups.find((c) => c.isActive) || cups[0];
      if (!activeCup?.id) {
        setPlayedInCupCount(0);
        return;
      }
      const vidsRes = await axios.get(`/api/channels/${currentChannelId}/cups/${activeCup.id}/videos`, { withCredentials: true });
      const videos = Array.isArray(vidsRes?.data?.videos) ? vidsRes.data.videos : [];
      const count = videos.filter((v) => {
        const s = String(v.status || '').toUpperCase();
        return s === 'PLAYED' || s === 'SCORED';
      }).length;
      setPlayedInCupCount(count);
    } catch (err) {
      console.warn('Failed to compute played-in-cup count:', err);
      setPlayedInCupCount(0);
    }
  }, [currentChannelId]);

  // Refresh status summary when channel changes (placed after function declarations to avoid TDZ)
  useEffect(() => {
    if (!currentChannelId) return;
    fetchStatusSummary();
    fetchPlayedInActiveCup();
  }, [currentChannelId, fetchStatusSummary, fetchPlayedInActiveCup]);

  if (authLoading || loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2, mb: 3 }} />
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map(i => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  const queueSize = channel?.queueStats?.size || 0;
  const queueEnabled = channel?.queueStats?.enabled || false;
  const currentlyPlaying = channel?.queueStats?.currentlyPlaying || false;

  const queueEnabledSetting = settings.queue_enabled === 'true';
  const defaultVolume = Number(settings.current_volume ?? '75');
  const maxQueueSizeSetting = settings.max_queue_size ?? '50';
  const submissionCooldownSetting = settings.submission_cooldown ?? '30';
  const maxVideoDurationSetting = settings.max_video_duration ?? '600';
  const maxVideoDurationMinutes = Math.max(0, Math.round(Number(maxVideoDurationSetting || '0') / 60));
  const maxPerUserSetting = settings.max_per_user ?? '3';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Welcome back, {user?.displayName || user?.username}!
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your YouTube queue and gameshow cups
          </Typography>

          {Array.isArray(channels) && channels.length > 0 && (
            <Box mt={2}>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="body2" color="text.secondary">Channel:</Typography>
                <TextField
                  select
                  size="small"
                  value={currentChannelId || ''}
                  onChange={(e) => handleChannelSwitch(e.target.value)}
                  sx={{ minWidth: 220 }}
                >
                  {channels.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.displayName || c.id}</MenuItem>
                  ))}
                </TextField>
                {roleLabels.length > 0 && (
                  <Box display="flex" alignItems="center" gap={1}>
                    {roleLabels.map((r) => (
                      <Chip key={r} size="small" label={r} />
                    ))}
                  </Box>
                )}
              </Box>

              {/* Status counts under channel access */}
              <Box mt={1.5} display="flex" alignItems="center" gap={1} flexWrap="wrap">
                {summaryLoading && (
                  <Skeleton variant="rectangular" width={240} height={28} sx={{ borderRadius: 1 }} />
                )}
                {!summaryLoading && (
                  <>
                    {Object.entries(statusCounts).filter(([, v]) => v > 0).map(([k, v]) => {
                      const s = String(k).toUpperCase();
                      const label = `${s.replace('_', ' ')}: ${v}`;
                      let color = 'default';
                      if (s === 'PENDING') color = 'warning';
                      else if (s === 'APPROVED' || s === 'PLAYED' || s === 'SCORED') color = 'success';
                      else if (s === 'PLAYING') color = 'info';
                      else if (s === 'TOP_EIGHT') color = 'secondary';
                      else if (s === 'REJECTED' || s === 'REMOVED' || s === 'ELIMINATED' || s === 'SKIPPED') color = 'error';
                      return (
                        <Chip key={s} size="small" color={color} variant={s === 'PENDING' ? 'filled' : 'outlined'} label={label} />
                      );
                    })}
                    {warningsTotal > 0 && (
                      <Chip size="small" color="warning" label={`WARNING: ${warningsTotal}`} />
                    )}
                    {autoApprovedTotal > 0 && (
                      <Chip size="small" color="success" variant="outlined" label={`Auto‑approved: ${autoApprovedTotal}`} />
                    )}
                    <Chip size="small" variant="outlined" label={`Top Mod: ${topModerator.name || '—'}${topModerator.count ? ` (${topModerator.count})` : ''}`} />
                  </>
                )}
              </Box>
            </Box>
          )}
        </Box>

        {availableTabs.length > 1 && (
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            sx={{ mb: 4 }}
            aria-label="Dashboard sections"
          >
            {availableTabs.map((tab) => (
              <Tab key={tab.value} value={tab.value} label={tab.label} />
            ))}
          </Tabs>
        )}

        {activeTab === 'overview' && (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <Snackbar
              open={producerAccessDenied}
              autoHideDuration={3000}
              onClose={() => setProducerAccessDenied(false)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            >
              <Alert onClose={() => setProducerAccessDenied(false)} severity="warning" sx={{ width: '100%' }}>
                Access required: Producer tab is limited to Owner, Manager, or Producer.
              </Alert>
            </Snackbar>

            <Snackbar
              open={Boolean(sbToast)}
              autoHideDuration={2000}
              onClose={() => setSbToast(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            >
              <Alert onClose={() => setSbToast(null)} severity="info" sx={{ width: '100%' }}>
                {sbToast}
              </Alert>
            </Snackbar>

            {!channel && !loading && (
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
                  {error ? 'Not Logged In' : 'Channel Not Found'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  {error 
                    ? 'Please log in with your Twitch account to access the dashboard' 
                    : 'Your Twitch channel has not been set up yet. Contact the administrator.'}
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => window.location.href = '/api/auth/twitch'}
                >
                  Login with Twitch
                </Button>
              </Paper>
            )}

            {channel && (
              <>
            {/* Played in active cup */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="text.secondary" variant="body2" gutterBottom>
                      Videos Played This Cup
                    </Typography>
                    <Typography variant="h4" fontWeight={700}>
                      {playedInCupCount}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            {/* Channel Header Card */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <LiveTv sx={{ fontSize: 48, color: 'primary.main' }} />
                    <Box>
                      <Typography variant="h5" fontWeight={600}>
                        {channel.displayName}
                      </Typography>
                      <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                        <Chip 
                          label={channel.isActive ? "Active" : "Inactive"}
                          color={channel.isActive ? "success" : "default"}
                          size="small"
                        />
                        {queueEnabled && (
                          <Chip 
                            label="Queue Open"
                            color="info"
                            size="small"
                          />
                        )}
                        {currentlyPlaying && (
                          <Chip 
                            label="Now Playing"
                            color="error"
                            size="small"
                            icon={<PlayArrow />}
                          />
                        )}
                      </Box>
                    </Box>
                  </Box>
                <Box display="flex" gap={1}>
                  <Button
                    variant="contained"
                    startIcon={<QueueMusic />}
                    onClick={() => navigate(`/channel/${channel.id}`)}
                    endIcon={<OpenInNewIcon />}
                  >
                    Producer Console
                  </Button>
                  {canManageSettings && (
                    <Button
                      variant="outlined"
                      startIcon={<Settings />}
                      onClick={() => settingsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    >
                      Queue Settings
                    </Button>
                  )}
                </Box>
                </Box>
              </CardContent>
            </Card>

            {/* Queue Settings (compact) */}
            {canManageSettings && (
              <>
                <Typography variant="h6" sx={{ fontWeight: 700 }} gutterBottom ref={settingsSectionRef}>
                  Queue Settings
                </Typography>
                {(() => {
                  const rows = [
                    {
                      label: 'Queue Control',
                      desc: 'Enable or disable queue submissions from chat',
                      control: (
                        <FormControlLabel
                          control={
                            <Switch
                              checked={queueEnabledSetting}
                              onChange={(e) => handleSettingChange('queue_enabled', e.target.checked)}
                            />
                          }
                          label={queueEnabledSetting ? 'Queue Enabled' : 'Queue Disabled'}
                        />
                      )
                    },
                    {
                      label: 'Default Volume',
                      desc: 'Initial volume for synced playback clients',
                      control: (
                        <Box sx={{ px: 1, minWidth: 220 }}>
                          <Slider
                            value={defaultVolume}
                            onChange={(e, value) => handleSettingChange('current_volume', value)}
                            min={0}
                            max={100}
                            step={1}
                            valueLabelDisplay="auto"
                          />
                        </Box>
                      )
                    },
                    {
                      label: 'Queue Size Limit',
                      desc: 'Maximum videos allowed in the queue at once',
                      control: (
                        <TextField
                          size="small"
                          type="number"
                          value={maxQueueSizeSetting}
                          onChange={(e) => updateNumericSetting('max_queue_size', e.target.value, { min: 0, max: 500 })}
                          inputProps={{ min: 0, max: 500 }}
                          helperText="Use 0 for unlimited entries."
                        />
                      )
                    },
                    {
                      label: 'Submission Cooldown (sec)',
                      desc: 'Minimum time between submissions from the same chatter',
                      control: (
                        <TextField
                          size="small"
                          type="number"
                          value={submissionCooldownSetting}
                          onChange={(e) => updateNumericSetting('submission_cooldown', e.target.value, { min: 0, max: 1800 })}
                          inputProps={{ min: 0, max: 1800 }}
                          helperText="Set to 0 to disable rate limiting altogether."
                        />
                      )
                    },
                    {
                      label: 'Max Videos Per User',
                      desc: 'Prevents one chatter from flooding the queue',
                      control: (
                        <TextField
                          size="small"
                          type="number"
                          value={maxPerUserSetting}
                          onChange={(e) => updateNumericSetting('max_per_user', e.target.value, { min: 0 })}
                          inputProps={{ min: 0 }}
                          helperText="Use 0 to allow unlimited videos per chatter."
                        />
                      )
                    },
                    {
                      label: 'Max Video Duration (sec)',
                      desc: `Hard cap for submitted clips (current ≈ ${Math.max(1, maxVideoDurationMinutes)} min)`,
                      control: (
                        <TextField
                          size="small"
                          type="number"
                          value={maxVideoDurationSetting}
                          onChange={(e) => updateNumericSetting('max_video_duration', e.target.value, { min: 30, max: 5400 })}
                          inputProps={{ min: 30, max: 5400, step: 30 }}
                          helperText="Enter length in seconds (600 = 10 minutes)."
                        />
                      )
                    }
                  ];
                  return (
                    <Stack spacing={1.25} sx={{ mb: 4 }}>
                      {rows.map((row) => (
                        <Box
                          key={row.label}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1.2,
                            p: 1,
                            bgcolor: 'background.paper'
                          }}
                        >
                          <Box sx={{ minWidth: 220 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {row.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {row.desc}
                            </Typography>
                          </Box>
                          <Box sx={{ flex: 1 }}>{row.control}</Box>
                        </Box>
                      ))}
                    </Stack>
                  );
                })()}
              </>
            )}

            {/* Audio & Soundboard */}
            {(canProduce || canManageSettings) && (
              <Stack spacing={2} sx={{ mb: 4 }}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={1}>
                      <Box display="flex" alignItems="flex-start">
                        <Box sx={{ mr: 2, p: 1, borderRadius: 1, bgcolor: alpha(theme.palette.info.main, 0.1), color: 'info.main' }}>
                          <LiveTv />
                        </Box>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }} gutterBottom>
                            Soundboard (per-channel)
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Upload short audio clips you can trigger for judges and the overlay.
                          </Typography>
                        </Box>
                      </Box>
                      <IconButton size="small" onClick={() => setSbExpanded((v) => !v)} aria-label={sbExpanded ? 'Collapse' : 'Expand'}>
                        {sbExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                    </Box>
                    <Collapse in={sbExpanded} timeout="auto" unmountOnExit>
                      <Stack spacing={2}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <input ref={sbFileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleSbFileSelected} />
                          <TextField size="small" label="Name" placeholder="e.g., Airhorn" value={sbName} onChange={(e) => setSbName(e.target.value)} sx={{ width: 260 }} />
                          <Button variant="contained" onClick={triggerSbFilePicker} disabled={sbUploading || !channel?.id}>{sbUploading ? 'Uploading…' : 'Upload Sound'}</Button>
                          <Button variant="outlined" onClick={refreshSoundboard} disabled={sbUploading}>Refresh</Button>
                        </Box>
                        {sbError && (<Alert severity="error">{sbError}</Alert>)}
                        <List dense sx={{ borderTop: 1, borderColor: 'divider', mt: 1 }}>
                          {soundboardItems.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1 }}>No sounds uploaded yet.</Typography>
                          ) : (
                            soundboardItems.map((it) => (
                              <ListItem key={it.id} sx={{ px: 1, '& .MuiListItemText-primary': { fontWeight: 600 }, '& .MuiListItemText-secondary': { color: 'text.secondary' } }}
                                secondaryAction={
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <IconButton size="small" aria-label="Play" onClick={() => handlePlaySound(it.id)} disabled={sbBusyId === it.id}><PlayArrow fontSize="small" /></IconButton>
                                    <IconButton size="small" aria-label="Open" component="a" href={resolveItemUrl(it)} target="_blank" rel="noreferrer"><OpenInNewIcon fontSize="small" /></IconButton>
                                    <IconButton size="small" aria-label="Copy URL" onClick={() => handleCopyUrl(it)}><ContentCopy fontSize="small" /></IconButton>
                                    <IconButton size="small" aria-label="Delete" color="error" onClick={() => handleDeleteSound(it.id)}><Delete fontSize="small" /></IconButton>
                                  </Stack>
                                }>
                                <ListItemText primary={it.name} secondary={new Date(it.createdAt).toLocaleString()} />
                              </ListItem>
                            ))
                          )}
                        </List>
                      </Stack>
                    </Collapse>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="flex-start" mb={1.5}>
                      <Box sx={{ mr: 2, p: 1, borderRadius: 1, bgcolor: alpha(theme.palette.info.main, 0.1), color: 'info.main' }}>
                        <LiveTv />
                      </Box>
                      <Box flex={1}>
                        <Typography variant="h6" sx={{ fontWeight: 700 }} gutterBottom>
                          Shuffle Audio
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Upload a custom audio track to play during queue shuffles.
                        </Typography>
                      </Box>
                    </Box>
                    <Stack spacing={2}>
                      <Box>
                        <Typography variant="body2" color="text.secondary">Current: {shuffleAudioUrl ? shuffleAudioUrl : 'Default theme'}</Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleShuffleAudioSelected} />
                        <Button variant="contained" onClick={triggerShuffleAudioDialog} disabled={uploadingAudio || !channel?.id}>{uploadingAudio ? 'Uploading…' : 'Upload Audio'}</Button>
                        <Button variant="outlined" color="warning" onClick={handleResetShuffleAudio} disabled={uploadingAudio}>Reset to Default</Button>
                      </Box>
                      {shuffleAudioUrl && (<audio controls src={shuffleAudioUrl} style={{ width: '100%' }} />)}
                      {uploadError && (<Alert severity="error">{uploadError}</Alert>)}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            )}
            {/* Stats Overview */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  icon={<QueueMusic />}
                  title="Queue Size"
                  value={queueSize}
                  color="info"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  icon={<PlayArrow />}
                  title="Queue Status"
                  value={queueEnabled ? "Open" : "Closed"}
                  color={queueEnabled ? "success" : "default"}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  icon={<LiveTv />}
                  title="Player Status"
                  value={currentlyPlaying ? "Playing" : "Idle"}
                  color={currentlyPlaying ? "error" : "default"}
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

            {/* Quick Actions */}
            <Typography variant="h6" sx={{ fontWeight: 700 }} gutterBottom>
              Quick Actions
            </Typography>
            {(() => {
              const base = window.location.origin.replace(/\/$/, '');
              const rows = [
                { icon: <LiveTv color="primary" />, label: 'Viewer Hub', desc: 'Public page (standings + queue)', url: `${base}/viewer/${channel.id}` },
                { icon: <TrendingUp color="primary" />, label: 'Manage Cups', desc: 'Create & manage gameshow events', onOpen: () => navigate(`/channel/${channel.id}/cups`) },
                { icon: <LiveTv color="primary" />, label: 'Queue Overlay', desc: 'Top 8 + queue browser source', url: `${base}/overlay/${channel.id}/queue` },
                { icon: <LiveTv color="primary" />, label: 'Player Overlay', desc: 'Synced video player source', url: `${base}/player/${channel.id}` },
                { icon: <LiveTv color="primary" />, label: 'Leaderboard Overlay', desc: 'Cup standings overlay', url: `${base}/overlay/${channel.id}/leaderboard` },
                { icon: <Delete color="error" />, label: 'Clear Queue', desc: 'Remove all videos from queue', onOpen: clearingQueue ? undefined : handleClearQueue, danger: true }
              ];
              return (
                <Stack spacing={1.25} sx={{ mb: 4 }}>
                  {rows.map((row, idx) => (
                    <Box
                      key={`${row.label}-${idx}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        border: '1px solid',
                        borderColor: row.danger ? 'error.light' : 'divider',
                        bgcolor: row.danger ? alpha(theme.palette.error.main, 0.05) : 'background.paper',
                        borderRadius: 1.2,
                        p: 1
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36 }}>{row.icon}</Box>
                      <Box sx={{ minWidth: 220 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {row.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.desc}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        {row.url && (
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              px: 1.25,
                              py: 0.75,
                              borderRadius: 1,
                              bgcolor: 'action.hover'
                            }}
                            title={row.url}
                          >
                            {row.url}
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        {row.url && (
                          <Tooltip title="Open in new tab">
                            <IconButton size="small" component="a" href={row.url} target="_blank" rel="noreferrer">
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {row.url && (
                          <Tooltip title="Copy URL">
                            <IconButton size="small" onClick={() => navigator.clipboard.writeText(row.url)}>
                              <ContentCopy fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {row.onOpen && (
                          <Tooltip title={row.danger ? (clearingQueue ? 'Clearing…' : 'Clear Queue') : 'Open'}>
                            <span>
                              <Button
                                size="small"
                                variant={row.danger ? 'outlined' : 'contained'}
                                color={row.danger ? 'error' : 'primary'}
                                disabled={row.danger && clearingQueue}
                                onClick={row.onOpen}
                              >
                                {row.danger ? (clearingQueue ? 'Clearing…' : 'Clear') : 'Open'}
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              );
            })()}

            {/* removed bulky grid settings; replaced by compact rows above */}
            {canManageSettings ? null : (
              <Paper sx={{ p: 3, mt: 4 }} ref={settingsSectionRef}>
                <Typography variant="h6" gutterBottom>
                  Limited Access
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  You don&apos;t have owner or manager permissions for this channel, so queue settings are read-only.
                  You can still use the Producer Console and Moderation tools based on your role.
                </Typography>
              </Paper>
            )}

            {/* Auto-save indicator */}
            {saving && (
              <Box display="flex" alignItems="center" justifyContent="flex-end" gap={1} mb={2}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Saving...
                </Typography>
              </Box>
            )}

            {/* Channel URLs */}
            <Paper sx={{ p: 3, mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                Share Your Channel
              </Typography>

              {(() => {
                const base = window.location.origin.replace(/\/$/, '');
                const rows = [
                  { label: 'Queue Page', desc: 'Public list of videos in queue', url: `${base}/channel/${channel.id}` },
                  { label: 'OBS Overlay', desc: 'Video player browser source', url: `${base}/player/${channel.id}` },
                  { label: 'Viewer Hub', desc: 'Standings, queue, and cups', url: `${base}/viewer/${channel.id}` },
                  { label: 'Queue Overlay', desc: 'Top 8 + queue overlay', url: `${base}/overlay/${channel.id}/queue` },
                  { label: 'Leaderboard Overlay', desc: 'Cup standings overlay', url: `${base}/overlay/${channel.id}/leaderboard` }
                ];

                return (
                  <Stack spacing={1.25} sx={{ mt: 1 }}>
                    {rows.map((row) => (
                      <Box
                        key={row.label}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1.2,
                          p: 1,
                          bgcolor: 'background.paper'
                        }}
                      >
                        <Box sx={{ minWidth: 180 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {row.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.desc}
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{
                            flex: 1,
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            px: 1.25,
                            py: 0.75,
                            borderRadius: 1,
                            bgcolor: 'action.hover'
                          }}
                          title={row.url}
                        >
                          {row.url}
                        </Typography>
                        <Tooltip title="Open in new tab">
                          <IconButton size="small" component="a" href={row.url} target="_blank" rel="noreferrer">
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Copy URL">
                          <IconButton
                            size="small"
                            onClick={() => navigator.clipboard.writeText(row.url)}
                          >
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ))}
                  </Stack>
                );
              })()}
            </Paper>
          </>
        )}
          </>
        )}

        {activeTab === 'producer' && canProduce && (
          <>
            {!channel && !loading && (
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
                  Channel Not Found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Select a channel above to open the Producer Console.
                </Typography>
              </Paper>
            )}

            {channel && (
              <>
                <Card sx={{ mb: 2 }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
                      <Box>
                        <Typography variant="h6" gutterBottom>
                          Producer Console
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Control playback, manage the queue, and monitor submissions for {channel.displayName}.
                        </Typography>
                      </Box>
                      <Box display="flex" gap={1}>
                        <Button
                          variant="outlined"
                          onClick={() => window.open(`/channel/${channel.id}`, '_blank')}
                        >
                          Open in New Tab
                        </Button>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
                <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                  <ChannelQueue channelName={channel.id} embedded />
                </Box>
              </>
            )}
          </>
        )}

        {activeTab === 'cups' && canProduce && (
          <>
            {!channel && !loading && (
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
                  Channel Not Found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Select a channel above to manage your cups.
                </Typography>
              </Paper>
            )}

            {channel && (
              <>
                <Card sx={{ mb: 2 }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
                      <Box>
                        <Typography variant="h6" gutterBottom>
                          Manage Cups
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Create cups, manage judges, and view videos for {channel.displayName}.
                        </Typography>
                      </Box>
                      <Box display="flex" gap={1}>
                        <Button
                          variant="outlined"
                          onClick={() => window.open(`/channel/${channel.id}/cups`, '_blank')}
                        >
                          Open in New Tab
                        </Button>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
                <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                  <CupAdmin channelName={channel.id} embedded />
                </Box>
              </>
            )}
          </>
        )}

        {activeTab === 'moderation' && (
          <>
            {!channel && !loading && (
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
                  Channel Not Available
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  We couldn&rsquo;t load a channel for your account. Ask the channel owner to grant you access.
                </Typography>
              </Paper>
            )}

            {channel && !canModerate && (
              <Paper
                sx={{
                  p: 6,
                  textAlign: 'center',
                  background: alpha(theme.palette.warning.main, 0.08),
                  borderRadius: 2
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Moderation Access Required
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  You&apos;re signed in, but this channel hasn&apos;t granted you a moderation role yet.
                </Typography>
                {roleLabels.length > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Your current roles: {roleLabels.join(', ')}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Reach out to the channel owner or manager to be added as a moderator.
                  </Typography>
                )}
              </Paper>
            )}

            {channel && canModerate && (
              <>
                <Grid container spacing={3} sx={{ mb: 4 }}>
                  <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                      icon={<QueueMusic />}
                      title="Queue Size"
                      value={queueSize}
                      color="info"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                      icon={<PlayArrow />}
                      title="Queue Status"
                      value={queueEnabled ? 'Open' : 'Closed'}
                      color={queueEnabled ? 'success' : 'default'}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                      icon={<WarningAmber />}
                      title="Active Warnings"
                      value={moderationCountDisplay}
                      color={warningCount ? 'warning' : 'default'}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <StatCard
                      icon={<Person />}
                      title="Top Moderator"
                      value={topModerator.name ? `${topModerator.name} (${topModerator.count})` : '—'}
                      color="secondary"
                    />
                  </Grid>
                </Grid>

                <Grid container spacing={3}>
                  <Grid item xs={12} md={4}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          Channel Access
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          You&apos;re moderating submissions for {channel.displayName}.
                        </Typography>

                        {roleLabels.length > 0 && (
                          <Box mt={2} display="flex" flexWrap="wrap" gap={1}>
                            {roleLabels.map((role) => (
                              <Chip key={role} label={role} size="small" color="primary" variant="outlined" />
                            ))}
                          </Box>
                        )}

                        <Divider sx={{ my: 3 }} />

                        <Stack spacing={1.5}>
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">
                              Queue Enabled
                            </Typography>
                            <Chip
                              label={queueEnabled ? 'Open' : 'Closed'}
                              color={queueEnabled ? 'success' : 'default'}
                              size="small"
                            />
                          </Box>
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">
                              Currently Playing
                            </Typography>
                            <Chip
                              label={currentlyPlaying ? 'Playing' : 'Idle'}
                              color={currentlyPlaying ? 'error' : 'default'}
                              size="small"
                            />
                          </Box>
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">
                              Active Warnings
                            </Typography>
                            <Chip
                              label={moderationCountDisplay}
                              color={warningCount ? 'warning' : 'default'}
                              size="small"
                            />
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} md={8}>
                    <Card>
                      <CardContent>
                        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} mb={2}>
                          <Box>
                            <Typography variant="h6" gutterBottom>
                              Moderation Queue
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Flag videos with warnings or give them a thumbs up for the production team.
                            </Typography>
                          </Box>
                          <Box display="flex" alignItems="center" gap={1}>
                            <FormControlLabel
                              control={
                                <Switch
                                  size="small"
                                  checked={showAutoOnly}
                                  onChange={(e) => setShowAutoOnly(e.target.checked)}
                                />
                              }
                              label="Only Auto‑approved"
                            />
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={loadPendingSubmissions}
                              disabled={moderationLoading}
                            >
                              Refresh
                            </Button>
                          </Box>
                        </Box>

                        {moderationError && (
                          <Alert severity="error" sx={{ mb: 2 }}>
                            {moderationError}
                          </Alert>
                        )}

                        {moderationLoading ? (
                          <Box display="flex" justifyContent="center" py={4}>
                            <CircularProgress size={32} />
                          </Box>
                        ) : filteredModerationItems.length === 0 ? (
                          <Alert severity="success">
                            No videos need attention right now. You&rsquo;re all caught up!
                          </Alert>
                        ) : (
                          <Stack spacing={2}>
                            {filteredModerationItems.map((item) => (
                              <Paper key={item.id} variant="outlined" sx={{ p: 2 }}>
                                <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
                                  <Box flex={1} minWidth={220}>
                                    <Typography variant="subtitle1" fontWeight={600}>
                                      {item.title || 'Untitled Submission'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      Submitted by {formatSubmitterLabel(item)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {formatTimestamp(item.createdAt)}
                                    </Typography>
                                  </Box>
                                  <Box display="flex" alignItems="center" gap={1}>
                                    {getModerationItemUrl(item) && (
                                      <Tooltip title="Open video">
                                        <IconButton
                                          size="small"
                                          aria-label="Open"
                                          component="a"
                                          href={getModerationItemUrl(item)}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <OpenInNewIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                    <Chip
                                      label={item.status || 'PENDING'}
                                      size="small"
                                      color={item.status === 'APPROVED' ? 'success' : item.status === 'REJECTED' ? 'error' : 'warning'}
                                      variant={item.status === 'PENDING' ? 'filled' : 'outlined'}
                                    />
                                    {item.platform && (
                                      <Chip label={item.platform.toUpperCase()} size="small" variant="outlined" />
                                    )}
                                    {item.moderationStatus === 'WARNING' && (
                                      <Chip
                                        label="Warning"
                                        size="small"
                                        color="warning"
                                        icon={<WarningAmber fontSize="small" />}
                                      />
                                    )}
                                    {item.moderationStatus !== 'WARNING' && !item.moderatedBy && (
                                      <Chip
                                        label="Auto‑approved"
                                        size="small"
                                        color="success"
                                        variant="outlined"
                                      />
                                    )}
                                  </Box>
                                </Box>

                                {item.moderationStatus === 'WARNING' && (
                                  <Alert
                                    severity="warning"
                                    icon={<WarningAmber fontSize="inherit" />}
                                    sx={{ mt: 1.5 }}
                                  >
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                      Flagged by {item.moderatedByDisplayName || item.moderatedBy || 'Moderator'}
                                      {item.moderatedAt ? ` — ${formatTimestamp(item.moderatedAt)}` : ''}
                                    </Typography>
                                    {item.moderationNote && (
                                      <Typography variant="body2" sx={{ mt: 0.75 }}>
                                        {item.moderationNote}
                                      </Typography>
                                    )}
                                  </Alert>
                                )}

                                {item.moderationStatus !== 'WARNING' && item.moderatedBy && (
                                  <Typography variant="body2" color="success.main" sx={{ mt: 1.5 }}>
                                    Approved by {item.moderatedByDisplayName || item.moderatedBy}
                                    {item.moderatedAt ? ` — ${formatTimestamp(item.moderatedAt)}` : ''}
                                    {item.moderationNote ? ` — ${item.moderationNote}` : ''}
                                  </Typography>
                                )}
                                {item.moderationStatus !== 'WARNING' && !item.moderatedBy && (
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                                    Auto‑approved
                                  </Typography>
                                )}

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
                                  <Button
                                    variant="contained"
                                    color="success"
                                    startIcon={<ThumbUp />}
                                    size="small"
                                    disabled={moderationActionId === item.id}
                                    onClick={() => handleModerationAction(item.id, 'APPROVE')}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    color="warning"
                                    startIcon={<WarningAmber />}
                                    size="small"
                                    disabled={moderationActionId === item.id}
                                    onClick={() => openWarningDialog(item)}
                                  >
                                    {item.moderationStatus === 'WARNING' ? 'Edit Warning' : 'Flag Warning'}
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    color="error"
                                    startIcon={<Delete />}
                                    size="small"
                                    disabled={moderationActionId === item.id}
                                    onClick={() => handleModerationAction(item.id, 'REMOVE')}
                                  >
                                    Remove
                                  </Button>
                                </Stack>
                              </Paper>
                            ))}
                          </Stack>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </>
        )}
          </>
        )}

        <Dialog
          open={warningDialogOpen}
          onClose={warningActionInFlight ? undefined : closeWarningDialog}
          disableEscapeKeyDown={warningActionInFlight}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Flag Submission</DialogTitle>
          <DialogContent dividers>
            {warningTarget && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {warningTarget.title || 'Untitled Submission'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Submitted by {formatSubmitterLabel(warningTarget)}
                </Typography>
              </Box>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Leave a short note explaining why this video needs a producer warning.
            </Typography>
            <TextField
              multiline
              autoFocus
              minRows={3}
              maxRows={6}
              fullWidth
              value={warningNote}
              onChange={(event) => {
                const value = event.target.value.slice(0, WARNING_NOTE_LIMIT);
                setWarningNote(value);
              }}
              label="Moderator Note"
              placeholder="Example: contains flashing lights during the first 15 seconds."
              helperText={`${warningNoteLength}/${WARNING_NOTE_LIMIT} characters`}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={closeWarningDialog} disabled={warningActionInFlight}>
              Cancel
            </Button>
            <Button
              onClick={submitWarning}
              variant="contained"
              color="warning"
              startIcon={<WarningAmber />}
              disabled={warningActionInFlight || !warningNote.trim()}
            >
              Flag Warning
            </Button>
          </DialogActions>
        </Dialog>

        {/* Success Snackbar */}
        <Snackbar
          open={saveSuccess}
          autoHideDuration={2000}
          onClose={() => setSaveSuccess(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert severity="success" icon={<CheckCircle />}>
            Settings saved!
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  );
};

export default Dashboard;
