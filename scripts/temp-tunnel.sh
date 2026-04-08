#!/bin/bash
#
# Temporärer Cloudflare Tunnel für Demos und schnelle Tests
# Erstellt eine temporäre URL ohne benötigte Domain
#

set -euo pipefail

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
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_url() { echo -e "${CYAN}[URL]${NC} $1"; }

# Konfiguration
LOCAL_PORT=${1:-3000}
TUNNEL_NAME="temp-medisync-${LOCAL_PORT}"
LOG_FILE="/tmp/cloudflared-${LOCAL_PORT}.log"

# Prüfe ob cloudflared installiert ist
check_cloudflared() {
    if command -v cloudflared &> /dev/null; then
        return 0
    fi
    
    log_warn "cloudflared nicht gefunden, installiere..."
    
    local arch
    case $(uname -m) in
        x86_64) arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        armv7l) arch="arm" ;;
        *) log_error "Nicht unterstützte Architektur"; exit 1 ;;
    esac
    
    local version
    version=$(curl -s https://api.github.com/repos/cloudflare/cloudflared/releases/latest | \
        grep -oP '"tag_name": "\K(.*)(?=")' || echo "latest")
    
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared-linux-${arch}" \
        -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
    
    export PATH="/tmp:$PATH"
    alias cloudflared=/tmp/cloudflared
    
    log_success "cloudflared temporär installiert"
}

# Zeige Hilfe
show_help() {
    cat << EOF
Temporärer Cloudflare Tunnel für MediSync Agents Platform

Verwendung:
  bash scripts/temp-tunnel.sh [PORT] [OPTIONS]

Argumente:
  PORT        Lokaler Port zum tunneln (Standard: 3000)

Optionen:
  -h, --help  Zeige diese Hilfe
  --api       Tunnel API (Port 3000)
  --ws        Tunnel WebSocket (Port 8080)
  --code      Tunnel Code-Server (Port 8443)
  --dashboard Tunnel Dashboard (Port 5173)
  --all       Starte Tunnels für alle Services

Beispiele:
  bash scripts/temp-tunnel.sh           # Tunnel für Port 3000
  bash scripts/temp-tunnel.sh 8080      # Tunnel für Port 8080
  bash scripts/temp-tunnel.sh --api     # Tunnel für API
  bash scripts/temp-tunnel.sh --all     # Alle Services

Hinweis:
  Dies erstellt TEMPORÄRE URLs, die nach dem Beenden des Skripts
  nicht mehr verfügbar sind. Für persistente URLs verwenden Sie:
  bash scripts/setup-tunnel.sh
EOF
}

# Starte Tunnel für einen Port
start_tunnel() {
    local port=$1
    local service_name=$2
    
    log_info "Starte temporären Tunnel für ${service_name} (Port ${port})..."
    log_info "Dies kann einige Sekunden dauern..."
    
    # Starte Tunnel im Hintergrund und fange URL ab
    cloudflared tunnel --url "http://localhost:${port}" --metrics "localhost:4${port}" 2>&1 &
    local pid=$!
    
    # Warte auf URL
    local url=""
    local attempts=0
    local max_attempts=30
    
    while [[ -z "$url" && $attempts -lt $max_attempts ]]; do
        sleep 1
        url=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' <<< "$(cat /proc/${pid}/fd/1 2>/dev/null || echo "")" 2>/dev/null || true)
        attempts=$((attempts + 1))
        echo -n "."
    done
    echo ""
    
    if [[ -n "$url" ]]; then
        log_success "${service_name} ist nun erreichbar unter:"
        log_url "${url}"
        echo "${url}" > "/tmp/tunnel-${port}.url"
        echo $pid > "/tmp/tunnel-${port}.pid"
        return 0
    else
        log_error "Konnte keine Tunnel-URL ermitteln"
        kill $pid 2>/dev/null || true
        return 1
    fi
}

