import * as socketEvents from './youtube_table_modules/socketEvents.js';
import * as domActions from './youtube_table_modules/domActions.js';
import * as utils from './youtube_table_modules/utils.js';

const leaderboard = window.leaderboard;
const moderations = window.moderationsData;

document.addEventListener('DOMContentLoaded', function () {
  socketEvents.initializeSocketEvents(leaderboard);
  domActions.initializeDOMActions(leaderboard, moderations);
  utils.countVideos();
  $('[data-toggle="tooltip"]').tooltip()

  // In your main script file after importing utils
  document.body.addEventListener('mouseover', function(event) {
    const closestVidCard = event.target.closest('.vid_card');
    if (closestVidCard) {
      utils.adjustTransformOrigin(closestVidCard);
    }
  });

  document.body.addEventListener('mouseout', function(event) {
    const closestVidCard = event.target.closest('.vid_card');
    if (closestVidCard) {
      utils.resetTransformOrigin(closestVidCard);
    }
  });
});
