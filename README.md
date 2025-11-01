# FREE* Mediashare – Multi-Channel YouTube Queue Bot

Brought to you by KevNetCloud in collaboration with ChatGPT. FREE* Mediashare manages YouTube video queues for multiple streamers—asterisk and all—giving every channel its own isolated queue with real-time updates and channel-specific settings.

## Features

- **Multi-User Support**: Streamers log in with Twitch OAuth
- **Multi-Channel Management**: Each user can manage multiple Twitch channels  
- **Real-time Queue Updates**: Socket.IO provides live updates per channel
- **Channel Isolation**: Each channel has its own queue and settings
- **Beautiful Modern UI**: Dark theme with Twitch-inspired purple accents
- **Public Queue Pages**: Viewers can see the queue at `/channel/{channelName}`
- **Secure Management**: Only channel owners can manage their settings

## Quick Start

### Prerequisites

- Node.js v16 or higher
- PostgreSQL or SQLite database
- Twitch Application credentials
- (Optional) YouTube API key for enhanced metadata

### Setup

1. Clone the repository:
```bash
git clone https://github.com/kevin-huff/youtube-queue2.git
cd youtube-queue2
```

2. Run the setup script:
```bash
./setup.sh
```

3. Create a Twitch Application:
   - Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
   - Create a new application
   - Set OAuth Redirect URL to: `http://localhost:5000/api/auth/twitch/callback`
   - Note your Client ID and Client Secret

4. Create a Twitch Bot Account:
   - Create a separate Twitch account for your bot
   - Get OAuth token from [twitchapps.com/tmi](https://twitchapps.com/tmi/)

5. Configure your credentials in `server/.env`:
```env
# Required
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
TWITCH_BOT_USERNAME=your_bot_username
TWITCH_BOT_OAUTH_TOKEN=oauth:your_bot_token

# Optional
YOUTUBE_API_KEY=your_youtube_api_key
```

6. Start the application:
```bash
./start.sh
```

7. Access the application:
   - Main app: http://localhost:3000
   - API: http://localhost:5000

## Architecture

### Multi-Channel Support
- Each streamer logs in with their Twitch account
- Streamers can add/remove their channels from the dashboard
- Bot automatically joins/leaves channels as they're managed
- Each channel has isolated queue and settings

### Authentication Flow
1. User clicks "Login with Twitch"
2. Redirected to Twitch OAuth
3. After authorization, user is logged in
4. User can manage their channels from dashboard

### Real-time Updates
- Each channel has its own Socket.IO namespace
- Queue updates broadcast only to relevant channel
- Public viewers get read-only access
- Channel owners get full control

## Bot Commands

Commands work per channel with appropriate permissions:

- `!queue on/off` - Enable/disable queue (broadcaster/mods only)
- `!skip` - Skip current video (broadcaster/mods only)  
- `!clear` - Clear queue (broadcaster/mods only)
- `!remove <id>` - Remove specific video (broadcaster/mods only)
- `!help` - Show available commands

## API Endpoints

### Authentication
- `GET /api/auth/twitch` - Initiate Twitch OAuth
- `GET /api/auth/twitch/callback` - OAuth callback
- `GET /api/auth/user` - Get current user
- `POST /api/auth/logout` - Logout

### Channels
- `GET /api/channels` - List user's channels
- `POST /api/channels` - Add a channel
- `GET /api/channels/:channelName` - Get channel info
- `PUT /api/channels/:channelName` - Update channel settings
- `DELETE /api/channels/:channelName` - Remove channel

### Queue
- `GET /api/queue/:channelName` - Get channel's queue
- `POST /api/queue/:channelName` - Add video to queue
- `DELETE /api/queue/:channelName/:videoId` - Remove video
- `POST /api/queue/:channelName/skip` - Skip current video
- `DELETE /api/queue/:channelName` - Clear queue

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment instructions.

## Development

### Project Structure
```
youtube-queue2/
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   └── contexts/      # React contexts
├── server/                # Node.js backend
│   ├── src/
│   │   ├── api/          # API routes
│   │   ├── auth/         # Authentication
│   │   ├── bot/          # Twitch bot
│   │   ├── services/     # Business logic
│   │   └── socket/       # Socket.IO handlers
│   └── prisma/           # Database schema
└── docker-compose.yml    # Docker configuration
```

### Environment Variables

See `.env.example` for all available configuration options.

### Scripts

- `npm start` - Start both frontend and backend
- `npm run dev` - Start in development mode
- `npm run build` - Build for production
- `npm test` - Run tests

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the Unlicense - see the [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/kevin-huff/youtube-queue2/issues) page.
