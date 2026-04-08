#!/bin/bash
#
# Cloudflared Tunnel Start-Skript für MediSync Agents Platform
# Startet den Cloudflare Tunnel mit Retry-Logik und Logging
#

set -euo pipefail

# Konfiguration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/var/log/cloudflared"
LOG_FILE="${LOG_DIR}/tunnel.log"
MAX_RETRIES=5
RETRY_DELAY=10
RETRY_COUNT=0

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging-Funktionen
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "${LOG_FILE}"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "${LOG_FILE}"
}

# Log-Verzeichnis erstellen
mkdir -p "${LOG_DIR}"

log_info "=========================================="
log_info "Cloudflare Tunnel Starter"
log_info "=========================================="

# Prüfe ob CF_TUNNEL_TOKEN gesetzt ist
if [[ -z "${CF_TUNNEL_TOKEN:-}" ]]; then
    log_error "CF_TUNNEL_TOKEN ist nicht gesetzt!"
    log_error "Bitte in den Codespaces Secrets konfigurieren:"
    log_error "  Settings > Secrets and variables > Codespaces"
    log_error ""
    log_error "Alternativ: Verwenden Sie scripts/temp-tunnel.sh für temporäre URLs"
    exit 1
fi

log_success "CF_TUNNEL_TOKEN ist konfiguriert"

