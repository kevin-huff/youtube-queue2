#!/bin/bash

# YouTube Queue Setup Script
echo "🚀 Setting up YouTube Queue..."

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

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL is not installed. Please install PostgreSQL first."
    echo "   On Ubuntu: sudo apt install postgresql postgresql-contrib"
    echo "   On macOS: brew install postgresql"
    echo "   On Windows: Download from https://www.postgresql.org/download/"
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
    cp server/.env.example server/.env
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

# Check if database exists and create if not
echo "🗄️  Setting up database..."

# Prompt for database details
read -p "Enter PostgreSQL username (default: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}

read -p "Enter PostgreSQL password: " -s DB_PASSWORD
echo

read -p "Enter database name (default: youtube_queue): " DB_NAME
DB_NAME=${DB_NAME:-youtube_queue}

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

echo "✅ Database URL updated in .env"

# Run database migrations
echo "🔄 Running database migrations..."
cd server && npm run db:migrate

if [ $? -ne 0 ]; then
    echo "❌ Failed to run database migrations"
    exit 1
fi

echo "✅ Database setup completed"

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Edit server/.env with your Twitch bot credentials:"
echo "   - TWITCH_USERNAME: Your bot's Twitch username"
echo "   - TWITCH_OAUTH_TOKEN: OAuth token (get from https://twitchapps.com/tmi/)"
echo "   - TWITCH_CHANNEL: The channel to monitor (without #)"
echo "   - YOUTUBE_API_KEY: YouTube Data API key (optional, for metadata)"
echo ""
echo "2. Start the development server:"
echo "   npm run dev"
echo ""
echo "3. Open your browser to:"
echo "   - Queue page: http://localhost:3000/queue"
echo "   - Admin page: http://localhost:3000/admin"
echo ""
echo "🤖 Twitch Bot Commands:"
echo "   !queue on/off - Enable/disable queue (mods only)"
echo "   !skip - Skip current video (mods only)"
echo "   !clear - Clear queue (mods only)"
echo "   !help - Show available commands"
echo ""
echo "Happy streaming! 🎬"
