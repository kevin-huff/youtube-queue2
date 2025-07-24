import * as socketEvents from './moderator_modules/socketEvents.js';
import * as domActions from './moderator_modules/domActions.js';
import * as utils from './moderator_modules/utils.js';

const social_scores = window.socialScoresData;
const moderations = window.moderationsData;

document.addEventListener('DOMContentLoaded', function () {
  socketEvents.initializeSocketEvents(social_scores);
  domActions.initializeDOMActions(social_scores, moderations);
  utils.countVideos();
});
