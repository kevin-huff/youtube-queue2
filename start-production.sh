#!/bin/bash

# YouTube Queue - Production Startup Script
# For standalone production environments

set -e  # Exit on any error

echo "🚀 Starting YouTube Queue (Production Mode)..."
echo "=============================================="

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

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_warning "Running as root. Consider using a non-root user for production."
fi

# Check Node.js version
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 16 or higher."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js version 16 or higher is required. Current version: $(node -v)"
    exit 1
fi

print_status "Node.js $(node -v) found"

# Function to setup production environment
setup_production_env() {
    print_info "Setting up production environment..."
    
    # Create server .env if it doesn't exist
    if [ ! -f "server/.env" ]; then
        print_info "Creating production server/.env..."
        cp .env.example server/.env
        
        # Set production defaults
        sed -i.bak 's|NODE_ENV="development"|NODE_ENV="production"|' server/.env
        sed -i.bak 's|CORS_ORIGIN="http://localhost:3000"|CORS_ORIGIN="*"|' server/.env
        
        # Generate secure secrets
        JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "prod_jwt_secret_$(date +%s)")
        ADMIN_PASSWORD=$(openssl rand -base64 16 2>/dev/null || echo "admin$(date +%s)")
        
        sed -i.bak "s|JWT_SECRET=\"your_super_secret_jwt_key_here\"|JWT_SECRET=\"$JWT_SECRET\"|" server/.env
        sed -i.bak "s|ADMIN_PASSWORD=\"your_secure_admin_password\"|ADMIN_PASSWORD=\"$ADMIN_PASSWORD\"|" server/.env
        
        # Use SQLite for standalone deployment
        mkdir -p server/data
        sed -i.bak 's|DATABASE_URL="postgresql://username:password@localhost:5432/youtube_queue"|DATABASE_URL="file:./data/prod.db"|' server/.env
        
        rm -f server/.env.bak
        
        print_warning "Generated admin password: $ADMIN_PASSWORD"
        print_warning "Save this password securely!"
        
        # Save credentials to file
        echo "Admin Password: $ADMIN_PASSWORD" > .admin-credentials
        echo "JWT Secret: $JWT_SECRET" >> .admin-credentials
        chmod 600 .admin-credentials
        print_info "Credentials saved to .admin-credentials (secure file)"
    else
        print_status "Production .env file already exists"
    fi
    
    # Update NODE_ENV to production if not set
    if ! grep -q "NODE_ENV=\"production\"" server/.env; then
        if grep -q "NODE_ENV=" server/.env; then
            sed -i.bak 's|NODE_ENV="development"|NODE_ENV="production"|' server/.env
            rm -f server/.env.bak
        else
            echo 'NODE_ENV="production"' >> server/.env
        fi
        print_info "Set NODE_ENV to production"
    fi
}

# Function to install production dependencies
install_production_deps() {
    print_info "Installing production dependencies..."
    
    # Clean install for production
    npm ci --only=production
    cd server && npm ci --only=production && cd ..
    cd client && npm ci --only=production && cd ..
    
    print_status "Production dependencies installed"
}

# Function to build application
build_application() {
    print_info "Building application for production..."
    
    # Build client
    cd client
    npm run build
    cd ..
    
    print_status "Application built successfully"
}

# Function to setup database
setup_production_database() {
    print_info "Setting up production database..."
    
    cd server
    
    # Generate Prisma client
    npx prisma generate
    
    # Run database migrations
    npx prisma db push
    
    cd ..
    print_status "Production database ready"
}

# Function to create systemd service (Linux only)
create_systemd_service() {
    if [ -f "/etc/systemd/system/youtube-queue.service" ]; then
        print_info "Systemd service already exists"
        return
    fi
    
    if command -v systemctl &> /dev/null; then
        print_info "Creating systemd service..."
        
        cat > youtube-queue.service << EOF
[Unit]
Description=YouTube Queue Bot
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$(pwd)
ExecStart=$(which node) server/src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
        
        print_info "Systemd service file created: youtube-queue.service"
        print_info "To install: sudo mv youtube-queue.service /etc/systemd/system/"
        print_info "Then run: sudo systemctl enable youtube-queue && sudo systemctl start youtube-queue"
    fi
}

