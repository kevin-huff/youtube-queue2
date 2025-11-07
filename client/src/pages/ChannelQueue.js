import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Container,
  Divider,
  Grid,
  LinearProgress,
  CircularProgress,
  Stack,
  TextField,
  Switch,
  FormControlLabel,
  MenuItem,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
  useTheme
} from '@mui/material';
import {
  AccessTime,
  EmojiEvents,
  LiveTv,
  Person,
  QueueMusic,
  Refresh,
  Shuffle,
  SkipNext,
  PlayArrow,
  Visibility,
  Equalizer,
  CheckCircle,
  Cancel,
  Lock as LockIcon,
  Timeline as TimelineIcon,
  Delete as DeleteIcon,
  WarningAmber
} from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';
import { useSyncedYouTubePlayer } from '../hooks/useSyncedYouTubePlayer';
import PlayerControlPanel from '../components/PlayerControlPanel';
import PrecisionSlider from '../components/PrecisionSlider';
import { useAuth } from '../contexts/AuthContext';

const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) {
    return 'N/A';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatTimestamp = (seconds) => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatModerationTimestamp = (value) => {
  if (!value) {
    return 'Just now';
  }

  try {
    const date = new Date(value);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return value;
  }
};

const getQueueAlias = (item) =>
  item?.submitterAlias || item?.submitter?.alias || 'Anonymous';

const QueueItem = ({
  video,
  index,
  isPlaying = false,
  isTopEight = false,
  isVip = false,
  canManageVip = false,
  onToggleVip = null,
  vipActionInFlight = false
}) => {
  const theme = useTheme();
  const showWarning = video.moderationStatus === 'WARNING';
  const showApproval = video.moderationStatus !== 'WARNING' && Boolean(video.moderatedBy);
  const showAutoApproval = video.moderationStatus !== 'WARNING' && !video.moderatedBy;

  const highlightColor = isPlaying
    ? theme.palette.primary.main
    : isTopEight
      ? theme.palette.secondary.main
      : showWarning
        ? theme.palette.warning.main
        : null;

  return (
    <ListItem
      sx={{
        bgcolor: highlightColor ? alpha(highlightColor, 0.08) : 'background.paper',
        mb: 1,
        borderRadius: 1,
        border: highlightColor
          ? `1.5px solid ${alpha(highlightColor, 0.7)}`
          : `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        boxShadow: highlightColor ? theme.shadows[4] : 'none',
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
        primaryTypographyProps={{ component: 'div' }}
        secondaryTypographyProps={{ component: 'div' }}
        primary={
          <Typography variant="subtitle1" component="div" noWrap fontWeight={600}>
            {video.title}
          </Typography>
        }
        secondary={
          <Stack component="div" spacing={0.75} mt={0.5}>
            <Box component="div" display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
              <Chip
                size="small"
                icon={<Person />}
                label={getQueueAlias(video)}
                variant="outlined"
              />
              <Chip
                size="small"
                icon={<AccessTime />}
                label={formatDuration(video.duration)}
                variant="outlined"
              />
              {isTopEight && (
                <Chip
                  size="small"
                  icon={<EmojiEvents sx={{ fontSize: 16 }} />}
                  label="Top 8"
                  color="secondary"
                  variant="outlined"
                />
              )}
              {isPlaying && (
                <Chip
                  size="small"
                  label="Now"
                  color="primary"
                />
              )}
              {showWarning && (
                <Chip
                  size="small"
                  color="warning"
                  icon={<WarningAmber sx={{ fontSize: 16 }} />}
                  label="Warning"
                />
              )}
              {showApproval && (
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  icon={<CheckCircle sx={{ fontSize: 16 }} />}
                  label="Cleared"
                />
              )}
              {showAutoApproval && (
                <Chip
                  size="small"
                  color="success"
                  icon={<CheckCircle sx={{ fontSize: 16 }} />}
                  label="Auto‑cleared"
                />
              )}
            </Box>

            {showWarning && (
              <Alert
                severity="warning"
                icon={<WarningAmber fontSize="inherit" />}
                sx={{
                  mt: 0.25,
                  py: 0.75,
                  '& .MuiAlert-message': {
                    width: '100%'
                  }
                }}
              >
                <Typography variant="caption" fontWeight={600} display="block">
                  Flagged by {video.moderatedByDisplayName || video.moderatedBy || 'Moderator'}
                  {video.moderatedAt ? ` — ${formatModerationTimestamp(video.moderatedAt)}` : ''}
                </Typography>
                {video.moderationNote && (
                  <Typography variant="caption" display="block">
                    {video.moderationNote}
                  </Typography>
                )}
              </Alert>
            )}

            {showApproval && (
              <Typography variant="caption" color="success.main">
                Approved by {video.moderatedByDisplayName || video.moderatedBy}
                {video.moderatedAt ? ` — ${formatModerationTimestamp(video.moderatedAt)}` : ''}
                {video.moderationNote ? ` — ${video.moderationNote}` : ''}
              </Typography>
            )}
            {showAutoApproval && (
              <Typography variant="caption" color="text.secondary">
                Auto‑approved
              </Typography>
            )}

            {/* VIP indicator + action */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
              {isVip && (
                <Chip
                  size="small"
                  color="secondary"
                  label="VIP"
                />
              )}
              {canManageVip && typeof onToggleVip === 'function' && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => onToggleVip(video.id, isVip ? 'UNVIP' : 'VIP')}
                  disabled={vipActionInFlight}
                >
                  {isVip ? 'Un-VIP' : 'VIP'}
                </Button>
              )}
            </Box>
          </Stack>
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

const formatScoreValue = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(5);
};

const ROLE_LABELS = {
  PRODUCER: 'Producer',
  HOST: 'Host',
  JUDGE: 'Judge',
  MODERATOR: 'Moderator'
};

const ROLE_OPTIONS = [
  { value: 'PRODUCER', label: ROLE_LABELS.PRODUCER },
  { value: 'HOST', label: ROLE_LABELS.HOST },
  { value: 'JUDGE', label: ROLE_LABELS.JUDGE },
  { value: 'MODERATOR', label: ROLE_LABELS.MODERATOR }
];

const VOTING_STAGE_META = {
  collecting: {
    label: 'Collecting Scores',
    accent: '#5ce1ff'
  },
  revealing: {
    label: 'Judge Reveal',
    accent: '#ff89df'
  },
  average: {
    label: 'Average Reveal',
    accent: '#7dffb3'
  },
  social: {
    label: 'Social Score Reveal',
    accent: '#ffd166'
  },
  completed: {
    label: 'Final Score',
    accent: '#a890ff'
  }
};

const describeJudgeStatus = (judge) => {
  if (!judge) {
    return { label: 'Pending', color: 'default' };
  }

  if (judge.revealStatus === 'revealed') {
    return { label: 'Revealed', color: 'secondary' };
  }

  if (judge.revealStatus === 'skipped') {
    return { label: 'Excluded', color: 'warning' };
  }

  if (judge.locked) {
    return { label: 'Locked', color: 'success' };
  }

  if (typeof judge.score === 'number') {
    return { label: 'Scored', color: 'info' };
  }

  if (judge.connected === false) {
    return { label: 'Offline', color: 'default' };
  }

  return { label: 'Waiting', color: 'default' };
};

const ChannelQueue = ({ channelName: channelNameProp, embedded = false }) => {
  const { channelName: channelNameParam } = useParams();
  const channelName = channelNameProp || channelNameParam;
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingSeek, setPendingSeek] = useState(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [shuffleLoading, setShuffleLoading] = useState(false);
  const [shuffleError, setShuffleError] = useState(null);
  const [shuffleFeedback, setShuffleFeedback] = useState(null);
  const theme = useTheme();
  const { hasChannelRole, user } = useAuth();

  const {
    connectToChannel,
    disconnectFromChannel,
    queue,
    currentlyPlaying,
    queueEnabled,
    channelConnected,
    topEight,
    lastShuffle,
    playNext,
    skipCurrent,
    playOverlay,
    pauseOverlay,
    seekOverlay,
    addChannelListener,
    removeChannelListener,
    triggerShuffle,
    settings,
    cupStandings,
    refreshCupStandings,
    votingState,
    startVotingSession,
    cancelVotingSession,
    revealNextJudge,
    revealAverageScore,
    revealSocialScore,
    completeVotingSession,
    showOverlayPlayer,
    hideOverlayPlayer,
    overlayShowPlayer,
    vipQueue,
    emitToChannel
  } = useSocket();

  const [activeCupId, setActiveCupId] = useState(null);
  const [cupInfo, setCupInfo] = useState(null);
  const [roleAssignments, setRoleAssignments] = useState([]);
  const [owners, setOwners] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState(null);
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [rolesNotice, setRolesNotice] = useState(null);
  const [newRoleUsername, setNewRoleUsername] = useState('');
  const [newRoleType, setNewRoleType] = useState('PRODUCER');
  const [newManagerUsername, setNewManagerUsername] = useState('');
  const [managerSubmitting, setManagerSubmitting] = useState(false);
  const [votingError, setVotingError] = useState(null);
  const [votingAction, setVotingAction] = useState(null);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [forceLockLoading, setForceLockLoading] = useState(false);

  // Host-only judge controls (embedded slider on producer page)
  // Visible and active only when the user has the HOST role for this channel
  const [hostJudgeToken, setHostJudgeToken] = useState(null);
  const [hostJudgeScore, setHostJudgeScore] = useState(2.5);
  const [hostJudgeLocked, setHostJudgeLocked] = useState(false);
  const [hostJudgeBusy, setHostJudgeBusy] = useState(false);
  const [hostJudgeError, setHostJudgeError] = useState(null);

  const normalizedChannelId = channelName?.toLowerCase();

  // VIP management state
  const [vipActionId, setVipActionId] = useState(null);
  const [vipError, setVipError] = useState(null);

  const {
    containerRef,
    playLocal,
    pauseLocal,
    seekLocal,
    setVolume: setPlayerVolume,
    toggleMute,
    currentTime,
    duration,
    volume,
    muted,
    hasVideo
  } = useSyncedYouTubePlayer({
    videoId: currentlyPlaying?.videoId,
    channelConnected,
    addChannelListener,
    removeChannelListener,
    initialVolume: 0,
    defaultMuted: true,
    autoPlayOnReady: false,
    onLocalPlay: playOverlay,
    onLocalPause: pauseOverlay,
    onLocalSeek: seekOverlay
  });

  const currentCupId = useMemo(() => (
    currentlyPlaying?.cupId
    || votingState?.cupId
    || settings?.activeCupId
    || activeCupId
    || null
  ), [currentlyPlaying?.cupId, votingState?.cupId, settings?.activeCupId, activeCupId]);

  const votingStageMeta = useMemo(() => (
    VOTING_STAGE_META[votingState?.stage || 'collecting'] || VOTING_STAGE_META.collecting
  ), [votingState?.stage]);

  const votingJudges = useMemo(() => {
    if (!votingState || !Array.isArray(votingState.judges)) {
      return [];
    }
    return [...votingState.judges].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [votingState]);

  // VIP ordering helpers (mirror overlay behavior)
  const vipIndexMap = useMemo(() => {
    try {
      const ids = Array.isArray(vipQueue) ? vipQueue.map((v) => Number(v)) : [];
      return new Map(ids.map((id, idx) => [id, idx]));
    } catch (_) {
      return new Map();
    }
  }, [vipQueue]);

  const sortedQueue = useMemo(() => {
    const items = queue.slice();

    const isVip = (id) => vipIndexMap.has(Number(id));
    const vipPos = (id) => vipIndexMap.get(Number(id));

    return items.sort((a, b) => {
      // 1) Currently playing always first
      const aNow = currentlyPlaying?.id === a.id;
      const bNow = currentlyPlaying?.id === b.id;
      if (aNow && !bNow) return -1;
      if (bNow && !aNow) return 1;

      // 2) VIPs next, FIFO using vipQueue order
      const aVip = isVip(a.id);
      const bVip = isVip(b.id);
      if (aVip && !bVip) return -1;
      if (bVip && !aVip) return 1;
      if (aVip && bVip) return vipPos(a.id) - vipPos(b.id);

      // 3) Top Eight after VIPs
      const aTop = a.status === 'TOP_EIGHT';
      const bTop = b.status === 'TOP_EIGHT';
      if (aTop && !bTop) return -1;
      if (bTop && !aTop) return 1;

      // 4) Fallback by position
      const apos = a.position ?? Number.MAX_SAFE_INTEGER;
      const bpos = b.position ?? Number.MAX_SAFE_INTEGER;
      return apos - bpos;
    });
  }, [queue, currentlyPlaying, vipIndexMap]);

  const unrevealedJudges = useMemo(() => (
    votingJudges.filter((judge) => !['revealed', 'skipped'].includes(judge.revealStatus))
  ), [votingJudges]);

  const revealReadyJudge = useMemo(() => (
    unrevealedJudges.find((judge) => judge.locked && typeof judge.score === 'number') || null
  ), [unrevealedJudges]);

  const allScoredRevealed = useMemo(() => (
    votingJudges
      .filter((judge) => typeof judge.score === 'number')
      .every((judge) => judge.revealStatus === 'revealed')
  ), [votingJudges]);

  const isVotingActive = Boolean(
    votingState
    && votingState.stage !== 'completed'
    && votingState.stage !== 'cancelled'
  );

  const isVotingForCurrentItem = Boolean(
    votingState && currentlyPlaying?.id && votingState.queueItemId === currentlyPlaying.id
  );

  const canRevealAverage = Boolean(
    votingState
    && !votingState.revealedAverage
    && typeof votingState.computedAverage === 'number'
    && allScoredRevealed
    && votingJudges.length > 0
  );

  const canRevealSocial = Boolean(
    votingState
    && votingState.revealedAverage
    && !votingState.revealedSocial
  );

  const canFinalizeScore = Boolean(
    votingState
    && votingState.revealedAverage
    && votingState.revealedSocial
  );

  const canForceLockVotes = Boolean(
    votingState && votingJudges.some((judge) => !judge.locked && typeof judge.score === 'number')
  );

  // Shared styling for action buttons in Voting Control
  const actionBtnSx = { minWidth: 160, borderRadius: 12 / 8, textTransform: 'none', fontWeight: 600 };

  // One-host-judge token key (per cup) so multiple producers share the same judge
  const hostTokenKey = useMemo(() => (
    currentCupId ? `host_judge_token_${currentCupId}` : null
  ), [currentCupId]);

  const handleStartVoting = useCallback(async () => {
    if (!currentlyPlaying?.id) {
      setVotingError('You need a video playing to start voting.');
      return;
    }

    if (!currentCupId) {
      setVotingError('Assign this video to a cup before starting voting.');
      return;
    }

    try {
      setVotingError(null);
      setVotingAction('start');
      await startVotingSession(currentlyPlaying.id, currentCupId);
    } catch (error) {
      setVotingError(error.message || 'Failed to start voting');
    } finally {
      setVotingAction(null);
    }
  }, [currentlyPlaying, currentCupId, startVotingSession]);

  const handleCancelVoting = useCallback(async () => {
    if (!votingState) {
      return;
    }

    try {
      setVotingError(null);
      setVotingAction('cancel');
      await cancelVotingSession(votingState.queueItemId, votingState.cupId, {
        reason: 'cancelled'
      });
    } catch (error) {
      setVotingError(error.message || 'Failed to cancel voting');
    } finally {
      setVotingAction(null);
    }
  }, [votingState, cancelVotingSession]);

  const handleRevealNext = useCallback(async () => {
    if (!votingState) {
      return;
    }

    try {
      setVotingError(null);
      setVotingAction('reveal-next');
      await revealNextJudge(votingState.queueItemId, votingState.cupId);
    } catch (error) {
      setVotingError(error.message || 'Failed to reveal judge');
    } finally {
      setVotingAction(null);
    }
  }, [votingState, revealNextJudge]);

  const handleRevealAverage = useCallback(async () => {
    if (!votingState) {
      return;
    }

    try {
      setVotingError(null);
      setVotingAction('reveal-average');
      await revealAverageScore(votingState.queueItemId, votingState.cupId);
    } catch (error) {
      setVotingError(error.message || 'Failed to reveal average');
    } finally {
      setVotingAction(null);
    }
  }, [votingState, revealAverageScore]);

  const handleRevealSocial = useCallback(async () => {
    if (!votingState) {
      return;
    }

    try {
      setVotingError(null);
      setVotingAction('reveal-social');
      await revealSocialScore(votingState.queueItemId, votingState.cupId);
    } catch (error) {
      setVotingError(error.message || 'Failed to reveal social score');
    } finally {
      setVotingAction(null);
    }
  }, [votingState, revealSocialScore]);

  const handleForceLock = useCallback(async () => {
    if (!votingState || !normalizedChannelId) {
      return;
    }

    try {
      setVotingError(null);
      setForceLockLoading(true);
      const response = await fetch(
        `/api/channels/${normalizedChannelId}/cups/${votingState.cupId}/items/${votingState.queueItemId}/force-lock`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to force-lock votes');
      }
    } catch (error) {
      setVotingError(error.message || 'Failed to force-lock votes');
    } finally {
      setForceLockLoading(false);
    }
  }, [votingState, normalizedChannelId]);

  const handleFinalizeScore = useCallback(async () => {
    if (!votingState || !normalizedChannelId) {
      return;
    }

    try {
      setVotingError(null);
      setFinalizeLoading(true);
      const response = await fetch(
        `/api/channels/${normalizedChannelId}/cups/${votingState.cupId}/items/${votingState.queueItemId}/finalize`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to finalize score');
      }

      // Ensure local state reflects completion even before socket echo
      await completeVotingSession(votingState.queueItemId, votingState.cupId, {
        reason: 'finalized'
      }).catch(() => {});
    } catch (error) {
      setVotingError(error.message || 'Failed to finalize score');
    } finally {
      setFinalizeLoading(false);
    }
  }, [votingState, normalizedChannelId, completeVotingSession]);

  const nextJudgeName = revealReadyJudge?.name || null;

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
    connectToChannel(channelName, { explicit: true });
    return () => {
      disconnectFromChannel();
    };
  }, [channelName, connectToChannel, disconnectFromChannel]);

  // Get active cup from settings or queue items
  useEffect(() => {
    if (settings?.activeCupId) {
      setActiveCupId(settings.activeCupId);
    } else if (queue.length > 0) {
      const cupId = queue.find(item => item.cupId)?.cupId;
      if (cupId) {
        setActiveCupId(cupId);
      }
    }
  }, [settings, queue]);

  // Fetch cup info when activeCupId changes
  useEffect(() => {
    if (!activeCupId) {
      setCupInfo(null);
      return;
    }

    const fetchCupInfo = async () => {
      try {
        // Refresh standings to get cup info (this works via socket)
        await refreshCupStandings(activeCupId);
        
        // Cup title/theme will come from socket events or can be inferred from standings data
        // No need to make a separate API call that might fail
      } catch (error) {
        console.error('Failed to fetch cup standings:', error);
      }
    };

    fetchCupInfo();
  }, [activeCupId, normalizedChannelId, refreshCupStandings]);

  useEffect(() => {
    setPendingSeek(null);
    setIsSeeking(false);
  }, [currentlyPlaying?.id]);

  useEffect(() => {
    if (!shuffleFeedback) return undefined;
    const timer = setTimeout(() => setShuffleFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [shuffleFeedback]);

  const totalDuration = useMemo(() => {
    return queue.reduce((sum, item) => sum + (item.duration || 0), 0);
  }, [queue]);

  const derivedTopEight = useMemo(() => {
    if (Array.isArray(topEight) && topEight.length) {
      return topEight;
    }
    return queue
      .filter((item) => item.status === 'TOP_EIGHT')
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .slice(0, 8);
  }, [topEight, queue]);

  const lastShuffleDate = useMemo(() => {
    if (!lastShuffle?.timestamp) {
      return null;
    }
    const parsed = new Date(lastShuffle.timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [lastShuffle]);

  const currentStandings = useMemo(() => {
    return activeCupId ? cupStandings[activeCupId] : null;
  }, [activeCupId, cupStandings]);

  // Channel owners/managers and show producers/hosts can operate playback
  const canOperatePlayback = hasChannelRole(normalizedChannelId, ['OWNER', 'MANAGER', 'PRODUCER', 'HOST']);
  const canManageRoles = hasChannelRole(normalizedChannelId, ['OWNER', 'MANAGER']);
  const canManageVip = hasChannelRole(normalizedChannelId, ['OWNER', 'MANAGER', 'PRODUCER']);

  const loadRoles = useCallback(async () => {
    if (!canManageRoles || !normalizedChannelId) {
      return;
    }

    try {
      setRolesLoading(true);
      setRolesError(null);

      const response = await fetch(`/api/channels/${normalizedChannelId}/roles`, {
        credentials: 'include'
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load channel roles');
      }

      setRoleAssignments(Array.isArray(payload.roles) ? payload.roles : []);
      setOwners(Array.isArray(payload.owners) ? payload.owners : []);
    } catch (error) {
      console.error('Failed to load channel roles:', error);
      setRolesError(error.message || 'Failed to load channel roles');
      setRoleAssignments([]);
      setOwners([]);
    } finally {
      setRolesLoading(false);
    }
  }, [canManageRoles, normalizedChannelId]);

  useEffect(() => {
    if (!canManageRoles || !normalizedChannelId) {
      setRoleAssignments([]);
      setOwners([]);
      return;
    }

    loadRoles();
  }, [canManageRoles, normalizedChannelId, loadRoles]);

  const handleAddRole = useCallback(async () => {
    if (!canManageRoles || !normalizedChannelId) {
      return;
    }

    const trimmed = newRoleUsername.trim();
    if (!trimmed) {
      setRolesError('Enter a username to assign a role');
      return;
    }

    try {
      setRoleSubmitting(true);
      setRolesError(null);
      setRolesNotice(null);

      const response = await fetch(`/api/channels/${normalizedChannelId}/roles`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: trimmed,
          role: newRoleType
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to assign role');
      }
      if (payload && payload.invite) {
        // Invite flow: user doesn't have an account yet
        setRolesNotice(
          `Invite created for @${payload.invite.invitedUsername}. They will be granted ${payload.invite.role} on first login.`
        );
        setNewRoleUsername('');
        await loadRoles();
        return;
      }

      setNewRoleUsername('');
      await loadRoles();
    } catch (error) {
      console.error('Failed to assign channel role:', error);
      setRolesError(error.message || 'Failed to assign role');
    } finally {
      setRoleSubmitting(false);
    }
  }, [canManageRoles, normalizedChannelId, newRoleUsername, newRoleType, loadRoles]);

  const handleRemoveRole = useCallback(async (assignmentId) => {
    if (!canManageRoles || !normalizedChannelId || !assignmentId) {
      return;
    }

    try {
      setRoleSubmitting(true);
      setRolesError(null);

      const response = await fetch(`/api/channels/${normalizedChannelId}/roles/${assignmentId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to remove role');
      }

      await loadRoles();
    } catch (error) {
      console.error('Failed to remove channel role:', error);
      setRolesError(error.message || 'Failed to remove role');
    } finally {
      setRoleSubmitting(false);
    }
  }, [canManageRoles, normalizedChannelId, loadRoles]);

  const handleRoleFormSubmit = useCallback((event) => {
    event.preventDefault();
    if (!roleSubmitting) {
      void handleAddRole();
    }
  }, [handleAddRole, roleSubmitting]);

  const handleAddManager = useCallback(async () => {
    if (!canManageRoles || !normalizedChannelId) {
      return;
    }
    const trimmed = newManagerUsername.trim();
    if (!trimmed) {
      setRolesError('Enter a username to grant manager permissions');
      return;
    }
    try {
      setManagerSubmitting(true);
      setRolesError(null);
      const response = await fetch(`/api/channels/${normalizedChannelId}/owners`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed, role: 'MANAGER' })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to add manager');
      }
      setNewManagerUsername('');
      await loadRoles();
    } catch (error) {
      console.error('Failed to add manager:', error);
      setRolesError(error.message || 'Failed to add manager');
    } finally {
      setManagerSubmitting(false);
    }
  }, [canManageRoles, normalizedChannelId, newManagerUsername, loadRoles]);

  const handleRemoveManager = useCallback(async (ownerId) => {
    if (!canManageRoles || !normalizedChannelId || !ownerId) {
      return;
    }
    try {
      setManagerSubmitting(true);
      setRolesError(null);
      const response = await fetch(`/api/channels/${normalizedChannelId}/owners/${ownerId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to remove manager');
      }
      await loadRoles();
    } catch (error) {
      console.error('Failed to remove manager:', error);
      setRolesError(error.message || 'Failed to remove manager');
    } finally {
      setManagerSubmitting(false);
    }
  }, [canManageRoles, normalizedChannelId, loadRoles]);

  const votingMetrics = votingState?.metrics || {
    totalJudges: votingJudges.length,
    submitted: 0,
    locked: 0
  };

  const startDisabled = votingAction === 'start'
    || !canOperatePlayback
    || !currentlyPlaying?.id
    || !currentCupId
    || (isVotingActive && !isVotingForCurrentItem);

  const cancelDisabled = votingAction === 'cancel'
    || !canOperatePlayback
    || !isVotingActive;

  const revealNextDisabled = votingAction === 'reveal-next'
    || !canOperatePlayback
    || !revealReadyJudge;

  const revealAverageDisabled = votingAction === 'reveal-average'
    || !canOperatePlayback
    || !canRevealAverage;

  const revealSocialDisabled = votingAction === 'reveal-social'
    || !canOperatePlayback
    || !canRevealSocial;

  const finalizeDisabled = finalizeLoading
    || !canOperatePlayback
    || !canFinalizeScore;

  const forceLockDisabled = forceLockLoading
    || !canOperatePlayback
    || !canForceLockVotes;

  const showVotingPanel = canOperatePlayback || Boolean(votingState);

  const resolvedDuration = typeof duration === 'number' && duration > 0 ? duration : 0;
  const sliderDisabled = !channelConnected || !hasVideo || resolvedDuration === 0 || !canOperatePlayback;
  const displayTime = isSeeking && typeof pendingSeek === 'number'
    ? pendingSeek
    : (typeof currentTime === 'number' ? currentTime : 0);
  const sliderValue = resolvedDuration > 0
    ? Math.min(Math.max(displayTime, 0), resolvedDuration)
    : 0;

  const handleSeekChange = (_, value) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next !== 'number' || Number.isNaN(next)) {
      return;
    }
    if (sliderDisabled || !canOperatePlayback) {
      return;
    }
    setIsSeeking(true);
    setPendingSeek(Math.max(0, next));
  };

  const handleVipAction = useCallback(async (itemId, action) => {
    if (!normalizedChannelId || !itemId) {
      return;
    }
    try {
      setVipError(null);
      setVipActionId(itemId);
      const response = await fetch(`/api/channels/${normalizedChannelId}/submissions/${itemId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update VIP');
      }
      // Socket will emit updated VIP list; no local mutation needed
    } catch (error) {
      console.error('VIP action failed:', error);
      setVipError(error.message || 'Failed to update VIP');
    } finally {
      setVipActionId(null);
    }
  }, [normalizedChannelId]);

  const handleSeekCommit = (_, value) => {
    const next = Array.isArray(value) ? value[0] : value;
    setIsSeeking(false);
    setPendingSeek(null);

    if (sliderDisabled || !canOperatePlayback || typeof next !== 'number' || Number.isNaN(next)) {
      return;
    }

    const targetTime = Math.min(Math.max(next, 0), resolvedDuration);
    seekLocal(targetTime);
  };

  const volumeSliderDisabled = !channelConnected || !hasVideo || !canOperatePlayback;
  const normalizedVolume = typeof volume === 'number' ? volume : 0;
  const volumeSliderValue = muted ? 0 : normalizedVolume;
  const volumeLabel = muted ? 'Muted' : `${Math.round(normalizedVolume)}%`;
  const playDisabled = !canOperatePlayback || !channelConnected || !hasVideo;
  const pauseDisabled = playDisabled;
  const showOverlayDisabled = !canOperatePlayback || !hasVideo || isVotingActive;
  const hideOverlayDisabled = !canOperatePlayback || !hasVideo;

  // Next Ad schedule (producers/owners)
  const [nextAdAt, setNextAdAt] = useState(null); // ms epoch
  const [nextAdDuration, setNextAdDuration] = useState(null);
  const [adLive, setAdLive] = useState(null);
  const [adLoading, setAdLoading] = useState(false);
  const [adError, setAdError] = useState(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const [adUpdatedAt, setAdUpdatedAt] = useState(null);

  const refreshNextAd = useCallback(async () => {
    if (!channel?.id || !canOperatePlayback) return;
    try {
      setAdLoading(true);
      setAdError(null);
      const res = await axios.get(`/api/channels/${channel.id}/ads/next`, { withCredentials: true });
      const { nextAdAt: iso, duration, live } = res.data || {};
      setAdLive(live === null ? null : Boolean(live));
      setNextAdDuration(typeof duration === 'number' ? duration : null);
      setNextAdAt(iso ? new Date(iso).getTime() : null);
      setAdUpdatedAt(Date.now());
    } catch (err) {
      setAdError(err?.response?.data?.error || err?.message || 'Failed to load ad schedule');
      setAdLive(null);
      setNextAdAt(null);
      setNextAdDuration(null);
    } finally {
      setAdLoading(false);
    }
  }, [channel?.id, canOperatePlayback]);

  useEffect(() => {
    refreshNextAd();
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    const p = setInterval(refreshNextAd, 60 * 1000);
    return () => { clearInterval(t); clearInterval(p); };
  }, [refreshNextAd]);

  const adCountdown = useMemo(() => {
    if (!nextAdAt || !adLive) return null;
    const ms = Math.max(0, nextAdAt - nowTs);
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` : `${m}:${s.toString().padStart(2,'0')}`;
  }, [nextAdAt, nowTs, adLive]);

  const handleVolumeChange = (_, value) => {
    const next = Array.isArray(value) ? value[0] : value;
    if (typeof next !== 'number' || Number.isNaN(next)) {
      return;
    }
    if (!canOperatePlayback) {
      return;
    }
    setPlayerVolume(next);
  };

  const handleVolumeToggle = () => {
    if (!canOperatePlayback) {
      return;
    }
    toggleMute();
  };

  const handlePlay = () => {
    if (!canOperatePlayback || !hasVideo) {
      return;
    }
    const time = typeof currentTime === 'number' && !Number.isNaN(currentTime) ? currentTime : 0;
    playLocal(time);
  };

  const handlePause = () => {
    if (!canOperatePlayback || !hasVideo) {
      return;
    }
    const time = typeof currentTime === 'number' && !Number.isNaN(currentTime) ? currentTime : 0;
    pauseLocal(time);
  };

  // On initial mount with a current video, sync to server player state instead of auto-playing
  useEffect(() => {
    if (!channelConnected || !currentlyPlaying?.videoId) {
      return undefined;
    }

    const stateHandler = (state = {}) => {
      removeChannelListener('player:state_response', stateHandler);
      try {
        const t = typeof state.time === 'number' && !Number.isNaN(state.time) ? state.time : undefined;
        if (typeof t === 'number') {
          seekLocal(t, { source: 'remote' });
          if (state.playing) {
            playLocal(t, { source: 'remote' });
          } else {
            pauseLocal(t, { source: 'remote' });
          }
        }
      } catch (_) { /* noop */ }
    };

    addChannelListener('player:state_response', stateHandler);
    // Ask the server for the current player state
    try {
      emitToChannel('player:state_request');
    } catch (_) { /* noop */ }

    // Fallback cleanup in case response never arrives
    const timeout = setTimeout(() => removeChannelListener('player:state_response', stateHandler), 5000);
    return () => {
      clearTimeout(timeout);
      removeChannelListener('player:state_response', stateHandler);
    };
  }, [channelConnected, currentlyPlaying?.videoId, addChannelListener, removeChannelListener, seekLocal, playLocal, pauseLocal, emitToChannel]);

  // When the tab becomes visible again, resync local player to server state without broadcasting
  useEffect(() => {
    if (!channelConnected) return undefined;

    const onVis = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!currentlyPlaying?.videoId) return;

      const handler = (state = {}) => {
        removeChannelListener('player:state_response', handler);
        try {
          const t = typeof state.time === 'number' && !Number.isNaN(state.time) ? state.time : undefined;
          if (typeof t === 'number') {
            seekLocal(t, { source: 'remote' });
            if (state.playing) {
              playLocal(t, { source: 'remote' });
            } else {
              pauseLocal(t, { source: 'remote' });
            }
          }
        } catch (_) { /* noop */ }
      };

      addChannelListener('player:state_response', handler);
      try { emitToChannel('player:state_request'); } catch (_) {}
      setTimeout(() => removeChannelListener('player:state_response', handler), 5000);
    };

    try {
      document.addEventListener('visibilitychange', onVis, { passive: true });
    } catch (_) {}

    return () => {
      try { document.removeEventListener('visibilitychange', onVis); } catch (_) {}
    };
  }, [channelConnected, currentlyPlaying?.videoId, addChannelListener, removeChannelListener, seekLocal, playLocal, pauseLocal, emitToChannel]);

  const handlePlayNext = () => {
    if (!canOperatePlayback) {
      return;
    }
    playNext();
  };

  // Host/Producer judge token + actions
  const ensureHostJudgeToken = useCallback(async () => {
    if (!normalizedChannelId || !currentCupId || !user?.id) return;
    try {
      setHostJudgeError(null);

      // 1) Prefer a shared token saved in channel settings so every producer uses the same judge
      if (hostTokenKey && settings && typeof settings[hostTokenKey] === 'string' && settings[hostTokenKey]) {
        setHostJudgeToken(settings[hostTokenKey]);
        return;
      }

      // 2) No shared token yet — generate one and persist to channel settings
      const res = await fetch(`/api/channels/${normalizedChannelId}/cups/${currentCupId}/judges/${user.id}/regenerate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judgeName: normalizedChannelId })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Failed to prepare judge controls');

      const token = payload.token;
      setHostJudgeToken(token);
      setHostJudgeLocked(false);

      // Persist as channel setting so all producers pick up the same judge token
      if (hostTokenKey) {
        try {
          await axios.put(`/api/channels/${normalizedChannelId}/settings/${hostTokenKey}`, { value: token }, { withCredentials: true });
        } catch (_) {
          // Non-fatal if settings write fails
        }
      }
    } catch (err) {
      setHostJudgeError(err.message || 'Failed to prepare judge controls');
      setHostJudgeToken(null);
    }
  }, [normalizedChannelId, currentCupId, user?.id, hostTokenKey, settings]);

  const canHostJudge = hasChannelRole(normalizedChannelId, ['OWNER']);

  useEffect(() => { if (!canHostJudge) return; void ensureHostJudgeToken(); }, [ensureHostJudgeToken, canHostJudge]);

  // Reset host/producer judging UI when the active item or cup changes
  // Prevents stale locked/error state from the previous video carrying over
  useEffect(() => {
    // Only reset when host controls are relevant
    if (!canHostJudge) return;
    setHostJudgeBusy(false);
    setHostJudgeError(null);
    setHostJudgeLocked(false);
    setHostJudgeScore(2.5);
  }, [canHostJudge, currentCupId, currentlyPlaying?.id]);

  const loadHostJudgeScore = useCallback(async () => {
    if (!hostJudgeToken || !normalizedChannelId || !currentCupId || !currentlyPlaying?.id) return;
    try {
      setHostJudgeError(null);
      const res = await fetch(`/api/channels/${normalizedChannelId}/cups/${currentCupId}/items/${currentlyPlaying.id}/score`, {
        method: 'GET',
        credentials: 'include',
        headers: { Authorization: `Bearer ${hostJudgeToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.judgeScore) {
        setHostJudgeScore(Number(data.judgeScore.score ?? 2.5));
        setHostJudgeLocked(Boolean(data.judgeScore.isLocked));
      }
    } catch (_) {}
  }, [hostJudgeToken, normalizedChannelId, currentCupId, currentlyPlaying?.id]);

  useEffect(() => { if (!canHostJudge) return; void loadHostJudgeScore(); }, [loadHostJudgeScore, canHostJudge]);

  const saveHostJudgeScore = useCallback(async () => {
    if (!hostJudgeToken || !normalizedChannelId || !currentCupId || !currentlyPlaying?.id) return;
    try {
      setHostJudgeBusy(true);
      setHostJudgeError(null);
      const res = await fetch(`/api/channels/${normalizedChannelId}/cups/${currentCupId}/items/${currentlyPlaying.id}/score`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hostJudgeToken}` },
        body: JSON.stringify({ score: hostJudgeScore })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          // Token expired/revoked — refresh shared token
          await ensureHostJudgeToken();
        }
        throw new Error(payload.error || 'Failed to submit score');
      }
      setHostJudgeLocked(Boolean(payload.judgeScore?.isLocked));
    } catch (err) {
      setHostJudgeError(err.message || 'Failed to submit score');
    } finally {
      setHostJudgeBusy(false);
    }
  }, [hostJudgeToken, normalizedChannelId, currentCupId, currentlyPlaying?.id, hostJudgeScore, ensureHostJudgeToken]);

  const lockHostJudgeScore = useCallback(async () => {
    if (!hostJudgeToken || !normalizedChannelId || !currentCupId || !currentlyPlaying?.id) return;
    try {
      setHostJudgeBusy(true);
      setHostJudgeError(null);
      await saveHostJudgeScore();
      const res = await fetch(`/api/channels/${normalizedChannelId}/cups/${currentCupId}/items/${currentlyPlaying.id}/lock`, {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${hostJudgeToken}` }
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          await ensureHostJudgeToken();
        }
        throw new Error(payload.error || 'Failed to lock in');
      }
      setHostJudgeLocked(true);
    } catch (err) {
      setHostJudgeError(err.message || 'Failed to lock in');
    } finally {
      setHostJudgeBusy(false);
    }
  }, [hostJudgeToken, normalizedChannelId, currentCupId, currentlyPlaying?.id, saveHostJudgeScore, ensureHostJudgeToken]);

  const handleSkip = () => {
    if (!canOperatePlayback) {
      return;
    }
    skipCurrent();
  };

  const handleShuffle = async () => {
    if (!canOperatePlayback) {
      return;
    }

    try {
      setShuffleLoading(true);
      setShuffleError(null);
      setShuffleFeedback(null);

      const shuffleResult = await triggerShuffle();
      const count = shuffleResult?.count ?? shuffleResult?.finalOrder?.length ?? 0;
      const lockedCount = count || Math.min(8, queue.length || 8);
      const initiator = shuffleResult?.initiatedBy || 'host';
      setShuffleFeedback(`Top ${lockedCount} locked by ${initiator}`);
    } catch (err) {
      console.error('Failed to trigger shuffle:', err);
      setShuffleError(err.message || 'Failed to trigger shuffle');
    } finally {
      setShuffleLoading(false);
    }
  };

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
    <Box sx={{ minHeight: embedded ? 'auto' : '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg" sx={{ py: embedded ? 2 : 4 }}>
        {!embedded && (
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
        )}

        <Grid container spacing={4}>
          <Grid item xs={12} md={7}>
            {canOperatePlayback && (
              <Box
                sx={{
                  position: 'relative',
                  paddingTop: '56.25%',
                  borderRadius: 1,
                  overflow: 'hidden',
                  background: alpha(theme.palette.background.paper, 0.5),
                  border: hasVideo ? 'none' : `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
                }}
              >
                <Box
                  ref={containerRef}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%'
                  }}
                />
                {!hasVideo && (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <QueueMusic sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                      No video currently playing
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Queue is {queueEnabled ? 'enabled' : 'disabled'}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {canOperatePlayback && (
              <Box sx={{ mt: 3 }}>
                <PlayerControlPanel
                  statusChips={[
                    {
                      label: channelConnected ? 'Connected' : 'Connecting…',
                      color: channelConnected ? 'success' : 'warning'
                    },
                    {
                      label: queueEnabled ? 'Queue Open' : 'Queue Closed',
                      color: queueEnabled ? 'success' : 'default'
                    },
                    {
                      label: hasVideo ? 'Now Playing' : 'No Video',
                      color: hasVideo ? 'info' : 'default'
                    }
                  ]}
                  headerLabel="Playback Actions"
                  currentTimeLabel={formatTimestamp(Math.max(displayTime, 0))}
                  durationLabel={formatTimestamp(resolvedDuration)}
                  sliderValue={sliderValue}
                  sliderMax={resolvedDuration || 1}
                  onSeekChange={handleSeekChange}
                  onSeekCommit={handleSeekCommit}
                  seekDisabled={sliderDisabled}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSkip={handleSkip}
                  onVote={handleStartVoting}
                  onShowOverlay={showOverlayPlayer}
                  onHideOverlay={hideOverlayPlayer}
                  onPlayNext={handlePlayNext}
                  playDisabled={playDisabled}
                  pauseDisabled={pauseDisabled}
                  skipDisabled={!canOperatePlayback || !currentlyPlaying}
                  voteDisabled={startDisabled}
                  showOverlayDisabled={showOverlayDisabled}
                  hideOverlayDisabled={hideOverlayDisabled}
                  playNextDisabled={!canOperatePlayback || !queue.length}
                  volumeValue={volumeSliderValue}
                  volumeLabel={volumeLabel}
                  muted={muted}
                  onVolumeChange={handleVolumeChange}
                  onVolumeToggle={handleVolumeToggle}
                  volumeDisabled={volumeSliderDisabled}
                />
              </Box>
            )}

            {canHostJudge && currentCupId && hostJudgeToken && (
              <Card sx={{ mt: 3 }}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                    <Typography variant="h6" fontWeight={600}>Judge Controls</Typography>
                    {hostJudgeLocked && (
                      <Chip size="small" color="success" label="Locked" />
                    )}
                  </Box>

                  {hostJudgeError && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setHostJudgeError(null)}>
                      {hostJudgeError}
                    </Alert>
                  )}

                  <PrecisionSlider
                    value={hostJudgeScore}
                    onChange={setHostJudgeScore}
                    disabled={hostJudgeLocked || !currentlyPlaying}
                    min={0}
                    max={5}
                    step={0.00001}
                  />

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} mt={2}>
                    <Button
                      variant="outlined"
                      onClick={saveHostJudgeScore}
                      disabled={hostJudgeLocked || hostJudgeBusy || !currentlyPlaying}
                    >
                      Save Score
                    </Button>
                    <Button
                      variant="contained"
                      onClick={lockHostJudgeScore}
                      disabled={hostJudgeLocked || hostJudgeBusy || !currentlyPlaying}
                    >
                      Lock In
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}

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

              {vipError && (
                <Alert severity="error" onClose={() => setVipError(null)} sx={{ mb: 2 }}>
                  {vipError}
                </Alert>
              )}

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
                  {sortedQueue.map((video, index) => (
                    <QueueItem
                      key={video.id || index}
                      video={video}
                      index={index}
                      isPlaying={currentlyPlaying?.id === video.id}
                      isTopEight={video.status === 'TOP_EIGHT'}
                      isVip={vipIndexMap.has(Number(video.id))}
                      canManageVip={canManageVip}
                      onToggleVip={handleVipAction}
                      vipActionInFlight={vipActionId === video.id}
                    />
                  ))}
                </List>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={5}>
            <Box display="flex" flexDirection="column" gap={3}>
              {showVotingPanel && (
                <Card>
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        justifyContent: 'space-between',
                        alignItems: { xs: 'flex-start', sm: 'center' },
                        gap: 1.5
                      }}
                    >
                      <Box>
                        <Typography variant="h6" fontWeight={600}>
                          Voting Control
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Manage judge lock-ins and reveal the scores when you&apos;re ready.
                        </Typography>
                      </Box>
                      <Chip
                        label={votingState ? votingStageMeta.label : 'Idle'}
                        size="small"
                        sx={{
                          bgcolor: votingState
                            ? alpha(votingStageMeta.accent, 0.15)
                            : alpha('#9ea7b8', 0.2),
                          color: votingState ? votingStageMeta.accent : 'text.secondary',
                          fontWeight: 600,
                          letterSpacing: 0.6
                        }}
                      />
                    </Box>

                    {votingError && (
                      <Alert
                        severity="error"
                        onClose={() => setVotingError(null)}
                        sx={{ pointerEvents: 'auto' }}
                      >
                        {votingError}
                      </Alert>
                    )}

                    <Stack spacing={1.5}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Scoring Flow
                      </Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} flexWrap="wrap">
                        <Button
                          variant="contained"
                          color="primary"
                          size="medium"
                          startIcon={
                            votingAction === 'start'
                              ? <CircularProgress size={16} color="inherit" />
                              : <PlayArrow fontSize="small" />
                          }
                          disabled={startDisabled}
                          onClick={handleStartVoting}
                          sx={{ pointerEvents: 'auto', ...actionBtnSx }}
                        >
                          Start Voting
                        </Button>
                        <Button
                          variant="outlined"
                          color="warning"
                          size="medium"
                          startIcon={
                            votingAction === 'cancel'
                              ? <CircularProgress size={16} color="inherit" />
                              : <Cancel fontSize="small" />
                          }
                          disabled={cancelDisabled}
                          onClick={handleCancelVoting}
                          sx={{ pointerEvents: 'auto', ...actionBtnSx }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="contained"
                          color="secondary"
                          size="medium"
                          startIcon={
                            forceLockLoading
                              ? <CircularProgress size={16} color="inherit" />
                              : <LockIcon fontSize="small" />
                          }
                          disabled={forceLockDisabled}
                          onClick={handleForceLock}
                          sx={{ pointerEvents: 'auto', ...actionBtnSx }}
                        >
                          Force Lock All
                        </Button>
                      </Stack>
                    </Stack>

                    <Stack spacing={1.5}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Reveal Sequence
                      </Typography>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} flexWrap="wrap">
                        <Button
                          variant="contained"
                          color="secondary"
                          size="medium"
                          startIcon={
                            votingAction === 'reveal-next'
                              ? <CircularProgress size={16} color="inherit" />
                              : <Visibility fontSize="small" />
                          }
                          disabled={revealNextDisabled}
                          onClick={handleRevealNext}
                          sx={{ pointerEvents: 'auto', ...actionBtnSx }}
                        >
                          Reveal Next{nextJudgeName ? ` (${nextJudgeName})` : ''}
                        </Button>
                        <Button
                          variant="contained"
                          color="success"
                          size="medium"
                          startIcon={
                            votingAction === 'reveal-average'
                              ? <CircularProgress size={16} color="inherit" />
                              : <TimelineIcon fontSize="small" />
                          }
                          disabled={revealAverageDisabled}
                          onClick={handleRevealAverage}
                          sx={{ pointerEvents: 'auto', ...actionBtnSx }}
                        >
                          Reveal Average
                        </Button>
                        <Button
                          variant="contained"
                          color="warning"
                          size="medium"
                          startIcon={
                            votingAction === 'reveal-social'
                              ? <CircularProgress size={16} color="inherit" />
                              : <Equalizer fontSize="small" />
                          }
                          disabled={revealSocialDisabled}
                          onClick={handleRevealSocial}
                          sx={{ pointerEvents: 'auto', ...actionBtnSx }}
                        >
                          Reveal Social
                        </Button>
                        <Button
                          variant="contained"
                          color="primary"
                          size="medium"
                          startIcon={
                            finalizeLoading
                              ? <CircularProgress size={16} color="inherit" />
                              : <CheckCircle fontSize="small" />
                          }
                          disabled={finalizeDisabled}
                          onClick={handleFinalizeScore}
                          sx={{ pointerEvents: 'auto', ...actionBtnSx }}
                        >
                          Submit Final Score
                        </Button>
                      </Stack>
                    </Stack>

                    {votingState ? (
                      <Stack spacing={1.5} mt={1}>
                        <Divider sx={{ my: 1 }} />
                        <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
                          <Chip
                            size="small"
                            label={`Submitted: ${votingMetrics.submitted}/${votingMetrics.totalJudges}`}
                            sx={{ bgcolor: alpha(votingStageMeta.accent, 0.12), color: votingStageMeta.accent }}
                          />
                          <Chip
                            size="small"
                            label={`Locked: ${votingMetrics.locked}/${votingMetrics.totalJudges}`}
                            sx={{ bgcolor: alpha('#7dffb3', 0.12), color: '#3ddf94' }}
                          />
                          {typeof votingState.revealedAverage === 'number' && (
                            <Chip
                              size="small"
                              icon={<EmojiEvents fontSize="small" />}
                              label={`Average ${formatScoreValue(votingState.revealedAverage)}`}
                              color="success"
                            />
                          )}
                          {typeof votingState.revealedSocial === 'number' && (
                            <Chip
                              size="small"
                              icon={<Equalizer fontSize="small" />}
                              label={`Social ${formatScoreValue(votingState.revealedSocial)}`}
                              color="warning"
                            />
                          )}
                        </Stack>

                        <Stack spacing={1.2}>
                          {votingJudges.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              Judges will appear here as they connect to the control panel.
                            </Typography>
                          ) : (
                            votingJudges.map((judge) => {
                              const status = describeJudgeStatus(judge);
                              const detail = (() => {
                                if (judge.revealStatus === 'skipped') {
                                  if (judge.skippedReason === 'not_locked') {
                                    return 'Excluded (vote not locked)';
                                  }
                                  if (judge.skippedReason === 'no_score') {
                                    return 'Excluded (no score submitted)';
                                  }
                                  return 'Excluded from round';
                                }
                                if (judge.connected === false) {
                                  return 'Disconnected';
                                }
                                if (judge.locked) {
                                  return 'Vote locked';
                                }
                                if (typeof judge.score === 'number') {
                                  return 'Score submitted';
                                }
                                return 'Awaiting score';
                              })();
                              return (
                                <Box
                                  key={judge.id || judge.name}
                                  sx={{
                                    borderRadius: 2,
                                    border: `1px solid ${alpha('#ffffff', 0.08)}`,
                                    px: 1.5,
                                    py: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 1.5
                                  }}
                                >
                                  <Box>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                      {judge.name || 'Judge'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {detail}
                                    </Typography>
                                  </Box>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Chip
                                      size="small"
                                      label={formatScoreValue(judge.score)}
                                      color={judge.revealStatus === 'revealed' ? 'primary' : 'default'}
                                      variant={judge.revealStatus === 'revealed' ? 'filled' : 'outlined'}
                                    />
                                    <Chip size="small" label={status.label} color={status.color} variant={status.color === 'default' ? 'outlined' : 'filled'} />
                                  </Stack>
                                </Box>
                              );
                            })
                          )}
                        </Stack>
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        When you start voting, judges will appear here so you can monitor their lock-ins and reveals.
                      </Typography>
                    )}
              </CardContent>
            </Card>

            {canManageRoles && (
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="flex-start" mb={1.5}>
                    <Box sx={{ mr: 2, p: 1, borderRadius: 1, bgcolor: alpha(theme.palette.success.main, 0.1), color: 'success.main' }}>
                      <LiveTv />
                    </Box>
                    <Box flex={1}>
                      <Typography variant="h6" sx={{ fontWeight: 700 }} gutterBottom>
                        Ad Announcements
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Automatically warn chat 30 seconds before ad breaks and greet viewers when ads end.
                      </Typography>
                    </Box>
                  </Box>
                  <Stack spacing={2}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={(settings?.ad_announcements_enabled || 'true') === 'true'}
                          onChange={async (e) => {
                            try { await axios.put(`/api/channels/${normalizedChannelId}/settings/ad_announcements_enabled`, { value: e.target.checked }, { withCredentials: true }); } catch (_) {}
                          }}
                        />
                      }
                      label={(settings?.ad_announcements_enabled || 'true') === 'true' ? 'Announcements Enabled' : 'Announcements Disabled'}
                    />
                    <TextField
                      size="small"
                      fullWidth
                      label="30s Warning Message"
                      value={settings?.ad_warn_message || ''}
                      onChange={async (e) => { try { await axios.put(`/api/channels/${normalizedChannelId}/settings/ad_warn_message`, { value: e.target.value }, { withCredentials: true }); } catch (_) {} }}
                      disabled={(settings?.ad_announcements_enabled || 'true') !== 'true'}
                    />
                    <TextField
                      size="small"
                      fullWidth
                      label="Ad Start Message"
                      value={settings?.ad_start_message || ''}
                      onChange={async (e) => { try { await axios.put(`/api/channels/${normalizedChannelId}/settings/ad_start_message`, { value: e.target.value }, { withCredentials: true }); } catch (_) {} }}
                      disabled={(settings?.ad_announcements_enabled || 'true') !== 'true'}
                    />
                    <TextField
                      size="small"
                      fullWidth
                      label="Ad End Message"
                      value={settings?.ad_end_message || ''}
                      onChange={async (e) => { try { await axios.put(`/api/channels/${normalizedChannelId}/settings/ad_end_message`, { value: e.target.value }, { withCredentials: true }); } catch (_) {} }}
                      disabled={(settings?.ad_announcements_enabled || 'true') !== 'true'}
                    />
                    {adError && (
                      <Alert severity="warning">{adError}</Alert>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            )}
          )}

          {/* Access & Roles moved to bottom of column */}

          {/* Top Eight */}
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1.5} mb={2}>
                <EmojiEvents color="secondary" />
                <Typography variant="h6" fontWeight={600}>
                  Top Eight
                </Typography>
                <Chip
                  label={lastShuffleDate ? `${lastShuffle?.initiatedBy || 'host'} • ${lastShuffleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Awaiting shuffle'}
                  size="small"
                  color={lastShuffleDate ? 'secondary' : 'default'}
                  variant={lastShuffleDate ? 'filled' : 'outlined'}
                  sx={{ ml: 'auto' }}
                />
              </Box>

              {canOperatePlayback && (
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} mb={2}>
                  <Typography variant="body2" color="text.secondary">
                    {derivedTopEight.length
                      ? 'Shuffle again to remix the Top 8 bracket.'
                      : 'Trigger a shuffle to lock in tonight’s Top 8.'}
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<Shuffle />}
                    onClick={handleShuffle}
                    disabled={shuffleLoading || !queue.length}
                  >
                    {shuffleLoading ? 'Shuffling…' : 'Shuffle'}
                  </Button>
                </Box>
              )}

              {shuffleError && (
                <Alert severity="error" onClose={() => setShuffleError(null)} sx={{ mb: 2 }}>
                  {shuffleError}
                </Alert>
              )}

              {shuffleFeedback && (
                <Alert severity="success" onClose={() => setShuffleFeedback(null)} sx={{ mb: 2 }}>
                  {shuffleFeedback}
                </Alert>
              )}

              {derivedTopEight.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No Top 8 bracket yet. Once a shuffle is triggered the selected entries will appear here.
                </Typography>
              ) : (
                <Grid container spacing={1.5}>
                  {derivedTopEight.map((item, index) => (
                    <Grid item xs={12} sm={6} key={item.id || index}>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          borderRadius: 1.5,
                          borderColor: alpha(theme.palette.secondary.main, 0.5),
                          bgcolor: alpha(theme.palette.secondary.main, 0.07)
                        }}
                      >
                        <Typography variant="overline" color="secondary" fontWeight={700}>
                          #{index + 1}
                        </Typography>
                        <Typography variant="subtitle2" fontWeight={600} noWrap>
                          {item.title || 'Untitled Video'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {getQueueAlias(item)}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>

          {/* Cup Standings */}
          {currentStandings && currentStandings.length > 0 && (
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1.5} mb={2}>
                      <EmojiEvents color="warning" />
                      <Typography variant="h6" fontWeight={600}>
                        {cupInfo?.title || 'Cup'} Standings
                      </Typography>
                    </Box>
                    
                    {cupInfo && (
                      <Box mb={2}>
                        {cupInfo.theme && (
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Theme: {cupInfo.theme}
                          </Typography>
                        )}
                        <Typography variant="body2" color="text.secondary">
                          Rankings by social score (aggregate performance)
                        </Typography>
                      </Box>
                    )}
                    
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, p: 1 }}>Rank</TableCell>
                            <TableCell sx={{ fontWeight: 600, p: 1 }}>User</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, p: 1 }}>Score</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, p: 1 }}>Videos</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {currentStandings
                            .sort((a, b) => {
                              if (a.rank && b.rank) return a.rank - b.rank;
                              const scoreA = a.averageScore || a.totalScore || 0;
                              const scoreB = b.averageScore || b.totalScore || 0;
                              return scoreB - scoreA;
                            })
                            .map((standing, index) => {
                              const socialScore = standing.averageScore || standing.totalScore;
                              return (
                                <TableRow key={standing.id || `${standing.submitterUsername}-${index}`}>
                                  <TableCell sx={{ p: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      {standing.rank || index + 1}
                                      {index === 0 && <EmojiEvents sx={{ fontSize: 16, color: 'gold' }} />}
                                      {index === 1 && <EmojiEvents sx={{ fontSize: 16, color: 'silver' }} />}
                                      {index === 2 && <EmojiEvents sx={{ fontSize: 16, color: '#CD7F32' }} />}
                                    </Box>
                                  </TableCell>
                                  <TableCell sx={{ p: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                      {standing.submitterUsername || 'Anonymous'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="right" sx={{ p: 1 }}>
                                    <Chip 
                                      label={socialScore ? Number(socialScore).toFixed(5) : '—'}
                                      size="small"
                                      color={index < 3 ? 'primary' : 'default'}
                                      sx={{ fontWeight: 600, height: 20, fontSize: '0.75rem' }}
                                    />
                                  </TableCell>
                                  <TableCell align="right" sx={{ p: 1 }}>
                                    <Typography variant="body2">
                                      {standing.judgeCount || 0}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              )}

              

              {canManageRoles && (
                <Card>
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        justifyContent: 'space-between',
                        alignItems: { xs: 'flex-start', sm: 'center' },
                        gap: 1.5
                      }}
                    >
                      <Box>
                        <Typography variant="h6" fontWeight={600}>
                          Access &amp; Roles
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Grant producers or hosts the ability to control the show. Owners and managers can edit this list.
                        </Typography>
                      </Box>
                    </Box>

                    {owners.length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Channel owners &amp; managers
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                          {owners.map((owner) => {
                            const name = owner.account?.displayName || owner.account?.username || owner.accountId;
                            return (
                              <Chip
                                key={owner.id}
                                label={`${name} • ${owner.role}`}
                                size="small"
                                color="default"
                                variant="outlined"
                              />
                            );
                          })}
                        </Stack>
                      </Box>
                    )}

                    {/* Manager Controls */}
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        Managers
                      </Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1 }}>
                        <TextField
                          label="Twitch username"
                          value={newManagerUsername}
                          onChange={(e) => setNewManagerUsername(e.target.value)}
                          size="small"
                          fullWidth
                          disabled={managerSubmitting}
                          autoComplete="off"
                        />
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={managerSubmitting || !newManagerUsername.trim()}
                          onClick={handleAddManager}
                        >
                          Add Manager
                        </Button>
                      </Stack>
                      <Stack spacing={1}>
                        {owners.filter((o) => o.role === 'MANAGER').length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No managers yet. Add a username to grant manager access.
                          </Typography>
                        ) : (
                          owners
                            .filter((o) => o.role === 'MANAGER')
                            .map((mgr) => {
                              const name = mgr.account?.displayName || mgr.account?.username || mgr.accountId;
                              return (
                                <Paper
                                  key={mgr.id}
                                  variant="outlined"
                                  sx={{ p: 1, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
                                >
                                  <Typography variant="body2">{name}</Typography>
                                  <Tooltip title="Remove manager">
                                    <span>
                                      <IconButton
                                        size="small"
                                        color="error"
                                        disabled={managerSubmitting}
                                        onClick={() => handleRemoveManager(mgr.id)}
                                      >
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Paper>
                              );
                            })
                        )}
                      </Stack>
                    </Box>

                    {rolesError && (
                      <Alert severity="error" onClose={() => setRolesError(null)} sx={{ pointerEvents: 'auto' }}>
                        {rolesError}
                      </Alert>
                    )}
                    {rolesNotice && (
                      <Alert severity="success" onClose={() => setRolesNotice(null)} sx={{ pointerEvents: 'auto' }}>
                        {rolesNotice}
                      </Alert>
                    )}

                    <Box
                      component="form"
                      onSubmit={handleRoleFormSubmit}
                      sx={{ pointerEvents: 'auto' }}
                    >
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        <TextField
                          label="Twitch username"
                          value={newRoleUsername}
                          onChange={(event) => setNewRoleUsername(event.target.value)}
                          size="small"
                          fullWidth
                          disabled={roleSubmitting}
                          autoComplete="off"
                        />
                        <TextField
                          select
                          label="Role"
                          size="small"
                          value={newRoleType}
                          onChange={(event) => setNewRoleType(event.target.value)}
                          sx={{ minWidth: { xs: '100%', sm: 160 } }}
                          disabled={roleSubmitting}
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </TextField>
                        <Button
                          type="submit"
                          variant="contained"
                          color="primary"
                          size="small"
                          disabled={roleSubmitting || !newRoleUsername.trim()}
                        >
                          Assign
                        </Button>
                      </Stack>
                    </Box>

                    {rolesLoading ? (
                      <LinearProgress />
                    ) : (
                      <Stack spacing={1.2}>
                        {roleAssignments.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No additional show roles yet. Add a username to grant producer or host controls.
                          </Typography>
                        ) : (
                          roleAssignments.map((assignment) => {
                            const name = assignment.account?.displayName || assignment.account?.username || assignment.accountId;
                            const roleLabel = ROLE_LABELS[assignment.role] || assignment.role;
                            return (
                              <Paper
                                key={assignment.id}
                                variant="outlined"
                                sx={{
                                  p: 1.5,
                                  borderRadius: 2,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 1.5
                                }}
                              >
                                <Box>
                                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                    {name}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {roleLabel}{assignment.cup ? ` • ${assignment.cup.title}` : ''}
                                  </Typography>
                                </Box>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ pointerEvents: 'auto' }}>
                                  {assignment.cup && (
                                    <Chip
                                      size="small"
                                      label={assignment.cup.title}
                                      variant="outlined"
                                      color="default"
                                    />
                                  )}
                                  <Tooltip title="Remove role">
                                    <span>
                                      <IconButton
                                        size="small"
                                        color="error"
                                        disabled={roleSubmitting}
                                        onClick={() => handleRemoveRole(assignment.id)}
                                      >
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Stack>
                              </Paper>
                            );
                          })
                        )}
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              )}

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

                  {canOperatePlayback && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<LiveTv />}
                      sx={{ mb: 2 }}
                      onClick={() => window.open(`/player/${channel.id}`, '_blank', 'noopener,noreferrer')}
                    >
                      Open Overlay Player
                    </Button>
                  )}

                  {canOperatePlayback && (
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                      <Chip
                        size="small"
                        color={adLive ? 'success' : 'default'}
                        label={adLive === null ? 'Ads' : adLive ? 'Live' : 'Offline'}
                      />
                      <Typography variant="body2" color="text.secondary">
                        Next ad {adLoading ? 'loading…' : (adLive ? (nextAdAt ? `in ${adCountdown}` : 'schedule not available') : '—')}
                      </Typography>
                      {adUpdatedAt && (
                        <Typography variant="caption" color="text.secondary">
                          Updated {new Date(adUpdatedAt).toLocaleTimeString()}
                        </Typography>
                      )}
                      <Button onClick={refreshNextAd} size="small" disabled={adLoading}>Refresh</Button>
                    </Box>
                  )}

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {canOperatePlayback
                      ? (channelConnected
                        ? 'Control palette is live and syncing updates to all connected players.'
                        : 'Waiting for channel connection to enable live controls.')
                      : 'You are viewing the live queue in read-only mode. Sign in as a producer or host to control playback.'}
                  </Typography>

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
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default ChannelQueue;
