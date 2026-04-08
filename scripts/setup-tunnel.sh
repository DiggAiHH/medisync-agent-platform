#!/bin/bash
#
# Cloudflare Tunnel Setup Script für MediSync Agents Platform
# Erstellt einen persistenten Tunnel mit benutzerdefinierten Hostnames
#

set -euo pipefail

# Konfiguration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLOUDFLARED_DIR="${PROJECT_DIR}/.devcontainer/cloudflared"
DEFAULT_DOMAIN=""

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
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Header
print_header() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║         Cloudflare Tunnel Setup für MediSync                 ║"
    echo "║         Agents Platform - Persistent URLs                    ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

# Prüfe System-Abhängigkeiten
check_prerequisites() {
    log_step "Prüfe System-Voraussetzungen..."
    
    local missing_deps=()
    
    # Prüfe curl
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    # Prüfe jq (optional aber empfohlen)
    if ! command -v jq &> /dev/null; then
        log_warn "jq nicht gefunden. Einige Features werden eingeschränkt sein."
        log_info "Installieren mit: sudo apt-get install jq"
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Fehlende Abhängigkeiten: ${missing_deps[*]}"
        exit 1
    fi
    
    log_success "Alle notwendigen Abhängigkeiten vorhanden"
}

# Installiere cloudflared
install_cloudflared() {
    log_step "Installiere cloudflared..."
    
    if command -v cloudflared &> /dev/null; then
        log_success "cloudflared bereits installiert:"
        cloudflared version
        return 0
    fi
    
    local arch
    case $(uname -m) in
        x86_64) arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        armv7l) arch="arm" ;;
        *) log_error "Nicht unterstützte Architektur: $(uname -m)"; exit 1 ;;
    esac
    
    log_info "Ermittele aktuelle Version..."
    local version
    version=$(curl -s https://api.github.com/repos/cloudflare/cloudflared/releases/latest | \
        grep -oP '"tag_name": "\K(.*)(?=")' || echo "latest")
    
    log_info "Lade cloudflared ${version} für ${arch}..."
    
    # Download
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared-linux-${arch}" \
        -o /tmp/cloudflared
    
    # Installation
    chmod +x /tmp/cloudflared
    
    # Versuche systemweite Installation
    if sudo mv /tmp/cloudflared /usr/local/bin/cloudflared 2>/dev/null; then
        log_success "cloudflared nach /usr/local/bin installiert"
    else
        # Fallback: Lokale Installation
        mkdir -p ~/.local/bin
        mv /tmp/cloudflared ~/.local/bin/cloudflared
        export PATH="$HOME/.local/bin:$PATH"
        log_warn "cloudflared nach ~/.local/bin installiert (zum PATH hinzufügen!)"
    fi
    
    cloudflared version
}

# Cloudflare Login
login_cloudflare() {
    log_step "Cloudflare Login..."
    
    log_info "Öffne Browser für Authentifizierung..."
    log_info "Falls kein Browser verfügbar, folgen Sie den Anweisungen."
    
    cloudflared tunnel login
    
    log_success "Erfolgreich bei Cloudflare angemeldet"
}

# Erstelle Tunnel
create_tunnel() {
    log_step "Erstelle neuen Cloudflare Tunnel..."
    
    # Frage nach Tunnel-Namen
    read -rp "Geben Sie einen Namen für den Tunnel ein [medisync-agents]: " tunnel_name
    tunnel_name=${tunnel_name:-medisync-agents}
    
    log_info "Erstelle Tunnel '${tunnel_name}'..."
    
    # Erstelle Tunnel
    local output
    output=$(cloudflared tunnel create "$tunnel_name" 2>&1)
    
    if [[ $? -ne 0 ]]; then
        log_error "Fehler beim Erstellen des Tunnels:"
        echo "$output"
        exit 1
    fi
    
    # Extrahiere Tunnel-ID
    local tunnel_id
    tunnel_id=$(echo "$output" | grep -oP 'Created tunnel \K[a-f0-9-]+' || \
        echo "$output" | grep -oP 'with id \K[a-f0-9-]+')
    
    if [[ -z "$tunnel_id" ]]; then
        log_error "Konnte Tunnel-ID nicht extrahieren"
        echo "Vollständige Ausgabe:"
        echo "$output"
        exit 1
    fi
    
    log_success "Tunnel erstellt mit ID: ${tunnel_id}"
    echo "$tunnel_id" > "${CLOUDFLARED_DIR}/.tunnel_id"
    
    # Zeige verfügbare Domains
    log_info "Verfügbare Domains in Ihrem Cloudflare Account:"
    cloudflared tunnel list | head -20
    
    echo "$tunnel_id"
}

# Hole oder setze Domain
get_domain() {
    log_step "Domain-Konfiguration..."
    
    # Liste verfügbarer Domains
    log_info "Prüfe verfügbare Domains..."
    cloudflared tunnel list-domains 2>/dev/null || true
    
    read -rp "Geben Sie Ihre Domain ein (z.B. example.com): " domain
    
    if [[ -z "$domain" ]]; then
        log_error "Domain ist erforderlich"
        exit 1
    fi
    
    echo "$domain"
}