# Function to start production server
start_production() {
    print_info "Starting production server..."
    
    # Kill any existing processes
    pkill -f "node.*server/src/index.js" || true
    sleep 2
    
    # Start the server
    cd server
    NODE_ENV=production nohup node src/index.js > ../production.log 2>&1 &
    SERVER_PID=$!
    cd ..
    
    # Wait a moment for startup
    sleep 3
    
    # Check if server started successfully
    if kill -0 $SERVER_PID 2>/dev/null; then
        print_status "Production server started successfully (PID: $SERVER_PID)"
        echo $SERVER_PID > .server.pid
        
        # Test health endpoint
        if command -v curl &> /dev/null; then
            sleep 2
            if curl -s http://localhost:5000/api/health >/dev/null; then
                print_status "Health check passed"
            else
                print_warning "Health check failed, but server is running"
            fi
        fi
    else
        print_error "Failed to start production server"
        cat production.log
        exit 1
    fi
}

# Function to show production info
show_production_info() {
    echo ""
    echo "🎯 Production Deployment Complete"
    echo "================================="
    echo ""
    echo "📱 Access URLs:"
    echo "- Application: http://localhost:5000"
    echo "- API Health: http://localhost:5000/api/health"
    echo "- Queue API: http://localhost:5000/api/queue/status"
    echo ""
    echo "📊 Monitoring:"
    echo "- Logs: tail -f production.log"
    echo "- Process: ps aux | grep 'node.*server'"
    echo "- PID file: .server.pid"
    echo ""
    echo "🔧 Management Commands:"
    echo "- Stop: kill \$(cat .server.pid)"
    echo "- Restart: ./start-production.sh"
    echo "- Logs: tail -f production.log"
    echo ""
    if [ -f ".admin-credentials" ]; then
        echo "🔐 Admin Credentials:"
        cat .admin-credentials
        echo ""
    fi
    echo "⚠️  For Twitch integration, edit server/.env with:"
    echo "   TWITCH_USERNAME, TWITCH_OAUTH_TOKEN, TWITCH_CHANNEL"
    echo ""
}

# Function to create startup script for process managers
create_pm2_config() {
    if command -v pm2 &> /dev/null; then
        print_info "Creating PM2 configuration..."
        
        cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'youtube-queue',
    script: './server/src/index.js',
    cwd: '$(pwd)',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
EOF
        
        mkdir -p logs
        print_info "PM2 config created. Use: pm2 start ecosystem.config.js"
    fi
}

# Main execution
main() {
    setup_production_env
    install_production_deps
    build_application
    setup_production_database
    create_systemd_service
    create_pm2_config
    start_production
    show_production_info
}

# Handle Ctrl+C gracefully
trap 'echo -e "\n${YELLOW}Shutting down production server...${NC}"; if [ -f ".server.pid" ]; then kill $(cat .server.pid) 2>/dev/null || true; rm -f .server.pid; fi; exit 0' INT

# Check for stop command
if [ "$1" = "stop" ]; then
    if [ -f ".server.pid" ]; then
        PID=$(cat .server.pid)
        print_info "Stopping production server (PID: $PID)..."
        kill $PID 2>/dev/null || true
        rm -f .server.pid
        print_status "Production server stopped"
    else
        print_warning "No PID file found. Server may not be running."
    fi
    exit 0
fi

# Check for restart command
if [ "$1" = "restart" ]; then
    if [ -f ".server.pid" ]; then
        PID=$(cat .server.pid)
        print_info "Restarting production server..."
        kill $PID 2>/dev/null || true
        rm -f .server.pid
        sleep 2
    fi
    start_production
    print_status "Production server restarted"
    exit 0
fi

# Check for status command
if [ "$1" = "status" ]; then
    if [ -f ".server.pid" ]; then
        PID=$(cat .server.pid)
        if kill -0 $PID 2>/dev/null; then
            print_status "Production server is running (PID: $PID)"
            if command -v curl &> /dev/null; then
                curl -s http://localhost:5000/api/health | python3 -m json.tool 2>/dev/null || echo "Health check endpoint not responding"
            fi
        else
            print_error "Production server is not running (stale PID file)"
            rm -f .server.pid
        fi
    else
        print_warning "Production server is not running"
    fi
    exit 0
fi

# Run main function
main
