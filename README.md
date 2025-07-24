# YouTube Queue - Twitch Video Queue System

A real-time video queue system for Twitch streamers that allows viewers to submit YouTube, TikTok, and Instagram videos through chat commands. Built with Node.js, React, Socket.io, and PostgreSQL.

## 🎯 Features

### Core Functionality
- **Real-time Queue Management**: Live updates using Socket.io
- **Multi-platform Support**: YouTube, TikTok, and Instagram Reels
- **Twitch Bot Integration**: Automated chat monitoring and commands
- **Video Metadata Extraction**: Automatic title, thumbnail, and duration detection
- **Admin Dashboard**: Complete control over queue and bot settings

### Queue Features
- Enable/disable queue through chat or admin panel
- Video validation and duplicate prevention
- Customizable queue limits and cooldowns
- Real-time viewer feedback
- Queue reordering and management

### Bot Commands
- **Moderator Commands**:
  - `!queue on/off` - Enable/disable video submissions
  - `!skip` - Skip currently playing video
  - `!clear` - Clear entire queue
  - `!volume <0-100>` - Adjust volume

- **Viewer Commands**:
  - Drop video links in chat when queue is open
  - `!queue` - Check queue status
  - `!help` - Show available commands

## 🏗️ Architecture

```
├── server/               # Node.js backend
│   ├── src/
│   │   ├── api/         # REST API routes
│   │   ├── bot/         # Twitch bot implementation
│   │   ├── services/    # Business logic
│   │   ├── socket/      # Socket.io handlers
│   │   └── database/    # Database configuration
│   └── prisma/          # Database schema and migrations
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   ├── pages/       # Page components
│   │   └── contexts/    # React contexts
└── shared/              # Shared utilities (future)
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- PostgreSQL 12+
- Twitch account for bot credentials

### Automated Setup
Run the setup script for guided installation:

```bash
# Clone the repository
git clone https://github.com/kevin-huff/youtube-queue2.git
cd youtube-queue2

# Run automated setup
./setup.sh
```

The setup script will:
1. Check prerequisites
2. Install all dependencies
3. Create environment files
4. Set up the database
5. Run initial migrations

### Manual Setup

1. **Install Dependencies**
```bash
npm run install:all
```

2. **Database Setup**
```bash
# Create PostgreSQL database
createdb youtube_queue

# Copy environment file
cp server/.env.example server/.env
```

3. **Configure Environment**
Edit `server/.env` with your settings:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/youtube_queue"

# Twitch Bot Credentials
TWITCH_USERNAME=your_bot_username
TWITCH_OAUTH_TOKEN=oauth:your_token_here
TWITCH_CHANNEL=your_channel_name

# Optional: YouTube API for enhanced metadata
YOUTUBE_API_KEY=your_youtube_api_key

# Server Configuration
PORT=5000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key
CORS_ORIGIN=http://localhost:3000
```

4. **Run Database Migrations**
```bash
npm run db:migrate
```

5. **Start Development Server**
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Queue Page: http://localhost:3000/queue
- Admin Dashboard: http://localhost:3000/admin

## 🔧 Configuration

### Twitch Bot Setup

1. **Create a Twitch Account** for your bot (or use existing)

2. **Get OAuth Token**:
   - Visit https://twitchapps.com/tmi/
   - Login with your bot account
   - Copy the generated OAuth token

3. **Configure Bot**:
   ```env
   TWITCH_USERNAME=your_bot_username
   TWITCH_OAUTH_TOKEN=oauth:your_token_here
   TWITCH_CHANNEL=your_channel_name  # without #
   ```

### YouTube API (Optional)
For enhanced video metadata:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable YouTube Data API v3
4. Create API credentials
5. Add the API key to your `.env` file

### Queue Settings
Customize queue behavior in the admin dashboard:
- Maximum queue size
- Submission cooldown period
- Maximum video duration
- Auto-play next video
- Volume control

## 📱 Usage

### For Streamers

1. **Start the Application**
   ```bash
   npm run dev
   ```

2. **Configure Settings**
   - Open admin dashboard at `/admin`
   - Enable/disable queue
   - Adjust settings as needed

3. **Display Queue**
   - Open queue page at `/queue` in OBS browser source
   - Resize to fit your layout

### For Viewers

1. **Submit Videos**
   - Drop YouTube, TikTok, or Instagram links in chat
   - Only works when queue is enabled

2. **Check Status**
   - Use `!queue` command to see current status
   - Use `!help` for available commands

## 🛠️ Development

### Available Scripts

```bash
# Install all dependencies
npm run install:all

# Start development servers
npm run dev

# Start individual services
npm run dev:server    # Backend only
npm run dev:client    # Frontend only

# Database operations
npm run db:migrate    # Run migrations
npm run db:reset      # Reset database
npm run db:seed       # Seed with test data

# Production build
npm run build
npm run start:production

# Testing
npm run test
npm run test:server
npm run test:client

# Linting
npm run lint
```

