# YouTube Queue Bot

A real-time video queue system for Twitch streamers with a modern web interface.

## 🚀 Quick Start (Standalone Environment)

For ChatGPT Codex or other standalone environments, use the provided startup script:

```bash
# Clone the repository
git clone https://github.com/kevin-huff/youtube-queue2.git
cd youtube-queue2

# Run the startup script
./start.sh
```

The startup script will:
- ✅ Check Node.js requirements (v16+)
- ✅ Install all dependencies automatically
- ✅ Set up environment files
- ✅ Configure SQLite database (no PostgreSQL required)
- ✅ Generate secure admin credentials
- ✅ Start both server and client

## 📱 Access the Application

Once started, access these URLs:
- **Queue Page**: http://localhost:3000/queue (for viewers)
- **Admin Panel**: http://localhost:3000/admin (for streamers)
- **API Server**: http://localhost:5000

## 🔧 Configuration

The startup script creates a `server/.env` file with default settings. To enable Twitch integration:

1. Edit `server/.env`
2. Configure these variables:
   ```env
   TWITCH_USERNAME=your_bot_username
   TWITCH_OAUTH_TOKEN=oauth:your_token_here
   TWITCH_CHANNEL=your_channel_name
   ```

### Getting Twitch Credentials

1. **Bot Username**: Create a Twitch account for your bot
2. **OAuth Token**: Get from https://twitchapps.com/tmi/
3. **Channel**: Your Twitch channel name (without #)

### Optional: YouTube API

For video metadata (thumbnails, titles):
```env
YOUTUBE_API_KEY=your_youtube_api_key_here
```

Get a YouTube API key from [Google Cloud Console](https://console.cloud.google.com/).

## 🤖 Bot Commands

When the Twitch bot is configured:

| Command | Description | Permission |
|---------|-------------|------------|
| `!queue on/off` | Enable/disable queue | Mods only |
| `!skip` | Skip current video | Mods only |
| `!clear` | Clear entire queue | Mods only |
| `!help` | Show available commands | Everyone |

Viewers can submit videos by posting YouTube URLs in chat when the queue is enabled.

## 🐳 Docker Setup (Alternative)

If you prefer Docker:

```bash
# Build and start with Docker Compose
docker-compose up --build
```

## 📂 Manual Setup

If you prefer manual setup:

1. **Install dependencies**:
   ```bash
   npm run install:all
   ```

2. **Set up environment**:
   ```bash
   cp .env.example server/.env
   echo "REACT_APP_SERVER_URL=http://localhost:5000" > client/.env
   ```

3. **Configure database**:
   ```bash
   cd server
   npm run db:setup
   cd ..
   ```

4. **Start development**:
   ```bash
   npm run dev
   ```

## 🏗️ Architecture

```
youtube-queue2/
├── client/          # React frontend
├── server/          # Node.js backend
├── start.sh         # Standalone startup script
├── docker-compose.yml # Docker configuration
└── .env.example     # Environment template
```

### Backend (server/)
- **Express.js** API server
- **Socket.io** for real-time updates
- **Prisma** ORM with SQLite/PostgreSQL
- **TMI.js** for Twitch chat integration

### Frontend (client/)
- **React** with hooks
- **Socket.io-client** for real-time updates
- **Responsive design** for mobile/desktop

## 🔒 Security Features

- JWT authentication for admin access
- Rate limiting on API endpoints
- Input validation and sanitization
- CORS protection
- Helmet.js security headers

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | SQLite file |
| `TWITCH_USERNAME` | Bot's Twitch username | - |
| `TWITCH_OAUTH_TOKEN` | Twitch OAuth token | - |
| `TWITCH_CHANNEL` | Channel to monitor | - |
| `YOUTUBE_API_KEY` | YouTube Data API key | - |
| `JWT_SECRET` | JWT signing secret | Auto-generated |
| `ADMIN_PASSWORD` | Admin panel password | Auto-generated |
| `PORT` | Server port | 5000 |
| `MAX_QUEUE_SIZE` | Maximum queue length | 50 |
| `SUBMISSION_COOLDOWN` | Cooldown between submissions (seconds) | 30 |
| `MAX_VIDEO_DURATION` | Max video length (seconds) | 600 |

## 🛠️ Development

```bash
# Install dependencies
npm run install:all

# Start development servers
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Build for production
npm run build
```

## 📊 Database Schema

The app uses Prisma with the following models:
- **Videos**: Queue entries with metadata
- **Settings**: Bot configuration
- **Users**: Admin authentication

## 🔍 Troubleshooting

### Common Issues

1. **Port already in use**: The startup script automatically stops existing processes
2. **Database connection**: Uses SQLite by default, no setup required
3. **Missing Node.js**: Install Node.js 16+ from https://nodejs.org
4. **Permission denied**: Run `chmod +x start.sh` first

### Logs

Server logs are available in:
- Console output during development
- `server/logs/app.log` in production

## 🚀 Deployment

### Production Deployment

1. Set `NODE_ENV=production` in `server/.env`
2. Use PostgreSQL for better performance
3. Build the client: `npm run build:client`
4. Start production server: `npm run start:production`

### Environment Setup

For production, configure:
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/dbname
CORS_ORIGIN=https://your-domain.com
```

## 📝 License

This project is licensed under the Unlicense - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

- Create an issue on GitHub for bugs
- Check existing issues for solutions
- Review the troubleshooting section above

## 🎯 Features

- ✅ Real-time queue updates
- ✅ Twitch chat integration
- ✅ YouTube video metadata
- ✅ Admin controls
- ✅ Mobile-responsive design
- ✅ Rate limiting and moderation
- ✅ Automatic video validation
- ✅ Queue management commands
- ✅ SQLite support (no database setup required)
- ✅ Docker support
- ✅ One-command startup

## 📈 Roadmap

- [ ] Multi-platform support (YouTube Live, etc.)
- [ ] User voting system
- [ ] Queue templates
- [ ] Analytics dashboard
- [ ] Custom themes
- [ ] API documentation

---

Built with ❤️ for the streaming community
