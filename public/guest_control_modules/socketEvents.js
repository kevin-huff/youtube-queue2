import * as domActions from "./domActions.js";

export function initializeSocketEvents(socket) {
    socket.on('open_guest_rating', (data) => {
        console.log('guest_rating', data);
        $('#rateModal').modal('show');
    });
    socket.on('reopen_vid', (data) => {
        console.log('reopen_vid', data);
        $('#watchYoutubeModal').modal('show');
    });
    socket.on('final_judgement', (data) => {
        console.log('final_judgement', data);
        // Hide rateModal
        $('#rateModal').modal('hide');
        // Reset guestRating-slider, guestRating-text and guestRating-value
        $('#guestRating-slider').val(0);
        $('#guestRating-text').val(0);
        $('#guestRating-value').text('0');
        // Reset ratings to 0 (on server side)
        const guestRatingSlider = document.getElementById('guestRating-slider');
        const guestRatingText = document.getElementById('guestRating-text');
        domActions.updateRating(guestRatingSlider, guestRatingText);
    });
    socket.on("play_tts", function () {
        console.log("tts played");
        const tts_sound = document.getElementById(`tts`);
        tts_sound.src = "/tts?" + new Date().getTime();
        tts_sound.load();
      });
    
      socket.on("play_veto", function () {
        console.log("vetoed played");
        const veto_sound = document.getElementById(`veto`);
        veto_sound.volume = 0.5;
        veto_sound.play();
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
              selectedFartSound.volume = 0.5;
              selectedFartSound.play();
          } else {
              console.log("No fart sounds found");
          }
      });
      socket.on("play_lockedin", function () {
        console.log("lockedin");
        const lockedin_sound = document.getElementById(`lockedin`);
        lockedin_sound.volume = 0.5;
        lockedin_sound.play();    
      });
        socket.on("gong_play_sound", function () {
            console.log("gong played");
            const gong_sound = document.getElementById(`gong`);
            gong_sound.volume = 0.5;
            gong_sound.play();
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
    socket.on("pause_tts", function () {
        console.log("tts paused");
        const tts_sound = document.getElementById(`tts`);
        tts_sound.pause();
    });
    socket.on("countdown", function (data) {
        console.log('countdown', data);
        const countdown = document.getElementById(data);
        countdown.volume = 0.5;
        countdown.play();
    });
}