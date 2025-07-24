import * as utils from "./utils.js";
import { loadNewVideo } from "./videoPlayer.js";

const effects = [
  "slide",
  "clip",
  "fade",
  "blind",
  "explode",
  "puff",
  "fold",
  "scale",
  "drop",
  "bounce",
];
export const ratingState = {
  guestRatings: {},
  guestHasRated: false,
  vetoStatus: {},
  droppedLowestScore: false,
  chatScore: null,
  chatScoreAdded: false
};
let isBlurred = false;
let isFirstLoad = true;
let socket = null;
let isAnimating = false;

export function initializeDOMActions(social_scores,moderations,fakeUsernames,usedSocket) {
  socket = usedSocket;
  // If there are vip videos show the vip section
  if (document.querySelectorAll('.vip').length > 0) {
    document.getElementById('vipVideoHeader').classList.remove('d-none');
    document.getElementById('vipVideoHeader').classList.add('d-flex');
    document.getElementById('vip_youtube_videos').classList.remove('d-none');
    document.getElementById('vip_youtube_videos').classList.add('d-flex');
  }
  document.getElementById('add-chat-score').addEventListener('click', function() {
    if (ratingState.chatScore != null && !ratingState.chatScoreAdded) {
      // Add the chat score to the guestRatings
      ratingState.guestRatings['Chat'] = ratingState.chatScore;
      ratingState.chatScoreAdded = true;
      // Create the UI elements for the chat score
      addChatScoreUI(ratingState.chatScore);
      // Recalculate the average rating
      averageAllRatings();
    }
  });
  // Add event listener for the remove-youtube-btn class
  $(document).on("click", ".remove-youtube-btn", function () {
    const videoId = $(this).data("video-id");
    removeYoutube(videoId);
  });
  // Add event listener for the remove-youtube-btn class
  $(document).on("click", ".watch-youtube-btn", function () {
    const videoId = $(this).data("video-id");
    const videoLink = $(this).data("video-link");
    // Get the title from the card header
    const title = $(this).closest('.vid_card').find('.card-header').text().trim();
    // Remove any "gonged" classes on the page
    $('.gonged').removeClass('gonged');
    loadNewVideo(videoId, videoLink, socket, false, title);
    watchYoutube(videoId, videoLink);
  });
  $(document).on("click", "#reopen_vid", function () {
    $('#watchYoutubeModal').modal('show');
    socket.emit('reopen_vid', {});
  });
  // Modify the veto checkbox event listener
  $(document).on('change', '.veto-checkbox', function() {
    const guest_id = this.id.replace('veto-slider-', '');
    ratingState.vetoStatus[guest_id] = this.checked;
    averageAllRatings();
  });
  $(document).on('click', '#blind-ratings', function() {
    if ($('body').hasClass('blurred')) {
      // emit locked in
      socket.emit('blind_ratings', true);
      unblurRatings();
    } else {
      $('body').addClass('blurred');
      $('#rateModalLabel').text(`Rate this video for ${$('#fakeUsername').val()}`);
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
  // Loop over each card and add a fake username
  const cards = document.querySelectorAll('.vid_card');
  cards.forEach((card, index) => {
    $('.fake-username').eq(index).text(utils.getFakeUsername(fakeUsernames));
  });
 // Set up event handler for when the user clicks the "Submit" button
$(document).on("click", "#submitRating", function() {
  // Get the average rating
  var averageRating = $("#average-rating-number").text();
  console.log("averageRating", averageRating);

  // Round to 4 decimal places
  averageRating = parseFloat(averageRating).toFixed(4);
  console.log("averageRating", averageRating);

  var id = $("#rateModal").attr("data-id"); // Get the video ID value
  console.log("Retrieved data-id:", id);

  // Get the username
  var username = $("#username").val();
  console.log("username", username);

  // Prepare an array to hold each guest's rating
  var guestRatings = [];

  // Iterate over each guest rating div to extract names and ratings
  $(".guest-rating-div").each(function() {
    var guestName = $(this).find("h1[id^='rating-label']").text().replace("'s Rating:", "").trim();
    var rating = $(this).find(".guest-rating-value").text();
    rating = parseFloat(rating).toFixed(4);
    guestRatings.push({
      guestName: guestName,
      rating: rating
    });
  });

  console.log("Guest Ratings: ", guestRatings);

  if (averageRating >= 0 && id) {
    $("#rateModal").modal("hide");
    socket.emit(
      "rateUser",
      {
        username: username,
        rating: averageRating,
        videoId: id,
        guests: guestRatings
      },
      function(response) {
        console.log("rateUser response:", response);
        // Do something with the response from the server, if needed
      }
    );
    resetDroppedScore();
    resetDroppedLowestScore();
  }
  if (ratingState.chatScoreAdded) {
    // Remove the chat score
    delete ratingState.guestRatings['Chat'];
    ratingState.chatScoreAdded = false;
    // Remove the chat score UI
    const guestRatingDiv = document.getElementById('guest-rating-div-Chat');
    if (guestRatingDiv) {
      guestRatingDiv.remove();
    }
  }
});

  // Use mutation observer to watch for new elements
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes) {
        $(mutation.addedNodes).each(function() {
          if ($(this).hasClass('rating-section') && isBlurred) {
            $(this).addClass('blurred');
          }
        });
      }
    });
  });

