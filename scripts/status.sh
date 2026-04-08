#!/bin/bash
#
# Status-Skript für MediSync Agents Platform
# Zeigt Status aller Services und Tunnels
#

set -euo pipefail

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

# Logging
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_section() { echo -e "\n${BOLD}${CYAN}$1${NC}"; echo "${BOLD}$(printf '=%.0s' {1..50})${NC}"; }

# Zeige Header
show_header() {
    clear 2>/dev/null || true
    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║${NC}          ${CYAN}MediSync Agents Platform${NC} - Status Check          ${BOLD}║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Zeit: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
}

# Prüfe Service auf Port
check_service() {
    local name=$1
    local port=$2
    local protocol=${3:-http}
    
    if timeout 2 bash -c "cat < /dev/null > /dev/tcp/localhost/${port}" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} ${BOLD}${name}${NC}"
        echo "   Port: ${port} | Protokoll: ${protocol} | Status: ${GREEN}ONLINE${NC}"
        
        # Versuche Health-Check
        if [[ "$protocol" == "http" ]] || [[ "$protocol" == "https" ]]; then
            local response
            response=$(curl -s -o /dev/null -w "%{http_code}" "${protocol}://localhost:${port}/health" 2>/dev/null || echo "000")
            if [[ "$response" == "200" ]]; then
                echo "   Health-Check: ${GREEN}OK${NC} (200)"
            else
                echo "   Health-Check: ${YELLOW}${response}${NC}"
            fi
        fi
        return 0
    else
        echo -e "${RED}✗${NC} ${BOLD}${name}${NC}"
        echo "   Port: ${port} | Status: ${RED}OFFLINE${NC}"
        return 1
    fi
}

# Lokale Services
check_local_services() {
    log_section "Lokale Services"
    echo ""
    
    check_service "API Backend" 3000 "http"
    echo ""
    check_service "WebSocket Server" 8080 "ws"
    echo ""
    check_service "Code Server" 8443 "https"
    echo ""
    check_service "Dashboard" 5173 "http"
    echo ""
    check_service "Redis Cache" 6379 "tcp"
}

# Cloudflare Tunnel Status
check_cloudflare_tunnel() {
    log_section "Cloudflare Tunnel"
    echo ""
    
    # Prüfe ob CF_TUNNEL_TOKEN gesetzt ist
    if [[ -z "${CF_TUNNEL_TOKEN:-}" ]]; then
        log_warn "CF_TUNNEL_TOKEN nicht gesetzt"
        echo "   Kein persistenter Tunnel konfiguriert"
        echo "   Führen Sie aus: bash scripts/setup-tunnel.sh"
        return 1
    fi
    
    log_success "CF_TUNNEL_TOKEN ist konfiguriert"
    
    # Prüfe ob cloudflared läuft
    if pgrep -f "cloudflared tunnel" > /dev/null 2>&1; then
        log_success "cloudflared Prozess läuft"
        
        local pid
        pid=$(pgrep -f "cloudflared tunnel" | head -1)
        echo "   PID: ${pid}"
        
        # Zeige Logs (letzte 3 Zeilen)
        if [[ -f /var/log/cloudflared/tunnel.log ]]; then
            echo ""
            echo "   Letzte Log-Einträge:"
            tail -3 /var/log/cloudflared/tunnel.log | sed 's/^/   /'
        fi
    else
        log_warn "cloudflared läuft nicht"
        echo "   Starten Sie den Tunnel: bash .devcontainer/cloudflared/start.sh"
    fi
    
    # Zeige konfigurierte Hostnames
    echo ""
    echo -e "${BOLD}Konfigurierte Hostnames:${NC}"
    
    local hosts=(
        "CF_API_HOSTNAME:API"
        "CF_WS_HOSTNAME:WebSocket"
        "CF_CODE_HOSTNAME:Code Server"
        "CF_DASHBOARD_HOSTNAME:Dashboard"
    )
    
    for host_config in "${hosts[@]}"; do
        local var_name="${host_config%:*}"
        local service_name="${host_config#*:}"
        local hostname="${!var_name:-}"
        
        if [[ -n "$hostname" ]]; then
            # Prüfe ob Hostname erreichbar ist
            if curl -s --max-time 5 "https://${hostname}" > /dev/null 2>&1; then
                echo -e "   ${GREEN}✓${NC} ${service_name}: ${CYAN}https://${hostname}${NC}"
            else
                echo -e "   ${YELLOW}⚠${NC} ${service_name}: ${CYAN}https://${hostname}${NC} (nicht erreichbar)"
            fi
        else
            echo -e "   ${RED}✗${NC} ${service_name}: nicht konfiguriert"
        fi
    done
}

# Temporäre Tunnels
check_temp_tunnels() {
    log_section "Temporäre Cloudflare Tunnels"
    echo ""
    
    local found=false
    local services=("3000:API" "8080:WebSocket" "8443:Code-Server" "5173:Dashboard")
    
    for service in "${services[@]}"; do
        local port="${service%:*}"
        local name="${service#*:}"
        local pid_file="/tmp/tunnel-${port}.pid"
        local url_file="/tmp/tunnel-${port}.url"
        
        if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
            found=true
            local url
            url=$(cat "$url_file" 2>/dev/null || echo "unbekannt")
            echo -e "${GREEN}✓${NC} ${BOLD}${name}${NC}"
            echo "   URL: ${CYAN}${url}${NC}"
            echo "   Lokaler Port: ${port}"
        fi
    done
    
    if [[ "$found" == "false" ]]; then
        log_info "Keine aktiven temporären Tunnels"
        echo "   Erstellen Sie einen: bash scripts/temp-tunnel.sh"
    fi
}

