//Cound the videos on the page
export function countVideos() {
  // count the number of <div class="col mb-4 vid_card" id="row_<%= index+1 %>">
  var count = document.querySelectorAll(
    'div[class="col-md-3 mb-4 vid_card"]'
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
    var table = $('#youtubeTable').DataTable();

    // Set the thumbnail URL based on whether the 'standard' thumbnail exists
    let thumbnailUrl = youtube["video"]["snippet"]["thumbnails"]["standard"]
        ? youtube["video"]["snippet"]["thumbnails"]["standard"]["url"]
        : youtube["video"]["snippet"]["thumbnails"]["default"]["url"];

    // Create the data array for the new row
    let rowData = [
        `<img src="${thumbnailUrl}" class="card-img-top" alt="Video Thumbnail" />
         ${youtube["video"]["snippet"]["title"]}`,
        `<small class="username">${youtube["user"]}</small>`,
        `<small class="ranking"></small>`,
        `<small class="duration">${formatDuration(youtube["length"] || '')}</small>`,
        `<button data-video-id='${youtube["video"]["id"]}' class='btn btn-sm btn-danger remove-youtube-btn'
            data-toggle='tooltip' data-placement='top' title='Remove Video'><i class='fa-solid fa-trash'></i></button>
         <button class="btn btn-lg btn-primary watch-youtube-btn" data-video-id='${youtube["video"]["id"]}' data-video-link='${youtube["link"]}'>Watch</button>`
    ];

    // Add the new row to the DataTable
    let node = table.row.add(rowData).draw().node();

    // Set the ID for the newly added row
    $(node).attr('id', "row_" + youtube["video"]["id"]);

    countVideos();
    updateLeaderboard(getLeaderboardArray());
}



export function updateLeaderboard(leaderboard, user_count = 10) {
  const leaderboardDiv = $("#leaderboard");
  const table = $('#youtubeTable').DataTable(); // Assuming your table's ID is youtubeTable

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

      userDiv.append(rankDiv, nameDiv, ratingDiv);
      leaderboardDiv.append(userDiv);
    }
    leaderboardDiv.append(row);
    leaderboardDiv.fadeIn(500);
  });

  // Update the ranking in the DataTable
  table.rows().every(function() {
    const rowData = this.data();
    const usernameCell = $(this.node()).find('.username');
    let username = usernameCell.text();

    // Remove existing ranking using a regular expression
    username = username.replace(/ \(#\d+\)$/, '');
    const userRanking = leaderboard.findIndex(({ user }) => user === username) + 1;

    // Update the ranking in the DataTable
    const rankingCell = $(this.node()).find('.ranking');
    if (userRanking > 0) {
      rankingCell.html(`${userRanking}`);
      rowData[2] = `${userRanking}`; // Assuming the ranking is in the third column (index 2)
    } else {
      rankingCell.html('');
      rowData[2] = '';
    }

    // Update the row data in the DataTable
    this.data(rowData);
  });
  table.order([[2, 'asc']]).draw(); // Reapply the sort order
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

  console.log('rect', rect);
}




export function resetTransformOrigin(element) {
  element.style.transformOrigin = '';
}
