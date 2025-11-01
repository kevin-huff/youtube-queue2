import React from 'react';
import { 
  Box, 
  Container, 
  Typography, 
  Button, 
  Grid, 
  Card, 
  CardContent,
  Chip,
  useTheme,
  alpha
} from '@mui/material';
import { 
  PlayCircleOutline, 
  Group, 
  Security, 
  Speed,
  LiveTv,
  QueueMusic
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const FeatureCard = ({ icon, title, description }) => {
  const theme = useTheme();
  
  return (
    <Card 
      sx={{ 
        height: '100%',
        background: alpha(theme.palette.background.paper, 0.6),
        backdropFilter: 'blur(10px)',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.2)}`,
          borderColor: theme.palette.primary.main,
        }
      }}
    >
      <CardContent sx={{ textAlign: 'center', p: 4 }}>
        <Box sx={{ mb: 2, color: 'primary.main' }}>
          {icon}
        </Box>
        <Typography variant="h6" gutterBottom fontWeight={600}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
};

const LandingPage = () => {
  const theme = useTheme();
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const features = [
    {
      icon: <LiveTv sx={{ fontSize: 48 }} />,
      title: 'Multi-Channel Support',
      description: 'Manage queues for multiple Twitch channels from one dashboard'
    },
    {
      icon: <Group sx={{ fontSize: 48 }} />,
      title: 'Viewer Engagement',
      description: 'Let your viewers submit YouTube videos directly through Twitch chat'
    },
    {
      icon: <Security sx={{ fontSize: 48 }} />,
      title: 'Secure Authentication',
      description: 'Login with Twitch OAuth for seamless and secure access'
    },
    {
      icon: <Speed sx={{ fontSize: 48 }} />,
      title: 'Real-Time Updates',
      description: 'Instant queue updates with WebSocket technology'
    },
    {
      icon: <QueueMusic sx={{ fontSize: 48 }} />,
      title: 'Smart Queue Management',
      description: 'Advanced queue controls, moderation, and customization options'
    },
    {
      icon: <PlayCircleOutline sx={{ fontSize: 48 }} />,
      title: 'YouTube Integration',
      description: 'Automatic video metadata fetching and validation'
    }
  ];

  return (
    <Box 
      sx={{ 
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.1)} 0%, ${alpha(theme.palette.background.default, 0.9)} 100%)`,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Animated background elements */}
      <Box
        sx={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.1)} 0%, transparent 70%)`,
          animation: 'float 20s ease-in-out infinite',
          '@keyframes float': {
            '0%, 100%': { transform: 'translateY(0) translateX(0)' },
            '33%': { transform: 'translateY(-30px) translateX(-30px)' },
            '66%': { transform: 'translateY(30px) translateX(30px)' },
          }
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -150,
          left: -150,
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(theme.palette.secondary.main, 0.1)} 0%, transparent 70%)`,
          animation: 'float 25s ease-in-out infinite reverse',
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        {/* Hero Section */}
        <Box sx={{ pt: 12, pb: 8, textAlign: 'center' }}>
          <Chip 
            label="KevNetCloud × ChatGPT Present" 
            color="secondary" 
            size="small" 
            sx={{ mb: 3, fontWeight: 600 }}
          />
          
          <Typography 
            variant="h1" 
            gutterBottom
            sx={{
              fontWeight: 800,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 3
            }}
          >
            FREE* Mediashare
            <br />
            For Twitch Creators
          </Typography>
          
          <Typography 
            variant="h5" 
            color="text.secondary" 
            sx={{ mb: 5, maxWidth: 600, mx: 'auto', fontWeight: 400 }}
          >
            Brought to you by KevNetCloud in collaboration with ChatGPT. Let your audience drop
            YouTube links directly in chat and manage multi-channel mediashare queues from one
            beautiful dashboard—just don’t forget the asterisk.
          </Typography>
          
          <Button 
            variant="contained" 
            size="large" 
            onClick={() => login({ redirectTo: '/onboarding' })}
            startIcon={<LiveTv />}
            sx={{ 
              py: 2, 
              px: 4,
              fontSize: '1.1rem',
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              '&:hover': {
                background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
              }
            }}
          >
            Get Started
          </Button>

          <Button
            variant="text"
            color="secondary"
            onClick={() => login({ redirectTo: '/dashboard?tab=moderation' })}
            startIcon={<Security />}
            sx={{ mt: 1.5 }}
          >
            Moderator login &amp; queue review
          </Button>
          
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Free to use • No credit card required
          </Typography>
        </Box>

        {/* Features Section */}
        <Box sx={{ py: 8 }}>
          <Typography 
            variant="h3" 
            textAlign="center" 
            gutterBottom 
            sx={{ mb: 6, fontWeight: 700 }}
          >
            Everything You Need
          </Typography>
          
          <Grid container spacing={4}>
            {features.map((feature, index) => (
              <Grid item xs={12} md={4} key={index}>
                <FeatureCard {...feature} />
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* How It Works Section */}
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <Typography variant="h3" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
            How It Works
          </Typography>
          
          <Grid container spacing={4} sx={{ maxWidth: 800, mx: 'auto' }}>
            <Grid item xs={12} md={4}>
              <Typography 
                variant="h2" 
                color="primary.main" 
                sx={{ fontWeight: 800, mb: 2 }}
              >
                1
              </Typography>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Login with Twitch
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Authenticate securely using your Twitch account
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Typography 
                variant="h2" 
                color="primary.main" 
                sx={{ fontWeight: 800, mb: 2 }}
              >
                2
              </Typography>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Add Your Channel
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Connect your Twitch channel and customize settings
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Typography 
                variant="h2" 
                color="primary.main" 
                sx={{ fontWeight: 800, mb: 2 }}
              >
                3
              </Typography>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Start Queuing
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Your viewers can now submit videos through chat
              </Typography>
            </Grid>
          </Grid>
        </Box>

        {/* CTA Section */}
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <Card 
            sx={{ 
              p: 6,
              background: alpha(theme.palette.primary.main, 0.1),
              border: `2px solid ${theme.palette.primary.main}`,
            }}
          >
            <Typography variant="h4" gutterBottom fontWeight={700}>
              Ready to Level Up Your Stream?
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              Join thousands of streamers using our queue system
            </Typography>
            <Button 
              variant="contained" 
              size="large" 
              onClick={() => login({ redirectTo: '/onboarding' })}
              sx={{ 
                py: 2, 
                px: 5,
                fontSize: '1.1rem'
              }}
            >
              Get Started Now
            </Button>
          </Card>
        </Box>
      </Container>
    </Box>
  );
};

export default LandingPage;
