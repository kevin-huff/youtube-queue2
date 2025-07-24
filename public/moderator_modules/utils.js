const m = 5;
let C = null;

function weighted_rating(avgScore, numRatings, m, C) {
  return (numRatings / (numRatings + m)) * avgScore + (m / (numRatings + m)) * C;
}

function average_rating_of_all_users(social_scores) {
  let totalRatings = 0;
  let totalUsers = 0;

  for (const scores of Object.values(social_scores)) {
    totalRatings += scores.map(Number).reduce((a, b) => a + b, 0);
    totalUsers += scores.length;
  }

  return totalRatings / totalUsers;
}

// You should call this function once when you receive social_scores for the first time
export function updateC(social_scores) {
  C = average_rating_of_all_users(social_scores);
}
//Cound the videos on the page
export function countVideos() {
  // count the number of <div class="col mb-4 vid_card" id="row_<%= index+1 %>">
  var count = document.querySelectorAll(
    'div[class="col mb-4 vid_card"]'
  ).length;
  console.log("queue_count", count);
  document.getElementById("queue_count").innerHTML = count;
  return count;
}
//Update the watch count on the page
export function updateWatchCount(watch_count) {
  console.log("watch_count", watch_count);
  document.getElementById("watch_count").innerHTML = watch_count;
}
//Update the total count on the page
export function updateTotalCount(total_count) {
  console.log("total_count", total_count);
  document.getElementById("total_count").innerHTML = total_count;
}
export function formatDuration(duration) {
    var match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);

    var hours = parseInt(match[1]) || 0;
    var minutes = parseInt(match[2]) || 0;
    var seconds = parseInt(match[3]) || 0;

    if (hours) {
      minutes += hours * 60;
    }

    return (
      minutes.toString().padStart(2, "0") +
      ":" +
      seconds.toString().padStart(2, "0")
    );
  }

  export function addYoutube(youtube) {
    // Get a reference to the container element
    const container = document.querySelector("#youtube_videos");

    // Create a new card element
    const newCard = document.createElement("div");
    newCard.className = "col mb-4 vid_card";
    newCard.id = "row_" + youtube["video"]["id"];

    // Set the thumbnail URL based on whether the 'standard' thumbnail exists
    let thumbnailUrl = "";
    if (youtube["video"]["snippet"]["thumbnails"]["standard"]) {
      thumbnailUrl =
        youtube["video"]["snippet"]["thumbnails"]["standard"]["url"];
    } else {
      thumbnailUrl =
        youtube["video"]["snippet"]["thumbnails"]["default"]["url"];
    }

    newCard.innerHTML = `
      <div class="card h-100">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h5 class="card-title m-0">${
            youtube["video"]["snippet"]["title"]
          }</h5>
          <button data-video-id='${youtube["video"]["id"]}' class='btn btn-sm btn-danger remove-youtube-btn' data-toggle='tooltip' data-placement='top' title='Remove Video'><i class='fa-solid fa-trash'></i></button>
        </div>
        <div class="card-body p-0">
          ${
            youtube["video"]["snippet"]["thumbnails"]["standard"]
              ? `<img src="${youtube['video']['snippet']['thumbnails']['standard']['url']}" class="card-img-top" alt="Video Thumbnail" />`
              : `<img src="${youtube['video']['snippet']['thumbnails']['default']['url']}" class="card-img-top" alt="Video Thumbnail" />`
          }
        </div>
        <div class="card-footer d-flex justify-content-between">
          <small class="username">${youtube["user"]}</small>
          <small class="duration">${formatDuration(youtube["video"]["contentDetails"]["duration"])}</small>
          ${
            youtube["moderated"]
              ? `<span class="badge badge-pill badge-success">Moderated</span>`
              : ``
          }
          <button class="btn btn-lg btn-primary watch-youtube-btn" data-video-id='${youtube["video"]["id"]}' data-video-link='${youtube["link"]}'>Watch</button>
        </div>
      </div>
    `;

    // Append the new card to the container element
    container.appendChild(newCard);
    countVideos();
  }

  export function updateLeaderboard(social_scores, user_count = 10) {
    // If C is not initialized, you can initialize it here, but it's better to initialize it outside this function
    if (C === null) {
      updateC(social_scores);
    }
  
    const leaderboard = Object.entries(social_scores)
      .map(([user, scores]) => {
        const avgScore =
          scores.map(Number).reduce((a, b) => a + b, 0) / scores.length;
        const numRatings = scores.length;
        const weightedRating = weighted_rating(avgScore, numRatings, m, C);
        return { user, avgScore, numRatings, weightedRating };
      })
      .sort((a, b) => b.weightedRating - a.weightedRating)
      .slice(0, 10);
  
    const leaderboardDiv = $("#leaderboard");
  
    // Fade out the old leaderboard
    leaderboardDiv.fadeOut(500, function () {
      leaderboardDiv.empty();
      const row = $("<div>").addClass("row");
      leaderboard.forEach(({ user, weightedRating }, index) => {
        const userDiv = $("<div>").addClass("user");
        const rank = index + 1;
        userDiv.html(`<span>${rank}. ${user}</span> <span>${weightedRating.toFixed(2)}</span>`);
        leaderboardDiv.append(userDiv);
      });
      leaderboardDiv.append(row);
  
      // Fade in the new leaderboard
      leaderboardDiv.fadeIn(500);
    });
  }
  
  export function getLeaderboardArray(social_scores) {
 
    // If C is not initialized, you can initialize it here, but it's better to initialize it outside this function
    if (C === null) {
      updateC(social_scores);
    }
  
    return Object.entries(social_scores)
      .map(([user, scores]) => {
        const avgScore =
          scores.map(Number).reduce((a, b) => a + b, 0) / scores.length;
        const numRatings = scores.length;
        const weightedRating = weighted_rating(avgScore, numRatings, m, C);
        return [user, scores, avgScore, weightedRating];
      })
      .sort((a, b) => b[3] - a[3]);
  }
