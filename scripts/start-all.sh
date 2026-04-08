#!/bin/bash

# MediSync Start All Services Script
# Startet alle Services für die Entwicklung/Produktion
#
# Verwendung:
#   ./scripts/start-all.sh [options]
#
# Options:
#   --production    Startet im Produktionsmodus
#   --skip-redis    Überspringt Redis Start (wenn extern verwaltet)
#   --docker        Nutzt Docker Compose für alle Services
#   --attach        Hängt an Container an (nur mit --docker)
#   --help          Zeigt diese Hilfe

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Konfiguration
MODE="development"
SKIP_REDIS=false
USE_DOCKER=false
ATTACH=false
API_PORT=${PORT:-3000}
WS_PORT=${WS_PORT:-8080}
REDIS_PORT=${REDIS_PORT:-6379}

# Prozess IDs
declare -a SERVICE_PIDS

# Logging Funktionen
log_header() {
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Hilfe anzeigen
show_help() {
    head -n 16 "$0" | tail -n 14
    exit 0
}

# Argumente parsen
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --production)
                MODE="production"
                shift
                ;;
            --skip-redis)
                SKIP_REDIS=true
                shift
                ;;
            --docker)
                USE_DOCKER=true
                shift
                ;;
            --attach)
                ATTACH=true
                shift
                ;;
            --help)
                show_help
                ;;
            *)
                log_error "Unbekannte Option: $1"
                show_help
                ;;
        esac
    done
}

# Prüfe Voraussetzungen
check_prerequisites() {
    log_step "Prüfe Voraussetzungen..."
    
    # Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js ist nicht installiert"
        exit 1
    fi
    
    local node_version=$(node --version)
    log_success "Node.js: $node_version"
    
    # npm
    if ! command -v npm &> /dev/null; then
        log_error "npm ist nicht installiert"
        exit 1
    fi
    
    local npm_version=$(npm --version)
    log_success "npm: $npm_version"
    
    # Docker (wenn benötigt)
    if [ "$USE_DOCKER" = true ] || [ "$SKIP_REDIS" = false ]; then
        if ! command -v docker &> /dev/null; then
            log_warning "Docker ist nicht installiert - Redis muss manuell gestartet werden"
        else
            log_success "Docker: verfügbar"
        fi
    fi
    
    # Prüfe .env Dateien
    if [ ! -f "backend/.env" ] && [ ! -f "backend/.env.example" ]; then
        log_warning "Keine .env Datei im Backend gefunden"
    fi
}

# Redis starten
start_redis() {
    if [ "$SKIP_REDIS" = true ]; then
        log_info "Redis wird übersprungen (--skip-redis)"
        return 0
    fi
    
    log_step "Starte Redis..."
    
    # Prüfe ob Redis bereits läuft
    if nc -z localhost $REDIS_PORT 2>/dev/null; then
        log_warning "Redis läuft bereits auf Port $REDIS_PORT"
        return 0
    fi
    
    if [ "$USE_DOCKER" = true ]; then
        # Docker Compose verwenden
        if [ -f "docker-compose.yml" ]; then
            docker-compose up -d redis
            log_success "Redis via Docker Compose gestartet"
        else
            # Einzelnen Container starten
            docker run -d \
                --name medisync-redis \
                -p $REDIS_PORT:6379 \
                --restart unless-stopped \
                redis:7-alpine \
                redis-server --appendonly yes > /dev/null 2>&1
            log_success "Redis Container gestartet"
        fi
    else
        # Direkter Redis Start oder Docker
        if command -v redis-server &> /dev/null; then
            redis-server --daemonize yes --port $REDIS_PORT
            log_success "Redis Server gestartet (lokal)"
        elif command -v docker &> /dev/null; then
            docker run -d \
                --name medisync-redis \
                -p $REDIS_PORT:6379 \
                --restart unless-stopped \
                redis:7-alpine \
                redis-server --appendonly yes > /dev/null 2>&1
            log_success "Redis Container gestartet"
        else
            log_error "Redis nicht gefunden. Bitte installiere Redis oder Docker."
            exit 1
        fi
    fi
    
    # Warte auf Redis
    sleep 2
    
    # Verifiziere Redis
    if command -v redis-cli &> /dev/null; then
        if redis-cli -p $REDIS_PORT ping | grep -q PONG; then
            log_success "Redis ist bereit (Port $REDIS_PORT)"
        else
            log_error "Redis antwortet nicht"
            exit 1
        fi
    elif command -v docker &> /dev/null; then
        if docker exec medisync-redis redis-cli ping | grep -q PONG; then
            log_success "Redis Container ist bereit"
        fi
    fi
}

