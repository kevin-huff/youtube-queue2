// VotingOverlay.jsx  
import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  Paper
} from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import LockIcon from '@mui/icons-material/Lock';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import EqualizerIcon from '@mui/icons-material/Equalizer';
import TimelineIcon from '@mui/icons-material/Timeline';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { useSocket } from '../contexts/SocketContext';

const STATUS = {
  locked: { label: 'Locked', icon: LockIcon },
  revealed: { label: 'Revealed', icon: EmojiEventsIcon },
  scored: { label: 'Scored', icon: CheckCircleIcon },
  pending: { label: 'Waiting', icon: HourglassEmptyIcon },
  offline: { label: 'Offline', icon: HighlightOffIcon }
};

const getJudgeStatus = (judge) => {
  if (!judge) return STATUS.pending;
  if (judge.revealStatus === 'revealed') return STATUS.revealed;
  if (judge.locked) return STATUS.locked;
  if (typeof judge.score === 'number') return STATUS.scored;
  if (judge.connected === false) return STATUS.offline;
  return STATUS.pending;
};

const STAGE_META = {
  collecting: {
    label: 'Collecting Scores',
    accent: '#5ce1ff',
    glow: 'rgba(92, 225, 255, 0.45)',
    icon: TimelineIcon
  },
  revealing: {
    label: 'Judge Reveal',
    accent: '#ff89df',
    glow: 'rgba(255, 137, 223, 0.5)',
    icon: EmojiEventsIcon
  },
  average: {
    label: 'Average Reveal',
    accent: '#7dffb3',
    glow: 'rgba(125, 255, 179, 0.45)',
    icon: EqualizerIcon
  },
  social: {
    label: 'Social Score Reveal',
    accent: '#ffd166',
    glow: 'rgba(255, 209, 102, 0.55)',
    icon: EqualizerIcon
  },
  completed: {
    label: 'Finalized',
    accent: '#a890ff',
    glow: 'rgba(168, 144, 255, 0.55)',
    icon: EmojiEventsIcon
  },
  cancelled: {
    label: 'Voting Cancelled',
    accent: '#ff6666',
    glow: 'rgba(255, 102, 102, 0.55)',
    icon: HighlightOffIcon
  }
};

const heroAurora = keyframes`
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const nebulaDrift = keyframes`
  0%   { transform: translate(-8%, -6%) scale(1) rotate(0deg); opacity: 0.35; }
  40%  { opacity: 0.55; }
  70%  { transform: translate(10%, 8%) scale(1.18) rotate(5deg); opacity: 0.75; }
  100% { transform: translate(-12%, 4%) scale(1.06) rotate(-3deg); opacity: 0.45; }
`;

const cardPulse = keyframes`
  0%, 100% { filter: drop-shadow(0 0 0 rgba(255, 209, 102, 0)); }
  50% { filter: drop-shadow(0 0 22px rgba(255, 209, 102, 0.45)); }
`;

const meshFloat = keyframes`
  0%, 100% { 
    transform: translate(0%, 0%) scale(1) rotate(0deg);
    opacity: 0.4;
  }
  33% { 
    transform: translate(-15%, 10%) scale(1.15) rotate(120deg);
    opacity: 0.6;
  }
  66% { 
    transform: translate(12%, -8%) scale(0.95) rotate(240deg);
    opacity: 0.5;
  }
`;

const particleFloat = keyframes`
  0% {
    transform: translateY(0) translateX(0) scale(0.8);
    opacity: 0;
  }
  10% {
    opacity: 0.8;
  }
  90% {
    opacity: 0.8;
  }
  100% {
    transform: translateY(-100vh) translateX(30px) scale(1.2);
    opacity: 0;
  }
