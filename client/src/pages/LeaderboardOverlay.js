import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  alpha,
  Box,
  Chip,
  Divider,
  Typography
} from '@mui/material';
import { keyframes } from '@emotion/react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useSocket } from '../contexts/SocketContext';

const auroraSweep = keyframes`
  0% { transform: translate(-12%, -10%) scale(1); opacity: 0.35; }
  40% { transform: translate(6%, 4%) scale(1.15); opacity: 0.65; }
  70% { transform: translate(10%, 16%) scale(1.05); opacity: 0.5; }
  100% { transform: translate(-8%, 12%) scale(1.08); opacity: 0.35; }
`;

const pulseGlow = keyframes`
  0% { opacity: 0.4; transform: scale(1); }
  48% { opacity: 0.75; transform: scale(1.08); }
  100% { opacity: 0.4; transform: scale(1); }
`;

const scrollCredits = keyframes`
  0% { transform: translateY(0); }
  100% { transform: translateY(-50%); }
`;

const rankAccent = {
  1: {
    label: 'Champion',
    color: '#ffd860',
    glow: 'rgba(255, 216, 96, 0.8)'
  },
  2: {
    label: 'Runner Up',
    color: '#c5d7ff',
    glow: 'rgba(197, 215, 255, 0.7)'
  },
  3: {
    label: 'Third Place',
    color: '#ffbe8f',
    glow: 'rgba(255, 190, 143, 0.7)'
  }
};

const formatScore = (value) => {
  if (value === null || value === undefined) {
    return '—';
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return '—';
  }
  return numeric.toFixed(5);
};

const getRankKey = (entry, index) => entry?.rank ?? index + 1;

const getRankLabel = (rank) => {
  const accent = rankAccent[rank];
  return accent ? accent.label : `Place ${rank}`;
};

