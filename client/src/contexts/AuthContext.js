import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button
} from '@mui/material';

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
      <Dialog open={loginDialogOpen} onClose={closeLoginDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Sign in with Twitch</DialogTitle>
        <DialogContent>
          <DialogContentText>
            FREE* Mediashare uses Twitch OAuth to confirm your identity. You&rsquo;ll be redirected to
            Twitch to authorize KevNetCloud × ChatGPT and then returned here.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={closeLoginDialog} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={startOAuthLogin} autoFocus>
            Continue with Twitch
          </Button>
        </DialogActions>
      </Dialog>
    </AuthContext.Provider>
  );
};

export default AuthContext;
