import * as socketEvents from './youtube_modules/socketEvents.js';
import * as domActions from './youtube_modules/domActions.js';
import * as utils from './youtube_modules/utils.js';
import * as videoPlayer from './youtube_modules/videoPlayer.js';
import fakeUsernames from './fake_usernames.js';


const leaderboard = window.leaderboard;
const moderations = window.moderationsData;
const socket = io();
socket.on("connect", () => {
  console.log(socket.connected); // true
});
document.addEventListener('DOMContentLoaded', function () {
  utils.setFakeUsernames(fakeUsernames);

  socketEvents.initializeSocketEvents(socket);
  domActions.initializeDOMActions(leaderboard, moderations, fakeUsernames,socket);
  videoPlayer.initializeVideoPlayer(socket);
  utils.countVideos();
  $('[data-toggle="tooltip"]').tooltip()

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
