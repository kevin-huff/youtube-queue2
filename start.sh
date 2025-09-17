#!/bin/bash

# Multi-Channel Twitch Queue - Startup Script
# Supports multiple streamers with OAuth authentication

set -e  # Exit on any error

echo "🚀 Starting Multi-Channel Twitch Queue Application..."
echo "==================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 16 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js version 16 or higher is required. Current version: $(node -v)"
    exit 1
fi

print_status "Node.js $(node -v) found"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm."
    exit 1
fi

print_status "npm $(npm -v) found"

# Function to create .env files if they don't exist
setup_env_files() {
    print_info "Setting up environment files..."
    
    # Create server .env if it doesn't exist
    if [ ! -f "server/.env" ]; then
        print_info "Creating server/.env from template..."
        cp .env.example server/.env
        
        # Generate random secrets
        SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "session_secret_$(date +%s)")
        JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "jwt_secret_$(date +%s)")
        
        # Update the .env file with generated secrets
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|SESSION_SECRET=\"your_session_secret_here\"|SESSION_SECRET=\"$SESSION_SECRET\"|" server/.env
            sed -i '' "s|JWT_SECRET=\"your_super_secret_jwt_key_here\"|JWT_SECRET=\"$JWT_SECRET\"|" server/.env
        else
            # Linux
            sed -i "s|SESSION_SECRET=\"your_session_secret_here\"|SESSION_SECRET=\"$SESSION_SECRET\"|" server/.env
            sed -i "s|JWT_SECRET=\"your_super_secret_jwt_key_here\"|JWT_SECRET=\"$JWT_SECRET\"|" server/.env
        fi
        
        print_status "Generated secure session and JWT secrets"
    else
        print_status "Server .env file already exists"
    fi
    
    # Create client .env if it doesn't exist
    if [ ! -f "client/.env" ]; then
        print_info "Creating client/.env..."
        echo "REACT_APP_SERVER_URL=http://localhost:5000" > client/.env
        print_status "Client .env file created"
    else
        print_status "Client .env file already exists"
    fi
}

# Function to install dependencies
install_dependencies() {
    print_info "Installing dependencies..."
    
    # Check if package.json exists and install root dependencies
    if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
        print_info "Installing root dependencies..."
        npm install
    fi
    
    # Install server dependencies
    if [ ! -d "server/node_modules" ]; then
        print_info "Installing server dependencies..."
        cd server && npm install && cd ..
    fi
    
    # Install client dependencies
    if [ ! -d "client/node_modules" ]; then
        print_info "Installing client dependencies..."
        cd client && npm install && cd ..
    fi
    
    print_status "All dependencies installed"
}

# Function to setup database
setup_database() {
    print_info "Setting up database..."
    
    # Check if using SQLite (default) or PostgreSQL
    if grep -q "file:./dev.db" server/.env; then
        print_info "Using SQLite database (default for development)"
        mkdir -p server/data
    elif grep -q "postgresql://" server/.env; then
        print_info "Using PostgreSQL database"
    else
        print_warning "No database URL configured, defaulting to SQLite..."
        # Set SQLite as default
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' 's|DATABASE_URL=".*"|DATABASE_URL="file:./dev.db"|' server/.env
        else
            # Linux
            sed -i 's|DATABASE_URL=".*"|DATABASE_URL="file:./dev.db"|' server/.env
        fi
        mkdir -p server/data
    fi
    
    # Run database setup
    cd server
    print_info "Generating Prisma client..."
    npx prisma generate
    
    print_info "Running database setup..."
    npx prisma db push --force-reset
    
    cd ..
    print_status "Database setup completed"
}

# Function to start the application
start_application() {
    print_info "Starting the application..."
    
    # Check if ports are available
    if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port 5000 is already in use. Stopping existing process..."
        pkill -f "node.*src/index.js" || true
        sleep 2
    fi
    
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port 3000 is already in use. Stopping existing process..."
        pkill -f "react-scripts start" || true
        sleep 2
    fi
    
    print_status "Starting Multi-Channel Twitch Queue application..."
    print_info "API Server will run on: http://localhost:5000"
    print_info "Frontend will run on: http://localhost:3000"
    
    # Start both server and client concurrently
    if [ -f "package.json" ] && grep -q "\"dev\":" package.json; then
        npm run dev
    else
        # Fallback to manual startup
        cd server && npm run dev &
        SERVER_PID=$!
        cd ../client && npm start &
        CLIENT_PID=$!
        
        # Wait for either to exit
        wait $SERVER_PID $CLIENT_PID
    fi
}

