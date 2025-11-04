import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Chip,
  Stack,
  Avatar,
  Divider,
  CircularProgress,
  Alert,
  Link,
  Tooltip,
  useTheme,
  alpha
} from '@mui/material';
import {
  EmojiEvents as TrophyIcon,
  VideoLibrary as VideoIcon,
  Assessment as AssessmentIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';

const SERVER_BASE = process.env.REACT_APP_SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : '');
const API_URL = `${SERVER_BASE}/api`;

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleString();
  } catch (_) {
    return dateString;
  }
}

function round(n, d = 2) {
  if (typeof n !== 'number') return n;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export default function SubmitterProfile() {
  const { username } = useParams();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_URL}/public/submitters/${encodeURIComponent(username)}`);
        if (!res.ok) throw new Error('Failed to load submitter profile');
        const data = await res.json();
        if (!cancelled) setProfile(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (username) run();
    return () => { cancelled = true; };
  }, [username]);

  const totalStats = useMemo(() => {
    if (!profile) return { totalVideos: 0, totalJudgeCount: 0 };
    return profile.stats || { totalVideos: 0, totalJudgeCount: 0 };
  }, [profile]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading submitter profile...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: theme.palette.gradients?.surface || `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.1)} 0%, ${alpha(theme.palette.background.default, 0.9)} 100%)`,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Soft aurora overlays for depth */}
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.7 }}>
        <Box sx={{ position: 'absolute', top: -200, right: -150, width: 520, height: 520, borderRadius: '50%', filter: 'blur(80px)', background: `radial-gradient(circle, ${alpha(theme.palette.neon.pink, 0.25)} 0%, transparent 60%)` }} />
        <Box sx={{ position: 'absolute', bottom: -220, left: -220, width: 640, height: 640, borderRadius: '50%', filter: 'blur(90px)', background: `radial-gradient(circle, ${alpha(theme.palette.neon.blue, 0.18)} 0%, transparent 60%)` }} />
        {/* Subtle neon dot grid to differentiate from home */}
        <Box sx={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(${alpha(theme.palette.neon.blue, 0.08)} 1px, transparent 1px), radial-gradient(${alpha(theme.palette.neon.pink, 0.06)} 1px, transparent 1px)`,
          backgroundSize: '24px 24px, 24px 24px',
          backgroundPosition: '0 0, 12px 12px',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.8))'
        }} />
        {/* Diagonal light beam */}
        <Box sx={{
          position: 'absolute',
          top: '10%', left: '-10%',
          width: '140%', height: 120,
          transform: 'rotate(-8deg)',
          background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.neon.purple, 0.25)}, transparent)`,
          filter: 'blur(30px)'
        }} />
      </Box>

      <Container maxWidth="lg" sx={{ py: 4, position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <Box
          sx={{
            mx: 'auto',
            maxWidth: 980,
            p: { xs: 3, md: 4 },
            mb: 4,
            textAlign: 'center',
            borderRadius: 3,
            background: `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.7)}, ${alpha(theme.palette.background.paper, 0.5)})`,
            backdropFilter: 'blur(16px) saturate(120%)',
            border: `1px solid ${alpha(theme.palette.neon.pink, 0.25)}`,
            boxShadow: `0 20px 80px ${alpha('#000', 0.45)}`,
          }}
        >
          <Typography variant="h2" sx={{
            fontWeight: 800,
            background: theme.palette.gradients?.primary || `linear-gradient(135deg, ${theme.palette.neon.blue} 0%, ${theme.palette.neon.pink} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {profile?.submitter?.username || username}
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2, flexWrap: 'wrap' }}>
            <Chip 
              icon={<VideoIcon />} 
              label={`${totalStats.totalVideos || 0} rated videos`} 
              sx={{
                fontWeight: 600,
                bgcolor: alpha(theme.palette.neon.blue, 0.12),
                color: theme.palette.neon.blue,
                border: `1px solid ${alpha(theme.palette.neon.blue, 0.35)}`
              }} 
              variant="outlined"
            />
            <Chip 
              icon={<AssessmentIcon />} 
              label={`${totalStats.totalJudgeCount || 0} total judge votes`} 
              sx={{
                fontWeight: 600,
                bgcolor: alpha(theme.palette.neon.pink, 0.12),
                color: theme.palette.neon.pink,
                border: `1px solid ${alpha(theme.palette.neon.pink, 0.35)}`
              }} 
              variant="outlined"
            />
          </Stack>
        </Box>

        {/* Content */}
        <Grid container spacing={3}>
          {(profile?.cups || []).map((cup) => (
            <Grid item xs={12} key={cup.cup.id}>
              <Card
                sx={{
                  background: `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.9)}, ${alpha(theme.palette.background.paper, 0.75)})`,
                  border: `1px solid ${alpha(theme.palette.neon.purple, 0.15)}`,
                }}
              >
                <CardHeader
                  title={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Avatar src={cup.channel?.profileImageUrl || ''} alt={cup.channel?.displayName || cup.channel?.id}>
                        {(cup.channel?.displayName || cup.channel?.id || '?').slice(0, 1).toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                          {cup.cup.title} <Chip size="small" label={cup.cup.status} sx={{ ml: 1, bgcolor: alpha(theme.palette.neon.purple, 0.12), border: `1px solid ${alpha(theme.palette.neon.purple, 0.3)}` }} />
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
                          {cup.channel?.displayName || cup.channel?.id} • {cup.cup.slug}
                        </Typography>
                      </Box>
                    </Stack>
                  }
                  action={
                    cup.standing ? (
                      <Stack direction="row" spacing={1} sx={{ pr: 2 }}>
                        <Chip icon={<TrophyIcon />} label={`Rank ${cup.standing.rank || '-'}`} sx={{ bgcolor: alpha(theme.palette.success.main, 0.15), border: `1px solid ${alpha(theme.palette.success.main, 0.35)}`, color: theme.palette.success.main }} variant="outlined" />
                        <Chip label={`Avg ${round(Number(cup.standing.averageScore) || 0, 2)}`} sx={{ bgcolor: alpha(theme.palette.neon.blue, 0.12), border: `1px solid ${alpha(theme.palette.neon.blue, 0.35)}`, color: theme.palette.neon.blue }} variant="outlined" />
                        <Chip label={`Judges ${cup.standing.judgeCount || 0}`} sx={{ bgcolor: alpha(theme.palette.neon.pink, 0.12), border: `1px solid ${alpha(theme.palette.neon.pink, 0.35)}`, color: theme.palette.neon.pink }} variant="outlined" />
                      </Stack>
                    ) : null
                  }
                />
                <CardContent>
                  <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                    <Chip icon={<VideoIcon />} label={`${cup?.stats?.videoCount || 0} videos`} variant="outlined" sx={{ bgcolor: alpha(theme.palette.neon.blue, 0.08), border: `1px solid ${alpha(theme.palette.neon.blue, 0.25)}` }} />
                    <Chip icon={<AssessmentIcon />} label={`${cup?.stats?.judgeCount || 0} judge votes`} variant="outlined" sx={{ bgcolor: alpha(theme.palette.neon.pink, 0.08), border: `1px solid ${alpha(theme.palette.neon.pink, 0.25)}` }} />
                  </Stack>

                  <Grid container spacing={2}>
                    {cup.videos.map((v) => (
                      <Grid item xs={12} md={6} key={v.queueItemId}>
                        <Card variant="outlined" sx={{ border: `1px solid ${alpha(theme.palette.neon.purple, 0.15)}` }}>
                          <CardContent>
                            <Stack direction="row" spacing={2}>
                              <Box
                                sx={{
                                  width: 120,
                                  height: 67,
                                  flex: '0 0 auto',
                                  backgroundColor: '#111',
                                  backgroundImage: v.thumbnailUrl ? `url(${v.thumbnailUrl})` : 'none',
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                  borderRadius: 1,
                                }}
                              />
                              <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Link href={v.videoUrl} target="_blank" rel="noopener" underline="hover">
                                    {v.title || v.videoId}
                                  </Link>
                                  <OpenInNewIcon fontSize="small" sx={{ opacity: 0.7 }} />
                                </Stack>
                                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                                  {v.playedAt ? `Played ${formatDate(v.playedAt)}` : `Submitted ${formatDate(v.createdAt)}`}
                                </Typography>
                                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                  <Chip size="small" label={`Social ${round(v.socialScore || v.averageScore || 0, 2)}`} sx={{ bgcolor: alpha(theme.palette.neon.blue, 0.12), border: `1px solid ${alpha(theme.palette.neon.blue, 0.35)}`, color: theme.palette.neon.blue }} variant="outlined" />
                                  <Chip size="small" label={`${v.judgeCount} judges`} sx={{ bgcolor: alpha(theme.palette.neon.pink, 0.12), border: `1px solid ${alpha(theme.palette.neon.pink, 0.35)}`, color: theme.palette.neon.pink }} variant="outlined" />
                                </Stack>

                                {/* Judges */}
                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                                  {v.judgeScores.map((js) => (
                                    <Tooltip key={js.id} title={js.comment || ''} arrow>
                                      <Chip size="small" label={`${js.judgeName || 'Judge'}: ${round(js.score, 2)}`} sx={{ bgcolor: alpha(theme.palette.neon.purple, 0.08), border: `1px solid ${alpha(theme.palette.neon.purple, 0.25)}` }} variant="outlined" />
                                    </Tooltip>
                                  ))}
                                </Stack>
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {(!profile?.cups || profile.cups.length === 0) && (
          <Card sx={{ mt: 4 }}>
            <CardContent>
              <Typography>No rated videos found for this submitter yet.</Typography>
            </CardContent>
          </Card>
        )}

        <Divider sx={{ my: 4 }} />
        <Stack direction="row" spacing={2} justifyContent="center">
          <Link component={RouterLink} to="/" underline="hover">
            Back to Home
          </Link>
        </Stack>
      </Container>
    </Box>
  );
}
