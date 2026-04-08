#!/bin/bash

# MediSync Agenten-Plattform - Health Check Script
# ================================================

set -e

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Exit Code
EXIT_CODE=0

# Konfiguration
API_URL=${API_URL:-http://localhost:3000}
WS_URL=${WS_URL:-ws://localhost:8080}
REDIS_URL=${REDIS_URL:-redis://localhost:6379}
TIMEOUT=10

show_banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║              MediSync Health Check                       ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
}

# Check Funktion mit Timeout
check_service() {
    local name=$1
    local url=$2
    local timeout=${3:-$TIMEOUT}
    
    log_info "Prüfe $name..."
    
    if curl -sf --max-time "$timeout" "$url" >/dev/null 2>&1; then
        log_success "$name ist gesund"
        return 0
    else
        log_error "$name ist NICHT erreichbar"
        return 1
    fi
}

# HTTP Health Check
check_http() {
    local name=$1
    local url=$2
    local expected_code=${3:-200}
    
    log_info "Prüfe $name ($url)..."
    
    local response
    local http_code
    
    response=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "\n000")
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "$expected_code" ]; then
        log_success "$name ist gesund (HTTP $http_code)"
        return 0
    else
        log_error "$name: HTTP $http_code (erwartet: $expected_code)"
        return 1
    fi
}

# Redis Check
check_redis() {
    log_info "Prüfe Redis..."
    
    if command -v redis-cli >/dev/null 2>&1; then
        if redis-cli ping >/dev/null 2>&1; then
            log_success "Redis ist gesund"
            return 0
        else
            log_error "Redis antwortet nicht auf PING"
            return 1
        fi
    else
        # Versuche via Docker
        if docker exec medisync-redis redis-cli ping >/dev/null 2>&1; then
            log_success "Redis (Docker) ist gesund"
            return 0
        else
            log_error "Redis nicht erreichbar"
            return 1
        fi
    fi
}

# WebSocket Check (einfacher Verbindungstest)
check_websocket() {
    log_info "Prüfe WebSocket..."
    
    # Verwende curl mit Upgrade Header
    local ws_response
    ws_response=$(curl -s -N \
        -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
        -H "Sec-WebSocket-Version: 13" \
        --max-time 5 \
        "$WS_URL" 2>&1 || true)
    
    # Da WebSocket Handshake komplex ist, prüfen wir einfach ob der Port offen ist
    if nc -z localhost 8080 2>/dev/null || timeout 2 bash -c "cat < /dev/null > /dev/tcp/localhost/8080" 2>/dev/null; then
        log_success "WebSocket Port ist erreichbar"
        return 0
    else
        log_warning "WebSocket Port nicht direkt testbar (kann trotzdem funktionieren)"
        return 0
    fi
}

# Docker Container Check
check_docker_containers() {
    log_info "Prüfe Docker Container..."
    
    local containers=("medisync-redis" "medisync-backend" "medisync-worker")
    local all_healthy=true
    
    for container in "${containers[@]}"; do
        if docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
            local status
            status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
            
            if [ "$status" = "running" ]; then
                local health
                health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
                
                if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
                    log_success "$container läuft"
                else
                    log_warning "$container läuft (Health: $health)"
                fi
            else
                log_error "$container Status: $status"
                all_healthy=false
            fi
        else
            log_error "$container nicht gefunden"
            all_healthy=false
        fi
    done
    
    $all_healthy && return 0 || return 1
}

# API Endpunkte Check
check_api_endpoints() {
    log_info "Prüfe API Endpunkte..."
    
    local all_healthy=true
    
    # Health Endpoints
    check_http "Health (Live)" "$API_URL/health/live" 200 || all_healthy=false
    check_http "Health (Ready)" "$API_URL/health/ready" 200 || all_healthy=false
    check_http "API Root" "$API_URL/" 200 || all_healthy=false
    
    # Stats Endpoints (optional)
    if curl -sf --max-time 2 "$API_URL/api/stats" >/dev/null 2>&1; then
        log_success "Stats API erreichbar"
    else
        log_warning "Stats API nicht erreichbar (optional)"
    fi
    
    $all_healthy && return 0 || return 1
}

