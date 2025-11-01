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

const resolveServerUrl = () => {
  const envUrl = process.env.REACT_APP_SERVER_URL;
  if (envUrl) {
    try {
      // If the env URL points to localhost but the app is served over HTTPS,
      // prefer the current origin to avoid mixed content / unreachable host.
      if (typeof window !== 'undefined' && window.location) {
        const isLocalEnv = /^(http:\/\/)?(localhost|127\.0\.0\.1)/i.test(envUrl);
        const isHttpsPage = window.location.protocol === 'https:';
        if (isHttpsPage && isLocalEnv) {
          return window.location.origin;
        }
      }
    } catch (e) {
      // fall through to use envUrl
    }
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return 'http://localhost:5000';
};

const DEFAULT_SERVER_URL = resolveServerUrl();

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
  const [scoresByItem, setScoresByItem] = useState({});
  const [cupStandings, setCupStandings] = useState({});
  const [cupVideoSummaries, setCupVideoSummaries] = useState({});
  const [cupMetadata, setCupMetadata] = useState({});
  const [topEight, setTopEight] = useState([]);
  const [vipQueue, setVipQueue] = useState([]);
  const [lastShuffle, setLastShuffle] = useState(null);
  const [votingState, setVotingState] = useState(null);

  // Establish connection to the root namespace
  useEffect(() => {
    const socket = io(DEFAULT_SERVER_URL, {
      // Allow polling fallback; many proxies require it before upgrade
      // transports: ["websocket", "polling"], // default
      path: '/socket.io',
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
    setScoresByItem({});
    setCupStandings({});
    setCupVideoSummaries({});
    setCupMetadata({});
    setTopEight([]);
    setLastShuffle(null);
    setVotingState(null);
    setActiveChannelId(null);
  }, []);

  const deriveTopEight = useCallback((queueItems) => {
    const items = Array.isArray(queueItems) ? queueItems : [];
    const selected = items
      .filter((item) => item.status === 'TOP_EIGHT')
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .slice(0, 8);
    setTopEight(selected);
  }, []);

  const handleQueueInitialState = useCallback((payload = {}) => {
    const nextQueue = Array.isArray(payload.queue) ? payload.queue : [];
    setQueue(nextQueue);
    setQueueEnabled(Boolean(payload.enabled));
    setCurrentlyPlaying(payload.currentlyPlaying || null);
    setVotingState(payload.votingState || null);
    deriveTopEight(nextQueue);
  }, [deriveTopEight]);

  const handleQueueUpdated = useCallback((updatedQueue = []) => {
    const nextQueue = Array.isArray(updatedQueue) ? updatedQueue : [];
    setQueue(nextQueue);
    deriveTopEight(nextQueue);
  }, [deriveTopEight]);

  const handleQueueVideoAdded = useCallback((video) => {
    setQueue((prev) => {
      const existing = prev.find((item) => item.id === video.id);
      if (existing) {
        return prev;
      }
      const updated = [...prev, video].sort((a, b) => a.position - b.position);
      deriveTopEight(updated);
      return updated;
    });
  }, [deriveTopEight]);

  const handleQueueVideoRemoved = useCallback(({ id }) => {
    if (!id) return;
    setQueue((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      deriveTopEight(updated);
      return updated;
    });
  }, [deriveTopEight]);

  const handleQueueItemUpdated = useCallback((payload = {}) => {
    const item = payload?.item || payload;
    if (!item?.id) {
      return;
    }

    setQueue((prev) => {
      let found = false;
      const next = prev.map((existing) => {
        if (existing.id === item.id) {
          found = true;
          return { ...existing, ...item };
        }
        return existing;
      });

      if (!found) {
        return prev;
      }

      deriveTopEight(next);
      return next;
    });
  }, [deriveTopEight]);

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

  const upsertJudgeScore = useCallback((judgeScore) => {
    if (!judgeScore?.queueItemId) {
      return;
    }

    setScoresByItem((prev) => {
      const next = { ...prev };
      const itemId = judgeScore.queueItemId;
      const entry = next[itemId] ? { ...next[itemId] } : {};
      const scoresArray = Array.isArray(entry.scores) ? [...entry.scores] : [];
      const existingIndex = scoresArray.findIndex((score) => score.id === judgeScore.id);

      if (existingIndex >= 0) {
        scoresArray[existingIndex] = judgeScore;
      } else {
        scoresArray.push(judgeScore);
      }

      entry.scores = scoresArray;
      entry.updatedAt = Date.now();
      next[itemId] = entry;
      return next;
    });
  }, []);

  const handleJudgeScoreUpdated = useCallback((payload = {}) => {
    if (payload?.judgeScore) {
      upsertJudgeScore(payload.judgeScore);
    }
  }, [upsertJudgeScore]);

  const handleJudgeVoteLocked = useCallback((payload = {}) => {
    if (payload?.judgeScore) {
      upsertJudgeScore(payload.judgeScore);
    }
  }, [upsertJudgeScore]);

  const handleJudgeVoteUnlocked = useCallback((payload = {}) => {
    if (payload?.judgeScore) {
      upsertJudgeScore(payload.judgeScore);
    }
  }, [upsertJudgeScore]);

  const handleQueueItemScored = useCallback((payload = {}) => {
    const { cupId, queueItemId, average, video } = payload;

    if (queueItemId) {
      setScoresByItem((prev) => {
        const next = { ...prev };
        const entry = next[queueItemId] ? { ...next[queueItemId] } : {};
        entry.average = average || null;
        entry.updatedAt = Date.now();
        next[queueItemId] = entry;
        return next;
      });
    }

    if (cupId && video) {
      setCupVideoSummaries((prev) => {
        const existing = Array.isArray(prev[cupId]) ? [...prev[cupId]] : [];
        const index = existing.findIndex((item) => item.queueItemId === video.queueItemId);
        const nextVideos = [...existing];
        if (index >= 0) {
          nextVideos[index] = video;
        } else {
          nextVideos.push(video);
        }

        return {
          ...prev,
          [cupId]: nextVideos
        };
      });
    }
  }, []);

  const handleShuffleEvent = useCallback((payload = {}) => {
    setLastShuffle(payload || null);

    if (Array.isArray(payload.finalOrder) && payload.finalOrder.length) {
      setTopEight(payload.finalOrder);
    }
  }, []);

  const handleTopEightUpdated = useCallback((payload = {}) => {
    if (Array.isArray(payload.topEight)) {
      setTopEight(payload.topEight);
    }
  }, []);

  const handleCupStandingsUpdated = useCallback((payload = {}) => {
    const { cupId, standings, videos } = payload;
    if (!cupId) {
      return;
    }

    if (Array.isArray(standings)) {
      setCupStandings((prev) => ({
        ...prev,
        [cupId]: standings
      }));
    }

    if (Array.isArray(videos)) {
      setCupVideoSummaries((prev) => ({
        ...prev,
        [cupId]: videos
      }));
    }

    const cupInfo = payload.cup;
    const metadataId = cupInfo?.id || cupId;
    if (metadataId && cupInfo) {
      setCupMetadata((prev) => ({
        ...prev,
        [metadataId]: {
          ...cupInfo,
          id: metadataId
        }
      }));
    }
  }, []);

  const handleVotingUpdate = useCallback((payload = null) => {
    if (payload && typeof payload === 'object') {
      setVotingState(payload);
    } else {
      setVotingState(null);
    }
  }, []);

  const handleVotingEnded = useCallback(() => {
    setVotingState(null);
  }, []);

  const loadChannelSettings = useCallback(async (channelId) => {
    try {
      const response = await fetch(`/api/channels/${channelId}/settings`, {
        credentials: 'include'
      });

      if (!response.ok) {
        // Silently fail for auth errors (judges don't have access to settings)
        if (response.status === 401 || response.status === 403) {
          setSettings(null);
          return;
        }
        console.warn('Failed to load channel settings:', response.status);
        setSettings(null);
        return;
      }

      const data = await response.json();
      setSettings(data.settings || null);
    } catch (error) {
      // Only log non-auth errors
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
    socket.on('queue:item_updated', handleQueueItemUpdated);
    socket.on('queue:status_changed', handleQueueStatusChanged);
    socket.on('queue:now_playing', handleQueueNowPlaying);
    socket.on('queue:cleared', () => {
      setQueue([]);
      setTopEight([]);
      setVotingState(null);
    });
    socket.on('setting:updated', handleSettingUpdated);
    socket.on('judge:score_updated', handleJudgeScoreUpdated);
    socket.on('judge:vote_locked', handleJudgeVoteLocked);
    socket.on('judge:vote_unlocked', handleJudgeVoteUnlocked);
    socket.on('queue:item_scored', handleQueueItemScored);
    socket.on('queue:shuffle', handleShuffleEvent);
    socket.on('queue:top_eight_updated', handleTopEightUpdated);
    socket.on('queue:vip_updated', (payload = {}) => {
      try {
        const list = Array.isArray(payload.vipQueue) ? payload.vipQueue.map((v) => Number(v)) : [];
        setVipQueue(list);
      } catch (err) {
        console.warn('Failed to handle vip_updated payload', err);
      }
    });
    socket.on('cup:standings_updated', handleCupStandingsUpdated);
    socket.on('voting:update', handleVotingUpdate);
    socket.on('voting:ended', handleVotingEnded);

    socket.on('error', (error) => {
      console.error('Channel socket error:', error);
    });
  }, [
    handleQueueInitialState,
    handleQueueUpdated,
    handleQueueVideoAdded,
    handleQueueVideoRemoved,
    handleQueueItemUpdated,
    handleQueueStatusChanged,
    handleQueueNowPlaying,
    handleSettingUpdated,
    handleJudgeScoreUpdated,
    handleJudgeVoteLocked,
    handleJudgeVoteUnlocked,
    handleQueueItemScored,
    handleShuffleEvent,
    handleTopEightUpdated,
    handleCupStandingsUpdated,
    handleVotingUpdate,
    handleVotingEnded
  ]);

  const connectToChannel = useCallback((channelId, options = {}) => {
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
      // Allow polling fallback and ensure path consistency
      path: '/socket.io',
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      withCredentials: true
    });

    channelSocketRef.current = namespace;
    setActiveChannelId(normalizedChannelId);
    attachChannelHandlers(namespace);
    
    // Only load settings if explicitly requested (for admin pages)
    // Judges don't need settings and don't have permission to access them
    if (options.loadSettings) {
      loadChannelSettings(normalizedChannelId);
    }
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
    console.debug(`[socket] emit ${event}`, payload);
    channelSocketRef.current.emit(event, payload);
  }, [channelConnected]);

  const refreshCupStandings = useCallback(async (cupId, options = {}) => {
    const channelId = (options.channelId || activeChannelId);
    if (!channelId || !cupId) {
      return null;
    }

    const publicAccess = options.publicAccess === true;
    const basePath = publicAccess
      ? `/api/channels/public/${channelId}/cups/${cupId}/standings`
      : `/api/channels/${channelId}/cups/${cupId}/standings`;

    try {
      const response = await fetch(basePath, {
        credentials: publicAccess ? 'omit' : 'include'
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to load cup standings');
      }

      const data = await response.json();

      if (Array.isArray(data.standings)) {
        setCupStandings((prev) => ({
          ...prev,
          [cupId]: data.standings
        }));
      }

      if (Array.isArray(data.videos)) {
        setCupVideoSummaries((prev) => ({
          ...prev,
          [cupId]: data.videos
        }));
      }

      if (data.cup) {
        const metadataId = data.cup.id || cupId;
        if (metadataId) {
          setCupMetadata((prev) => ({
            ...prev,
            [metadataId]: {
              ...data.cup,
              id: metadataId
            }
          }));
        }
      }

      return data;
    } catch (error) {
      console.error('Failed to refresh cup standings:', error);
      throw error;
    }
  }, [activeChannelId]);

  const refreshScoresForItem = useCallback(async (cupId, itemId, options = {}) => {
    const channelId = (options.channelId || activeChannelId);
    if (!channelId || !cupId || !itemId) {
      return null;
    }

    try {
      const response = await fetch(
        `/api/channels/${channelId}/cups/${cupId}/items/${itemId}/scores`,
        {
          credentials: 'include'
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to load judge scores');
      }

      const data = await response.json();

      setScoresByItem((prev) => ({
        ...prev,
        [itemId]: {
          scores: Array.isArray(data.scores) ? data.scores : [],
          average: data.average || null,
          completion: data.completion || null,
          updatedAt: Date.now()
        }
      }));

      return data;
    } catch (error) {
      console.error('Failed to refresh judge scores:', error);
      throw error;
    }
  }, [activeChannelId]);

  const triggerShuffle = useCallback(async (options = {}) => {
    const channelId = options.channelId || activeChannelId;
    if (!channelId) {
      throw new Error('Channel not connected');
    }

    const payload = {};
    if (Array.isArray(options.topEightIds) && options.topEightIds.length) {
      payload.topEightIds = options.topEightIds;
    }
    if (options.seed !== undefined) {
      payload.seed = options.seed;
    }

    const response = await fetch(`/api/channels/${channelId}/queue/shuffle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Failed to trigger shuffle');
    }

    return data.shuffle;
  }, [activeChannelId]);

  const callVotingEndpoint = useCallback(async (queueItemId, cupId, action, options = {}) => {
    const channelId = options.channelId || activeChannelId;

    if (!channelId) {
      throw new Error('Channel not connected');
    }
    if (!cupId) {
      throw new Error('Cup ID is required for voting actions');
    }
    if (!queueItemId) {
      throw new Error('Queue item ID is required for voting actions');
    }

    const payload = options.payload || {};

    const requestOptions = {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (Object.keys(payload).length > 0) {
      requestOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(
      `/api/channels/${channelId}/cups/${cupId}/items/${queueItemId}/voting/${action}`,
      requestOptions
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Voting action failed');
    }

    if (data.voting !== undefined) {
      setVotingState(data.voting);
    }

    return data.voting ?? null;
  }, [activeChannelId, setVotingState]);

  const startVotingSession = useCallback((queueItemId, cupId, options = {}) => (
    callVotingEndpoint(queueItemId, cupId, 'start', {
      channelId: options.channelId,
      payload: options.payload || {}
    })
  ), [callVotingEndpoint]);

  const cancelVotingSession = useCallback((queueItemId, cupId, options = {}) => (
    callVotingEndpoint(queueItemId, cupId, 'cancel', {
      channelId: options.channelId,
      payload: options.reason ? { reason: options.reason } : {}
    })
  ), [callVotingEndpoint]);

  const revealNextJudge = useCallback((queueItemId, cupId, options = {}) => (
    callVotingEndpoint(queueItemId, cupId, 'reveal-next', {
      channelId: options.channelId
    })
  ), [callVotingEndpoint]);

  const revealAverageScore = useCallback((queueItemId, cupId, options = {}) => (
    callVotingEndpoint(queueItemId, cupId, 'reveal-average', {
      channelId: options.channelId
    })
  ), [callVotingEndpoint]);

  const revealSocialScore = useCallback((queueItemId, cupId, options = {}) => (
    callVotingEndpoint(queueItemId, cupId, 'reveal-social', {
      channelId: options.channelId
    })
  ), [callVotingEndpoint]);

  const completeVotingSession = useCallback((queueItemId, cupId, options = {}) => (
    callVotingEndpoint(queueItemId, cupId, 'complete', {
      channelId: options.channelId,
      payload: options.reason ? { reason: options.reason } : {}
    })
  ), [callVotingEndpoint]);

  const playNext = useCallback(() => emitToChannel('queue:play_next'), [emitToChannel]);
  const skipCurrent = useCallback(() => emitToChannel('queue:skip'), [emitToChannel]);
  const markAsPlayed = useCallback((itemId) => emitToChannel('queue:mark_played', { itemId }), [emitToChannel]);
  const clearQueue = useCallback(() => emitToChannel('queue:clear', { clearedBy: 'admin' }), [emitToChannel]);
  const removeVideoFromQueue = useCallback((itemId) => emitToChannel('queue:remove', { itemId }), [emitToChannel]);
  const enableQueue = useCallback(() => emitToChannel('admin:enable_queue'), [emitToChannel]);
  const disableQueue = useCallback(() => emitToChannel('admin:disable_queue'), [emitToChannel]);
  const updateSetting = useCallback((key, value) => emitToChannel('settings:update', { key, value }), [emitToChannel]);
  const playOverlay = useCallback((time) => emitToChannel('player:play', { time }), [emitToChannel]);
  const pauseOverlay = useCallback((time) => emitToChannel('player:pause', { time }), [emitToChannel]);
  const seekOverlay = useCallback((time) => emitToChannel('player:seek', { time }), [emitToChannel]);

  const addChannelListener = useCallback((event, handler) => {
    if (!channelSocketRef.current) {
      console.warn('Channel socket not ready, cannot register listener:', event);
      return false;
    }
    console.debug(`[socket] listen ${event}`);
    channelSocketRef.current.on(event, handler);
    return true;
  }, []);

  const removeChannelListener = useCallback((event, handler) => {
    if (!channelSocketRef.current) return;
    console.debug(`[socket] unlisten ${event}`);
    channelSocketRef.current.off(event, handler);
  }, []);

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
    scoresByItem,
    cupStandings,
    cupVideoSummaries,
    cupMetadata,
    topEight,
  vipQueue,
    lastShuffle,
    votingState,
    

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
    playOverlay,
    pauseOverlay,
    seekOverlay,
    startVotingSession,
    cancelVotingSession,
    revealNextJudge,
    revealAverageScore,
    revealSocialScore,
    completeVotingSession,
    addChannelListener,
    removeChannelListener,
    refreshCupStandings,
    refreshScoresForItem,
    triggerShuffle,

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
    scoresByItem,
    cupStandings,
    cupVideoSummaries,
    cupMetadata,
    topEight,
    lastShuffle,
    votingState,
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
    playOverlay,
    pauseOverlay,
    seekOverlay,
    startVotingSession,
    cancelVotingSession,
    revealNextJudge,
    revealAverageScore,
    revealSocialScore,
    completeVotingSession,
    addChannelListener,
    removeChannelListener,
    refreshCupStandings,
    refreshScoresForItem,
    triggerShuffle,
    vipQueue,
    emitToChannel
  ]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};
