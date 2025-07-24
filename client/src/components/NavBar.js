import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Chip,
  useTheme,
} from '@mui/material';
import {
  Queue as QueueIcon,
  AdminPanelSettings as AdminIcon,
  Circle as CircleIcon,
} from '@mui/icons-material';
import { useSocket } from '../contexts/SocketContext';

const NavBar = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { connected, queueEnabled, queue } = useSocket();

  const isQueuePage = location.pathname === '/queue';
  const isAdminPage = location.pathname === '/admin';

  return (
    <AppBar 
      position="static" 
      sx={{ 
        backgroundColor: 'background.paper',
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Toolbar>
        <Typography 
          variant="h6" 
          component="div" 
          sx={{ 
            flexGrow: 1,
            fontWeight: 600,
            color: 'primary.main',
          }}
        >
          YouTube Queue
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Connection Status */}
          <Chip
            icon={<CircleIcon sx={{ fontSize: '12px !important' }} />}
            label={connected ? 'Connected' : 'Disconnected'}
            color={connected ? 'success' : 'error'}
            size="small"
            variant="outlined"
          />

          {/* Queue Status */}
          <Chip
            label={queueEnabled ? `Queue Open (${queue.length})` : 'Queue Closed'}
            color={queueEnabled ? 'primary' : 'default'}
            size="small"
            variant={queueEnabled ? 'filled' : 'outlined'}
          />

          {/* Navigation Buttons */}
          <Button
            startIcon={<QueueIcon />}
            onClick={() => navigate('/queue')}
            variant={isQueuePage ? 'contained' : 'outlined'}
            sx={{ minWidth: 100 }}
          >
            Queue
          </Button>

          <Button
            startIcon={<AdminIcon />}
            onClick={() => navigate('/admin')}
            variant={isAdminPage ? 'contained' : 'outlined'}
            color="secondary"
            sx={{ minWidth: 100 }}
          >
            Admin
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default NavBar;
