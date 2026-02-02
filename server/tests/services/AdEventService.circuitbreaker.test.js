/**
 * Circuit Breaker tests for AdEventService
 * 
 * Tests the rate-limit protection that prevents reconnect storms
 * when Twitch returns 429 errors.
 */

// Mock dependencies before requiring AdEventService
jest.mock('ws');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const AdEventService = require('../../src/services/AdEventService');
const logger = require('../../src/utils/logger');

describe('AdEventService Circuit Breaker', () => {
  let service;
  
  beforeEach(() => {
    jest.useFakeTimers();
    // Create service with minimal mocks
    service = new AdEventService(
      { getChannel: jest.fn() }, // channelManager
      { say: jest.fn() }         // bot
    );
    // Don't actually connect
    service._connectSession = jest.fn();
  });
  
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('_isCircuitOpen', () => {
    test('returns false when circuit is not tripped', () => {
      expect(service._isCircuitOpen()).toBe(false);
    });

    test('returns true when circuit is open and not expired', () => {
      service._circuitOpen = true;
      service._circuitOpenUntil = Date.now() + 60000;
      expect(service._isCircuitOpen()).toBe(true);
    });

    test('returns false and drains pending reconnects when circuit timeout expires', () => {
      service._circuitOpen = true;
      service._circuitOpenUntil = Date.now() - 1000; // Expired
      service._pendingReconnects = [
        { broadcasterId: '123', userAccessToken: 'token1' }
      ];
      
      const result = service._isCircuitOpen();
      
      expect(result).toBe(false);
      // Circuit stays open until successful connection calls _resetCircuitBreaker()
      expect(service._circuitOpen).toBe(true);
      // Pending reconnects should be drained (array emptied)
      expect(service._pendingReconnects).toHaveLength(0);
    });
  });

  describe('_tripCircuitBreaker', () => {
    test('opens circuit with initial 60s backoff', () => {
      service._tripCircuitBreaker();
      
      expect(service._circuitOpen).toBe(true);
      expect(service._circuitBackoffMs).toBe(60000);
      expect(logger.warn).toHaveBeenCalledWith(
        'AdEventService: circuit breaker OPEN - pausing ALL reconnects',
        expect.objectContaining({ pauseSeconds: 60 })
      );
    });

    test('doubles backoff on repeated trips', () => {
      service._tripCircuitBreaker();
      expect(service._circuitBackoffMs).toBe(60000);
      
      service._tripCircuitBreaker();
      expect(service._circuitBackoffMs).toBe(120000);
      
      service._tripCircuitBreaker();
      expect(service._circuitBackoffMs).toBe(240000);
    });

    test('caps backoff at max 10 minutes', () => {
      // Trip multiple times to exceed max
      for (let i = 0; i < 10; i++) {
        service._tripCircuitBreaker();
      }
      
      expect(service._circuitBackoffMs).toBe(600000); // 10 minutes max
    });

    test('schedules reconnect drain when backoff expires', () => {
      service._pendingReconnects = [
        { broadcasterId: '123', userAccessToken: 'token1' }
      ];
      service._tripCircuitBreaker();
      
      // Fast-forward past the backoff period
      jest.advanceTimersByTime(60100);
      
      // Should have drained pending reconnects
      expect(service._pendingReconnects).toHaveLength(0);
    });

    test('clears previous timer on repeated trips', () => {
      service._tripCircuitBreaker();
      const firstTimer = service._circuitTimer;
      
      service._tripCircuitBreaker();
      const secondTimer = service._circuitTimer;
      
      expect(firstTimer).not.toBe(secondTimer);
    });
  });

  describe('_queueReconnect', () => {
    test('adds broadcaster to pending queue', () => {
      service._queueReconnect('123', 'token1');
      
      expect(service._pendingReconnects).toHaveLength(1);
      expect(service._pendingReconnects[0]).toEqual({
        broadcasterId: '123',
        userAccessToken: 'token1'
      });
    });

    test('prevents duplicate broadcasters in queue', () => {
      service._queueReconnect('123', 'token1');
      service._queueReconnect('123', 'token1');
      service._queueReconnect('123', 'token2'); // Same broadcaster, different token
      
      expect(service._pendingReconnects).toHaveLength(1);
    });

    test('allows different broadcasters', () => {
      service._queueReconnect('123', 'token1');
      service._queueReconnect('456', 'token2');
      
      expect(service._pendingReconnects).toHaveLength(2);
    });
  });

  describe('_drainPendingReconnects', () => {
    test('empties the pending queue', () => {
      service._pendingReconnects = [
        { broadcasterId: '123', userAccessToken: 'token1' },
        { broadcasterId: '456', userAccessToken: 'token2' }
      ];
      
      service._drainPendingReconnects();
      
      expect(service._pendingReconnects).toHaveLength(0);
    });

    test('calls _connectSession for each pending broadcaster with stagger', () => {
      service._pendingReconnects = [
        { broadcasterId: '123', userAccessToken: 'token1' },
        { broadcasterId: '456', userAccessToken: 'token2' }
      ];
      
      service._drainPendingReconnects();
      
      // First one should connect immediately
      jest.advanceTimersByTime(0);
      expect(service._connectSession).toHaveBeenCalledTimes(1);
      expect(service._connectSession).toHaveBeenCalledWith('123', 'token1');
      
      // Second one after 2 seconds
      jest.advanceTimersByTime(2000);
      expect(service._connectSession).toHaveBeenCalledTimes(2);
      expect(service._connectSession).toHaveBeenCalledWith('456', 'token2');
    });

    test('does nothing when queue is empty', () => {
      service._pendingReconnects = [];
      
      service._drainPendingReconnects();
      
      expect(service._connectSession).not.toHaveBeenCalled();
    });
  });

  describe('_resetCircuitBreaker', () => {
    test('resets all circuit state', () => {
      // First trip the circuit
      service._tripCircuitBreaker();
      service._tripCircuitBreaker(); // Double backoff
      
      expect(service._circuitOpen).toBe(true);
      expect(service._circuitBackoffMs).toBe(120000);
      expect(service._circuitTimer).toBeTruthy();
      
      // Now reset
      service._resetCircuitBreaker();
      
      expect(service._circuitOpen).toBe(false);
      expect(service._circuitBackoffMs).toBe(60000); // Back to initial
      expect(service._circuitTimer).toBeNull();
    });
  });

  describe('integration: rate limit recovery flow', () => {
    test('full cycle: trip -> queue -> wait -> drain -> success -> reset', () => {
      // 1. Rate limit hits, circuit trips
      service._tripCircuitBreaker();
      expect(service._circuitOpen).toBe(true);
      
      // 2. Queue some reconnects
      service._queueReconnect('123', 'token1');
      service._queueReconnect('456', 'token2');
      expect(service._pendingReconnects).toHaveLength(2);
      
      // 3. During backoff, _isCircuitOpen returns true
      expect(service._isCircuitOpen()).toBe(true);
      expect(service._connectSession).not.toHaveBeenCalled();
      
      // 4. Backoff expires, pending reconnects drain
      jest.advanceTimersByTime(60100);
      expect(service._pendingReconnects).toHaveLength(0);
      
      // 5. Connections happen with stagger
      jest.advanceTimersByTime(2000);
      expect(service._connectSession).toHaveBeenCalledTimes(2);
      
      // 6. Successful connection resets circuit
      service._resetCircuitBreaker();
      expect(service._circuitOpen).toBe(false);
      expect(service._circuitBackoffMs).toBe(60000);
    });

    test('repeated failures increase backoff progressively', () => {
      const expectedBackoffs = [60, 120, 240, 480, 600, 600]; // Caps at 600s
      
      expectedBackoffs.forEach((expectedSec) => {
        service._tripCircuitBreaker();
        expect(logger.warn).toHaveBeenLastCalledWith(
          'AdEventService: circuit breaker OPEN - pausing ALL reconnects',
          expect.objectContaining({ pauseSeconds: expectedSec })
        );
        
        // Fast-forward to trigger drain
        jest.advanceTimersByTime(service._circuitBackoffMs + 100);
      });
    });
  });
});
