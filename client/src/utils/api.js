/**
 * Shared API constants and helpers used across client pages.
 *
 * Previously every page that needed to talk to the server redeclared
 * SERVER_BASE / API_URL inline.  This module provides a single source
 * of truth.
 */

/**
 * Base URL of the Express server.
 * Falls back to the current origin so that the React dev-server proxy
 * and production builds both work out of the box.
 */
export const SERVER_BASE =
  process.env.REACT_APP_SERVER_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * Convenience constant for REST API calls (`${SERVER_BASE}/api`).
 */
export const API_URL = `${SERVER_BASE}/api`;

/**
 * Build an Authorization header object from a JWT token string.
 *
 * @param {string} token - JWT or access token.
 * @returns {{ Authorization: string }} Headers object ready to spread
 *   into a fetch/axios config.
 */
export const getAuthHeaders = (token) => ({
  Authorization: `Bearer ${token}`
});
