#!/bin/bash

# YouTube Queue - Production Startup Script
# For standalone production environments

set -e  # Exit on any error

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


# Read a KEY="value" (or KEY=value) entry from server/.env
read_env_value() {
    local key="$1"
    [ -f "server/.env" ] || return 1
    grep -E "^${key}=" server/.env | head -n1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//'
}

# Resolve DATABASE_URL from the environment or server/.env and validate it.
# Never falls back to SQLite — the Prisma schema requires PostgreSQL.
require_database_url() {
    local db_url="${DATABASE_URL:-}"
    if [ -z "$db_url" ]; then
        db_url="$(read_env_value DATABASE_URL || true)"
    fi

    if [ -z "$db_url" ]; then
        print_error "DATABASE_URL is not set."
        echo ""
        echo "The Prisma schema (server/prisma/schema.prisma) requires a PostgreSQL database."
        echo "Set DATABASE_URL in server/.env (or export it in the environment), e.g.:"
        echo ""
        echo '  DATABASE_URL="postgresql://user:password@localhost:5432/youtube_queue"'
        echo ""
        exit 1
    fi

    case "$db_url" in
        postgres://*|postgresql://*)
            ;;
        *)
            print_error "DATABASE_URL must be a PostgreSQL connection string (postgresql://...)."
            echo ""
            echo "Found a non-PostgreSQL DATABASE_URL (e.g. a SQLite file: URL will not work —"
            echo "server/prisma/schema.prisma declares provider \"postgresql\")."
            echo "Update DATABASE_URL in server/.env, e.g.:"
            echo ""
            echo '  DATABASE_URL="postgresql://user:password@localhost:5432/youtube_queue"'
            echo ""
            exit 1
            ;;
    esac
}

# Check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        print_warning "Running as root. Consider using a non-root user for production."
    fi
}

# Check Node.js version
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 20 or higher."
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        print_error "Node.js version 20 or higher is required. Current version: $(node -v)"
        exit 1
    fi

    print_status "Node.js $(node -v) found"
}

# Function to setup production environment
setup_production_env() {
    print_info "Setting up production environment..."

    # Create server .env if it doesn't exist
    if [ ! -f "server/.env" ]; then
        print_info "Creating production server/.env..."

        if [ -z "${DATABASE_URL:-}" ]; then
            print_error "DATABASE_URL is not set and server/.env does not exist."
            echo ""
            echo "This script will not default to SQLite — the Prisma schema requires PostgreSQL."
            echo "Export DATABASE_URL before running, e.g.:"
            echo ""
            echo '  export DATABASE_URL="postgresql://user:password@localhost:5432/youtube_queue"'
            echo "  ./start-production.sh"
            echo ""
            echo "Or create server/.env yourself (see .env.example) with a PostgreSQL DATABASE_URL."
            exit 1
        fi

        # Secure secret generation is mandatory — no predictable fallbacks.
        if ! command -v openssl &> /dev/null; then
            print_error "openssl is required to generate secure secrets but was not found."
            echo "Install openssl and re-run, or create server/.env manually with strong secrets."
            exit 1
        fi

        cp .env.example server/.env
        chmod 600 server/.env

        # Set production defaults
        sed -i.bak 's|NODE_ENV="development"|NODE_ENV="production"|' server/.env
        # Note: Set CORS_ORIGIN in server/.env to your production domain

        # Generate secure secrets
        JWT_SECRET=$(openssl rand -hex 32)
        SESSION_SECRET=$(openssl rand -hex 32)
        JUDGE_TOKEN_SECRET=$(openssl rand -hex 32)

        sed -i.bak "s|JWT_SECRET=\"your_super_secret_jwt_key_here\"|JWT_SECRET=\"$JWT_SECRET\"|" server/.env
        sed -i.bak "s|SESSION_SECRET=\"your_session_secret_here\"|SESSION_SECRET=\"$SESSION_SECRET\"|" server/.env
        sed -i.bak "s|JUDGE_TOKEN_SECRET=\"your_judge_token_secret_here\"|JUDGE_TOKEN_SECRET=\"$JUDGE_TOKEN_SECRET\"|" server/.env

        # Use the PostgreSQL database provided via the environment. Written
        # without sed: connection URLs routinely contain characters like '&'
        # or '|' that corrupt sed replacements.
        grep -v '^DATABASE_URL=' server/.env > server/.env.tmp
        printf 'DATABASE_URL="%s"\n' "$DATABASE_URL" >> server/.env.tmp
        mv server/.env.tmp server/.env
        chmod 600 server/.env

        rm -f server/.env.bak

        print_status "Generated secrets written to server/.env (mode 600) — the only copy; back it up securely."
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

    # Validate the resulting database configuration
    require_database_url
}

