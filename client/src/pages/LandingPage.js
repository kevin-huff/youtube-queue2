import React from 'react';
import { 
  Box, 
  Container, 
  Typography, 
  Button, 
  Chip,
  Stack,
  Link,
  Grid,
  TextField,
  useTheme,
  alpha
} from '@mui/material';
import { 
  Security, 
  LiveTv,
  CheckCircleOutline,
  Layers,
  GraphicEq,
  EmojiEvents,
  Leaderboard,
  Link as LinkIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
const HeroCanvasLazy = React.lazy(() => import('../components/HeroCanvas'));

const LandingPage = () => {
  const theme = useTheme();
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [viewerChannel, setViewerChannel] = React.useState('');

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  // Decide if we should render the 3D hero (respect reduced motion, WebGL support, and small screens)
  const [canRender3D, setCanRender3D] = React.useState(false);
  React.useEffect(() => {
    try {
      if (process.env.REACT_APP_DISABLE_3D === '1') {
        setCanRender3D(false);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get('three') === '0') {
        setCanRender3D(false);
        return;
      }
      const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) {
        setCanRender3D(false);
        return;
      }
      // Avoid on very small screens
      if (window.innerWidth < 420) {
        setCanRender3D(false);
        return;
      }
      // Basic WebGL support probe
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      setCanRender3D(Boolean(gl));
    } catch (_) {
      setCanRender3D(false);
    }
  }, []);

  return (
    <Box 
      sx={{ 
        minHeight: '100vh',
        background: theme.palette.gradients?.surface || `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.1)} 0%, ${alpha(theme.palette.background.default, 0.9)} 100%)`,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* 3D immersive canvas (lazy, gated) */}
      {canRender3D && (
        <React.Suspense fallback={null}>
          <HeroCanvasLazy palette={theme.palette.neon} />
        </React.Suspense>
      )}

      {/* Soft aurora blur overlays for depth */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.7 }}>
        <Box sx={{ position: 'absolute', top: -200, right: -150, width: 520, height: 520, borderRadius: '50%', filter: 'blur(80px)', background: `radial-gradient(circle, ${alpha(theme.palette.neon.pink, 0.25)} 0%, transparent 60%)` }} />
        <Box sx={{ position: 'absolute', bottom: -220, left: -220, width: 640, height: 640, borderRadius: '50%', filter: 'blur(90px)', background: `radial-gradient(circle, ${alpha(theme.palette.neon.blue, 0.18)} 0%, transparent 60%)` }} />
      </Box>

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        {/* Hero Section */}
        <Box sx={{ pt: { xs: 10, md: 12 }, pb: { xs: 6, md: 8 } }}>
          <Box
            sx={{
              mx: 'auto',
              maxWidth: 980,
              p: { xs: 3, md: 4 },
              textAlign: 'center',
              borderRadius: 3,
              background: `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.7)}, ${alpha(theme.palette.background.paper, 0.5)})`,
              backdropFilter: 'blur(16px) saturate(120%)',
              border: `1px solid ${alpha(theme.palette.neon.pink, 0.25)}`,
              boxShadow: `0 20px 80px ${alpha('#000', 0.45)}`,
            }}
          >
            <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 2 }}>
              <Chip label="Live gameshow" size="small" sx={{ fontWeight: 600, bgcolor: alpha(theme.palette.neon.blue, 0.12), color: theme.palette.neon.blue, border: `1px solid ${alpha(theme.palette.neon.blue, 0.4)}` }} />
              <Chip label="Scores + reveal" size="small" sx={{ fontWeight: 600, bgcolor: alpha(theme.palette.neon.pink, 0.12), color: theme.palette.neon.pink, border: `1px solid ${alpha(theme.palette.neon.pink, 0.4)}` }} />
              <Chip label="OBS overlays" size="small" sx={{ fontWeight: 600, bgcolor: alpha(theme.palette.neon.purple, 0.12), color: theme.palette.neon.purple, border: `1px solid ${alpha(theme.palette.neon.purple, 0.4)}` }} />
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
              Make Mediashare a Competition
            </Typography>

            <Typography 
              variant="h6" 
              color="text.secondary" 
              sx={{ mb: 3, maxWidth: 880, mx: 'auto', fontWeight: 400 }}
            >
              Your streamer runs the show. Viewers drop clips, judges score, reveals hit live, and the leaderboard climbs. Its mediashare — turned into a gameshow.
            </Typography>

            {/* Dual CTA: Watch a show (viewer) and Start a show (creator) */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="center" alignItems="stretch">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: { xs: '100%', md: 540 } }}>
                <TextField
                  label="Channel ID (e.g., yourtwitchname)"
                  value={viewerChannel}
                  onChange={(e) => setViewerChannel(e.target.value.trim().toLowerCase())}
                  fullWidth
                  size="small"
                />
                <Button
                  variant="outlined"
                  disabled={!viewerChannel}
                  href={viewerChannel ? `/viewer/${viewerChannel}` : undefined}
                  startIcon={<LinkIcon />}
                >
                  Watch Viewer Hub
                </Button>
              </Stack>
              <Button 
                variant="contained" 
                size="large" 
                onClick={() => login({ redirectTo: '/onboarding' })}
                startIcon={<LiveTv />}
                sx={{ 
                  py: 1.3, 
                  px: 3,
                  fontSize: '1.05rem',
                  background: theme.palette.gradients?.primary,
                  boxShadow: `0 12px 40px ${alpha(theme.palette.neon.pink, 0.25)}`,
                  '&:hover': {
                    filter: 'brightness(1.05)',
                    boxShadow: `0 14px 50px ${alpha(theme.palette.neon.pink, 0.35)}`,
                  },
                  width: { xs: '100%', md: 'auto' }
                }}
              >
                Start a Show
              </Button>
            </Stack>
          </Box>
        </Box>

        {/* Content Panel */}
        <Box
          sx={{
            mx: 'auto',
            mb: 10,
            maxWidth: 1100,
            px: { xs: 2, md: 4 },
          }}
        >
          <Box
            sx={{
              p: { xs: 3, md: 5 },
              borderRadius: 3,
              background: `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.65)}, ${alpha(theme.palette.background.paper, 0.45)})`,
              backdropFilter: 'blur(16px) saturate(120%)',
              border: `1px solid ${alpha(theme.palette.neon.blue, 0.25)}`,
              boxShadow: `0 20px 80px ${alpha('#000', 0.4)}`,
            }}
          >
            {/* What it is */}
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
              What is FREE* Mediashare?
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 900 }}>
              A mediashare that plays like a competition. Viewers submit clips, judges score with precision, and standings update live. Overlays keep everyone in on the reveal.
            </Typography>

            {/* Features */}
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Stack spacing={1.5} alignItems="flex-start">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CheckCircleOutline sx={{ color: theme.palette.neon.pink }} />
                    <Typography variant="h6" fontWeight={700}>Real‑time Queue</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Queue opens, chat drops links, VIP gets priority, and moderators keep it clean.
                  </Typography>
                </Stack>
              </Grid>
              <Grid item xs={12} md={4}>
                <Stack spacing={1.5} alignItems="flex-start">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Layers sx={{ color: theme.palette.neon.blue }} />
                    <Typography variant="h6" fontWeight={700}>Cups + Judging</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Precision scores, lock + reveal moments, standings, and easy judge links for your panel.
                  </Typography>
                </Stack>
              </Grid>
              <Grid item xs={12} md={4}>
                <Stack spacing={1.5} alignItems="flex-start">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <GraphicEq sx={{ color: theme.palette.neon.purple }} />
                    <Typography variant="h6" fontWeight={700}>Overlays</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Player, queue, leaderboard, and judge overlays — built for OBS and synced to the show.
                  </Typography>
                </Stack>
              </Grid>
            </Grid>

            {/* How it plays */}
            <Box sx={{ mt: 4 }}>
              <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
                How it plays
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <LinkIcon sx={{ color: theme.palette.neon.blue }} />
                      <Typography variant="subtitle1" fontWeight={700}>Drop a link</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">When the queue is open, paste your clip in chat. VIPs jump the line.</Typography>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <EmojiEvents sx={{ color: theme.palette.neon.pink }} />
                      <Typography variant="subtitle1" fontWeight={700}>Get scored live</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">Judges lock scores. If your clip returns, beat your last average or get zero.</Typography>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Leaderboard sx={{ color: theme.palette.neon.purple }} />
                      <Typography variant="subtitle1" fontWeight={700}>Climb the board</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">Standings update as the show runs. Top spots get the glory.</Typography>
                  </Stack>
                </Grid>
              </Grid>
            </Box>

            {/* About */}
            <Box sx={{ mt: 5, pt: 4, borderTop: `1px dashed ${alpha(theme.palette.divider, 0.6)}` }}>
              <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
                About
              </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Built by Kevin Huff. Visuals and front‑page redesign crafted with help from an AI coding assistant in the Codex CLI. Open‑source and tuned for shows.
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Link href="https://github.com/kevin-huff/youtube-queue2" target="_blank" rel="noopener" underline="hover" color="inherit">
                  GitHub Repository
                </Link>
              </Stack>
            </Box>
          </Box>
        </Box>

        {/* Viewer quick links */}
        <Box sx={{ mx: 'auto', mb: 12, maxWidth: 1100, px: { xs: 2, md: 4 } }}>
          <Box
            sx={{
              p: { xs: 3, md: 4 },
              borderRadius: 3,
              background: `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.6)}, ${alpha(theme.palette.background.paper, 0.4)})`,
              backdropFilter: 'blur(12px) saturate(120%)',
              border: `1px solid ${alpha(theme.palette.neon.blue, 0.25)}`,
              boxShadow: `0 16px 64px ${alpha('#000', 0.35)}`,
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
              For Viewers
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 900 }}>
              Jump straight to a channel’s public pages. Enter a channel ID to get links you can open in a new tab or add as OBS browser sources.
            </Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 2 }}>
              <TextField
                label="Channel ID (e.g., yourtwitchname)"
                value={viewerChannel}
                onChange={(e) => setViewerChannel(e.target.value.trim().toLowerCase())}
                fullWidth
                size="small"
              />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                <Button variant="outlined" disabled={!viewerChannel} href={viewerChannel ? `/viewer/${viewerChannel}` : undefined}>
                  Viewer Hub
                </Button>
                <Button variant="outlined" disabled={!viewerChannel} href={viewerChannel ? `/overlay/${viewerChannel}/queue` : undefined}>
                  Queue Overlay
                </Button>
                <Button variant="outlined" disabled={!viewerChannel} href={viewerChannel ? `/overlay/${viewerChannel}/leaderboard` : undefined}>
                  Leaderboard Overlay
                </Button>
              </Stack>
            </Stack>

            <Typography variant="caption" color="text.disabled">
              Pro tip: Paste overlay links into OBS as Browser Sources at your canvas size.
            </Typography>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default LandingPage;
