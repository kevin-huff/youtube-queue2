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

export function updateLeaderboard(leaderboard,limit=0) {
  
  const leaderboardDiv = $("#leaderboard");
  // If limit is not 0, slice the leaderboard array
  if (limit !== 0) {
    leaderboard = leaderboard.slice(0, limit);
  }
  // Fade out the old leaderboard
  leaderboardDiv.fadeOut(500, function () {
    leaderboardDiv.empty();
    const row = $("<div>").addClass("row");
    leaderboard.forEach(({ user, avgScore, numRatings, weightedRating }, index) => {
      console.log('user: ', user);
      if(user === 'lare_bearrrr'){
        user = '🏆🏆' + ' ' + user;
      }
      if(user === 'Kirbgames'){
        user = '🥈' + ' ' + user;
      }
      if(user === 'j_quall'){
        user = '🥉' + ' ' + user;
      }
      if(user === 'Michael_I_Guess'){
        user = '🏆' + ' ' + user;
      }
      if(user === 'ZilchGnu'){
        user = '🥈' + ' ' + user;
      }
      if(user === 'TheRealPickford'){
        user = '🥉' + ' ' + user;
      }
      const colUser = $("<div>").addClass("col-12 col-md-12 mb-12");
      const rank = index + 1;
      const userDiv = $("<div>").addClass("user p-3 border rounded");
      userDiv.html(`
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="font-weight-bold">${rank}. ${user}</span>
          <span class="badge badge-primary badge-pill">${numRatings} ratings</span>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-2">
          <span>Weighted Social Score:</span>
          <span class="font-weight-bold">${weightedRating.toFixed(4)}</span>
        </div>
      `);
      colUser.append(userDiv);
      row.append(colUser);
    });
    leaderboardDiv.append(row);

    // Fade in the new leaderboard
    leaderboardDiv.fadeIn(500);
  });
}

