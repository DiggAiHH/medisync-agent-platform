#!/bin/bash
set -e

echo "========================================="
echo "  MediSync Agenten-Plattform Setup"
echo "========================================="
echo ""

# Farben für Ausgaben
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

WORKSPACE_DIR="/workspaces/agents-platform"
cd "$WORKSPACE_DIR"

echo -e "${BLUE}📁 Arbeitsverzeichnis: $WORKSPACE_DIR${NC}"
echo ""

# ==========================================
# 1. npm install in allen Modulen
# ==========================================
echo -e "${YELLOW}📦 Installiere npm-Pakete...${NC}"

# Haupt-Installation
if [ -f "package.json" ]; then
    echo "  → Installiere Root-Abhängigkeiten..."
    npm install
    echo -e "${GREEN}  ✓ Root-Abhängigkeiten installiert${NC}"
fi

# Sub-Module (falls vorhanden)
MODULES=("api" "websocket" "agent-core" "discord-bot" "web-ui")
for module in "${MODULES[@]}"; do
    if [ -d "$module" ] && [ -f "$module/package.json" ]; then
        echo "  → Installiere Abhängigkeiten für: $module"
        cd "$module"
        npm install
        cd "$WORKSPACE_DIR"
        echo -e "${GREEN}  ✓ $module Abhängigkeiten installiert${NC}"
    fi
done

echo ""

# ==========================================
# 2. Redis-Check
# ==========================================
echo -e "${YELLOW}🔍 Prüfe Redis-Verbindung...${NC}"

# Warte kurz, bis Redis bereit ist
sleep 2

if command -v redis-cli &> /dev/null; then
    if redis-cli -h redis ping | grep -q "PONG"; then
        echo -e "${GREEN}  ✓ Redis ist verbunden und bereit${NC}"
        echo "    Host: redis:6379"
        echo "    URL: redis://redis:6379"
    else
        echo -e "${YELLOW}  ⚠ Redis antwortet nicht auf ping${NC}"
        echo "    Versuche localhost..."
        if redis-cli -h localhost ping | grep -q "PONG"; then
            echo -e "${GREEN}  ✓ Redis über localhost erreichbar${NC}"
        else
            echo -e "${YELLOW}  ⚠ Redis-Verbindung nicht verfügbar${NC}"
        fi
    fi
else
    echo -e "${YELLOW}  ℹ redis-cli nicht installiert, überspringe Check${NC}"
fi

echo ""

# ==========================================
# 3. code-server Start (optional)
# ==========================================
CODE_SERVER_CONFIG="$WORKSPACE_DIR/.devcontainer/code-server/config.yaml"

if [ -f "$CODE_SERVER_CONFIG" ]; then
    echo -e "${YELLOW}🚀 Starte code-server...${NC}"
    
    # Prüfe ob code-server installiert ist
    if command -v code-server &> /dev/null; then
        # Starte code-server im Hintergrund
        mkdir -p /home/node/.local/share/code-server
        nohup code-server --config "$CODE_SERVER_CONFIG" > /tmp/code-server.log 2>&1 &
        
        # Warte kurz und prüfe ob es läuft
        sleep 3
        if pgrep -x "code-server" > /dev/null; then
            echo -e "${GREEN}  ✓ code-server gestartet${NC}"
            echo "    URL: https://localhost:8443"
            echo "    Config: $CODE_SERVER_CONFIG"
        else
            echo -e "${YELLOW}  ⚠ code-server konnte nicht gestartet werden${NC}"
            echo "    Log: /tmp/code-server.log"
        fi
    else
        echo -e "${YELLOW}  ℹ code-server nicht installiert${NC}"
        echo "    Installiere mit: npm install -g code-server"
    fi
else
    echo -e "${YELLOW}  ℹ code-server Konfiguration nicht gefunden${NC}"
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  ✓ Setup abgeschlossen!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Verfügbare Services:"
echo "  • API Server:      http://localhost:3000"
echo "  • WebSocket:       http://localhost:8080"
echo "  • code-server:     https://localhost:8443"
echo "  • Redis:           redis://localhost:6379"
echo ""
echo "In GitHub Codespaces sind diese über Port-Forwarding erreichbar."
echo ""
