import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Typography
} from '@mui/material';
import { keyframes } from '@emotion/react';
import { useSocket } from '../contexts/SocketContext';

const SERVER_BASE = process.env.REACT_APP_SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : '');
const API_URL = `${SERVER_BASE}/api`;

const auroraDrift = keyframes`
  0% { transform: translate3d(-10%, -5%, 0) scale(1); opacity: 0.4; }
  50% { transform: translate3d(6%, 9%, 0) scale(1.1); opacity: 0.8; }
  100% { transform: translate3d(-8%, 3%, 0) scale(1); opacity: 0.4; }
`;

const formatName = (username) => {
  const u = (username || '').toString().trim();
  return u || 'Anonymous';
};

const formatPoints = (value) => {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) {
    return '0';
  }
  if (Number.isInteger(numeric)) {
    return numeric.toString();
  }
  return numeric.toFixed(1);
};

const formatOrdinal = (value) => {
  const numeric = parseInt(value, 10);
  if (Number.isNaN(numeric) || numeric <= 0) {
    return '#?';
  }
  const v = numeric % 100;
  if (v >= 11 && v <= 13) {
    return `${numeric}th`;
  }
  switch (numeric % 10) {
    case 1:
      return `${numeric}st`;
    case 2:
      return `${numeric}nd`;
    case 3:
      return `${numeric}rd`;
    default:
      return `${numeric}th`;
  }
};

const getSeriesStatusColor = (status) => {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'COMPLETED':
      return 'secondary';
    case 'PLANNED':
      return 'warning';
    default:
      return 'default';
  }
};

const SeriesLeaderboardOverlay = () => {
  const { channelName } = useParams();
  const [activeSeriesId, setActiveSeriesId] = useState(null);
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [loadingSeries, setLoadingSeries] = useState(true);
  const [error, setError] = useState(null);

  const {
    connectToChannel,
    disconnectFromChannel,
    seriesStandings: seriesStandingsMap,
    seriesMetadata,
    refreshSeriesStandings
  } = useSocket();

  useEffect(() => {
    if (!channelName) {
      return undefined;
    }
    connectToChannel(channelName, { explicit: true });
    return () => disconnectFromChannel();
  }, [channelName, connectToChannel, disconnectFromChannel]);

  useEffect(() => {
    if (!channelName) {
      return;
    }
    let isMounted = true;
    const loadSeries = async () => {
      setLoadingSeries(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/channels/public/${channelName}/series/current`);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Series not available');
        }
        const data = await response.json();
        const resolvedId = data?.series?.id;
        if (!resolvedId) {
          throw new Error('Series missing');
        }
        if (!isMounted) {
          return;
        }
        setActiveSeriesId(resolvedId);
        setSeriesInfo(data.series || null);
        await refreshSeriesStandings(resolvedId, { publicAccess: true, channelId: channelName });
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setActiveSeriesId(null);
        setSeriesInfo(null);
        setError(err.message || 'Failed to load series');
      } finally {
        if (isMounted) {
          setLoadingSeries(false);
        }
      }
    };
    loadSeries();
    return () => {
      isMounted = false;
    };
  }, [channelName, refreshSeriesStandings]);

  const resolvedSeries = useMemo(() => {
    if (!activeSeriesId) {
      return seriesInfo;
    }
    return seriesMetadata[activeSeriesId] || seriesInfo;
  }, [activeSeriesId, seriesInfo, seriesMetadata]);

  const standings = useMemo(() => {
    if (!activeSeriesId) {
      return [];
    }
    const entries = seriesStandingsMap[activeSeriesId];
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries.slice().sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }, [seriesStandingsMap, activeSeriesId]);

  const renderStatus = () => {
    if (!resolvedSeries) {
      return null;
    }
    return (
      <Chip
        label={resolvedSeries.status || 'ACTIVE'}
        color={getSeriesStatusColor(resolvedSeries.status)}
        size="small"
        sx={{ fontWeight: 600 }}
      />
    );
  };

  const renderBody = () => {
    if (loadingSeries) {
      return (
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <CircularProgress size={48} sx={{ color: 'rgba(255,255,255,0.85)' }} />
          <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.8)' }}>
            Loading series standings...
          </Typography>
        </Box>
      );
    }

    if (error) {
      return (
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="h4" sx={{ color: 'white', fontWeight: 700 }}>
            {error}
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', mt: 1 }}>
            Check back once the series is active.
          </Typography>
        </Box>
      );
    }

    if (!standings.length) {
      return (
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="h4" sx={{ color: 'white', fontWeight: 700 }}>
            No results yet
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', mt: 1 }}>
            Standings will display as soon as a cup in this series is scored.
          </Typography>
        </Box>
      );
    }

    return (
      <Grid container spacing={2} sx={{ mt: 4 }}>
        {standings.map((entry) => {
          const latestResult = Array.isArray(entry.placements) && entry.placements.length
            ? entry.placements[entry.placements.length - 1]
            : null;
          return (
            <Grid item xs={12} md={6} key={`${entry.submitterUsername}-${entry.rank}`}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 4,
                  background: entry.rank <= 3
                    ? 'linear-gradient(135deg, rgba(0, 184, 255, 0.2) 0%, rgba(58, 123, 213, 0.08) 100%)'
                    : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  backdropFilter: 'blur(8px)'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        background: entry.rank <= 3
                          ? 'rgba(255,255,255,0.9)'
                          : 'rgba(255,255,255,0.05)',
                        color: entry.rank <= 3 ? '#0a0e27' : 'rgba(255,255,255,0.85)',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: entry.rank > 3 ? '1px solid rgba(255,255,255,0.2)' : 'none'
                      }}
                    >
                      #{entry.rank}
                    </Box>
                    <Box>
                      <Typography variant="h6" sx={{ color: 'white', fontWeight: 700 }}>
                        {formatName(entry.submitterUsername)}
                      </Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.7)' }}>
                        {entry.cupsPlayed || 0} cup{entry.cupsPlayed === 1 ? '' : 's'} • Best {entry.bestFinish ? formatOrdinal(entry.bestFinish) : '—'}
                      </Typography>
                    </Box>
                  </Box>
                  <Chip
                    label={`${formatPoints(entry.totalPoints)} pts`}
                    color="info"
                    sx={{ fontWeight: 700 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Chip
                    label={`${entry.cupsPlayed || 0} cups`}
                    variant="outlined"
                    size="small"
                    sx={{ color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.3)' }}
                  />
                  {latestResult && (
                    <Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>
                      Last cup: {formatOrdinal(latestResult.rank)} • +{formatPoints(latestResult.pointsAwarded || 0)} pts
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    );
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        background: 'radial-gradient(circle at top, #132043 0%, #050914 60%)',
        color: 'white',
        p: { xs: 2, sm: 4 },
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(120deg, rgba(0,184,255,0.25), rgba(58,123,213,0.15))',
          opacity: 0.35,
          animation: `${auroraDrift} 18s ease-in-out infinite`
        }}
      />
      <Box sx={{ position: 'relative', zIndex: 1, maxWidth: '1200px', mx: 'auto' }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h3" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            Series Leaderboard
          </Typography>
          {resolvedSeries && (
            <>
              <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                {resolvedSeries.title}
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
                {renderStatus()}
                <Chip
                  label={`${standings.length} player${standings.length === 1 ? '' : 's'}`}
                  variant="outlined"
                  sx={{ color: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.4)', fontWeight: 600 }}
                />
              </Box>
            </>
          )}
        </Box>
        {renderBody()}
      </Box>
    </Box>
  );
};

export default SeriesLeaderboardOverlay;
