let isTTSPaused = false;
let audioContextInitialized = false;
let ratings = {
    user1: { average: 0, judges: {} },
    user2: { average: 0, judges: {} }
};

// Event listener for user interaction
document.addEventListener('click', function() {
    if (!audioContextInitialized) {
        initializeAudioContext();
    }
});
document.getElementById('tts').addEventListener('canplaythrough', function() {
    //toggleOverlay();    
    if (!isTTSPaused) {
        if (audioContextInitialized) {
            this.play().catch(e => console.error('Error playing audio:', e));
        }
    }
});
// Event listeners for the new buttons
document.getElementById('toggleTTS').addEventListener('click', togglePlayPause);
document.getElementById('replayTTS').addEventListener('click', replayTTS);
document.getElementById('showWinner').addEventListener('click', animateWinner);
$(document).ready(function() {
    var socket = io();

    socket.on('updateFinals', function(data) {
        console.log(data.roundNumber);
        console.log(data.roundTitle);
        // Update round title and user details
        $('#roundTitle').text(data.roundTitle);
        $('.roundNumberSpan').text(data.roundNumber);
        $('.matchNumberSpan').text(data.matchNumber);
        $('.nextMatchNumberSpan').text(parseInt(data.matchNumber));

        // User 1
        $('#user1Name').text(data.user1.name);
        $('#user1VideoLink').attr('href', data.user1.videoLink);
        $('#user1Thumbnail').attr('src', getThumbnail(data.user1.videoData));
        $('#user1Title').text(data.user1.videoData.snippet.title);
        $('#user1RatingVideoInfoTitle').text(data.user1.videoData.snippet.title);
        $('#user1RatingVideoInfoUsername').text(data.user1.name);
        $('#user1RatingVideoInfoThumbnail').attr('src', getThumbnail(data.user1.videoData));
        // User 2
        $('#user2Name').text(data.user2.name);
        $('#user2VideoLink').attr('href', data.user2.videoLink);
        $('#user2Thumbnail').attr('src', getThumbnail(data.user2.videoData));
        $('#user2Title').text(data.user2.videoData.snippet.title);
        $('#user2RatingVideoInfoTitle').text(data.user2.videoData.snippet.title);
        $('#user2RatingVideoInfoUsername').text(data.user2.name);
        $('#user2RatingVideoInfoThumbnail').attr('src', getThumbnail(data.user2.videoData));
        // Flip the cards if they are not already flipped
        if(document.getElementsByClassName('card')[0].classList.contains('card-flipped')) {
            const cards = document.getElementsByClassName('card');
            for (let i = 0; i < cards.length; i++) {
                cards[i].classList.toggle('card-flipped');
            }
        }
        // Reset the ratings and stars
        resetRatingsDisplayToZero('user1');
        resetRatingsDisplayToZero('user2');
        // Hide the winner div
        hideWinnerDiv();
        // Remove the winner animation class
        $('.winner-animation').removeClass('winner-animation');
    });
    socket.on("play_tts", function () {
        console.log("tts played");
        const tts_sound = document.getElementById(`tts`);
        tts_sound.src = "/tts?" + new Date().getTime();
        tts_sound.load();
    });
    socket.on("updateFinalsRatings", function (updatedRatings) {
        console.log(updatedRatings);
        // Update UI with average and individual ratings
        updateRatingDisplay('user1', updatedRatings.user1);
        updateRatingDisplay('user2', updatedRatings.user2);
        ratings = updatedRatings;
    });
    socket.on("toggle_overlay", function () {
        // Increment nextMatchNumberSpan
        $('.nextMatchNumberSpan').text(parseInt($('.nextMatchNumberSpan').text()) + 1);
        // Hide the winner div
        hideWinnerDiv();
        // Remove the winner animation class
        $('.winner-animation').removeClass('winner-animation');
        toggleOverlay();
    });
    socket.on("play_lockedin", function () {
        console.log("lockedin");
        const lockedin_sound = document.getElementById(`lockedin`);
        lockedin_sound.volume = 1;
        lockedin_sound.play();    
      });
      socket.on("play_fart", function () {
        console.log("fart played");
        // Get all elements with IDs starting with 'fart'
        const fartSounds = document.querySelectorAll('[id^="fart_"]');
        if (fartSounds.length > 0) {
            // Randomly select one of the fart sounds
            const randomIndex = Math.floor(Math.random() * fartSounds.length);
            const selectedFartSound = fartSounds[randomIndex];
  
            // Set volume and play the selected fart sound
            selectedFartSound.volume = 1;
            selectedFartSound.play();
        } else {
            console.log("No fart sounds found");
        }
    });
    socket.on("play_moan", function () {
        console.log("moan played");
        // Get all elements with IDs starting with 'moan'
        const moanSounds = document.querySelectorAll('[id^="moan_"]');
        if (moanSounds.length > 0) {
            // Randomly select one of the moan sounds
            const randomIndex = Math.floor(Math.random() * moanSounds.length);
            const selectedMoanSound = moanSounds[randomIndex];
            console.log('maon index', randomIndex);
            // Set volume and play the selected moan sound
            selectedMoanSound.volume = .5;
            selectedMoanSound.play();
        } else {
            console.log("No moan sounds found");
        }
    });
});

