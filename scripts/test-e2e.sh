#!/bin/bash

# MediSync E2E Test Script
# Führt alle End-to-End Tests aus
# 
# Verwendung:
#   ./scripts/test-e2e.sh [options]
#
# Options:
#   --skip-build        Überspringt den Build-Schritt
#   --skip-cleanup      Läuft Services nach Tests weiter
#   --verbose           Detaillierte Ausgabe
#   --help              Zeigt diese Hilfe

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Konfiguration
API_PORT=3000
WS_PORT=8080
REDIS_PORT=6379
TEST_TIMEOUT=120
SKIP_BUILD=false
SKIP_CLEANUP=false
VERBOSE=false

# Prozess IDs für Cleanup
declare -a PIDS

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

# Hilfe anzeigen
show_help() {
    head -n 15 "$0" | tail -n 13
    exit 0
}

# Argumente parsen
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --skip-cleanup)
                SKIP_CLEANUP=true
                shift
                ;;
            --verbose)
                VERBOSE=true
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

# Prüfe ob Ports frei sind
check_ports() {
    log_info "Prüfe Ports..."
    
    local ports=($REDIS_PORT $API_PORT $WS_PORT)
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            log_error "Port $port ist bereits belegt!"
            exit 1
        fi
    done
    log_success "Alle Ports sind frei"
}

# Redis starten
start_redis() {
    log_info "Starte Redis..."
    
    if command -v docker &> /dev/null; then
        docker run -d \
            --name medisync-redis-test \
            -p $REDIS_PORT:6379 \
            redis:7-alpine \
            redis-server --appendonly no > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            log_success "Redis Container gestartet"
            sleep 2
            
            # Prüfe ob Redis läuft
            if docker exec medisync-redis-test redis-cli ping | grep -q PONG; then
                log_success "Redis ist bereit"
            else
                log_error "Redis antwortet nicht"
                exit 1
            fi
        else
            log_error "Konnte Redis Container nicht starten"
            exit 1
        fi
    else
        log_warning "Docker nicht gefunden, versuche lokales Redis..."
        if command -v redis-server &> /dev/null; then
            redis-server --daemonize yes --port $REDIS_PORT
            sleep 1
        else
            log_error "Redis nicht gefunden. Bitte installiere Redis oder Docker."
            exit 1
        fi
    fi
}

# Backend Services starten
start_backend() {
    log_info "Starte Backend Services..."
    
    cd backend
    
    # API Server
    log_info "Starte API Server auf Port $API_PORT..."
    PORT=$API_PORT WS_PORT=$WS_PORT REDIS_URL="redis://localhost:$REDIS_PORT" \
        npm run dev > ../logs/api.log 2>&1 &
    API_PID=$!
    PIDS+=($API_PID)
    log_info "API Server PID: $API_PID"
    
    # Warte auf API
    log_info "Warte auf API..."
    for i in {1..30}; do
        if curl -s http://localhost:$API_PORT/health > /dev/null 2>&1; then
            log_success "API Server ist bereit"
            break
        fi
        sleep 1
        if [ $i -eq 30 ]; then
            log_error "API Server startet nicht"
            show_logs
            exit 1
        fi
    done
    
    cd ..
}

# Discord Bot starten
start_bot() {
    log_info "Starte Discord Bot..."
    
    cd bot/discord
    
    API_BASE_URL="http://localhost:$API_PORT" \
    WEBSOCKET_URL="ws://localhost:$WS_PORT" \
        npm run dev > ../../logs/bot.log 2>&1 &
    BOT_PID=$!
    PIDS+=($BOT_PID)
    log_info "Discord Bot PID: $BOT_PID"
    
    cd ../..
    sleep 2
}

