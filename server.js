// Default configuration variables
let ai_enabled = true;
let max_vids_per_user = 2; 
let ai_memory_limit = 0;
let starting_balance = 30;

// Import required dependencies
const tmi = require("tmi.js");
const request = require("request");
const express = require("express");
const socketIo = require("socket.io");
const crypto = require("crypto");
const Fuse = require("fuse.js");
const { google } = require("googleapis");
const dotenv = require("dotenv");
dotenv.config();
const { Configuration, OpenAIApi } = require("openai");
const { CensorSensor } = require("censor-sensor");
const http = require("http");
const https = require('https');
const fs = require('fs');
const path = require("path");
const basicAuth = require("express-basic-auth");
const ElevenLabs = require("elevenlabs-node");

let finalRatings = {
  user1: { average: 0, judges: {} },
  user2: { average: 0, judges: {} }
};

const openai_chatbot_model_id = process.env.openai_chatbot_model_id;
const axios = require('axios');
let chatRatings = [];
let chatRatingEnabled = false;
let lastChatRatingTime = Date.now();

const voice = new ElevenLabs(
  {
      apiKey:  process.env.elevenlabs_key, // Your API key from Elevenlabs
      voiceId: process.env.elevenlabs_voice_id, // A Voice ID from Elevenlabs
  }
);
// Set up Express and SocketIO server configurations
const app = express();
//get port from .env
const port = process.env.PORT || 3000;
const server = http.createServer(app);
const io = socketIo(server);
// Set up YouTube API configuration
const youtube = google.youtube({
  version: "v3",
  auth: process.env.youtube_api_key,
  httpOptions: {
    headers: {
      referer: "https://bootcutbot.glitch.com/",
    },
  },
});
// Set up OpenAI API configuration
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
// Set up Twitch client configuration
console.log("bot_account", process.env.bot_account);
const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: process.env.bot_account,
    password: process.env.oauth,
  },
  channels: [process.env.twitch_channel],
});
client.connect();
// Configure Express app settings
var dir = path.join(__dirname, "public");
app.use(
  express.static(dir, {
    maxAge: "1d",
  })
);

server.listen(port, () => {
    console.log(`listening on *:${port}`);
});
// Set up Jsoning databases for configuration and data
const jsoning = require("jsoning");
const { name } = require("ejs");
let settings_db = new jsoning("db/queue_settings.json");
let youtube_db = new jsoning("db/youtube.json");
let historical_youtube_db = new jsoning("db/historical_youtube.json");
let social_scores_db = new jsoning("db/social_scores.json");
let moderation_db = new jsoning("db/moderation.json");
let tokens_db = new jsoning("db/tokens.json");
let giveaway_db = new jsoning("db/giveaways.json");
let login_db = new jsoning("db/login.json");
let validLogins = login_db.all();
console.log('valid logins saved', validLogins);
//const trophy_users = ['lare_bearrrr'];
const trophy_users = [];

// Configure CensorSensor to disable specific censorship tiers
const censor = new CensorSensor();
censor.disableTier(2);
censor.disableTier(3);
censor.disableTier(4);
censor.disableTier(5);