function getThumbnail(youtube){
    // Existing function to get thumbnail URL
    let thumbnailUrl = "";
    if (youtube["snippet"]["thumbnails"]["standard"]) {
        thumbnailUrl = youtube["snippet"]["thumbnails"]["standard"]["url"];
    } else {
        thumbnailUrl = youtube["snippet"]["thumbnails"]["default"]["url"];
    }
    return thumbnailUrl;
}
function updateRatingDisplay(userId, ratingData) {
    // Round the average rating to 4 decimal places
    ratingData.average = Math.round(ratingData.average * 10000) / 10000;
    // Update average rating display
    $(`#${userId}AverageRatingStars`).html(generateStars(ratingData.average));
    $(`#${userId}AverageRatingNumber`).html(ratingData.average.toFixed(4)); // Display the rating with 4 decimal places

    // Clear existing judge ratings
    $(`#${userId}JudgeRatings`).empty();

    // Update individual judges' ratings
    for (let judgeId in ratingData.judges) {
        // Append each judge rating to the judge-ratings div
        $(`#${userId}JudgeRatings`).append(
            `<div class="judge-rating" data-judge-id="${judgeId}">
                <div class="judge-name">${judgeId}</div>
                <div class="judge-rating-stars" id="${userId}-${judgeId}-RatingStars">
                ${generateStars(ratingData.judges[judgeId])}
                </div>
                <div class="judge-rating-number" id="${userId}RatingNumber">${ratingData.judges[judgeId]}</div>
            </div>`
        );
    }
  
  
  let winnerId;
    if (isNaN(parseFloat(ratings.user1.average)) || isNaN(parseFloat(ratings.user2.average))) {
        // Handle error scenario
        winnerId = 'error'; // or any other error handling
    } else if (parseFloat(ratings.user1.average) > parseFloat(ratings.user2.average)) {
        winnerId = 'user1';
    } else if (parseFloat(ratings.user1.average) < parseFloat(ratings.user2.average)) {
        winnerId = 'user2';
    } else {
        // Handle the case where both have equal ratings
        winnerId = 'tie'; // or any other appropriate action
    }
    // Update winner div with their name
    $('#winner').text($(`#${winnerId}Name`).text() + ' wins the match!');
    // Store the winnerId in a global variable
    window.winnerId = winnerId;
}

function updateJudgeRatingDisplay(userId, judgeId, rating) {
    // Round the rating to 4 decimal places
    rating = Math.round(rating * 10000) / 10000;
    // Update judge rating display
    $(`#${userId}JudgeRatings [data-judge-id="${judgeId}"] .judge-rating-number`).html(rating.toFixed(4)); // Display the rating with 4 decimal places
    $(`#${userId}-${judgeId.replace(/\s/g, '\\ ')}-RatingStars`).html(generateStars(rating));
}
function updateAverageRatingDisplay(userId, rating) {
    // Round the average rating to 4 decimal places
    rating = Math.round(rating * 10000) / 10000;
    // Update average rating display
    $(`#${userId}AverageRatingStars`).html(generateStars(rating));
    $(`#${userId}AverageRatingNumber`).html(rating.toFixed(4)); // Display the rating with 4 decimal places
}
function generateStars(value) {
    const fullStars = Math.floor(value);
    const partialStarPercentage = (value - fullStars) * 100;

    let starsHTML = '';

    // Add full stars
    for (let i = 0; i < fullStars; i++) {
        starsHTML += '<i class="fas fa-star"></i>';
    }

    // Add partial star if needed
    if (partialStarPercentage > 0) {
        starsHTML += `<i class="fas fa-star" style="clip-path: inset(0 ${100 - partialStarPercentage}% 0 0);"></i>`;
    }

    // Fill the rest with empty stars
    // Adjust the starting point of the loop to account for the partial star
    for (let i = fullStars + (partialStarPercentage > 0 ? 1 : 0); i < 4; i++) {
        starsHTML += '<i class="far fa-star"></i>';
    }

    return starsHTML;
}

