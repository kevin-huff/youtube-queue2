import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { keyframes } from '@emotion/react';

const DEFAULT_DURATION_MS = 8000;

const burstIn = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.2);
    filter: blur(18px) brightness(2.2);
  }
  35% {
    opacity: 1;
    transform: scale(1.15);
    filter: blur(0px) brightness(1.6);
  }
  55% {
    transform: scale(0.96);
  }
  75% {
    transform: scale(1.03);
  }
  100% {
    opacity: 1;
    transform: scale(1);
    filter: blur(0px) brightness(1);
  }
`;

const shimmer = keyframes`
  0%, 100% {
    text-shadow: 0 0 18px rgba(255, 215, 0, 0.9), 0 0 60px rgba(255, 180, 0, 0.55);
  }
  50% {
    text-shadow: 0 0 32px rgba(255, 235, 130, 1), 0 0 90px rgba(255, 200, 40, 0.8);
  }
`;

const rayspin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const confettiFall = keyframes`
  0% {
    transform: translateY(-8vh) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(110vh) rotate(720deg);
    opacity: 0.4;
  }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const CONFETTI_COLORS = ['#ffd700', '#ffea70', '#ffb300', '#fff8dc', '#f5c518'];

const ConfettiPiece = ({ index }) => {
  const left = (index * 37) % 100;
  const delay = ((index * 53) % 20) / 10;
  const duration = 3 + ((index * 29) % 25) / 10;
  const size = 8 + ((index * 17) % 10);
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: `${left}%`,
        width: size,
        height: size * (index % 2 ? 0.4 : 1),
        bgcolor: color,
        borderRadius: index % 3 === 0 ? '50%' : '2px',
        animation: `${confettiFall} ${duration}s linear ${delay}s infinite`,
        willChange: 'transform'
      }}
    />
  );
};

// Full-screen golden takeover shown when a judge slams the golden buzzer.
// Drive it with the `goldenBuzzerEvent` from SocketContext; it dismisses
// itself and ignores stale events (e.g. on page reload).
const GoldenBuzzerSplash = ({ event, durationMs = DEFAULT_DURATION_MS }) => {
  const [visible, setVisible] = useState(false);
  const seenRef = useRef(null);

  useEffect(() => {
    if (!event?.at || seenRef.current === event.at) {
      return undefined;
    }
    const receivedAt = event.receivedAt || Date.now();
    if (Date.now() - receivedAt > durationMs) {
      return undefined;
    }
    seenRef.current = event.at;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), durationMs);
    return () => clearTimeout(timer);
  }, [event, durationMs]);

  const confetti = useMemo(() => Array.from({ length: 36 }, (_, i) => i), []);

  if (!visible || !event) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 2400,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        background: 'radial-gradient(circle at center, rgba(255, 200, 40, 0.55) 0%, rgba(120, 80, 0, 0.75) 55%, rgba(20, 12, 0, 0.92) 100%)',
        animation: `${fadeOut} 600ms ease-in ${durationMs - 600}ms forwards`
      }}
    >
      {/* Rotating light rays */}
      <Box
        sx={{
          position: 'absolute',
          width: '220vmax',
          height: '220vmax',
          background: 'repeating-conic-gradient(rgba(255, 220, 90, 0.16) 0deg 12deg, transparent 12deg 24deg)',
          animation: `${rayspin} 24s linear infinite`,
          willChange: 'transform'
        }}
      />

      {confetti.map((i) => (
        <ConfettiPiece key={i} index={i} />
      ))}

      <Box
        sx={{
          position: 'relative',
          textAlign: 'center',
          px: 4,
          animation: `${burstIn} 900ms cubic-bezier(0.22, 1.4, 0.36, 1) both`
        }}
      >
        <Typography
          sx={{
            fontSize: 'clamp(3.5rem, 10vw, 8rem)',
            lineHeight: 1,
            mb: 1
          }}
        >
          ⭐
        </Typography>
        <Typography
          sx={{
            fontWeight: 900,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: 'clamp(2.4rem, 8vw, 6.5rem)',
            lineHeight: 1.05,
            color: '#ffd700',
            animation: `${shimmer} 1.6s ease-in-out infinite`
          }}
        >
          Golden Buzzer
        </Typography>
        <Typography
          sx={{
            mt: 2,
            fontWeight: 700,
            fontSize: 'clamp(1.4rem, 3.5vw, 2.6rem)',
            color: '#fff8dc'
          }}
        >
          {event.judgeName || 'A judge'} saved this video!
        </Typography>
        {event.queueItem?.title && (
          <Typography
            sx={{
              mt: 1,
              fontWeight: 500,
              fontSize: 'clamp(1rem, 2.2vw, 1.6rem)',
              color: 'rgba(255, 248, 220, 0.85)',
              maxWidth: '70vw',
              mx: 'auto'
            }}
            noWrap
          >
            {event.queueItem.title}
          </Typography>
        )}
        <Typography
          sx={{
            mt: 2.5,
            display: 'inline-block',
            px: 3,
            py: 1,
            borderRadius: 999,
            border: '2px solid rgba(255, 215, 0, 0.8)',
            bgcolor: 'rgba(0, 0, 0, 0.45)',
            fontWeight: 800,
            letterSpacing: '0.06em',
            fontSize: 'clamp(1rem, 2.4vw, 1.8rem)',
            color: '#ffe97a'
          }}
        >
          ALL SCORES OVERRIDDEN — PERFECT 5.0
        </Typography>
      </Box>
    </Box>
  );
};

export default GoldenBuzzerSplash;
