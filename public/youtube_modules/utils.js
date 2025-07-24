
let fakeUsernames;

export function setFakeUsernames(usernames) {
  fakeUsernames = usernames;
}
//Cound the videos on the page
export function countVideos() {
  // count the number of <div class="col mb-4 vid_card" id="row_<%= index+1 %>">
  var countVidCard = document.querySelectorAll(
    'div[class="col-md-3 mb-4 vid_card"]'
  ).length;
  
  var countVip = document.querySelectorAll(
    'div[class="col-md-3 mb-4 vid_card vip"]'
  ).length;

  var total = countVidCard + countVip;
  
  console.log("queue_count", total);
  document.getElementById("queue_count").innerHTML = total;
  // If there are vip videos show the vip section
  if (document.querySelectorAll('.vip').length > 0) {
    document.getElementById('vipVideoHeader').classList.remove('d-none');
    document.getElementById('vipVideoHeader').classList.add('d-flex');
    document.getElementById('vip_youtube_videos').classList.remove('d-none');
    document.getElementById('vip_youtube_videos').classList.add('d-flex');
  } else {
    document.getElementById('vipVideoHeader').classList.add('d-none');
    document.getElementById('vipVideoHeader').classList.remove('d-flex');
    document.getElementById('vip_youtube_videos').classList.add('d-none');
    document.getElementById('vip_youtube_videos').classList.remove('d-flex');
  }
  return total;
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
    const vipContainer = document.querySelector("#vip_youtube_videos");
    // Create a new card element
    const newCard = document.createElement("div");
    newCard.className = "col-md-3 mb-4 vid_card";
    newCard.id = "row_" + youtube["video"]["id"];
    newCard.dataset.userid = youtube["user_id"];
    // Set the thumbnail URL based on whether the 'standard' thumbnail exists
    let thumbnailUrl = "";
    if (youtube["video"]["snippet"]["thumbnails"]["standard"]) {
      thumbnailUrl =
        youtube["video"]["snippet"]["thumbnails"]["standard"]["url"];
    } else {
      thumbnailUrl =
        youtube["video"]["snippet"]["thumbnails"]["default"]["url"];
    }
    let vip = "";
    if(youtube["vip"]) {
      vip = " vip";
    }
    newCard.innerHTML = `
      <div class="card h-100 ${vip}">
        <div class="card-header d-flex justify-content-between align-items-center">
            ${youtube["video"]["snippet"]["title"]}
        </div> <!-- end card-header -->
        <div class="card-body p-0">
          ${
            youtube["video"]["snippet"]["thumbnails"]["standard"]
              ? `<img src="${youtube['video']['snippet']['thumbnails']['standard']['url']}" class="card-img-top" alt="Video Thumbnail" />`
              : `<img src="${youtube['video']['snippet']['thumbnails']['default']['url']}" class="card-img-top" alt="Video Thumbnail" />`
          }
        </div>
        <div class="card-footer d-flex flex-column">
          <div class="d-flex justify-content-between">
            <small class="fake-username">${getFakeUsername(fakeUsernames)}</small>
            <small class="username d-none">${youtube["user"]}</small>
            <small class="duration">${formatDuration(youtube["length"])}</small>
            ${
              youtube["moderated"]
                ? `<span class="badge badge-pill badge-success">Moderated</span>`
                : ``
            }
          </div>
          <div class="d-flex justify-content-between mt-2">
            <button data-video-id='${youtube["video"]["id"]}' class='btn btn-sm btn-danger remove-youtube-btn' data-toggle='tooltip' data-placement='top' title='Remove Video'><i class='fa-solid fa-trash'></i></button>
            <button class="btn btn-lg btn-primary watch-youtube-btn" data-video-id='${youtube["video"]["id"]}' data-video-link='${youtube["link"]}'>Watch</button>
          </div>
        </div>
      </div>
    `;

    // Append the new card to the container element
    if(youtube["vip"]) {
      vipContainer.appendChild(newCard);
    } else {
      container.appendChild(newCard);
    }
    countVideos();
  }

// Define a list of users with their awards
const userAwards = {
  'lare_bearrrr': '🏆🏆',
  'Kirbgames': '🥈',
  'j_quall': '🥉',
  'Michael_I_Guess': '🏆',
  'ZilchGnu': '🥈',
  'TheRealPickford': '🥉',
};

export function updateLeaderboard(leaderboard, user_count = 10) {
  const leaderboardDiv = $("#leaderboard");

  leaderboardDiv.fadeOut(500, function () {
    leaderboardDiv.empty();
    const row = $("<div>").addClass("row");
    for (let index = 0; index < user_count; index++) {
      if (index >= leaderboard.length) break;
      const { user, weightedRating } = leaderboard[index];
      const rank = index + 1;

      const userDiv = $("<div>").addClass("user");
      const rankDiv = $("<div>").addClass("rank").text(`${rank}.` + "\u00A0");
      const nameDiv = $("<div>").addClass("name").text(user);
      const ratingDiv = $("<div>").addClass("rating").text(weightedRating.toFixed(4));

      // Check if the user has an award and append it to their name
      const award = userAwards[user];
      if (award) {
        const trophyIcon = $("<span>").addClass("trophy").text(award);
        nameDiv.append(trophyIcon);
      }

      userDiv.append(rankDiv, nameDiv, ratingDiv);
      leaderboardDiv.append(userDiv);
    }
    leaderboardDiv.append(row);
    leaderboardDiv.fadeIn(500);
  });

  // Append the ranking to the .username class for every card on the page
  $(".username").each(function() {
    let username = $(this).text();
    // Remove existing ranking using a regular expression
    username = username.replace(/ \(#\d+\)| \p{Emoji}+/gu, '').trim();

    const userRanking = leaderboard.findIndex(({ user }) => user === username) + 1;
    if (userRanking > 0) {
      // Check if the user has an award and append it
      const award = userAwards[username];
      const trophyMarkup = award ? ` ${award}` : '';
      $(this).html(`${username} (#${userRanking})${trophyMarkup}`);
    } else {
      $(this).html(username);
    }
  });

  window.leaderboard = leaderboard;
}

export function getLeaderboardArray() {
  const leaderboard = window.leaderboard;

  return leaderboard;
}

export function adjustTransformOrigin(element) {
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight;

  // Calculate the amount of space that the transformed element will need below the bottom of the viewport.
  const spaceNeededBelow = rect.height * (1.25 - 1);

  // If the transformed element would extend below the bottom of the viewport, adjust the transform origin so that it stays within the viewport.
  if (rect.bottom + spaceNeededBelow > windowHeight) {
    element.style.transformOrigin = 'bottom';
  } else {
    element.style.transformOrigin = 'top';
  }

  // Adjust the transform origin to account for the fact that we are using `transform-box: content-box`.
  element.style.transformOrigin += ' ' + rect.width / 2 + 'px';

}

export function resetTransformOrigin(element) {
  element.style.transformOrigin = '';
}

export function getFakeUsername(fakeUsernames) {
  // Pick a random one from the list
  const randomIndex = Math.floor(Math.random() * fakeUsernames.length);
  return fakeUsernames[randomIndex];
}