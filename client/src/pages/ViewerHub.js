import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
  Paper,
  CircularProgress,
  Alert,
  Stack,
  IconButton
} from '@mui/material';
import {
  EmojiEvents as TrophyIcon,
  Queue as QueueIcon,
  CalendarToday as CalendarIcon,
  OpenInNew as OpenInNewIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

// Derive API base similar to other pages to avoid mixed content and CSP issues
const SERVER_BASE = process.env.REACT_APP_SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : '');
const API_URL = `${SERVER_BASE}/api`;

function ViewerHub() {
  const { channelName } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [channelInfo, setChannelInfo] = useState(null);
  const [currentCup, setCurrentCup] = useState(null);
  const [allCups, setAllCups] = useState([]);
  const [queue, setQueue] = useState([]);
  const [standings, setStandings] = useState([]);
  const [cupVideos, setCupVideos] = useState([]);
  const [vipQueue, setVipQueue] = useState([]);

  // Section anchors for quick navigation
  const vipRef = useRef(null);
  const cupRef = useRef(null);
  const queueRef = useRef(null);
  const cupsRef = useRef(null);

  const scrollTo = (ref) => {
    if (ref && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Prefer alias but always show real username when available
  const formatName = useCallback((alias, username) => {
    const a = (alias || '').toString().trim();
    const u = (username || '').toString().trim();
    if (a && u && a.toLowerCase() !== u.toLowerCase()) {
      return `${a} (real: ${u})`;
    }
    return a || u || 'Anonymous';
  }, []);

  const fetchData = useCallback(async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch channel info
        const channelRes = await fetch(`${API_URL}/channels/public/${channelName}`);
        if (!channelRes.ok) throw new Error('Channel not found');
        const channelData = await channelRes.json();
        setChannelInfo(channelData.channel);

        // Fetch current cup
        try {
          const currentCupRes = await fetch(`${API_URL}/channels/public/${channelName}/cups/current`);
          if (currentCupRes.ok) {
            const currentCupData = await currentCupRes.json();
            setCurrentCup(currentCupData.cup);

            // Fetch standings for current cup
            const standingsRes = await fetch(
              `${API_URL}/channels/public/${channelName}/cups/${currentCupData.cup.id}/standings`
            );
            if (standingsRes.ok) {
              const standingsData = await standingsRes.json();
              setStandings(standingsData.standings);
              setCupVideos(standingsData.videos || []);
            }
          }
        } catch (err) {
          console.log('No current cup available');
        }

        // Fetch all cups
        const cupsRes = await fetch(`${API_URL}/channels/public/${channelName}/cups`);
        if (cupsRes.ok) {
          const cupsData = await cupsRes.json();
          setAllCups(cupsData.cups);
        }

        // Fetch current queue
        try {
          const queueRes = await fetch(`${API_URL}/channels/public/${channelName}/queue`);
          if (queueRes.ok) {
            const queueData = await queueRes.json();
            setQueue(queueData.queue || []);
          }
        } catch (err) {
          console.log('Queue not available');
        }

        // Fetch VIP queue (FIFO list of queue item IDs)
        try {
          const vipRes = await fetch(`${API_URL}/channels/public/${channelName}/vip`);
          if (vipRes.ok) {
            const vipData = await vipRes.json();
            const ids = Array.isArray(vipData.vipQueue) ? vipData.vipQueue : [];
            setVipQueue(ids);
          }
        } catch (err) {
          console.log('VIP list not available');
        }

        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
  }, [channelName]);

  useEffect(() => {
    if (channelName) {
      fetchData();
    }
  }, [channelName, fetchData]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'LIVE':
        return 'error';
      case 'COMPLETED':
        return 'success';
      case 'SCHEDULED':
        return 'warning';
      default:
        return 'default';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading channel information...</Typography>
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
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1a2e 50%, #16213e 100%)',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 20% 50%, rgba(98, 0, 234, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255, 0, 110, 0.1) 0%, transparent 50%)',
          pointerEvents: 'none'
        }
      }}
    >
      <Container maxWidth="lg" sx={{ py: 4, position: 'relative', zIndex: 1 }}>
        {/* Channel Header */}
        <Box 
          sx={{ 
            mb: 6,
            textAlign: 'center',
            animation: 'fadeInDown 0.8s ease-out'
          }}
        >
          <Typography 
            variant="h2" 
            gutterBottom
            sx={{
              fontWeight: 800,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              mb: 2,
              textShadow: '0 0 40px rgba(102, 126, 234, 0.3)'
            }}
          >
            {channelInfo?.displayName || channelName}
          </Typography>
          <Typography 
            variant="h5" 
            sx={{ 
              color: 'rgba(255, 255, 255, 0.7)',
              fontWeight: 300,
              letterSpacing: '0.1em'
            }}
          >
            VIEWER HUB
          </Typography>

          {/* Quick Nav + Links */}
          <Paper
            elevation={0}
            sx={{
              mt: 4,
              px: 2,
              py: 1.5,
              mx: 'auto',
              maxWidth: 900,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 3,
              position: 'sticky',
              top: 8,
              backdropFilter: 'blur(8px)'
            }}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  label="VIP Queue"
                  onClick={() => scrollTo(vipRef)}
                  disabled={!vipQueue || vipQueue.length === 0}
                  color={vipQueue && vipQueue.length > 0 ? 'warning' : 'default'}
                  variant={vipQueue && vipQueue.length > 0 ? 'filled' : 'outlined'}
                />
                <Chip
                  size="small"
                  label="Current Cup"
                  onClick={() => scrollTo(cupRef)}
                  disabled={!currentCup}
                  color={currentCup ? 'primary' : 'default'}
                  variant={currentCup ? 'filled' : 'outlined'}
                />
                <Chip
                  size="small"
                  label={`Queue${queue && queue.length ? ` (${queue.length})` : ''}`}
                  onClick={() => scrollTo(queueRef)}
                  disabled={!queue || queue.length === 0}
                  color={queue && queue.length > 0 ? 'secondary' : 'default'}
                  variant={queue && queue.length > 0 ? 'filled' : 'outlined'}
                />
                <Chip
                  size="small"
                  label={`All Cups${allCups && allCups.length ? ` (${allCups.length})` : ''}`}
                  onClick={() => scrollTo(cupsRef)}
                  disabled={!allCups || allCups.length === 0}
                  color={allCups && allCups.length > 0 ? 'success' : 'default'}
                  variant={allCups && allCups.length > 0 ? 'filled' : 'outlined'}
                />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<OpenInNewIcon />}
                  href={`/overlay/${channelName}/leaderboard`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Leaderboard
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<OpenInNewIcon />}
                  href={`/overlay/${channelName}/queue`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Queue Overlay
                </Button>
                <IconButton aria-label="refresh" size="small" onClick={fetchData}>
                  <RefreshIcon sx={{ color: 'rgba(255,255,255,0.9)' }} />
                </IconButton>
              </Stack>
            </Stack>
          </Paper>
        </Box>


        <style>
          {`
            @keyframes fadeInDown {
              from {
                opacity: 0;
                transform: translateY(-30px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes float {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-10px); }
            }
            @keyframes glow {
              0%, 100% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.3); }
              50% { box-shadow: 0 0 40px rgba(102, 126, 234, 0.6), 0 0 60px rgba(118, 75, 162, 0.4); }
            }
          `}
        </style>

        <Grid container spacing={3}>
          {/* VIP Queue Section */}
          {Array.isArray(vipQueue) && vipQueue.length > 0 && (
            <Grid item xs={12} ref={vipRef}>
              <Card
                elevation={0}
                sx={{
                  background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.12) 0%, rgba(255, 87, 34, 0.12) 100%)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 193, 7, 0.25)',
                  borderRadius: 4,
                  overflow: 'visible',
                  position: 'relative',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, #ffc107 0%, #ff5722 50%, #ff9800 100%)',
                    borderRadius: '4px 4px 0 0'
                  }
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                    <Box
                      sx={{
                        background: 'linear-gradient(135deg, #ffc107 0%, #ff5722 100%)',
                        borderRadius: '50%',
                        p: 1.5,
                        mr: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <QueueIcon sx={{ color: 'white', fontSize: 28 }} />
                    </Box>
                    <Typography 
                      variant="h4" 
                      sx={{ fontWeight: 700, color: 'white', flex: 1 }}
                    >
                      VIP Queue
                    </Typography>
                    <Chip 
                      label={`${vipQueue.length} VIP${vipQueue.length === 1 ? '' : 's'}`}
                      sx={{
                        background: 'linear-gradient(135deg, #ffc107 0%, #ff5722 100%)',
                        color: 'white',
                        fontWeight: 'bold',
                        height: 36
                      }}
                    />
                  </Box>
                  <Grid container spacing={3}>
                    {vipQueue
                      .map((id) => queue.find((q) => q.id === id))
                      .filter(Boolean)
                      .map((item, index) => (
                        <Grid item xs={12} sm={6} md={4} lg={3} key={`vip-${item.id}`}>
                          <Card
                            elevation={0}
                            sx={{
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              background: 'rgba(0, 0, 0, 0.45)',
                              backdropFilter: 'blur(10px)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: 3,
                              overflow: 'hidden',
                              transition: 'all 0.3s ease',
                              '&:hover': {
                                transform: 'translateY(-6px)',
                                boxShadow: '0 18px 36px rgba(255, 193, 7, 0.25)'
                              }
                            }}
                          >
                            {/* Thumbnail */}
                            <Box
                              component="a"
                              href={item.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                position: 'relative',
                                paddingTop: '56.25%',
                                backgroundColor: 'grey.900',
                                overflow: 'hidden',
                                display: 'block',
                                cursor: 'pointer',
                                textDecoration: 'none',
                                '&:hover .vip-thumb-overlay': { opacity: 1 }
                              }}
                            >
                              {item.thumbnailUrl ? (
                                <>
                                  <Box
                                    component="img"
                                    src={item.thumbnailUrl}
                                    alt={item.title}
                                    sx={{
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover'
                                    }}
                                  />
                                  <Box
                                    className="vip-thumb-overlay"
                                    sx={{
                                      position: 'absolute',
                                      inset: 0,
                                      background: 'rgba(0,0,0,0.5)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      opacity: 0,
                                      transition: 'opacity 0.25s ease'
                                    }}
                                  >
                                    <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '2rem' }}>▶</Typography>
                                  </Box>
                                </>
                              ) : (
                                <Box
                                  sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'grey.800'
                                  }}
                                >
                                  <QueueIcon sx={{ fontSize: 48, color: 'grey.600' }} />
                                </Box>
                              )}
                              <Chip
                                label={`#${index + 1}`}
                                size="small"
                                sx={{
                                  position: 'absolute',
                                  top: 8,
                                  left: 8,
                                  background: 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)',
                                  color: 'white',
                                  fontWeight: 700
                                }}
                              />
                              {item.duration && (
                                <Chip
                                  label={`${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}`}
                                  size="small"
                                  sx={{
                                    position: 'absolute',
                                    bottom: 8,
                                    right: 8,
                                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                                    color: 'white',
                                    fontWeight: 'bold'
                                  }}
                                />
                              )}
                            </Box>

                            {/* Details */}
                            <CardContent sx={{ p: 2.25 }}>
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 700,
                                  color: 'white',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  lineHeight: 1.3,
                                  mb: 0.75
                                }}
                              >
                                {item.title || 'Untitled Video'}
                              </Typography>
                              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.75)' }}>
                                by {formatName(item.submitterAlias, item.submitterUsername)}
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          )}
          {/* Current Cup Section */}
          {currentCup && (
            <Grid item xs={12} ref={cupRef}>
              <Card 
                elevation={0}
                sx={{
                  background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(102, 126, 234, 0.2)',
                  borderRadius: 4,
                  overflow: 'visible',
                  position: 'relative',
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    transform: 'translateY(-8px)',
                    boxShadow: '0 20px 40px rgba(102, 126, 234, 0.3)',
                    border: '1px solid rgba(102, 126, 234, 0.4)'
                  },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
                    borderRadius: '4px 4px 0 0'
                  }
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                    <Box
                      sx={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '50%',
                        p: 1.5,
                        mr: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'float 3s ease-in-out infinite'
                      }}
                    >
                      <TrophyIcon sx={{ color: 'white', fontSize: 32 }} />
                    </Box>
                    <Typography 
                      variant="h4" 
                      sx={{ 
                        fontWeight: 700,
                        color: 'white',
                        textShadow: '0 2px 10px rgba(0,0,0,0.3)'
                      }}
                    >
                      Current Cup
                    </Typography>
                  </Box>
                  <Box sx={{ mb: 3 }}>
                    <Typography 
                      variant="h4" 
                      gutterBottom
                      sx={{
                        fontWeight: 700,
                        color: 'white',
                        mb: 1
                      }}
                    >
                      {currentCup.title}
                    </Typography>
                    {currentCup.theme && (
                      <Typography 
                        variant="h6" 
                        gutterBottom
                        sx={{
                          color: 'rgba(255, 255, 255, 0.7)',
                          fontStyle: 'italic',
                          fontWeight: 300
                        }}
                      >
                        🎨 {currentCup.theme}
                      </Typography>
                    )}
                  <Box sx={{ mt: 1 }}>
                    <Chip
                      label={currentCup.status}
                      color={getStatusColor(currentCup.status)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    {currentCup._count?.queueItems > 0 && (
                      <Chip
                        label={`${currentCup._count.queueItems} videos scored`}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>
                </Box>

                  {/* Top 5 Standings */}
                  {standings.length > 0 && (
                    <Box sx={{ mt: 4 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography 
                          variant="h5" 
                          gutterBottom
                          sx={{
                            fontWeight: 700,
                            color: 'white',
                            mb: 0,
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          🏆 Standings
                        </Typography>
                        <Button
                          size="small"
                          variant="outlined"
                          endIcon={<OpenInNewIcon />}
                          href={`/overlay/${channelName}/leaderboard`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open Leaderboard Overlay
                        </Button>
                      </Box>
                      <List sx={{ p: 0 }}>
                        {standings.map((entry, index) => (
                          <React.Fragment key={entry.submitterUsername}>
                            <ListItem
                              sx={{
                                background: index === 0 
                                  ? 'linear-gradient(90deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0.05) 100%)'
                                  : 'rgba(255, 255, 255, 0.03)',
                                borderRadius: 2,
                                mb: 1,
                                border: index === 0 ? '2px solid rgba(255, 215, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                  transform: 'translateX(8px)',
                                  background: index === 0 
                                    ? 'linear-gradient(90deg, rgba(255, 215, 0, 0.3) 0%, rgba(255, 215, 0, 0.1) 100%)'
                                    : 'rgba(255, 255, 255, 0.08)'
                                }
                              }}
                            >
                              <ListItemText
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Box
                                      sx={{
                                        minWidth: 50,
                                        height: 50,
                                        borderRadius: '50%',
                                        background: index === 0 
                                          ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)'
                                          : index === 1
                                          ? 'linear-gradient(135deg, #C0C0C0 0%, #808080 100%)'
                                          : index === 2
                                          ? 'linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)'
                                          : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold',
                                        fontSize: '1.2rem',
                                        color: 'white',
                                        boxShadow: index === 0 ? '0 0 20px rgba(255, 215, 0, 0.5)' : 'none'
                                      }}
                                    >
                                      #{entry.rank || index + 1}
                                    </Box>
                                    <Typography 
                                      component="span" 
                                      variant="h6" 
                                      sx={{ 
                                        flex: 1,
                                        color: 'white',
                                        fontWeight: 600
                                      }}
                                    >
                                      {formatName(entry.submitterAlias, entry.submitterUsername)}
                                    </Typography>
                                    <Chip
                                      label={`${entry.averageScore?.toFixed(2) || 'N/A'}`}
                                      sx={{
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        fontSize: '1rem',
                                        height: 36
                                      }}
                                    />
                                  </Box>
                                }
                                secondary={
                                  <Typography sx={{ color: 'rgba(255, 255, 255, 0.6)', mt: 0.5 }}>
                                    {entry.videoCount || 0} videos • {entry.totalScore?.toFixed(2) || 0} total points
                                  </Typography>
                                }
                              />
                            </ListItem>
                          </React.Fragment>
                      ))}
                    </List>
                  </Box>
                )}

                {/* All Rated Videos Section */}
                {cupVideos.length > 0 && (
                  <Box sx={{ mt: 5 }}>
                    <Typography 
                      variant="h5" 
                      gutterBottom
                      sx={{
                        fontWeight: 700,
                        color: 'white',
                        mb: 3,
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      🎬 All Rated Videos
                    </Typography>
                    <Grid container spacing={3}>
                      {cupVideos
                        .filter(video => video.averageScore !== null)
                        .sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0))
                        .map((video) => (
                        <Grid item xs={12} sm={6} md={4} key={video.queueItemId}>
                          <Card
                            elevation={0}
                            sx={{
                              background: 'rgba(0, 0, 0, 0.4)',
                              backdropFilter: 'blur(10px)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: 3,
                              overflow: 'hidden',
                              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                              '&:hover': {
                                transform: 'translateY(-8px)',
                                boxShadow: '0 20px 40px rgba(102, 126, 234, 0.4)',
                                border: '1px solid rgba(102, 126, 234, 0.5)'
                              }
                            }}
                          >
                            {/* Thumbnail */}
                            <Box
                              component="a"
                              href={video.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                position: 'relative',
                                paddingTop: '56.25%',
                                backgroundColor: 'grey.900',
                                overflow: 'hidden',
                                display: 'block',
                                cursor: 'pointer',
                                textDecoration: 'none',
                                '&:hover .thumbnail-overlay': {
                                  opacity: 1
                                }
                              }}
                            >
                              {video.thumbnailUrl ? (
                                <>
                                  <Box
                                    component="img"
                                    src={video.thumbnailUrl}
                                    alt={video.title}
                                    sx={{
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover'
                                    }}
                                  />
                                  <Box
                                    className="thumbnail-overlay"
                                    sx={{
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                      right: 0,
                                      bottom: 0,
                                      background: 'rgba(0, 0, 0, 0.6)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      opacity: 0,
                                      transition: 'opacity 0.3s ease'
                                    }}
                                  >
                                    <Typography
                                      sx={{
                                        color: 'white',
                                        fontSize: '3rem',
                                        fontWeight: 'bold'
                                      }}
                                    >
                                      ▶
                                    </Typography>
                                  </Box>
                                </>
                              ) : (
                                <Box
                                  sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'grey.800'
                                  }}
                                >
                                  <QueueIcon sx={{ fontSize: 48, color: 'grey.600' }} />
                                </Box>
                              )}
                              {/* Average Score Badge */}
                              <Box
                                sx={{
                                  position: 'absolute',
                                  top: 8,
                                  right: 8,
                                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                  borderRadius: 2,
                                  px: 1.5,
                                  py: 0.5,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.5,
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                                }}
                              >
                                <Typography
                                  sx={{
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '1.1rem'
                                  }}
                                >
                                  ⭐ {video.averageScore?.toFixed(2) || 'N/A'}
                                </Typography>
                              </Box>
                            </Box>

                            <CardContent sx={{ p: 2.5 }}>
                              {/* Video Title */}
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 700,
                                  color: 'white',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  mb: 1,
                                  lineHeight: 1.3
                                }}
                              >
                                {video.title}
                              </Typography>

                              {/* Submitter */}
                              <Typography
                                variant="body2"
                                sx={{
                                  color: 'rgba(255, 255, 255, 0.7)',
                                  mb: 2
                                }}
                              >
                                by {formatName(video.submitterAlias, video.submitterUsername)}
                              </Typography>

                              {/* Judge Scores */}
                              <Box>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: 'rgba(255, 255, 255, 0.6)',
                                    fontWeight: 600,
                                    mb: 1,
                                    display: 'block'
                                  }}
                                >
                                  JUDGE SCORES
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  {video.judgeScores && video.judgeScores.length > 0 ? (
                                    video.judgeScores.map((score, idx) => (
                                      <Box
                                        key={idx}
                                        sx={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          background: 'rgba(255, 255, 255, 0.05)',
                                          borderRadius: 1,
                                          px: 1.5,
                                          py: 0.5
                                        }}
                                      >
                                        <Typography
                                          variant="body2"
                                          sx={{
                                            color: 'rgba(255, 255, 255, 0.8)',
                                            fontSize: '0.85rem'
                                          }}
                                        >
                                          {score.judgeName || `Judge ${idx + 1}`}
                                        </Typography>
                                        <Chip
                                          label={score.score?.toFixed(2) || 'N/A'}
                                          size="small"
                                          sx={{
                                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                            color: 'white',
                                            fontWeight: 'bold',
                                            height: 24,
                                            fontSize: '0.75rem'
                                          }}
                                        />
                                      </Box>
                                    ))
                                  ) : (
                                    <Typography
                                      variant="body2"
                                      sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}
                                    >
                                      No scores yet
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

          {/* Current Queue Section */}
          {queue.length > 0 && (
            <Grid item xs={12} ref={queueRef}>
              <Card
                elevation={0}
                sx={{
                  background: 'linear-gradient(135deg, rgba(255, 0, 110, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 0, 110, 0.2)',
                  borderRadius: 4,
                  overflow: 'visible',
                  position: 'relative',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, #ff006e 0%, #764ba2 50%, #667eea 100%)',
                    borderRadius: '4px 4px 0 0'
                  }
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                    <Box
                      sx={{
                        background: 'linear-gradient(135deg, #ff006e 0%, #764ba2 100%)',
                        borderRadius: '50%',
                        p: 1.5,
                        mr: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <QueueIcon sx={{ color: 'white', fontSize: 28 }} />
                    </Box>
                    <Typography 
                      variant="h4" 
                      sx={{ 
                        fontWeight: 700,
                        color: 'white',
                        flex: 1
                      }}
                    >
                      Current Queue
                    </Typography>
                    <Chip 
                      label={`${queue.length} videos`}
                      sx={{
                        background: 'linear-gradient(135deg, #ff006e 0%, #764ba2 100%)',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        height: 36
                      }}
                    />
                  </Box>
                  <Grid container spacing={3}>
                    {queue.map((item, index) => (
                      <Grid item xs={12} sm={6} md={4} lg={3} key={item.id}>
                        <Card 
                          elevation={0}
                          sx={{ 
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            background: 'rgba(0, 0, 0, 0.4)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: 3,
                            overflow: 'hidden',
                            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                            '&:hover': {
                              transform: 'translateY(-12px) scale(1.02)',
                              boxShadow: '0 20px 40px rgba(102, 126, 234, 0.4)',
                              border: '1px solid rgba(102, 126, 234, 0.5)',
                              '& .thumbnail': {
                                transform: 'scale(1.1)'
                              }
                            }
                          }}
                        >
                          <Box
                            component="a"
                            href={item.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              position: 'relative',
                              paddingTop: '56.25%', // 16:9 aspect ratio
                              backgroundColor: 'grey.900',
                              overflow: 'hidden',
                              display: 'block',
                              cursor: 'pointer',
                              textDecoration: 'none',
                              '&:hover .queue-thumbnail-overlay': {
                                opacity: 1
                              }
                            }}
                          >
                            {item.thumbnailUrl ? (
                              <>
                                <Box
                                  component="img"
                                  src={item.thumbnailUrl}
                                  alt={item.title}
                                  className="thumbnail"
                                  sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    transition: 'transform 0.6s ease'
                                  }}
                                />
                                <Box
                                  className="queue-thumbnail-overlay"
                                  sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'rgba(0, 0, 0, 0.6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: 0,
                                    transition: 'opacity 0.3s ease',
                                    pointerEvents: 'none'
                                  }}
                                >
                                  <Typography
                                    sx={{
                                      color: 'white',
                                      fontSize: '3rem',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    ▶
                                  </Typography>
                                </Box>
                              </>
                          ) : (
                            <Box
                              sx={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'grey.800'
                              }}
                            >
                              <QueueIcon sx={{ fontSize: 48, color: 'grey.600' }} />
                            </Box>
                          )}
                            <Box
                              sx={{
                                position: 'absolute',
                                top: 8,
                                left: 8,
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderRadius: '50%',
                                width: 40,
                                height: 40,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                color: 'white',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                                fontSize: '1rem'
                              }}
                            >
                              #{index + 1}
                            </Box>
                          {item.duration && (
                            <Chip
                              label={`${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}`}
                              size="small"
                              sx={{
                                position: 'absolute',
                                bottom: 8,
                                right: 8,
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                color: 'white',
                                fontWeight: 'bold'
                              }}
                            />
                          )}
                        </Box>
                          <CardContent sx={{ flexGrow: 1, p: 2.5 }}>
                            <Typography
                              variant="subtitle1"
                              sx={{
                                fontWeight: 700,
                                color: 'white',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                mb: 1.5,
                                lineHeight: 1.3
                              }}
                            >
                              {item.title}
                            </Typography>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontWeight: 500
                              }}
                            >
                                by {formatName(item.submitterAlias, item.submitterUsername)}
                              </Typography>
                          {item.status && item.status !== 'PENDING' && (
                            <Box sx={{ mt: 1 }}>
                              <Chip
                                label={item.status}
                                size="small"
                                color={
                                  item.status === 'PLAYING' ? 'error' :
                                  item.status === 'APPROVED' ? 'success' :
                                  'default'
                                }
                                sx={{ fontSize: '0.7rem' }}
                              />
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}

          {/* All Cups Section */}
          {allCups.length > 0 && (
            <Grid item xs={12} ref={cupsRef}>
              <Card
                elevation={0}
                sx={{
                  background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(240, 147, 251, 0.1) 100%)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(240, 147, 251, 0.2)',
                  borderRadius: 4,
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
                    borderRadius: '4px 4px 0 0'
                  }
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                    <Box
                      sx={{
                        background: 'linear-gradient(135deg, #667eea 0%, #f093fb 100%)',
                        borderRadius: '50%',
                        p: 1.5,
                        mr: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <CalendarIcon sx={{ color: 'white', fontSize: 28 }} />
                    </Box>
                    <Typography 
                      variant="h4" 
                      sx={{ 
                        fontWeight: 700,
                        color: 'white'
                      }}
                    >
                      All Cups
                    </Typography>
                  </Box>
                  <List sx={{ p: 0 }}>
                    {allCups.map((cup, index) => (
                      <React.Fragment key={cup.id}>
                        <ListItem
                          sx={{
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            py: 2.5,
                            px: 3,
                            mb: 2,
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: 2,
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                              background: 'rgba(255, 255, 255, 0.08)',
                              transform: 'translateX(8px)',
                              borderColor: 'rgba(240, 147, 251, 0.3)'
                            }
                          }}
                        >
                          <Box sx={{ width: '100%', mb: 1.5 }}>
                            <Typography 
                              variant="h6" 
                              sx={{
                                fontWeight: 700,
                                color: 'white'
                              }}
                            >
                              {cup.title}
                            </Typography>
                            {cup.theme && (
                              <Typography 
                                variant="body1" 
                                sx={{ 
                                  color: 'rgba(255, 255, 255, 0.6)',
                                  fontStyle: 'italic',
                                  mt: 0.5
                                }}
                              >
                                {cup.theme}
                              </Typography>
                            )}
                          </Box>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          <Chip
                            label={cup.status}
                            color={getStatusColor(cup.status)}
                            size="small"
                          />
                          {cup.isActive && (
                            <Chip label="ACTIVE" color="primary" size="small" />
                          )}
                          {cup._count?.queueItems > 0 && (
                            <Chip
                              label={`${cup._count.queueItems} videos`}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                          <Typography 
                            variant="body2" 
                            sx={{ color: 'rgba(255, 255, 255, 0.5)', mt: 1 }}
                          >
                            Created: {formatDate(cup.createdAt)}
                          </Typography>
                        </ListItem>
                    </React.Fragment>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        )}

          {/* No Data Message */}
          {!currentCup && allCups.length === 0 && queue.length === 0 && (
            <Grid item xs={12}>
              <Alert 
                severity="info"
                sx={{
                  background: 'rgba(102, 126, 234, 0.1)',
                  border: '1px solid rgba(102, 126, 234, 0.3)',
                  color: 'white',
                  backdropFilter: 'blur(10px)'
                }}
              >
                No cups or queue data available yet. Check back later!
              </Alert>
            </Grid>
          )}
        </Grid>
      </Container>
    </Box>
  );
}

export default ViewerHub;
