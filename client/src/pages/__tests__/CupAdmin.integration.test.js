import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import CupAdmin from '../CupAdmin';

// Mock AuthContext to provide a logged-in user
jest.mock('../../contexts/AuthContext', () => {
  const React = require('react');
  const AuthContext = React.createContext({
    user: { id: 'acct1', username: 'tester' },
    loading: false
  });
  const AuthProvider = ({ children }) => (
    <AuthContext.Provider value={{ user: { id: 'acct1', username: 'tester' }, loading: false }}>
      {children}
    </AuthContext.Provider>
  );
  const useAuth = () => React.useContext(AuthContext);
  return { __esModule: true, AuthProvider, useAuth, default: AuthContext };
});

// Mock SocketContext
jest.mock('../../contexts/SocketContext', () => {
  const React = require('react');
  const socketValue = {
    connectToChannel: jest.fn(),
    disconnectFromChannel: jest.fn(),
    addChannelListener: jest.fn(),
    removeChannelListener: jest.fn(),
    refreshCupStandings: jest.fn().mockResolvedValue(undefined),
    refreshScoresForItem: jest.fn().mockResolvedValue(undefined),
    currentlyPlaying: null,
    channelId: 'testchan',
    cupStandings: { cup1: [], cup2: [] },
    cupVideoSummaries: { cup1: [], cup2: [] },
    scoresByItem: {}
  };
  const SocketContext = React.createContext(socketValue);
  const SocketProvider = ({ children }) => (
    <SocketContext.Provider value={socketValue}>{children}</SocketContext.Provider>
  );
  const useSocket = () => React.useContext(SocketContext);
  return { __esModule: true, SocketProvider, useSocket };
});

// Suppress chart rendering in tests
jest.mock(
  'react-chartjs-2',
  () => ({
    Bar: () => <div data-testid="chart" />
  }),
  { virtual: true }
);

// Mock Chart.js registration to avoid side effects
jest.mock('chart.js/auto', () => ({}), { virtual: true });

describe('CupAdmin integration (happy path)', () => {
  const channelName = 'testchan';

  beforeEach(() => {
    jest.spyOn(global, 'fetch').mockImplementation((url, opts = {}) => {
      if (url.includes(`/api/channels/${channelName}/cups`) && (!opts.method || opts.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            cups: [
              { id: 'cup1', title: 'Cup One', isActive: true, status: 'LIVE' },
              { id: 'cup2', title: 'Cup Two', isActive: false, status: 'DRAFT' }
            ]
          })
        });
      }
      if (url.includes(`/api/channels/${channelName}/cups`) && opts.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ cup: { id: 'cup3', title: 'New Cup', isActive: false, status: 'DRAFT' } })
        });
      }
      if (url.includes(`/judge-link`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ url: 'http://localhost/judge-link', token: 'tok', session: {} })
        });
      }
      if (url.includes(`/judges`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ judges: [] })
        });
      }
      if (url.includes(`/series`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ series: [] })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders cups and generates judge link', async () => {
    render(
      <MemoryRouter initialEntries={[`/channel/${channelName}/cups`]}>
        <CupAdmin channelName={channelName} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getAllByText(/cup one/i).length).toBeGreaterThan(0));

    const generateButtons = screen.getAllByRole('button', { name: /generate judge link/i });
    fireEvent.click(generateButtons[0]);

    const judgeNameInput = await screen.findByLabelText(/judge name/i);
    fireEvent.change(judgeNameInput, { target: { value: 'Judge Tester' } });

    fireEvent.click(screen.getByRole('button', { name: /^generate link$/i }));
    await waitFor(() => expect(screen.getByText(/judge link generated successfully/i)).toBeInTheDocument());
  });

  test('shows an error when cup creation fails', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((url, opts = {}) => {
      if (url.includes(`/api/channels/${channelName}/cups`) && opts.method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ cups: [] }) });
      }
      if (url.includes(`/api/channels/${channelName}/cups`) && opts.method === 'POST') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Bad request' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(
      <MemoryRouter initialEntries={[`/channel/${channelName}/cups`]}>
        <CupAdmin channelName={channelName} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /^create cup$/i }));
    const dialog = await screen.findByRole('dialog', { name: /create new cup/i });
    fireEvent.change(within(dialog).getByLabelText(/cup title/i), { target: { value: 'Fail Cup' } });
    fireEvent.change(within(dialog).getByLabelText(/slug/i), { target: { value: 'fail-cup' } });
    const createBtn = within(dialog).getByRole('button', { name: /^create cup$/i });
    fireEvent.click(createBtn);

    await waitFor(() => expect(screen.getByText(/bad request/i)).toBeInTheDocument());
  });
});
