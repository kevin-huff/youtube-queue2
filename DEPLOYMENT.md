# Quick Deployment Guide for ChatGPT Codex

This guide is specifically for deploying the YouTube Queue Bot in ChatGPT Codex or similar standalone environments.

## 🚀 One-Command Setup

```bash
# Clone and start (development)
git clone https://github.com/kevin-huff/youtube-queue2.git
cd youtube-queue2
./start.sh
```

## 🎯 For Production Deployment

```bash
# Clone and start (production)
git clone https://github.com/kevin-huff/youtube-queue2.git
cd youtube-queue2
./start-production.sh
```

## 📋 What the Scripts Do

### Development Script (`./start.sh`)
- ✅ Checks Node.js v16+ is installed
- ✅ Installs all dependencies
- ✅ Creates `.env` files with SQLite database
- ✅ Generates admin password automatically
- ✅ Sets up database with Prisma
- ✅ Starts server on `http://localhost:5000`
- ✅ Starts client on `http://localhost:3000`

### Production Script (`./start-production.sh`)
- ✅ Everything from development script
- ✅ Builds client for production
- ✅ Creates systemd service file
- ✅ Creates PM2 configuration
- ✅ Runs as background process
- ✅ Provides management commands

## 🔑 Admin Access

After setup, the scripts will display your admin password:
```
Generated admin password: [random-password]
```

**Save this password!** You'll need it to access:
- Admin Panel: `http://localhost:3000/admin`

## 🤖 Twitch Bot Setup (Optional)

Edit `server/.env` to add:
```env
TWITCH_USERNAME=your_bot_username
TWITCH_OAUTH_TOKEN=oauth:your_token_here
TWITCH_CHANNEL=your_channel_name
```

Get OAuth token from: https://twitchapps.com/tmi/

## 📱 Access URLs

- **Queue Page**: `http://localhost:3000/queue` (for viewers)
- **Admin Panel**: `http://localhost:3000/admin` (for streamers)
- **API Server**: `http://localhost:5000`

## 🐳 Docker Alternative

```bash
# Using Docker
docker-compose up --build

# Or build and run manually
docker build -t youtube-queue .
docker run -p 3000:3000 -p 5000:5000 youtube-queue
```

## 🔧 Management Commands

### Development
```bash
# Start development
./start.sh

# Stop (Ctrl+C in terminal)
```

### Production
```bash
# Start production
./start-production.sh

# Stop production
./start-production.sh stop

# Restart production
./start-production.sh restart

# Check status
./start-production.sh status

# View logs
tail -f production.log
```

## 📊 NPM Scripts

```bash
# Quick setup
npm run setup              # Same as ./start.sh
npm run setup:production   # Same as ./start-production.sh

# Production management
npm run production:start   # Start production
npm run production:stop    # Stop production
npm run production:restart # Restart production
npm run production:status  # Check status

# Docker
npm run docker:up          # Start with Docker Compose
npm run docker:down        # Stop Docker Compose
npm run docker:build       # Build Docker image
npm run docker:run         # Run Docker container

# Development
npm run dev                # Start development servers
npm run build              # Build for production

# Maintenance
npm run clean              # Clean node_modules
npm run clean:all          # Clean everything including data
```

## 🔍 Troubleshooting

### "Permission denied" error
```bash
chmod +x start.sh
chmod +x start-production.sh
```

### "Node.js not found"
Install Node.js 16+ from: https://nodejs.org

### "Port already in use"
The scripts automatically stop existing processes.

### Database issues
Uses SQLite by default - no setup required.

### View logs
```bash
# Development logs (in terminal)
# Production logs
tail -f production.log
```

## 🎬 Bot Commands (When Configured)

| Command | Description | Permission |
|---------|-------------|------------|
| `!queue on/off` | Enable/disable queue | Mods only |
| `!skip` | Skip current video | Mods only |
| `!clear` | Clear queue | Mods only |
| `!help` | Show commands | Everyone |

## 🌐 External Access

To allow external connections, edit `server/.env`:
```env
CORS_ORIGIN=*
```

For production with domain:
```env
CORS_ORIGIN=https://your-domain.com
```

## 🔒 Security Notes

- Admin password is auto-generated and saved to `.admin-credentials`
- JWT secret is auto-generated for secure sessions
- All sensitive files are in `.gitignore`
- Production script creates secure file permissions

---

**That's it!** The app should be running and accessible at the URLs shown above.
