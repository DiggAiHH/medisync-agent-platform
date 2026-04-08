# Medical AI Extension für Code-Server

Diese Extension bringt KI-gestützte medizinische Dokumentation in den code-server. Sie unterstützt mehrere LLM-Provider (Ollama lokal, GitHub Models, Backend API) mit automatischem Fallback.

## Features

- 🔍 **Text-Analyse** - Extrahiert Schlüsselpunkte aus medizinischen Texten
- 📝 **Zusammenfassung** - Erstellt prägnante Berichtszusammenfassungen
- 💬 **Chat-Interface** - Interaktiver KI-Assistent mit Streaming
- 📋 **ICD-10 Vorschläge** - Automatische Diagnose-Codierung
- 🔄 **Multi-Provider** - Ollama (lokal) → Backend → GitHub Models (Fallback)
- 🛡️ **DSGVO-konform** - Lokale Verarbeitung möglich

## Schnellstart

```bash
# 1. Extension bauen und installieren
./setup-extension.sh

# 2. Ollama starten (falls verwendet)
ollama serve

# 3. code-server neu starten
code-server --restart

# 4. Medical AI Panel öffnen
# Ctrl+Shift+M oder Command Palette → "Medical AI: Open Panel"
```

## Konfiguration

### Umgebungsvariablen

| Variable | Beschreibung | Default |
|----------|-------------|---------|
| `OLLAMA_HOST` | Ollama Endpoint | `http://localhost:11434` |
| `OLLAMA_MODEL` | Standard LLM Modell | `llama3.2` |
| `GITHUB_TOKEN` | GitHub PAT für Models API | - |
| `GITHUB_MODELS_MODEL` | GitHub Models Modell | `gpt-4o-mini` |
| `BACKEND_API_URL` | Backend API URL | `http://localhost:3001` |
| `BACKEND_API_KEY` | Backend API Key | - |
| `LLM_PROVIDER` | Provider: auto/ollama/github/backend | `auto` |

### VS Code Settings

```json
{
  "medicalAi.ollamaEndpoint": "http://localhost:11434",
  "medicalAi.modelName": "llama3.2",
  "medicalAi.llmProvider": "auto",
  "medicalAi.githubToken": "ghp_...",
  "medicalAi.backendUrl": "http://localhost:3001"
}
```

## LLM Provider

### 1. Ollama (Lokal - Empfohlen)

Vollständig lokale Verarbeitung, DSGVO-konform.

```bash
# Installation
curl -fsSL https://ollama.com/install.sh | sh

# Modell herunterladen
ollama pull llama3.2

# Service starten
ollama serve
```

### 2. Backend API

Verwendet das agents-platform Backend für KI-Anfragen.

```bash
# Backend muss laufen
export BACKEND_API_URL=http://localhost:3001
```

### 3. GitHub Models (Fallback)

Cloud-basierter Fallback wenn lokale Optionen nicht verfügbar.

```bash
# GitHub Token benötigt
export GITHUB_TOKEN=ghp_your_token_here
```

**Token erstellen:**
1. GitHub → Settings → Developer settings → Personal access tokens
2. Models berechtigen
3. Token kopieren und als Umgebungsvariable setzen

## Extension Laden

### Automatisch (empfohlen)

Die Extension wird automatisch geladen wenn:
1. Das `extensions/` Verzeichnis existiert
2. Die Extension kompiliert wurde (`npm run compile`)
3. code-server neu gestartet wurde

### Manuell

```bash
# Extension verpacken
cd extensions/medical-ai-extension
vsce package

# In code-server installieren
code-server --install-extension medical-ai-assistant-2.0.0.vsix
```

## Troubleshooting

### Extension wird nicht geladen

```bash
# Prüfe ob Extension existiert
ls -la extensions/medical-ai-extension/out/

# Neu bauen
cd extensions/medical-ai-extension
npm install
npm run compile

# code-server neu starten
pkill -f code-server
code-server
```

### Ollama nicht erreichbar

```bash
# Prüfe ob Ollama läuft
curl http://localhost:11434/api/tags

# Ollama starten
ollama serve

# Modell prüfen
ollama list
ollama pull llama3.2
```

### GitHub Models nicht verfügbar

```bash
# Token prüfen
echo $GITHUB_TOKEN

# API testen
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://models.inference.ai.azure.com/models
```

### Kein Provider verfügbar

```bash
# Alle Provider prüfen
code-server --command medicalAi.checkProviders

# oder in VS Code Command Palette:
# "Medical AI: Check Providers"
```

## Dateistruktur

```
code-server/
├── config.yaml              # Code-Server Konfiguration
├── setup-extension.sh       # Setup-Skript
├── build-extension.sh       # Build-Skript
├── extensions/
│   └── medical-ai-extension/
│       ├── package.json
│       ├── tsconfig.json
│       ├── out/            # Kompilierte JS-Dateien
│       ├── media/          # CSS/JS für Webview
│       └── src/
│           ├── extension.ts
│           ├── services/
│           │   ├── llmService.ts        # Unified LLM Interface
│           │   ├── ollamaService.ts     # Ollama Integration
│           │   ├── githubModelsService.ts
│           │   └── backendApiService.ts
│           ├── providers/
│           │   └── sidebarProvider.ts
│           └── types/
│               └── shared.ts
└── .devcontainer/
    └── postCreateCommand.sh
```

## Unterschiede zur Original-Extension

| Feature | Original | Code-Server Edition |
|---------|----------|---------------------|
| Ollama Endpoint | Hardcoded localhost | Umgebungsvariable `OLLAMA_HOST` |
| Provider | Nur Ollama | Multi-Provider mit Fallback |
| GitHub Models | ❌ | ✅ Fallback |
| Backend API | ❌ | ✅ Integration |
| Auto-Detection | ❌ | ✅ Provider-Auto-Select |
| Chat-Persistenz | globalState | globalState + Backend |
| Version | 1.1.0 | 2.0.0 |

## API Integration

Die Extension kann mit dem agents-platform Backend kommunizieren:

```typescript
// Beispiel: Dokument analysieren
const response = await backendApiService.analyzeText({
    text: "Patient hat Fieber...",
    type: "analyze",
    patientId: "12345"
});
```

## Security Notes

- 🔒 `GITHUB_TOKEN` niemals im Code speichern
- 🔒 `.env` Dateien in `.gitignore` aufnehmen
- 🔒 Backend API Keys nur über Umgebungsvariablen
- ✅ Ollama bleibt bevorzugte Option für DSGVO-Konformität

## Support

- 📖 [Ollama Dokumentation](https://ollama.com/docs)
- 📖 [GitHub Models](https://github.com/marketplace/models)
- 🐛 Issues: [GitHub Issues](https://github.com/your-org/agents-platform/issues)

## Lizenz

MIT License - Siehe Extension README
