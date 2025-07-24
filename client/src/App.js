import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Container, Box } from '@mui/material';
import { SocketProvider } from './contexts/SocketContext';
import QueuePage from './pages/QueuePage';
import AdminPage from './pages/AdminPage';
import NavBar from './components/NavBar';

function App() {
  return (
    <SocketProvider>
      <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
        <NavBar />
        <Container maxWidth="xl" sx={{ py: 3 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/queue" replace />} />
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Container>
      </Box>
    </SocketProvider>
  );
}

export default App;
