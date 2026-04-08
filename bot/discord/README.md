# MediSync Discord Bot

Ein Discord Bot für die MediSync Agenten-Plattform, der es Benutzern ermöglicht, mit KI-Agenten über Discord zu interagieren.

## Features

- 🔗 **Integration** mit der MediSync Agenten-Plattform API
- 💬 **Slash Commands**: `/agent <prompt>` für Agent-Anfragen
- 🔄 **WebSocket-Verbindung**: Echtzeit-Updates zu Agent-Antworten
- 🧵 **Thread-Unterstützung**: Lange Konversationen werden automatisch in Threads organisiert
- ⏱️ **Rate Limiting**: Verhindert Überlastung (1 Nachricht/Sekunde pro Benutzer)
- 🔒 **Ephemeral Messages**: Nur der anfragende Benutzer sieht die Nachrichten

## Installation

### Voraussetzungen

- Node.js 18+
- npm oder yarn
- Discord Bot Token
- Laufende MediSync API (localhost:3000)
- Laufender WebSocket Server (localhost:8080)

### Setup

1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

2. **Umgebungsvariablen konfigurieren:**
   ```bash
   cp .env.example .env
   # Bearbeite .env mit deinen Werten
   ```

3. **Slash Commands deployen:**
   ```bash
   npm run deploy-commands
   ```

4. **Bot starten:**
   ```bash
   # Entwicklung
   npm run dev
   
   # Produktion
   npm run build
   npm start
   ```

## Umgebungsvariablen

| Variable | Beschreibung | Erforderlich |
|----------|-------------|--------------|
| `DISCORD_TOKEN` | Discord Bot Token | Ja |
| `DISCORD_CLIENT_ID` | Discord Application ID | Ja |
| `DISCORD_GUILD_ID` | Test-Server ID (optional, für schnelleres Testing) | Nein |
| `API_BASE_URL` | MediSync API URL | Nein (default: http://localhost:3000) |
| `WEBSOCKET_URL` | WebSocket Server URL | Nein (default: ws://localhost:8080) |
| `RATE_LIMIT_DELAY` | Rate Limit in ms | Nein (default: 1000) |
| `REQUEST_TIMEOUT` | API Request Timeout in ms | Nein (default: 30000) |

## Slash Commands

### `/agent <prompt>`

Sendet eine Anfrage an den MediSync Agenten.

**Parameter:**
- `prompt` (erforderlich): Die Anfrage an den Agenten (max. 4000 Zeichen)

**Ablauf:**
1. Der Benutzer sendet `/agent "Wie behandle ich Diabetes Typ 2?"`
2. Der Bot antwortet mit einer ephemeral "Processing..." Nachricht
3. Die Anfrage wird an `POST /api/jobs` gesendet
4. Der Bot wartet auf WebSocket-Updates
5. Bei Fertigstellung wird das Ergebnis an den Benutzer gesendet

## Projektstruktur

```
src/
├── bot.ts                 # Haupt-Einstiegspunkt
├── commands/
│   └── agentCommand.ts    # /agent Slash Command
├── handlers/
│   └── messageHandler.ts  # WebSocket Message Handler
├── utils/
│   ├── apiClient.ts       # API HTTP Client
│   ├── rateLimiter.ts     # Rate Limiting
│   └── sessionManager.ts  # Session Management
├── types/
│   └── index.ts           # TypeScript Type Definitions
├── deployCommands.ts      # Slash Command Deployment
└── index.ts               # Module Exports
```

## Fehlerbehandlung

Der Bot implementiert umfassende Fehlerbehandlung:

- **API Timeouts**: Benutzerfreundliche Timeout-Nachrichten
- **Verbindungsfehler**: Automatische WebSocket-Reconnects (max. 5 Versuche)
- **Rate Limits**: Wartezeit wird dem Benutzer angezeigt
- **Unbekannte Fehler**: Werden geloggt, aber nicht dem Benutzer angezeigt

## Entwicklung

### Build
```bash
npm run build
```

### Watch Mode
```bash
npm run watch
```

### Linting
```bash
npm run lint
```

## Lizenz

MIT
