import * as socketEvents from './leader_board_modules/socketEvents.js';
import * as domActions from './leader_board_modules/domActions.js';
import * as utils from './leader_board_modules/utils.js';

const social_scores = window.socialScoresData;

const socket = io();
socket.on("connect", () => {
    console.log('socket connected:',socket.connected); // true
});

document.addEventListener('DOMContentLoaded', function () {
socketEvents.initializeSocketEvents(social_scores,0,socket);
domActions.initializeDOMActions();
utils.updateLeaderboard(social_scores,0);
});