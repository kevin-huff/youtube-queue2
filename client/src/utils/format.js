/**
 * Shared formatting utilities used across client pages.
 *
 * Each function was previously duplicated in multiple page components.
 * Canonical implementations are collected here so every consumer shares
 * a single source of truth.
 */

// ---------------------------------------------------------------------------
// Duration / timestamp helpers
// ---------------------------------------------------------------------------

/**
 * Format a duration in seconds as "m:ss" (e.g. "3:07").
 * Returns 'N/A' when the input is falsy (but treats 0 as valid).
 *
 * Used by: ChannelQueue, Dashboard, QueueOverlay
 */
export const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) {
    return 'N/A';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format a number of seconds as a playback timestamp "h:mm:ss" or "m:ss".
 *
 * Used by: ChannelQueue, PlayerOverlay
 */
export const formatTimestamp = (seconds) => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format a date value (ISO string / Date) as a short locale timestamp
 * such as "Jan 5, 02:30 PM".  Returns 'Just now' for falsy inputs.
 *
 * Used by: Dashboard, ChannelQueue (as formatModerationTimestamp)
 */
export const formatDateTimestamp = (value) => {
  if (!value) {
    return 'Just now';
  }

  try {
    const date = new Date(value);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return value;
  }
};

// ---------------------------------------------------------------------------
// Submitter / alias helpers
// ---------------------------------------------------------------------------

/**
 * Return the submitter alias (for overlays and the channel queue).
 * Falls back to 'Anonymous'.
 *
 * Used by: ChannelQueue, QueueOverlay
 */
export const getQueueAlias = (item) =>
  item?.submitterAlias || item?.submitter?.alias || 'Anonymous';

/**
 * Return the Twitch username of a queue item submitter.
 * Falls back to 'Anonymous'.
 *
 * Used by: Dashboard, CupAdmin, PlayerOverlay
 */
export const getSubmitterUsername = (item) =>
  item?.submitter?.twitchUsername || item?.submitterUsername || 'Anonymous';

/**
 * Convenience wrapper kept for call-site compatibility.
 *
 * Used by: Dashboard
 */
export const formatSubmitterLabel = (item) => getSubmitterUsername(item);

/**
 * Normalize a username string for display purposes.
 * Returns 'Anonymous' for empty / falsy values.
 *
 * Used by: ViewerHub, SeriesLeaderboardOverlay
 */
export const formatName = (username) => {
  const u = (username || '').toString().trim();
  return u || 'Anonymous';
};

// ---------------------------------------------------------------------------
// Numeric / ordinal helpers
// ---------------------------------------------------------------------------

/**
 * Format a points value for display.  Integers are shown without decimals;
 * fractional values are rounded to one decimal place.
 *
 * Used by: ViewerHub, SeriesLeaderboardOverlay
 */
export const formatPoints = (value) => {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) {
    return '0';
  }
  if (Number.isInteger(numeric)) {
    return numeric.toString();
  }
  return numeric.toFixed(1);
};

/**
 * Return an ordinal string for a ranking position (1st, 2nd, 3rd, 11th, etc.).
 *
 * Used by: ViewerHub, SeriesLeaderboardOverlay
 */
export const formatOrdinal = (value) => {
  const numeric = parseInt(value, 10);
  if (Number.isNaN(numeric) || numeric <= 0) {
    return '#?';
  }
  const v = numeric % 100;
  if (v >= 11 && v <= 13) {
    return `${numeric}th`;
  }
  switch (numeric % 10) {
    case 1:
      return `${numeric}st`;
    case 2:
      return `${numeric}nd`;
    case 3:
      return `${numeric}rd`;
    default:
      return `${numeric}th`;
  }
};
