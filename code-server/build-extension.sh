#!/bin/bash

# Build-Skript für Medical AI Extension
# Baut die Extension und kopiert sie ins Extensions-Verzeichnis

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$SCRIPT_DIR/extensions/medical-ai-extension"
CODE_SERVER_EXTENSIONS="$SCRIPT_DIR/extensions"

echo "=========================================="
echo "Medical AI Extension - Build"
echo "=========================================="

# Prüfe ob Extension-Verzeichnis existiert
if [ ! -d "$EXTENSION_DIR" ]; then
    echo "❌ Fehler: Extension-Verzeichnis nicht gefunden: $EXTENSION_DIR"
    exit 1
fi

cd "$EXTENSION_DIR"

# npm install
echo "📦 Installiere Abhängigkeiten..."
npm install

# TypeScript kompilieren
echo "🔨 Kompiliere TypeScript..."
npm run compile

# Erstelle Extensions-Zielverzeichnis
echo "📁 Erstelle Extensions-Verzeichnis..."
mkdir -p "$CODE_SERVER_EXTENSIONS/medical-ai-extension"

# Kopiere kompilierte Dateien
echo "📋 Kopiere Extension-Dateien..."
cp -r out "$CODE_SERVER_EXTENSIONS/medical-ai-extension/"
cp -r media "$CODE_SERVER_EXTENSIONS/medical-ai-extension/"
cp package.json "$CODE_SERVER_EXTENSIONS/medical-ai-extension/"

# Kopiere optionale Dateien falls vorhanden
[ -f CHANGELOG.md ] && cp CHANGELOG.md "$CODE_SERVER_EXTENSIONS/medical-ai-extension/"
[ -f README.md ] && cp README.md "$CODE_SERVER_EXTENSIONS/medical-ai-extension/"

echo ""
echo "✅ Build erfolgreich!"
echo "📍 Extension installiert in: $CODE_SERVER_EXTENSIONS/medical-ai-extension"
echo ""
echo "Verfügbare Befehle:"
echo "  - Medical AI Panel öffnen: Ctrl+Shift+M"
echo "  - Text analysieren: Ctrl+Shift+A"
echo "  - Provider wechseln: Command Palette → 'Medical AI: Switch Provider'"
