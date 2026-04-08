#!/bin/bash

# Setup-Skript für Medical AI Extension im Code-Server
# Kompiliert und installiert die Extension

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$SCRIPT_DIR/extensions/medical-ai-extension"
CODE_SERVER_DATA="${CODE_SERVER_DATA:-$HOME/.local/share/code-server}"

echo "=========================================="
echo "Medical AI Extension - Setup"
echo "=========================================="

# Farbcodes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Prüfe ob Extension-Verzeichnis existiert
if [ ! -d "$EXTENSION_DIR" ]; then
    echo -e "${RED}❌ Fehler: Extension nicht gefunden in $EXTENSION_DIR${NC}"
    echo "Bitte führen Sie zuerst build-extension.sh aus"
    exit 1
fi

cd "$EXTENSION_DIR"

# Prüfe ob kompilierte Dateien existieren
if [ ! -d "out" ]; then
    echo -e "${YELLOW}⚠️  Extension noch nicht kompiliert${NC}"
    echo "Führe Build aus..."
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm nicht gefunden. Bitte Node.js installieren.${NC}"
        exit 1
    fi
    
    npm install
    npm run compile
fi

# Prüfe ob code-server installiert ist
if ! command -v code-server &> /dev/null; then
    echo -e "${RED}❌ code-server nicht gefunden${NC}"
    echo "Bitte installieren Sie code-server:"
    echo "  curl -fsSL https://code-server.dev/install.sh | sh"
    exit 1
fi

echo -e "${GREEN}✓ code-server gefunden${NC}"

# Installiere Extension in code-server
echo "📦 Installiere Extension in code-server..."

# Methode 1: Direkte Installation über --install-extension
if code-server --install-extension "$EXTENSION_DIR" --force 2>/dev/null; then
    echo -e "${GREEN}✅ Extension erfolgreich installiert${NC}"
else
    echo -e "${YELLOW}⚠️  Direkte Installation fehlgeschlagen, versuche alternative Methode...${NC}"
    
    # Methode 2: Manuelle Installation ins Extensions-Verzeichnis
    CODE_SERVER_EXT_DIR="$CODE_SERVER_DATA/extensions"
    mkdir -p "$CODE_SERVER_EXT_DIR"
    
    EXT_NAME="medical-ai-assistant-2.0.0"
    TARGET_DIR="$CODE_SERVER_EXT_DIR/$EXT_NAME"
    
    # Lösche alte Version falls vorhanden
    rm -rf "$TARGET_DIR"
    
    # Kopiere Extension
    cp -r "$EXTENSION_DIR" "$TARGET_DIR"
    
    echo -e "${GREEN}✅ Extension nach $TARGET_DIR kopiert${NC}"
fi

# Erstelle Verzeichnis für extension-linked mode
mkdir -p "$SCRIPT_DIR/extensions"
if [ ! -L "$SCRIPT_DIR/extensions/medical-ai-extension" ]; then
    ln -sf "$EXTENSION_DIR" "$SCRIPT_DIR/extensions/medical-ai-extension" 2>/dev/null || true
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Setup abgeschlossen!${NC}"
echo "=========================================="
echo ""
echo "Umgebungsvariablen für Konfiguration:"
echo "  OLLAMA_HOST         - Ollama Endpoint (default: http://localhost:11434)"
echo "  OLLAMA_MODEL        - Standard Modell (default: llama3.2)"
echo "  GITHUB_TOKEN        - GitHub Token für Fallback"
echo "  BACKEND_API_URL     - Backend API URL"
echo ""
echo "Verfügbare Provider:"
echo "  • ollama   - Lokale Ollama Instanz (bevorzugt)"
echo "  • github   - GitHub Models API (Fallback)"
echo "  • backend  - Agents-Platform Backend"
echo "  • auto     - Automatische Auswahl"
echo ""
echo "Nächste Schritte:"
echo "  1. code-server neu starten: code-server --restart"
echo "  2. Medical AI Panel öffnen: Ctrl+Shift+M"
echo "  3. Provider-Status prüfen: Command Palette → 'Medical AI: Check Providers'"
echo ""

# Prüfe Ollama-Verfügbarkeit
if command -v ollama &> /dev/null; then
    echo -e "${GREEN}✓ Ollama ist installiert${NC}"
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ollama läuft auf localhost:11434${NC}"
        echo "Verfügbare Modelle:"
        ollama list 2>/dev/null | tail -n +2 | while read line; do
            echo "  • $line"
        done
    else
        echo -e "${YELLOW}⚠️  Ollama läuft nicht. Starten mit: ollama serve${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Ollama nicht installiert${NC}"
    echo "   Installieren: curl -fsSL https://ollama.com/install.sh | sh"
fi

echo ""
