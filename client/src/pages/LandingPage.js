import React from 'react';
import { 
  Box, 
  Container, 
  Typography, 
  Button, 
  Chip,
  Stack,
  useTheme,
  alpha
} from '@mui/material';
import { 
  Security, 
  LiveTv
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import HeroCanvas from '../components/HeroCanvas';

const LandingPage = () => {
  const theme = useTheme();
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  return (
    <Box 
      sx={{ 
        minHeight: '100vh',
        background: theme.palette.gradients?.surface || `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.1)} 0%, ${alpha(theme.palette.background.default, 0.9)} 100%)`,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* 3D immersive canvas */}
      <HeroCanvas palette={theme.palette.neon} />

      {/* Soft aurora blur overlays for depth */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.7 }}>
        <Box sx={{ position: 'absolute', top: -200, right: -150, width: 520, height: 520, borderRadius: '50%', filter: 'blur(80px)', background: `radial-gradient(circle, ${alpha(theme.palette.neon.pink, 0.25)} 0%, transparent 60%)` }} />
        <Box sx={{ position: 'absolute', bottom: -220, left: -220, width: 640, height: 640, borderRadius: '50%', filter: 'blur(90px)', background: `radial-gradient(circle, ${alpha(theme.palette.neon.blue, 0.18)} 0%, transparent 60%)` }} />
      </Box>

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        {/* Hero Section */}
        <Box sx={{ pt: { xs: 10, md: 14 }, pb: { xs: 8, md: 12 }, textAlign: 'center' }}>
          <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 3 }}>
            <Chip label="Open source" size="small" sx={{ fontWeight: 600, bgcolor: alpha(theme.palette.neon.blue, 0.12), color: theme.palette.neon.blue, border: `1px solid ${alpha(theme.palette.neon.blue, 0.4)}` }} />
            <Chip label="Dark mode" size="small" sx={{ fontWeight: 600, bgcolor: alpha(theme.palette.neon.pink, 0.12), color: theme.palette.neon.pink, border: `1px solid ${alpha(theme.palette.neon.pink, 0.4)}` }} />
            <Chip label="3D overlays" size="small" sx={{ fontWeight: 600, bgcolor: alpha(theme.palette.neon.purple, 0.12), color: theme.palette.neon.purple, border: `1px solid ${alpha(theme.palette.neon.purple, 0.4)}` }} />
          </Stack>

          <Typography 
            variant="h1" 
            gutterBottom
            sx={{
              fontWeight: 900,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              mx: 'auto',
              maxWidth: 900,
              background: theme.palette.gradients?.primary,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: `0 0 40px ${alpha(theme.palette.neon.pink, 0.25)}`,
            }}
          >
            Mediashare for Live Gameshows
          </Typography>

          <Typography 
            variant="h5" 
            color="text.secondary" 
            sx={{ mb: 5, maxWidth: 720, mx: 'auto', fontWeight: 400 }}
          >
            Minimal, fast, and fun. Bold neon visuals, real-time sync, and overlays that feel alive — without the sales pitch.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" alignItems="center">
            <Button 
              variant="contained" 
              size="large" 
              onClick={() => login({ redirectTo: '/onboarding' })}
              startIcon={<LiveTv />}
              sx={{ 
                py: 1.5, 
                px: 3,
                fontSize: '1.05rem',
                background: theme.palette.gradients?.primary,
                boxShadow: `0 12px 40px ${alpha(theme.palette.neon.pink, 0.25)}`,
                '&:hover': {
                  filter: 'brightness(1.05)',
                  boxShadow: `0 14px 50px ${alpha(theme.palette.neon.pink, 0.35)}`,
                }
              }}
            >
              Login with Twitch
            </Button>
            <Button
              variant="text"
              color="secondary"
              onClick={() => login({ redirectTo: '/dashboard?tab=moderation' })}
              startIcon={<Security />}
              sx={{ opacity: 0.9 }}
            >
              Moderator login
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            No paywalls • Built for Twitch • Immersive dark mode
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default LandingPage;