// Handle Socket.IO events
io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("youtube_deleted", async (arg, callback) => {
    var current_youtube = await youtube_db.get("youtube");
    if (current_youtube == null) {
      current_youtube = [];
    }
    //see if the youtube exists and remove it
    var youtube_exists = current_youtube.findIndex(function (
      current_youtube,
      index
    ) {
      if (current_youtube["video"]["id"] == arg) return true;
    });

    if (youtube_exists == -1) {

      console.log("youtube_deleted: youtube not found");
    } else {
      console.log("youtube found");
      //Refund tokens      
      await addUserTokens(current_youtube[youtube_exists].user,1);
      current_youtube.splice(youtube_exists, 1);
      await youtube_db.set("youtube", current_youtube);
    }
    io.emit("youtube_remove", arg);
    callback("youtube_deleted processed");
  });
  socket.on("youtube_watched", async (data, callback) => {
    chatRatingEnabled = true;
    // Destructure the data object
    const { id, username, timestamp, videoThumbnail, videoTitle, videoLink } = data;
    io.emit("open_guest_rating", data);
    console.log("open_guest_rating")
    // Get the youtube database
    var current_youtube = youtube_db.get("youtube") || [];
    
    // See if the youtube exists and remove it
    var youtube_exists = current_youtube.findIndex(yt => yt.video.id == id);
  
    // Add it to the historical database with additional data
    historical_youtube_db.push(id, { 
      username, 
      timestamp, 
      videoThumbnail, 
      videoTitle, 
      videoLink 
    });
  
    if (youtube_exists === -1) {
      console.log("youtube_watched: youtube not found");
    } else {
      console.log("youtube found");
      // Remove it from the current database
      current_youtube.splice(youtube_exists, 1);
      youtube_db.set("youtube", current_youtube);
    }
  
    // Remove from any other pages that are up
    io.emit("youtube_remove", id);
  
    // Increment the watch count
    var update_watch_count = await settings_db.math("youtubes_watched", "add", 1);
    // Increment the total watch count
    var update_total_watch_count = await settings_db.math("total_youtubes_watched", "add", 1);
    // Get the watch count
    var watch_count = await settings_db.get("youtubes_watched");
    // Get the total watch count
    var total_watch_count = await settings_db.get("total_youtubes_watched");
    console.log("total_youtubes_watched:", total_watch_count);
    console.log("youtubes_watched:", watch_count);
  
    // watch count object
    var watch_count_obj = {
      watch_count: watch_count,
      total_watch_count: total_watch_count,
    };
    callback(watch_count_obj);
  });
  socket.on("youtube_moderated", (arg, callback) => {
    // Save the rating to the moderation_db using the video's id as the key
    moderation_db.set(arg.id, arg.rating);  
    console.log("youtube_moderated:", arg);  
    io.emit("update_youtube_moderated", arg);
    callback("youtube_moderated processed");
  });
  // Add a socket.io event listener for rating a user
  socket.on("rateUser", async (ratingObj) => {    
    console.log('ratingObj',ratingObj);
     // Retrieve the video array from historical_youtube_db using videoId
    let videoRecords = historical_youtube_db.get(ratingObj.videoId);

    // Check if there is at least one record for this video
    if (videoRecords && videoRecords.length > 0) {
      // Assume the rating should be added to the first (and presumably only) entry
      let videoRecord = videoRecords[0];
      // Format the ratingObj into a Discord embed message
      const discordMessage = formatRatingObj(ratingObj, videoRecord);
      // Send the message to Discord using webhook in the .env
      sendToDiscord(process.env.DISCORD_WEBHOOK, discordMessage);
      // Add the rating and rating timestamp to the video record
      videoRecord.rating = ratingObj.rating;
      videoRecord.ratingTimestamp = new Date().toISOString(); // ISO format timestamp
      videoRecords[0] = videoRecord;
      console.log('vidoeRecords to save', videoRecords);
      // Save the updated array of records back to the database
      await historical_youtube_db.set(ratingObj.videoId, videoRecords);
    } else {
      // Handle the case where the videoRecords array does not exist or is empty
      console.log(`No historical records found for video ID: ${ratingObj.videoId}`);
    }
    // Get the current ratings from the database
    let currentRatings = social_scores_db.get(ratingObj.username.trim());

    // If the user has not been rated before, create a new entry in the database
    if (currentRatings === null) {
      currentRatings = [];
    }
    // Add the new rating to the list of ratings for this user
    currentRatings.push(ratingObj.rating);
    // Save the updated list of ratings for this user to the database
    await social_scores_db.set(ratingObj.username, currentRatings);
    // Rebuild the Leaderboard
    var leaderboard = updateLeaderboard(await social_scores_db.all());
    // Emit the new rating to the middleware
    io.emit("newRating", ratingObj.username, ratingObj.rating, leaderboard);
    //Reset the chat ratings
    chatRatings = [];
    lastChatRatingTime = Date.now();
    io.emit("final_judgement", process.env.twitch_channel);
    io.emit("average_chat_rating", ratingObj.rating);
    io.emit('historical_rating_added', videoRecords);
  });
  socket.on('gong', async (userinfo) => {
      // Check if guest login is still valid
      let authed = await check_socket_auth(userinfo);
      if (!authed) return;

      console.log('Gong event triggered');
      let userstate = {};
      userstate['display-name'] = userinfo.username;
      io.emit('gong_pause_video', userstate);
      io.emit('gong_play_sound', userstate);
      let message = await abbadabbabotText(`Write A gong alert about ${userinfo.username} gonging this video. In just a sentence or two.`);
      await gen_and_play_tts(message, 'eleven_turbo_v2');
      console.log('closing video');
      io.emit('gong_close_video', userstate);
      console.log('adding alert');
      io.emit('gong_add_alert', userstate, message);
  });

  socket.on('veto', async (userinfo) => {
      // Check if guest login is still valid
      let authed = await check_socket_auth(userinfo);
      if (!authed) return;
      console.log('Veto event triggered');
      io.emit('play_veto');
  });
  socket.on('fart', async (userinfo) => {
      // Check if guest login is still valid
      let authed = await check_socket_auth(userinfo);
      if (!authed) return;
      console.log('fart event triggered');
      // make sure this 
      io.emit('play_fart');
  });
  socket.on('moan', async (userinfo) => {
    // Check if guest login is still valid
    let authed = await check_socket_auth(userinfo);
    if (!authed) return;
    console.log('moan event triggered');
    // make sure this 
    io.emit('play_moan');
});
  socket.on('lockedin', async (userinfo) => {
      // Check if guest login is still valid
      let authed = await check_socket_auth(userinfo);
      if (!authed) return;
      console.log('lockedin event triggered');
      io.emit('play_lockedin');
  });    
  socket.on('guest_rates', async (guestRating) => {
      console.log('Received guest rating:', guestRating);
      // Check if guest login is still valid
      let authed = await check_socket_auth(guestRating.userinfo);
      if (!authed) return;
      io.emit('guest_rates', guestRating);
  });
  socket.on('update_name', ({user: user, lastUsernameUsed: lastUsernameUsed}) => {
      console.log('Received name update:', {user: user, lastUsernameUsed: lastUsernameUsed});
      io.emit('update_name', {user: user, lastUsernameUsed: lastUsernameUsed});
  });
  socket.on('sign_off', (user) => {
      console.log('Received sign off:', user);
      io.emit('sign_off', user);
  });
  socket.on('generateCode', async function() {
      let generatedCode = await abbadabbabotText('Generate a silly 10 to 16 character password it is just for a joke, make it always about farts and try to make it super unique. It is very important to only respond with the code and nothing else')
      console.log('generatedCode', generatedCode);
      // Emit the 'codeGenerated' event with the generated code
      socket.emit('codeGenerated', generatedCode);
  });
  socket.on('saveLogin', async function(login) {
      // Save the login
      await login_db.set(login.username, login.loginCode);
      // Emit the 'loginSaved' event with the saved login
      socket.emit('loginSaved', login);
      // update valid logins list
      validLogins = await login_db.all();
  });

  socket.on('disableLogin', async function(login) {
    console.log('disableLogin', login);
      // Disable the login
      await login_db.delete(login)
      socket.emit('loginDisabled', login);
      // update valid logins list
      validLogins = await login_db.all();
  });
  socket.on('newRoundData', async (data) => {
    console.log('match', data.matchNumber);
    let video1Link = data.user1.videoLink;
    let video2Link = data.user2.videoLink;
    let video1Data = await processYoutubeLink(video1Link);
    let video2Data = await processYoutubeLink(video2Link);
    // Get the title of each video
    let video1Title = video1Data.snippet.title;
    let video2Title = video2Data.snippet.title;
    // Generate a round title from the two titles
    data.roundTitle = await abbadabbabotText(`Write a real silly 5 word for a battle between these two youtube videos, try to use something from both video names and/or users ${data.user1.name}'s video ${video1Title} and ${data.user2.name}'s video ${video2Title}`);
    console.log('roundTitle', data.roundTitle);
    // Generate and say the round title
    await gen_and_play_tts( `ATTENTION! A NEW ROUND HAS STARTED! - ${data.roundTitle}`, 'eleven_multilingual_v2');
    // Add the video data to the data object
    data.user1.videoData = video1Data;
    data.user2.videoData = video2Data;
    // Broadcast the new round data to all clients connected to `/finals`
    io.emit('updateFinals', data);
    // Reset the global finalRatings object
    finalRatings.user1 = { average: 0, judges: {} };
    finalRatings.user2 = { average: 0, judges: {} };
  });
  socket.on('toggle_overlay', async () => {
    console.log('toggle_overlay');
    io.emit('toggle_overlay');
  });
  socket.on('finalsRating', async (judgesRating) => {
    console.log('judgesRating', judgesRating);
    // Assign the rating
    finalRatings[judgesRating.userId].judges[judgesRating.judgeId] = judgesRating.rating;
    // Calculate average
    let total = 0, count = 0;
    for (let judge in finalRatings[judgesRating.userId].judges) {
        total += parseFloat(finalRatings[judgesRating.userId].judges[judge]);
        count++;
    }
    finalRatings[judgesRating.userId].average = total / count;
    // Broadcast the new ratings
    io.emit('updateFinalsRatings', finalRatings);
    console.log('finalRatings', finalRatings);
  });
  socket.on('openRating', async (userInfo) => {
    console.log('openRating', userInfo);
    // Let chat know it's time to rate
    client.say(process.env.twitch_channel, `Chat Rating is Open for @${userInfo.username}!`);
  });
  socket.on('generateTTS', async (ttsPrompt) => {
    console.log('generateTTS', ttsPrompt);
    let tts = await abbadabbabotText(ttsPrompt);
    console.log('tts', tts);
    await gen_and_play_tts(tts, 'eleven_turbo_v2');
  });
  socket.on('sayTTS', async (tts) => {
    console.log('sayTTS', tts);
    await gen_and_play_tts(tts, 'eleven_turbo_v2');
  });
  socket.on('playerAction', (data) => {
    console.log('playerAction', data);
    if (data.action === 'closeModal') {
      io.emit('playerAction', data);
    }
    // Broadcast the event to all connected clients except the sender
    socket.broadcast.emit('playerAction', data);
  });
  socket.on('reopen_vid', (data) => {
    socket.broadcast.emit('reopen_vid', data);
  });
  socket.on('blind-ratings', (data) => {
    // Do not allow any more chat ratings
    chatRatingEnabled = false;
  });
  socket.on('pause_tts', (data) => {
    socket.broadcast.emit('pause_tts', data);
  });
  socket.on('play_tts', (data) => {
    socket.broadcast.emit('play_tts', data);
  });
  socket.on('countdown', (data) => {
    console.log('countdown', data);
    socket.broadcast.emit('countdown', data);
  });
});
// Set up Express routes
app.use(express.static("public"));
app.set("view engine", "ejs");
app.get(
  "/youtube",
  basicAuth({
    users: { [process.env.web_user]: process.env.web_pass },
    challenge: true,
  }),
  function (req, res) {
    let yt_count = settings_db.get("youtubes_watched");
    let social_scores = social_scores_db.all();
    let moderation = moderation_db.all();
    let youtube_queue = youtube_db.get("youtube");
    let total_youtube_count = settings_db.get("total_youtubes_watched");
    //make queue empty if null
    if (youtube_queue == null) {
      youtube_queue = [];
    }
    let leaderboard = updateLeaderboard(social_scores);
    //make social_scores empty if null
    if (social_scores == null) {
      social_scores = [];
    }
    //make moderation empty if null
    if (moderation == null) {
      moderation = [];
    }
    res.render("youtube.ejs", {
      youtube: youtube_queue,
      leaderboard: leaderboard,
      moderations: moderation,
      yt_count: yt_count,
      banner_image: process.env.banner_image,
      total_youtube_count: total_youtube_count,
      trophy_users: trophy_users,
      formatDuration: formatDuration,
    });
  }
);
app.get(
  "/youtube_table",
  basicAuth({
    users: { [process.env.web_user]: process.env.web_pass },
    challenge: true,
  }),
  function (req, res) {
    let yt_count = settings_db.get("youtubes_watched");
    let social_scores = social_scores_db.all();
    let moderation = moderation_db.all();
    let youtube_queue = youtube_db.get("youtube");
    let total_youtube_count = settings_db.get("total_youtubes_watched");
    //make queue empty if null
    if (youtube_queue == null) {
      youtube_queue = [];
    }
    let leaderboard = updateLeaderboard(social_scores);
    //make social_scores empty if null
    if (social_scores == null) {
      social_scores = [];
    }
    //make moderation empty if null
    if (moderation == null) {
      moderation = [];
    }
    res.render("youtube_table.ejs", {
      youtube: youtube_queue,
      leaderboard: leaderboard,
      moderations: moderation,
      yt_count: yt_count,
      banner_image: process.env.banner_image,
      total_youtube_count: total_youtube_count,
      trophy_users: trophy_users,
      formatDuration: formatDuration,
    });
  }
);
app.get(
  "/moderate",
  basicAuth({
    users: { [process.env.mod_user]: process.env.mod_pass },
    challenge: true,
  }),
  function (req, res) {
    let yt_count = settings_db.get("youtubes_watched");
    let total_youtube_count = settings_db.get("total_youtubes_watched");
    let social_scores = social_scores_db.all();
    let moderation = moderation_db.all();
    let youtube_queue = youtube_db.get("youtube");
    //make queue empty if null
    if (youtube_queue == null) {
      youtube_queue = [];
    }
    //make social_scores empty if null
    if (social_scores == null) {
      social_scores = [];
    }
    //make moderation empty if null
    if (moderation == null) {
      moderation = [];
    }
    res.render("youtube_mod.ejs", {
      youtube: youtube_queue,
      social_scores: social_scores,
      moderations: moderation,
      yt_count: yt_count,
      banner_image: process.env.banner_image,
      formatDuration: formatDuration,
    });
  }
);
app.get(
  "/guest",
  basicAuth({
    users: { [process.env.guest_user]: process.env.guest_pass },
    challenge: true,
  }),
  function (req, res) {
    res.render("guest_controls.ejs", { username: req.auth.user, password: req.auth.password });
  }
);
app.get(
  "/finals",
  basicAuth({
    users: { [process.env.web_user]: process.env.web_pass },
    challenge: true,
  }),
  function (req, res) {
    res.render("finals.ejs", { username: req.auth.user, password: req.auth.password });
  }
);
app.get(
  "/finals_ratings",
  basicAuth({
    users: { [process.env.guest_user]: process.env.guest_pass },
    challenge: true,
  }),
  function (req, res) {
    res.render("finals_ratings.ejs", { username: req.auth.user, password: req.auth.password });
  }
);
app.get(
  "/finals_producer",
  basicAuth({
    users: { [process.env.web_user]: process.env.web_pass },
    challenge: true,
  }),
  function (req, res) {
    res.render("finals_producer.ejs", { username: req.auth.user, password: req.auth.password });
  }
);
app.get(
  "/generate_guest_login",
  basicAuth({
    users: { [process.env.web_user]: process.env.web_pass },
    challenge: true,
  }),
  async function (req, res) {
    //Get the current logins
    let logins = await login_db.all();
    console.log('logins', logins);
    //make logins empty if null
    if (logins == null) {
      logins = [];
    }
    // send the logins to the page
    res.render("generate_guest_login.ejs", { logins: logins });
  }
);
app.get(
  "/chat_guest",
  basicAuth({
    authorizer: myAsyncAuthorizer,
    authorizeAsync: true,
    challenge: true,
  }),
  function (req, res) {
    console.log('req.auth', req.auth);
    res.render("chat_guest_controls.ejs", { username: req.auth.user, password: req.auth.password });
  }
);
app.get("/social_scores", function (req, res) {
  let social_scores = social_scores_db.all();
  //make social_scores empty if null
  if (social_scores == null) {
    social_scores = [];
  }
  let leaderboard = updateLeaderboard(social_scores);
  res.render("social_score.ejs", {
    leaderboard: leaderboard,
    banner_image: process.env.banner_image,
  });
});
app.get("/chat_rating", function (req, res) {
  res.render("chat_rating.ejs", {
    avg_rating: getAverageRating(),
  });
});
app.get("/chat_rating_10", function (req, res) {
  res.render("chat_rating_10.ejs", {
    avg_rating: getAverageRating10(),
  });
});
app.get("/user_social_scores", function (req, res) {
  let social_scores = social_scores_db.all();
  //make social_scores empty if null
  if (social_scores == null) {
    social_scores = [];
  }
  let leaderboard = updateLeaderboard(social_scores);

  res.render("user_social_scores.ejs", {
    leaderboard: leaderboard,
    banner_image: process.env.banner_image,
  });
});
app.get("/youtube_queue", function (req, res) {
  let yt_count = settings_db.get("youtubes_watched");
  let total_youtube_count = settings_db.get("total_youtubes_watched");
  let youtube_queue = youtube_db.get("youtube");
  //make queue empty if null
  if (youtube_queue == null) {
    youtube_queue = [];
  }
  res.render("youtube_queue.ejs", {
    youtube: youtube_queue,
    yt_count: yt_count,
    banner_image: process.env.banner_image,
  });
});
// Route to serve the historical_youtube.json file
app.get('/historical_youtube', function(req, res) {
  // Set headers to prevent caching
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Read and serve the JSON file
  const filePath = path.join(__dirname, 'db', 'historical_youtube.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(`An error occurred while reading the file: ${err}`);
      res.status(500).send('Internal Server Error');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  });
});
app.get(
  "/ratings",
  async function (req, res) {
    let yt_count = settings_db.get("youtubes_watched");
    let social_scores = social_scores_db.all();
    let total_youtube_count = settings_db.get("total_youtubes_watched");
    let youtube_queue = youtube_db.get("youtube");
    //make queue empty if null
    if (youtube_queue == null) {
      youtube_queue = [];
    }
     // No need to call the YouTube API
    let historical_youtube = historical_youtube_db.all() || [];
    // Filter entries to only include those with all required data fields
    historical_youtube = Object.entries(historical_youtube).reduce((acc, [videoId, entries]) => {
      // Filter out any entries that do not have all the required data
      const completeEntries = entries.filter(entry => 
        entry && 
        entry.username && 
        entry.timestamp && 
        entry.videoThumbnail && 
        entry.videoTitle && 
        entry.videoLink &&
        entry.rating
      );
      
      // Only add to the accumulator if there are complete entries
      if (completeEntries.length > 0) {
        acc[videoId] = completeEntries;
      }
      return acc;
    }, {});

    let leaderboard = updateLeaderboard(social_scores);

    // Ensure social_scores is an array, even if null
    social_scores = social_scores || [];

    res.render("ratings.ejs", {
      historical_youtube: historical_youtube,
      youtube: youtube_queue,
      leaderboard: leaderboard,
      yt_count: yt_count,
      banner_image: process.env.banner_image,
      total_youtube_count: total_youtube_count,
      trophy_users: trophy_users,
    });
  }
);
app.get('/tts', (req, res) => {
  const filePath = __dirname + '/public/audio/output.mp3';
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(filePath);
});
//Bit redeems
client.on("cheer", async (channel, userstate, message) => {
  // Shuffle Bits
  if(userstate.bits == 200 && await settings_db.get("youtube_open")) {
    let message = await abbadabbabotText(`Write the title for a popup alert about ${userstate['display-name']} is pulling that shuffle lever like they're playing slots`);
    io.emit('forced_shuffle', userstate, message);
    console.log('message',message)
    await gen_and_play_tts(message,'eleven_turbo_v2');
  }
  if(userstate.bits == 300 && await settings_db.get("youtube_open")) {
    io.emit('gong_pause_video', userstate);
    io.emit('gong_play_sound', userstate);
    let message = await abbadabbabotText(`Write an announcement that ${userstate['display-name']} hates this video and whoever submitted it.`);
    await gen_and_play_tts(message, 'eleven_turbo_v2');
    console.log('closing video');
    io.emit('gong_close_video', userstate);
    console.log('adding alert');
    io.emit('gong_add_alert', userstate, message);
  }
  if(userstate.bits == 150 && await settings_db.get("youtube_open")) {
    io.emit('dropLowestScore');
    let tts_message = await abbadabbabotText(`Write an announcement that ${userstate['display-name']} has removed the lowest score from the judges for the next video.`);
    await gen_and_play_tts(tts_message,'eleven_turbo_v2');
  }
  if(userstate.bits == 500 && await settings_db.get("youtube_open")) {
    // remove the cheer from the message
    message = message.replace("Cheer500 ", "");

    // Define a regular expression to match URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    // Use the match() method to extract the URL
    const urlMatch = message.match(urlRegex);

    if (urlMatch && urlMatch.length > 0 && await settings_db.get("youtube_open")) {
      const url = urlMatch[0]; // Get the first URL found
      console.log('url', url)
      console.log('userstate', userstate)
      if(checkAndAddYoutube(url, channel, client, userstate, true)) {
        let prompt = `Honor our latest vip ${userstate['display-name']}, and let abba know it has been added to the fast pass queue.`;
        let tts_message = await abbadabbabotText(prompt);

        await gen_and_play_tts(tts_message,'eleven_turbo_v2');
      } else {
        client.say(
          channel,
          `Sorry, @${userstate["display-name"]}, sorry hon, I can't figure out that youtube link. - <3 abbadabbabot`
        );
      }
    }
  }
  console.log('bit redeem',userstate);
  console.log('bit message',message);

});
// Main Twitch bot logic
client.on("message", async (channel, tags, message, self) => {
  // let giveaway = await initializeGiveawayState();

  // Ignore echoed messages.
  if (self) return;
  let isMod = tags.mod || tags["user-type"] === "mod";
  let isBroadcaster = channel.slice(1) === tags.username;
  let isModUp = isMod || isBroadcaster;
  let isSub = tags.subscriber;
  let isVIP = tags.badges && tags.badges.vip === "1";
  if(chatRatingEnabled) {
    getRatingFromChat(message.toLowerCase(),tags["display-name"]);
  }
  //Add youtube vids to the youtubequeue
  //var regex = new RegExp("^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$");
  if (message.toLowerCase().startsWith("http") && await settings_db.get("youtube_open")) {
    //check if it is a youtube link
    if(checkAndAddYoutube(message, channel, client, tags, false)) {
      return;
    } else {
      client.say(
        channel,
        `Sorry, @${tags["display-name"]}, sorry hon, I can't figure out that youtube link. - <3 abbadabbabot`
      );
    }
  }
  if(message.toLowerCase().startsWith("!yttest")) {
    if (isModUp) {
      //remove !test and use the rest as the message.
      message = message.replace("!yttest ", "");

      let abbadabbabotMessage = await abbadabbabotText(message);
      console.log("abbadabbabotMessage", abbadabbabotMessage);
      await gen_and_play_tts(abbadabbabotMessage,'eleven_turbo_v2');
    }
  }
  if(message.toLowerCase().startsWith("!removelowest")) {
    if (isModUp) {
      io.emit('dropLowestScore');
      let tts_message = await abbadabbabotText(`Write an 5 word announcement that ${tags["display-name"]} has removed the lowest score from the judges for the next video.`);
      await gen_and_play_tts(tts_message,'eleven_turbo_v2');
    }
  }
  //Manually create a vip video format !vip {youtube link} {username}
  if(message.toLowerCase().startsWith("!vip")) {
    if (isModUp) {
      //remove !vip and use the rest as the message.
      message = message.replace("!vip ", "");
      //split the message into an array
      let parts = message.split(" ");
      //check if the message has the correct number of parts
      if (parts.length === 2) {
        tags["display-name"] = parts[1];
        //check if it is a youtube link
        if(checkAndAddYoutube(parts[0], channel, client, tags, true, parts[1])) {
          return;
        } else {
          client.say(
            channel,
            `Sorry, @${tags["display-name"]}, sorry hon, I can't figure out that youtube link. - <3 abbadabbabot`
          );
        }
      } else {
        client.say(
          channel,
          `Sorry, @${tags["display-name"]}, sorry hon, I can't figure out that youtube link. - <3 abbadabbabot`
        );
      }
    }
  }
  if(message.toLowerCase().startsWith("!gong")) {
    if (isModUp) {
      let userstate = {};
      userstate['display-name'] = tags["display-name"];
      console.log('pause video');
      io.emit('gong_pause_video', userstate);
      console.log('play sound')
      io.emit('gong_play_sound', userstate);
      console.log('generating the message')
      let message = await abbadabbabotText(`Write an announcement that ${userstate['display-name']} hates this video and whoever submitted it.`);
      console.og('generating tts');
      await gen_and_play_tts(message, 'eleven_turbo_v2');
      console.log('closing video');
      io.emit('gong_close_video', userstate);
      console.log('adding alert');
      io.emit('gong_add_alert', userstate, message);
    }  
  }
  if (message.toLowerCase().startsWith("!open_yt")) {
    //check if mod
    if (isModUp) {
      //set queue_open to true
      await settings_db.set("youtube_open", true);

      //let the chat know the queue is open
      abbadabbabotSay(
        channel,
        client,
        tags,
        `Announce that @${tags["display-name"]} has opened the youtube queue! Any youtube links in chat will be added to the queue in a short sentence.`,
        "",
        "- The youtube queue is now open! Add your links now!"
      );
    }
  }
  if (message.toLowerCase().startsWith("!close_yt")) {
    //check if mod
    if (isModUp) {
      //set queue_open to false
      await settings_db.set("youtube_open", false);
      client.say(
        channel,
        `@${tags["display-name"]} has closed the youtube queue!`
      );
    }
  }
  if (message.toLowerCase() === "!vip") {
      abbadabbabotSay(
        channel,
        client,
        tags,
        `Let @${tags["display-name"]} know if they really want Abba to watch their video all they gotta do is fork over 1200 bits with a link and it'll go into the VIP queue.`,
        '',
        '- 1200 bits, skip the line! Just put your link with your cheer.'
      );
  }
  if (message.toLowerCase() === "!clear_yt") {
    // Check if mod
    if (isModUp) {
      // Get the current youtube queue
      var current_youtube = await youtube_db.get("youtube");
      if (current_youtube == null) {
        current_youtube = [];
      }
  
      // Loop through each youtube video in queue and refund the tokens
      for (let video of current_youtube) {
        await addUserTokens(video.user, 1); 
      }
  
      // Clear the youtube queue
      youtube_db.clear();
      settings_db.set("youtubes_watched", 0);
  
      abbadabbabotSay(
        channel,
        client,
        tags,
        "formally announce the clearing of the youtube queue and refund of all Abbacoins to the chat"
      );
    }
  }
  
  if (message.toLowerCase().startsWith("!chat_rating")) {
      // check if mod
      if (isModUp) {
          let chat_rating = getAverageRating();
          abbadabbabotSay(
            channel,
            client,
            tags,
            `Formally announce that chat's average rating is ${chat_rating} out of 4`,
            "",
            `- Chat's avg rating ${chat_rating}`
          );
      }
  }

  if (message.toLowerCase().startsWith("!max_vids")) {
    // check if mod
    if (isModUp) {
      const parts = message.split(' ');
      if (parts.length > 1) {
        const newValue = parseInt(parts[1]);
        if (!isNaN(newValue)) { // Check if a number was provided after the command
          max_vids_per_user = newValue;
          abbadabbabotSay(
            channel,
            client,
            tags,
            `Let chat know The max_vids_per_user value has been set to ${max_vids_per_user}`
          );
        } else {
          abbadabbabotSay(
            channel,
            client,
            tags,
            `Let chat know there is an Invalid command usage. Please provide a number after !set_max`
          );
        }
      } else {
        abbadabbabotSay(
          channel,
          client,
          tags,
          `Let chat know there is an Invalid command usage. Please provide a number after !set_max`
        );
      }
    }
  }
  
  if (message.toLowerCase() === "!social_scores") {
    //return page with list of queue
    abbadabbabotSay(
      channel,
      client,
      tags,
      `Announce to @${tags["display-name"]} that they can see their social score:`,
      "",
      " " + process.env.socialscore_list_url
    );
  }
  if (message.toLowerCase() === "!yt_queue") {
    //return page with list of youtube queue
    abbadabbabotSay(
      channel,
      client,
      tags,
      `Tell @${tags["display-name"]} that they can see the current youtube queue themselves.`,
      "",
      " " + process.env.youtube_list_url
    );
  }
  if (message.toLowerCase() === "!yt_history") {
    //return page with list of youtube queue
    abbadabbabotSay(
      channel,
      client,
      tags,
      `Tell @${tags["display-name"]} that they can see every youtube video ever played themselves.`,
      "",
      " " + process.env.youtube_history_url
    );
  }
  if (message.toLowerCase() === "!myscore") {
    const social_scores = await social_scores_db.all(); // get social_scores object
    // get leaderboard. 
    let current_leaderboard = updateLeaderboard(social_scores);
    // get this user
    let this_user = current_leaderboard.find(user => user.user === tags["display-name"]);
    // get their ranking
    const rank = current_leaderboard.findIndex(user => user.user === tags["display-name"]) + 1;

    if (!this_user) {
      abbadabbabotSay(
        channel,
        client,
        tags,
        `tell @${tags["display-name"]}, you have no social score ratings yet. In a short sentence`,
        "",
        `- ${tags["display-name"]} has no social score ratings`
      );
    } else {
      const reply = `tell @${
        tags["display-name"]
      }, your weighted score is ${this_user.weightedRating.toFixed(4)} based on ${this_user.numRatings} ratings. You are ranked #${rank} among all users. In a short sentence`;
      abbadabbabotSay(
        channel,
        client,
        tags,
        reply,
        "",
        `- @${tags["display-name"]}: weighted score: ${this_user.weightedRating.toFixed(4)} based on ${this_user.numRatings} ratings. rank: #${rank}`
      );
    }
  }
  //toggle ai_enabled mode
  if (message.toLowerCase() === "!toggle_ai") {
    //check if mod
    if (isModUp) {
      //toggle ai_enabled
      ai_enabled = !ai_enabled;
      // set string for current status of ai_enabled
      var ai_enabled_status = ai_enabled ? "enabled" : "disabled";
      //let the chat know what is up
      abbadabbabotSay(
        channel,
        client,
        tags,
        `Let chat know AI is now ${ai_enabled_status}.`
      );
    }
  }
  // Open the giveaway
  if (message.toLowerCase().startsWith("!open_giveaway") && isModUp) {
    const parts = message.split('|');
    if (parts.length === 2) {
      giveaway.tokens = parseInt(parts[0].split(' ')[1]);
      giveaway.secretWord = parts[1];
      giveaway.isOpen = true;
      await saveGiveawayState(giveaway);
      await abbadabbabotSay(
        channel,
        client,
        tags,
        `Let chat know an Abbacoin giveaway is now open. The secret word is "${giveaway.secretWord}" and ${giveaway.tokens} Abbacoin is up for grabs. in a short sentence or two`,
        '',
        `- Type "${giveaway.secretWord}" in chat to get ${giveaway.tokens} Abbacoin`
      );
    }
  }
  /*
  // Participate in the giveaway
  if (giveaway.isOpen && message.includes(giveaway.secretWord) && !message.toLowerCase().startsWith("!open_giveaway")) {
    console.log('giveaway open:',giveaway);
    // Check if the user has already entered the giveaway
    const existingParticipants = await giveaway_db.get('giveaway') || [];
    const hasEntered = existingParticipants.some(participant => participant.username === tags.username);

    if (!hasEntered) {
      // Add the user to the giveaway
      const newParticipant = { username: tags.username, timestamp: Date.now() };
      existingParticipants.push(newParticipant);
      await giveaway_db.set('giveaway', existingParticipants);
      client.say(channel, `@${tags.username} has said the secret word!`);
    }
  }
  */

  // Close the giveaway
  if (message.toLowerCase() === "!close_giveaway" && isModUp && giveaway.isOpen) {
    abbadabbabotSay(
        channel,
        client,
        tags,
        `Let chat know the Abbacoin giveaway is now closed. Abbacoin will be awarded shortly. In just a sentence.`
    );
    const participants = await giveaway_db.get('giveaway');
    if (participants) {
      // Use Promise.all with map to wait for all promises to resolve
      await Promise.all(participants.map(async (participant) => {
        console.log('giveaway on close:', giveaway);
        let add_tokens_obj = await addUserTokens(participant.username, giveaway.tokens);
        client.say(channel, `@${participant.username} has earned ${giveaway.tokens} Abbacoin - Abbacoin Balance - ${add_tokens_obj.balance}`);
        console.log('giveaway2:', giveaway);
      }));
    }
    giveaway_db.clear();
    giveaway = { isOpen: false, tokens: 0, secretWord: null };
  }
  // Check Abbacoin balance
  if (message.toLowerCase() === "!check_abbacoin" || message.toLowerCase() === "!abbacoin" || message.toLowerCase() === "!abbacoins") {
    const username = tags.username; // Assuming tags.username contains the username
    const userTokens = await checkUserTokens(username);

    if (userTokens.new_wallet) {
      abbadabbabotSay(
          channel,
          client,
          tags,
          `Let @${username} know, they have been gifted their first tokens! Their current Abbacoin balance is ${userTokens.balance}, in a short sentence.`,
          '',
          ` Abbacoin balance: ${userTokens.balance}`
      );
    } else {
      abbadabbabotSay(
          channel,
          client,
          tags,
          `Let @${username} know, their current Abbacoin balance is ${userTokens.balance}, in a short sentence.`,
          '',
          ` Abbacoin balance: ${userTokens.balance}`
      );
    }
  }
  // Command to give coins to a user
  if (message.toLowerCase().startsWith("!givecoins")) {
    // Extract the command arguments
    const parts = message.split(" ");
    if (parts.length === 3) {
      const targetUser = parts[1].replace("@", "");  // Remove '@' if included
      const coinsToAdd = parseInt(parts[2]);

      // Check if the user invoking the command is a moderator or broadcaster
      if (tags.mod || tags.username === channel.slice(1)) {
        if (!isNaN(coinsToAdd)) {  // Validate that the coins amount is a number
          let userTokens = await tokens_db.get(targetUser.toLowerCase()) || 0;  // Get current tokens or default to 0
          userTokens += coinsToAdd;  // Add coins
          await tokens_db.set(targetUser.toLowerCase(), userTokens);  // Update the database
          abbadabbabotSay(
              channel,
              client,
              tags,
              `Let @${targetUser} know, they have been given ${coinsToAdd}, in a short sentence.`,
              '',
              ` Abbacoin balance: ${userTokens}`
          );
        } else {
          client.say(channel, "Invalid amount of coins specified. Please enter a number.");
        }
      }
    } else {
      client.say(channel, "Usage: !givecoins <username> <coins>");
    }
  }
}); // End Chatbot

