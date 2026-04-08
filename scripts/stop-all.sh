#!/bin/bash

# MediSync Stop All Services Script
# Stoppt alle MediSync Services gracefully
#
# Verwendung:
#   ./scripts/stop-all.sh [options]
#
# Options:
#   --force       Force kill ohne graceful shutdown
#   --clean       Entfernt auch Docker Container und Logs
#   --help        Zeigt diese Hilfe

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Konfiguration
FORCE=false
CLEAN=false
GRACEFUL_TIMEOUT=10

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

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Hilfe anzeigen
show_help() {
    head -n 14 "$0" | tail -n 12
    exit 0
}

# Argumente parsen
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                FORCE=true
                shift
                ;;
            --clean)
                CLEAN=true
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

# Lade gespeicherte PIDs
load_pids() {
    if [ -f ".medisync/pids" ]; then
        cat .medisync/pids
    fi
}

# Stoppe Prozesse by PID Datei
stop_from_pid_file() {
    local pids=$(load_pids)
    
    if [ -z "$pids" ]; then
        log_warning "Keine gespeicherten PIDs gefunden"
        return 0
    fi
    
    log_step "Stoppe Services aus PID Datei..."
    
    for pid in $pids; do
        if kill -0 $pid 2>/dev/null; then
            log_info "Stoppe Prozess $pid..."
            
            if [ "$FORCE" = true ]; then
                kill -9 $pid 2>/dev/null || true
            else
                # Graceful shutdown
                kill $pid 2>/dev/null || true
                
                # Warte auf Beendigung
                local count=0
                while kill -0 $pid 2>/dev/null && [ $count -lt $GRACEFUL_TIMEOUT ]; do
                    sleep 1
                    count=$((count + 1))
                done
                
                # Force kill wenn nötig
                if kill -0 $pid 2>/dev/null; then
                    log_warning "Force kill für PID $pid"
                    kill -9 $pid 2>/dev/null || true
                fi
            fi
            
            wait $pid 2>/dev/null || true
            log_success "Prozess $pid beendet"
        else
            log_info "Prozess $pid läuft nicht mehr"
        fi
    done
    
    # Lösche PID Datei
    rm -f .medisync/pids
}

# Stoppe Prozesse by Name
stop_by_name() {
    local name=$1
    local pattern=$2
    
    log_step "Suche nach $name Prozessen..."
    
    local pids=$(pgrep -f "$pattern" || true)
    
    if [ -z "$pids" ]; then
        log_info "Keine $name Prozesse gefunden"
        return 0
    fi
    
    for pid in $pids; do
        log_info "Beende $name (PID: $pid)..."
        
        if [ "$FORCE" = true ]; then
            kill -9 $pid 2>/dev/null || true
        else
            kill $pid 2>/dev/null || true
            sleep 1
            
            if kill -0 $pid 2>/dev/null; then
                kill -9 $pid 2>/dev/null || true
            fi
        fi
    done
    
    log_success "$name Prozesse beendet"
}

# Stoppe Redis
stop_redis() {
    log_step "Stoppe Redis..."
    
    # Docker Container
    if docker ps -q -f name=medisync-redis | grep -q .; then
        log_info "Stoppe Redis Docker Container..."
        docker stop medisync-redis > /dev/null 2>&1 || true
        
        if [ "$CLEAN" = true ]; then
            docker rm medisync-redis > /dev/null 2>&1 || true
            log_success "Redis Container entfernt"
        else
            log_success "Redis Container gestoppt"
        fi
    fi
    
    if docker ps -q -f name=medisync-redis-test | grep -q .; then
        docker stop medisync-redis-test > /dev/null 2>&1 || true
        docker rm medisync-redis-test > /dev/null 2>&1 || true
        log_success "Test Redis Container entfernt"
    fi
    
    # Lokaler Redis
    if command -v redis-cli &> /dev/null; then
        local redis_pids=$(pgrep redis-server || true)
        if [ -n "$redis_pids" ]; then
            log_info "Stoppe lokale Redis Server..."
            for pid in $redis_pids; do
                kill $pid 2>/dev/null || true
            done
            log_success "Lokale Redis Server beendet"
        fi
    fi
}