# Docker Status
check_docker() {
    log_section "Docker Container"
    echo ""
    
    if ! command -v docker &> /dev/null; then
        log_warn "Docker nicht gefunden"
        return 1
    fi
    
    if ! docker info > /dev/null 2>&1; then
        log_warn "Docker Daemon nicht erreichbar"
        return 1
    fi
    
    # Liste laufende Container
    local containers
    containers=$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true)
    
    if [[ -n "$containers" ]]; then
        echo -e "${BOLD}Laufende Container:${NC}"
        echo "$containers" | tail -n +2 | while read -r line; do
            if [[ -n "$line" ]]; then
                echo -e "   ${GREEN}●${NC} ${line}"
            fi
        done
    else
        log_info "Keine laufenden Docker Container"
    fi
    
    # DevContainer Status
    echo ""
    if docker ps --format "{{.Names}}" | grep -q "medisync-devcontainer"; then
        log_success "DevContainer läuft"
    else
        log_warn "DevContainer nicht gefunden"
    fi
}

# GitHub Codespaces Info
check_codespaces() {
    log_section "GitHub Codespaces"
    echo ""
    
    if [[ -n "${CODESPACES:-}" ]]; then
        log_success "Läuft in GitHub Codespaces"
        echo "   Codespace Name: ${CODESPACE_NAME:-unbekannt}"
        
        # Versuche die öffentliche URL zu ermitteln
        if command -v gh &> /dev/null; then
            echo ""
            echo "   Verfügbare Ports (GitHub CLI):"
            gh codespace ports -c "${CODESPACE_NAME}" 2>/dev/null | head -10 || echo "   (nicht verfügbar)"
        fi
    else
        log_info "Nicht in GitHub Codespaces"
        echo "   Lokal oder in anderer Umgebung"
    fi
}

# Netzwerk-Info
show_network_info() {
    log_section "Netzwerk-Informationen"
    echo ""
    
    # Lokale IP
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "unbekannt")
    echo -e "${BOLD}Lokale IP:${NC} ${ip}"
    
    # Öffentliche IP (optional)
    if command -v curl &> /dev/null; then
        local public_ip
        public_ip=$(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || echo "nicht ermittelbar")
        echo -e "${BOLD}Öffentliche IP:${NC} ${public_ip}"
    fi
    
    # DNS Info
    echo ""
    echo -e "${BOLD}DNS-Konfiguration:${NC}"
    cat /etc/resolv.conf 2>/dev/null | grep nameserver | head -3 | sed 's/^/   /' || echo "   (nicht verfügbar)"
}

# Quick Actions
show_quick_actions() {
    log_section "Schnellaktionen"
    echo ""
    echo "  ${BOLD}Troubleshooting:${NC}"
    echo "    bash .devcontainer/cloudflared/start.sh    # Tunnel starten"
    echo "    bash scripts/temp-tunnel.sh --all          # Temporäre Tunnels"
    echo "    bash scripts/setup-tunnel.sh               # Neuen Tunnel erstellen"
    echo ""
    echo "  ${BOLD}Logs ansehen:${NC}"
    echo "    tail -f /var/log/cloudflared/tunnel.log    # Cloudflared Logs"
    echo "    docker logs medisync-devcontainer          # DevContainer Logs"
    echo ""
    echo "  ${BOLD}Service-Restart:${NC}"
    echo "    docker-compose restart                     # Alle Services"
    echo "    docker restart medisync-devcontainer       # Nur DevContainer"
}

# Hauptfunktion
main() {
    show_header
    check_local_services
    check_cloudflare_tunnel
    check_temp_tunnels
    check_docker
    check_codespaces
    show_network_info
    show_quick_actions
    
    echo ""
    echo -e "${BOLD}$(printf '=%.0s' {1..50})${NC}"
    echo ""
}

# Argumente verarbeiten
case "${1:-}" in
    --watch|-w)
        while true; do
            main
            echo "Aktualisierung in 10 Sekunden... (CTRL+C zum Beenden)"
            sleep 10
        done
        ;;
    --services|-s)
        show_header
        check_local_services
        ;;
    --tunnels|-t)
        show_header
        check_cloudflare_tunnel
        check_temp_tunnels
        ;;
    --docker|-d)
        show_header
        check_docker
        ;;
    --help|-h)
        cat << EOF
MediSync Status Script

Verwendung: bash scripts/status.sh [OPTION]

Optionen:
  (ohne)        Vollständiger Status-Report
  --watch, -w   Kontinuierliche Aktualisierung
  --services, -s Nur lokale Services
  --tunnels, -t Nur Tunnel-Status
  --docker, -d  Nur Docker-Status
  --help, -h    Diese Hilfe

Beispiele:
  bash scripts/status.sh
  bash scripts/status.sh --watch
EOF
        ;;
    *)
        main
        ;;
esac
