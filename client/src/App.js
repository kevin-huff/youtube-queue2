import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { SocketProvider } from './contexts/SocketContext';
import { AuthProvider } from './contexts/AuthContext';
import AuthContext from './contexts/AuthContext';
import NavBar from './components/NavBar';
import theme from './theme';

// Pages
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import ChannelQueue from './pages/ChannelQueue';
import PlayerOverlay from './pages/PlayerOverlay';
import QueueOverlay from './pages/QueueOverlay';
import LeaderboardOverlay from './pages/LeaderboardOverlay';
import SeriesLeaderboardOverlay from './pages/SeriesLeaderboardOverlay';
import JudgePage from './pages/JudgePage';
import JudgeOverlay from './pages/JudgeOverlay';
import CupAdmin from './pages/CupAdmin';
import ViewerHub from './pages/ViewerHub';
import OnboardingPage from './pages/OnboardingPage';
import SubmitterProfile from './pages/SubmitterProfile';
import AdminDebug from './pages/AdminDebug';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = React.useContext(AuthContext);
  
  if (loading) {
    return <Box>Loading...</Box>;
  }
  
  if (!user) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

function App() {
  const location = useLocation();
  const isPlayerRoute = location.pathname.startsWith('/player/');
  const isJudgeRoute = location.pathname.startsWith('/judge/');
  const isOverlayRoute = location.pathname.includes('/overlay');
  // Always hide NavBar on player overlay routes (even with controls=show)
  const shouldRenderNavBar = !isPlayerRoute && !isJudgeRoute && !isOverlayRoute;
  // Treat player overlay routes as pure overlays for styling
  const isPureOverlayView = isOverlayRoute || isPlayerRoute;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <SocketProvider>
          <Box
            sx={{
              minHeight: '100vh',
              backgroundColor: isPureOverlayView ? 'transparent' : 'background.default',
              backgroundImage: isPureOverlayView ? 'none' : undefined
            }}
          >
            {shouldRenderNavBar && <NavBar />}
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/viewer/:channelName" element={<ViewerHub />} />
              <Route path="/channel/:channelName" element={<ChannelQueue />} />
              <Route path="/u/:username" element={<SubmitterProfile />} />
              <Route path="/player/:channelName" element={<PlayerOverlay />} />
              <Route path="/overlay/:channelName/queue" element={<QueueOverlay />} />
              <Route path="/overlay/:channelName/leaderboard" element={<LeaderboardOverlay />} />
              <Route path="/overlay/:channelName/series" element={<SeriesLeaderboardOverlay />} />
              
              {/* Judge Route - Public route that uses token-based auth */}
              <Route 
                path="/judge/:channelName/:cupId" 
                element={<JudgePage />} 
              />
              
              {/* Judge Overlay Route - Fullscreen video player for judges */}
              <Route 
                path="/judge/:channelName/:cupId/overlay" 
                element={<JudgeOverlay />} 
              />
              
              {/* Protected Routes */}
              <Route 
                path="/onboarding" 
                element={
                  <ProtectedRoute>
                    <OnboardingPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/channel/:channelName/cups" 
                element={
                  <ProtectedRoute>
                    <CupAdmin />
                  </ProtectedRoute>
                } 
              />
              
              {/* Legacy Routes - Redirect or Remove */}
              <Route path="/queue" element={<Navigate to="/" replace />} />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute>
                    <AdminDebug />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/debug" 
                element={
                  <ProtectedRoute>
                    <AdminDebug />
                  </ProtectedRoute>
                } 
              />
              
              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Box>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