# Function to install production dependencies
install_production_deps() {
    print_info "Installing dependencies..."

    # Root npm ci installs all workspaces (server + client) from the single lockfile.
    # Dev dependencies are included because the build (react-scripts) and database
    # steps (prisma CLI) need them.
    npm ci

    print_status "Dependencies installed"
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

    # Apply committed migrations (never db push in production)
    npx prisma migrate deploy

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

    # Refuse to start if a previous instance is still running (PID file only —
    # never kill processes by pattern matching).
    if [ -f ".server.pid" ]; then
        EXISTING_PID=$(cat .server.pid)
        if kill -0 "$EXISTING_PID" 2>/dev/null; then
            print_error "Server already running (PID: $EXISTING_PID)."
            echo "Use './start-production.sh restart' or './start-production.sh stop' first."
            exit 1
        else
            print_warning "Removing stale PID file (.server.pid)"
            rm -f .server.pid
        fi
    fi

    # Refuse to start if something is already listening on the server port
    # (covers instances started outside this script / without a PID file).
    SERVER_PORT="${PORT:-5000}"
    if command -v ss &> /dev/null && ss -ltn 2>/dev/null | grep -q ":${SERVER_PORT} "; then
        print_error "Port ${SERVER_PORT} is already in use — another server instance may be running."
        echo "Find it with: ss -ltnp | grep :${SERVER_PORT}"
        echo "Stop it manually, then re-run this script."
        exit 1
    fi

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

# Function to stop production server (PID file only — no pattern-based kills)
stop_production() {
    if [ ! -f ".server.pid" ]; then
        print_error "No PID file (.server.pid) found — cannot determine which process to stop."
        echo "If the server is running without a PID file, find it with 'ps aux | grep node'"
        echo "and stop it manually, then remove any stale .server.pid."
        return 1
    fi

    PID=$(cat .server.pid)
    if kill -0 "$PID" 2>/dev/null; then
        print_info "Stopping production server (PID: $PID)..."
        kill "$PID"
        # Give it a few seconds to shut down gracefully
        for _ in 1 2 3 4 5; do
            if ! kill -0 "$PID" 2>/dev/null; then
                break
            fi
            sleep 1
        done
        if kill -0 "$PID" 2>/dev/null; then
            print_warning "Server (PID: $PID) did not exit after 5s. Stop it manually: kill -9 $PID"
            return 1
        fi
        print_status "Production server stopped"
    else
        print_warning "Server not running (stale PID file removed)"
    fi
    rm -f .server.pid
    return 0
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
    echo "- Status: ./start-production.sh status"
    echo "- PID file: .server.pid"
    echo ""
    echo "🔧 Management Commands:"
    echo "- Stop: ./start-production.sh stop"
    echo "- Restart: ./start-production.sh restart"
    echo "- Logs: tail -f production.log"
    echo ""
    echo "🔐 Secrets live in server/.env (mode 600 — keep it secret)"
    echo ""
    echo "⚠️  For Twitch integration, edit server/.env with:"
    echo "   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_BOT_USERNAME, TWITCH_BOT_OAUTH_TOKEN"
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
    echo "🚀 Starting YouTube Queue (Production Mode)..."
    echo "=============================================="
    check_root
    check_node
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
    if stop_production; then
        exit 0
    else
        exit 1
    fi
fi

# Check for restart command
if [ "$1" = "restart" ]; then
    if [ -f ".server.pid" ]; then
        print_info "Restarting production server..."
        stop_production || true
        sleep 2
    fi
    check_node
    require_database_url
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
