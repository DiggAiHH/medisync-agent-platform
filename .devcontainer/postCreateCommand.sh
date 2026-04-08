#!/bin/bash
set -e

echo "========================================="
echo "  Post-Create Setup"
echo "========================================="
echo ""

# Farben für Ausgaben
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ==========================================
# Globale npm-Pakete installieren
# ==========================================
echo -e "${YELLOW}🌐 Installiere globale npm-Pakete...${NC}"

GLOBAL_PACKAGES=(
    "typescript@latest"
    "ts-node@latest"
    "nodemon@latest"
    "@types/node@latest"
    "pm2@latest"
    "code-server@latest"
)

for package in "${GLOBAL_PACKAGES[@]}"; do
    echo "  → Installiere $package..."
    npm install -g "$package" --silent
done

echo -e "${GREEN}  ✓ Globale Pakete installiert:${NC}"
echo "    • typescript ($(tsc --version 2>/dev/null || echo 'N/A'))"
echo "    • ts-node ($(ts-node --version 2>/dev/null || echo 'N/A'))"
echo "    • nodemon ($(nodemon --version 2>/dev/null || echo 'N/A'))"
echo "    • pm2 ($(pm2 --version 2>/dev/null || echo 'N/A'))"
echo "    • code-server ($(code-server --version 2>/dev/null | head -1 || echo 'N/A'))"
echo ""

# ==========================================
# Git Konfiguration
# ==========================================
echo -e "${YELLOW}⚙️  Git Konfiguration...${NC}"

if [ -z "$(git config --global user.name 2>/dev/null)" ]; then
    git config --global user.name "MediSync Developer"
    echo "  → Git user.name gesetzt"
fi

if [ -z "$(git config --global user.email 2>/dev/null)" ]; then
    git config --global user.email "dev@medisync.local"
    echo "  → Git user.email gesetzt"
fi

git config --global --add safe.directory /workspaces/agents-platform
echo -e "${GREEN}  ✓ Git konfiguriert${NC}"
echo ""

# ==========================================
# Verzeichnisstruktur erstellen
# ==========================================
echo -e "${YELLOW}📁 Erstelle Verzeichnisstruktur...${NC}"

mkdir -p /workspaces/agents-platform/{logs,data,.tmp}
mkdir -p /home/node/.local/share/code-server/extensions
mkdir -p /home/node/.local/share/code-server/user-data

echo -e "${GREEN}  ✓ Verzeichnisse erstellt${NC}"
echo ""

# ==========================================
# Zusammenfassung anzeigen
# ==========================================
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}           ${GREEN}MediSync DevContainer ist bereit!${NC}                    ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📋 Verfügbare URLs:${NC}"
echo ""
echo -e "  ${GREEN}➜ API Server:${NC}      http://localhost:3000"
echo -e "  ${GREEN}➜ WebSocket:${NC}       http://localhost:8080"
echo -e "  ${GREEN}➜ code-server:${NC}     https://localhost:8443"
echo -e "  ${GREEN}➜ Redis:${NC}           redis://localhost:6379"
echo ""

# GitHub Codespaces spezifische URLs
if [ -n "$CODESPACES" ] && [ "$CODESPACES" = "true" ]; then
    echo -e "${BLUE}🌐 GitHub Codespaces URLs:${NC}"
    echo ""
    echo -e "  ${GREEN}➜ API Server:${NC}      https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    echo -e "  ${GREEN}➜ WebSocket:${NC}       wss://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    echo -e "  ${GREEN}➜ code-server:${NC}     https://${CODESPACE_NAME}-8443.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    echo ""
fi

echo -e "${BLUE}🔧 Umgebungsvariablen:${NC}"
echo ""
echo "  REDIS_URL=$REDIS_URL"
echo "  NODE_ENV=$NODE_ENV"
echo "  GITHUB_TOKEN=${GITHUB_TOKEN:+****}"
echo "  DISCORD_TOKEN=${DISCORD_TOKEN:+****}"
echo ""

echo -e "${BLUE}📖 Nützliche Befehle:${NC}"
echo ""
echo "  npm run dev         # Starte Entwicklungsserver"
echo "  npm run build       # Baue das Projekt"
echo "  npm run test        # Führe Tests aus"
echo "  redis-cli           # Redis CLI öffnen"
echo "  code-server         # Starte code-server manuell"
echo ""

echo -e "${GREEN}Happy Coding! 🚀${NC}"
echo ""