# Function to display configuration info
show_config_info() {
    echo ""
    echo "🔧 Configuration Information"
    echo "============================="
    
    # Check OAuth configuration
    OAUTH_CONFIGURED=true
    if grep -q "your_twitch_client_id" server/.env || grep -q "your_twitch_app_client_id" server/.env; then
        OAUTH_CONFIGURED=false
    fi
    
    # Check bot configuration
    BOT_CONFIGURED=true
    if grep -q "your_bot_username" server/.env; then
        BOT_CONFIGURED=false
    fi
    
    if [ "$OAUTH_CONFIGURED" = false ]; then
        print_warning "Twitch OAuth not configured yet!"
        echo ""
        echo "🔑 To enable Twitch OAuth authentication:"
        echo "1. Create a Twitch application at: https://dev.twitch.tv/console/apps"
        echo "2. Set OAuth Redirect URL to: http://localhost:5000/api/auth/twitch/callback"
        echo "3. Edit server/.env and configure:"
        echo "   - TWITCH_CLIENT_ID=your_client_id"
        echo "   - TWITCH_CLIENT_SECRET=your_client_secret"
        echo ""
    else
        print_status "Twitch OAuth configured"
    fi
    
    if [ "$BOT_CONFIGURED" = false ]; then
        print_warning "Twitch bot not configured yet!"
        echo ""
        echo "🤖 To enable the Twitch bot:"
        echo "1. Create a separate Twitch account for your bot"
        echo "2. Get OAuth token from: https://twitchapps.com/tmi/"
        echo "3. Edit server/.env and configure:"
        echo "   - TWITCH_BOT_USERNAME=your_bot_username"
        echo "   - TWITCH_BOT_OAUTH_TOKEN=oauth:your_bot_token"
        echo ""
    else
        print_status "Twitch bot configured"
    fi
    
    # Check if YouTube API is configured
    if grep -q "your_youtube_api_key_here" server/.env; then
        print_warning "YouTube API not configured (optional)"
        echo "📺 For video metadata, configure:"
        echo "   - YOUTUBE_API_KEY: Get from Google Cloud Console"
        echo ""
    fi
    
    echo "🌐 Access URLs:"
    echo "- Main Application: http://localhost:3000"
    echo "- Login/Dashboard: http://localhost:3000/dashboard"
    echo "- API Server: http://localhost:5000"
    echo "- Health Check: http://localhost:5000/health"
    echo ""
    
    echo "🏗️ How it works:"
    echo "1. Streamers log in via Twitch OAuth"
    echo "2. Each streamer can add their own channel"
    echo "3. Bot automatically joins/leaves channels"
    echo "4. Each channel has isolated queues and settings"
    echo ""
    
    echo "🤖 Bot Commands (per channel):"
    echo "- !queue on/off - Enable/disable queue (broadcaster/mods)"
    echo "- !skip - Skip current video (broadcaster/mods)"
    echo "- !clear - Clear queue (broadcaster/mods)"
    echo "- !remove <id> - Remove specific video (broadcaster/mods)"
    echo "- !help - Show commands"
    echo ""
    
    if [ "$OAUTH_CONFIGURED" = false ] || [ "$BOT_CONFIGURED" = false ]; then
        print_warning "Some features require configuration. See above for setup instructions."
        echo ""
    fi
}

# Main execution
main() {
    setup_env_files
    install_dependencies
    setup_database
    show_config_info
    
    print_status "Setup completed! Starting application..."
    echo ""
    
    # Start the application
    start_application
}

# Handle Ctrl+C gracefully
trap 'echo -e "\n${YELLOW}Shutting down...${NC}"; pkill -f "node.*src/index.js" 2>/dev/null || true; pkill -f "react-scripts start" 2>/dev/null || true; exit 0' INT

# Run main function
main
