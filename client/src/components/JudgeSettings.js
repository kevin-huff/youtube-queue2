import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Stack,
  Divider,
  IconButton,
  Tooltip,
  Alert,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Settings as SettingsIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

const JudgeSettings = ({ session, channelName, cupId, judgeToken, onNameUpdate }) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(session?.judgeName || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Generate overlay URLs
  const baseUrl = window.location.origin;
  const overlayLinks = [
    {
      name: 'Judge Scoring Panel',
      description: 'Your personal scoring interface',
      url: `${baseUrl}/judge/${channelName}/${cupId}?token=${judgeToken}`,
    },
  ];

  const handleCopyLink = (url) => {
    navigator.clipboard.writeText(url);
    setSnackbarMessage('Link copied to clipboard!');
    setSnackbarOpen(true);
  };

  const handleUpdateName = async () => {
    if (!newName.trim()) {
      setError('Name cannot be empty');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/channels/${channelName}/cups/${cupId}/judge/name`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${judgeToken}`,
          },
          body: JSON.stringify({ judgeName: newName.trim() }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update name');
      }

      setSnackbarMessage('Name updated successfully!');
      setSnackbarOpen(true);
      setOpen(false);
      
      if (onNameUpdate) {
        onNameUpdate(newName.trim());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<SettingsIcon />}
        onClick={() => setOpen(true)}
        size="small"
      >
        Judge Info & Links
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Judge Settings & Overlay Links</Typography>
            <IconButton onClick={() => setOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} mt={2}>
            {/* Judge Name Section */}
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Display Name
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  This is how you'll appear in the judging system and on stream overlays
                </Typography>
                <Stack direction="row" spacing={2} mt={2}>
                  <TextField
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Enter your judge name"
                    size="small"
                    fullWidth
                    label="Judge Name"
                  />
                  <Button
                    variant="contained"
                    onClick={handleUpdateName}
                    disabled={loading || !newName.trim() || newName === session?.judgeName}
                  >
                    Update
                  </Button>
                </Stack>
                {error && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {error}
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Divider />

            {/* Overlay Links Section */}
            <Box>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                Your Judge Link
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                This is your personal judging interface. The link includes your authentication
                token, so keep it private.
              </Typography>

              <List>
                {overlayLinks.map((link, index) => (
                  <ListItem
                    key={index}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      mb: 1,
                    }}
                  >
                    <ListItemText
                      primary={link.name}
                      secondary={
                        <Stack spacing={1} mt={1}>
                          <Typography variant="caption" color="text.secondary">
                            {link.description}
                          </Typography>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              bgcolor: 'action.hover',
                              p: 1,
                              borderRadius: 1,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                wordBreak: 'break-all',
                                flex: 1,
                              }}
                            >
                              {link.url}
                            </Typography>
                            <Tooltip title="Copy link">
                              <IconButton
                                size="small"
                                onClick={() => handleCopyLink(link.url)}
                                color="primary"
                              >
                                <CopyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Stack>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>

            {/* Session Info */}
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Session Info
                </Typography>
                <Stack spacing={1}>
                  <Typography variant="body2">
                    <strong>Cup:</strong> {session?.cup?.title || 'Loading...'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Theme:</strong> {session?.cup?.theme || 'None'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Status:</strong> {session?.status || 'Unknown'}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            <Alert severity="info">
              <Typography variant="body2">
                <strong>Keep your links private!</strong> Anyone with these URLs can judge as
                you. Don't share them publicly.
              </Typography>
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />
    </>
  );
};

export default JudgeSettings;