### Project Structure

```
youtube-queue2/
├── client/                    # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   └── NavBar.js
│   │   ├── contexts/         # React contexts
│   │   │   └── SocketContext.js
│   │   ├── pages/           # Main page components
│   │   │   ├── QueuePage.js
│   │   │   └── AdminPage.js
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
├── server/                   # Node.js backend
│   ├── src/
│   │   ├── api/             # REST API routes
│   │   │   └── index.js
│   │   ├── bot/             # Twitch bot
│   │   │   └── TwitchBot.js
│   │   ├── database/        # Database connection
│   │   │   └── connection.js
│   │   ├── services/        # Business logic
│   │   │   ├── QueueService.js
│   │   │   └── VideoService.js
│   │   ├── socket/          # Socket.io handlers
│   │   │   └── index.js
│   │   ├── utils/           # Utilities
│   │   │   └── logger.js
│   │   └── index.js         # Main server file
│   ├── prisma/              # Database schema
│   │   └── schema.prisma
│   └── package.json
├── setup.sh                 # Automated setup script
├── package.json             # Root package.json
└── README.md
```

### Database Schema

The application uses PostgreSQL with Prisma ORM:

- **QueueItem**: Video queue entries
- **Setting**: Application configuration
- **User**: User information (future)

## 🔐 Security Features

- Input validation and sanitization
- Rate limiting on API endpoints
- SQL injection prevention with Prisma
- XSS protection with helmet
- CORS configuration
- Environment variable protection

## 🚀 Deployment

### Environment Setup

For production deployment:

1. **Set Production Environment Variables**
2. **Build the Client**
   ```bash
   npm run build
   ```
3. **Configure Database** (PostgreSQL in production)
4. **Start Production Server**
   ```bash
   npm run start:production
   ```

### Docker Support (Future)

Docker configuration will be added in future releases for easier deployment.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style
- Add tests for new features
- Update documentation as needed
- Use conventional commit messages

## 📝 API Documentation

### REST Endpoints

- `GET /api/queue` - Get current queue
- `POST /api/queue` - Add video to queue
- `DELETE /api/queue/:id` - Remove video from queue
- `PUT /api/queue/reorder` - Reorder queue
- `GET /api/bot/status` - Get bot status
- `POST /api/admin/queue/toggle` - Enable/disable queue

### Socket Events

**Client to Server:**
- `queue:join` - Join queue room
- `queue:add` - Add video to queue
- `queue:remove` - Remove video from queue
- `admin:enable_queue` - Enable queue
- `admin:disable_queue` - Disable queue

**Server to Client:**
- `queue:initial_state` - Initial queue state
- `queue:video_added` - Video added to queue
- `queue:video_removed` - Video removed from queue
- `queue:updated` - Queue updated
- `queue:now_playing` - Currently playing video

## 🐛 Troubleshooting

### Common Issues

1. **Bot Not Connecting**
   - Check Twitch credentials in `.env`
   - Verify OAuth token is valid
   - Ensure channel name is correct (no #)

2. **Database Connection Issues**
   - Verify PostgreSQL is running
   - Check DATABASE_URL format
   - Ensure database exists

3. **Videos Not Loading**
   - Check YouTube API key (if using)
   - Verify video URLs are valid
   - Check network connectivity

4. **Socket Connection Failed**
   - Verify server is running on correct port
   - Check CORS configuration
   - Ensure client connects to correct server URL

### Debug Mode

Enable debug logging:
```env
NODE_ENV=development
LOG_LEVEL=debug
```

## 🎯 Roadmap

### Upcoming Features

- [ ] Playlist management
- [ ] User authentication and profiles
- [ ] Advanced queue filtering
- [ ] Video rating and voting system
- [ ] Stream deck integration
- [ ] Mobile responsive design improvements
- [ ] Docker containerization
- [ ] Advanced analytics

### Long-term Goals

- [ ] Multi-streamer support
- [ ] Plugin system for extensions
- [ ] Advanced moderation tools
- [ ] Integration with other platforms (Discord, etc.)
- [ ] Machine learning for content recommendations

## 📄 License

This project is released under the [Unlicense](LICENSE) - see the LICENSE file for details.

## 👨‍💻 Author

**Kevin Huff**
- GitHub: [@kevin-huff](https://github.com/kevin-huff)

## 🙏 Acknowledgments

- Twitch for their excellent chat API
- YouTube, TikTok, and Instagram for video platforms
- The open-source community for amazing tools
- Socket.io for real-time communication
- React and Node.js communities

---

**Happy Streaming! 🎬✨**

For questions, issues, or feature requests, please open an issue on GitHub.