# Zeige alle aktiven Tunnel
show_active_tunnels() {
    echo ""
    log_info "Aktive temporäre Tunnels:"
    echo "─────────────────────────────────────────"
    
    local services=("3000:API" "8080:WebSocket" "8443:Code-Server" "5173:Dashboard")
    
    for service in "${services[@]}"; do
        local port="${service%:*}"
        local name="${service#*:}"
        local pid_file="/tmp/tunnel-${port}.pid"
        local url_file="/tmp/tunnel-${port}.url"
        
        if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
            local url
            url=$(cat "$url_file" 2>/dev/null || echo "unbekannt")
            echo -e "${GREEN}✓${NC} ${name} (Port ${port}): ${CYAN}${url}${NC}"
        else
            echo -e "${RED}✗${NC} ${name} (Port ${port}): nicht aktiv"
        fi
    done
    echo ""
}

# Stoppe alle temporären Tunnel
stop_all_tunnels() {
    log_info "Stoppe alle temporären Tunnels..."
    
    for pid_file in /tmp/tunnel-*.pid; do
        if [[ -f "$pid_file" ]]; then
            local pid
            pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
                log_info "Tunnel mit PID ${pid} gestoppt"
            fi
            rm -f "$pid_file"
        fi
    done
    
    rm -f /tmp/tunnel-*.url
    log_success "Alle temporären Tunnels gestoppt"
}

# Hauptfunktion
main() {
    # Prüfe Argumente
    case "${1:-}" in
        -h|--help)
            show_help
            exit 0
            ;;
        --api)
            LOCAL_PORT=3000
            SERVICE_NAME="API"
            ;;
        --ws)
            LOCAL_PORT=8080
            SERVICE_NAME="WebSocket"
            ;;
        --code)
            LOCAL_PORT=8443
            SERVICE_NAME="Code-Server"
            ;;
        --dashboard)
            LOCAL_PORT=5173
            SERVICE_NAME="Dashboard"
            ;;
        --all)
            check_cloudflared
            echo ""
            log_info "Starte temporäre Tunnels für alle Services..."
            echo ""
            
            start_tunnel 3000 "API (Backend)"
            start_tunnel 8080 "WebSocket Server"
            start_tunnel 8443 "Code Server"
            start_tunnel 5173 "Dashboard"
            
            echo ""
            log_success "Alle Tunnels gestartet!"
            show_active_tunnels
            
            echo ""
            log_info "Drücken Sie ENTER um alle Tunnels zu stoppen..."
            read -r
            
            stop_all_tunnels
            exit 0
            ;;
        --status)
            show_active_tunnels
            exit 0
            ;;
        --stop)
            stop_all_tunnels
            exit 0
            ;;
        [0-9]*)
            LOCAL_PORT=$1
            SERVICE_NAME="Service (Port ${LOCAL_PORT})"
            ;;
    esac
    
    # Prüfe cloudflared
    check_cloudflared
    
    # Prüfe ob Port erreichbar ist
    if ! curl -s "http://localhost:${LOCAL_PORT}" > /dev/null 2>&1; then
        log_warn "Port ${LOCAL_PORT} scheint nicht erreichbar zu sein"
        log_info "Stellen Sie sicher, dass der Service läuft"
        read -rp "Trotzdem fortfahren? (j/N): " continue
        [[ "$continue" =~ ^[jJ]$ ]] || exit 0
    fi
    
    SERVICE_NAME=${SERVICE_NAME:-"Service"}
    
    # Starte Tunnel
    start_tunnel "$LOCAL_PORT" "$SERVICE_NAME"
    
    echo ""
    log_info "Der Tunnel läuft. Drücken Sie CTRL+C zum Stoppen."
    
    # Warte auf Interrupt
    trap 'echo "" && log_info "Stoppe Tunnel..." && exit 0' INT TERM
    
    while true; do
        sleep 1
    done
}

# Starte main
main "$@"
