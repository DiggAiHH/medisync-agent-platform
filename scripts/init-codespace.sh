#!/bin/bash
# MediSync Agent Platform - Codespace Initialisierungsskript
# Dieses Skript wird beim Start eines Codespaces ausgeführt

set -e

# ==========================================
# Farben & Formatierung
# ==========================================
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ==========================================
# Hilfsfunktionen
# ==========================================
print_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}              ${BOLD}MediSync Agent Platform${NC}                            ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                   ${GREEN}Codespace Initialisierung${NC}                    ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_section() {
    echo -e "\n${YELLOW}${BOLD}▶ $1${NC}"
    echo -e "${YELLOW}$(printf '=%.0s' {1..60})${NC}"
}

print_success() {
    echo -e "${GREEN}  ✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}  ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}  ⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}  ✗ $1${NC}"
}

# ==========================================
# Service-Status prüfen
# ==========================================
check_service() {
    local name=$1
    local port=$2
    local timeout=${3:-5}
    
    if timeout $timeout bash -c "</dev/tcp/localhost/$port" 2>/dev/null; then
        echo "running"
    else
        echo "stopped"
    fi
}

# ==========================================
# Hauptskript
# ==========================================
main() {
    print_header
    
    # Startzeit speichern
    START_TIME=$(date +%s)
    
    # ==========================================
    # Umgebungsvariablen setzen
    # ==========================================
    print_section "Umgebung konfigurieren"
    
    export NODE_ENV=development
    export REDIS_URL=${REDIS_URL:-"redis://localhost:6379"}
    
    print_success "NODE_ENV=$NODE_ENV"
    print_success "REDIS_URL=$REDIS_URL"
    
    # ==========================================
    # Redis prüfen/starten
    # ==========================================
    print_section "Redis prüfen"
    
    if command -v redis-cli &> /dev/null; then
        if redis-cli ping &>/dev/null; then
            print_success "Redis läuft bereits"
        else
            print_info "Starte Redis..."
            redis-server --daemonize yes
            sleep 1
            if redis-cli ping &>/dev/null; then
                print_success "Redis gestartet"
            else
                print_error "Redis konnte nicht gestartet werden"
            fi
        fi
    else
        print_warning "Redis CLI nicht gefunden - wird Redis im Container laufen?"
    fi
    
    # ==========================================
    # Dependencies prüfen
    # ==========================================
    print_section "Dependencies prüfen"
    
    if [ -d "backend/node_modules" ] && [ -d "dashboard/node_modules" ]; then
        print_success "Dependencies bereits installiert"
    else
        print_info "Installiere Dependencies (erster Start kann dauern)..."
        
        if [ ! -d "backend/node_modules" ]; then
            (cd backend && npm ci --silent) &
            BACKEND_PID=$!
        fi
        
        if [ ! -d "dashboard/node_modules" ]; then
            (cd dashboard && npm ci --silent) &
            DASHBOARD_PID=$!
        fi
        
        if [ ! -d "bot/discord/node_modules" ]; then
            (cd bot/discord && npm ci --silent) &
            BOT_PID=$!
        fi
        
        # Warte auf alle Hintergrundprozesse
        wait $BACKEND_PID 2>/dev/null || true
        wait $DASHBOARD_PID 2>/dev/null || true
        wait $BOT_PID 2>/dev/null || true
        
        print_success "Alle Dependencies installiert"
    fi
    
    # ==========================================
    # Environment Files prüfen
    # ==========================================
    print_section "Environment Files"
    
    # Backend .env
    if [ ! -f "backend/.env" ]; then
        if [ -f "backend/.env.example" ]; then
            cp backend/.env.example backend/.env
            print_success "backend/.env erstellt (aus .env.example)"
            print_warning "Bitte backend/.env anpassen wenn nötig"
        fi
    else
        print_success "backend/.env existiert"
    fi
    
    # Dashboard .env
    if [ ! -f "dashboard/.env" ]; then
        if [ -f "dashboard/.env.example" ]; then
            cp dashboard/.env.example dashboard/.env
            print_success "dashboard/.env erstellt (aus .env.example)"
        fi
    else
        print_success "dashboard/.env existiert"
    fi
    
    # Bot .env
    if [ ! -f "bot/discord/.env" ]; then
        if [ -f "bot/discord/.env.example" ]; then
            cp bot/discord/.env.example bot/discord/.env
            print_success "bot/discord/.env erstellt (aus .env.example)"
            print_warning "Bitte DISCORD_TOKEN in bot/discord/.env setzen"
        fi
    else
        print_success "bot/discord/.env existiert"
    fi
    
    # ==========================================
    # Build-Artefakte prüfen
    # ==========================================
    print_section "Build-Artefakte"
    
    if [ ! -d "backend/dist" ]; then
        print_info "Baue Backend..."
        cd backend && npm run build --silent && cd ..
        print_success "Backend gebaut"
    else
        print_success "Backend bereits gebaut"
    fi
    
    if [ ! -d "code-server/extensions/medical-ai-extension/out" ]; then
        print_info "Baue VS Code Extension..."
        cd code-server/extensions/medical-ai-extension && npm run compile --silent && cd ../../..
        print_success "VS Code Extension gebaut"
    else
        print_success "VS Code Extension bereits gebaut"
    fi
    
    # ==========================================
    # Services automatisch starten (optional)
    # ==========================================
    print_section "Services"
    
    API_STATUS=$(check_service "API" 3000 2)
    DASHBOARD_STATUS=$(check_service "Dashboard" 5173 2)
    
    if [ "$API_STATUS" = "running" ]; then
        print_success "API Server läuft bereits (Port 3000)"
    else
        print_info "API Server ist nicht gestartet"
        print_info "Starte mit: ${CYAN}cd backend && npm run dev${NC}"
    fi
    
    if [ "$DASHBOARD_STATUS" = "running" ]; then
        print_success "Dashboard läuft bereits (Port 5173)"
    else
        print_info "Dashboard ist nicht gestartet"
        print_info "Starte mit: ${CYAN}cd dashboard && npm run dev${NC}"
    fi
    
    # ==========================================
    # Git Konfiguration
    # ==========================================
    print_section "Git Konfiguration"
    
    if [ -z "$(git config --global user.name 2>/dev/null)" ]; then
        git config --global user.name "MediSync Developer"
        print_success "Git user.name gesetzt"
    fi
    
    if [ -z "$(git config --global user.email 2>/dev/null)" ]; then
        git config --global user.email "dev@medisync.local"
        print_success "Git user.email gesetzt"
    fi
    
    git config --global --add safe.directory /workspaces/agents-platform 2>/dev/null || true
    print_success "Git safe.directory konfiguriert"
    
    # ==========================================
    # Verzeichnisse erstellen
    # ==========================================
    print_section "Verzeichnisse"
    
    mkdir -p logs data .tmp
    print_success "Logs-Verzeichnis bereit"
    print_success "Data-Verzeichnis bereit"
    
    # ==========================================
    # URLs anzeigen
    # ==========================================
    print_section "Verfügbare URLs"
    
    if [ -n "$CODESPACES" ] && [ "$CODESPACES" = "true" ]; then
        # GitHub Codespaces URLs
        echo -e "  ${GREEN}🚀 API Server:${NC}     ${CYAN}https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}${NC}"
        echo -e "  ${GREEN}📡 WebSocket:${NC}      ${CYAN}wss://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}${NC}"
        echo -e "  ${GREEN}📊 Dashboard:${NC}      ${CYAN}https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}${NC}"
        echo -e "  ${GREEN}💻 Code Server:${NC}    ${CYAN}https://${CODESPACE_NAME}-8443.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}${NC}"
        
        # Speichere URLs für später
        echo "API_URL=https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}" > .codespace_urls
        echo "WS_URL=wss://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}" >> .codespace_urls
        echo "DASHBOARD_URL=https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}" >> .codespace_urls
        
    else
        # Lokale URLs
        echo -e "  ${GREEN}🚀 API Server:${NC}     ${CYAN}http://localhost:3000${NC}"
        echo -e "  ${GREEN}📡 WebSocket:${NC}      ${CYAN}ws://localhost:8080${NC}"
        echo -e "  ${GREEN}📊 Dashboard:${NC}      ${CYAN}http://localhost:5173${NC}"
        echo -e "  ${GREEN}🔴 Redis:${NC}          ${CYAN}redis://localhost:6379${NC}"
    fi
    
    # ==========================================
    # Initialisierungszeit
    # ==========================================
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    print_section "Zusammenfassung"
    
    print_success "Initialisierung abgeschlossen in ${DURATION}s"
    
    if [ -n "$CODESPACES" ] && [ "$CODESPACES" = "true" ]; then
        print_info "GitHub Codespace: ${CYAN}${CODESPACE_NAME}${NC}"
    fi
    
    # ==========================================
    # Nützliche Befehle
    # ==========================================
    echo ""
    echo -e "${CYAN}${BOLD}📖 Nützliche Befehle:${NC}"
    echo -e "  ${YELLOW}npm run dev${NC}         # Starte alle Services"
    echo -e "  ${YELLOW}npm run dev:api${NC}     # Starte nur API"
    echo -e "  ${YELLOW}npm run dev:dashboard${NC} # Starte nur Dashboard"
    echo -e "  ${YELLOW}npm run build${NC}       # Baue alle Projekte"
    echo -e "  ${YELLOW}npm run test${NC}        # Führe Tests aus"
    echo -e "  ${YELLOW}redis-cli${NC}           # Redis CLI öffnen"
    echo -e "  ${YELLOW}bash scripts/status.sh${NC} # Status anzeigen"
    
    # ==========================================
    # Dashboard automatisch öffnen (in Codespaces)
    # ==========================================
    if [ -n "$CODESPACES" ] && [ "$CODESPACES" = "true" ]; then
        echo ""
        print_info "Öffne Dashboard in 5 Sekunden..."
        sleep 5
        
        DASHBOARD_URL="https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
        if command -v gp &> /dev/null; then
            gp preview "$DASHBOARD_URL" --external &
        fi
    fi
    
    # ==========================================
    # Finale Nachricht
    # ==========================================
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}        ${GREEN}${BOLD}✨ MediSync ist bereit für die Entwicklung!${NC}               ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ==========================================
# Skript ausführen
# ==========================================
main "$@"