# Konfiguriere DNS-Einträge
configure_dns() {
    local tunnel_id=$1
    local domain=$2
    
    log_step "Konfiguriere DNS-Einträge..."
    
    # Definiere Subdomains
    local subdomains=("api" "ws" "code" "dashboard")
    
    for subdomain in "${subdomains[@]}"; do
        local hostname="${subdomain}.${domain}"
        log_info "Erstelle DNS-Eintrag: ${hostname}"
        
        cloudflared tunnel route dns "$tunnel_id" "$hostname" || {
            log_warn "DNS-Eintrag für ${hostname} konnte nicht erstellt werden"
            log_info "Möglicherweise existiert er bereits oder Domain ist nicht autorisiert"
        }
    done
    
    log_success "DNS-Einträge konfiguriert"
}

# Generiere Token
generate_token() {
    log_step "Generiere Tunnel-Token..."
    
    log_info "Der Token wird benötigt, um den Tunnel in Codespaces zu starten."
    log_info "Speichern Sie diesen Token sicher!"
    
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  TOKEN ERSTELLUNG${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Folgen Sie diesen Schritten im Cloudflare Dashboard:"
    echo ""
    echo "1. Besuchen Sie: https://dash.cloudflare.com/"
    echo "2. Wählen Sie Ihre Domain aus"
    echo "3. Gehen Sie zu: Zero Trust > Access > Tunnels"
    echo "4. Klicken Sie auf Ihren erstellten Tunnel"
    echo "5. Klicken Sie auf 'Configure'"
    echo "6. Wählen Sie 'Docker' unter 'Choose your environment'"
    echo "7. Kopieren Sie den angezeigten Token (beginnt mit 'eyJ...')"
    echo ""
    echo -e "${CYAN}Alternativ über CLI:${NC}"
    echo "  Der Token ist in: ~/.cloudflared/*.json"
    echo "  (nicht direkt lesbar, aber nutzbar)"
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Versuche Token zu extrahieren
    local creds_file
    creds_file=$(ls ~/.cloudflared/*.json 2>/dev/null | head -1)
    
    if [[ -n "$creds_file" ]]; then
        log_info "Credential-Datei gefunden: ${creds_file}"
        log_info "Diese Datei kann im Tunnel verwendet werden."
    fi
}

# Erstelle .env Template
create_env_template() {
    local tunnel_id=$1
    local domain=$2
    
    log_step "Erstelle .env Template..."
    
    cat > "${PROJECT_DIR}/.env.cloudflare.example" << EOF
# Cloudflare Tunnel Konfiguration für MediSync Agents Platform
# Kopieren Sie diese Datei nach .env und füllen Sie die Werte aus

# WICHTIG: Dieser Token gehört NICHT ins Repository!
# Fügen Sie ihn zu Ihren Codespaces Secrets hinzu:
# GitHub > Settings > Secrets and variables > Codespaces > New repository secret
# Name: CF_TUNNEL_TOKEN

CF_TUNNEL_TOKEN=eyJ...
CF_TUNNEL_ID=${tunnel_id}

# Hostnames (ersetzen Sie example.com mit Ihrer Domain)
CF_API_HOSTNAME=api.${domain}
CF_WS_HOSTNAME=ws.${domain}
CF_CODE_HOSTNAME=code.${domain}
CF_DASHBOARD_HOSTNAME=dashboard.${domain}
EOF

    log_success "Template erstellt: .env.cloudflare.example"
}

# Zeige Zusammenfassung
show_summary() {
    local tunnel_id=$1
    local domain=$2
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  SETUP ABGESCHLOSSEN${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Tunnel-ID:    ${tunnel_id}"
    echo "Domain:       ${domain}"
    echo ""
    echo "Ihre URLs werden sein:"
    echo "  - https://api.${domain}         (API Backend)"
    echo "  - https://ws.${domain}          (WebSocket Server)"
    echo "  - https://code.${domain}        (Code Server)"
    echo "  - https://dashboard.${domain}   (React Dashboard)"
    echo ""
    echo -e "${YELLOW}Nächste Schritte:${NC}"
    echo ""
    echo "1. Kopieren Sie den Tunnel-Token aus dem Cloudflare Dashboard"
    echo "   (Zero Trust > Access > Tunnels > Ihr Tunnel)"
    echo ""
    echo "2. Fügen Sie den Token zu Ihren Codespaces Secrets hinzu:"
    echo "   https://github.com/settings/codespaces"
    echo "   Klicken Sie auf 'New secret' und erstellen Sie:"
    echo "   - Name:  CF_TUNNEL_TOKEN"
    echo "   - Value: [Ihr Token]"
    echo ""
    echo "3. Starten Sie Ihren Codespace neu oder führen Sie aus:"
    echo "   bash .devcontainer/cloudflared/start.sh"
    echo ""
    echo "4. Prüfen Sie den Status mit:"
    echo "   bash scripts/status.sh"
    echo ""
    echo -e "${CYAN}Dokumentation:${NC} docs/TUNNEL_SETUP.md"
    echo ""
}

# Hauptfunktion
main() {
    print_header
    
    check_prerequisites
    install_cloudflared
    
    # Prüfe ob bereits eingeloggt
    if [[ ! -f ~/.cloudflared/cert.pem ]]; then
        login_cloudflare
    else
        log_info "Bereits bei Cloudflare angemeldet"
    fi
    
    local tunnel_id
    tunnel_id=$(create_tunnel)
    
    local domain
    domain=$(get_domain)
    
    configure_dns "$tunnel_id" "$domain"
    generate_token
    create_env_template "$tunnel_id" "$domain"
    show_summary "$tunnel_id" "$domain"
}

# Führe main aus
main "$@"
