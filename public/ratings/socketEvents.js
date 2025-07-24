import * as domActions from "./domActions.js";
import * as utils from "./utils.js";

export const socket = io();
export function initializeSocketEvents(table) {
  socket.on("connect", () => {
    console.log(socket.connected); // true
  });
  socket.on('historical_rating_added', function(dataArray) {
    dataArray.forEach(function(data) {
        console.log('data', data);

        // Define the new row data
        var newRowData = [
            data.videoTitle + '<br />' + '<img src="' + data.videoThumbnail + '" class="img-fluid" alt="Video Thumbnail" />',
            data.username,
            data.rating || 'Not Rated',
            '<button class="btn btn-lg btn-primary watch-youtube-btn" data-video-id="' + data.videoId + '" data-video-link="' + data.videoLink + '">Watch</button>',
            data.ratingTimestamp, // This will be hidden by columnDefs
            utils.convertToUserTimezone(data.ratingTimestamp) // This will be displayed
        ];

        // Add the new row to the DataTable
        var rowNode = table.row.add(newRowData).draw().node();

        // Apply any additional formatting or classes to the row
        $(rowNode).addClass('new');
        
        // After new rows are added, update timestamps if necessary
        utils.updateTimestamps();
    });
  });
   socket.on("newRating", (username, rating, updated_leaderboard) => {
      console.log('updated_leaderboard', updated_leaderboard);
      // Call the updateLeaderboard function to refresh the leaderboard
      utils.updateLeaderboard(updated_leaderboard);
  });
socket.on('youtube_remove', function(videoId) {
  utils.updateWatchCount();
  utils.updateTotalCount();
});  
}
