#!/bin/bash

# Multi-Channel Twitch Queue Setup Script
echo "🚀 Setting up Multi-Channel Twitch Queue Bot..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Install dependencies
echo "📦 Installing dependencies..."
npm run install:all

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create .env file if it doesn't exist
if [ ! -f "server/.env" ]; then
    echo "🔧 Creating server .env file..."
    cp .env.example server/.env
    echo "⚠️  Please edit server/.env with your configuration before running the application"
else
    echo "✅ Server .env file already exists"
fi

# Create client .env file if it doesn't exist
if [ ! -f "client/.env" ]; then
    echo "🔧 Creating client .env file..."
    echo "REACT_APP_SERVER_URL=http://localhost:5000" > client/.env
    echo "✅ Client .env file created"
else
    echo "✅ Client .env file already exists"
fi

# Database setup
echo "🗄️ Setting up database..."

# Check if user wants to use PostgreSQL or SQLite
echo "Choose your database:"
echo "1) SQLite (easier setup, good for development)"
echo "2) PostgreSQL (recommended for production)"
read -p "Enter choice (1-2) [default: 1]: " DB_CHOICE
DB_CHOICE=${DB_CHOICE:-1}

if [ "$DB_CHOICE" = "2" ]; then
    # PostgreSQL setup
    if ! command -v psql &> /dev/null; then
        echo "⚠️  PostgreSQL is not installed. Please install PostgreSQL first."
        echo "   On Ubuntu: sudo apt install postgresql postgresql-contrib"
        echo "   On macOS: brew install postgresql"
        echo "   On Windows: Download from https://www.postgresql.org/download/"
        exit 1
    fi

    # Prompt for database details
    read -p "Enter PostgreSQL username (default: postgres): " DB_USER
    DB_USER=${DB_USER:-postgres}

    read -p "Enter PostgreSQL password: " -s DB_PASSWORD
    echo

    read -p "Enter database name (default: twitch_queue): " DB_NAME
    DB_NAME=${DB_NAME:-twitch_queue}

    read -p "Enter database host (default: localhost): " DB_HOST
    DB_HOST=${DB_HOST:-localhost}

    read -p "Enter database port (default: 5432): " DB_PORT
    DB_PORT=${DB_PORT:-5432}

    # Create database if it doesn't exist
    echo "Creating database if it doesn't exist..."
    PGPASSWORD=$DB_PASSWORD createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME 2>/dev/null || echo "Database might already exist"

    # Update DATABASE_URL in .env
    DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
    if grep -q "DATABASE_URL=" server/.env; then
        # Update existing line
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=\"$DATABASE_URL\"|" server/.env
        else
            # Linux
            sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"$DATABASE_URL\"|" server/.env
        fi
    else
        # Add new line
        echo "DATABASE_URL=\"$DATABASE_URL\"" >> server/.env
    fi

    echo "✅ PostgreSQL database URL updated in .env"
else
    # SQLite setup (default)
    echo "✅ Using SQLite database (no additional setup required)"
fi

# Generate secure session secret if not exists
if ! grep -q "SESSION_SECRET=" server/.env || grep -q "SESSION_SECRET=your_secure_random_string" server/.env; then
    echo "🔐 Generating secure session secret..."
    SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    
    if grep -q "SESSION_SECRET=" server/.env; then
        # Update existing line
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|SESSION_SECRET=.*|SESSION_SECRET=\"$SESSION_SECRET\"|" server/.env
        else
            # Linux
            sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=\"$SESSION_SECRET\"|" server/.env
        fi
    else
        # Add new line
        echo "SESSION_SECRET=\"$SESSION_SECRET\"" >> server/.env
    fi
    echo "✅ Session secret generated"
fi

# Run database migrations
echo "🔄 Running database setup..."
cd server && npm run db:setup

if [ $? -ne 0 ]; then
    echo "❌ Failed to setup database"
    exit 1
fi

cd ..
echo "✅ Database setup completed"

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 IMPORTANT: Configure Twitch OAuth before running the application"
echo ""
echo "🔧 1. Create a Twitch Application:"
echo "   - Go to: https://dev.twitch.tv/console/apps"
echo "   - Create a new application"
echo "   - Set OAuth Redirect URL to: http://localhost:5000/api/auth/twitch/callback"
echo "   - Note your Client ID and Client Secret"
echo ""
echo "🔧 2. Create a Twitch Bot Account:"
echo "   - Create a separate Twitch account for your bot"
echo "   - Get OAuth token from: https://twitchapps.com/tmi/"
echo ""
echo "🔧 3. Edit server/.env with your credentials:"
echo "   Required:"
echo "   - TWITCH_CLIENT_ID=your_twitch_client_id"
echo "   - TWITCH_CLIENT_SECRET=your_twitch_client_secret"
echo "   - TWITCH_BOT_USERNAME=your_bot_username"
echo "   - TWITCH_BOT_OAUTH_TOKEN=oauth:your_bot_token"
echo ""
echo "   Optional:"
echo "   - YOUTUBE_API_KEY=your_youtube_api_key (for video metadata)"
echo ""
echo "🚀 4. Start the application:"
echo "   ./start.sh"
echo ""
echo "🌐 5. Access the application:"
echo "   - Main app: http://localhost:3000"
echo "   - Login with Twitch OAuth"
echo "   - Add your channel to start using the queue"
echo ""
echo "🏗️ Architecture:"
echo "   ✅ Multi-channel support - each streamer gets their own isolated queue"
echo "   ✅ Twitch OAuth authentication for streamers"
echo "   ✅ Bot automatically joins/leaves channels as they're added/removed"
echo "   ✅ Per-channel settings and management"
echo ""
echo "🤖 Bot Commands (per channel):"
echo "   !queue on/off - Enable/disable queue (broadcaster/mods only)"
echo "   !skip - Skip current video (broadcaster/mods only)"
echo "   !clear - Clear queue (broadcaster/mods only)"
echo "   !remove <id> - Remove specific video (broadcaster/mods only)"
echo "   !help - Show available commands"
echo ""
echo "Happy streaming! 🎬"
