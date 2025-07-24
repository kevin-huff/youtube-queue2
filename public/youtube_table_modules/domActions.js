import * as utils from "./utils.js";
import { socket } from "./socketEvents.js";

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
const slider = document.getElementById('rating-slider');
const starsDisplay = document.getElementById('stars-display');
const ratingNumber = document.getElementById('star-rating-number');
export function initializeDOMActions(social_scores,moderations) {
  var row;
  // Set up event handler for when the user clicks a star
  $(document).on("click", ".rating-button", function () {
    console.log("star click");
    var rating = $(this).data("value");
    var videoId = $(this).data("id");
    var rating = $("input[name='rating']:checked").val();
    $("#video-id").val(videoId); // set the value of the hidden input field to the video ID
    console.log("rating set", rating);
    $(".star").removeClass("selected");
    $(this).addClass("selected");
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
    watchYoutube(videoId, videoLink);
  });
  // Set up event handler for when the user clicks the "Submit" button
  $(document).on("click", "#submitRating", function () {
    var rating = $("#rating-slider").val();
    var id = $("#rateModal").data("id"); // Get the id value
    console.log("id", id);
    if (rating >= 0 && id) {
      var username = $("#username").val();
      console.log("username", username);
      username = username.replace(/ \(#\d+\)$/, '');
      console.log("username", username);
      console.log("rating", rating);
      $("#rateModal").modal("hide");
      socket.emit(
        "rateUser",
        {
          username: username,
          rating: rating,
        },
        function (response) {
          console.log("rateUser response:", response);
          // Do something with the response from the server, if needed
        }
      );
    }
  });
  $("#shuffle").click(function () {
    $(this).tooltip('hide');
    shuffleCards();
  });
  $("#make_fair").click(function () {
    $(this).tooltip('hide');
    makeFair(social_scores);
  });
  $("#social_sort").click(function () {
    $(this).tooltip('hide');
    socialSort(social_scores);
  });
  $("#time-sort").click(function () {
    $(this).tooltip('hide');
    sortCards();
  });
  $("#unwatched-users").click(async function () {
    $(this).tooltip('hide');
    const url = 'https://youtube-queue.glitch.me/historical_youtube';
    const removedUsers = await fetchAndFilterUsernames(url);
    console.log(removedUsers);
    unwatchedUsers(removedUsers);
  });

  slider.addEventListener('input', function() {
      const value = parseFloat(slider.value).toFixed(4);
      updateStarsDisplay(value);
      updateRatingNumber(value);
  });
  // Initialize the display
  updateStarsDisplay(0);
  updateRatingNumber(0);
  utils.updateLeaderboard(social_scores);
  update_all_moderations(moderations);
}
export function updateRatingNumber(value) {
  ratingNumber.textContent = value + ' / 4';
}
export function updateStarsDisplay(value) {
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

  starsDisplay.innerHTML = starsHTML;
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
          }
        });
      });
    disableClickHandlers();
  });
}
export function shuffleCards() {
  console.log('shuffleCards');
  const countdown = document.getElementById(`countdown`);
  countdown.volume = 0.5;
  countdown.play();
  // Get a reference to the container element
  const container = document.querySelector("#youtube_videos");

  // Get an array of all the cards inside the container element
  const cards = Array.from(container.querySelectorAll(".vid_card"));

  // Detach the cards from the DOM
  cards.forEach(card => card.parentNode.removeChild(card));

  // Fisher-Yates Shuffle algorithm
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  const numCards = cards.length;
  const totalTime = 25000; // 25 seconds in milliseconds
  const delayIncrement = totalTime / numCards;
  const animationDuration = 5000; // 5 seconds in milliseconds
  let cardsAnimated = 0; // Counter for the number of cards that have finished animating

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
          }
        });
      });
    // Disable the click handlers while the animations are running
    disableClickHandlers();
  });
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
}

export function watchYoutube(id, link) {
  console.log("in watch youtube");
  const table = $('#youtubeTable').DataTable(); // Assuming your table's ID is youtubeTable
  const rowNode = $("#row_" + id);

  // Show the rating modal dialog
  var rateModal = $("#rateModal");
  rateModal.attr("data-id", id); // Set the data-id attribute
  rateModal.modal("show");

  // Extract the username from the row
  const username = rowNode.find(".username").text().replace(/ \(#\d+\)$/, '');

  // Set the username in the modal dialog
  $("#rateModalLabel").text("Rate this video for " + username);
  $("#username").val(username);

  rowNode.toggle("explode", function () {
    // Use DataTables API to remove the row
    table.row("#row_" + id).remove().draw();

    const timestamp = new Date().toISOString();
    socket.emit("youtube_watched", id, username, timestamp, (response) => {
      console.log("youtube_watched_response", response);
      utils.updateWatchCount(response.watch_count);
      utils.updateTotalCount(response.total_watch_count);
    });
    window.open(link, "_blank");
    utils.countVideos();
  });
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
  var table = $('#youtubeTable').DataTable();
  
  // Use the DataTables API to remove the row
  table.row("#row_" + id).remove().draw();
  
  utils.countVideos();
  console.log("deleteYoutube", table.rows().count());
}

export function showModal(
  username,
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
  $("#shuffle").prop("disabled", true);
  $("#make_fair").prop("disabled", true);
  $("#social_sort").prop("disabled", true);
  $("#time-sort").prop("disabled", true);
}

function enableClickHandlers() {
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
// Fisher-Yates Shuffle algorithm
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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

