import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  TextField,
  Alert,
  Stack,
  Chip,
  Divider,
  alpha
} from '@mui/material';
import {
  LiveTv,
  Security,
  GroupAdd,
  ContentCopy,
  CheckCircle
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);

  const [targetChannel, setTargetChannel] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [lookupResult, setLookupResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const defaultChannelName = useMemo(() => user?.username || '', [user]);
  const [newChannelName, setNewChannelName] = useState(defaultChannelName);

  const handleCreateChannel = useCallback(async () => {
    const name = (newChannelName || '').trim().toLowerCase();
    if (!name) {
      setCreateError('Enter a channel name');
      return;
    }
    try {
      setCreateLoading(true);
      setCreateError(null);
      setCreateSuccess(null);
      const resp = await fetch('/api/channels', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload.error || 'Failed to create channel');
      }
      setCreateSuccess(`Channel ${payload.channel?.displayName || name} created`);
      setTimeout(() => navigate('/dashboard'), 800);
    } catch (err) {
      setCreateError(err.message || 'Failed to create channel');
    } finally {
      setCreateLoading(false);
    }
  }, [newChannelName, navigate]);

  const handleLookupChannel = useCallback(async () => {
    const name = (targetChannel || '').trim().toLowerCase();
    if (!name) {
      setLookupError('Enter a channel to find');
      return;
    }
    try {
      setLookupLoading(true);
      setLookupError(null);
      setLookupResult(null);
      const resp = await fetch(`/api/channels/public/${encodeURIComponent(name)}`);
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload.error || 'Channel not found');
      }
      setLookupResult(payload.channel || null);
    } catch (err) {
      setLookupError(err.message || 'Failed to find channel');
    } finally {
      setLookupLoading(false);
    }
  }, [targetChannel]);

  const requestMessage = useMemo(() => {
    const me = user?.displayName || user?.username || 'A user';
    const channel = lookupResult?.id || targetChannel?.trim() || '';
    const host = typeof window !== 'undefined' ? window.location.origin : '';
    const instructions = channel
      ? `Open ${host}/channel/${channel} and in "Access & Roles" add me as a Producer or Moderator.`
      : 'Open your channel page and add me as a Producer or Moderator in Access & Roles.';
    return `${me} is requesting access to help manage your queue.

${instructions}

Twitch username: ${user?.username}`;
  }, [user, lookupResult, targetChannel]);

  const handleCopyRequest = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(requestMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      /* noop */
    }
  }, [requestMessage]);

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography variant="h4" fontWeight={800} gutterBottom>
        Welcome, {user?.displayName || user?.username}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Tell us how you plan to use the queue so we can get you set up fast.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <LiveTv color="primary" />
                  <Typography variant="h6" fontWeight={700}>I run a channel</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Create or connect your Twitch channel to manage queue settings and playback.
                </Typography>
                <TextField
                  label="Channel name"
                  size="small"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  helperText="Usually your Twitch username"
                />
                {createError && <Alert severity="error" onClose={() => setCreateError(null)}>{createError}</Alert>}
                {createSuccess && (
                  <Alert icon={<CheckCircle fontSize="inherit" />} severity="success" onClose={() => setCreateSuccess(null)}>
                    {createSuccess}
                  </Alert>
                )}
              </Stack>
            </CardContent>
            <CardActions>
              <Button variant="contained" onClick={handleCreateChannel} disabled={createLoading}>
                {createLoading ? 'Creating…' : 'Create Channel'}
              </Button>
              <Button color="inherit" onClick={() => navigate('/dashboard')}>Skip</Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <GroupAdd color="primary" />
                  <Typography variant="h6" fontWeight={700}>I help on someone else&apos;s channel</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Find their channel and copy a request message to share with the owner.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    label="Channel name"
                    size="small"
                    value={targetChannel}
                    onChange={(e) => setTargetChannel(e.target.value)}
                    fullWidth
                  />
                  <Button variant="outlined" onClick={handleLookupChannel} disabled={lookupLoading}>
                    {lookupLoading ? 'Finding…' : 'Find Channel'}
                  </Button>
                </Stack>
                {lookupError && <Alert severity="error" onClose={() => setLookupError(null)}>{lookupError}</Alert>}
                {lookupResult && (
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04) }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Security color="primary" />
                      <Typography variant="subtitle2" fontWeight={700}>{lookupResult.displayName}</Typography>
                      {lookupResult.isActive ? <Chip size="small" color="success" label="Active" /> : <Chip size="small" label="Inactive" />}
                    </Stack>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Share this message with the channel owner to grant your access:
                    </Typography>
                    <Box
                      component="pre"
                      sx={{ mt: 1, p: 1.5, borderRadius: 1, bgcolor: 'background.default', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}
                    >{requestMessage}</Box>
                    <Button startIcon={<ContentCopy />} size="small" onClick={handleCopyRequest}>
                      {copied ? 'Copied!' : 'Copy message'}
                    </Button>
                  </Box>
                )}
              </Stack>
            </CardContent>
            <CardActions>
              <Button color="inherit" onClick={() => navigate('/dashboard')}>Skip</Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default OnboardingPage;