# Backend API starten
start_api() {
    log_step "Starte API Server..."
    
    cd backend
    
    # Installiere Abhängigkeiten falls nötig
    if [ ! -d "node_modules" ]; then
        log_info "Installiere Backend Abhängigkeiten..."
        npm install
    fi
    
    # Erstelle .env falls nicht vorhanden
    if [ ! -f ".env" ] && [ -f ".env.example" ]; then
        log_warning "Erstelle .env aus .env.example"
        cp .env.example .env
    fi
    
    if [ "$MODE" = "production" ]; then
        # Produktionsmodus
        if [ ! -d "dist" ]; then
            log_info "Baue Backend..."
            npm run build
        fi
        
        PORT=$API_PORT REDIS_URL="redis://localhost:$REDIS_PORT" \
            npm start > ../logs/api.log 2>&1 &
    else
        # Entwicklungsmodus
        PORT=$API_PORT REDIS_URL="redis://localhost:$REDIS_PORT" \
            npm run dev > ../logs/api.log 2>&1 &
    fi
    
    local api_pid=$!
    SERVICE_PIDS+=($api_pid)
    log_info "API Server gestartet (PID: $api_pid)"
    
    cd ..
}

# WebSocket Server starten
start_websocket() {
    log_step "Starte WebSocket Server..."
    
    # WebSocket läuft im selben Prozess wie API
    log_info "WebSocket ist Teil des API Servers (Port $WS_PORT)"
}

# Worker starten
start_worker() {
    log_step "Starte Worker..."
    
    cd backend
    
    # Worker läuft im selben Prozess in dev, aber separat in production
    if [ "$MODE" = "production" ]; then
        REDIS_URL="redis://localhost:$REDIS_PORT" \
            node dist/worker/index.js > ../logs/worker.log 2>&1 &
        local worker_pid=$!
        SERVICE_PIDS+=($worker_pid)
        log_info "Worker gestartet (PID: $worker_pid)"
    else
        log_info "Worker läuft im Entwicklungsmodus automatisch"
    fi
    
    cd ..
}

# Discord Bot starten
start_bot() {
    log_step "Starte Discord Bot..."
    
    cd bot/discord
    
    # Installiere Abhängigkeiten falls nötig
    if [ ! -d "node_modules" ]; then
        log_info "Installiere Bot Abhängigkeiten..."
        npm install
    fi
    
    # Erstelle .env falls nicht vorhanden
    if [ ! -f ".env" ] && [ -f ".env.example" ]; then
        log_warning "Erstelle .env aus .env.example"
        cp .env.example .env
        log_warning "Bitte konfiguriere DISCORD_TOKEN in bot/discord/.env!"
    fi
    
    API_BASE_URL="http://localhost:$API_PORT" \
    WEBSOCKET_URL="ws://localhost:$WS_PORT" \
        npm run dev > ../../logs/bot.log 2>&1 &
    
    local bot_pid=$!
    SERVICE_PIDS+=($bot_pid)
    log_info "Discord Bot gestartet (PID: $bot_pid)"
    
    cd ../..
}

# Warte auf Services
wait_for_services() {
    log_step "Warte auf Services..."
    
    local max_attempts=30
    local attempt=0
    
    # API Health Check
    log_info "Warte auf API..."
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:$API_PORT/health >/dev/null 2>&1; then
            log_success "API ist bereit (http://localhost:$API_PORT)"
            break
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    
    if [ $attempt -eq $max_attempts ]; then
        log_error "API Server startet nicht"
        return 1
    fi
    
    # WebSocket Check
    log_info "Warte auf WebSocket..."
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost $WS_PORT 2>/dev/null; then
            log_success "WebSocket ist bereit (ws://localhost:$WS_PORT)"
            break
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
}