const LeaderboardOverlay = () => {
  const { channelName } = useParams();
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const {
    connectToChannel,
    disconnectFromChannel,
    channelConnected,
    cupStandings,
    cupMetadata,
    settings,
    queue,
    currentlyPlaying,
    refreshCupStandings
  } = useSocket();

  const [activeCupId, setActiveCupId] = useState(null);
  const [cupTitle, setCupTitle] = useState(null);
  const requestedCupIdsRef = useRef(new Set());

  useEffect(() => {
    if (!channelName) {
      return undefined;
    }
    connectToChannel(channelName, { explicit: true });
    return () => disconnectFromChannel();
  }, [channelName, connectToChannel, disconnectFromChannel]);

  const derivedCupId = useMemo(() => {
    if (currentlyPlaying?.cupId) {
      return currentlyPlaying.cupId;
    }
    if (settings?.activeCupId) {
      return settings.activeCupId;
    }
    const fromQueue = Array.isArray(queue)
      ? queue.find((item) => item?.cupId)?.cupId
      : null;
    if (fromQueue) {
      return fromQueue;
    }
    const availableIds = Object.keys(cupStandings || {});
    if (availableIds.length > 0) {
      return availableIds[0];
    }
    return null;
  }, [currentlyPlaying?.cupId, settings?.activeCupId, queue, cupStandings]);

  useEffect(() => {
    if (derivedCupId && derivedCupId !== activeCupId) {
      setActiveCupId(derivedCupId);
    }
  }, [derivedCupId, activeCupId]);

  useEffect(() => {
    if (!activeCupId) {
      return;
    }
    const info = cupMetadata?.[activeCupId];
    if (info?.title && info.title !== cupTitle) {
      setCupTitle(info.title);
    }
  }, [activeCupId, cupMetadata, cupTitle]);

  useEffect(() => {
    if (!activeCupId) {
      setCupTitle(null);
      return;
    }

    const standingsForCup = cupStandings?.[activeCupId] || [];
    if (Array.isArray(standingsForCup) && standingsForCup.length > 0) {
      const firstEntry = standingsForCup[0];
      if (firstEntry?.cupTitle) {
        setCupTitle(firstEntry.cupTitle);
      }
    }

    if (!channelConnected || requestedCupIdsRef.current.has(activeCupId)) {
      return;
    }

    requestedCupIdsRef.current.add(activeCupId);

    const loadStandings = async () => {
      try {
        const data = await refreshCupStandings(activeCupId, { publicAccess: true });
        const nextTitle = data?.cup?.title;
        const dataCupId = data?.cup?.id || activeCupId;
        if (nextTitle && dataCupId === activeCupId && nextTitle !== cupTitle) {
          setCupTitle(nextTitle);
        }
      } catch (error) {
        console.warn('Failed to refresh cup standings for overlay:', error);
      }
    };

    loadStandings();
  }, [activeCupId, channelConnected, cupStandings, refreshCupStandings, cupTitle]);

  const standings = useMemo(() => {
    if (!activeCupId) {
      return [];
    }
    const entries = cupStandings?.[activeCupId];
    if (!Array.isArray(entries)) {
      return [];
    }
    return [...entries].sort((a, b) => {
      if (a.rank && b.rank) {
        return a.rank - b.rank;
      }
      // Sort by averageScore (weighted average of all videos), not totalScore
      const scoreA = (typeof a.averageScore === 'number' ? a.averageScore : 0);
      const scoreB = (typeof b.averageScore === 'number' ? b.averageScore : 0);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return (b.videoCount || 0) - (a.videoCount || 0);
    });
  }, [activeCupId, cupStandings]);

  useEffect(() => {
    if (standings.length > 0 && !cupTitle) {
      const entryWithCup = standings.find((entry) => entry?.cupTitle);
      if (entryWithCup?.cupTitle) {
        setCupTitle(entryWithCup.cupTitle);
      }
    }
  }, [standings, cupTitle]);

  const topThree = standings.slice(0, 3);
  const remaining = standings.slice(3);

  const scrollerData = useMemo(() => {
    if (remaining.length === 0) {
      return [];
    }
    if (prefersReducedMotion || remaining.length <= 3) {
      return remaining;
    }
    return [...remaining, ...remaining];
  }, [remaining, prefersReducedMotion]);

  const scrollDurationSeconds = useMemo(() => {
    if (prefersReducedMotion) {
      return 0;
    }
    const base = Math.max(remaining.length, 6);
    return base * 6;
  }, [prefersReducedMotion, remaining.length]);

  const overlayTitle = cupTitle || (activeCupId ? `Cup ${activeCupId}` : 'Cup Leaderboard');

  return (
    <Box
      sx={{
        width: 640,
        height: 1080,
        position: 'relative',
        overflow: 'hidden',
        color: '#e9f6ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Rajdhani", "Bebas Neue", "Roboto Condensed", sans-serif',
        mx: 'auto'
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 30% 20%, rgba(72, 196, 255, 0.35), transparent 60%), radial-gradient(circle at 70% 80%, rgba(255, 116, 215, 0.25), transparent 55%)',
          filter: 'blur(0px)'
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${alpha('#040b1c', 0.92)}, ${alpha('#0f3458', 0.88)})`
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: '-25%',
          background: `linear-gradient(120deg, ${alpha('#3ae8ff', 0.14)}, ${alpha('#ff7edb', 0.1)})`,
          filter: 'blur(48px)',
          animation: `${pulseGlow} 10s ease-in-out infinite`,
          opacity: 0.6
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: '-10%',
          background: `linear-gradient(120deg, ${alpha('#3ae8ff', 0)}, ${alpha('#3ae8ff', 0.3)}, ${alpha('#ff7edb', 0)})`,
          mixBlendMode: 'screen',
          animation: `${auroraSweep} 18s ease-in-out infinite`
        }}
      />

      <Box
        sx={{
          position: 'relative',
          width: '90%',
          height: '90%',
          borderRadius: '36px',
          border: `1px solid ${alpha('#76f6ff', 0.28)}`,
          boxShadow: `0 0 45px ${alpha('#3ae8ff', 0.25)}`,
          display: 'flex',
          flexDirection: 'column',
          px: 4,
          py: 5,
          backdropFilter: 'blur(18px)'
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: '#f4fbff',
              textShadow: '0 0 22px rgba(104, 232, 255, 0.65)'
            }}
          >
            {overlayTitle}
          </Typography>
          <Typography
            variant="h6"
            sx={{
              mt: 1,
              letterSpacing: 8,
              textTransform: 'uppercase',
              color: alpha('#ccefff', 0.75),
              fontWeight: 500
            }}
          >
            Social Leaderboard
          </Typography>
        </Box>

        <Divider
          sx={{
            borderColor: alpha('#76f6ff', 0.25),
            borderBottomWidth: 2,
            mb: 3,
            mx: 'auto',
            width: '80%'
          }}
        />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {topThree.length === 0 ? (
            <Box
              sx={{
                py: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                color: alpha('#d7f2ff', 0.7)
              }}
            >
              <Typography variant="h5" sx={{ textTransform: 'uppercase', letterSpacing: 4 }}>
                Standings Loading
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mt: 2,
                  maxWidth: 320,
                  textAlign: 'center',
                  color: alpha('#d7f2ff', 0.55)
                }}
              >
                Waiting for cup standings. Scores update automatically once videos are judged.
              </Typography>
            </Box>
          ) : (
            topThree.map((entry, index) => {
              const rank = getRankKey(entry, index);
              const accent = rankAccent[rank] || {
                label: `Place ${rank}`,
                color: '#72d0ff',
                glow: 'rgba(114, 208, 255, 0.45)'
              };
              const socialScore = entry?.averageScore ?? entry?.totalScore ?? null;
              const realName = entry?.submitterUsername || 'Unknown';
              return (
                <Box
                  key={`${realName}-${rank}`}
                  sx={{
                    position: 'relative',
                    px: 4,
                    py: 3,
                    borderRadius: '28px',
                    background: `linear-gradient(135deg, ${alpha(accent.color, 0.28)}, ${alpha('#0e243b', 0.8)})`,
                    border: `1px solid ${alpha(accent.color, 0.5)}`,
                    boxShadow: `0 0 38px ${alpha(accent.glow, 0.85)}`,
                    overflow: 'hidden'
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: '-30%',
                      background: `radial-gradient(circle at 30% 30%, ${alpha(accent.color, 0.4)}, transparent 70%)`,
                      opacity: 0.6,
                      filter: 'blur(12px)'
                    }}
                  />
                  <Box
                    sx={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Box>
                      <Typography
                        variant="h3"
                        sx={{
                          fontWeight: 700,
                          letterSpacing: 2,
                          textTransform: 'uppercase',
                          color: accent.color,
                          textShadow: `0 0 16px ${accent.glow}`
                        }}
                      >
                        #{rank}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          mt: 0.25,
                          letterSpacing: 3,
                          textTransform: 'uppercase',
                          color: alpha(accent.color, 0.9),
                          fontWeight: 600
                        }}
                      >
                        {getRankLabel(rank)}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: 1.5
                        }}
                      >
                        {realName}
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          mt: 2,
                          justifyContent: 'flex-end'
                        }}
                      >
                        <Chip
                          label={`Social ${formatScore(socialScore)}`}
                          color="primary"
                          sx={{
                            fontWeight: 700,
                            letterSpacing: 1,
                            bgcolor: alpha(accent.color, 0.22),
                            color: '#ffffff',
                            '& .MuiChip-label': {
                              px: 1.5
                            }
                          }}
                        />
                        <Chip
                          label={`${entry?.videoCount || 0} videos`}
                          sx={{
                            fontWeight: 600,
                            letterSpacing: 1,
                            bgcolor: alpha('#0b2743', 0.85),
                            color: alpha('#cde9ff', 0.92),
                            border: `1px solid ${alpha('#6de6ff', 0.4)}`,
                            '& .MuiChip-label': {
                              px: 1.5
                            }
                          }}
                        />
                      </Box>
                    </Box>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>

        <Divider
          sx={{
            borderColor: alpha('#76f6ff', 0.18),
            borderBottomWidth: 1,
            mt: 4,
            mb: 2
          }}
        />

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            borderRadius: '24px',
            border: `1px solid ${alpha('#6de6ff', 0.18)}`,
            background: `linear-gradient(160deg, ${alpha('#0a1f33', 0.85)}, ${alpha('#05101f', 0.9)})`,
            boxShadow: `0 0 35px ${alpha('#1f6fa8', 0.25)}`,
            overflow: 'hidden',
            mt: 1.5
          }}
        >
          <Box
            sx={{
              px: 3,
              py: 2.5,
              borderBottom: `1px solid ${alpha('#6de6ff', 0.18)}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: alpha('#d7f2ff', 0.7),
              fontWeight: 600
            }}
          >
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              Rank
            </Typography>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              Submitter
            </Typography>
            <Typography variant="subtitle2" sx={{ flex: 1, textAlign: 'center' }}>
              Social Score
            </Typography>
            <Typography variant="subtitle2" sx={{ flex: 1, textAlign: 'right' }}>
              Videos
            </Typography>
          </Box>

          <Box
            sx={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {remaining.length === 0 ? (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 3,
                  textAlign: 'center',
                  color: alpha('#d7f2ff', 0.6),
                  fontSize: 16,
                  letterSpacing: 1.5
                }}
              >
                {topThree.length === 0
                  ? 'Awaiting first scores to populate the leaderboard.'
                  : 'Only three contestants have registered scores so far.'}
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  animation: !prefersReducedMotion && remaining.length > 0
                    ? `${scrollCredits} ${scrollDurationSeconds}s linear infinite`
                    : 'none'
                }}
              >
                {scrollerData.map((entry, index) => {
                  const rank = getRankKey(entry, index + 3);
                  const socialScore = entry?.averageScore ?? entry?.totalScore ?? null;
                  const realName = entry?.submitterUsername || 'Unknown';

                  return (
                    <Box
                      key={`${realName}-${rank}-${index}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        px: 3,
                        py: 2.5,
                        gap: 2,
                        color: alpha('#f1fbff', 0.85),
                        letterSpacing: 1.2,
                        background: index % 2 === 0
                          ? alpha('#0d2844', 0.62)
                          : alpha('#091a2c', 0.45),
                        borderBottom: `1px solid ${alpha('#6de6ff', 0.08)}`
                      }}
                    >
                      <Typography variant="body1" sx={{ flex: 1, fontWeight: 600 }}>
                        #{rank}
                      </Typography>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {realName}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body1"
                        sx={{
                          flex: 1,
                          textAlign: 'center',
                          fontWeight: 600,
                          color: alpha('#7de3ff', 0.95)
                        }}
                      >
                        {formatScore(socialScore)}
                      </Typography>
                      <Typography variant="body1" sx={{ flex: 1, textAlign: 'right', fontWeight: 600 }}>
                        {entry?.videoCount || 0}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default LeaderboardOverlay;
