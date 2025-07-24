import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueEnabled, setQueueEnabled] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:5000', {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    setSocket(newSocket);

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      
      // Request initial queue state
      newSocket.emit('queue:join');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      setConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnected(false);
    });

    // Queue event handlers
    newSocket.on('queue:initial_state', (data) => {
      console.log('Received initial queue state:', data);
      setQueue(data.queue || []);
      setQueueEnabled(data.enabled || false);
      setCurrentlyPlaying(data.currentlyPlaying || null);
    });

    newSocket.on('queue:video_added', (video) => {
      console.log('Video added to queue:', video);
      setQueue(prevQueue => [...prevQueue, video]);
    });

    newSocket.on('queue:video_removed', (data) => {
      console.log('Video removed from queue:', data);
      setQueue(prevQueue => prevQueue.filter(item => item.id !== data.id));
    });

    newSocket.on('queue:updated', (newQueue) => {
      console.log('Queue updated:', newQueue);
      setQueue(newQueue);
    });

    newSocket.on('queue:now_playing', (video) => {
      console.log('Now playing:', video);
      setCurrentlyPlaying(video);
      
      // Remove the currently playing video from the queue
      if (video) {
        setQueue(prevQueue => prevQueue.filter(item => item.id !== video.id));
      }
    });

    newSocket.on('queue:status_changed', (data) => {
      console.log('Queue status changed:', data);
      setQueueEnabled(data.enabled);
    });

    newSocket.on('queue:cleared', () => {
      console.log('Queue cleared');
      setQueue([]);
      setCurrentlyPlaying(null);
    });

    newSocket.on('queue:heartbeat', (data) => {
      // Periodic updates to keep in sync
      setQueue(data.queue || []);
      setQueueEnabled(data.enabled || false);
    });

    // Settings event handlers
    newSocket.on('setting:updated', (data) => {
      console.log('Setting updated:', data);
      setSettings(prevSettings => ({
        ...prevSettings,
        [data.key]: data.value
      }));
    });

    // Bot status handlers
    newSocket.on('bot:status', (data) => {
      console.log('Bot status:', data);
    });

    // Error handling
    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  // Socket methods
  const emitToSocket = (event, data) => {
    if (socket && connected) {
      socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit:', event);
    }
  };

  const removeVideoFromQueue = (itemId) => {
    emitToSocket('queue:remove', { itemId, removedBy: 'admin' });
  };

  const reorderQueue = (newOrder) => {
    emitToSocket('queue:reorder', { newOrder });
  };

  const playNext = () => {
    emitToSocket('queue:play_next');
  };

  const skipCurrent = () => {
    emitToSocket('queue:skip', { skippedBy: 'admin' });
  };

  const clearQueue = () => {
    emitToSocket('queue:clear', { clearedBy: 'admin' });
  };

  const markAsPlayed = (itemId) => {
    emitToSocket('queue:mark_played', { itemId });
  };

  const enableQueue = () => {
    emitToSocket('admin:enable_queue');
  };

  const disableQueue = () => {
    emitToSocket('admin:disable_queue');
  };

  const updateSetting = (key, value) => {
    emitToSocket('settings:update', { key, value });
  };

  const getSetting = (key) => {
    emitToSocket('settings:get', { key });
  };

  const changeVolume = (volume) => {
    emitToSocket('volume:change', { volume });
  };

  const getVolume = () => {
    emitToSocket('volume:get');
  };

  const requestStatus = () => {
    emitToSocket('status:request');
  };

  const contextValue = {
    socket,
    connected,
    queue,
    queueEnabled,
    currentlyPlaying,
    settings,
    // Methods
    removeVideoFromQueue,
    reorderQueue,
    playNext,
    skipCurrent,
    clearQueue,
    markAsPlayed,
    enableQueue,
    disableQueue,
    updateSetting,
    getSetting,
    changeVolume,
    getVolume,
    requestStatus,
    emitToSocket,
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};
