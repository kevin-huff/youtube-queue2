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

const scrollLoop = keyframes`
  0% { transform: translateY(0); }
  100% { transform: translateY(-50%); }
`;

const floatCard = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-6px); }
  100% { transform: translateY(0px); }
`;

const pulseLine = keyframes`
  0% { opacity: 0.2; transform: scaleX(0); }
  50% { opacity: 0.6; transform: scaleX(1); }
  100% { opacity: 0.2; transform: scaleX(0); }
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

    const topThree = standings.slice(0, 3);
    const remaining = standings.slice(3);
    const renderCard = (entry, highlight = false) => {
      const latestResult = Array.isArray(entry.placements) && entry.placements.length
        ? entry.placements[entry.placements.length - 1]
        : null;
      return (
        <Paper
          key={`${entry.submitterUsername}-${entry.rank}`}
          elevation={0}
          sx={{
            flex: 1,
            p: 2.5,
            borderRadius: 3,
            background: highlight
              ? 'linear-gradient(135deg, rgba(0,184,255,0.25) 0%, rgba(58,123,213,0.15) 100%)'
              : 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            minWidth: 0
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="overline" sx={{ letterSpacing: 2, opacity: 0.8 }}>
                #{entry.rank}
              </Typography>
              <Typography
                variant={highlight ? 'h5' : 'subtitle1'}
                sx={{ fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {formatName(entry.submitterUsername)}
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.7)' }}>
                {entry.cupsPlayed || 0} cup{entry.cupsPlayed === 1 ? '' : 's'}
                {' • '}
                best {entry.bestFinish ? formatOrdinal(entry.bestFinish) : '—'}
              </Typography>
            </Box>
            <Chip
              label={`${formatPoints(entry.totalPoints)} pts`}
              color="info"
              sx={{ fontWeight: 700, fontSize: highlight ? '1rem' : '0.85rem' }}
            />
          </Box>
          {latestResult && (
            <Typography sx={{ color: 'rgba(255,255,255,0.65)', mt: 1 }}>
              Last cup: {formatOrdinal(latestResult.rank)} • +{formatPoints(latestResult.pointsAwarded || 0)} pts
            </Typography>
          )}
        </Paper>
      );
    };

    const laneData = remaining.length ? remaining : topThree;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 1.25
          }}
        >
          {topThree.map((entry, idx) => {
            const tilt = idx === 0 ? 0 : idx === 1 ? -4 : 4;
            return (
              <Paper
                key={`hero-${entry.submitterUsername}-${entry.rank}`}
                elevation={0}
                sx={{
                  p: 1.75,
                  borderRadius: 3,
                  background: idx === 0
                    ? 'linear-gradient(140deg, rgba(255,226,173,0.35), rgba(255,255,255,0.08))'
                    : 'linear-gradient(140deg, rgba(0,184,255,0.2), rgba(58,123,213,0.08))',
                  border: '1px solid rgba(255,255,255,0.15)',
                  transform: `perspective(900px) rotateY(${tilt}deg)`,
                  animation: `${floatCard} 6s ease-in-out infinite`,
                  minWidth: 0
                }}
              >
                <Typography variant="overline" sx={{ letterSpacing: 1.5, opacity: 0.65 }}>
                  Elite #{entry.rank}
                </Typography>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    color: 'white',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {formatName(entry.submitterUsername)}
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.75)' }}>
                  {entry.cupsPlayed || 0} cup{entry.cupsPlayed === 1 ? '' : 's'} • best {entry.bestFinish ? formatOrdinal(entry.bestFinish) : '—'}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5, alignItems: 'center' }}>
                  <Chip
                    label={`${formatPoints(entry.totalPoints)} pts`}
                    color="info"
                    sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ color: 'rgba(255,255,255,0.7)', textAlign: 'right' }}
                  >
                    Last cup:{' '}
                    {entry.placements?.length
                      ? formatOrdinal(entry.placements[entry.placements.length - 1].rank)
                      : '—'}
                  </Typography>
                </Box>
              </Paper>
            );
          })}
        </Box>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            borderRadius: 4,
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'linear-gradient(180deg, rgba(4,8,20,0.6), rgba(4,8,14,0.9))'
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: 'linear-gradient(90deg, transparent, rgba(0,184,255,0.6), transparent)',
              animation: `${pulseLine} 4s ease-in-out infinite`
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 20% 20%, rgba(0,184,255,0.08), transparent 55%)'
            }}
          />
          <Box
            sx={{
              position: 'relative',
              zIndex: 1,
              height: '100%',
              width: '100%',
              overflow: 'hidden',
              p: 1.25
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                rowGap: 0.75,
                animation: `${scrollLoop} ${Math.max(laneData.length * 2, 10)}s linear infinite`,
                transform: 'translateZ(0)'
              }}
            >
              {[...laneData, ...laneData].map((entry, idx) => (
                <Paper
                  key={`lane-${entry.submitterUsername}-${entry.rank}-${idx}`}
                  sx={{
                    p: 1,
                    borderRadius: 2,
                    background: 'rgba(2,10,25,0.7)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'grid',
                    gridTemplateColumns: '48px 1fr auto auto',
                    alignItems: 'center',
                    gap: 0.5
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>#{entry.rank}</Typography>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}
                    >
                      {formatName(entry.submitterUsername)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                      Best {entry.bestFinish ? formatOrdinal(entry.bestFinish) : '—'}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 700 }}>
                    {formatPoints(entry.totalPoints)} pts
                  </Typography>
                  <Typography variant="body2" sx={{ textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>
                    {entry.cupsPlayed || 0} cups
                  </Typography>
                </Paper>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        p: 2
      }}
    >
      <Box
        sx={{
          width: 'min(640px, 100vw)',
          height: 'min(1080px, 100vh)',
          borderRadius: 3,
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'linear-gradient(180deg, rgba(3,8,20,0.92) 0%, rgba(4,6,15,0.98) 70%)',
          boxShadow: '0 14px 36px rgba(0,0,0,0.45)',
          p: 2.25,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography
            variant="h4"
            sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3em', fontSize: '1.2rem' }}
          >
            Series Leaderboard
          </Typography>
          {resolvedSeries && (
            <>
              <Typography variant="h5" sx={{ mt: 1, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '1.4rem' }}>
                {resolvedSeries.title}
              </Typography>
              <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                {renderStatus()}
                <Chip
                  label={`${standings.length} player${standings.length === 1 ? '' : 's'}`}
                  size="small"
                  variant="outlined"
                  sx={{ color: 'rgba(255,255,255,0.85)', borderColor: 'rgba(255,255,255,0.4)', fontWeight: 600 }}
                />
              </Box>
            </>
          )}
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>{renderBody()}</Box>
      </Box>
    </Box>
  );
};

export default SeriesLeaderboardOverlay;
