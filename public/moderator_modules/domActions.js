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

export function initializeDOMActions(moderations) {
  var row;
  // Set up event handler for when the user clicks a star
  $(document).on("click", ".rating-button", function () {
    console.log("star click");
    var rating = $(this).data("value");
    var videoId = $(this).data("id");
    var rating = $("input[name='rating']:checked").val();
    $("#video-id").val(videoId); // set the value of the hidden input field to the video ID
    $(".star").removeClass("selected");
    $(this).addClass("selected");
  });
  // Add event listener for the remove-youtube-btn class
  $(document).on("click", ".remove-youtube-btn", function () {
    const videoId = $(this).data("video-id");
    removeYoutube(videoId);
    $("#moderateModal").modal("hide");
  });
  // Add event listener for the remove-youtube-btn class
  $(document).on("click", ".watch-youtube-btn", function () {
    const videoId = $(this).data("video-id");
    const videoLink = $(this).data("video-link");
    watchYoutube(videoId, videoLink);
  });
  // Set up event handler for when the user clicks the "Submit" button
  $(document).on("click", "#submitRating", function () {
    var rating = $("input[name='rating']:checked").val();
    var id = $("#rateModal").data("id"); // Get the id value
    console.log("id", id);
    if (rating >= 0 && id) {
      var username = $("#username").val();
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
    shuffleCards();
  });
  $("#make_fair").click(function () {
    let social_scores = utils.getLeaderboardArray();
    makeFair(social_scores);
  });
  $("#social_sort").click(function () {
    let social_scores = utils.getLeaderboardArray();
    socialSort(social_scores);
  });
  $("#time-sort").click(function () {
    sortCards();
  });
  $("#thumbsDownButton").click(function () {
    var id = $("#moderateModal").attr("data-video-id"); // Get the updated id value
    moderateYoutube(id, 0);
    $("#moderateModal").modal("hide");
  });
  
  $("#thumbsUpButton").click(function () {
    var id = $("#moderateModal").attr("data-video-id"); // Get the updated id value
    moderateYoutube(id, 1);
    $("#moderateModal").modal("hide");
  });
  let social_scores = utils.getLeaderboardArray();
  utils.updateLeaderboard(social_scores);
  //console.log("social_scores", social_scores);
  update_all_moderations(moderations);
  //console.log("moderations", moderations);
}

export function shuffleCards() {
  console.log('shuffleCards');
  const countdown = document.getElementById(`countdown`);
  countdown.volume = 0.5;
  countdown.play();
  // Emit the countdown event
  io.emit("countdown");
  // Get a reference to the container element
  const container = document.querySelector("#youtube_videos");

  // Get an array of all the cards inside the container element
  const cards = Array.from(container.querySelectorAll(".col"));

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
  // randomly select a jquery ui effect
  var effect = effects[Math.floor(Math.random() * effects.length)];
  scrollPage(totalTime,.5);
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

export function sortCards() {
  console.log('sortCards');
  const countdown = document.getElementById(`countdown`);
  countdown.volume = 0.5;
  countdown.play();
  const container = document.querySelector("#youtube_videos");
  const cards = Array.from(container.querySelectorAll(".col"));

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
  scrollPage(totalTime,.5);
  var effect = effects[Math.floor(Math.random() * effects.length)];
  cards.forEach((card, index) => {
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

  utils.countVideos();
}

export function makeFair(social_scores) {
  const countdown = document.getElementById(`countdown`);
  countdown.volume = 0.5;
  countdown.play();

  const container = document.querySelector("#youtube_videos");
  const cards = Array.from(container.querySelectorAll(".col"));

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
  const cards = Array.from(container.querySelectorAll(".col"));

  // Sort the cards based on the user's average rating
  cards.sort((card1, card2) => {
    const user1 = card1.querySelector(".username").textContent;
    const user2 = card2.querySelector(".username").textContent;

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

  const numCards = cards.length;
  const totalTime = 25500; // 30 seconds in milliseconds
  const delayIncrement = totalTime / numCards;
  const animationDuration = 5000; // 2 seconds in milliseconds
  let cardsAnimated = 0; // Counter for the number of cards that have finished animating
  scrollPage(totalTime,.5);
  // Loop through the sorted array and append each card to the container element with animation
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
  });
  // Disable the click handlers while the animations are running
  disableClickHandlers();
  utils.countVideos();
}
export function removeYoutube(id) {
  var row = document.getElementById("row_" + id);
  $("#row_" + id).toggle("explode", function () {
    row.remove();
    socket.emit("youtube_deleted", id, (response) => {
      console.log(response);
    });
    utils.countVideos();
  });
}

export function watchYoutube(id, link) {
  var row = document.getElementById("row_" + id);

  // Show the rating modal dialog
  var moderateModal = $("#moderateModal");
  moderateModal.attr("data-video-id", id); // Set the data-id attribute

  // Set the data-video-id for the remove button
  var removeButton = moderateModal.find('.remove-youtube-btn');
  removeButton.attr("data-video-id", id);

  moderateModal.modal("show");

  // Set the username in the modal dialog
  $("#moderateModalLabel").text(
    "Moderate this video for " + $(row).find(".username").text()
  );
  $("#username").val($(row).find(".username").text());
  window.open(link, "_blank");
  utils.countVideos();
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
  console.log("deleteYoutube dom action ", id);
  var row = document.getElementById("row_" + id);
  $("#row_" + id).toggle("explode", function () {
    row.remove();
  });
  utils.countVideos();
}
export function showModal(
  username,
  weightedRating,
  rank,
  prevWeightedRating,
  prevRank,
  rating
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
  const thisRatingSpan = document.getElementById("this-rating");

  // Check if the elements exist before setting their textContent property
  if (usernameSpan) {
    usernameSpan.textContent = username;
  }
  if (weightedRatingSpan) {
    weightedRatingSpan.textContent = weightedRating.toFixed(2);
  }
  if (rankSpan) {
    rankSpan.textContent = rank;
  }
  if (thisRatingSpan) {
    thisRatingSpan.textContent = rating;
  }
  // Calculate the rating change and display it in the modal dialog
  if (ratingChangeSpan) {
    const ratingChange = (weightedRating - prevWeightedRating).toFixed(2);
    const ratingChangeText =
      ratingChange > 0 ? `(+${ratingChange})` : `(-${ratingChange})`;
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

export function scrollPage(duration, cycles) {
  let start = null;
  const maxScrollTop = document.body.scrollHeight - window.innerHeight;
  let direction = 1;  // 1 for down, -1 for up
  let cycle = 0;

  function step(timestamp) {
    if (!start) start = timestamp;
    const elapsed = timestamp - start;

    // Calculate the fraction of the duration that has passed
    const fraction = Math.min(1, (elapsed / duration));

    // Calculate which cycle we are in
    cycle = Math.floor(fraction * cycles * 2);

    // Calculate the position within the current cycle
    const cyclePos = (fraction * cycles * 2) - cycle;

    // Determine scroll direction based on cycle
    direction = (cycle % 2 === 0) ? 1 : -1;

    // Use this fraction to determine the target scroll position
    const target = cyclePos * maxScrollTop;

    // Scroll the page
    setTimeout(function () {
      window.scrollTo({
        top: Math.abs(target * direction),
        behavior: 'auto'
      });
    }, 200);

    // If we haven't finished all the cycles yet, continue on the next frame
    if (elapsed < duration) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

