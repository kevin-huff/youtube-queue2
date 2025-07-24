import * as domActions from "./domActions.js";
import * as utils from "./utils.js";

export const socket = io();
export function initializeSocketEvents() {
  socket.on("connect", () => {
    console.log(socket.connected); // true
  });
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
  socket.on("boo_threshold", function (boo_threshold) {
    console.log("boo_threshold met");
    const boo_sound = document.getElementById(`boo`);
    boo_sound.volume = 0.5;
    boo_sound.play();
  });
  socket.on("newRating", (username, rating, updated_leaderboard) => {
      console.log('updated_leaderboard', updated_leaderboard);

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
        "currentWeightedRating": currentWeightedRating,
        "currentRank": currentRank,
        "previousWeightedRating": previousWeightedRating,
        "previousRank": previousRank,
        "rating": rating
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
      domActions.showModal(username, currentWeightedRating, currentRank, previousWeightedRating, previousRank, rating, modal_object.top10Changes);
  });
  function getTop10(leaderboard) {
    return leaderboard.slice(0, 10).map(entry => entry.user);
  }
  
}
