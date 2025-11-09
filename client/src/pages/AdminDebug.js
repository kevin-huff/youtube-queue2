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
              <Typography variant="body2" sx={{ mb: 0.5 }}>Admin endpoint</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1, mb: 1 }}>
                {adsNext ? JSON.stringify(adsNext, null, 2) : '—'}
              </Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>User endpoint (ownership required)</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                {adsNextUser ? JSON.stringify(adsNextUser, null, 2) : '—'}
              </Box>
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
