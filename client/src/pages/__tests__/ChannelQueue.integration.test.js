import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import ChannelQueue from '../ChannelQueue';

jest.mock('axios', () => {
  const mockAxios = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn()
  };
  return { __esModule: true, default: mockAxios, get: mockAxios.get, post: mockAxios.post, put: mockAxios.put };
});

// Mock SocketContext (not used heavily in this flow)
jest.mock('../../contexts/SocketContext', () => {
  const React = require('react');
  const socketState = {
    queue: [
      { id: 1, title: 'Video A', duration: 120, submitterAlias: 'Alice', status: 'PENDING' },
      { id: 2, title: 'Video B', duration: 95, submitterAlias: 'Bob', status: 'PENDING' }
    ],
    currentlyPlaying: { id: 1 },
    channelConnected: true
  };
  const socketValue = {
    connectToChannel: jest.fn(),
    disconnectFromChannel: jest.fn(),
    get queue() { return socketState.queue; },
    get currentlyPlaying() { return socketState.currentlyPlaying; },
    get channelConnected() { return socketState.channelConnected; },
    queueEnabled: true,
    topEight: [],
    lastShuffle: null,
    playNext: jest.fn(),
    skipCurrent: jest.fn(),
    playOverlay: jest.fn(),
    pauseOverlay: jest.fn(),
    seekOverlay: jest.fn(),
    addChannelListener: jest.fn(),
    removeChannelListener: jest.fn(),
    triggerShuffle: jest.fn(),
    settings: {},
    cupStandings: {},
    cupMetadata: {},
    refreshCupStandings: jest.fn(),
    votingState: null,
    startVotingSession: jest.fn(),
    cancelVotingSession: jest.fn(),
    revealNextJudge: jest.fn(),
    revealAverageScore: jest.fn(),
    revealSocialScore: jest.fn(),
    completeVotingSession: jest.fn(),
    showOverlayPlayer: jest.fn(),
    hideOverlayPlayer: jest.fn(),
    vipQueue: [],
    gongState: {},
    emitToChannel: jest.fn()
  };
  const SocketContext = React.createContext(socketValue);
  return {
    __esModule: true,
    __setQueue: (next) => { socketState.queue = next; },
    __setChannelConnected: (next) => { socketState.channelConnected = next; },
    SocketProvider: ({ children }) => <SocketContext.Provider value={socketValue}>{children}</SocketContext.Provider>,
    useSocket: () => React.useContext(SocketContext)
  };
});

// Minimal auth context so useAuth does not throw
jest.mock('../../contexts/AuthContext', () => {
  const React = require('react');
  const AuthContext = React.createContext({
    user: null,
    hasChannelRole: () => false
  });
  return {
    __esModule: true,
    AuthProvider: ({ children }) => <AuthContext.Provider value={React.useContext(AuthContext)}>{children}</AuthContext.Provider>,
    useAuth: () => React.useContext(AuthContext),
    default: AuthContext
  };
});

// Avoid loading real YouTube player
jest.mock('../../hooks/useSyncedYouTubePlayer', () => ({
  useSyncedYouTubePlayer: () => ({
    playLocal: jest.fn(),
    pauseLocal: jest.fn(),
    seekLocal: jest.fn(),
    setPlayerVolume: jest.fn(),
    toggleMute: jest.fn(),
    addPlayerListener: jest.fn(),
    removePlayerListener: jest.fn(),
    playerReady: true,
    muted: false,
    volume: 50,
    currentTime: 0,
    playing: false,
    hasVideo: true,
    playerState: {}
  })
}));

describe('ChannelQueue integration (public view)', () => {
  const channelName = 'testchan';
  const socketMock = require('../../contexts/SocketContext');

  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
    axios.put.mockReset();

    axios.get.mockImplementation((url) => {
      if (url.includes(`/api/channels/public/${channelName}`)) {
        return Promise.resolve({
          data: { channel: { id: channelName, displayName: 'Test Channel', isActive: true } }
        });
      }
      // ads/next or other axios calls should not break the test
      return Promise.resolve({ data: {} });
    });
    axios.post.mockResolvedValue({ data: {} });
    axios.put.mockResolvedValue({ data: {} });

    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      if (url.includes(`/api/channels/public/${channelName}/queue`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            channelId: channelName,
            queue: [
              { id: 1, title: 'Video A', duration: 120, submitterAlias: 'Alice', status: 'PENDING' },
              { id: 2, title: 'Video B', duration: 95, submitterAlias: 'Bob', status: 'PENDING' }
            ],
            currentlyPlaying: { id: 1 }
          })
        });
      }
      if (url.includes(`/api/channels/public/${channelName}`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            channel: { id: channelName, displayName: 'Test Channel', isActive: true }
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders queue items from API', async () => {
    render(
      <MemoryRouter initialEntries={[`/channel/${channelName}`]}>
        <Routes>
          <Route path="/channel/:channelName" element={<ChannelQueue />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/video a/i)).toBeInTheDocument());
    expect(screen.getByText(/video b/i)).toBeInTheDocument();
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/bob/i)).toBeInTheDocument();
  });

  test('shows empty state when queue has no items', async () => {
    socketMock.__setQueue([]);
    render(
      <MemoryRouter initialEntries={[`/channel/${channelName}`]}>
        <Routes>
          <Route path="/channel/:channelName" element={<ChannelQueue />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/no videos in queue/i)).toBeInTheDocument());
  });
});
