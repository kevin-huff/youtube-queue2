import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import JudgePage from '../JudgePage';

// Mock SocketContext to avoid real sockets in tests
jest.mock('../../contexts/SocketContext', () => {
  const React = require('react');
  const SocketContext = React.createContext({
    connectToChannel: jest.fn(),
    disconnectFromChannel: jest.fn(),
    channelConnected: true,
    addChannelListener: jest.fn(),
    removeChannelListener: jest.fn(),
    playOverlay: jest.fn(),
    pauseOverlay: jest.fn(),
    seekOverlay: jest.fn(),
    gongState: null,
    settings: {},
    lastShuffle: null,
    currentlyPlaying: { id: 10, videoId: 'abc123', title: 'Test Video' }
  });
  return {
    __esModule: true,
    SocketProvider: ({ children }) => <SocketContext.Provider value={React.useContext(SocketContext)}>{children}</SocketContext.Provider>,
    useSocket: () => React.useContext(SocketContext)
  };
});

// Minimal hook mocks
jest.mock('../../hooks/useSyncedYouTubePlayer', () => ({
  useSyncedYouTubePlayer: () => ({
    containerRef: { current: null },
    playLocal: jest.fn(),
    pauseLocal: jest.fn(),
    seekLocal: jest.fn(),
    setVolume: jest.fn(),
    toggleMute: jest.fn(),
    currentTime: 0,
    duration: 0,
    volume: 100,
    muted: false,
    hasVideo: true
  })
}));

// Mock shuffle audio to avoid network
Object.defineProperty(global, 'Audio', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    play: jest.fn(),
    pause: jest.fn()
  }))
});

describe('JudgePage integration', () => {
  const channel = 'testchan';
  const cupId = 'cup123';
  const itemId = 10;
  const token = 'judge-token';

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={[`/judge/${channel}/${cupId}?token=${token}`]}>
        <Routes>
          <Route path="/judge/:channelName/:cupId" element={<JudgePage />} />
        </Routes>
      </MemoryRouter>
    );

  test('auto-starts session and locks score via lock-in', async () => {
    // Mock API endpoints
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((url, options = {}) => {
      if (url.includes('/judge/session/start')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: { id: 'sess1', cupId, judgeTokenId: 'judge_abc', judgeName: 'Judge One', status: 'ACTIVE' }
          })
        });
      }
      if (url.includes(`/items/${itemId}/score`) && options.method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ judgeScore: null })
        });
      }
      if (url.includes(`/items/${itemId}/score`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            judgeScore: { cupId, queueItemId: itemId, judgeTokenId: 'judge_abc', score: 4, isLocked: false }
          })
        });
      }
      if (url.includes(`/items/${itemId}/lock`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            judgeScore: { cupId, queueItemId: itemId, judgeTokenId: 'judge_abc', score: 4, isLocked: true, lockType: 'MANUAL' }
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderPage();

    // Dismiss the judge check-in dialog (the audio-unlock gesture)
    fireEvent.click(await screen.findByRole('button', { name: /i so swear/i }));

    await screen.findByText(/judge panel/i);
    expect(screen.getByText(/judge one/i)).toBeInTheDocument();

    // Set score then lock in (submits + locks). findByRole waits out the
    // check-in dialog's exit transition, which keeps the page aria-hidden.
    fireEvent.click(await screen.findByRole('button', { name: '4' }));
    fireEvent.click(await screen.findByRole('button', { name: /lock in/i }));

    await screen.findByText(/score locked in/i);

    fetchMock.mockRestore();
  });
});
