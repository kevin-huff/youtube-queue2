#!/bin/bash

# YouTube Queue - Standalone Startup Script
# For use with ChatGPT Codex or other standalone environments

set -e  # Exit on any error

echo "🚀 Starting YouTube Queue Application..."
echo "========================================"

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
        JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "your_super_secret_jwt_key_$(date +%s)")
        ADMIN_PASSWORD=$(openssl rand -base64 12 2>/dev/null || echo "admin123")
        
        # Update the .env file with generated secrets
        sed -i.bak "s|JWT_SECRET=\"your_super_secret_jwt_key_here\"|JWT_SECRET=\"$JWT_SECRET\"|" server/.env
        sed -i.bak "s|ADMIN_PASSWORD=\"your_secure_admin_password\"|ADMIN_PASSWORD=\"$ADMIN_PASSWORD\"|" server/.env
        
        print_warning "Generated admin password: $ADMIN_PASSWORD"
        print_warning "Please save this password - you'll need it to access the admin panel"
        
        rm -f server/.env.bak
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
    
    # Install root dependencies
    if [ ! -d "node_modules" ]; then
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
    
    # Check if DATABASE_URL is configured
    if grep -q "postgresql://username:password@localhost" server/.env; then
        print_warning "Database URL needs to be configured in server/.env"
        print_info "Using SQLite as fallback for development..."
        
        # Create SQLite database URL
        mkdir -p server/data
        sed -i.bak 's|DATABASE_URL="postgresql://username:password@localhost:5432/youtube_queue"|DATABASE_URL="file:./data/dev.db"|' server/.env
        rm -f server/.env.bak
    fi
    
    # Run database setup
    cd server
    print_info "Generating Prisma client..."
    npx prisma generate
    
    print_info "Running database migrations..."
    npx prisma db push
    
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
    
    print_status "Starting YouTube Queue application..."
    print_info "Server will run on: http://localhost:5000"
    print_info "Client will run on: http://localhost:3000"
    
    # Start both server and client concurrently
    npm run dev
}

# Function to display configuration info
show_config_info() {
    echo ""
    echo "🔧 Configuration Information"
    echo "============================="
    
    # Check if Twitch credentials are configured
    if grep -q "your_bot_username" server/.env; then
        print_warning "Twitch bot not configured yet!"
        echo ""
        echo "To set up the Twitch bot, edit server/.env and configure:"
        echo "- TWITCH_USERNAME: Your bot's Twitch username"
        echo "- TWITCH_OAUTH_TOKEN: Get from https://twitchapps.com/tmi/"
        echo "- TWITCH_CHANNEL: Channel to monitor (without #)"
        echo ""
    fi
    
    # Check if YouTube API is configured
    if grep -q "your_youtube_api_key_here" server/.env; then
        print_warning "YouTube API not configured (optional)"
        echo "- YOUTUBE_API_KEY: Get from Google Cloud Console"
        echo ""
    fi
    
    echo "📱 Access URLs:"
    echo "- Queue Page: http://localhost:3000/queue"
    echo "- Admin Page: http://localhost:3000/admin"
    echo "- API Server: http://localhost:5000"
    echo ""
    
    echo "🤖 Bot Commands (when configured):"
    echo "- !queue on/off - Enable/disable queue (mods only)"
    echo "- !skip - Skip current video (mods only)"
    echo "- !clear - Clear queue (mods only)"
    echo "- !help - Show commands"
    echo ""
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