# Zeige Status
show_status() {
    echo ""
    log_header "MediSync Services Status"
    
    # Redis
    if nc -z localhost $REDIS_PORT 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Redis         : redis://localhost:$REDIS_PORT"
    else
        echo -e "  ${RED}✗${NC} Redis         : nicht erreichbar"
    fi
    
    # API
    if curl -s http://localhost:$API_PORT/health >/dev/null 2>&1; then
        local api_status=$(curl -s http://localhost:$API_PORT/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        echo -e "  ${GREEN}✓${NC} API Server    : http://localhost:$API_PORT (Status: $api_status)"
    else
        echo -e "  ${RED}✗${NC} API Server    : nicht erreichbar"
    fi
    
    # WebSocket
    if nc -z localhost $WS_PORT 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} WebSocket     : ws://localhost:$WS_PORT"
    else
        echo -e "  ${RED}✗${NC} WebSocket     : nicht erreichbar"
    fi
    
    # Bot
    local bot_running=false
    for pid in "${SERVICE_PIDS[@]}"; do
        if ps -p $pid | grep -q node; then
            bot_running=true
            break
        fi
    done
    
    if [ "$bot_running" = true ]; then
        echo -e "  ${GREEN}✓${NC} Discord Bot   : läuft"
    else
        echo -e "  ${YELLOW}⚠${NC} Discord Bot   : Status unbekannt"
    fi
    
    echo ""
    echo -e "${CYAN}Verfügbare Endpoints:${NC}"
    echo -e "  • API Docs      : http://localhost:$API_PORT/"
    echo -e "  • Health Check  : http://localhost:$API_PORT/health"
    echo -e "  • Jobs API      : http://localhost:$API_PORT/api/jobs"
    echo -e "  • Metrics       : http://localhost:$API_PORT/api/metrics"
    echo -e "  • WebSocket     : ws://localhost:$WS_PORT"
    
    echo ""
    echo -e "${CYAN}Nützliche Befehle:${NC}"
    echo -e "  • Logs ansehen  : tail -f logs/api.log logs/bot.log"
    echo -e "  • Stoppen       : ./scripts/stop-all.sh"
    echo -e "  • Tests         : ./scripts/test-e2e.sh"
    echo -e "  • Status        : ./scripts/status.sh"
}

# Speichere PIDs
save_pids() {
    mkdir -p .medisync
    echo "${SERVICE_PIDS[*]}" > .medisync/pids
    echo "$MODE" > .medisync/mode
}

# Setup Logs Directory
setup_logs() {
    mkdir -p logs
    
    # Log Rotation (behalte nur die letzten 5 Dateien)
    if [ -f "logs/api.log" ]; then
        mv logs/api.log logs/api.log.1 2>/dev/null || true
        mv logs/api.log.1 logs/api.log.2 2>/dev/null || true
        mv logs/api.log.2 logs/api.log.3 2>/dev/null || true
        rm -f logs/api.log.4 2>/dev/null || true
    fi
}

# Hauptfunktion
main() {
    parse_args "$@"
    
    log_header "MediSync Agenten-Plattform - Start Services"
    echo -e "  Modus: ${CYAN}$MODE${NC}"
    echo ""
    
    # Setup
    setup_logs
    
    # Starte Services
    check_prerequisites
    start_redis
    start_api
    start_worker
    start_bot
    
    # Warte auf Bereitschaft
    wait_for_services
    
    # Speichere PIDs und zeige Status
    save_pids
    show_status
    
    # Fertig
    log_success "Alle Services gestartet!"
    
    # Bei --attach warte auf Ctrl+C
    if [ "$ATTACH" = true ]; then
        echo ""
        log_info "Drücke Ctrl+C zum beenden..."
        trap './scripts/stop-all.sh' INT
        wait
    fi
}

# Starte Hauptfunktion
main "$@"
