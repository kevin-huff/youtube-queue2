import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock SocketContext to avoid socket dependencies
jest.mock('../contexts/SocketContext', () => {
  const React = require('react');
  const SocketContext = React.createContext({});
  return {
    __esModule: true,
    SocketProvider: ({ children }) => <SocketContext.Provider value={{}}>{children}</SocketContext.Provider>,
    useSocket: () => React.useContext(SocketContext)
  };
});

// Mock pages that require heavy data fetching so we can focus on routing/guards
jest.mock('../pages/LandingPage', () => () => <div>Landing Page</div>);
jest.mock('../pages/Dashboard', () => () => <div>Dashboard Page</div>);
jest.mock('../pages/CupAdmin', () => () => <div>Cup Admin Page</div>);
jest.mock('../pages/AdminDebug', () => () => <div>Admin Debug Page</div>);
jest.mock('../pages/ChannelQueue', () => () => <div>Channel Queue Page</div>);
jest.mock('../pages/PlayerOverlay', () => () => <div>Player Overlay</div>);
jest.mock('../pages/QueueOverlay', () => () => <div>Queue Overlay</div>);
jest.mock('../pages/LeaderboardOverlay', () => () => <div>Leaderboard Overlay</div>);
jest.mock('../pages/SeriesLeaderboardOverlay', () => () => <div>Series Leaderboard Overlay</div>);
jest.mock('../pages/JudgePage', () => () => <div>Judge Page</div>);
jest.mock('../pages/JudgeOverlay', () => () => <div>Judge Overlay</div>);
jest.mock('../pages/ViewerHub', () => () => <div>Viewer Hub</div>);
jest.mock('../pages/OnboardingPage', () => () => <div>Onboarding Page</div>);
jest.mock('../pages/SubmitterProfile', () => () => <div>Submitter Profile</div>);

// Mock AuthContext to control auth state in tests
// Use var to avoid temporal dead zone with jest.mock hoisting
var mockAuth = { user: null, loading: false, isAuthenticated: false, login: jest.fn() }; // eslint-disable-line no-var
const getMockAuth = () => mockAuth;
jest.mock('../contexts/AuthContext', () => {
  const React = require('react');
  const AuthContext = React.createContext(getMockAuth());
  const AuthProvider = ({ children }) => (
    <AuthContext.Provider value={getMockAuth()}>{children}</AuthContext.Provider>
  );
  const useAuth = () => React.useContext(AuthContext);
  return {
    __esModule: true,
    default: AuthContext,
    AuthContext,
    AuthProvider,
    useAuth
  };
});

// Helper to update mocked auth before rendering
const setMockAuth = (next) => {
  mockAuth = { ...mockAuth, ...next };
};

// jsdom lacks matchMedia; stub it for LandingPage
beforeAll(() => {
  window.matchMedia = window.matchMedia || function matchMedia() {
    return {
      matches: false,
      addListener: () => {},
      removeListener: () => {}
    };
  };
});

describe('App routing/protected routes', () => {
  afterEach(() => {
    setMockAuth({ user: null, loading: false, isAuthenticated: false });
  });

  test('redirects unauthenticated users away from protected routes', () => {
    setMockAuth({ user: null, loading: false, isAuthenticated: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText(/mediashare/i)).toBeInTheDocument(); // Landing page rendered
  });

  test('allows authenticated users to access protected routes', () => {
    setMockAuth({ user: { id: 'u1', username: 'tester' }, loading: false, isAuthenticated: true });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText(/Dashboard Page/i)).toBeInTheDocument();
  });
});