// Helper functions
function removeURLs(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g, "");
}

function ordinal_suffix_of(i) {
  var j = i % 10,
    k = i % 100;
  if (j == 1 && k != 11) {
    return i + "st";
  }
  if (j == 2 && k != 12) {
    return i + "nd";
  }
  if (j == 3 && k != 13) {
    return i + "rd";
  }
  return i + "th";
}

function ytVidId(url) {
  var match = url.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:(?:youtube\.com\/(?:watch\?v=|embed\/|clip\/)|(?:youtu\.be|youtube\.com\/shorts)\/))([\w-]+)/
  );
  return match ? match[1] : false;
}

// Get system_text_string from env
const system_text_string = process.env.openai_system_text_string;
let messageArray = [{ role: "system", content: system_text_string }];

async function abbadabbabotSay(
  channel,
  client,
  tags,
  message,
  prefix = "",
  postfix = ""
) {
  console.log("ai_enabled", ai_enabled);
  if (ai_enabled) {
    const messageContent = `${tags.username}: ` + message;
    const newMessage = {
      role: "user",
      content: messageContent,
    };

    // Separate the "system" messages from the rest
    const systemMessages = messageArray.filter(message => message.role === "system");
    const otherMessages = messageArray.filter(message => message.role !== "system");

    // Trim the non-system messages to the desired length
    while (otherMessages.length > ai_memory_limit) {
      otherMessages.shift(); // Remove the oldest non-system message
    }

    // Combine the system messages with the trimmed non-system messages
    messageArray = [...systemMessages, ...otherMessages];
    messageArray.push(newMessage);
    console.log("trimmed messageArray:", messageArray);

    try {
      const response = await openai.createChatCompletion({
        model: openai_chatbot_model_id,
        messages: messageArray,
        temperature: 1.25,
        frequency_penalty: 1.0,
        presence_penalty: 1.0,
        user: tags.username,
      });
      const censored_response = removeURLs(
        censor.cleanProfanity(
          response.data.choices[0]["message"]["content"].trim()
        )
      )
        .replace(/^Abbadabbabot: /, "")
        .replace(/^"|"$/g, "");

      const newResponse = {
        role: "assistant",
        content: censored_response,
      };
      messageArray.push(newResponse);

      client.say(channel, prefix + censored_response + postfix);
      return Promise.resolve("resolved")
    } catch (error) {
      ai_enabled = false;
      if (error.response) {
        console.log(error.response.status);
        console.log(error.response.data);
        error = error.response.status;
      } else {
        console.log(error.message);
        error = error.message;
      }
      client.say(
        channel,
        prefix + "- ai offline - " + "prompt: " + message + postfix
      );
      return Promise.resolve("resolved")
    }
  } else {
    client.say(
      channel,
      prefix + "- ai offline - " + "prompt: " + message + postfix
    );
    return Promise.resolve("resolved")
  }
}