# Discord Bot Check (wenn konfiguriert)
check_discord_bot() {
    log_info "Prüfe Discord Bot..."
    
    # Prüfe ob Bot läuft (via Docker oder Prozess)
    if docker ps --format "{{.Names}}" | grep -q "medisync-discord-bot"; then
        log_success "Discord Bot Container läuft"
        return 0
    elif pgrep -f "discord.*bot" >/dev/null 2>&1; then
        log_success "Discord Bot Prozess läuft"
        return 0
    else
        log_warning "Discord Bot nicht gefunden (optional)"
        return 0
    fi
}

# System Resources Check
check_resources() {
    log_info "Prüfe System Ressourcen..."
    
    # Disk Space
    local disk_usage
    disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -lt 80 ]; then
        log_success "Disk Usage: ${disk_usage}%"
    else
        log_warning "Disk Usage hoch: ${disk_usage}%"
    fi
    
    # Memory
    if command -v free >/dev/null 2>&1; then
        local mem_usage
        mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
        if [ "$mem_usage" -lt 90 ]; then
            log_success "Memory Usage: ${mem_usage}%"
        else
            log_warning "Memory Usage hoch: ${mem_usage}%"
        fi
    fi
    
    return 0
}

# Zusammenfassung anzeigen
show_summary() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "║         ✅ ALLE SERVICES GESUND                          ║"
    else
        echo "║         ❌ EINIGE PROBLEME GEFUNDEN                      ║"
    fi
    
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║                                                          ║"
    echo "║  📊 Zusammenfassung:                                     ║"
    echo "║                                                          ║"
    
    if [ -n "$HEALTH_REDIS" ]; then
        echo "║    Redis:      $HEALTH_REDIS"
    fi
    if [ -n "$HEALTH_BACKEND" ]; then
        echo "║    Backend:    $HEALTH_BACKEND"
    fi
    if [ -n "$HEALTH_WORKER" ]; then
        echo "║    Worker:     $HEALTH_WORKER"
    fi
    if [ -n "$HEALTH_BOT" ]; then
        echo "║    Bot:        $HEALTH_BOT"
    fi
    if [ -n "$HEALTH_WS" ]; then
        echo "║    WebSocket:  $HEALTH_WS"
    fi
    
    echo "║                                                          ║"
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "║  🚀 Alle Systeme betriebsbereit!                         ║"
    else
        echo "║  ⚠️  Einige Services haben Probleme                      ║"
        echo "║                                                          ║"
        echo "║  Logs prüfen: make logs                                  ║"
    fi
    
    echo "║                                                          ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
}

# Hauptfunktion
main() {
    show_banner
    
    # Führe alle Checks durch
    if check_redis; then
        HEALTH_REDIS="${GREEN}✓${NC}"
    else
        HEALTH_REDIS="${RED}✗${NC}"
        EXIT_CODE=1
    fi
    
    if check_docker_containers; then
        HEALTH_BACKEND="${GREEN}✓${NC}"
        HEALTH_WORKER="${GREEN}✓${NC}"
    else
        HEALTH_BACKEND="${YELLOW}?${NC}"
        HEALTH_WORKER="${YELLOW}?${NC}"
        EXIT_CODE=1
    fi
    
    if check_api_endpoints; then
        HEALTH_API="${GREEN}✓${NC}"
    else
        HEALTH_API="${RED}✗${NC}"
        EXIT_CODE=1
    fi
    
    if check_websocket; then
        HEALTH_WS="${GREEN}✓${NC}"
    else
        HEALTH_WS="${YELLOW}?${NC}"
    fi
    
    if check_discord_bot; then
        HEALTH_BOT="${GREEN}✓${NC}"
    else
        HEALTH_BOT="${YELLOW}-${NC}"
    fi
    
    check_resources
    
    show_summary
    
    exit $EXIT_CODE
}

# Fange Fehler ab
trap 'log_error "Health Check fehlgeschlagen!"; exit 1' ERR

main "$@"
