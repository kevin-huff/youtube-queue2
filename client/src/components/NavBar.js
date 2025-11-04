import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Avatar,
  Menu,
  MenuItem,
  IconButton,
  useTheme,
  alpha,
  Container
} from '@mui/material';
import {
  LiveTv,
  Dashboard,
  Login,
  Logout,
  Security
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NavBar = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, login } = useAuth();
  const [anchorEl, setAnchorEl] = React.useState(null);
  const canModerate = React.useMemo(() => {
    if (!user?.channels) {
      return false;
    }

    return user.channels.some((channel) => {
      if (!channel) {
        return false;
      }
      const roles = new Set(channel.roles || []);
      if (channel.ownershipRole) {
        roles.add(channel.ownershipRole);
      }
      return ['OWNER', 'MANAGER', 'PRODUCER', 'MODERATOR'].some((role) => roles.has(role));
    });
  }, [user]);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
  };

  const handleDashboard = () => {
    handleMenuClose();
    navigate('/dashboard');
  };

  const handleModeration = () => {
    handleMenuClose();
    navigate('/dashboard?tab=moderation');
  };

  const isAuthPage = location.pathname === '/' || location.pathname === '/login';

  return (
    <AppBar 
      position="sticky" 
      elevation={0}
      sx={{ 
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters>
          {/* Logo/Brand */}
          <Box 
            display="flex" 
            alignItems="center" 
            sx={{ cursor: 'pointer' }}
            onClick={() => navigate(user ? '/dashboard' : '/')}
          >
            <LiveTv sx={{ mr: 1, color: 'primary.main' }} />
            <Box>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontWeight: 700,
                  lineHeight: 1,
                  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {/* Brand with superscript star */}
                <span>Free<sup>*</sup> mediashare</span>
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                KevNetCloud × ChatGPT
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {/* Navigation */}
          {user ? (
            <>
              {!isAuthPage && (
                <>
                  <Button
                    startIcon={<Dashboard />}
                    onClick={() => navigate('/dashboard')}
                    sx={{ mr: 2 }}
                  >
                    Dashboard
                  </Button>
                  {canModerate && (
                    <Button
                      startIcon={<Security />}
                      onClick={() => navigate('/dashboard?tab=moderation')}
                      sx={{ mr: 2 }}
                    >
                      Moderation
                    </Button>
                  )}
                  {!canModerate && (
                    <Button
                      startIcon={<Security />}
                      onClick={() => navigate('/onboarding')}
                      sx={{ mr: 2 }}
                    >
                      Get Started
                    </Button>
                  )}
                </>
              )}
              
              <Box>
                <IconButton
                  onClick={handleMenuOpen}
                  sx={{
                    p: 0.5,
                    border: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                    }
                  }}
                >
                  <Avatar
                    src={user.profileImageUrl}
                    alt={user.displayName}
                    sx={{ width: 32, height: 32 }}
                  >
                    {user.displayName?.[0] || user.username?.[0]}
                  </Avatar>
                </IconButton>
                
                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleMenuClose}
                  anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                  }}
                  transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                  PaperProps={{
                    sx: {
                      mt: 1,
                      minWidth: 200,
                      borderRadius: 2,
                      boxShadow: theme.shadows[8]
                    }
                  }}
                >
                  <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {user.displayName || user.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      @{user.username}
                    </Typography>
                  </Box>
                  
                  <MenuItem onClick={handleDashboard}>
                    <Dashboard sx={{ mr: 2, fontSize: 20 }} />
                    Dashboard
                  </MenuItem>
                  {canModerate && (
                    <MenuItem onClick={handleModeration}>
                      <Security sx={{ mr: 2, fontSize: 20 }} />
                      Moderation
                    </MenuItem>
                  )}
                  {user.channels?.[0] && (
                    <MenuItem onClick={() => navigate(`/player/${user.channels[0].id}`)}>
                      <LiveTv sx={{ mr: 2, fontSize: 20 }} />
                      Open Player Overlay
                    </MenuItem>
                  )}
                  
                  <MenuItem onClick={handleLogout}>
                    <Logout sx={{ mr: 2, fontSize: 20 }} />
                    Logout
                  </MenuItem>
                </Menu>
              </Box>
            </>
          ) : (
            <Button
              variant="contained"
              startIcon={<Login />}
              onClick={login}
              sx={{
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                '&:hover': {
                  background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
                }
              }}
            >
              Login with Twitch
            </Button>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  );
};

export default NavBar;