# Stoppe Node.js Services
stop_node_services() {
    log_step "Stoppe Node.js Services..."
    
    # Backend/API
    stop_by_name "API Server" "ts-node.*server|node.*dist/server"
    
    # Worker
    stop_by_name "Worker" "node.*dist/worker"
    
    # Discord Bot
    stop_by_name "Discord Bot" "ts-node.*bot|node.*discord"
}

# Cleanup
cleanup() {
    if [ "$CLEAN" = true ]; then
        log_step "Führe Cleanup durch..."
        
        # Logs
        if [ -d "logs" ]; then
            log_info "Entferne Logs..."
            rm -rf logs/*
            log_success "Logs entfernt"
        fi
        
        # .medisync Verzeichnis
        if [ -d ".medisync" ]; then
            rm -rf .medisync
            log_success "Metadata entfernt"
        fi
        
        # Docker Volumes (optional)
        if command -v docker &> /dev/null; then
            log_info "Bereinige Docker..."
            docker system prune -f > /dev/null 2>&1 || true
        fi
    fi
}

# Verifiziere Shutdown
verify_shutdown() {
    log_step "Verifiziere Shutdown..."
    
    local all_stopped=true
    
    # Prüfe Ports
    local ports=(3000 8080 6379)
    for port in "${ports[@]}"; do
        if nc -z localhost $port 2>/dev/null; then
            log_warning "Port $port ist noch belegt!"
            all_stopped=false
        fi
    done
    
    # Prüfe Prozesse
    local remaining_pids=$(pgrep -f "ts-node|medisync" || true)
    if [ -n "$remaining_pids" ]; then
        log_warning "Noch laufende Prozesse gefunden:"
        echo "$remaining_pids"
        all_stopped=false
    fi
    
    if [ "$all_stopped" = true ]; then
        log_success "Alle Services wurden beendet"
    else
        log_warning "Einige Services laufen noch"
        if [ "$FORCE" = false ]; then
            log_info "Verwende --force für hartes Beenden"
        fi
    fi
}

# Zeige vorherigen Status
show_before_status() {
    log_step "Vorheriger Status:"
    
    local services_running=false
    
    if nc -z localhost 3000 2>/dev/null; then
        echo -e "  ${YELLOW}●${NC} API läuft auf Port 3000"
        services_running=true
    fi
    
    if nc -z localhost 8080 2>/dev/null; then
        echo -e "  ${YELLOW}●${NC} WebSocket läuft auf Port 8080"
        services_running=true
    fi
    
    if nc -z localhost 6379 2>/dev/null; then
        echo -e "  ${YELLOW}●${NC} Redis läuft auf Port 6379"
        services_running=true
    fi
    
    local node_pids=$(pgrep -f "ts-node.*medisync" || true)
    if [ -n "$node_pids" ]; then
        echo -e "  ${YELLOW}●${NC} Node.js Prozesse laufen"
        services_running=true
    fi
    
    if [ "$services_running" = false ]; then
        echo -e "  ${GREEN}✓${NC} Keine MediSync Services laufen"
    fi
    
    echo ""
}

# Zeige Ergebnis
show_result() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                 ${GREEN}MediSync Shutdown Complete${NC}                  ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    
    if [ "$CLEAN" = true ]; then
        echo -e "\n${YELLOW}Cleanup durchgeführt:${NC}"
        echo -e "  • Logs wurden entfernt"
        echo -e "  • Docker Container entfernt"
        echo -e "  • Temporäre Dateien bereinigt"
    fi
    
    echo -e "\n${GREEN}Alle MediSync Services wurden gestoppt.${NC}"
}

# Hauptfunktion
main() {
    parse_args "$@"
    
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}          ${YELLOW}MediSync Agenten-Plattform - Stop Services${NC}        ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    show_before_status
    
    # Stoppe in umgekehrter Reihenfolge
    stop_from_pid_file
    stop_node_services
    stop_redis
    cleanup
    verify_shutdown
    show_result
}

# Starte Hauptfunktion
main "$@"
