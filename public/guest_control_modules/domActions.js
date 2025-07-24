import { loadNewVideo, toggleVideoPlayer, toggleMute } from '../youtube_modules/videoPlayer.js';
let socket = null;
let lastUsernameUsed = '';
let isFirstLoad = true;
let audioContextInitialized = false;
export function initializeDOMActions(usedSocket) {
  socket = usedSocket;
  console.log('Initializing DOM Actions');
  const guestRatingSlider = document.getElementById('guestRating-slider');
  const guestRatingText = document.getElementById('guestRating-text');
  guestRatingSlider.addEventListener('input', function() {
    updateRating(guestRatingSlider, guestRatingText);
  });
  guestRatingText.addEventListener('input', function() {
    guestRatingSlider.value = guestRatingText.value;
    updateRating(guestRatingSlider, guestRatingText);
  });
  // Event listener for user interaction
  document.addEventListener('click', function() {
      if (!audioContextInitialized) {
          initializeAudioContext();
      }
  });
  document.getElementById('tts').addEventListener('canplaythrough', function() {
    // ignore the first load of the page
    if (isFirstLoad) {
      isFirstLoad = false;
      return;
    }    
    this.play().catch(e => console.error('Error playing audio:', e));
  });

  window.triggerGong = function() {
    const user = $('#username').val();
    const password = $('#password').val();

    socket.emit('gong', { username: user, password: password, trusted: true });
  }

  window.triggerVeto = function() {
    const user = $('#username').val();
    const password = $('#password').val();
    socket.emit('veto', { username: user, password: password, trusted: true });
  }

  window.triggerFart = function() {
    const user = $('#username').val();
    const password = $('#password').val();
    socket.emit('fart', { username: user, password: password, trusted: true });
  }

  window.rate = function() {
    $('#rateModal').modal('show');
  }

  window.lockedin = function() {
    const user = $('#username').val();
    const password = $('#password').val();
    socket.emit('lockedin', { username: user, password: password, trusted: true });
  }

  window.loadNewVideo = function(videoId, videoLink) {
    loadNewVideo(videoId, videoLink, socket);
  }
  window.toggleVideoPlayer = function() {
    toggleVideoPlayer();
    // Mute all audio on the page
    muteAllAudio();
  }
  window.toggleMute = function() {
    toggleMute();
    muteAllAudio();
  }
  window.triggerMoan = function() {
    const user = $('#username').val();
    const password = $('#password').val();
    socket.emit('moan', { username: user, password: password, trusted: true });
  }
  window.replayTTS = function() {
    document.getElementById('tts').play();
    socket.emit('play_tts');
  }
  window.updateName = function() {
    const user = $('#username').val();
    socket.emit('update_name', {user: user, lastUsernameUsed: lastUsernameUsed});
  }
  window.signOff = function() {
    const user = $('#username').val();
    socket.emit('sign_off', {user: user, lastUsernameUsed: lastUsernameUsed});
  }
  window.pauseTTS = function() {
    document.getElementById('tts').pause();
    socket.emit('pause_tts');
  }
  window.fixVideo = function() {
    // See if there's video info in the local storage
    const videoId = localStorage.getItem('videoId');
    const videoLink = localStorage.getItem('videoLink');
    const title = localStorage.getItem('title');
    console.log('fixVideo:', videoId, videoLink, title);
    if (videoId && videoLink && title) {
      console.log('should load video');
      localStorage.removeItem('videoId');
      localStorage.removeItem('videoLink');
      localStorage.removeItem('title');
      loadNewVideo(videoId, videoLink, socket, false, title);
    }
  }
  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl)
  })
  // See if there's video info in the local storage
  const videoId = localStorage.getItem('videoId');
  const videoLink = localStorage.getItem('videoLink');
  const title = localStorage.getItem('title');
  // If there is, make an alert telling them to re-enter their name and click the fix button
  if (videoId && videoLink && title) {
    console.log('should show alert');
    // Remove the 'd-none' class to show the alert
    $('#fixVideoAlert').removeClass('d-none');
  }

}

export function updateRating(guestRatingSlider, guestRatingText) {
    console.log('updateRating:', guestRatingSlider, guestRatingText);
    const guestRating = guestRatingSlider.value;
    guestRatingText.value = guestRating;
    const user = $('#username').val();
    lastUsernameUsed = user;
    $('#guestRating-value').text(`${user}'s Rating: ${guestRating}`);
    const password = $('#password').val();
    console.log('guestRating:', guestRating);
    socket.emit('guest_rates', {user: user, rating: guestRating, userinfo: { username: user, password: password, trusted: true }});
  }

function initializeAudioContext() {
    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var source = audioCtx.createMediaElementSource(document.getElementById('tts'));
    var gainNode = audioCtx.createGain();
    gainNode.gain.value = 4.5; // Set gain to 150%
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    audioContextInitialized = true;
    console.log('Audio context initialized');
}

function muteAllAudio() {
  const mediaElements = document.querySelectorAll('audio, video');

  mediaElements.forEach((element) => {
      element.muted = true;
  });
}