`;

const glowPulse = keyframes`
  0%, 100% { 
    box-shadow: 0 0 20px rgba(92, 225, 255, 0.3), 0 0 40px rgba(255, 137, 223, 0.2);
  }
  50% { 
    box-shadow: 0 0 40px rgba(92, 225, 255, 0.6), 0 0 80px rgba(255, 137, 223, 0.4), 0 0 120px rgba(125, 255, 179, 0.3);
  }
`;

const float3D = keyframes`
  0%, 100% {
    transform: translateY(0px) rotateX(0deg) rotateY(0deg);
  }
  25% {
    transform: translateY(-8px) rotateX(2deg) rotateY(-2deg);
  }
  50% {
    transform: translateY(-4px) rotateX(-2deg) rotateY(2deg);
  }
  75% {
    transform: translateY(-12px) rotateX(2deg) rotateY(2deg);
  }
`;

const shimmer = keyframes`
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
`;

const StarRating = ({ value = 0, size = 48, color = '#ffd166', inactive = 'rgba(255,255,255,0.25)', glow = false }) => {
  const safeValue = Math.max(0, Math.min(5, Number.isFinite(value) ? value : 0));

  return (
    <Box sx={{ display: 'flex', gap: 0.3, alignItems: 'center' }}>
      {Array.from({ length: 5 }).map((_, index) => {
        const fill = Math.max(0, Math.min(1, safeValue - index));
        return (
          <Box
            // eslint-disable-next-line react/no-array-index-key
            key={`star-${index}`}
            sx={{
              position: 'relative',
              width: size,
              height: size,
              color: inactive
            }}
          >
            <StarBorderIcon sx={{ fontSize: size, color: inactive }} />
            <StarIcon
              sx={{
                position: 'absolute',
                inset: 0,
                fontSize: size,
                color,
                clipPath: `inset(0 ${100 - fill * 100}% 0 0)`,
                opacity: fill > 0 ? 1 : 0,
                transition: 'clip-path 360ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease',
                ...(glow
                  ? { 
                      animation: `${cardPulse} 2600ms ease-in-out ${index * 120}ms infinite`,
                      filter: `drop-shadow(0 0 8px ${color})`
                    }
                  : {})
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
};

const useAnimatedNumber = (value, { duration = 400, precision = 5 } = {}) => {
  const [displayValue, setDisplayValue] = useState(
    typeof value === 'number' ? Number(value.toFixed(precision)) : null
  );
  const previousRef = useRef(displayValue);

  useEffect(() => {
    if (typeof value !== 'number') {
      setDisplayValue(null);
      previousRef.current = null;
      return;
    }
    const from = typeof previousRef.current === 'number'
      ? previousRef.current
      : value;
    const to = Number(value.toFixed(precision));

    if (Math.abs(from - to) < 1e-5) {
      setDisplayValue(to);
      previousRef.current = to;
      return;
    }

    const startTime = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = t * t * (3 - 2 * t);
      const next = from + (to - from) * eased;
      setDisplayValue(Number(next.toFixed(precision)));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        previousRef.current = to;
      }
    };
    requestAnimationFrame(step);

    return () => {
      previousRef.current = null;
    };
  }, [value, duration, precision]);

  return displayValue;
};

const VotingOverlay = ({ votingState, currentlyPlaying }) => {
  // ── Hooks at top
  const { cupStandings } = useSocket();

  const judges = useMemo(() => {
    if (!votingState || !Array.isArray(votingState.judges)) {
      return [];
    }
    return [...votingState.judges]
      .filter(Boolean)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [votingState]);

  const averageTarget = typeof votingState?.revealedAverage === 'number'
    ? votingState.revealedAverage
    : typeof votingState?.computedAverage === 'number'
      ? votingState.computedAverage
      : null;
  const socialTarget = typeof votingState?.revealedSocial === 'number'
    ? votingState.revealedSocial
    : typeof votingState?.computedSocial === 'number'
      ? votingState.computedSocial
      : null;

  const animatedAverage = useAnimatedNumber(averageTarget, { duration: 720, precision: 5 });
  const animatedSocial = useAnimatedNumber(socialTarget, { duration: 820, precision: 5 });

  // ── After hooks, early return if invalid
  if (!votingState) {
    return null;
  }

  // ── Derive other data
  const stageKey = (votingState.stage || 'collecting').toLowerCase();
  const stageMeta = STAGE_META[stageKey] || STAGE_META.collecting;
  const StageIcon = stageMeta.icon || TimelineIcon;
  const title = votingState.queueItem?.title || currentlyPlaying?.title || 'Untitled Performance';
  const alias = votingState.queueItem?.submitterAlias || currentlyPlaying?.submitterAlias || 'Anonymous';
  const revealReady = judges.some((j) => j.revealStatus === 'revealed')
    || ['average', 'social', 'completed'].includes(stageKey);
  const revealName =
    revealReady &&
    (votingState.queueItem?.submitterUsername || votingState.queueItem?.publicSubmitterName);

  const finalScoreValue = typeof votingState.revealedSocial === 'number'
    ? votingState.revealedSocial
    : typeof votingState.computedSocial === 'number'
      ? votingState.computedSocial
      : typeof votingState.revealedAverage === 'number'
        ? votingState.revealedAverage
          : typeof votingState.computedAverage === 'number'
            ? votingState.computedAverage
            : null;

  const showAverage = typeof votingState.revealedAverage === 'number';
  const showSocial = typeof votingState.revealedSocial === 'number';

  const finalScoreDisplay = finalScoreValue !== null
    ? finalScoreValue.toFixed(5)
    : '—';

  const cupId = votingState.cupId || null;
  const standings = cupId && cupStandings ? cupStandings[cupId] : null;

  const projectedRank = (() => {
    // Only show projected rank when social score is revealed
    if (!showSocial) {
      return null;
    }

    if (!Array.isArray(standings) || standings.length === 0) {
      return null;
    }

    const identity = (revealName || alias || '').toString().trim();
    if (!identity) {
      return null;
    }

    const normalized = identity.toLowerCase();
    const referenceScore = typeof finalScoreValue === 'number' ? finalScoreValue : null;
    if (referenceScore === null) {
      return null;
    }

    const entries = standings.map((entry) => {
      if ((entry.submitterUsername || '').toLowerCase() === normalized) {
        return {
          ...entry,
          averageScore: referenceScore
        };
      }
      return entry;
    });

    if (!entries.some((entry) => (entry.submitterUsername || '').toLowerCase() === normalized)) {
      entries.push({
        submitterUsername: identity,
        averageScore: referenceScore,
        videoCount: 1
      });
    }

    // Sort exactly like the leaderboard does
    entries.sort((a, b) => {
      // If both have rank property, use it
      if (a.rank && b.rank) {
        return a.rank - b.rank;
      }
      // Otherwise sort by averageScore (weighted average of all videos), not totalScore
      const scoreA = (typeof a.averageScore === 'number' ? a.averageScore : 0);
      const scoreB = (typeof b.averageScore === 'number' ? b.averageScore : 0);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      // Tiebreaker: videoCount (descending)
      return (b.videoCount || 0) - (a.videoCount || 0);
    });

    const index = entries.findIndex((entry) => (entry.submitterUsername || '').toLowerCase() === normalized);
    if (index === -1) {
      return null;
    }

    return {
      position: index + 1,
      total: entries.length
    };
  })();

  const formatScore = (value) => (typeof value === 'number' ? value.toFixed(5) : '—');

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        color: '#f6f9ff',
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 2.4, md: 3.2 },
        p: { xs: 2.6, md: 3.2, xl: 4 },
        pointerEvents: 'none',
        zIndex: 120,
        background: `
          linear-gradient(160deg, 
            rgba(4, 7, 18, 0.95), 
            rgba(6, 12, 28, 0.98),
            rgba(10, 8, 25, 0.96)
          )
        `,
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: '-30% -20%',
          background: `
            radial-gradient(circle at 15% 20%, rgba(92, 225, 255, 0.35), transparent 45%),
            radial-gradient(circle at 85% 15%, rgba(255, 137, 223, 0.32), transparent 42%),
            radial-gradient(circle at 50% 80%, rgba(125, 255, 179, 0.28), transparent 48%),
            radial-gradient(circle at 10% 75%, rgba(168, 144, 255, 0.26), transparent 50%)
          `,
          animation: `${nebulaDrift} 28s ease-in-out infinite`,
          pointerEvents: 'none',
          zIndex: 0
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: '-40% -40%',
          background: `
            conic-gradient(from 0deg at 30% 40%, 
              rgba(92, 225, 255, 0.15), 
              rgba(255, 137, 223, 0.12), 
              rgba(125, 255, 179, 0.13),
              rgba(255, 209, 102, 0.14),
              rgba(168, 144, 255, 0.16),
              rgba(92, 225, 255, 0.15)
            )
          `,
          animation: `${meshFloat} 35s ease-in-out infinite`,
          pointerEvents: 'none',
          zIndex: 0
        }
      }}
    >
      {/* Animated particles */}
      {Array.from({ length: 12 }).map((_, i) => (
        <Box
          key={`particle-${i}`}
          sx={{
            position: 'absolute',
            width: { xs: 3, md: 4 },
            height: { xs: 3, md: 4 },
            borderRadius: '50%',
            background: [
              'rgba(92, 225, 255, 0.6)',
              'rgba(255, 137, 223, 0.6)',
              'rgba(125, 255, 179, 0.6)',
              'rgba(255, 209, 102, 0.6)',
              'rgba(168, 144, 255, 0.6)'
            ][i % 5],
            left: `${(i * 8.33 + 5) % 100}%`,
            bottom: 0,
            animation: `${particleFloat} ${15 + i * 2}s linear ${i * -3}s infinite`,
            zIndex: 1,
            filter: 'blur(1px)',
            boxShadow: `0 0 10px ${[
              'rgba(92, 225, 255, 0.8)',
              'rgba(255, 137, 223, 0.8)',
              'rgba(125, 255, 179, 0.8)',
              'rgba(255, 209, 102, 0.8)',
              'rgba(168, 144, 255, 0.8)'
            ][i % 5]}`
          }}
        />
      ))}
      <Paper
        sx={{
          position: 'relative',
          borderRadius: { xs: 3, md: 5 },
          border: `2px solid ${alpha(stageMeta.accent, 0.5)}`,
          background: `
            linear-gradient(135deg, 
              ${alpha(stageMeta.accent, 0.35)}, 
              rgba(12, 18, 40, 0.97),
              rgba(8, 12, 35, 0.95)
            )
          `,
          boxShadow: `
            0 35px 130px -50px ${alpha(stageMeta.glow, 0.85)},
            inset 0 0 80px ${alpha(stageMeta.accent, 0.08)}
          `,
          animation: `${glowPulse} 4s ease-in-out infinite`,
          overflow: 'hidden',
          p: { xs: 2.8, md: 3.5 },
          display: 'grid',
          gridTemplateColumns: { 
            xs: '1fr', 
            md: projectedRank ? 'minmax(0, 0.9fr) minmax(0, 0.5fr) minmax(0, 0.6fr)' : 'minmax(0, 1.1fr) minmax(0, 0.9fr)'
          },
          gap: { xs: 2.2, md: 3 },
          transform: 'perspective(1000px)',
          transformStyle: 'preserve-3d'
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: `
              linear-gradient(140deg, 
                rgba(12, 18, 44, 0.85), 
                rgba(6, 10, 24, 0.95),
                rgba(15, 8, 30, 0.92)
              )
            `,
            zIndex: 0
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: '-25% -15%',
            background: `
              linear-gradient(120deg, 
                ${alpha(stageMeta.accent, 0.65)}, 
                ${alpha('#ff89df', 0.45)},
                ${alpha('#7dffb3', 0.5)},
                transparent
              )
            `,
            backgroundSize: '300% 300%',
            animation: `${heroAurora} 20s ease-in-out infinite`,
            opacity: 0.75,
            zIndex: 0,
            filter: 'blur(40px)'
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: `
              repeating-linear-gradient(
                45deg,
                transparent,
                transparent 40px,
                ${alpha(stageMeta.accent, 0.03)} 40px,
                ${alpha(stageMeta.accent, 0.03)} 80px
              )
            `,
            zIndex: 0,
            animation: `${shimmer} 3s linear infinite`,
            backgroundSize: '200% 200%'
          }}
        />

        <Stack spacing={1.8} sx={{ position: 'relative', zIndex: 1 }}>
          <Typography
            sx={{
              fontFamily: '"Rajdhani", "Poppins", sans-serif',
              fontSize: { xs: 32, md: 38 },
              fontWeight: 900,
              letterSpacing: 8,
              textTransform: 'uppercase',
              background: `linear-gradient(135deg, ${stageMeta.accent}, #ffffff, ${stageMeta.accent})`,
              backgroundSize: '200% auto',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: `${shimmer} 3s linear infinite`,
              textShadow: 'none',
              filter: `drop-shadow(0 0 20px ${alpha(stageMeta.accent, 0.6)})`
            }}
          >
            Live Voting
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: 22, md: 26 },
              fontWeight: 700,
              color: alpha('#ffffff', 0.95),
              textShadow: `0 20px 48px rgba(8, 12, 28, 0.85), 0 0 30px ${alpha(stageMeta.accent, 0.3)}`
            }}
          >
            {title}
          </Typography>
          <Stack spacing={1}>
            <Typography
              variant="caption"
              sx={{ 
                letterSpacing: 2.5, 
                textTransform: 'uppercase', 
                color: alpha('#ffffff', 0.7),
                fontSize: { xs: 11, md: 12 },
                fontWeight: 700
              }}
            >
              Contestant Identity
            </Typography>
            <Typography
              sx={{
                fontSize: { xs: 20, md: 24 },
                fontWeight: 800,
                letterSpacing: 1.5,
                color: revealReady ? '#fff5df' : alpha('#ffffff', 0.85),
                textShadow: revealReady 
                  ? `0 0 25px ${alpha('#ffd166', 0.6)}, 0 4px 15px rgba(0, 0, 0, 0.7)`
                  : '0 4px 15px rgba(0, 0, 0, 0.7)',
                background: revealReady 
                  ? `linear-gradient(135deg, #ffd166, #ffffff, #ffd166)`
                  : 'transparent',
                backgroundSize: '200% auto',
                backgroundClip: revealReady ? 'text' : 'unset',
                WebkitBackgroundClip: revealReady ? 'text' : 'unset',
                WebkitTextFillColor: revealReady ? 'transparent' : 'unset',
                animation: revealReady ? `${shimmer} 3s linear infinite` : 'none',
                fontFamily: '"Rajdhani", "Poppins", sans-serif'
              }}
            >
              {revealReady ? (revealName || alias) : `Anonymous: ${alias}`}
            </Typography>
          </Stack>
        </Stack>

        <Stack
          spacing={2}
          sx={{
            position: 'relative',
            zIndex: 1,
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'center'
          }}
        >
          <Chip
            icon={<StageIcon sx={{ color: stageMeta.accent, fontSize: 24 }} />}
            label={stageMeta.label}
            sx={{
              bgcolor: alpha(stageMeta.accent, 0.25),
              color: '#ffffff',
              letterSpacing: 1.8,
              fontWeight: 700,
              fontSize: { xs: 14, md: 16 },
              borderRadius: 999,
              border: `1px solid ${alpha(stageMeta.accent, 0.4)}`,
              backdropFilter: 'blur(10px)',
              px: 2.5,
              py: 2.2,
              boxShadow: `0 0 30px ${alpha(stageMeta.accent, 0.5)}, inset 0 0 20px ${alpha(stageMeta.accent, 0.15)}`
            }}
          />
        </Stack>

        {projectedRank && (
          <Stack
            spacing={1}
            sx={{
              position: 'relative',
              zIndex: 1,
              alignItems: { xs: 'flex-start', md: 'center' },
              justifyContent: 'center',
              p: 2,
              borderRadius: 3,
              border: `2px solid ${alpha('#ffd166', 0.6)}`,
              background: `
                linear-gradient(135deg, 
                  ${alpha('#ffd166', 0.25)}, 
                  ${alpha('#ff9f40', 0.2)}
                )
              `,
              boxShadow: `
                0 0 40px ${alpha('#ffd166', 0.6)}, 
                inset 0 0 30px ${alpha('#ffd166', 0.15)}
              `,
              animation: `${float3D} 4s ease-in-out infinite`
            }}
          >
            <Typography 
              variant="caption" 
              sx={{ 
                color: alpha('#ffffff', 0.85), 
                letterSpacing: 2,
                textTransform: 'uppercase',
                fontWeight: 700,
                fontSize: { xs: 11, md: 12 }
              }}
            >
              Projected Rank
            </Typography>
            <Typography
              sx={{
                fontSize: { xs: 42, md: 52 },
                fontWeight: 900,
                letterSpacing: 3,
                color: '#ffd166',
                textShadow: `
                  0 0 30px rgba(255, 209, 102, 0.8),
                  0 0 60px rgba(255, 209, 102, 0.5),
                  0 4px 20px rgba(0, 0, 0, 0.8)
                `,
                lineHeight: 1,
                fontFamily: '"Rajdhani", "Poppins", sans-serif'
              }}
            >
              #{projectedRank.position}
            </Typography>
            <Typography 
              variant="caption" 
              sx={{ 
                color: alpha('#ffffff', 0.75),
                fontSize: { xs: 11, md: 12 },
                fontWeight: 600
              }}
            >
              of {projectedRank.total} contestants
            </Typography>
          </Stack>
        )}
      </Paper>

      <Box
        sx={{
          flex: '1 1 auto',
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', md: 'repeat(2, minmax(0, 1fr))' },
          gap: { xs: 2.2, md: 3 },
          position: 'relative'
        }}
      >
        {judges.map((judge) => {
          const status = getJudgeStatus(judge);
          const StatusIcon = status.icon;
          const revealed = judge.revealStatus === 'revealed';
          const hasScore = typeof judge.score === 'number';

          return (
            <Paper
              key={judge.id || judge.name}
              sx={{
                position: 'relative',
                borderRadius: 3,
                overflow: 'hidden',
                p: { xs: 2.4, md: 2.8 },
                minHeight: { xs: 180, md: 220 },
                border: `2px solid ${alpha(stageMeta.accent, revealed ? 0.65 : 0.3)}`,
                background: revealed
                  ? `
                      linear-gradient(150deg, 
                        rgba(40, 55, 95, 0.92), 
                        rgba(15, 20, 40, 0.97),
                        rgba(25, 15, 50, 0.95)
                      )
                    `
                  : `
                      linear-gradient(150deg, 
                        rgba(20, 28, 46, 0.85), 
                        rgba(12, 16, 28, 0.92),
                        rgba(18, 10, 30, 0.9)
                      )
                    `,
                boxShadow: revealed
                  ? `
                      0 30px 70px -35px ${alpha(stageMeta.accent, 0.75)},
                      0 0 50px ${alpha(stageMeta.accent, 0.4)},
                      inset 0 0 60px ${alpha(stageMeta.accent, 0.12)}
                    `
                  : `
                      0 25px 60px -40px rgba(4, 8, 18, 0.8),
                      inset 0 0 40px rgba(0, 0, 0, 0.3)
                    `,
                transition: 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1), border-color 360ms ease, box-shadow 360ms ease, background 360ms ease',
                transform: revealed 
                  ? 'translateY(-10px) scale(1.03) rotateX(2deg)' 
                  : 'translateY(0) scale(1) rotateX(0deg)',
                transformStyle: 'preserve-3d',
                animation: revealed ? `${float3D} 5s ease-in-out infinite` : 'none',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: '-30% -20%',
                  background: `
                    radial-gradient(circle at 20% 30%, ${alpha(stageMeta.accent, revealed ? 0.4 : 0.2)}, transparent 50%),
                    radial-gradient(circle at 80% 70%, ${alpha('#ff89df', revealed ? 0.35 : 0.12)}, transparent 55%),
                    radial-gradient(circle at 50% 50%, ${alpha('#7dffb3', revealed ? 0.25 : 0.08)}, transparent 60%)
                  `,
                  opacity: revealed ? 1 : 0.7,
                  transition: 'opacity 360ms ease',
                  pointerEvents: 'none',
                  animation: revealed ? `${meshFloat} 25s ease-in-out infinite` : 'none',
                  filter: 'blur(30px)'
                }
              }}
            >
              <Stack spacing={2.2} sx={{ position: 'relative', zIndex: 1, height: '100%' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography
                    sx={{
                      fontSize: { xs: 28, md: 36 },
                      fontWeight: 900,
                      letterSpacing: 2,
                      color: '#ffffff',
                      maxWidth: '70%',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textShadow: `
                        0 0 20px ${alpha(stageMeta.accent, revealed ? 0.6 : 0.3)},
                        0 4px 15px rgba(0, 0, 0, 0.7)
                      `,
                      background: revealed 
                        ? `linear-gradient(135deg, ${stageMeta.accent}, #ffffff)` 
                        : '#ffffff',
                      backgroundClip: revealed ? 'text' : 'unset',
                      WebkitBackgroundClip: revealed ? 'text' : 'unset',
                      WebkitTextFillColor: revealed ? 'transparent' : 'unset',
                      fontFamily: '"Rajdhani", "Poppins", sans-serif'
                    }}
                  >
                    {judge.name || 'Judge'}
                  </Typography>
                  <Chip
                    icon={<StatusIcon sx={{ fontSize: 18 }} />}
                    label={status.label}
                    size="small"
                    sx={{
                      borderRadius: 999,
                      fontSize: 13,
                      letterSpacing: 1,
                      fontWeight: 600,
                      bgcolor: alpha(stageMeta.accent, revealed ? 0.25 : 0.12),
                      color: '#ffffff',
                      border: `1px solid ${alpha(stageMeta.accent, revealed ? 0.4 : 0.2)}`,
                      backdropFilter: 'blur(8px)',
                      px: 1.5,
                      boxShadow: revealed ? `0 0 20px ${alpha(stageMeta.accent, 0.4)}` : 'none'
                    }}
                  />
                </Stack>

                <Stack spacing={1} alignItems="center" justifyContent="center" sx={{ flexGrow: 1, width: '100%' }}>
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    justifyContent="center"
                    sx={{
                      width: '100%',
                      flexWrap: 'wrap',
                      rowGap: 1.2
                    }}
                  >
                    <Typography
                      sx={{
                        fontFamily: '"Rajdhani", "Poppins", sans-serif',
                        fontSize: { xs: 42, md: 52 },
                        fontWeight: 900,
                        letterSpacing: 3,
                        color: revealed ? '#fefefe' : alpha('#fefefe', hasScore ? 0.6 : 0.35),
                        textShadow: revealed 
                          ? `
                              0 0 30px rgba(255, 209, 102, 0.6),
                              0 0 50px ${alpha(stageMeta.accent, 0.5)},
                              0 4px 20px rgba(0, 0, 0, 0.8)
                            ` 
                          : 'none',
                        lineHeight: 1
                      }}
                    >
                      {revealed && hasScore ? judge.score.toFixed(5) : hasScore ? 'Locked' : '·····'}
                    </Typography>
                    <StarRating
                      value={hasScore ? judge.score : 0}
                      size={42}
                      glow={revealed}
                    />
                  </Stack>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: alpha('#ffffff', 0.72), 
                      letterSpacing: 1.2,
                      fontSize: { xs: 12, md: 13 },
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}
                  >
                    {revealed
                      ? '✨ Score revealed'
                      : hasScore
                        ? '🔒 Locked • awaiting reveal'
                        : '⏳ Waiting for submission'}
                  </Typography>
                </Stack>
              </Stack>
            </Paper>
          );
        })}
      </Box>

      {(showAverage || showSocial) && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: showAverage && showSocial ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' },
            gap: { xs: 2, md: 3 }
          }}
        >
          {showAverage && (
            <Paper
              sx={{
                position: 'relative',
                borderRadius: 3,
                overflow: 'hidden',
                p: { xs: 2.4, md: 2.8 },
                border: `1px solid ${alpha('#7dffb3', 0.48)}`,
                background: 'linear-gradient(140deg, rgba(62, 86, 124, 0.78), rgba(24, 34, 58, 0.92))',
                boxShadow: '0 26px 64px -34px rgba(125, 255, 179, 0.55)'
              }}
            >
              <Stack spacing={1.2}>
                <Stack direction="row" spacing={1.4} alignItems="center" justifyContent="space-between">
                  <Stack direction="row" spacing={1.2} alignItems="center">
                    <EmojiEventsIcon sx={{ color: '#a9ffe0' }} />
                    <Typography sx={{ fontWeight: 700, letterSpacing: 1.4 }}>Judge Average</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1.6} alignItems="center">
                    <Typography
                      sx={{
                        fontSize: { xs: 34, md: 40 },
                        fontWeight: 800,
                        letterSpacing: 2,
                        color: '#eafff4'
                      }}
                    >
                      {formatScore(animatedAverage)}
                    </Typography>
                    <StarRating
                      value={animatedAverage}
                      size={36}
                      glow
                    />
                  </Stack>
                </Stack>
                <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.72) }}>
                  Judge consensus locked.
                </Typography>
              </Stack>
            </Paper>
          )}

          {showSocial && (
            <Paper
              sx={{
                position: 'relative',
                borderRadius: 3,
                overflow: 'hidden',
                p: { xs: 2.4, md: 2.8 },
                border: `1px solid ${alpha('#ffd166', 0.55)}`,
                background: 'linear-gradient(150deg, rgba(78, 54, 26, 0.75), rgba(28, 20, 10, 0.92))',
                boxShadow: '0 30px 78px -36px rgba(255, 209, 102, 0.6)'
              }}
            >
              <Stack spacing={1.3}>
                <Stack direction="row" spacing={1.4} alignItems="center" justifyContent="space-between">
                  <Stack direction="row" spacing={1.2} alignItems="center">
                    <EqualizerIcon sx={{ color: '#ffd166' }} />
                    <Typography sx={{ fontWeight: 700, letterSpacing: 1.4 }}>Final Social Score</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1.6} alignItems="center">
                    <Typography
                      sx={{
                        fontSize: { xs: 34, md: 40 },
                        fontWeight: 800,
                        letterSpacing: 2,
                        color: '#fff4dc'
                      }}
                    >
                      {finalScoreDisplay}
                    </Typography>
                    <StarRating
                      value={finalScoreValue}
                      size={38}
                      glow
                    />
                  </Stack>
                </Stack>
                <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.74) }}>
                  Final weighted score ready.
                </Typography>
              </Stack>
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
};

export default VotingOverlay;