observer.observe(document.body, {
  childList: true,
  subtree: true
});
  $(".shuffle").click(function () {
    $(this).tooltip('hide');
    shuffleCards();
    var autoAlert = $("#automated_alert");
    // Make sure it's hidden
    autoAlert.addClass('d-none');
  });
  $("#make_fair").click(function () {
    $(this).tooltip('hide');
    makeFair(social_scores);
  });
  $("#social_sort").click(function () {
    $(this).tooltip('hide');
    console.log(utils.getLeaderboardArray)
    socialSort(social_scores);
  });
  $("#time-sort").click(function () {
    $(this).tooltip('hide');
    sortCards();
  });
  $("#reopen_modal").click(function () {
    $(this).tooltip('hide');
    $("#rateModal").modal("show");
  });
  $("#unwatched-users").click(async function () {
    $(this).tooltip('hide');
    const url = 'https://youtube-queue.glitch.me/historical_youtube';
    const removedUsers = await fetchAndFilterUsernames(url);
    console.log(removedUsers);
    unwatchedUsers(removedUsers);
  });
  $("#replay_tts").click(function () {
    document.getElementById('tts').play();
  });
  $("#hide_auto_alert").click(function () {
    $(this).tooltip('hide');
    var autoAlert = $("#automated_alert");
    // Make sure it's hidden
    autoAlert.addClass('d-none');
  });
  utils.updateLeaderboard(social_scores);
  update_all_moderations(moderations);
  // Initialize the display
  updateStarsDisplay(0,document.getElementById('average-stars-display'));
  updateRatingNumber(0,'Average',document.getElementById('average-rating-number'));
}
export async function unblurRatings() {
  if (isAnimating) {
    // If the ratings are still animating, wait for the animation to finish before setting the flag
    setTimeout(() => unblurRatings(), 1000);
    return;
  }
  $('body').removeClass('blurred');
  const realUsername = $('#username').val();
  $('#rateModalLabel').text(`Rate this video for ${realUsername}`);
  // Remove the 'dropped-score' class from all guest rating divs
  const guestRatingDivs = document.querySelectorAll('.guest-rating-div');
  guestRatingDivs.forEach(div => div.classList.remove('dropped-score'));

  const averageRating = $('#average-rating-number').text();
  const guestRatings = {};
  $('.guest-rating-value').each(function() {
    const parentId = $(this).parent().attr('id');
    const guestName = parentId.replace('guest-rating-div-', '');
    const ratingValue = $(this).text();
    guestRatings[guestName] = parseFloat(ratingValue);
  });

  await animateRatings(averageRating, guestRatings);  
  applyDropLowestScore(guestRatings);
  averageAllRatings();
}
function applyDropLowestScore(guestRatings) {
  if (ratingState.dropLowestScore && Object.keys(guestRatings).length > 1) {
    // Remove the 'dropped-score' class from all guest rating divs
    const guestRatingDivs = document.querySelectorAll('.guest-rating-div');
    guestRatingDivs.forEach(div => div.classList.remove('dropped-score'));

    let lowestScore = Infinity;
    let lowestScoreGuest = null;
    
    for (const [guest, rating] of Object.entries(guestRatings)) {
      if (rating < lowestScore) {
        lowestScore = rating;
        lowestScoreGuest = guest;
      }
    }
   
    if (lowestScoreGuest) {
      const guestRatingDiv = document.getElementById(`guest-rating-div-${lowestScoreGuest}`);
      if (guestRatingDiv) {
        guestRatingDiv.classList.add('dropped-score');
      }
    }
  }
}
export function averageAllRatings() {
  console.log('averageAllRatings');
  let averageRating;
  let lowestRating = Infinity;
  let lowestRatingGuest = null;

  const allRatings = Object.entries(ratingState.guestRatings);
  if (allRatings.length > 0) {
    if (ratingState.dropLowestScore && allRatings.length > 1) {
      // Find the lowest rating
      allRatings.forEach(([guest, rating]) => {
        if (rating < lowestRating) {
          lowestRating = rating;
          lowestRatingGuest = guest;
        }
      });
      
      // Calculate average without the lowest rating
      const sum = allRatings.reduce((sum, [guest, rating]) => {
        return guest !== lowestRatingGuest ? sum + rating : sum;
      }, 0);
      averageRating = sum / (allRatings.length - 1);
      
      // Apply dramatic dropped score animation
      const droppedScoreElement = document.getElementById(`guest-rating-div-${lowestRatingGuest}`);
      if (droppedScoreElement) {
        droppedScoreElement.classList.add('dropped-score');

        // Shake other elements
        document.querySelectorAll('.guest-rating-div:not(.dropped-score)').forEach(el => {
          el.classList.add('shake');
          setTimeout(() => el.classList.remove('shake'), 1500);
        });

      }
    } else {
      const sum = allRatings.reduce((sum, [_, rating]) => sum + rating, 0);
      averageRating = sum / allRatings.length;
    }
  } else {
    averageRating = 0; // Set to 0 if there are no ratings
  }

  // Get the average rating display elements
  const averageStarsDisplay = document.getElementById('average-stars-display');
  const averageRatingNumber = document.getElementById('average-rating-number');

  // Update the average rating display
  updateStarsDisplay(averageRating, averageStarsDisplay);
  updateRatingNumber(averageRating, 'Average', averageRatingNumber);

  console.log('New average rating:', averageRating);
}
export function setDropLowestScoreFlag(value) {
  if (isAnimating) {
    // If the ratings are still animating, wait for the animation to finish before setting the flag
    setTimeout(() => setDropLowestScoreFlag(value), 1000);
    return;
  }
  // See if the we are unblurred
  if (!$('body').hasClass('blurred')){
    unblurRatings();
  }
  ratingState.dropLowestScore = value;
}
export function resetDroppedScore() {
  const droppedScoreElement = document.querySelector('.dropped-score');
  if (droppedScoreElement) {
    droppedScoreElement.classList.remove('dropped-score');
    droppedScoreElement.style.display = ''; // Reset display style
  }
  document.querySelectorAll('.guest-rating-div').forEach(el => {
    el.classList.remove('shake');
  });
}
export function resetDroppedLowestScore() {
  ratingState.dropLowestScore = false;
  removeDroppedScoreEffects();
  console.log('Dropped lowest score has been reset');
}
function removeDroppedScoreEffects() {
  const droppedScoreElement = document.querySelector('.dropped-score');
  if (droppedScoreElement) {
    droppedScoreElement.classList.remove('dropped-score');
  }
  document.querySelectorAll('.guest-rating-div').forEach(el => {
    el.classList.remove('shake');
  });
}
export function updateRatingNumber(value, user, displayElement) {
  console.log('updateRatingNumber',value, user, displayElement);
  let guest_id = user.replace(/[^a-zA-Z0-9]/g, '');
  const ratingDisplay = parseFloat(value).toFixed(4);
  if(user == 'Average') {    
    displayElement.textContent = `${ratingDisplay}`;
  } else {
    displayElement.textContent = `${user}'s Rating: `;
    $(`#guest-rating-value-${guest_id}`).text(ratingDisplay);
  }

}
export function updateStarsDisplay(value, displayElement) {
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

  displayElement.innerHTML = starsHTML;
}
export function unwatchedUsers(removedUsers = []) {
  console.log('shuffleCards');
  const countdown = document.getElementById(`countdown`);
  countdown.volume = 0.5;
  countdown.play();

  const container = document.querySelector("#youtube_videos");
  const cards = Array.from(container.querySelectorAll(".vid_card"));

  // Separate the cards into watched and unwatched based on the removedUsers array
  const watchedCards = cards.filter(card => removedUsers.includes(card.dataset.userid));
  const unwatchedCards = cards.filter(card => !removedUsers.includes(card.dataset.userid));
  // Shuffle both arrays
  shuffleArray(watchedCards);
  shuffleArray(unwatchedCards);

  // Concatenate the arrays
  const shuffledCards = [...unwatchedCards, ...watchedCards];

  shuffledCards.forEach(card => card.parentNode.removeChild(card));

  const numCards = shuffledCards.length;
  const totalTime = 25000;
  const delayIncrement = totalTime / numCards;
  const animationDuration = 5000;
  let cardsAnimated = 0;

  scrollPage(totalTime + 5000);

  shuffledCards.forEach((card, index) => {
    var effect = effects[Math.floor(Math.random() * effects.length)];
    $(card)
      .delay(delayIncrement * index)
      .hide(effect, {}, animationDuration, function () {
        container.appendChild(card);
        $(card).show(effect, {}, animationDuration, function () {
          cardsAnimated++;
          if (cardsAnimated === numCards) {
            enableClickHandlers();
            highlightFirstEightCards();
          }
        });
      });
    disableClickHandlers();
  });
}
function shuffleCards() {
  console.log('shuffleCards');
  // Play the countdown sound
  const countdownElements = document.querySelectorAll('.countdownSound');
  const randomElement = countdownElements[Math.floor(Math.random() * countdownElements.length)];
  const randomElementId = randomElement.id;

  socket.emit("countdown", randomElementId);
  const countdown = document.getElementById(randomElementId);
  countdown.volume = 0.75;
  countdown.play();

  // Get the countdown duration in milliseconds
  const countdownDuration = countdown.duration * 1000;
  const initialMoveDuration = 1000; // 1 second
  const settleDuration = 1000; // 1 second
  const chaoticDuration = countdownDuration - initialMoveDuration - settleDuration;
  const cardMoveDuration = 500; // Duration for each movement in milliseconds

  const container = document.querySelector("#youtube_videos");
  const cards = Array.from(container.querySelectorAll(".vid_card")).map(card => ({ card }));

  // Temporarily move cards to the body for animation
  cards.forEach(({ card }) => {
    document.body.appendChild(card);
  });

  // Get initial positions relative to the viewport
  const initialPositions = cards.map(({ card }) => {
    const rect = card.getBoundingClientRect();
    return {
      card: card,
      x: rect.left,
      y: rect.top
    };
  });

  // Set cards to position absolute and set their initial positions
  cards.forEach(({ card }, index) => {
    const pos = initialPositions[index];
    card.style.position = 'absolute';
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;
    card.style.zIndex = index; // Assign initial z-index
  });

  // Disable click handlers
  disableClickHandlers();

  // Move all cards to the center of the viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;

  // Animate cards to center
  cards.forEach(({ card }) => {
    card.style.transition = `left ${initialMoveDuration}ms ease, top ${initialMoveDuration}ms ease, transform ${initialMoveDuration}ms ease`;
    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    card.style.left = `${centerX - cardWidth / 2}px`;
    card.style.top = `${centerY - cardHeight / 2}px`;
    card.style.transform = 'rotate(0deg)';
  });

  // After moving to center, start the smooth chaotic animation
  setTimeout(() => {
    // Remove previous transitions
    cards.forEach(cardObj => {
      cardObj.card.style.transition = '';
    });

    // Initialize target positions and change times
    cards.forEach(cardObj => {
      cardObj.targetX = parseFloat(cardObj.card.style.left);
      cardObj.targetY = parseFloat(cardObj.card.style.top);
      cardObj.changeTime = Date.now() + getRandomInt(500, 1500); // Change target every 0.5 to 1.5 seconds
    });

    // Start chaotic animation
    const startTime = Date.now();

    function animateCards() {
      const elapsedTime = Date.now() - startTime;

      if (elapsedTime >= chaoticDuration) {
        settleCards();
        return;
      }

      cards.forEach(cardObj => {
        const { card } = cardObj;
        const currentTime = Date.now();

        // Check if it's time to assign a new target position
        if (currentTime >= cardObj.changeTime) {
          const cardWidth = card.offsetWidth;
          const cardHeight = card.offsetHeight;
          const { x, y } = getRandomPosition(cardWidth, cardHeight);

          cardObj.targetX = x;
          cardObj.targetY = y;
          cardObj.changeTime = currentTime + getRandomInt(500, 1500); // Next change in 0.5 to 1.5 seconds

          // Animate to new target position
          card.style.transition = `left ${cardMoveDuration}ms ease, top ${cardMoveDuration}ms ease, transform ${cardMoveDuration}ms ease`;
          card.style.left = `${x}px`;
          card.style.top = `${y}px`;

          // Optional: Random rotation
          const rotation = (Math.random() - 0.5) * 20; // Rotate between -10 and +10 degrees
          card.style.transform = `rotate(${rotation}deg)`;

          // Change z-index
          card.style.zIndex = Math.floor(Math.random() * cards.length);
        }
      });

      // Continue the animation loop
      requestAnimationFrame(animateCards);
    }

    requestAnimationFrame(animateCards);

  }, initialMoveDuration); // Wait for initial move to center to complete

  function settleCards() {
    // Shuffle the cards array
    shuffleArray(cards);

    // Calculate target positions based on shuffled order
    const targetPositions = cards.map(({ card }, index) => {
      const pos = initialPositions[index];
      return {
        card: card,
        x: pos.x,
        y: pos.y
      };
    });

    // Animate cards to new positions
    cards.forEach(({ card }, index) => {
      const targetPos = targetPositions[index];
      card.style.transition = `left ${settleDuration}ms ease, top ${settleDuration}ms ease, transform ${settleDuration}ms ease`;
      card.style.left = `${targetPos.x}px`;
      card.style.top = `${targetPos.y}px`;
      card.style.transform = 'rotate(0deg)'; // Reset rotation
      card.style.zIndex = index; // Reset z-index based on new order
    });

    // After settling, reset styles and re-enable interactions
    setTimeout(() => {
      // Remove inline styles
      cards.forEach(({ card }) => {
        card.style.position = '';
        card.style.left = '';
        card.style.top = '';
        card.style.transition = '';
        card.style.transform = '';
        card.style.zIndex = '';
      });

      // Append cards back to container in shuffled order
      cards.forEach(({ card }) => {
        container.appendChild(card);
      });

      // Re-enable click handlers
      enableClickHandlers();
      highlightFirstEightCards();
    }, settleDuration);
  }

  function getRandomPosition(cardWidth, cardHeight) {
    const maxX = window.innerWidth - cardWidth;
    const maxY = window.innerHeight - cardHeight;
    const x = Math.random() * maxX;
    const y = Math.random() * maxY;
    return { x, y };
  }

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  // Fisher-Yates Shuffle
  function shuffleArray(array) {
    for (let i = array.length -1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i +1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

export function sortCards() {
  console.log('sortCards');
  const countdown = document.getElementById(`countdown`);
  countdown.volume = 0.5;
  countdown.play();
  const container = document.querySelector("#youtube_videos");
  const cards = Array.from(container.querySelectorAll(".vid_card"));

  // Sort the cards based on the video duration
  cards.sort((a, b) => {
    const durationA = a.querySelector('.duration').textContent;
    const durationB = b.querySelector('.duration').textContent;

    const [minutesA, secondsA] = durationA.split(':').map(Number);
    const [minutesB, secondsB] = durationB.split(':').map(Number);

    // Convert the duration to seconds for comparison
    return (minutesA * 60 + secondsA) - (minutesB * 60 + secondsB);
  });

  const numCards = cards.length;
  const totalTime = 25000;
  const delayIncrement = totalTime / numCards;
  const animationDuration = 5000;
  let cardsAnimated = 0;
  scrollPage(totalTime+5000);

  // Loop through the shuffled array and append each card to the container element with animation
  cards.forEach((card, index) => {
    // randomly select a jquery ui effect
    var effect = effects[Math.floor(Math.random() * effects.length)];
    $(card)
      .delay(delayIncrement * index)
      .hide(effect, {}, animationDuration, function () {
        container.appendChild(card);
        $(card).show(effect, {}, animationDuration, function () {
          // Increment the counter when the animation completes
          cardsAnimated++;

          // If all the cards have finished animating, enable the click handlers
          if (cardsAnimated === numCards) {
            enableClickHandlers();
            highlightFirstEightCards();
          }
        });
      });
    // Disable the click handlers while the animations are running
    disableClickHandlers();
  });

  utils.countVideos();
}

export function makeFair(social_scores) {
  const countdown = document.getElementById(`countdown`);
  countdown.volume = 0.5;
  countdown.play();

  const container = document.querySelector("#youtube_videos");
  const cards = Array.from(container.querySelectorAll(".vid_card"));

  const shuffledCards = [];
  let lastUsername = [];
  const numRatings = new Map();
  Object.entries(social_scores).forEach(([user, ratings]) => {
    numRatings.set(user, ratings.length);
  });

  while (cards.length > 0) {
    const filteredCards = cards.filter((card) => {
      const usernameElement = card.querySelector(".username");
      return usernameElement && usernameElement.textContent !== lastUsername;
    });

    if (filteredCards.length === 0) {
      lastUsername = "";
      continue;
    }

    filteredCards.sort((a, b) => {
      const aUsername = a.querySelector(".username").textContent;
      const bUsername = b.querySelector(".username").textContent;
      const aNumRatings = numRatings.get(aUsername) || 0;
      const bNumRatings = numRatings.get(bUsername) || 0;
      return aNumRatings - bNumRatings;
    });

    const userWithFewestRatings =
      filteredCards[0].querySelector(".username").textContent;
    const cardsFromUser = filteredCards.filter((card) => {
      return (
        card.querySelector(".username").textContent === userWithFewestRatings
      );
    });
    const chosenCard =
      cardsFromUser[Math.floor(Math.random() * cardsFromUser.length)];

    const index = cards.indexOf(chosenCard);
    cards.splice(index, 1);

    shuffledCards.push(chosenCard);
    lastUsername = chosenCard.querySelector(".username").textContent;
    const user = lastUsername;
    const numRatingsForUser = numRatings.get(user) || 0;
    numRatings.set(user, numRatingsForUser + 1);
  }

  container.innerHTML = "";

  const numCards = shuffledCards.length;
  const totalTime = 25000;
  const delayIncrement = totalTime / numCards;
  const animationDuration = 5000;
  let cardsAnimated = 0;

  scrollPage(totalTime,.5);

  shuffledCards.forEach((card, index) => {
    // randomly select a jquery ui effect
    var effect = effects[Math.floor(Math.random() * effects.length)];
    $(card)
      .delay(delayIncrement * index)
      .hide(effect, {}, animationDuration, function () {
        container.appendChild(card);
        $(card).show(effect, {}, animationDuration, function () {
          cardsAnimated++;

          if (cardsAnimated === numCards) {
            enableClickHandlers();
            highlightFirstEightCards();
          }
        });
      });
    disableClickHandlers();
  });
}

export function socialSort(social_scores) {
  const countdown = document.getElementById(`countdown`);
  countdown.volume = 0.5;
  countdown.play();
  // Get a reference to the container element
  const container = document.querySelector("#youtube_videos");

  // Get an array of all the cards inside the container element
  const cards = Array.from(container.querySelectorAll(".vid_card"));

  // Create a map of users to their cards
  const userCardsMap = new Map();
  cards.forEach(card => {
    const user = card.querySelector(".username").textContent;
    // Remove existing ranking using a regular expression
    user = user.replace(/ \(#\d+\)$/, '');
    if (!userCardsMap.has(user)) {
      userCardsMap.set(user, []);
    }
    userCardsMap.get(user).push(card);
  });

  // Sort the users based on their average rating
  const sortedUsers = Array.from(userCardsMap.keys()).sort((user1, user2) => {
    const user1Rating = social_scores[user1] || [];
    const user2Rating = social_scores[user2] || [];

    const user1Average =
      user1Rating.reduce((sum, rating) => sum + parseFloat(rating), 0) /
      user1Rating.length;
    const user2Average =
      user2Rating.reduce((sum, rating) => sum + parseFloat(rating), 0) /
      user2Rating.length;

    if (isNaN(user1Average)) {
      return 1;
    }
    if (isNaN(user2Average)) {
      return -1;
    }
    return user2Average - user1Average;
  });

  // Create a new array for the sorted cards
  const sortedCards = [];

  // While there are still cards left
  while (sortedCards.length < cards.length) {
    // For each user in the sorted users array
    for (const user of sortedUsers) {
      // If the user has cards left
      if (userCardsMap.get(user).length > 0) {
        // Dequeue a card from the user's cards and append it to the sorted cards array
        sortedCards.push(userCardsMap.get(user).shift());
      }
    }
  }

  const numCards = cards.length;
  const totalTime = 25500; // 30 seconds in milliseconds
  const delayIncrement = totalTime / numCards;
  const animationDuration = 5000; // 2 seconds in milliseconds
  let cardsAnimated = 0; // Counter for the number of cards that have finished animating
  scrollPage(totalTime,.5);
  // Loop through the sorted array and append each card to the container element with animation
  sortedCards.forEach((card, index) => {
    // randomly select a jquery ui effect
    var effect = effects[Math.floor(Math.random() * effects.length)];
    $(card)
      .delay(delayIncrement * index)
      .hide(effect, {}, animationDuration, function () {
        container.appendChild(card);
        $(card).show(effect, {}, animationDuration, function () {
          // Increment the counter when the animation completes
          cardsAnimated++;

          // If all the cards have finished animating, enable the click handlers
          if (cardsAnimated === numCards) {
            enableClickHandlers();
            highlightFirstEightCards();
          }
        });
      });
  });
  // Disable the click handlers while the animations are running
  disableClickHandlers();
  utils.countVideos();
}
export function removeYoutube(id) {
  var row = document.getElementById("row_" + id);
  var thumbnail_url = row.getElementsByTagName("img")[0].src;
  $("#row_" + id).toggle("explode", function () {
    row.remove();
    socket.emit("youtube_deleted", id, (response) => {
      console.log(response);
    });
    utils.countVideos();
  });
  // if all the vip videos are removed, hide the vip section
  if (document.querySelectorAll('.vip').length == 0) {
    document.getElementById('vipVideoHeader').classList.remove('d-flex');
    document.getElementById('vipVideoHeader').classList.add('d-none');
    document.getElementById('vip_youtube_videos').classList.remove('d-flex');
    document.getElementById('vip_youtube_videos').classList.add('d-none');
  }
}
export function watchYoutube(id, link) {
  console.log("in watch youtube");
  var row = document.getElementById("row_" + id);
  $('body').addClass('blurred');
  // Show the rating modal dialog
  var rateModal = $("#rateModal");
  rateModal.attr("data-id", id); // Set the data-id attribute
  console.log("Set data-id to:", rateModal.data("id")); // Check if the data-id is set correctly
  console.log("id", id);
  rateModal.modal("show");

  // Extract the username from the row
  const username = $(row).find(".username").text().replace(/ \(#\d+\)| \p{Emoji}+/gu, '').trim();
  // Get the fake username from the row
  const fakeUsername = $(row).find(".fake-username").text();

  //const username = usernameClean.replace(/\(\)/g, '').trim();
  console.log(username);
  // Set the username in the modal dialog
  $("#rateModalLabel").text("Rate this video for " + fakeUsername);
  $("#realUsername").text(username);
  $("#username").val(username);
  $("#fakeUsername").val(fakeUsername);
  // Extract the video thumbnail URL
  const videoThumbnail = $(row).find('.card-img-top').attr('src');

  // Extract the video title
  const videoTitle = $(row).find('.card-header').text().trim();

  // Extract the video link from the 'Watch' button
  const videoLink = $(row).find('.watch-youtube-btn').data('video-link');

  // Now include these details in the socket.emit
  $("#row_" + id).toggle("explode", function () {
    row.remove();
    const timestamp = new Date().toISOString();
    socket.emit("youtube_watched", {
      id: id,
      username: username,
      fakeUsername: fakeUsername,
      timestamp: timestamp,
      videoThumbnail: videoThumbnail,
      videoTitle: videoTitle,
      videoLink: videoLink
    }, (response) => {
      console.log("youtube_watched_response", response);
      utils.updateWatchCount(response.watch_count);
      utils.updateTotalCount(response.total_watch_count);
    });
    //window.open(link, "_blank");
    utils.countVideos();
  });
  // If all the vip videos are removed, hide the vip section
  if (document.querySelectorAll('.vip').length == 0) {
    document.getElementById('vipVideoHeader').classList.remove('d-flex');
    document.getElementById('vipVideoHeader').classList.add('d-none');
    document.getElementById('vip_youtube_videos').classList.remove('d-flex');
    document.getElementById('vip_youtube_videos').classList.add('d-none');
  }
}



export function moderateYoutube(id, rating) {
  console.log("moderateYoutube emit ", id, rating);
  // Send the YouTube video's id and rating as data to the "youtube_moderated" socket event.
  socket.emit("youtube_moderated", { id: id, rating: rating }, (response) => {
    console.log(response);
  });
}
export function update_all_moderations(moderations) {
  // Get an array of keys from the moderations object
  var keys = Object.keys(moderations);

  // Loop through the keys
  for (var i = 0; i < keys.length; i++) {
    var id = keys[i];
    var rating = moderations[id];

    // Update the moderation for this YouTube video
    update_moderation(id, rating);
  }
}
function updateGuestRatings() {
  const updatedGuestRatings = {};
  $('.guest-rating-div').each(function() {
    const guestName = $(this).find('h1[id^="rating-label-"]').text().replace("'s Rating:", "").trim();
    const ratingValue = parseFloat($(this).find('.guest-rating-value').text());
    
    if (!isNaN(ratingValue)) {
      updatedGuestRatings[guestName] = ratingValue;
    }
  });
  return updatedGuestRatings;
}
export function update_moderation(id, rating) {
  // Retrieve the element with id = "row_" + id
  var row = document.getElementById("row_" + id);

  if (row) {
    // Retrieve the image inside this row
    var img = row.querySelector(".card-img-top");

    if (img) {
      var iconElement = document.createElement('i');

      // Check the rating
      if (rating == 1) {
        // Add thumbs up icon
        iconElement.className = "fas fa-thumbs-up moderation-icon";
      } else {
        // Add thumbs down icon
        iconElement.className = "fas fa-thumbs-down moderation-icon";
      }

      // Insert the icon before the image
      img.parentNode.insertBefore(iconElement, img);
    }
  }
}

export function deleteYoutube(id) {
  var row = document.getElementById("row_" + id);
  $("#row_" + id).toggle("explode", function () {
    row.remove();
  });
  utils.countVideos();
}

export function showAutoAlert(heading, headline, message) {
  var automated_alert = document.getElementById("automated_alert");
  if (!automated_alert) {
    // Handle the case where the element does not exist
    return;
  }

  const headingSpan = document.getElementById("alert_heading");
  // Check if the element exists before setting its textContent property
  if (headingSpan) {
    headingSpan.textContent = heading;
  }

  const headlineSpan = document.getElementById("alert_headline");
  // Check if the element exists before setting its textContent property
  if (headlineSpan) {
    headlineSpan.textContent = headline;
  }

  const messageSpan = document.getElementById("alert_message");
  // Check if the element exists before setting its textContent property
  if (messageSpan) {
    messageSpan.textContent = message;
  }

  // Remove the 'd-none' class to show the alert
  automated_alert.classList.remove('d-none');
}

export function showModal(
  username,
  fakeUsername,
  weightedRating,
  rank,
  prevWeightedRating,
  prevRank,
  rating,
  top10Changes
) {
  const ratingModal = document.getElementById("rating-modal");
  if (!ratingModal) {
    // Handle the case where the element does not exist
    return;
  }

  const usernameSpan = document
    .getElementById("rating-username")
    ?.querySelector("span");
  const weightedRatingSpan = document
    .getElementById("rating-weighted")
    ?.querySelector("span");
  const rankSpan = document.getElementById("rating-rank")?.querySelector("span");
  const ratingChangeSpan = document
    .getElementById("rating-change-rating")
    ?.querySelector("span");
  const rankChangeSpan = document
    .getElementById("rating-change-rank")
    ?.querySelector("span");
  const thisRatingSpans = document.querySelectorAll(".this-rating");
  const top10ChangesDiv = document.getElementById("rating-top10-changes");

  // Check if the elements exist before setting their textContent property
  if (usernameSpan) {
    usernameSpan.textContent = username;
  }
  if (weightedRatingSpan) {
    weightedRatingSpan.textContent = weightedRating.toFixed(4);
  }
  if (rankSpan) {
    rankSpan.textContent = rank;
  }
  thisRatingSpans.forEach(thisRatingSpan => {
    thisRatingSpan.textContent = rating;
  });
  // Calculate the rating change and display it in the modal dialog
  if (ratingChangeSpan) {
    const ratingChange = (weightedRating - prevWeightedRating).toFixed(4);
    const ratingChangeText =
      ratingChange > 0 ? `(+${ratingChange})` : `(${ratingChange})`;
    ratingChangeSpan.textContent = ratingChangeText;
  }

  if (rankChangeSpan) {
    // Convert prevRank to a number if it's an array
    const previousRank = Array.isArray(prevRank) ? prevRank[prevRank.length - 1] : prevRank;
    console.log('previousRank', previousRank);
    console.log('currentRank', rank);
    let rankChangeText;
    if (previousRank && rank) {
      // Calculate the rank change when there is a previous rank and a new rank
      const rankChange = previousRank - rank;
      console.log('rankChange', rankChange);
      rankChangeText = rankChange > 0 ? `(+${rankChange})` : `(-${Math.abs(rankChange)})`;
    } else if (!previousRank && rank) {
      // The user didn't have a rank before, so the entire rank is their gain
      rankChangeText = `(New rank: +${rank})`;
    } else {
      // In other cases, there is no change in rank
      rankChangeText = "(No change)";
    }
    rankChangeSpan.textContent = rankChangeText;
  }
    
// Clear previous top10 changes if any
if (top10ChangesDiv) {
  top10ChangesDiv.innerHTML = "";
}
const titleMap = {
  added: 'Users Added to top 10:',
  dropped: 'Users Dropped from top 10:',
  changed: 'Users Changed in top 10:'
};
// Check if there are any changes in the top 10 rankings
const hasChanges = Object.values(top10Changes).some(array => array.length > 0);

// Create and append elements dynamically based on top10Changes
if (hasChanges && top10ChangesDiv) {
  for (const [changeType, users] of Object.entries(top10Changes)) {
    if (users.length === 0) continue;  // Skip if no users for this change type

    const rowDiv = document.createElement("div");
    rowDiv.className = "row";

    const colTitleDiv = document.createElement("div");
    colTitleDiv.className = "col-md-6";
    const changeTitle = document.createElement("p");
    changeTitle.textContent = titleMap[changeType];  // Use the mapping object to set text content
    colTitleDiv.appendChild(changeTitle);

    const colListDiv = document.createElement("div");
    colListDiv.className = "col-md-6";
    const usersParagraph = document.createElement("p");  // Create a <p> element
    usersParagraph.className = `top10-${changeType}`;
    usersParagraph.textContent = users.join(', ');  // Join the array of users into a single string
    colListDiv.appendChild(usersParagraph);  // Append the <p> element

    rowDiv.appendChild(colTitleDiv);
    rowDiv.appendChild(colListDiv);

    top10ChangesDiv.appendChild(rowDiv);
  }
}
  ratingModal.style.display = "block";
  setTimeout(() => {
    ratingModal.style.display = "none";
  }, 10000); // Hide the modal after 10 seconds
}



function disableClickHandlers() {
  isAnimating = true; 
  $("#shuffle").prop("disabled", true);
  $("#make_fair").prop("disabled", true);
  $("#social_sort").prop("disabled", true);
  $("#time-sort").prop("disabled", true);
}

function enableClickHandlers() {
  isAnimating = false;
  $("#shuffle").prop("disabled", false);
  $("#make_fair").prop("disabled", false);
  $("#social_sort").prop("disabled", false);
  $("#time-sort").prop("disabled", false);
}

export function scrollPage(duration) {
  const startTime = Date.now();
  const interval = setInterval(() => {
    // Scroll to the bottom of the page
    window.scrollTo(0, document.body.scrollHeight);
    
    // Check if the duration has elapsed
    if (Date.now() - startTime >= duration) {
      clearInterval(interval);
      // Scroll back to the top of the page
      window.scrollTo(0, 0);
    }
  }, 300);  // Interval of 300 milliseconds
}

function secureRandom() {
  const array = new Uint32Array(1);
  window.crypto.getRandomValues(array);
  return array[0] / (0xFFFFFFFF + 1);
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(secureRandom() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}


// Function to calculate the time difference in hours
const timeDifferenceInHours = (date1, date2) => {
  const diffInMilliseconds = Math.abs(date1 - date2);
  return diffInMilliseconds / (1000 * 60 * 60);
};

// Main function to fetch JSON and filter usernames
const fetchAndFilterUsernames = async (url) => {
  try {
    const response = await fetch(url);
    const jsonData = await response.json();

    const currentTime = new Date();
    let usernames = [];

    for (const videoId in jsonData) {
      const entries = jsonData[videoId];
      entries.forEach(entry => {
        // Skip if the entry is null
        if (entry === null) return;

        // Proceed if the entry has a timestamp and username
        if (entry.timestamp && entry.username) {
          const entryTime = new Date(entry.timestamp);
          if (timeDifferenceInHours(currentTime, entryTime) <= 8) {
            usernames.push(entry.username);
          }
        }
      });
    }

    return usernames;
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return [];
  }
};
function highlightFirstEightCards() {
  // Select all cards
  const cards = document.querySelectorAll('.card.h-100');

  // Iterate over the cards
  cards.forEach((card, index) => {
    if (index < 8) {
      // If the card is one of the first 8, add the 'highlight' class
      card.classList.add('highlight');
    } else {
      // If the card is not one of the first 8, remove the 'highlight' class
      card.classList.remove('highlight');
    }
  });
}
export function deleteGuestRating(username) {
  console.log('deleteGuestRating', username);
  
  // Check if username is undefined or null
  if (username == null) {
    console.error('deleteGuestRating called with null or undefined username');
    return;
  }

  // Convert username to string if it's not already
  const usernameStr = String(username.user);
  let guest_id = usernameStr.replace(/[^a-zA-Z0-9]/g, '');

  // Remove the guest rating div and all its children
  const guestRatingDiv = document.getElementById(`guest-rating-div-${guest_id}`);
  if (guestRatingDiv) {
    guestRatingDiv.remove();
  } else {
    console.warn(`No rating div found for guest: ${usernameStr}`);
  }

  // Remove the guest from the ratingState object
  if (guest_id in ratingState.guestRatings) {
    delete ratingState.guestRatings[guest_id];
  } else {
    console.warn(`No rating found for guest: ${usernameStr}`);
  }

  // Remove the guest's veto status if it exists
  if (guest_id in ratingState.vetoStatus) {
    delete ratingState.vetoStatus[guest_id];
  }

  // Recalculate and update the average rating
  averageAllRatings();

  console.log('Updated ratingState after deletion:', ratingState);
}
async function animateRatings(averageRating, guestRatings) {
  if (isAnimating) {
    // If the ratings are still animating, wait for the animation to finish before setting the flag
    setTimeout(() => setDropLowestScoreFlag(value), 1000);
    return;
  }
  isAnimating = true;
  // Reset all stars to 0
  resetRatingsDisplayToZero();
  console.log('animateRatings')
  return new Promise(async resolve => {
      // See how many guests there are
      const numGuests = Object.keys(guestRatings).length;
      if(numGuests > 1) {
        // Animate guest ratings sequentially guestRatings[guestName] = ratingValue
        for (let guest of Object.keys(guestRatings)) {
          await animateGuestRating(guestRatings[guest], guest);
        }
        // Animate average rating
        await animateAverageRating(averageRating);
      } else {
        for (let guest of Object.keys(guestRatings)) {
          animateGuestRating(guestRatings[guest], guest);
        }
        await animateAverageRating(averageRating);
      }
      isAnimating = false;
      resolve();
  });
}
function resetRatingsDisplayToZero() {
    // Set average rating display to 0
    $(`#average-rating-number`).html(0.0000.toFixed(4));
    $(`#average-stars-display`).html(generateZeroStars());

    // Set all judge ratings to 0
    let judgeRatings = $(`#guest-ratings`);
    judgeRatings.each(function() {
        $(this).find('.guest-rating-value').html(0.0000.toFixed(4));
        $(this).find('.stars-display').html(generateZeroStars());
    });
}

function generateZeroStars() {
  let starsHTML = '';
  for (let i = 0; i < 4; i++) {
      starsHTML += '<i class="far fa-star"></i>'; // Using 'far fa-star' for empty stars
  }
  return starsHTML;
}
// domActions.js
function addChatScoreUI(chatScore) {
  let guest_id = 'Chat';
  const guestRatingDiv = document.createElement('div');
  guestRatingDiv.id = `guest-rating-div-${guest_id}`;
  guestRatingDiv.classList.add('guest-rating-div');

  const label = document.createElement('h1');
  label.id = `rating-label-${guest_id}`;
  label.textContent = `${guest_id}'s Rating:`;

  const ratingValue = document.createElement('h1');
  ratingValue.id = `guest-rating-value-${guest_id}`;
  ratingValue.classList.add('guest-rating-value');
  ratingValue.textContent = parseFloat(chatScore).toFixed(4);

  const starsDisplay = document.createElement('div');
  starsDisplay.id = `stars-display-${guest_id}`;
  starsDisplay.classList.add('stars-display');

  // Update the stars display
  updateStarsDisplay(chatScore, starsDisplay);
  // Update the rating number
  updateRatingNumber(chatScore, guest_id, label);

  // Append the elements
  guestRatingDiv.appendChild(starsDisplay);
  guestRatingDiv.appendChild(label);
  guestRatingDiv.appendChild(ratingValue);

  const guestRatingSection = document.getElementById('guest-ratings');
  guestRatingSection.appendChild(guestRatingDiv);
}
function animateAverageRating(rating) {
  console.log('animateAverageRating', rating);
  return new Promise(resolve => {
      const averageStarsDisplay = document.getElementById('average-stars-display');
      const averageRatingNumber = document.getElementById('average-rating-number');

      let currentRating = 0;
      // Ensure the rating does not exceed 4 and is treated as a float
      let finalRating = Math.min(parseFloat(rating), 4).toFixed(4);
      const increment = finalRating / 100;
      const intervalId = setInterval(() => {
          if (currentRating < finalRating) {
              currentRating += increment;
              // Ensure currentRating does not exceed finalRating
              if (currentRating > finalRating) {
                  currentRating = finalRating;
              }
              updateStarsDisplay(currentRating, averageStarsDisplay);
              updateRatingNumber(currentRating, 'Average', averageRatingNumber);
          } else {
              clearInterval(intervalId);
              // Directly set to finalRating to ensure precision
              currentRating = finalRating;
              updateStarsDisplay(currentRating, averageStarsDisplay);
              updateRatingNumber(currentRating, 'Average', averageRatingNumber);
              resolve();
          }
      }, 30);
  });
}

function animateGuestRating(rating, guest) {
  return new Promise(resolve => {
      console.log(rating, guest);
      let currentRating = 0;
      let finalRating = parseFloat(rating).toFixed(4);
      const increment = finalRating / 100;
      /* make rating id html friendly */
      let guest_id = guest.replace(/[^a-zA-Z0-9]/g, '');
      const label = document.getElementById(`rating-label-${guest_id}`);
      const starsDisplay = document.getElementById(`stars-display-${guest_id}`);

      const intervalId = setInterval(() => {
          if (currentRating < finalRating) {
              currentRating += increment;
              // Update the rating number
              updateRatingNumber(currentRating, guest, label);
              // Update the stars display
              updateStarsDisplay(currentRating, starsDisplay);
          } else {
              clearInterval(intervalId);
              currentRating = finalRating;
              // Update the rating number
              updateRatingNumber(currentRating, guest, label);
              // Update the stars display
              updateStarsDisplay(currentRating, starsDisplay);

              resolve();
          }
      }, 30);
  });
}