# Health Check
check_health() {
    log_info "Führe Health Checks durch..."
    
    # API Health
    local api_health=$(curl -s http://localhost:$API_PORT/health)
    if echo "$api_health" | grep -q "healthy"; then
        log_success "API ist healthy"
    else
        log_error "API Health Check fehlgeschlagen"
        echo "$api_health"
        return 1
    fi
    
    # Redis Health
    local redis_health=$(curl -s http://localhost:$API_PORT/health/redis)
    if echo "$redis_health" | grep -q "connected"; then
        log_success "Redis ist verbunden"
    else
        log_error "Redis Health Check fehlgeschlagen"
        return 1
    fi
    
    log_success "Alle Health Checks bestanden"
}

# Tests ausführen
run_tests() {
    log_info "Führe Integration Tests aus..."
    
    cd backend
    
    if [ "$VERBOSE" = true ]; then
        npm test -- --verbose --testPathPattern="integration" 2>&1 | tee ../logs/test.log
    else
        npm test -- --testPathPattern="integration" > ../logs/test.log 2>&1
    fi
    
    TEST_EXIT_CODE=$?
    cd ..
    
    if [ $TEST_EXIT_CODE -eq 0 ]; then
        log_success "Alle Tests bestanden!"
    else
        log_error "Tests fehlgeschlagen (Exit Code: $TEST_EXIT_CODE)"
        show_logs
        return 1
    fi
}

# Logs anzeigen
show_logs() {
    echo -e "\n${YELLOW}=== API Logs ===${NC}"
    tail -n 50 logs/api.log 2>/dev/null || echo "Keine API Logs gefunden"
    
    echo -e "\n${YELLOW}=== Bot Logs ===${NC}"
    tail -n 50 logs/bot.log 2>/dev/null || echo "Keine Bot Logs gefunden"
    
    echo -e "\n${YELLOW}=== Test Logs ===${NC}"
    tail -n 100 logs/test.log 2>/dev/null || echo "Keine Test Logs gefunden"
}

# Cleanup
cleanup() {
    if [ "$SKIP_CLEANUP" = true ]; then
        log_warning "Cleanup übersprungen (--skip-cleanup)"
        log_info "Services laufen weiter. Zum stoppen: ./scripts/stop-all.sh"
        return 0
    fi
    
    log_info "Räume auf..."
    
    # Prozesse beenden
    for pid in "${PIDS[@]}"; do
        if kill -0 $pid 2>/dev/null; then
            kill $pid 2>/dev/null || true
            wait $pid 2>/dev/null || true
        fi
    done
    
    # Docker Container stoppen
    if docker ps -q -f name=medisync-redis-test | grep -q .; then
        docker stop medisync-redis-test > /dev/null 2>&1 || true
        docker rm medisync-redis-test > /dev/null 2>&1 || true
        log_success "Redis Container entfernt"
    fi
    
    log_success "Cleanup abgeschlossen"
}

# Test-Report generieren
generate_report() {
    local exit_code=$1
    
    echo -e "\n${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}                 ${GREEN}MediSync E2E Test Report${NC}                    ${BLUE}║${NC}"
    echo -e "${BLUE}╠══════════════════════════════════════════════════════════════╣${NC}"
    
    if [ $exit_code -eq 0 ]; then
        echo -e "${BLUE}║${NC}  Status: ${GREEN}✅ ALLE TESTS BESTANDEN${NC}                              ${BLUE}║${NC}"
    else
        echo -e "${BLUE}║${NC}  Status: ${RED}❌ TESTS FEHLGESCHLAGEN${NC}                             ${BLUE}║${NC}"
    fi
    
    echo -e "${BLUE}║${NC}                                                              ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  Zeitstempel: $(date '+%Y-%m-%d %H:%M:%S')                              ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  API Port: $API_PORT                                                 ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  WebSocket Port: $WS_PORT                                            ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  Redis Port: $REDIS_PORT                                              ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}                                                              ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  Logs: logs/api.log                                          ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}        logs/bot.log                                          ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}        logs/test.log                                         ${BLUE}║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    
    if [ $exit_code -ne 0 ]; then
        echo -e "\n${YELLOW}Tip: Verwende --verbose für detaillierte Ausgabe${NC}"
        echo -e "${YELLOW}     Verwende --skip-cleanup um Services zu debuggen${NC}"
    fi
}

# Hauptfunktion
main() {
    parse_args "$@"
    
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}          ${GREEN}MediSync End-to-End Test Suite${NC}                     ${BLUE}║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    
    # Logs Verzeichnis erstellen
    mkdir -p logs
    
    # Cleanup bei Exit
    trap cleanup EXIT INT TERM
    
    # Schritte ausführen
    check_ports
    start_redis
    start_backend
    sleep 3
    start_bot
    sleep 2
    check_health
    run_tests
    
    # Erfolg
    generate_report 0
    exit 0
}

# Starte Hauptfunktion
main "$@"