# Prüfe ob cloudflared installiert ist
if ! command -v cloudflared &> /dev/null; then
    log_warn "cloudflared nicht gefunden, versuche Installation..."
    
    # Installation basierend auf Architektur
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            CLOUDFLARED_ARCH="amd64"
            ;;
        aarch64|arm64)
            CLOUDFLARED_ARCH="arm64"
            ;;
        armv7l)
            CLOUDFLARED_ARCH="arm"
            ;;
        *)
            log_error "Nicht unterstützte Architektur: $ARCH"
            exit 1
            ;;
    esac
    
    # Installiere cloudflared
    LATEST_VERSION=$(curl -s https://api.github.com/repos/cloudflare/cloudflared/releases/latest | grep -oP '"tag_name": "\K(.*)(?=")' || echo "latest")
    DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/download/${LATEST_VERSION}/cloudflared-linux-${CLOUDFLARED_ARCH}"
    
    log_info "Lade cloudflared ${LATEST_VERSION} für ${CLOUDFLARED_ARCH} herunter..."
    curl -fsSL "${DOWNLOAD_URL}" -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
    
    log_success "cloudflared installiert: $(cloudflared version 2>&1 | head -1)"
else
    log_success "cloudflared gefunden: $(cloudflared version 2>&1 | head -1)"
fi

# Prüfe Netzwerk-Konnektivität
log_info "Prüfe Netzwerk-Konnektivität..."
if ! curl -s --max-time 10 https://cloudflare.com/cdn-cgi/trace > /dev/null; then
    log_warn "Keine direkte Internet-Verbindung, versuche trotzdem..."
fi

# Lade Umgebungsvariablen in Config
CONFIG_FILE="${SCRIPT_DIR}/config.yml"
if [[ -f "${CONFIG_FILE}" ]]; then
    log_info "Verwende Konfiguration: ${CONFIG_FILE}"
else
    log_error "Konfigurationsdatei nicht gefunden: ${CONFIG_FILE}"
    exit 1
fi

# Zeige konfigurierte Services
log_info "Konfigurierte Services:"
log_info "  - API:        ${CF_API_HOSTNAME:-api.medisync.local} -> http://devcontainer:3000"
log_info "  - WebSocket:  ${CF_WS_HOSTNAME:-ws.medisync.local} -> http://devcontainer:8080"
log_info "  - Code Server: ${CF_CODE_HOSTNAME:-code.medisync.local} -> http://devcontainer:8443"
log_info "  - Dashboard:  ${CF_DASHBOARD_HOSTNAME:-dashboard.medisync.local} -> http://devcontainer:5173"

# Prüfe ob Services erreichbar sind
log_info "Prüfe lokale Services..."
services=(
    "devcontainer:3000"
    "devcontainer:8080"
    "devcontainer:8443"
)

for service in "${services[@]}"; do
    host="${service%:*}"
    port="${service#*:}"
    if timeout 5 bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" 2>/dev/null; then
        log_success "  ✓ ${service} ist erreichbar"
    else
        log_warn "  ✗ ${service} ist noch nicht erreichbar (wird später erreichbar)"
    fi
done

# Starte Tunnel mit Retry-Logik
log_info "Starte Cloudflare Tunnel..."
log_info "Logs werden geschrieben nach: ${LOG_FILE}"

while true; do
    log_info "Verbindungsversuch $((RETRY_COUNT + 1)) von ${MAX_RETRIES}..."
    
    # Starte cloudflared im Hintergrund und leite Logs um
    cloudflared tunnel --no-autoupdate run --token "${CF_TUNNEL_TOKEN}" 2>&1 | tee -a "${LOG_FILE}" &
    CLOUDFLARED_PID=$!
    
    # Warte kurz und prüfe ob Prozess läuft
    sleep 5
    
    if ! kill -0 $CLOUDFLARED_PID 2>/dev/null; then
        RETRY_COUNT=$((RETRY_COUNT + 1))
        
        if [[ $RETRY_COUNT -ge $MAX_RETRIES ]]; then
            log_error "Maximale Anzahl an Retries erreicht (${MAX_RETRIES})"
            log_error "Bitte prüfen Sie:"
            log_error "  1. Ist das CF_TUNNEL_TOKEN korrekt?"
            log_error "  2. Ist der Tunnel in der Cloudflare Dashboard aktiv?"
            log_error "  3. Sind DNS-Einträge korrekt konfiguriert?"
            log_error ""
            log_error "Logs: ${LOG_FILE}"
            exit 1
        fi
        
        log_warn "Tunnel wurde unerwartet beendet, versuche Retry in ${RETRY_DELAY} Sekunden..."
        sleep $RETRY_DELAY
        
        # Erhöhe Retry-Delay exponentiell (Backoff)
        RETRY_DELAY=$((RETRY_DELAY * 2))
        if [[ $RETRY_DELAY -gt 60 ]]; then
            RETRY_DELAY=60
        fi
        
        continue
    fi
    
    log_success "Tunnel erfolgreich gestartet (PID: ${CLOUDFLARED_PID})"
    log_info "URLs sollten in Kürze erreichbar sein:"
    log_info "  - https://${CF_API_HOSTNAME:-api.medisync.local}"
    log_info "  - https://${CF_WS_HOSTNAME:-ws.medisync.local}"
    log_info "  - https://${CF_CODE_HOSTNAME:-code.medisync.local}"
    log_info "  - https://${CF_DASHBOARD_HOSTNAME:-dashboard.medisync.local}"
    
    # Setze Retry-Count zurück
    RETRY_COUNT=0
    RETRY_DELAY=10
    
    # Warte auf Prozess-Ende (wird durch Signals oder Fehler ausgelöst)
    wait $CLOUDFLARED_PID
    EXIT_CODE=$?
    
    log_warn "Tunnel wurde beendet (Exit Code: ${EXIT_CODE})"
    
    # Bei ordentlichem Shutdown beenden
    if [[ $EXIT_CODE -eq 0 ]]; then
        log_info "Tunnel ordnungsgemäß beendet"
        exit 0
    fi
    
    # Retry bei Fehler
    RETRY_COUNT=$((RETRY_COUNT + 1))
    
    if [[ $RETRY_COUNT -ge $MAX_RETRIES ]]; then
        log_error "Maximale Anzahl an Retries erreicht"
        exit 1
    fi
    
    log_warn "Versuche Neustart in ${RETRY_DELAY} Sekunden..."
    sleep $RETRY_DELAY
done
