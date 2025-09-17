import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
import ChannelManage from './pages/ChannelManage';

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
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <SocketProvider>
          <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
            <NavBar />
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/channel/:channelName" element={<ChannelQueue />} />
              
              {/* Protected Routes */}
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/channel/:channelName/manage" 
                element={
                  <ProtectedRoute>
                    <ChannelManage />
                  </ProtectedRoute>
                } 
              />
              
              {/* Legacy Routes - Redirect or Remove */}
              <Route path="/queue" element={<Navigate to="/" replace />} />
              <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
              
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
