import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Stack,
  Chip,
  Typography,
  Box,
  useTheme,
  alpha
} from '@mui/material';
import { Login as LoginIcon, Security as SecurityIcon } from '@mui/icons-material';

const AuthContext = createContext();
const POST_LOGIN_REDIRECT_KEY = 'auth.postLoginRedirect';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const theme = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);

  const getPostLoginRedirect = useCallback(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null;
    }
    try {
      return window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    } catch (storageError) {
      console.warn('Failed to read post-login redirect from storage:', storageError);
      return null;
    }
  }, []);

  const setPostLoginRedirect = useCallback((target) => {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }
    try {
      const origin = window.location.origin;
      let normalized = '/dashboard';

      if (typeof target === 'string' && target.trim()) {
        const trimmed = target.trim();
        if (trimmed.startsWith('/')) {
          normalized = trimmed;
        } else {
          try {
            const resolved = new URL(trimmed, origin);
            if (resolved.origin === origin) {
              normalized = `${resolved.pathname}${resolved.search}${resolved.hash}`;
            }
          } catch (resolveError) {
            console.warn('Ignoring invalid redirect target:', trimmed, resolveError);
          }
        }
      }

      window.sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, normalized);
    } catch (storageError) {
      console.warn('Failed to persist post-login redirect:', storageError);
    }
  }, []);

  const consumePostLoginRedirect = useCallback(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null;
    }
    try {
      const value = window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
      if (value) {
        window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
        return value;
      }
      return null;
    } catch (storageError) {
      console.warn('Failed to consume post-login redirect:', storageError);
      return null;
    }
  }, []);

  const clearPostLoginRedirect = useCallback(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }
    try {
      window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    } catch (storageError) {
      console.warn('Failed to clear post-login redirect:', storageError);
    }
  }, []);

  // Check if user is authenticated on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/auth/user', {
        withCredentials: true
      });
      
      if (response.data.authenticated) {
        setUser(response.data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = (options) => {
    if (typeof options === 'string' && options.trim()) {
      setPostLoginRedirect(options.trim());
    } else if (options?.redirectTo) {
      setPostLoginRedirect(options.redirectTo);
    } else if (!getPostLoginRedirect()) {
      setPostLoginRedirect('/dashboard');
    }
    setLoginDialogOpen(true);
  };

  const closeLoginDialog = () => {
    setLoginDialogOpen(false);
    clearPostLoginRedirect();
  };

  const startOAuthLogin = () => {
    setLoginDialogOpen(false);
    if (!getPostLoginRedirect()) {
      setPostLoginRedirect('/dashboard');
    }
    const explicitUrl = process.env.REACT_APP_TWITCH_AUTH_URL?.trim();
    if (explicitUrl) {
      window.location.assign(explicitUrl);
      return;
    }

    const serverUrl = process.env.REACT_APP_SERVER_URL?.trim();
    if (serverUrl) {
      const base = serverUrl.replace(/^['"]|['"]$/g, '').replace(/\/$/, '');
      window.location.assign(`${base}/api/auth/twitch`);
      return;
    }

    window.location.assign('/api/auth/twitch');
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout', {}, {
        withCredentials: true
      });
      setUser(null);
      window.location.href = '/';
    } catch (err) {
      console.error('Logout failed:', err);
      setError('Failed to logout');
    }
  };

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      clearPostLoginRedirect();
      return;
    }

    const redirectTarget = consumePostLoginRedirect();
    if (redirectTarget && typeof window !== 'undefined') {
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (redirectTarget !== current) {
        window.location.replace(redirectTarget);
      }
    }
  }, [loading, user, consumePostLoginRedirect, clearPostLoginRedirect]);

  const normalizeChannelId = useCallback((channelId) => (channelId || '').toString().trim().toLowerCase(), []);

  const findChannelAccess = useCallback((channelId) => {
    if (!user || !Array.isArray(user.channels)) {
      return null;
    }

    const normalized = normalizeChannelId(channelId);
    if (!normalized) {
      return user.channels[0] || null;
    }

    return user.channels.find((channel) => normalizeChannelId(channel.id) === normalized) || null;
  }, [normalizeChannelId, user]);

  const hasChannelRole = useCallback((channelId, requiredRoles = [], options = {}) => {
    const {
      match = 'any',
      includeOwnership = true
    } = options;

    const access = findChannelAccess(channelId);
    if (!access) {
      return false;
    }

    const roleSet = new Set(Array.isArray(access.roles) ? access.roles : []);

    if (includeOwnership && access.ownershipRole) {
      roleSet.add(access.ownershipRole);
    }

    const rolesToCheck = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    if (!rolesToCheck.length) {
      return roleSet.size > 0;
    }

    return match === 'all'
      ? rolesToCheck.every((role) => roleSet.has(role))
      : rolesToCheck.some((role) => roleSet.has(role));
  }, [findChannelAccess]);

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    checkAuthStatus,
    isAuthenticated: !!user,
    closeLoginDialog,
    startOAuthLogin,
    findChannelAccess,
    hasChannelRole
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <Dialog 
        open={loginDialogOpen} 
        onClose={closeLoginDialog} 
        maxWidth="xs" 
        fullWidth
        BackdropProps={{
          sx: {
            backdropFilter: 'blur(6px)',
            backgroundColor: 'rgba(0,0,0,0.5)'
          }
        }}
        PaperProps={{
          sx: {
            overflow: 'hidden',
            borderRadius: 3,
            background: `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.85)}, ${alpha(theme.palette.background.paper, 0.6)})`,
            border: `1px solid ${alpha(theme.palette.neon.blue, 0.25)}`,
            boxShadow: `0 24px 80px ${alpha('#000', 0.55)}`,
            backdropFilter: 'saturate(120%) blur(12px)'
          }
        }}
      >
        <DialogTitle sx={{ pb: 1.5 }}>
          <Typography
            variant="h6"
            sx={{
              m: 0,
              fontWeight: 800,
              background: theme.palette.gradients?.primary,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: `0 0 24px ${alpha(theme.palette.neon.pink, 0.25)}`,
            }}
          >
            Sign in with Twitch
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
            <Chip 
              icon={<SecurityIcon sx={{ color: theme.palette.neon.blue }} />} 
              label="Secure OAuth"
              size="small"
              sx={{ 
                bgcolor: alpha(theme.palette.neon.blue, 0.12), 
                color: theme.palette.neon.blue,
                border: `1px solid ${alpha(theme.palette.neon.blue, 0.35)}`,
                fontWeight: 700
              }}
            />
            <Chip 
              label={<span>Free<sup>*</sup> mediashare</span>} 
              size="small"
              sx={{ 
                bgcolor: alpha(theme.palette.neon.pink, 0.12), 
                color: theme.palette.neon.pink,
                border: `1px solid ${alpha(theme.palette.neon.pink, 0.35)}`,
                fontWeight: 700
              }}
            />
          </Stack>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            Free<sup>*</sup> mediashare uses Twitch to confirm your identity. You’ll be redirected to Twitch to authorize access and then returned here.
          </DialogContentText>
          <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.background.elevated || theme.palette.background.paper, 0.6), border: `1px dashed ${alpha(theme.palette.divider, 0.6)}` }}>
            <Typography variant="caption" color="text.secondary">
              We only request the minimum needed to identify your account and connect your channel. No passwords are stored.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={closeLoginDialog} color="inherit">
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={startOAuthLogin} 
            autoFocus
            startIcon={<LoginIcon />}
            sx={{
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              '&:hover': {
                background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
              }
            }}
          >
            Continue with Twitch
          </Button>
        </DialogActions>
      </Dialog>
    </AuthContext.Provider>
  );
};

export default AuthContext;
