# MediSync Telephony Service

DSGVO-konforme KI-Telefonassistenz mit Starface PBX Integration. Alle Daten werden **lokal** verarbeitet — kein Cloud-Upload.

## Architektur

```
Starface PBX ──REST API──▶ Telephony Gateway (Express)
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
      Whisper.cpp (STT)   Ollama (Triage)   Piper (TTS)
      localhost:8178       localhost:11434    localhost:5030
```

### Module

| Modul | Beschreibung |
|-------|-------------|
| `starface/` | REST-Client für die Starface PBX (Calls, Contacts, Voicemail, Users, Groups) |
| `audio/` | Whisper STT-Transkription, Piper TTS-Synthese, Audio-Dateiverwaltung |
| `triage/` | KI-gestützte Anrufpriorisierung (Dringlichkeit, Absicht, Empathie, Vordokumentation) |
| `compliance/` | DSGVO-Module (Einwilligung, Audit-Log, PII-Redaktion, Aufbewahrungsfristen) |
| `gateway/` | Express-Server, REST-API, WebSocket-Live-Updates |

## Voraussetzungen

- **Node.js** ≥ 18
- **Starface PBX** mit aktivierter REST-API
- **Ollama** lokal installiert mit deutschem Modell (z.B. `llama3.2`)
- **Whisper.cpp** HTTP-Server (Port 8178) — oder Docker-Container
- **Piper TTS** (Port 5030) — oder Docker-Container

## Installation

```bash
cd agents-platform/telephony
npm install
```

## Konfiguration

Kopiere `.env.example` nach `.env` und passe die Werte an:

```bash
cp .env.example .env
```

Wichtige Einstellungen:

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `STARFACE_BASE_URL` | — | Starface PBX URL (z.B. `https://192.168.1.100:443`) |
| `STARFACE_LOGIN_ID` | — | Starface Login-ID |
| `STARFACE_PASSWORD` | — | Starface Passwort |
| `WHISPER_ENDPOINT` | `http://localhost:8178` | Whisper.cpp HTTP-Endpunkt |
| `OLLAMA_ENDPOINT` | `http://localhost:11434` | Ollama API-Endpunkt |
| `PIPER_ENDPOINT` | `http://localhost:5030` | Piper TTS-Endpunkt |
| `TELEPHONY_PORT` | `3100` | Gateway REST-Port |
| `TELEPHONY_WS_PORT` | `8180` | WebSocket-Port für Live-Updates |

## Entwicklung

```bash
# TypeScript kompilieren
npm run build

# Dev-Server mit ts-node
npm run dev

# Watch-Modus
npm run watch

# Tests ausführen
npm test

# Lint
npm run lint
```

## Docker

```bash
# Aus dem Root-Verzeichnis (agents-platform/)
docker compose up telephony whisper piper
```

## API-Endpunkte

### REST

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/health` | Gesundheitsstatus aller Dienste |
| `GET` | `/api/calls` | Aktive Anrufe (Starface) |
| `POST` | `/api/triage` | Manuelle Transkript-Analyse |
| `POST` | `/api/transcripts/upload` | Audio-Upload + Transkription |

### WebSocket

Verbindung zu `ws://localhost:8180` für Echtzeit-Updates:

```json
{ "type": "call:new", "payload": { ... } }
{ "type": "call:ended", "payload": { ... } }
{ "type": "triage:result", "payload": { ... } }
{ "type": "transcription:progress", "payload": { ... } }
```

## DSGVO-Konformität

- **Einwilligung**: Aufnahme/KI-Verarbeitung nur nach verbaler Zustimmung
- **Audit-Log**: Alle sicherheitsrelevanten Aktionen werden protokolliert
- **PII-Redaktion**: Personenbezogene Daten in Logs werden automatisch maskiert
- **Aufbewahrungsfristen**: Audio 90 Tage, Transkripte 10 Jahre (§ 630f BGB)
- **100% lokal**: Keine Daten verlassen den Praxis-Server

## Tests

76 Unit-Tests decken alle Module ab:

```bash
npm test
```

Testbereiche: Starface Auth, Triage (Urgency/Intent/Empathy), PatientMatcher, DSGVO-Compliance, Audio-Konfiguration, Starface Calls, Config-Validation, Prompts.

## Lizenz

MIT
