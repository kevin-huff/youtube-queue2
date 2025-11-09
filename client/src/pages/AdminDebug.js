import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  MenuItem,
  Grid,
  Alert,
  Chip,
  Divider,
  Stack,
  CircularProgress
} from '@mui/material';
import axios from 'axios';

const AdminDebug = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [adsNext, setAdsNext] = useState(null);
  const [adsNextUser, setAdsNextUser] = useState(null);
  const [adsLoading, setAdsLoading] = useState(false);
  const [logFile, setLogFile] = useState('app');
  const [logLines, setLogLines] = useState(200);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logLevel, setLogLevel] = useState('info');
  const [adState, setAdState] = useState(null);
  const [adRefreshing, setAdRefreshing] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [bot, setBot] = useState(null);
  const [botLoading, setBotLoading] = useState(false);
  const [sayText, setSayText] = useState('');
  const [inspect, setInspect] = useState(null);
  const [chanBusy, setChanBusy] = useState(false);

  const fetchInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get('/api/admin/debug/info', { withCredentials: true });
      setInfo(res?.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load admin info');
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/channels', { withCredentials: true });
      const list = Array.isArray(res?.data?.channels) ? res.data.channels : [];
      setChannels(list);
      if (!selectedChannel && list.length) {
        setSelectedChannel(list[0].id);
      }
    } catch (_) {
      setChannels([]);
    }
  }, [selectedChannel]);

  useEffect(() => {
    fetchInfo();
    fetchChannels();
  }, [fetchInfo, fetchChannels]);

  const fetchAdState = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/ad-service/state', { withCredentials: true });
      setAdState(res?.data || null);
    } catch (_) {
      setAdState(null);
    }
  }, []);

  const refreshAdSubs = useCallback(async () => {
    try {
      setAdRefreshing(true);
      await axios.post('/api/admin/ad-service/refresh', {}, { withCredentials: true });
      await fetchAdState();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to refresh subs');
    } finally {
      setAdRefreshing(false);
    }
  }, [fetchAdState]);

  const fetchSessions = useCallback(async () => {
    try {
      setSessionsLoading(true);
      const res = await axios.get('/api/admin/ad-service/sessions', { withCredentials: true });
      const arr = Array.isArray(res?.data?.sessions) ? res.data.sessions : [];
      setSessions(arr);
    } catch (_) {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const fetchBot = useCallback(async () => {
    try {
      setBotLoading(true);
      const res = await axios.get('/api/admin/bot', { withCredentials: true });
      setBot(res?.data || null);
    } catch (_) {
      setBot(null);
    } finally {
      setBotLoading(false);
    }
  }, []);

  const handleJoin = useCallback(async () => {
    if (!selectedChannel) return;
    try {
      setChanBusy(true);
      await axios.post('/api/admin/bot/join', { channelId: selectedChannel }, { withCredentials: true });
      await fetchBot();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to join');
    } finally {
      setChanBusy(false);
    }
  }, [selectedChannel, fetchBot]);

  const handleLeave = useCallback(async () => {
    if (!selectedChannel) return;
    try {
      setChanBusy(true);
      await axios.post('/api/admin/bot/leave', { channelId: selectedChannel }, { withCredentials: true });
      await fetchBot();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to leave');
    } finally {
      setChanBusy(false);
    }
  }, [selectedChannel, fetchBot]);

  const handleSay = useCallback(async () => {
    if (!selectedChannel || !sayText.trim()) return;
    try {
      setChanBusy(true);
      await axios.post('/api/admin/bot/say', { channelId: selectedChannel, message: sayText.trim() }, { withCredentials: true });
      setSayText('');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to send');
    } finally {
      setChanBusy(false);
    }
  }, [selectedChannel, sayText]);

  const handleInspect = useCallback(async () => {
    if (!selectedChannel) return;
    try {
      const res = await axios.get(`/api/admin/channels/${selectedChannel}/inspect`, { withCredentials: true });
      setInspect(res?.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to inspect');
    }
  }, [selectedChannel]);

  const handleActivate = useCallback(async () => {
    if (!selectedChannel) return;
    try {
      await axios.post(`/api/admin/channels/${selectedChannel}/activate`, {}, { withCredentials: true });
      await fetchChannels();
      await fetchBot();
      await handleInspect();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to activate');
    }
  }, [selectedChannel, fetchChannels, fetchBot, handleInspect]);

  const handleDeactivate = useCallback(async () => {
    if (!selectedChannel) return;
    try {
      await axios.post(`/api/admin/channels/${selectedChannel}/deactivate`, {}, { withCredentials: true });
      await fetchChannels();
      await fetchBot();
      await handleInspect();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to deactivate');
    }
  }, [selectedChannel, fetchChannels, fetchBot, handleInspect]);

  useEffect(() => {
    fetchAdState();
    fetchSessions();
    fetchBot();
  }, [fetchAdState, fetchSessions, fetchBot]);

  const handleRefreshAds = useCallback(async () => {
    if (!selectedChannel) return;
    try {
      setAdsLoading(true);
      setAdsNext(null);
      setAdsNextUser(null);
      const [adminRes, userRes] = await Promise.all([
        axios.get('/api/admin/debug/ads/next', { params: { channelId: selectedChannel }, withCredentials: true }),
        axios.get(`/api/channels/${selectedChannel}/ads/next`, { withCredentials: true }).catch((e) => e?.response ? e : Promise.reject(e))
      ]);
      setAdsNext(adminRes?.data || null);
      setAdsNextUser(userRes?.data ?? null);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load ads/next');
    } finally {
      setAdsLoading(false);
    }
  }, [selectedChannel]);

  const handleTailLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      setLogs([]);
      const res = await axios.get('/api/admin/logs', { params: { file: logFile, lines: logLines }, withCredentials: true });
      const lines = Array.isArray(res?.data?.lines) ? res.data.lines : [];
      setLogs(lines);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to read logs');
    } finally {
      setLogsLoading(false);
    }
  }, [logFile, logLines]);

  const handleSetLogLevel = useCallback(async () => {
    try {
      await axios.post('/api/admin/log-level', { level: logLevel }, { withCredentials: true });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to change log level');
    }
  }, [logLevel]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <CircularProgress size={24} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      </Container>
    );
  }

  if (!info?.admin) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="warning">Admin access required.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Admin Debug Console
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Typography variant="h6">Environment</Typography>
                <Button onClick={fetchInfo} size="small">Refresh</Button>
              </Box>
              <Divider sx={{ my: 1.5 }} />
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Chip label={`Admin IDs: ${info.adminIds?.join(', ') || ''}`} size="small" />
              </Stack>
              <Typography variant="body2" sx={{ mb: 0.5 }}>User</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                {JSON.stringify(info.user, null, 2)}
              </Box>
              <Typography variant="body2" sx={{ mt: 1, mb: 0.5 }}>Ad Service</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                {JSON.stringify(info.adService, null, 2)}
              </Box>
              <Typography variant="body2" sx={{ mt: 1, mb: 0.5 }}>Channels</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                {JSON.stringify(info.channels, null, 2)}
              </Box>
              <Divider sx={{ my: 1.5 }} />
              <Stack direction="row" spacing={1}>
                <TextField select size="small" label="Log level" value={logLevel} onChange={(e) => setLogLevel(e.target.value)} sx={{ minWidth: 160 }}>
                  <MenuItem value="error">error</MenuItem>
                  <MenuItem value="warn">warn</MenuItem>
                  <MenuItem value="info">info</MenuItem>
                  <MenuItem value="debug">debug</MenuItem>
                  <MenuItem value="verbose">verbose</MenuItem>
                  <MenuItem value="silly">silly</MenuItem>
                </TextField>
                <Button onClick={handleSetLogLevel} size="small">Set</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">Ad Schedule Probe</Typography>
                <Button onClick={handleRefreshAds} size="small" disabled={!selectedChannel || adsLoading}>
                  {adsLoading ? 'Loading…' : 'Refresh'}
                </Button>
              </Box>
              <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
                <TextField
                  select
                  size="small"
                  label="Channel"
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  sx={{ minWidth: 220 }}
                >
                  {channels.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.displayName || c.id}</MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Button onClick={refreshAdSubs} size="small" disabled={adRefreshing}>{adRefreshing ? 'Refreshing…' : 'Refresh Subs'}</Button>
                <Button onClick={fetchAdState} size="small">Load State</Button>
                <Button onClick={fetchSessions} size="small" disabled={sessionsLoading}>{sessionsLoading ? 'Loading…' : 'List Sessions'}</Button>
                <Button onClick={handleInspect} size="small" disabled={!selectedChannel}>Inspect Channel</Button>
              </Stack>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Admin endpoint</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1, mb: 1 }}>
                {adsNext ? JSON.stringify(adsNext, null, 2) : '—'}
              </Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>User endpoint (ownership required)</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                {adsNextUser ? JSON.stringify(adsNextUser, null, 2) : '—'}
              </Box>
              <Typography variant="body2" sx={{ mt: 1, mb: 0.5 }}>Ad service state</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                {adState ? JSON.stringify(adState, null, 2) : '—'}
              </Box>
              <Typography variant="body2" sx={{ mt: 1, mb: 0.5 }}>EventSub sessions</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                {sessions && sessions.length ? JSON.stringify(sessions, null, 2) : '—'}
              </Box>
              <Typography variant="body2" sx={{ mt: 1, mb: 0.5 }}>Channel inspect</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                {inspect ? JSON.stringify(inspect, null, 2) : '—'}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">Bot Controls</Typography>
                <Button onClick={fetchBot} size="small" disabled={botLoading}>{botLoading ? 'Loading…' : 'Refresh'}</Button>
              </Box>
              <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
                <TextField
                  select
                  size="small"
                  label="Channel"
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  sx={{ minWidth: 220 }}
                >
                  {channels.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.displayName || c.id}</MenuItem>
                  ))}
                </TextField>
                <Button onClick={handleJoin} size="small" disabled={!selectedChannel || chanBusy}>Join</Button>
                <Button onClick={handleLeave} size="small" disabled={!selectedChannel || chanBusy}>Leave</Button>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField size="small" label="Say (test)" value={sayText} onChange={(e) => setSayText(e.target.value)} sx={{ flex: 1 }} />
                <Button onClick={handleSay} size="small" disabled={!selectedChannel || !sayText.trim() || chanBusy}>Send</Button>
              </Stack>
              <Typography variant="body2" sx={{ mb: 0.5 }}>Bot status</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                {bot ? JSON.stringify(bot, null, 2) : '—'}
              </Box>
              <Divider sx={{ my: 1 }} />
              <Stack direction="row" spacing={1}>
                <Button onClick={handleActivate} size="small" disabled={!selectedChannel}>Activate Channel</Button>
                <Button onClick={handleDeactivate} size="small" disabled={!selectedChannel}>Deactivate Channel</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">Logs Tail</Typography>
                <Box>
                  <TextField select size="small" value={logFile} onChange={(e) => setLogFile(e.target.value)} sx={{ mr: 1, minWidth: 120 }}>
                    <MenuItem value="app">app.log</MenuItem>
                    <MenuItem value="error">error.log</MenuItem>
                    <MenuItem value="exceptions">exceptions.log</MenuItem>
                  </TextField>
                  <TextField size="small" type="number" value={logLines} onChange={(e) => setLogLines(Number(e.target.value))} sx={{ mr: 1, width: 120 }} label="Lines" />
                  <Button onClick={handleTailLogs} size="small" disabled={logsLoading}>{logsLoading ? 'Loading…' : 'Tail'}</Button>
                </Box>
              </Box>
              <Box component="pre" sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: 'action.hover', p: 2, borderRadius: 1, maxHeight: 360, overflow: 'auto' }}>
                {logs.length ? logs.join('\n') : '—'}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default AdminDebug;
