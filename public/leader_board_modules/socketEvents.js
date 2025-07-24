import * as domActions from "./domActions.js";
import * as utils from "./utils.js";

export function initializeSocketEvents(social_scores,limit=0,socket) {

    socket.on("newRating", (username, rating) => {
        console.log('new rating',rating);
        // Update the social_scores object with the new rating
        if (!social_scores[username]) {
        social_scores[username] = [];
        }
        social_scores[username].push(rating);
        // Call the updateLeaderboard function to refresh the leaderboard
        utils.updateLeaderboard(social_scores,limit);
    });
}