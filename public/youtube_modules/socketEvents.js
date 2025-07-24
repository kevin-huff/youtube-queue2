import * as domActions from "./domActions.js";
import * as utils from "./utils.js";
import { ratingState } from './domActions.js';

const slider1 = document.getElementById('rating-slider');
const slider2 = document.getElementById('rating-slider-2');
const slider1ValueDisplay = document.getElementById('slider1-value');
const slider2ValueDisplay = document.getElementById('slider2-value');
const vetoSlider1 = document.getElementById('veto-slider1');
const vetoSlider2 = document.getElementById('veto-slider2');
const starsDisplay = document.getElementById('stars-display');
const ratingNumber = document.getElementById('star-rating-number');

export function initializeSocketEvents(socket) {
  socket.on("youtube_added", function (youtube) {
    console.log("youtube_added");
    utils.addYoutube(youtube);
    utils.countVideos();
  });
  socket.on("youtube_remove", function (id) {
    console.log("youtube_deleted");
    domActions.deleteYoutube(id);
  });
  socket.on("update_youtube_moderated", function (arg) {
    let id = arg.id;
    let rating = arg.rating;
    console.log("update_youtube_moderated");
    console.log('arg', arg);
    domActions.update_moderation(id, rating);
  });
  socket.on('dropLowestScore', () => {
    console.log('Received dropLowestScore event');
    domActions.setDropLowestScoreFlag(true);
    console.log('Drop lowest score flag set to true');
  });
  socket.on("boo_threshold", function (boo_threshold) {
    console.log("boo_threshold met");
    const boo_sound = document.getElementById(`boo`);
    boo_sound.volume = 0.5;
    boo_sound.play();
  });
  socket.on("gong_play_sound", function () {
    const gong_sound = document.getElementById(`gong`);
    gong_sound.volume = 0.5;
    gong_sound.play();
  });

  socket.on("gong_add_alert", function (userstate,message) {
    console.log("gong_add_alert",userstate);
    console.log('userstate.display_name', userstate['display-name']);
    let heading = "A Gong has been played!";
    let headline = `${userstate['display-name']} has played a gong!`;
    // Show the modal with the user's information
    domActions.showAutoAlert(heading, headline, message);
   
    var rateModal = document.querySelector('#rateModal .modal-body');
    rateModal.classList.toggle('gonged');
    const realUsername = $('#username').val();
    console.log('realUsername', realUsername);
    // update rateModalLabel to show real username
    $('#rateModalLabel').text(`${realUsername}'s Video Got GONGED!`);
  });
  socket.on("play_tts", function () {
    console.log("tts played");
    const tts_sound = document.getElementById(`tts`);
    tts_sound.src = "/tts?" + new Date().getTime();
    tts_sound.load();
  });
  socket.on("pause_tts", function () {
    console.log("tts paused");
    const tts_sound = document.getElementById(`tts`);
    tts_sound.pause();
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
  // Update guest ratings
  socket.on('guest_rates', (guestRatingObj) => {
    console.log('Received guest rating:', `${guestRatingObj.user}: ${guestRatingObj.rating}`);
    let guest_id = guestRatingObj.user.replace(/[^a-zA-Z0-9]/g, '');
    // Check if the slider for this user already exists
    const existingSlider = document.getElementById(`rating-slider-${guest_id}`);
    if (existingSlider) {
      // If the slider exists, update its value and the rating in ratingState.guestRatings
      existingSlider.value = parseFloat(guestRatingObj.rating).toFixed(4);
      ratingState.guestRatings[guest_id] = parseFloat(guestRatingObj.rating);
      // Update the stars display
      const starsDisplay = document.getElementById(`stars-display-${guest_id}`);
      domActions.updateStarsDisplay(existingSlider.value, starsDisplay);
      // Update the rating number
      const label = document.getElementById(`rating-label-${guest_id}`);
      domActions.updateRatingNumber(existingSlider.value, guestRatingObj.user, label);

    } else {
      const guestRatingDiv = document.createElement('div');
      guestRatingDiv.id = `guest-rating-div-${guest_id}`;
      guestRatingDiv.classList.add('guest-rating-div');
      // If the slider doesn't exist, create a new slider and its associated elements for the new guest rating
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '4';
      slider.step = '0.0001';
      slider.value = parseFloat(guestRatingObj.rating).toFixed(4);
      slider.id = `rating-slider-${guest_id}`;
      slider.classList.add('rating-slider');

      const label = document.createElement('h1');
      label.id = `rating-label-${guest_id}`;
      label.textContent = `${guestRatingObj.user}'s Rating:`;
      
      const ratingValue = document.createElement('h1');
      ratingValue.id = `guest-rating-value-${guest_id}`;
      ratingValue.classList.add('guest-rating-value');
      ratingValue.textContent = parseFloat(guestRatingObj.rating).toFixed(4);

      const starsDisplay = document.createElement('div');
      starsDisplay.id = `stars-display-${guest_id}`;
      starsDisplay.classList.add('stars-display');

      const vetoCheckbox = document.createElement('input');
      vetoCheckbox.type = 'checkbox';
      vetoCheckbox.id = `veto-slider-${guest_id}`;
      vetoCheckbox.classList.add('veto-checkbox');
      const vetoLabel = document.createElement('label');
      vetoLabel.textContent = ` ${guestRatingObj.user} Veto`;   
      vetoLabel.htmlFor = `veto-slider-${guest_id}`;   
      vetoLabel.insertBefore(vetoCheckbox, vetoLabel.firstChild);

      // Add the new elements to the DOM
      const guestRatingSection = document.getElementById('guest-ratings');      
      guestRatingDiv.appendChild(starsDisplay);
      guestRatingDiv.appendChild(slider);
      guestRatingDiv.appendChild(label);
      guestRatingDiv.appendChild(ratingValue);
      guestRatingDiv.appendChild(vetoLabel);
      guestRatingSection.appendChild(guestRatingDiv);
      // Update the stars display
      domActions.updateStarsDisplay(slider.value, starsDisplay);
      domActions.updateRatingNumber(slider.value, guestRatingObj.user, label);
      // Store the new guest rating
      ratingState.guestRatings[guest_id] = parseFloat(guestRatingObj.rating);
    }
    // Add an event listener for the veto checkbox
    const vetoCheckbox = document.getElementById(`veto-slider-${guest_id}`);
    if (vetoCheckbox) {
      vetoCheckbox.addEventListener('change', () => {
        ratingState.vetoStatus[guest_id] = vetoCheckbox.checked;
        domActions.averageAllRatings();
      });
    }
    // Update the average rating
    domActions.averageAllRatings();
  });
// Setup the update_name event listener
socket.on('update_name', (nameObj) => {
  const oldName = nameObj.lastUsernameUsed;
  const newName = nameObj.user;
  let old_guest_id = oldName.replace(/[^a-zA-Z0-9]/g, '');
  let new_guest_id = newName.replace(/[^a-zA-Z0-9]/g, '');
  console.log('update_name', oldName, newName);

  // See if we have a guest rating slider for the old name
  const oldSlider = document.getElementById(`rating-slider-${old_guest_id}`);
  if (oldSlider) {
    // If we have a slider for the old name, update its id and label
    oldSlider.id = `rating-slider-${new_guest_id}`;
    const oldLabel = document.getElementById(`rating-label-${old_guest_id}`);
    oldLabel.id = `rating-label-${new_guest_id}`;
    oldLabel.textContent = `${newName}'s Rating: ${oldSlider.value}`;
    oldSlider.closest('.guest-rating-div').id = `guest-rating-div-${new_guest_id}`;

    // Update the stars display
    const starsDisplay = document.getElementById(`stars-display-${old_guest_id}`);
    starsDisplay.id = `stars-display-${new_guest_id}`;
    domActions.updateStarsDisplay(oldSlider.value, starsDisplay);

    // Update the guest-rating-value- id
    const ratingValue = document.getElementById(`guest-rating-value-${old_guest_id}`);
    ratingValue.id = `guest-rating-value-${new_guest_id}`;

    // Delete the veto checkbox and label
    const vetoCheckbox = document.getElementById(`veto-slider-${old_guest_id}`);
    const vetoLabel = document.querySelector(`label[for="veto-slider-${old_guest_id}"]`);
    if (vetoCheckbox) vetoCheckbox.remove();
    if (vetoLabel) vetoLabel.remove();

    // Recreate the veto checkbox and label with the new name
    const newVetoCheckbox = document.createElement('input');
    newVetoCheckbox.type = 'checkbox';
    newVetoCheckbox.id = `veto-slider-${new_guest_id}`;
    newVetoCheckbox.classList.add('veto-checkbox');
    const newVetoLabel = document.createElement('label');
    newVetoLabel.htmlFor = `veto-slider-${new_guest_id}`;
    newVetoLabel.appendChild(document.createTextNode(`${newName} Veto`));
    newVetoLabel.insertBefore(newVetoCheckbox, newVetoLabel.firstChild);

    // Identify or create a container for the guest rating, including veto checkbox and label
    let guestRatingDiv = document.getElementById(`guest-rating-div-${new_guest_id}`);
    if (!guestRatingDiv) {
      guestRatingDiv = document.createElement('div');
      guestRatingDiv.id = `guest-rating-div-${new_guest_id}`;
      guestRatingDiv.classList.add('guest-rating-div');
      document.getElementById('guest-ratings').appendChild(guestRatingDiv);
    }

    // Append the new veto checkbox and label to the newly identified or created container
    guestRatingDiv.appendChild(newVetoCheckbox);
    guestRatingDiv.appendChild(newVetoLabel);

    // Add an event listener for the veto checkbox
    newVetoCheckbox.addEventListener('change', () => {
      if (newVetoCheckbox.checked) {
        // If this checkbox is checked, uncheck all other checkboxes
        const allVetoCheckboxes = document.querySelectorAll('.veto-checkbox');
        allVetoCheckboxes.forEach(checkbox => {
          if (checkbox !== newVetoCheckbox) {
            checkbox.checked = false;
          }
        });

        // Update the veto status
        ratingState.vetoStatus = {}; // Reset all veto statuses
        ratingState.vetoStatus[new_guest_id] = true; // Set the veto status for this user
      } else {
        // If this checkbox is unchecked, remove the veto status for this user
        delete ratingState.vetoStatus[new_guest_id];
      }

      domActions.averageAllRatings();
    });

    // Update the ratingState
    ratingState.guestRatings[new_guest_id] = ratingState.guestRatings[old_guest_id];
    delete ratingState.guestRatings[old_guest_id];
  }
});
socket.on('chatScore', (chatScore) => {
  console.log('Received chatScore:', chatScore);
  ratingState.chatScore = chatScore;
  if (ratingState.chatScoreAdded) {
    // Update the guestRatings
    ratingState.guestRatings['Chat'] = chatScore;
    // Update the UI
    let guest_id = 'Chat';
    const label = document.getElementById(`rating-label-${guest_id}`);
    const starsDisplay = document.getElementById(`stars-display-${guest_id}`);
    const ratingValue = document.getElementById(`guest-rating-value-${guest_id}`);
    if (label && starsDisplay && ratingValue) {
      ratingValue.textContent = parseFloat(chatScore).toFixed(4);
      updateStarsDisplay(chatScore, starsDisplay);
      updateRatingNumber(chatScore, guest_id, label);
    }
    // Recalculate the average rating
    averageAllRatings();
  }
});
socket.on("sign_off", function (username) {
  console.log("sign_off", username);
  if (username != null) {
    domActions.deleteGuestRating(username);
  } else {
    console.error("sign_off event received with null or undefined username");
  }
});
  socket.on("newRating", (username, rating, updated_leaderboard) => {
      console.log('updated_leaderboard', updated_leaderboard);
      let roundedRating = parseFloat(rating).toFixed(4);
      // Get the existing leaderboard array
      const oldLeaderboardArray = utils.getLeaderboardArray();
      console.log('oldLeaderboardArray', oldLeaderboardArray);

      // Get the previous weighted rating and rank for the user, or set them to null if the user has no previous rating
      let previousRank = null;
      let previousWeightedRating = null;
      const userEntry = oldLeaderboardArray.find((entry) => entry.user === username);
      console.log('olderUserEntry', userEntry);
      if (userEntry) {
        previousRank = oldLeaderboardArray.findIndex((entry) => entry.user === username) + 1;
        previousWeightedRating = userEntry.weightedRating;
      } else {
        previousWeightedRating = null;
      }    
      const newUserEntry = updated_leaderboard.find((entry) => entry.user === username);
      console.log('newUserEntry', newUserEntry);

      // Calculate the user's current rank and weighted rating
      const currentLeaderboardArray = updated_leaderboard;
      const currentRank = currentLeaderboardArray.findIndex((entry) => entry.user === username) + 1;
      const currentWeightedRating = currentLeaderboardArray.find((entry) => entry.user === username).weightedRating;
      let modal_object = {
        "username": username,
        "fakeUsername": fakeUsername,
        "currentWeightedRating": currentWeightedRating,
        "currentRank": currentRank,
        "previousWeightedRating": previousWeightedRating,
        "previousRank": previousRank,
        "rating": roundedRating,
      }
      //Track 
      const getTop10 = (leaderboard) => {
        return leaderboard.slice(0, 10).map(entry => entry.user);
      };
    
      const oldTop10 = getTop10(oldLeaderboardArray);
      const newTop10 = getTop10(currentLeaderboardArray);
    
      const addedUsers = newTop10.filter(user => !oldTop10.includes(user));
      const droppedUsers = oldTop10.filter(user => !newTop10.includes(user));
      const changedUsers = newTop10.filter(user => oldTop10.includes(user) && oldTop10.indexOf(user) !== newTop10.indexOf(user));
    
      modal_object.top10Changes = {
        added: addedUsers,
        dropped: droppedUsers,
        changed: changedUsers
      };
      console.log('modal_object', modal_object);
      // Call the updateLeaderboard function to refresh the leaderboard
      utils.updateLeaderboard(updated_leaderboard);
      // Show the modal with the user's information
      domActions.showModal(username, fakeUsername, currentWeightedRating, currentRank, previousWeightedRating, previousRank, rating, modal_object.top10Changes);
  });
  socket.on("forced_shuffle", function (userstate, message="A SHUFFLE HAS BEEN FORCED!") {
    console.log("forced_shuffle recieved", userstate);
    console.log('userstate.display_name', userstate['display-name']);
    let heading = "A SHUFFLE HAS BEEN FORCED!";
    let headline = `${userstate['display-name']} has forced to shuffle.`;
    // Show the modal with the user's information
    domActions.showAutoAlert(heading, headline, message);
    const forced_shuffle_sound = document.getElementById(`forced_shuffle`);
    forced_shuffle_sound.volume = 0.5;
    forced_shuffle_sound.play();
  });
  socket.on("playerAction", function (action) {
    console.log("playerAction", action);
    if(action.action === "closeModal") {
      console.log("player modal closed");
      // Make sure the card still exists before marking it as watched (incase the video has been reopened.)
      if (document.getElementById(`row_${action.videoId}`)) {
        // This was causing videos to be recorded as watched multiple times.
        //domActions.watchYoutube(action.videoId, action.videoLink)
      }
    }
  });
  function getTop10(leaderboard) {
    return leaderboard.slice(0, 10).map(entry => entry.user);
  }
}