function say(channel, client, tags, message, prefix = "", postfix = "") {
  client.say(channel, prefix + message + postfix);
  return Promise.resolve("resolved")
}
async function abbadabbabotText(message) {
  console.log("ai_enabled", ai_enabled);
  if (ai_enabled) {
    const messageContent = `user: ` + message;
    const newMessage = {
      role: "user",
      content: messageContent,
    };

    // Separate the "system" messages from the rest
    const systemMessages = messageArray.filter(message => message.role === "system");
    const otherMessages = messageArray.filter(message => message.role !== "system");

    // Trim the non-system messages to the desired length
    while (otherMessages.length > ai_memory_limit) {
      otherMessages.shift(); // Remove the oldest non-system message
    }

    // Combine the system messages with the trimmed non-system messages
    messageArray = [...systemMessages, ...otherMessages];
    messageArray.push(newMessage);
    console.log("trimmed messageArray:", messageArray);

    try {
      const response = await openai.createChatCompletion({
        model: openai_chatbot_model_id,
        messages: messageArray,
        temperature: 1.25,
        frequency_penalty: 1.0,
        presence_penalty: 1.0,
        user: 'user',
      });
      const censored_response = removeURLs(
        censor.cleanProfanity(
          response.data.choices[0]["message"]["content"].trim()
        )
      )
        .replace(/^Abbadabbabot: /, "")
        .replace(/^"|"$/g, "");

      const newResponse = {
        role: "assistant",
        content: censored_response,
      };
      messageArray.push(newResponse);

      return censored_response;
    } catch (error) {
      ai_enabled = false;
      if (error.response) {
        console.log(error.response.status);
        console.log(error.response.data);
        error = error.response.status;
      } else {
        console.log(error.message);
        error = error.message;
      }
      return "- ai offline - " + "prompt: " + message;
    }
  } else {
    return "- ai offline - " + "prompt: " + message;
  }
}
function formatDuration(duration) {
  if (!duration) return "00:00"; // Return '00:00' when duration is null or undefined

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

function average_rating_of_all_users(social_scores) {
  let totalRatings = 0;
  let totalUsers = 0;

  for (const scores of Object.values(social_scores)) {
    totalRatings += scores.map(Number).reduce((a, b) => a + b, 0);
    totalUsers += scores.length;
  }

  return totalRatings / totalUsers;
}

// Function to extract and store ratings from chat messages
function getRatingFromChat(message, username) {
  const regex = /\b([0-3](\.\d{1,4})?|4(\.0{1,4})?)\b/g;
  const matches = message.match(regex);
  
  if (matches !== null) {
    const rating = parseFloat(matches[0]);
    if (rating >= 0 && rating <= 4) {
      // Check if the user has already rated
      const existingRatingIndex = chatRatings.findIndex(r => r.username === username);
      if (existingRatingIndex !== -1) {
        // Update existing rating
        chatRatings[existingRatingIndex].rating = rating;
      } else {
        // Add new rating
        chatRatings.push({ username, rating });
      }
      console.log(`Collected rating from ${username}: ${rating}`);
      io.emit("chatScore", getAverageRating());
      io.emit("average_chat_rating", getAverageRating());
      io.emit("new_chat_rating", [{ username: username, rating: Math.round(rating * 4) / 4 }]);
    }
  }
}

// Function to calculate the average rating
function getAverageRating() {
  if (chatRatings.length === 0) {
    return 0;
  }
  const sum = chatRatings.reduce((total, r) => total + r.rating, 0);
  const average = sum / chatRatings.length;
  // Round to nearest .25
  return Math.round(average * 4) / 4;
  // Round to 4 decimal places
}

async function checkUserTokens(username) {
  username = username.toLowerCase();

  let user_tokens = await tokens_db.get(username);
  let user_tokens_object = {
    balance: user_tokens,
    new_wallet: false
  }
  if (user_tokens == null) {
      console.log('gift first tokens');
      await tokens_db.set(username, starting_balance);
      user_tokens = starting_balance;  
      user_tokens_object.balance = starting_balance;
      user_tokens_object.new_wallet = true

  }
  console.log('user_tokens_object: ',user_tokens_object);
  return user_tokens_object;
}
async function addUserTokens(username,tokens_to_add) {
  username = username.toLowerCase();

  // Get the user's tokens
  let user_tokens = await tokens_db.get(username);
  // Setup the response object
  let user_tokens_object = {
    balance: user_tokens,
    tokens_added: tokens_to_add
  }
  //If they don't have any tokens give them the starting balance
  if (user_tokens === null) {
      console.log('new wallet');
      //Set balance for the user
      await tokens_db.set(username, starting_balance);
      //Update the balance object
      user_tokens_object.balance = starting_balance;
  }
  //Now add the tokens to the add to their balance
  await tokens_db.math(username, 'add', tokens_to_add);
  //Update the response object
  user_tokens_object.balance = user_tokens_object.balance + tokens_to_add;

  console.log('user_tokens_object: ',user_tokens_object);
  return user_tokens_object;
}
async function spendUserToken(username) {
  username = username.toLowerCase();

  let user_tokens = await checkUserTokens(username);

  // Check if the user has more than 0 tokens
  if (user_tokens.balance > 0) {
    // Attempt to subtract one token from the user's balance
    let success = await tokens_db.math(username, 'subtract', 1);

    if (success) {
      // Update the user's token balance
      user_tokens = await checkUserTokens(username);

      let token_spend_object = {
        message: "Token has been spent successfully.",
        tokens_spent: 1,
        balance: user_tokens.balance // Reflect the updated balance
      };

      return token_spend_object;
    } else {
      // Handle the case where the subtraction operation failed
      let token_spend_object = {
        message: "Failed to spend token. Please try again.",
        tokens_spent: 0,
        balance: user_tokens.balance
      };

      return token_spend_object;
    }
  } else {
    // If the user has 0 or fewer tokens, return an error message
    let token_spend_object = {
      message: "You don't have enough tokens to spend.",
      tokens_spent: 0,
      balance: user_tokens.balance
    };

    return token_spend_object;
  }
}

async function initializeGiveawayState() {
  let giveaway_state = await settings_db.get("giveaway");

  if (giveaway_state === null) {
    // Define the default giveaway state
    const defaultGiveawayState = {
      isOpen: false,
      tokens: 0,
      secretWord: "",
    };

    // Save the default giveaway state to the database
    await settings_db.set("giveaway", defaultGiveawayState);

    return defaultGiveawayState;
  }
  
  return giveaway_state;
}

async function saveGiveawayState(giveaway_state) {
  await settings_db.set("giveaway", giveaway_state);
}
function weighted_rating(avgScore, numRatings, m, C, adjustmentFactor = 1) {
  return (
    ((numRatings / (numRatings + m)) * avgScore + (m / (numRatings + m)) * C) * adjustmentFactor
  );
}
async function resetScores() {
  // Step 1: Retrieve the existing social scores from the database
  let social_scores = await social_scores_db.all();

  // Step 2: Calculate the updated leaderboard
  let leaderboard = updateLeaderboard(social_scores);

  // Step 3: For each user, replace their saved scores with the new weighted rating
  for (let userEntry of leaderboard) {
    let { user, weightedRating } = userEntry;
    // Replace the user's scores array with an array containing only the weightedRating
    await social_scores_db.set(user, [weightedRating]);
  }

  console.log("All user scores have been reset to their current social scores.");
}

// Call the resetScores function once to perform the reset
//resetScores();
/*
function updateLeaderboard(social_scores) {
  const leaderboard = Object.entries(social_scores)
    .map(([user, scores]) => {
      const avgScore =
        scores.map(Number).reduce((a, b) => a + b, 0) / scores.length;
      const numRatings = scores.length;

      // Calculate the average of the last 3 scores
      const recentScores = scores.slice(-3);
      const recentAvg =
        recentScores.reduce((a, b) => a + b, 0) / (recentScores.length || 1); // Avoid division by zero

      // Determine the adjustment factor based on the difference
      let adjustmentFactor = 1; // No change by default
      if (recentAvg > avgScore * 1.1 || recentAvg < avgScore * 0.9) {
        adjustmentFactor = 1.1; // Magnify the rating by 10%
      }

      // Apply the adjustment factor to the average score
      const adjustedAvgScore = avgScore * adjustmentFactor;

      // For consistency, we can still call it 'weightedRating'
      const weightedRating = adjustedAvgScore;

      return { user, avgScore, numRatings, weightedRating };
    })
    .sort((a, b) => b.weightedRating - a.weightedRating);

  return leaderboard;
}
*/
function updateLeaderboard(social_scores) {
  const m = 10; // Lower m value for demonstration
  const C = average_rating_of_all_users(social_scores); // Assuming this function is defined elsewhere
  //const C = 1;
  const leaderboard = Object.entries(social_scores)
    .map(([user, scores]) => {
      const avgScore =
        scores.map(Number).reduce((a, b) => a + b, 0) / scores.length;
      const numRatings = scores.length;

      // Calculate the average of the last 3 scores
      const recentScores = scores.slice(-3);
      const recentAvg =
        recentScores.reduce((a, b) => a + b, 0) / (recentScores.length || 1); // Avoid division by zero

      // Determine the adjustment factor based on the difference
      let adjustmentFactor = 1; // No change by default
      if (recentAvg > avgScore * 1.1 || recentAvg < avgScore * 0.9) {
        adjustmentFactor = 1.1; // Magnify the rating by 10%
      }

      // Apply the adjustment factor in the weighted rating calculation
      const weightedRating = weighted_rating(avgScore, numRatings, m, C, adjustmentFactor);
      return { user, avgScore, numRatings, weightedRating };
    })
    .sort((a, b) => b.weightedRating - a.weightedRating);

  return leaderboard;
}

async function getJSONStringFromHTML(html) {
  const startToken = '">var ytInitialData = ';
  const endToken = ';</script>';
  const startIndex = html.indexOf(startToken) + startToken.length;
  const endIndex = html.indexOf(endToken, startIndex);
  return html.substring(startIndex, endIndex);
}

async function getJSONFromHTML(url) {
  try {
    const response = await axios.get(url);
    const html = response.data;
    const jsonString = await getJSONStringFromHTML(html);
    //write to file
    fs.writeFileSync('./public/youtube_test.json', jsonString);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error fetching or parsing data:', error);
    return null;
  }
}

async function getVideoDetails(videoIds) {
  const response = await youtube.videos.list({
    part: 'snippet',
    id: videoIds.join(',') // Join video IDs into a comma-separated string
  });
  return response.data.items;
}

async function myAsyncAuthorizer(username, password, cb) {
  let logins = await login_db.all();
  let authorized = false;

  for (let user in logins) {
      const userMatches = basicAuth.safeCompare(username, user);
      const passwordMatches = basicAuth.safeCompare(password, logins[user]);

      if (userMatches & passwordMatches) {
          authorized = true;
          break;
      }
  }

  cb(null, authorized, username, password);
}

async function gen_and_play_tts(message,model='eleven_multilingual_v2') {
  const voiceResponse = voice.textToSpeech({
    // Required Parameters
    textInput:       message,                // The text you wish to convert to speech
    fileName:        `./public/audio/output.mp3`,       // The filename to save the audio to
    // Optional Parameters
    stability:       0.3,                            // The stability for the converted speech
    similarityBoost: 0.9,                            // The similarity boost for the converted speech
    modelId:         model,                          // The ElevenLabs Model ID
    style:           0.3,                            // The style exaggeration for the converted speech
    responseType:    "stream",                       // The streaming type (arraybuffer, stream, json)
    speakerBoost:    true                            // The speaker boost for the converted speech
  }).then((res) => {
    //res.pipe(fs.createWriteStream(`./public/audio/output.mp3`));
    console.log('tts done');
    io.emit("play_tts", message);
  });
} 

async function check_socket_auth(userinfo){
    // First check against the .env user pass

    // Make sure the username and password exist in the logins or that it has the password and trusted
    if (!userinfo.username || !userinfo.password) {
      console.log('Username or password missing from login attempt');
        return false;
    } else {
      console.log('logins', validLogins);
      // First check against the logins from the .env file
      if (userinfo.trusted === true && userinfo.password === process.env.guest_pass) {
        console.log('trusted login');
        return true;
      }
      // Check if the username and password exist in the logins 
      if (validLogins[userinfo.username] !== userinfo.password) {
        console.log('Username or password incorrect');
        return false;
      }
    }
    return true;
}

async function processYoutubeLink(link){   	
	const videoId = ytVidId(link);
  console.log('videoId',videoId);
	if (videoId) {
		let isClip = /[a-zA-Z0-9-_]{36}/.test(videoId);
		let realVideoId = videoId;
    console.log('isClip',isClip);
		if (isClip) {
			try {
				const json = await getJSONFromHTML(`https://www.youtube.com/clip/${videoId}`);
				realVideoId = json.currentVideoEndpoint.watchEndpoint.videoId;
        console.log('clipInfo',json);
			} catch (error) {
				console.log('Error fetching real video ID:', error);
				return;
			}
		}   

    if (realVideoId) {
      try {
          const res = await youtube.videos.list({
              part: "snippet,contentDetails",
              id: realVideoId,
          });
          const video = res.data.items[0];
          if (!video) {
              console.log("Video not found");
              return;
          }
          return video;
      } catch (err) {
          console.log(err);
          return;
      }
    }
  }
}

async function checkAndAddYoutube(message, channel, client, tags, vip = false) {
  const videoId = ytVidId(message);
  console.log('videoId:',videoId);
  let startTime = 0;
  let endTime = 0;
  const url = new URL(message);

  // Check if videoId is not false
  const historical_video_exists = videoId ? historical_youtube_db.has(videoId) : false;
  const current_youtube = await youtube_db.get("youtube") || [];

  // Function to remove a video if it's a VIP video and the same user case insensitive
  async function removeVipVideoIfExists(videoId, username) {
      const index = current_youtube.findIndex(video => video.video.id === videoId && video.user.toLowerCase() === username.toLowerCase());
      if (index !== -1) {
          console.log("VIP video found and removed from the queue");
          await addUserTokens(current_youtube[index].user, 1); // Refund tokens
          current_youtube.splice(index, 1);
          await youtube_db.set("youtube", current_youtube);
          io.emit("youtube_remove", videoId);
          return true;
      } else {
          return false;
      }
  }

  if (vip) {
      if (await removeVipVideoIfExists(videoId, tags["display-name"])) {
          console.log("VIP video processed and removed");
      }
  }

  // Re-check for duplicates after potential VIP removal
  const youtube_queue_exists = current_youtube.some(obj => obj.video.id === videoId);

  if (historical_video_exists || youtube_queue_exists) {
      console.log("video exists");
      abbadabbabotSay(
          channel,
          client,
          tags,
          `Ask @${tags["display-name"]} why they added a video we've already seen, in a funny way. In only 6 words.`,
          "",
          "- Vid already played"
      );
      return false;
  } else {
      if (videoId) {
          let isClip = /[a-zA-Z0-9-_]{36}/.test(videoId);
          let realVideoId = videoId;

          if (isClip) {
              try {
                  const json = await getJSONFromHTML(`https://www.youtube.com/clip/${videoId}`);
                  realVideoId = json.currentVideoEndpoint.watchEndpoint.videoId;
                  startTime = Math.round(json.engagementPanels[1].engagementPanelSectionListRenderer.content.clipSectionRenderer.contents[0].clipAttributionRenderer.onScrubExit.commandExecutorCommand.commands[3].openPopupAction.popup.notificationActionRenderer.actionButton.buttonRenderer.command.commandExecutorCommand.commands[1].loopCommand.startTimeMs / 1000);
                  endTime = Math.round(json.engagementPanels[1].engagementPanelSectionListRenderer.content.clipSectionRenderer.contents[0].clipAttributionRenderer.onScrubExit.commandExecutorCommand.commands[3].openPopupAction.popup.notificationActionRenderer.actionButton.buttonRenderer.command.commandExecutorCommand.commands[1].loopCommand.endTimeMs / 1000);
              } catch (error) {
                  console.log('Error fetching real video ID:', error);
                  return false;
              }
          }

          const timestamp = url.searchParams.get("t");
          if (timestamp) {
              startTime = timestamp;
          }

          youtube.videos.list({
              part: "snippet,contentDetails",
              id: realVideoId,
          }, async (err, res) => {
              if (err) {
                  console.log(err);
                  return;
              }
              const video = res.data.items[0];
              if (!video) {
                  console.log("Video not found");
                  return;
              }

              let username = tags["display-name"];
              if (!vip) {
                  let user_tokens = await checkUserTokens(username);
                  if (user_tokens.new_wallet) {
                      await abbadabbabotSay(
                          channel,
                          client,
                          tags,
                          `Tell @${username} that they have been gifted ${user_tokens.balance} Abbacoins for Abbabox's World Famous Free Media Share, in a short sentence.`,
                          "",
                          `- Abbacoin balance: ${user_tokens.balance}`
                      );
                  }
                  if (user_tokens.balance <= 0) {
                      abbadabbabotSay(
                          channel,
                          client,
                          tags,
                          `Sorry, @${username}, you don't have enough Abbacoin to add a video.`,
                          "",
                          `- Out of Abbacoin`
                      );
                      return false;
                  }
              }

              const user_videos = current_youtube.filter(video => (video.vip === undefined || video.vip === false) && video.user === tags["display-name"]);
              if (user_videos.length >= max_vids_per_user && !vip) {
                  abbadabbabotSay(
                      channel,
                      client,
                      tags,
                      `Tell @${tags["display-name"]}, you can only have ${max_vids_per_user} video in the queue at a time in a short sentence.`,
                      "",
                      `- ${max_vids_per_user} Max Vids in queue`
                  );
                  return false;
              } else {
                  const youtube_request = {
                      user: tags["display-name"],
                      video: video,
                      vip: vip,
                      link: message,
                      moderated: false,
                      length: isClip ? 'PT1M' : video.contentDetails.duration,
                      startTime: startTime,
                      endTime: endTime,
                  };
                  current_youtube.push(youtube_request); // Add to queue before updating the database
                  await youtube_db.set("youtube", current_youtube); // Update database
                  let user_tokens = {};
                  let video_message = '';
                  if (!vip) {
                      user_tokens = await spendUserToken(username);
                      video_message = `tell @${tags["display-name"]} their youtube video has been added to the queue in a short sentence`;
                  } else {
                      video_message = `tell @${tags["display-name"]} their VIP youtube video has been added to the queue in a short sentence`;
                      user_tokens = { balance: 'Free VIP Vid' };
                  }
                  abbadabbabotSay(
                      channel,
                      client,
                      tags,
                      video_message,
                      "",
                      `- Vid added | Abbacoin balance: ${user_tokens.balance}`
                  );
                  io.emit("youtube_added", youtube_request);
                  return true;
              }
          });
      }
  }
}


function formatRatingObj(ratingObj, videoRecord) {
  
  const embed = {
    embeds: [{
      title: `Rating for **${ratingObj.username}**`,
      description: `**Video Title:** ${videoRecord.videoTitle}\n**Total Rating:** ${ratingObj.rating}\n[Watch Video](${videoRecord.videoLink})\n[Current Leaderboard](https://youtube-queue.glitch.me/user_social_scores)`,
      url: videoRecord.videoLink,
      color: 0xFFFFFF,
      thumbnail: {
        url: "https://img.kevnet.cloud/i/9bcec13f-dade-40d2-88e4-f8946ec63791.png"
      },
      image: {
        url: videoRecord.videoThumbnail
      },
      fields: []
    }]
  };
  
  for (const guest of ratingObj.guests) {
    embed.embeds[0].fields.push({
      name: `**Judge:** ${guest.guestName}`,
      value: `**Rating:** ${guest.rating}`,
      inline: true
    });
  }

  return embed;
}

function sendToDiscord(webhookURL, message) {
  console.error("send to discord");
  const data = JSON.stringify(message);

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)  // Use Buffer.byteLength for accurate byte count
    }
  };

  const req = https.request(webhookURL, options, (res) => {
    res.on('data', (d) => {
      process.stdout.write(d);
    });
    res.on('end', () => {
      console.log('HTTP status:', res.statusCode);  // Log the status code on completion
    });
  });

  req.on('error', (error) => {
    console.error(error);
  });

  req.write(data);
  req.end();
}
