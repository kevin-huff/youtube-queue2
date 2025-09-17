import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const DEFAULT_SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();

  const [mainSocket, setMainSocket] = useState(null);
  const [mainConnected, setMainConnected] = useState(false);

  const channelSocketRef = useRef(null);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [channelConnected, setChannelConnected] = useState(false);

  const [queue, setQueue] = useState([]);
  const [queueEnabled, setQueueEnabled] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [settings, setSettings] = useState(null);

  // Establish connection to the root namespace
  useEffect(() => {
    const socket = io(DEFAULT_SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
      withCredentials: true
    });

    setMainSocket(socket);

    socket.on('connect', () => {
      setMainConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.warn('Disconnected from server:', reason);
      setMainConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setMainConnected(false);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return () => {
      socket.close();
    };
  }, []);

  const cleanupChannelSocket = useCallback(() => {
    if (channelSocketRef.current) {
      channelSocketRef.current.removeAllListeners();
      channelSocketRef.current.close();
      channelSocketRef.current = null;
    }
    setChannelConnected(false);
    setQueue([]);
    setQueueEnabled(false);
    setCurrentlyPlaying(null);
    setSettings(null);
    setActiveChannelId(null);
  }, []);

  const handleQueueInitialState = useCallback((payload = {}) => {
    setQueue(Array.isArray(payload.queue) ? payload.queue : []);
    setQueueEnabled(Boolean(payload.enabled));
    setCurrentlyPlaying(payload.currentlyPlaying || null);
  }, []);

  const handleQueueUpdated = useCallback((updatedQueue = []) => {
    setQueue(Array.isArray(updatedQueue) ? updatedQueue : []);
  }, []);

  const handleQueueVideoAdded = useCallback((video) => {
    setQueue((prev) => {
      const existing = prev.find((item) => item.id === video.id);
      if (existing) {
        return prev;
      }
      return [...prev, video].sort((a, b) => a.position - b.position);
    });
  }, []);

  const handleQueueVideoRemoved = useCallback(({ id }) => {
    if (!id) return;
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleQueueStatusChanged = useCallback(({ enabled }) => {
    setQueueEnabled(Boolean(enabled));
  }, []);

  const handleQueueNowPlaying = useCallback((payload) => {
    setCurrentlyPlaying(payload || null);
  }, []);

  const handleSettingUpdated = useCallback(({ key, value }) => {
    setSettings((prev) => ({
      ...(prev || {}),
      [key]: value
    }));
  }, []);

  const loadChannelSettings = useCallback(async (channelId) => {
    try {
      const response = await fetch(`/api/channels/${channelId}/settings`, {
        credentials: 'include'
      });

      if (!response.ok) {
        setSettings(null);
        return;
      }

      const data = await response.json();
      setSettings(data.settings || null);
    } catch (error) {
      console.warn('Failed to load channel settings:', error);
      setSettings(null);
    }
  }, []);

  const attachChannelHandlers = useCallback((socket) => {
    socket.on('connect', () => {
      setChannelConnected(true);
      socket.emit('queue:join');
    });

    socket.on('disconnect', (reason) => {
      console.warn('Disconnected from channel namespace:', reason);
      setChannelConnected(false);
    });

    socket.on('queue:initial_state', handleQueueInitialState);
    socket.on('queue:updated', handleQueueUpdated);
    socket.on('queue:video_added', handleQueueVideoAdded);
    socket.on('queue:video_removed', handleQueueVideoRemoved);
    socket.on('queue:status_changed', handleQueueStatusChanged);
    socket.on('queue:now_playing', handleQueueNowPlaying);
    socket.on('queue:cleared', () => setQueue([]));
    socket.on('setting:updated', handleSettingUpdated);

    socket.on('error', (error) => {
      console.error('Channel socket error:', error);
    });
  }, [handleQueueInitialState, handleQueueUpdated, handleQueueVideoAdded, handleQueueVideoRemoved, handleQueueStatusChanged, handleQueueNowPlaying, handleSettingUpdated]);

  const connectToChannel = useCallback((channelId) => {
    if (!channelId) {
      cleanupChannelSocket();
      return;
    }

    const normalizedChannelId = channelId.toLowerCase();

    if (channelSocketRef.current && activeChannelId === normalizedChannelId) {
      return;
    }

    cleanupChannelSocket();

    const namespace = io(`${DEFAULT_SERVER_URL}/channel/${normalizedChannelId}`, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      withCredentials: true
    });

    channelSocketRef.current = namespace;
    setActiveChannelId(normalizedChannelId);
    attachChannelHandlers(namespace);
    loadChannelSettings(normalizedChannelId);
  }, [activeChannelId, attachChannelHandlers, cleanupChannelSocket, loadChannelSettings]);

  useEffect(() => {
    if (!user || !Array.isArray(user.channels) || user.channels.length === 0) {
      return;
    }

    const defaultChannel = user.channels[0]?.id;
    if (defaultChannel && defaultChannel.toLowerCase() !== activeChannelId) {
      connectToChannel(defaultChannel);
    }
  }, [user, connectToChannel, activeChannelId]);

  const emitToChannel = useCallback((event, payload) => {
    if (!channelSocketRef.current || !channelConnected) {
      console.warn('Channel socket not connected, cannot emit:', event);
      return;
    }
    channelSocketRef.current.emit(event, payload);
  }, [channelConnected]);

  const playNext = useCallback(() => emitToChannel('queue:play_next'), [emitToChannel]);
  const skipCurrent = useCallback(() => emitToChannel('queue:skip'), [emitToChannel]);
  const markAsPlayed = useCallback((itemId) => emitToChannel('queue:mark_played', { itemId }), [emitToChannel]);
  const clearQueue = useCallback(() => emitToChannel('queue:clear'), [emitToChannel]);
  const removeVideoFromQueue = useCallback((itemId) => emitToChannel('queue:remove', { itemId }), [emitToChannel]);
  const enableQueue = useCallback(() => emitToChannel('admin:enable_queue'), [emitToChannel]);
  const disableQueue = useCallback(() => emitToChannel('admin:disable_queue'), [emitToChannel]);
  const updateSetting = useCallback((key, value) => emitToChannel('settings:update', { key, value }), [emitToChannel]);

  const contextValue = useMemo(() => ({
    // Connection state
    connected: mainConnected && channelConnected,
    socket: mainSocket,
    channelId: activeChannelId,
    channelConnected,

    // Queue state
    queue,
    queueEnabled,
    currentlyPlaying,
    settings,

    // Controls
    connectToChannel,
    disconnectFromChannel: cleanupChannelSocket,
    playNext,
    skipCurrent,
    markAsPlayed,
    clearQueue,
    removeVideoFromQueue,
    enableQueue,
    disableQueue,
    updateSetting,

    // Main socket helpers
    emit: mainSocket?.emit?.bind(mainSocket) ?? (() => {}),
    isConnected: mainConnected,
    emitToChannel
  }), [
    mainConnected,
    channelConnected,
    mainSocket,
    activeChannelId,
    queue,
    queueEnabled,
    currentlyPlaying,
    settings,
    connectToChannel,
    cleanupChannelSocket,
    playNext,
    skipCurrent,
    markAsPlayed,
    clearQueue,
    removeVideoFromQueue,
    enableQueue,
    disableQueue,
    updateSetting,
    emitToChannel
  ]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};
