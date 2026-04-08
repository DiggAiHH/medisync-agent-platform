#!/bin/bash
# =============================================================================
# MediSync Agenten-Plattform - Environment Setup Script
# =============================================================================
# Dieses Skript kopiert alle .env.example Dateien zu .env
# =============================================================================

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Basis-Verzeichnis
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     MediSync Agenten-Plattform - Environment Setup           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Funktion zum Kopieren mit Status
copy_env() {
    local source="$1"
    local target="$2"
    local name="$3"
    
    if [ -f "$target" ]; then
        echo -e "${YELLOW}⚠️  $name/.env existiert bereits${NC}"
        read -p "   Überschreiben? (j/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Jj]$ ]]; then
            cp "$source" "$target"
            echo -e "${GREEN}✅ $name/.env überschrieben${NC}"
        else
            echo -e "${YELLOW}   Übersprungen${NC}"
        fi
    else
        cp "$source" "$target"
        echo -e "${GREEN}✅ $name/.env erstellt${NC}"
    fi
}

# Root .env
echo -e "${BLUE}📁 Root-Verzeichnis...${NC}"
copy_env ".env.example" ".env" "Root"

# Backend .env
echo -e "${BLUE}📁 Backend...${NC}"
if [ -d "backend" ]; then
    copy_env "backend/.env.example" "backend/.env" "Backend"
else
    echo -e "${RED}❌ Backend-Verzeichnis nicht gefunden${NC}"
fi

# Discord Bot .env
echo -e "${BLUE}📁 Discord Bot...${NC}"
if [ -d "bot/discord" ]; then
    copy_env "bot/discord/.env.example" "bot/discord/.env" "Discord Bot"
else
    echo -e "${RED}❌ Discord Bot-Verzeichnis nicht gefunden${NC}"
fi

# Dashboard .env
echo -e "${BLUE}📁 Dashboard...${NC}"
if [ -d "dashboard" ]; then
    copy_env "dashboard/.env.example" "dashboard/.env" "Dashboard"
else
    echo -e "${RED}❌ Dashboard-Verzeichnis nicht gefunden${NC}"
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     Setup Abgeschlossen!                     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}⚠️  WICHTIGE NÄCHSTE SCHRITTE:${NC}"
echo ""
echo -e "${GREEN}1. Discord Bot Token konfigurieren:${NC}"
echo "   → https://discord.com/developers/applications"
echo "   → Token in alle .env Dateien eintragen: DISCORD_TOKEN"
echo ""
echo -e "${GREEN}2. GitHub Token erstellen:${NC}"
echo "   → https://github.com/settings/tokens"
echo "   → Scopes: read:packages"
echo "   → Token in .env eintragen: GITHUB_TOKEN"
echo ""
echo -e "${GREEN}3. Secrets generieren:${NC}"
echo "   → openssl rand -base64 32"
echo "   → JWT_SECRET und SESSION_SECRET aktualisieren"
echo ""
echo -e "${BLUE}📖 Detaillierte Anleitung:${NC} SETUP_GUIDE_QUICK.md"
echo ""
