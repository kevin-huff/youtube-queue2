let player = {};
let progressInterval;
let emitSocketEvents = true;
let areCaptionsOn = true;
let useVideoPlayer = true;
let alwaysMuted = false;
let socket;
let height = '950';
let width = '1689';
export function initializeVideoPlayer(sharedSocket, setHeight = '845', setWidth = '1689') {
    socket = sharedSocket;
    height = setHeight;
    width = setWidth;

    console.log('socket', socket);
    // Watch for play pause clicks
    $('#youtube-play-pause').click(function() {
        emitSocketEvents = true; // User-initiated action, allow socket event emission
        let state = player.getPlayerState() === 1 ? 'pause' : 'play';
        player[state + 'Video']();
        updatePlayPauseButton();
        if (emitSocketEvents) {
            socket.emit('playerAction', { action: state, id: socket.id });
        }
    });
    // Listen for volume control changes
    $('#volume-control').on('input change', function() {
        // Get the current value of the volume slider
        let volume = $(this).val();
        // Update the player's volume
        player.setVolume(volume);
    });
    // Add click event listener to the progress bar's parent
    $('.progress').click(function(e) {
        let progressBar = $(this).find('.progress-bar');
        let x = e.pageX - $(this).offset().left;
        let clickedValue = x / $(this).width();
        let duration = player.getDuration();
        let seekToTime = clickedValue * duration;
        player.seekTo(seekToTime, true);
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        let progressValue = (seekToTime / duration) * 100;
        updateProgressBar(progressValue);
        // Emit progress change event
        socket.emit('playerAction', { action: 'progressChange', time: seekToTime, id: socket.id });
    });
    $('#youtube-cc').click(function() {
        emitSocketEvents = true; 
        if (areCaptionsOn) {
            player.unloadModule("captions");  // Works for html5 ignored by AS3
            player.unloadModule("cc");  // Works for AS3 ignored by html5
            if (emitSocketEvents) {
                socket.emit('playerAction', { action: 'ccOff', id: socket.id });
            }
            areCaptionsOn = false;
        } else {
            player.loadModule("captions");  // Works for html5 ignored by AS3
            player.loadModule("cc");  // Works for AS3 ignored by html5
            if (emitSocketEvents) {
                socket.emit('playerAction', { action: 'ccOn', id: socket.id });
            }
            areCaptionsOn = true;
        }
    });
    // Listen for player actions from other users
    socket.on('playerAction', function(data) {
        console.log('playerAction', data);
        emitSocketEvents = false;
        // Ignore events emitted by this socket
        if (data.id === socket.id) {
            return;
        }
        switch (data.action) {
            case 'play':
                if (useVideoPlayer === false) {
                    return;
                }
                let currentTime = player.getCurrentTime();
                if (Math.abs(currentTime - data.time) > .5) {
                    player.seekTo(data.time, true);
                }
                player.playVideo();
                break;
            case 'pause':
                if (useVideoPlayer === false) {
                    return;
                }
                player.pauseVideo();
                break;
            case 'progressChange':
                if (useVideoPlayer === false) {
                    return;
                }
                player.seekTo(data.time, true);
                break;
            case 'loadNewVideo':
                loadNewVideo(data.videoId, data.videoLink, socket, true, data.title);
                break;
            case 'closeModal':
                $("#watchYoutubeModal").modal("hide");
                break;
            case 'ccOn':
                if (useVideoPlayer === false) {
                    return;
                }
                player.loadModule("captions"); 
                player.loadModule("cc");
                break;
            case 'ccOff':
                if (useVideoPlayer === false) {
                    return;
                }
                player.unloadModule("captions");
                player.unloadModule("cc");
                break;
            default:
                console.log('Invalid action');
        }
        emitSocketEvents = true;
    });
    socket.on('gong_pause_video', function() {
        console.log('gong pause video');
        player.stopVideo();
    });
    socket.on('gong_close_video', function() {
        console.log('gong close video');                //close the modal

        $('#watchYoutubeModal').modal('hide');
    });
    makeYoutubeIframe('dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ',socket, height, width);

}
export function toggleVideoPlayer() {
    if (useVideoPlayer) {
        player.stopVideo();
        player.destroy();
        useVideoPlayer = false;
    } else {
        useVideoPlayer = true;
        //Clear the youtube-player div
        $('#youtube-player').html('');
        createPlayer('dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ',socket, height, width);
    }
}
export function toggleMute() {
    if (alwaysMuted) {
        player.unMute();
        alwaysMuted = false;
    } else {
        player.mute();
        alwaysMuted = true;
        // set volume slider to 0
        $('#volume-control').val(0);
    }
}
export function loadNewVideo(videoId, videoLink, socket, fromSocket = false, title) {
    console.log('loadNewVideo', videoId, videoLink);
    if (Object.keys(player).length === 0) {
        makeYoutubeIframe(videoId,videoLink,socket);
    }
    // update the modal title
    if (title) {
        $("#youtubeVideoTitle").text(title);
    } else {
        $("#youtubeVideoTitle").text(`Could not retrieve video title`);
    }
    $("#watchYoutubeModal").modal("show");

    let url = new URL(videoLink);
    let timestamp = url.searchParams.get("t");
    if(useVideoPlayer){
        if (timestamp) {
            player.loadVideoById({
                videoId: videoId,
                startSeconds: timestamp
            });
        } else {
            player.loadVideoById(videoId);
        }

        player.addEventListener('onStateChange', function(e) {
            if (e.data === YT.PlayerState.PLAYING) {
                updateProgressBar();
            }
        });
        $("#watchYoutubeModal").on("hidden.bs.modal", function () {
            player.pauseVideo();
            updateProgressBar(0);
            socket.emit('playerAction', { action: 'closeModal', id: socket.id, videoId: videoId, videoLink: videoLink })
            // Clear the local storage
            localStorage.removeItem('videoId');
            localStorage.removeItem('videoLink');
            localStorage.removeItem('title');
        });
        if (!fromSocket) {
            // Emit load new video event
            socket.emit('playerAction', { action: 'loadNewVideo', videoId: videoId, videoLink: videoLink, id: socket.id, title: title });
        }
        // Save the current video info to local storage
        localStorage.setItem('videoId', videoId);
        localStorage.setItem('videoLink', videoLink);
        localStorage.setItem('title', title);
    } else {
        let thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
        let fallback = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        
        let warning = `<div class="position-absolute w-100 h-100 d-flex justify-content-center align-items-center" style="background-color: rgba(0, 0, 0, 0.5);"><h1 class="text-white">Video Player Disabled</h1></div>`;
        let wrapper = `<div style="position: relative;">${warning}<img id="video-thumbnail" src="${thumbnail}" alt="Video Thumbnail" class="img-fluid"></div>`;
        
        $("#youtube-player").html(wrapper);
        
        let img = document.getElementById('video-thumbnail');
        img.onload = function() {
        if (this.naturalWidth === 120 && this.naturalHeight === 90) {
            this.src = fallback;
        }
        };
    }

}

