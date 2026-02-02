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
    service._connectSharedSession = jest.fn();
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

    test('returns false and reconnects when circuit timeout expires', () => {
      service._circuitOpen = true;
      service._circuitOpenUntil = Date.now() - 1000; // Expired
      
      const result = service._isCircuitOpen();
      
      expect(result).toBe(false);
      // Circuit stays open until successful connection calls _resetCircuitBreaker()
      // This ensures backoff escalates if reconnect fails immediately
      expect(service._circuitOpen).toBe(true);
      expect(service._connectSharedSession).toHaveBeenCalled();
    });
  });

  describe('_tripCircuitBreaker', () => {
    test('opens circuit with initial 60s backoff', () => {
      service._tripCircuitBreaker();
      
      expect(service._circuitOpen).toBe(true);
      expect(service._circuitBackoffMs).toBe(60000);
      expect(logger.warn).toHaveBeenCalledWith(
        'AdEventService: circuit breaker OPEN - pausing reconnects',
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

    test('schedules reconnect when backoff expires', () => {
      service._tripCircuitBreaker();
      
      // Fast-forward past the backoff period
      jest.advanceTimersByTime(60100);
      
      // Should have called _isCircuitOpen which triggers reconnect
      expect(service._connectSharedSession).toHaveBeenCalled();
    });

    test('clears previous timer on repeated trips', () => {
      service._tripCircuitBreaker();
      const firstTimer = service._circuitTimer;
      
      service._tripCircuitBreaker();
      const secondTimer = service._circuitTimer;
      
      expect(firstTimer).not.toBe(secondTimer);
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
    test('full cycle: trip -> wait -> reconnect -> success -> reset', () => {
      // 1. Rate limit hits, circuit trips
      service._tripCircuitBreaker();
      expect(service._circuitOpen).toBe(true);
      expect(service._isCircuitOpen()).toBe(true);
      
      // 2. During backoff, reconnects are blocked
      expect(service._isCircuitOpen()).toBe(true);
      expect(service._connectSharedSession).not.toHaveBeenCalled();
      
      // 3. Backoff expires, circuit closes and reconnects
      jest.advanceTimersByTime(60100);
      expect(service._connectSharedSession).toHaveBeenCalledTimes(1);
      
      // 4. Connection succeeds, reset circuit
      service._resetCircuitBreaker();
      expect(service._circuitOpen).toBe(false);
      expect(service._circuitBackoffMs).toBe(60000);
    });

    test('repeated failures increase backoff progressively', () => {
      const expectedBackoffs = [60, 120, 240, 480, 600, 600]; // Caps at 600s
      
      expectedBackoffs.forEach((expectedSec, i) => {
        service._tripCircuitBreaker();
        expect(logger.warn).toHaveBeenLastCalledWith(
          'AdEventService: circuit breaker OPEN - pausing reconnects',
          expect.objectContaining({ pauseSeconds: expectedSec })
        );
        
        // Fast-forward to trigger reconnect (which would fail and re-trip in real scenario)
        jest.advanceTimersByTime(service._circuitBackoffMs + 100);
      });
    });
  });
});
