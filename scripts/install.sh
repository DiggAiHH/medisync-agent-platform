#!/bin/bash

# MediSync Agenten-Plattform - Installations-Script
# ================================================

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging Funktionen
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

# Banner anzeigen
show_banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║        MediSync Agenten-Plattform Installer              ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  Eine Multi-Agent Platform mit Discord Bot & Dashboard   ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
}

# Prüfe ob Befehl existiert
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Prüfe System-Voraussetzungen
check_prerequisites() {
    log_info "Prüfe System-Voraussetzungen..."
    
    local missing_deps=()
    
    # Node.js prüfen
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            log_error "Node.js Version 18+ erforderlich (gefunden: $(node --version))"
            missing_deps+=("Node.js 18+")
        else
            log_success "Node.js $(node --version) gefunden"
        fi
    else
        log_error "Node.js nicht gefunden"
        missing_deps+=("Node.js 18+")
    fi
    
    # npm prüfen
    if command_exists npm; then
        log_success "npm $(npm --version) gefunden"
    else
        log_error "npm nicht gefunden"
        missing_deps+=("npm")
    fi
    
    # Docker prüfen (optional)
    if command_exists docker; then
        log_success "Docker gefunden"
        if command_exists docker-compose; then
            log_success "Docker Compose gefunden"
        else
            log_warning "Docker Compose nicht gefunden (optional, aber empfohlen)"
        fi
    else
        log_warning "Docker nicht gefunden (optional, aber empfohlen für Production)"
    fi
    
    # Git prüfen
    if command_exists git; then
        log_success "Git gefunden"
    else
        log_warning "Git nicht gefunden (optional)"
    fi
    
    # Redis prüfen (lokal)
    if command_exists redis-cli; then
        log_success "Redis CLI gefunden"
    else
        log_warning "Redis CLI nicht gefunden (wird via Docker bereitgestellt)"
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        echo ""
        log_error "Fehlende Abhängigkeiten:"
        for dep in "${missing_deps[@]}"; do
            echo "  - $dep"
        done
        echo ""
        log_info "Installationsanleitung:"
        echo "  • Node.js: https://nodejs.org/ (LTS Version empfohlen)"
        echo "  • Docker:  https://docs.docker.com/get-docker/"
        echo ""
        exit 1
    fi
    
    log_success "Alle Voraussetzungen erfüllt!"
    echo ""
}

# Erstelle .env Dateien
setup_env_files() {
    log_info "Richte Umgebungsvariablen ein..."
    
    # Root .env
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            log_success ".env Datei erstellt"
        else
            log_warning ".env.example nicht gefunden"
        fi
    else
        log_warning ".env existiert bereits (übersprungen)"
    fi
    
    # Backend .env
    if [ ! -f backend/.env ]; then
        if [ -f backend/.env.example ]; then
            cp backend/.env.example backend/.env
            log_success "backend/.env erstellt"
        fi
    fi
    
    # Bot .env
    if [ ! -f bot/discord/.env ]; then
        if [ -f bot/discord/.env.example ]; then
            cp bot/discord/.env.example bot/discord/.env
            log_success "bot/discord/.env erstellt"
        fi
    fi
    
    # Dashboard .env
    if [ ! -f dashboard/.env ]; then
        if [ -f dashboard/.env.example ]; then
            cp dashboard/.env.example dashboard/.env
            log_success "dashboard/.env erstellt"
        fi
    fi
    
    echo ""
}

# Installiere Dependencies
install_dependencies() {
    log_info "Installiere Dependencies..."
    echo ""
    
    # Root Dependencies
    log_info "📦 Installiere Root Dependencies..."
    npm install
    
    # Backend Dependencies
    log_info "📦 Installiere Backend Dependencies..."
    cd backend
    npm install
    cd ..
    
    # Bot Dependencies
    log_info "📦 Installiere Bot Dependencies..."
    cd bot/discord
    npm install
    cd ../..
    
    # Dashboard Dependencies
    log_info "📦 Installiere Dashboard Dependencies..."
    cd dashboard
    npm install
    cd ..
    
    log_success "Alle Dependencies installiert!"
    echo ""
}

# Baue Projekte
build_projects() {
    log_info "Baue Projekte..."
    echo ""
    
    # Build Backend
    log_info "🔨 Baue Backend..."
    cd backend
    npm run build
    cd ..
    
    # Build Bot
    log_info "🔨 Baue Bot..."
    cd bot/discord
    npm run build
    cd ../..
    
    # Build Dashboard
    log_info "🔨 Baue Dashboard..."
    cd dashboard
    npm run build
    cd ..
    
    log_success "Alle Projekte gebaut!"
    echo ""
}

# Erstelle notwendige Verzeichnisse
create_directories() {
    log_info "Erstelle Verzeichnisstruktur..."
    
    mkdir -p logs
    mkdir -p backups
    mkdir -p monitoring/grafana/dashboards
    mkdir -p monitoring/grafana/datasources
    
    log_success "Verzeichnisse erstellt"
    echo ""
}

# Zeige nächste Schritte
show_next_steps() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║              🎉 Installation Abgeschlossen!              ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║                                                          ║"
    echo "║  Nächste Schritte:                                       ║"
    echo "║                                                          ║"
    echo "║  1. Konfiguriere .env Dateien:                           ║"
    echo "║     ${YELLOW}nano .env${NC}                                    ║"
    echo "║                                                          ║"
    echo "║  2. Discord Bot Token eintragen in:                      ║"
    echo "║     ${YELLOW}nano bot/discord/.env${NC}                          ║"
    echo "║                                                          ║"
    echo "║  3. Starte mit Docker (empfohlen):                       ║"
    echo "║     ${GREEN}make start${NC}                                     ║"
    echo "║                                                          ║"
    echo "║  ODER starte im Development Modus:                       ║"
    echo "║     ${GREEN}make dev-all${NC}                                   ║"
    echo "║                                                          ║"
    echo "║  4. Öffne das Dashboard:                                 ║"
    echo "║     ${BLUE}http://localhost:5173${NC}                           ║"
    echo "║                                                          ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  Hilfreiche Befehle:                                     ║"
    echo "║    ${GREEN}make help${NC}      - Zeige alle Befehle               ║"
    echo "║    ${GREEN}make status${NC}    - Zeige Service Status            ║"
    echo "║    ${GREEN}make health${NC}    - Prüfe Service Gesundheit        ║"
    echo "║    ${GREEN}make logs${NC}      - Zeige Logs                      ║"
    echo "║                                                          ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
}

# Hauptfunktion
main() {
    show_banner
    check_prerequisites
    setup_env_files
    create_directories
    install_dependencies
    
    # Frage ob gebaut werden soll
    echo -n "Möchtest du die Projekte jetzt bauen? (j/N): "
    read -r response
    if [[ "$response" =~ ^([jJ][aA]|[jJ])$ ]]; then
        build_projects
    else
        log_info "Build übersprungen (führe später 'make build' aus)"
    fi
    
    show_next_steps
}

# Starte Hauptfunktion
main "$@"