export function makeYoutubeIframe(videoId, videoLink, socket, height = '850', width = '1900') {
    // Remove the existing YouTube Iframe API script if it exists
    var existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existingScript) {
        existingScript.parentNode.removeChild(existingScript);
    }

    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = function () {
        createPlayer(videoId, videoLink, socket, height, width);
    }
}

export function createPlayer(videoId, videoLink, socket, height = '850', width = '1900') {
    player = new YT.Player('youtube-player', {
        videoId: videoId,
        height: '90%',
        width: '90%',
        events: {
            'onReady': onPlayerReady,
            'onStateChange': function(event) {
                onPlayerStateChange(event, socket);
            },
            'onApiChange': onApiChange
        },
        playerVars: {
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            rel: 0,
            cc_load_policy: 1,
            cc_lang_pref: 'en'
        }
    });
}

  const onApiChange = _ => {   
    if (typeof player.setOption === 'function') {
        console.log('onApiChange', player.getOptions('captions')); // Debug line
      player.setOption('captions', 'track', {languageCode: 'en'}) // undocumented call
    }  
  }
  function updateProgressBar(progressValue = null) {
    // Set the progress bar to 0
    var progressBar = document.getElementById('youtube-player-progress-bar');
    if (progressValue !== null) {
        progressBar.style.width = progressValue + '%';
    }
    // Get the duration of the video
    let videoDuration = player.getDuration();
    // Set the total duration in your HTML
    document.getElementById('total-duration').textContent = formatTime(videoDuration); 
    // Divide the video duration by 100 to get the value for each percent
    let interval = videoDuration / 100;
    // Clear any existing interval
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    // Set an interval to update the progress bar every second
    progressInterval = setInterval(function () {
        // Check if player object is initialized and has getCurrentTime method
        if (player && typeof player.getCurrentTime === 'function') {
            // Get the current time of the video
            let currentTime = player.getCurrentTime();                    
            // Update the current time in your HTML
            document.getElementById('current-time').textContent = formatTime(currentTime);
            // Calculate the current progress value
            let progressValue = (currentTime / interval);
            // Set the progress bar to the current progress value
            progressBar.style.width = progressValue + '%';
        } else {
            console.warn('Player object is not initialized correctly or getCurrentTime method is not available');
        }
    }, 1000);
}

export function onPlayerReady(event) {
    updateProgressBar(0);
    $("#volume-control").val(player.getVolume());
}
export function onPlayerStateChange(event, socket, fromSocket = false) {
    // Toggle the play/pause button based on the player state
    updatePlayPauseButton();
    if (emitSocketEvents) { // Only emit socket events for user-initiated actions
        if (event.data == YT.PlayerState.PLAYING) {
            let currentTime = player.getCurrentTime();
            socket.emit('playerAction', { action: 'play', time: currentTime, id: socket.id });
        } else if (event.data == YT.PlayerState.PAUSED) {
            socket.emit('playerAction', { action: 'pause', id: socket.id });
        }
    }
    if (event.data == YT.PlayerState.PLAYING) {
        var duration = event.target.getDuration();
        var currentTime = event.target.getCurrentTime();
        var timeLeft = duration - currentTime;
        console.log("timeLeft", timeLeft);
        // Update the current time in your HTML
        document.getElementById('current-time').textContent = formatTime(currentTime);   
        // Calculate the current progress value
        let progressValue = (currentTime / duration) * 100;
        // Start updating the progress bar
        updateProgressBar(progressValue);
    } else if (event.data == YT.PlayerState.PAUSED) {
        // Clear the interval when the video is paused
        if (progressInterval) {
            clearInterval(progressInterval);
        }
    }
    // Enable or disable the cc based on the cc preference
    if (areCaptionsOn) {
        player.loadModule("captions"); 
        player.loadModule("cc");
    } else {
        player.unloadModule("captions");
        player.unloadModule("cc");
    }
}

  function updatePlayPauseButton() {
    let playButton = $('.fa-play');
    let pauseButton = $('.fa-pause');
    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        playButton.addClass('inactive').hide();
        pauseButton.removeClass('inactive').show();
    } else {
        pauseButton.addClass('inactive').hide();
        playButton.removeClass('inactive').show();
    }
}

function formatTime(time) {
    // Convert the time to minutes and seconds
    let minutes = Math.floor(time / 60);
    let seconds = Math.floor(time % 60);
    // Add leading zeros if necessary
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    // Return the formatted time
    return minutes + ':' + seconds;
}
