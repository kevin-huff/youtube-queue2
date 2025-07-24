import * as videoPlayer from './youtube_modules/videoPlayer.js';
import * as socketEvents from './guest_control_modules/socketEvents.js';
import * as domActions from './guest_control_modules/domActions.js';


const socket = io();
socket.on("connect", () => {
    console.log('socket connected:',socket.connected); // true
});

document.addEventListener('DOMContentLoaded', function () {
    socketEvents.initializeSocketEvents(socket);
    domActions.initializeDOMActions(socket);
    videoPlayer.initializeVideoPlayer(socket, 619, 1100)
    
});