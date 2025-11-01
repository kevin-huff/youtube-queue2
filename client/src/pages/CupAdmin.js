import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  Add as AddIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  ContentCopy as CopyIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Link as LinkIcon,
  People as PeopleIcon,
  Refresh as RefreshIcon,
  Replay as ReplayIcon
} from '@mui/icons-material';
import { useSocket } from '../contexts/SocketContext';

// Helper to get the real submitter username for admin display
const getSubmitterUsername = (item) =>
  item?.submitter?.twitchUsername || item?.submitterUsername || 'Unknown';

const CupAdmin = () => {
  const { channelName } = useParams();
  const [cups, setCups] = useState([]);
  const [selectedCup, setSelectedCup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Judge link dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [judgeName, setJudgeName] = useState('');
  const [expiresIn, setExpiresIn] = useState('7d');
  const [generatedLink, setGeneratedLink] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  // Manage judges dialog
  const [judgesDialogOpen, setJudgesDialogOpen] = useState(false);
  const [judgesLoading, setJudgesLoading] = useState(false);
  const [judgesList, setJudgesList] = useState([]);
  
  // Create cup dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [cupTitle, setCupTitle] = useState('');
  const [cupSlug, setCupSlug] = useState('');
  const [cupTheme, setCupTheme] = useState('');
  const [cupStatus, setCupStatus] = useState('LIVE');

  // View videos dialog
  const [videosDialogOpen, setVideosDialogOpen] = useState(false);
  const [cupVideos, setCupVideos] = useState([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsError, setStandingsError] = useState(null);
  const [finalizingItemId, setFinalizingItemId] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [scoreLoadingId, setScoreLoadingId] = useState(null);
  const [scoreError, setScoreError] = useState(null);

  const {
    connectToChannel,
    disconnectFromChannel,
    refreshCupStandings,
    refreshScoresForItem,
    channelId,
    cupStandings: standingsByCup,
    cupVideoSummaries,
    scoresByItem
  } = useSocket();

  // Fetch cups for the channel
  const fetchCups = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/channels/${channelName}/cups`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch cups');
      }

      const data = await response.json();
      const fetchedCups = data.cups || [];
      setCups(fetchedCups);

      setSelectedCup((prev) => {
        if (!fetchedCups.length) {
          return null;
        }

        if (prev) {
          const preserved = fetchedCups.find((cup) => cup.id === prev.id);
          if (preserved) {
            return preserved;
          }
        }

        const activeCup = fetchedCups.find((cup) => cup.isActive) || fetchedCups[0];
        return activeCup;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [channelName]);

  useEffect(() => {
    if (channelName) {
      fetchCups();
    }
  }, [channelName, fetchCups]);

  useEffect(() => {
    if (!channelName) {
      return;
    }

    connectToChannel(channelName, { explicit: true });
    return () => {
      disconnectFromChannel();
    };
  }, [channelName, connectToChannel, disconnectFromChannel]);

  useEffect(() => {
    if (!selectedCup?.id || !channelId || channelId !== channelName?.toLowerCase()) {
      return;
    }

    setScoreError(null);

    let cancelled = false;

    const loadStandings = async () => {
      try {
        setStandingsLoading(true);
        setStandingsError(null);
        await refreshCupStandings(selectedCup.id);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load standings:', err);
          setStandingsError(err.message || 'Failed to load standings');
        }
      } finally {
        if (!cancelled) {
          setStandingsLoading(false);
        }
      }
    };

    loadStandings();
    return () => {
      cancelled = true;
    };
  }, [selectedCup?.id, channelId, channelName, refreshCupStandings]);

  const handleGenerateJudgeLink = async () => {
    if (!judgeName.trim()) {
      setError('Please enter a judge name');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `/api/channels/${channelName}/cups/${selectedCup.id}/judge-link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            judgeName: judgeName.trim(),
            expiresIn,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate judge link');
      }

      const data = await response.json();
      setGeneratedLink(data);
      setJudgeName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = (url) => {
    navigator.clipboard.writeText(url);
    setSnackbarMessage('Judge link copied to clipboard!');
    setSnackbarOpen(true);
  };

  const handleCloseLinkDialog = () => {
    setLinkDialogOpen(false);
    setGeneratedLink(null);
    setJudgeName('');
    setExpiresIn('7d');
  };

  const openJudgeLinkDialog = (cup) => {
    setSelectedCup(cup);
    setLinkDialogOpen(true);
  };

  const openManageJudges = async (cup) => {
    setSelectedCup(cup);
    setJudgesDialogOpen(true);
    await fetchJudges(cup.id);
  };

  const fetchJudges = async (cupId) => {
    try {
      setJudgesLoading(true);
      const response = await fetch(`/api/channels/${channelName}/cups/${cupId}/judges`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch judges');
      }

      const data = await response.json();
      setJudgesList(data.judges || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setJudgesLoading(false);
    }
  };

  const handleRevokeJudge = async (judgeId) => {
    if (!selectedCup) return;
    try {
      setLoading(true);
      const response = await fetch(
        `/api/channels/${channelName}/cups/${selectedCup.id}/judges/${encodeURIComponent(judgeId)}/revoke`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to revoke judge');
      }

      // Refresh judge list
      await fetchJudges(selectedCup.id);
      setSnackbarMessage('Judge session revoked');
      setSnackbarOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateJudge = async (judgeId) => {
    if (!selectedCup) return;
    try {
      setLoading(true);
      const response = await fetch(
        `/api/channels/${channelName}/cups/${selectedCup.id}/judges/${encodeURIComponent(judgeId)}/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ judgeName: null })
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to regenerate token');
      }

      const data = await response.json();

      // Copy new link to clipboard and refresh list
      if (data.url) {
        navigator.clipboard.writeText(data.url);
        setSnackbarMessage('New judge link generated and copied to clipboard');
        setSnackbarOpen(true);
      } else {
        setSnackbarMessage('New judge token generated');
        setSnackbarOpen(true);
      }

      await fetchJudges(selectedCup.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCup = async () => {
    if (!cupTitle.trim() || !cupSlug.trim()) {
      setError('Title and slug are required');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/channels/${channelName}/cups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          title: cupTitle.trim(),
          slug: cupSlug.trim(),
          theme: cupTheme.trim() || null,
          status: cupStatus,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create cup');
      }

      setSnackbarMessage('Cup created successfully!');
      setSnackbarOpen(true);
      setCreateDialogOpen(false);
      setCupTitle('');
      setCupSlug('');
      setCupTheme('');
      setCupStatus('LIVE');
      fetchCups();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    setCupTitle('');
    setCupSlug('');
    setCupTheme('');
    setCupStatus('LIVE');
  };

  const formatScore = (value, digits = 3) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '--';
    }
    return Number(value).toFixed(digits);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'SCORED':
      case 'PLAYED':
        return 'success';
      case 'PLAYING':
      case 'APPROVED':
      case 'TOP_EIGHT':
        return 'warning';
      case 'REJECTED':
      case 'REMOVED':
        return 'error';
      default:
        return 'default';
    }
  };

  const handleTitleChange = (e) => {
    const title = e.target.value;
    setCupTitle(title);
    // Auto-generate slug from title if slug is empty
    if (!cupSlug) {
      const autoSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setCupSlug(autoSlug);
    }
  };

  const handleUpdateCupStatus = async (cupId, newStatus) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/channels/${channelName}/cups/${cupId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update cup status');
      }

      setSnackbarMessage(`Cup status updated to ${newStatus}`);
      setSnackbarOpen(true);
      fetchCups();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetActiveCup = async (cupId) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/channels/${channelName}/cups/${cupId}/set-active`, {
        method: 'PATCH',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to set active cup');
      }

      setSnackbarMessage('Active cup updated - videos will now be assigned to this cup');
      setSnackbarOpen(true);
      fetchCups();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewVideos = async (cup) => {
    try {
      setLoading(true);
      setSelectedCup(cup);
      
      const response = await fetch(`/api/channels/${channelName}/cups/${cup.id}/videos`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch cup videos');
      }

      const data = await response.json();
      setCupVideos(data.videos || []);
      setVideosDialogOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnassignVideo = async (cupId, videoId) => {
    try {
      setLoading(true);
      
      const response = await fetch(
        `/api/channels/${channelName}/cups/${cupId}/videos/${videoId}/unassign`,
        {
          method: 'PATCH',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to unassign video');
      }

      setSnackbarMessage('Video unassigned from cup');
      setSnackbarOpen(true);
      
      // Refresh the video list
      if (selectedCup) {
        handleViewVideos(selectedCup);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeScore = async (video) => {
    if (!selectedCup?.id || !video?.queueItemId) {
      return;
    }

    try {
      setStandingsError(null);
      setScoreError(null);
      setFinalizingItemId(video.queueItemId);
      setStandingsLoading(true);

      const response = await fetch(
        `/api/channels/${channelName}/cups/${selectedCup.id}/items/${video.queueItemId}/finalize`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to finalize score');
      }

      setSnackbarMessage('Score finalized and standings updated');
      setSnackbarOpen(true);

      await refreshCupStandings(selectedCup.id);
      await refreshScoresForItem(selectedCup.id, video.queueItemId);
    } catch (err) {
      console.error('Failed to finalize score:', err);
      setStandingsError(err.message || 'Failed to finalize score');
    } finally {
      setStandingsLoading(false);
      setFinalizingItemId(null);
    }
  };

  const handleRefreshStandings = async () => {
    if (!selectedCup?.id) {
      return;
    }

    try {
      setStandingsLoading(true);
      setStandingsError(null);
      await refreshCupStandings(selectedCup.id);
    } catch (err) {
      console.error('Failed to refresh standings:', err);
      setStandingsError(err.message || 'Failed to refresh standings');
    } finally {
      setStandingsLoading(false);
    }
  };

  const handleToggleScores = async (video) => {
    if (!selectedCup?.id || !video?.queueItemId) {
      return;
    }

    const itemId = video.queueItemId;
    setScoreError(null);

    if (expandedItemId === itemId) {
      setExpandedItemId(null);
      return;
    }

    setExpandedItemId(itemId);

    if (!scoresByItem[itemId]) {
      try {
        setScoreLoadingId(itemId);
        await refreshScoresForItem(selectedCup.id, itemId);
      } catch (err) {
        console.error('Failed to load judge scores:', err);
        setScoreError(err.message || 'Failed to load judge scores');
      } finally {
        setScoreLoadingId(null);
      }
    }
  };

  const standings = standingsByCup[selectedCup?.id] || [];
  const videoSummaries = cupVideoSummaries[selectedCup?.id] || [];

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h4">Cup Management</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Cup
          </Button>
          <Button
            startIcon={<RefreshIcon />}
            onClick={fetchCups}
            disabled={loading}
          >
            Refresh
          </Button>
        </Stack>
      </Stack>
      {selectedCup && (
        <Box mt={4}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
            <Box>
              <Typography variant="h5">
                Standings - {selectedCup.title}
              </Typography>
              {selectedCup.theme && (
                <Typography variant="body2" color="text.secondary">
                  Theme: {selectedCup.theme}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={handleRefreshStandings}
                disabled={standingsLoading}
              >
                Refresh Standings
              </Button>
            </Stack>
          </Stack>

          {standingsLoading && <LinearProgress sx={{ mb: 2 }} />}

          {standingsError && (
            <Alert severity="error" onClose={() => setStandingsError(null)} sx={{ mb: 2 }}>
              {standingsError}
            </Alert>
          )}

          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Rank</TableCell>
                  <TableCell>Submitter</TableCell>
                  <TableCell align="right">Videos</TableCell>
                  <TableCell align="right">Total Score</TableCell>
                  <TableCell align="right">Average</TableCell>
                  <TableCell align="right">Judge Votes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {standings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        align="center"
                        sx={{ py: 2 }}
                      >
                        No standings yet. Lock judge scores to populate rankings.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  standings.map((row) => {
                    const username = getSubmitterUsername(row);

                    return (
                      <TableRow key={row.submitterUsername}>
                        <TableCell>{row.rank}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {username}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{row.videoCount || 0}</TableCell>
                        <TableCell align="right">{formatScore(row.totalScore)}</TableCell>
                        <TableCell align="right">
                          {row.averageScore !== null ? formatScore(row.averageScore) : '--'}
                        </TableCell>
                        <TableCell align="right">{row.judgeCount || 0}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="h6" gutterBottom>
            Video Results
          </Typography>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Video</TableCell>
                  <TableCell>Submitter</TableCell>
                  <TableCell align="right">Average Score</TableCell>
                  <TableCell align="right">Judges</TableCell>
                  <TableCell align="right">Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {videoSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        align="center"
                        sx={{ py: 2 }}
                      >
                        No videos have been scored yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  videoSummaries.map((video) => {
                    const scoreEntry = scoresByItem[video.queueItemId] || null;
                    const judgeScores = Array.isArray(scoreEntry?.scores) ? scoreEntry.scores : [];
                    const averageSummary = scoreEntry?.average || null;
                    const isExpanded = expandedItemId === video.queueItemId;
                    const isFinalizing = finalizingItemId === video.queueItemId;
                    const isLoadingScores = scoreLoadingId === video.queueItemId;
                    const averageDisplay = video.averageScore !== null
                      ? formatScore(video.averageScore)
                      : averageSummary?.average !== undefined
                        ? formatScore(averageSummary.average)
                        : '--';
                    const username = getSubmitterUsername(video);

                    return (
                      <React.Fragment key={video.queueItemId}>
                        <TableRow hover selected={isExpanded}>
                          <TableCell>
                            <Typography variant="subtitle2">
                              {video.title || 'Untitled Video'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Queue #{video.queueItemId} | Video ID {video.videoId}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {username}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{averageDisplay}</TableCell>
                          <TableCell align="right">
                            {video.judgeCount || averageSummary?.count || 0}
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              size="small"
                              label={video.status}
                              color={getStatusColor(video.status)}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                onClick={() => handleToggleScores(video)}
                              >
                                {isExpanded ? 'Hide Scores' : 'View Scores'}
                              </Button>
                              {video.averageScore === null && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  startIcon={<CheckCircleIcon />}
                                  onClick={() => handleFinalizeScore(video)}
                                  disabled={isFinalizing || standingsLoading}
                                >
                                  {isFinalizing ? 'Finalizing...' : 'Finalize'}
                                </Button>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={6} sx={{ p: 0, borderBottom: isExpanded ? 'none' : undefined }}>
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                                {isLoadingScores ? (
                                  <LinearProgress />
                                ) : scoreError ? (
                                  <Alert
                                    severity="error"
                                    onClose={() => setScoreError(null)}
                                    sx={{ mb: 0 }}
                                  >
                                    {scoreError}
                                  </Alert>
                                ) : judgeScores.length === 0 ? (
                                  <Typography variant="body2" color="text.secondary">
                                    No judge scores yet.
                                  </Typography>
                                ) : (
                                  <Stack spacing={1.5}>
                                    {averageSummary && (
                                      <Typography variant="body2" color="text.secondary">
                                        Average {formatScore(averageSummary.average)} | Votes {averageSummary.count}
                                      </Typography>
                                    )}
                                    {judgeScores.map((score) => {
                                      const judgeLabel = score.judgeName
                                        || score.judge?.displayName
                                        || score.judge?.username
                                        || 'Judge';
                                      return (
                                        <Paper key={score.id} variant="outlined" sx={{ p: 1.5 }}>
                                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                              <Typography variant="subtitle2">{judgeLabel}</Typography>
                                              {score.comment && (
                                                <Typography variant="body2" color="text.secondary">
                                                  {score.comment}
                                                </Typography>
                                              )}
                                            </Box>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                              <Chip
                                                label={formatScore(score.score)}
                                                color="primary"
                                                size="small"
                                              />
                                              {score.isLocked && (
                                                <Chip
                                                  label={score.lockType === 'FORCED' ? 'Forced Lock' : 'Locked'}
                                                  size="small"
                                                  color={score.lockType === 'FORCED' ? 'warning' : 'success'}
                                                  variant="outlined"
                                                />
                                              )}
                                            </Stack>
                                          </Stack>
                                        </Paper>
                                      );
                                    })}
                                  </Stack>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {cups.length === 0 && !loading && (
        <Alert severity="info">
          No cups found. Create a cup to start managing judges.
        </Alert>
      )}

      <Stack spacing={2}>
        {cups.map((cup) => (
          <Card key={cup.id}>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="start">
                  <Box flex={1}>
                    <Typography variant="h6" gutterBottom>
                      {cup.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {cup.theme || 'No theme'}
                    </Typography>
                    <Stack direction="row" spacing={1} mt={1}>
                      <Chip
                        label={cup.status}
                        size="small"
                        color={cup.status === 'LIVE' ? 'success' : 'info'}
                      />
                      {cup.isActive && (
                        <Chip 
                          label="ACTIVE FOR VIDEO ASSIGNMENT" 
                          size="small" 
                          color="primary" 
                          variant="outlined"
                        />
                      )}
                      <Chip
                        label={`${cup._count?.queueItems || 0} videos`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={`${cup._count?.judgeScores || 0} scores`}
                        size="small"
                        variant="outlined"
                      />
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      onClick={() => handleViewVideos(cup)}
                      disabled={!cup._count?.queueItems}
                    >
                      View Videos ({cup._count?.queueItems || 0})
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<LinkIcon />}
                      onClick={() => openJudgeLinkDialog(cup)}
                      disabled={cup.status !== 'LIVE'}
                    >
                      Generate Judge Link
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<PeopleIcon />}
                      onClick={() => openManageJudges(cup)}
                      disabled={cup.status !== 'LIVE'}
                    >
                      Manage Judges
                    </Button>
                  </Stack>
                </Stack>
                
                <Divider />
                
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="body2" color="text.secondary">
                    Status:
                  </Typography>
                  <Button
                    size="small"
                    variant={cup.status === 'LIVE' ? 'contained' : 'outlined'}
                    color="success"
                    onClick={() => handleUpdateCupStatus(cup.id, 'LIVE')}
                    disabled={cup.status === 'LIVE' || loading}
                  >
                    Live
                  </Button>
                  <Button
                    size="small"
                    variant={cup.status === 'COMPLETED' ? 'contained' : 'outlined'}
                    color="info"
                    onClick={() => handleUpdateCupStatus(cup.id, 'COMPLETED')}
                    disabled={cup.status === 'COMPLETED' || loading}
                  >
                    Completed
                  </Button>
                  
                  <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                  
                  <Button
                    size="small"
                    variant={cup.isActive ? 'contained' : 'outlined'}
                    color="primary"
                    onClick={() => handleSetActiveCup(cup.id)}
                    disabled={cup.isActive || loading}
                  >
                    {cup.isActive ? 'Active Cup' : 'Set as Active'}
                  </Button>
                  
                  {cup.status !== 'LIVE' && (
                    <Tooltip title="Set status to LIVE to generate judge links">
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        ⓘ Judge links only work for LIVE cups
                      </Typography>
                    </Tooltip>
                  )}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* Generate Judge Link Dialog */}
      <Dialog
        open={linkDialogOpen}
        onClose={handleCloseLinkDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Generate Judge Link
          {selectedCup && (
            <Typography variant="body2" color="text.secondary">
              {selectedCup.title}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {!generatedLink ? (
            <Stack spacing={3} mt={2}>
              <TextField
                label="Judge Name"
                value={judgeName}
                onChange={(e) => setJudgeName(e.target.value)}
                fullWidth
                placeholder="e.g., Judge Alice"
                helperText="This name will be displayed to identify the judge"
                autoFocus
              />
              <TextField
                label="Link Expiration"
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value)}
                fullWidth
                select
                SelectProps={{ native: true }}
                helperText="How long the judge link will be valid"
              >
                <option value="1h">1 hour</option>
                <option value="6h">6 hours</option>
                <option value="24h">24 hours</option>
                <option value="3d">3 days</option>
                <option value="7d">7 days (recommended)</option>
                <option value="30d">30 days</option>
              </TextField>
            </Stack>
          ) : (
            <Stack spacing={2} mt={2}>
              <Alert severity="success">
                Judge link generated successfully!
              </Alert>
              
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Judge Name
                </Typography>
                <Typography variant="body1" gutterBottom>
                  {generatedLink.judgeName}
                </Typography>
                
                <Divider sx={{ my: 2 }} />
                
                <Typography variant="subtitle2" gutterBottom>
                  Judge Link
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    value={generatedLink.url}
                    fullWidth
                    size="small"
                    InputProps={{
                      readOnly: true,
                      sx: { fontFamily: 'monospace', fontSize: '0.85rem' }
                    }}
                  />
                  <Tooltip title="Copy link">
                    <IconButton
                      onClick={() => handleCopyLink(generatedLink.url)}
                      color="primary"
                    >
                      <CopyIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
                
                <Typography variant="caption" color="text.secondary" mt={1} display="block">
                  Valid for: {generatedLink.expiresIn}
                </Typography>
              </Paper>

              <Alert severity="info">
                Share this link with the judge. They can access the judging interface without logging in.
                The link will expire in {generatedLink.expiresIn}.
              </Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {!generatedLink ? (
            <>
              <Button onClick={handleCloseLinkDialog}>Cancel</Button>
              <Button
                onClick={handleGenerateJudgeLink}
                variant="contained"
                disabled={loading || !judgeName.trim()}
              >
                Generate Link
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => setGeneratedLink(null)}
                variant="outlined"
              >
                Generate Another
              </Button>
              <Button onClick={handleCloseLinkDialog} variant="contained">
                Done
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Manage Judges Dialog */}
      <Dialog
        open={judgesDialogOpen}
        onClose={() => { setJudgesDialogOpen(false); setJudgesList([]); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Manage Judges
          {selectedCup && (
            <Typography variant="body2" color="text.secondary">
              {selectedCup.title}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {judgesLoading ? (
            <Alert severity="info">Loading judges...</Alert>
          ) : judgesList.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>No judges found for this cup.</Alert>
          ) : (
            <Stack spacing={2} mt={2}>
              {judgesList.map((j) => (
                <Paper key={j.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="subtitle1">{j.judgeName || (j.judge?.displayName || j.judge?.username) || 'Unnamed'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {j.judgeTokenId || j.judge?.id || 'account'} • {j.status}
                        {j.startedAt && ` • started ${new Date(j.startedAt).toLocaleString()}`}
                        {j.endedAt && ` • ended ${new Date(j.endedAt).toLocaleString()}`}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<BlockIcon />}
                        onClick={() => handleRevokeJudge(j.judgeTokenId || j.judge?.id)}
                      >
                        Revoke
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<ReplayIcon />}
                        onClick={() => handleRegenerateJudge(j.judgeTokenId || j.judge?.id)}
                      >
                        Regenerate
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setJudgesDialogOpen(false); setJudgesList([]); }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Create Cup Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={handleCloseCreateDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Cup</DialogTitle>
        <DialogContent>
          <Stack spacing={3} mt={2}>
            <TextField
              label="Cup Title"
              value={cupTitle}
              onChange={handleTitleChange}
              fullWidth
              placeholder="e.g., Spring 2025 Tournament"
              helperText="The display name for this cup"
              autoFocus
              required
            />
            <TextField
              label="Slug"
              value={cupSlug}
              onChange={(e) => setCupSlug(e.target.value)}
              fullWidth
              placeholder="e.g., spring-2025-tournament"
              helperText="URL-friendly identifier (auto-generated from title)"
              required
            />
            <TextField
              label="Theme (Optional)"
              value={cupTheme}
              onChange={(e) => setCupTheme(e.target.value)}
              fullWidth
              placeholder="e.g., Best Speedruns"
              helperText="Optional theme or category for this cup"
            />
            <TextField
              label="Status"
              value={cupStatus}
              onChange={(e) => setCupStatus(e.target.value)}
              fullWidth
              select
              SelectProps={{ native: true }}
              helperText="Cup status - LIVE allows judge links"
            >
              <option value="LIVE">Live (Active Show)</option>
              <option value="COMPLETED">Completed (Archived)</option>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateDialog}>Cancel</Button>
          <Button
            onClick={handleCreateCup}
            variant="contained"
            disabled={loading || !cupTitle.trim() || !cupSlug.trim()}
          >
            Create Cup
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Cup Videos Dialog */}
      <Dialog
        open={videosDialogOpen}
        onClose={() => setVideosDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Cup Videos
          {selectedCup && (
            <Typography variant="body2" color="text.secondary">
              {selectedCup.title}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {cupVideos.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              No videos assigned to this cup yet.
            </Alert>
          ) : (
            <Stack spacing={2} mt={2}>
              {cupVideos.map((video) => (
                <Card key={video.id} variant="outlined">
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="start">
                      {video.thumbnailUrl && (
                        <Box
                          component="img"
                          src={video.thumbnailUrl}
                          alt={video.title}
                          sx={{
                            width: 120,
                            height: 90,
                            objectFit: 'cover',
                            borderRadius: 1,
                          }}
                        />
                      )}
                      <Box flex={1}>
                        <Typography variant="subtitle1" gutterBottom>
                          {video.title}
                        </Typography>
                        <Stack direction="row" spacing={1} mb={1}>
                          <Chip
                            label={`By ${getSubmitterUsername(video)}`}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            label={video.status}
                            size="small"
                            color={video.status === 'PLAYED' ? 'success' : 'default'}
                          />
                          {video.judgeScores && video.judgeScores.length > 0 && (
                            <Chip
                              label={`${video.judgeScores.length} scores`}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          )}
                        </Stack>
                        {video.playedAt && (
                          <Typography variant="caption" color="text.secondary">
                            Played: {new Date(video.playedAt).toLocaleString()}
                          </Typography>
                        )}
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        onClick={() => handleUnassignVideo(selectedCup.id, video.id)}
                        disabled={loading}
                      >
                        Unassign
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVideosDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />
    </Box>
  );
};

export default CupAdmin;
