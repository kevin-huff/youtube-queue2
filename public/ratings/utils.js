//Update the watch count on the page
export function updateWatchCount(watch_count) {
  console.log("watch_count", watch_count);
  // Get the current value of watch_count
  const currentCount = parseInt(document.getElementById("watch_count").innerHTML);
  // Increment the count
  const newCount = currentCount + 1;
  document.getElementById("watch_count").innerHTML = newCount;
}
//Update the total count on the page
export function updateTotalCount(total_count) {
  console.log("total_count", total_count);
    // Get the current value of watch_count
    const currentCount = parseInt(document.getElementById("total_count").innerHTML);
    // Increment the count
    const newCount = currentCount + 1;
  document.getElementById("total_count").innerHTML = newCount;
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
    username = username.replace(/ \(#\d+\)$/, '');
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

export function convertToUserTimezone(utcTimestamp) {
  var date = new Date(utcTimestamp);

  // Set up options for date and time parts
  var options = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  };

  // Create formatter with the user's locale and options
  var formatter = new Intl.DateTimeFormat('en-US', options);

  // Format the date and split it into parts
  var parts = formatter.formatToParts(date);

  // Construct the formatted date from parts
  var formattedDate = parts.map(({ type, value }) => {
    switch (type) {
      case 'day':
      case 'month':
        return value;
      case 'year':
        return value + ' at';
      case 'hour':
      case 'minute':
        return value;
      case 'literal':
        if (value === ',') return ''; // Remove the comma after the year
        if (value === ':') return value; // Keep the colon between hour and minute
        return ' '; // Convert other literals to space
      case 'timeZoneName':
        return value;
      default:
        return '';
    }
  }).join('');

  return formattedDate;
}

export function updateTimestamps() {
  console.log('Updating timestamps')
  document.querySelectorAll('span.local-time').forEach(function(span) {
      var utcTimestamp = span.getAttribute('data-timestamp');
      try {
      span.textContent = convertToUserTimezone(utcTimestamp);
      } catch (e) {
      span.textContent = 'Invalid date';
      console.error('Error converting timestamp:', e);
      }
  });
}