function animateWinner() {
    resetRatingsDisplayToZero('user1');
    resetRatingsDisplayToZero('user2');

    // Use async function to handle animations in sequence
    async function runAnimations() {
        // Animate cards flipping
        await animateCards();
        // Animate ratings sequentially
        await animateRatings(ratings.user1, 'user1');
        await animateRatings(ratings.user2, 'user2');
        revealWinnerDiv();
        // Pulse the winner's div
        $(`.${winnerId}`).addClass('winner-animation');
    }

    runAnimations();
}
function animateCards() {
    return new Promise(resolve => {
        const cards = document.getElementsByClassName('card');
        for (let i = 0; i < cards.length; i++) {
            cards[i].classList.toggle('card-flipped');
        }
        setTimeout(() => resolve(), 1000); // Adjust time as per the animation duration
    });
}
function animateRatings(ratingData, userId) {
    return new Promise(async resolve => {
        // Animate judges' ratings
        for (let judgeId of Object.keys(ratingData.judges)) {
            await animateJudgeRating(ratingData, userId, judgeId);
        }

        // Animate average rating
        await animateAverageRating(ratingData, userId);
        resolve();
    });
}
function resetRatingsDisplayToZero(userId) {
    // Set average rating display to 0
    $(`#${userId}AverageRatingNumber`).html(0.0000.toFixed(4));
    $(`#${userId}AverageRatingStars`).html(generateZeroStars());

    // Set all judge ratings to 0
    let judgeRatings = $(`#${userId}JudgeRatings .judge-rating`);
    judgeRatings.each(function() {
        $(this).find('.judge-rating-number').html(0.0000.toFixed(4));
        $(this).find('.judge-rating-stars').html(generateZeroStars());
    });
}
function animateAverageRating(ratingData, userId) {
    return new Promise(resolve => {
        let currentRating = 0;
        const increment = ratingData.average / 100;
        const intervalId = setInterval(() => {
            if (currentRating < ratingData.average) {
                currentRating += increment;
                updateAverageRatingDisplay(userId, currentRating);
            } else {
                clearInterval(intervalId);
                updateAverageRatingDisplay(userId, ratingData.average);
                resolve();
            }
        }, 30);
    });
}
function animateJudgeRating(ratingData, userId, judgeId) {
    return new Promise(resolve => {
        let currentRating = 0;
        let finalRating = ratingData.judges[judgeId];
        const increment = finalRating / 100;
        const intervalId = setInterval(() => {
            if (currentRating < finalRating) {
                currentRating += increment;
                updateJudgeRatingDisplay(userId, judgeId, currentRating);
            } else {
                clearInterval(intervalId);
                updateJudgeRatingDisplay(userId, judgeId, finalRating);
                resolve();
            }
        }, 30);
    });
}

function generateZeroStars() {
    let starsHTML = '';
    for (let i = 0; i < 4; i++) {
        starsHTML += '<i class="far fa-star"></i>'; // Using 'far fa-star' for empty stars
    }
    return starsHTML;
}
// Function to replay the TTS
function replayTTS() {
    const tts = document.getElementById('tts');
    tts.currentTime = 0;  // Reset audio to start
    tts.play();
}
function togglePlayPause() {
    const tts = document.getElementById('tts');
    isTTSPaused = !isTTSPaused;
    
    // Swap the button icon between mute and unmute
    const buttonIcon = document.getElementById('toggleTTS').querySelector('i');
    if (isTTSPaused) {
        buttonIcon.classList.remove('fa-volume-up');
        buttonIcon.classList.add('fa-volume-mute');
    } else {
        buttonIcon.classList.remove('fa-volume-mute');
        buttonIcon.classList.add('fa-volume-up');
    }
     
    if (!tts.paused) {
        tts.pause();
    }
}
// Function to initialize AudioContext and connect nodes
function initializeAudioContext() {
  var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  var source = audioCtx.createMediaElementSource(document.getElementById('tts'));
  var gainNode = audioCtx.createGain();
  gainNode.gain.value = 4.5; // Set gain to 150%
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  audioContextInitialized = true;
}
// Function to toggle the overlay to hide the page.
// This is used to hide the page when the TTS is generating.
function toggleOverlay() {
    if ($('#overlay').is(':visible')) {
        $('#overlay').hide();
    } else {
        $('#overlay').show();
    }
}
function revealWinnerDiv() {
    var winnerDiv = document.getElementById('winner');
    winnerDiv.style.display = 'block';
    fire(0.25, {
        spread: 26,
        startVelocity: 55,
      });
      fire(0.2, {
        spread: 60,
      });
      fire(0.35, {
        spread: 100,
        decay: 0.91,
        scalar: 0.8
      });
      fire(0.1, {
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2
      });
      fire(0.1, {
        spread: 120,
        startVelocity: 45,
      });
}
function hideWinnerDiv() {
    var winnerDiv = document.getElementById('winner');
    winnerDiv.style.display = 'none';
}
var count = 200;
var defaults = {
  origin: { y: 0.7 }
};
function fire(particleRatio, opts) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio)
    });
  }