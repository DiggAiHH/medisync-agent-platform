#!/bin/bash

# MediSync Agenten-Plattform - Deployment Script
# ==============================================

set -e

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Konfiguration
DEPLOY_ENV=${1:-production}
CODESPACE_NAME=${CODESPACE_NAME:-}
GITHUB_TOKEN=${GITHUB_TOKEN:-}

show_banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║          MediSync Deployment Script                      ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  Environment: ${DEPLOY_ENV}"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
}

# Prüfe GitHub Codespaces
detect_environment() {
    log_step "Erkenne Deployment-Umgebung..."
    
    if [ -n "$CODESPACE_NAME" ]; then
        log_success "GitHub Codespace erkannt: $CODESPACE_NAME"
        DEPLOY_TARGET="codespaces"
    elif [ -f "/.dockerenv" ]; then
        log_success "Docker Container erkannt"
        DEPLOY_TARGET="docker"
    else
        log_info "Lokale Umgebung erkannt"
        DEPLOY_TARGET="local"
    fi
    
    echo ""
}

# Deployment zu GitHub Codespaces
deploy_codespaces() {
    log_step "Deploye zu GitHub Codespaces..."
    
    # Prüfe ob wir in einem Codespace sind
    if [ -z "$CODESPACE_NAME" ]; then
        log_error "Kein Codespace erkannt. Bist du in einem GitHub Codespace?"
        exit 1
    fi
    
    # Starte Services
    log_info "Starte Docker Services..."
    docker-compose up -d
    
    # Warte auf Gesundheit
    log_info "Warte auf Service Gesundheit..."
    sleep 5
    
    # Zeige URLs
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║         🚀 Deployment zu GitHub Codespaces               ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║                                                          ║"
    echo "║  🌐 Öffentliche URLs:                                    ║"
    echo "║                                                          ║"
    echo "║  • API:       https://${CODESPACE_NAME}-3000.github.dev"
    echo "║  • WebSocket: wss://${CODESPACE_NAME}-8080.github.dev"
    echo "║  • Dashboard: https://${CODESPACE_NAME}-5173.github.dev"
    echo "║                                                          ║"
    echo "║  ⚠️  Port Forwarding muss in VS Code aktiviert sein!     ║"
    echo "║                                                          ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    
    # Ports im Codespace forwarden
    if command -v gh >/dev/null 2>&1; then
        log_info "Versuche Ports zu forwarden..."
        gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" 2>/dev/null || true
        gh codespace ports visibility 5173:public -c "$CODESPACE_NAME" 2>/dev/null || true
    fi
}

# Lokales Docker Deployment
deploy_docker() {
    log_step "Starte Docker Deployment..."
    
    # Baue Images
    log_info "Baue Docker Images..."
    docker-compose build --parallel
    
    # Starte Services
    log_info "Starte Services..."
    docker-compose up -d
    
    # Warte auf Gesundheit
    log_info "Warte auf Service Gesundheit..."
    sleep 5
    
    # Führe Health Check durch
    ./scripts/health-check.sh
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "╔══════════════════════════════════════════════════════════╗"
        echo "║         🚀 Docker Deployment Erfolgreich                 ║"
        echo "╠══════════════════════════════════════════════════════════╣"
        echo "║                                                          ║"
        echo "║  🌐 Lokale URLs:                                         ║"
        echo "║                                                          ║"
        echo "║  • API:       http://localhost:3000"
        echo "║  • WebSocket: ws://localhost:8080"
        echo "║  • Dashboard: http://localhost:5173"
        echo "║  • Redis:     redis://localhost:6379"
        echo "║                                                          ║"
        echo "║  📊 Logs: make logs                                      ║"
        echo "║  🏥 Health:  make health                                 ║"
        echo "║                                                          ║"
        echo "╚══════════════════════════════════════════════════════════╝"
        echo ""
    else
        log_error "Health Check fehlgeschlagen!"
        log_info "Prüfe Logs mit: make logs"
        exit 1
    fi
}

# Lokales Deployment ohne Docker
deploy_local() {
    log_step "Starte lokales Deployment..."
    
    # Prüfe ob Redis läuft
    if ! redis-cli ping >/dev/null 2>&1; then
        log_warning "Redis scheint nicht zu laufen!"
        log_info "Starte Redis mit: redis-server"
        log_info "ODER nutze Docker: make start"
        exit 1
    fi
    
    # Baue Projekte
    log_info "Baue Projekte..."
    npm run build
    
    # Starte Services mit PM2 oder concurrently
    log_info "Starte Services..."
    
    if command -v pm2 >/dev/null 2>&1; then
        # PM2 Deployment
        log_info "Verwende PM2..."
        pm2 start ecosystem.config.js || pm2 start npm --name "medisync-backend" -- start --prefix backend
    else
        # Fallback zu concurrently im Hintergrund
        log_info "Starte mit npm run start:all..."
        log_warning "Für Production wird PM2 empfohlen: npm install -g pm2"
        nohup npm run start:all > logs/services.log 2>&1 &
        echo $! > .pidfile
    fi
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║         🚀 Lokales Deployment Gestartet                  ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║                                                          ║"
    echo "║  🌐 Lokale URLs:                                         ║"
    echo "║                                                          ║"
    echo "║  • API:       http://localhost:3000"
    echo "║  • WebSocket: ws://localhost:8080"
    echo "║  • Dashboard: http://localhost:5173"
    echo "║                                                          ║"
    echo "║  📄 Logs: logs/services.log                              ║"
    echo "║                                                          ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
}

# Production Deployment
deploy_production() {
    log_step "Starte Production Deployment..."
    
    log_info "Führe Tests durch..."
    npm test
    
    log_info "Baue Production Images..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml build
    
    log_info "Starte Production Stack..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    
    log_info "Führe Migrationen durch..."
    # Hier können DB Migrationen laufen
    
    log_info "Prüfe Gesundheit..."
    sleep 10
    ./scripts/health-check.sh
    
    log_success "Production Deployment abgeschlossen!"
}

# Zeige Hilfe
show_help() {
    echo "Verwendung: ./scripts/deploy.sh [ENVIRONMENT]"
    echo ""
    echo "Environments:"
    echo "  local       - Lokales Deployment ohne Docker"
    echo "  docker      - Lokales Docker Deployment (default)"
    echo "  codespaces  - GitHub Codespaces Deployment"
    echo "  production  - Production Deployment"
    echo ""
    echo "Beispiele:"
    echo "  ./scripts/deploy.sh docker      # Lokales Docker"
    echo "  ./scripts/deploy.sh codespaces  # GitHub Codespaces"
    echo "  ./scripts/deploy.sh production  # Production"
}

# Hauptfunktion
main() {
    show_banner
    
    # Parse Argumente
    case "${1:-}" in
        -h|--help|help)
            show_help
            exit 0
            ;;
    esac
    
    detect_environment
    
    # Deployment basierend auf Target oder Argument
    case "$DEPLOY_TARGET" in
        codespaces)
            deploy_codespaces
            ;;
        docker)
            deploy_docker
            ;;
        local)
            if [ "$DEPLOY_ENV" = "production" ]; then
                deploy_production
            else
                deploy_local
            fi
            ;;
        *)
            log_error "Unbekanntes Deployment Target: $DEPLOY_TARGET"
            exit 1
            ;;
    esac
}

main "$@"
