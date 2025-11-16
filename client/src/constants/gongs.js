export const GONG_OWNER_ID = 'owner';
export const GONG_IMAGE_URL = process.env.REACT_APP_GONG_IMAGE_URL || '/assets/gong.png';
export const GONG_AUDIO_URL = process.env.REACT_APP_GONG_AUDIO_URL || '/assets/gong-hit.mp3';

export const getActiveGongEntries = (gongState, queueItemId) => {
  if (!gongState || !queueItemId) {
    return [];
  }
  if (gongState.queueItemId !== queueItemId) {
    return [];
  }
  return Array.isArray(gongState.entries) ? gongState.entries : [];
};

export const findGongEntry = (gongState, queueItemId, participantId) => {
  if (!participantId) {
    return null;
  }
  return getActiveGongEntries(gongState, queueItemId).find((entry) => entry.id === participantId) || null;
};
