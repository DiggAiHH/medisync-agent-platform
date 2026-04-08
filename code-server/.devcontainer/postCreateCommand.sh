#!/bin/bash

# Post-Create Command für DevContainer
# Wird ausgeführt nachdem der Container erstellt wurde

set -e

echo "=========================================="
echo "Agents-Platform DevContainer Setup"
echo "=========================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Farbcodes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 Installiere System-Abhängigkeiten...${NC}"

# Aktualisiere Paketlisten
sudo apt-get update

# Installiere nützliche Tools
sudo apt-get install -y \
    curl \
    wget \
    git \
    jq \
    htop \
    net-tools \
    vim \
    nano \
    ca-certificates \
    gnupg \
    lsb-release

# Node.js installieren (falls nicht vorhanden)
if ! command -v node &> /dev/null; then
    echo -e "${BLUE}📦 Installiere Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo -e "${GREEN}✓ Node.js $(node --version) installiert${NC}"

# Ollama installieren (optional, für lokale LLMs)
if ! command -v ollama &> /dev/null; then
    echo -e "${BLUE}🦙 Installiere Ollama...${NC}"
    curl -fsSL https://ollama.com/install.sh | sh || {
        echo -e "${YELLOW}⚠️  Ollama-Installation fehlgeschlagen (optional)${NC}"
    }
else
    echo -e "${GREEN}✓ Ollama bereits installiert${NC}"
fi

# Code-Server installieren (falls nicht vorhanden)
if ! command -v code-server &> /dev/null; then
    echo -e "${BLUE}💻 Installiere code-server...${NC}"
    curl -fsSL https://code-server.dev/install.sh | sh
else
    echo -e "${GREEN}✓ code-server bereits installiert${NC}"
fi

# Extension Setup
echo -e "${BLUE}🔌 Richte Medical AI Extension ein...${NC}"

EXTENSION_DIR="$SCRIPT_DIR/extensions/medical-ai-extension"

if [ -d "$EXTENSION_DIR" ]; then
    cd "$EXTENSION_DIR"
    
    # Installiere Extension-Abhängigkeiten
    echo "📦 Installiere Extension-Abhängigkeiten..."
    npm install
    
    # Kompiliere Extension
    echo "🔨 Kompiliere Extension..."
    npm run compile
    
    # Installiere Extension in code-server
    echo "📋 Installiere Extension..."
    if command -v code-server &> /dev/null; then
        code-server --install-extension "$EXTENSION_DIR" --force || {
            echo -e "${YELLOW}⚠️  Extension-Installation fehlgeschlagen, versuche manuelle Installation...${NC}"
            mkdir -p ~/.local/share/code-server/extensions
            cp -r "$EXTENSION_DIR" ~/.local/share/code-server/extensions/medical-ai-assistant-2.0.0
        }
    fi
    
    echo -e "${GREEN}✅ Medical AI Extension bereit${NC}"
else
    echo -e "${RED}❌ Extension-Verzeichnis nicht gefunden: $EXTENSION_DIR${NC}"
    echo "Bitte stellen Sie sicher, dass die Extension vorhanden ist."
fi

# Erstelle nützliche Aliases
echo -e "${BLUE}⚙️  Erstelle Aliases...${NC}"
cat >> ~/.bashrc << 'EOF'

# Agents-Platform Aliases
alias cs='code-server'
alias cs-restart='code-server --restart'
alias cs-logs='journalctl -u code-server@$USER -f'
alias ollama-serve='ollama serve'
alias medical-ai-status='curl -s http://localhost:11434/api/tags 2>/dev/null && echo "Ollama läuft" || echo "Ollama nicht erreichbar"'

# Environment Check
alias check-providers='echo "=== LLM Provider Status ===" && \
    echo "Ollama:" && (curl -s http://localhost:11434/api/tags > /dev/null && echo "  ✓ Verfügbar" || echo "  ✗ Nicht erreichbar") && \
    echo "GITHUB_TOKEN:" && ([ -n "$GITHUB_TOKEN" ] && echo "  ✓ Konfiguriert" || echo "  ✗ Nicht gesetzt") && \
    echo "BACKEND_API:" && (curl -s ${BACKEND_API_URL:-http://localhost:3001}/health > /dev/null && echo "  ✓ Verfügbar" || echo "  ✗ Nicht erreichbar")'
EOF

# Environment Variablen
echo -e "${BLUE}📝 Setze Environment-Variablen...${NC}"
cat >> ~/.bashrc << 'EOF'

# Medical AI Extension Environment
export OLLAMA_HOST=${OLLAMA_HOST:-http://localhost:11434}
export OLLAMA_MODEL=${OLLAMA_MODEL:-llama3.2}
export BACKEND_API_URL=${BACKEND_API_URL:-http://localhost:3001}
EOF

# Erstelle Verzeichnisstruktur
echo -e "${BLUE}📁 Erstelle Verzeichnisstruktur...${NC}"
mkdir -p ~/workspace
mkdir -p ~/workspace/medical-docs
mkdir -p ~/workspace/templates
mkdir -p ~/logs

# Ollama Service einrichten (falls installiert)
if command -v ollama &> /dev/null; then
    echo -e "${BLUE}🦙 Richte Ollama Service ein...${NC}"
    
    # Pull default model im Hintergrund
    (
        sleep 5
        echo "Lade Standard-Modell (llama3.2)..."
        ollama pull llama3.2 2>/dev/null || echo "Modell-Download im Hintergrund gestartet"
    ) &
    
    # Systemd Service erstellen falls systemd verfügbar
    if command -v systemctl &> /dev/null; then
        sudo tee /etc/systemd/system/ollama.service > /dev/null << 'EOF'
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3
Environment="PATH=$PATH"

[Install]
WantedBy=default.target
EOF
        echo -e "${GREEN}✓ Ollama Service-Datei erstellt${NC}"
    fi
fi

# Final Summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ DevContainer Setup abgeschlossen!${NC}"
echo "=========================================="
echo ""
echo "Verfügbare Befehle:"
echo "  code-server     - Startet code-server"
echo "  ollama serve    - Startet Ollama Service"
echo "  check-providers - Zeigt LLM Provider Status"
echo ""
echo "Medical AI Extension:"
echo "  Panel öffnen:      Ctrl+Shift+M"
echo "  Text analysieren: Ctrl+Shift+A"
echo "  Provider-Status:   Command Palette → 'Medical AI: Check Providers'"
echo ""
echo "Wichtige Pfade:"
echo "  Extension:   $EXTENSION_DIR"
echo "  Workspace:   ~/workspace"
echo "  Logs:        ~/logs"
echo ""
echo "Nächste Schritte:"
echo "  1. Starte code-server: code-server --bind-addr 0.0.0.0:8080"
echo "  2. Öffne Medical AI Panel (Ctrl+Shift+M)"
echo "  3. Prüfe Provider-Status"
echo "  4. Beginne mit der Dokumentation"
echo ""
echo -e "${YELLOW}Hinweis: Bei Verwendung von GitHub Models, setzen Sie GITHUB_TOKEN${NC}"
echo ""
