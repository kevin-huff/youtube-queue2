# Youtube Queue

Youtube Queue is a Twitch Bot built for the purpose of free media sharing. It manages a YouTube video queue, interacts with users, and handles social scores. The bot is written in JavaScript and uses a variety of libraries including `tmi.js`, `socket.io`, `express`, `ejs`, and `dotenv` among others.

## Features

- YouTube queue management: Open or close the queue, remove entries, and list queued videos.
- Social scores: The streamer rates every video, and each user has their own Social Score based off these ratings.
- AI capabilities: Toggles the AI functionality and uses AI to generate interactive responses.
- Twitch interaction: Listens for specific commands in Twitch chat and performs corresponding actions.
- When active watches chat messages for ratings in messages (any numbers 0-4 in any message in chat) and calculates chat's average rating. Each user's rating is only counted once.
- Moderation queue: A simple dashboard for trusted moderators to upvote, downvote, or delete videos from the queue. Will update the streamer's dashboard in real-time.

## Chat Commands

The bot listens for the following commands in Twitch chat:

- `!open_yt` - Opens the YouTube queue. (Only available to moderators)
- `!close_yt` - Closes the YouTube queue. (Only available to moderators)
- `!clear_yt` - Clears the YouTube queue. (Only available to moderators)
- `!max_vids $num` - Set's the max vids per user allowed in the queue to `$num` (Only available to moderators)
- `!social_scores` - Shows the URL where users can see their social score.
- `!list_yt` - Shows the URL where users can see the YouTube queue list.
- `!myscore` - Shows the user's social score, rank, and rating based on the weighted score.
- `!toggle_ai` - Toggles the AI functionality. (Only available to moderators)
- `!chat_avg` - Shows the current avg rating found in chat.

## Prerequisites

To use Youtube Queue, ensure that you have the following installed:

- [Node.js](https://nodejs.org/) (version 16 or newer)

You need the following creds:

- [OpenAI API Key](https://platform.openai.com/account/api-keys) - For AI Responses
- [Twitch OAuth](https://twitchapps.com/tmi/) - For Chatbot
- [Youtube Data API Key](https://developers.google.com/youtube/registering_an_application) - To get video information

## Quickstart

If you want to get started quickly feel free to remix my [glitch app](https://glitch.com/edit/#!/youtube-queue).

## Installation

Clone the repository to your local machine:

```
git clone https://github.com/kevin-huff/youtube_queue.git
```

Change to the project directory:

```
cd youtube_queue
```

Install the dependencies:

```
npm install
```

## Usage

Rename `.env.example` file in the root directory of your project to `.env`. Add the required environment-specific variables.

Run the application:

```
npm start
```

- Visit `http://localhost:3000/youtube` and use the credntials you provided in your environment variables to interact with the application.
- Use `!open_yt` to open the youtube queue
- Any valid youtube link sent in chat will automaticlly get added to the queue.
- Use the `/youtube` page to shuffle, sort, play, delete, and rate the user's videos

## Web Pages

The application includes several pages:

- `/youtube` - Queue Management page - for viewing and rating videos
- `/social_scores` - On Screen Leaderboard - use as browser source
- `/user_social_scores` - User Accessable Leaderboard
- `/youtube_queue` - User Accessable Queue List
- `/moderate` - Moderation queue for trusted users to moderate videos in the queue.
- `/chat_rating` - On screen element showing chat's average rating. Updates as vids are watched and when the streamer rates a video.

## Helper Methods

The code includes several helper methods, including:

- `removeURLs(text)`: Removes URLs from text.
- `ordinal_suffix_of(i)`: Returns an ordinal (1st, 2nd, 3rd) format for a given integer.
- `ytVidId(url)`: Extracts the video ID from a YouTube video URL.
- `abbadabbabotSay(...)`: Generates AI-assisted responses using OpenAI's GPT-3.5 Turbo model to interact with users in the Twitch chat.
- `formatDuration(duration)`: Formats a YouTube video duration string into a more human-readable format.
- `weighted_rating(avgScore, numRatings, m, C)`: Calculates weighted ratings for social scores.
- `average_rating_of_all_users(social_scores)`: Computes the average rating of all users.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[Unlicense](https://unlicense.org)

## Support

If you have any issues or enhancement requests, feel free to report them via the repository's issue tracker: [https://github.com/kevin-huff/youtube_queue/issues](https://github.com/kevin-huff/youtube_queue/issues).

## Acknowledgements

- [Google APIs](https://github.com/googleapis/googleapis)
- [Express.js](https://expressjs.com/)
- [Socket.IO](https://socket.io/)
- [tmi.js](https://github.com/tmijs)
- [OpenAI](https://github.com/openai/openai-node)

## Authors

- [Kevin Huff](https://github.com/kevin-huff)
