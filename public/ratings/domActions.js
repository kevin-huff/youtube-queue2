import * as utils from "./utils.js";
import { socket } from "./socketEvents.js";

export function initializeDOMActions(social_scores,moderations) {
  utils.updateLeaderboard(social_scores);
};

