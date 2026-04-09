# MediSync Agent Dashboard

React-basiertes Dashboard für die MediSync Agenten-Plattform.

## Features

- 📊 **Echtzeit-Statistiken** - Übersicht über alle Jobs (Gesamt, Aktiv, Abgeschlossen, Fehlgeschlagen)
- 📋 **Job-Verwaltung** - Tabelle mit allen Jobs, sortierbar und filterbar
- 🔴 **Live-Streaming** - Echtzeit-Anzeige von Agent-Antworten via WebSocket
- 📄 **Job-Details** - Detaillierte Ansicht mit Prompt und Ergebnis
- ➕ **Job Erstellung** - Neuer Job direkt aus dem Dashboard erstellen
- 🔄 **Auto-Refresh** - Automatische Aktualisierung alle 5 Sekunden

## Technologien

- **React 18** - UI Library
- **TypeScript** - Typsicherheit
- **Vite** - Build Tool
- **React Query** - Daten-Fetching und Caching
- **Axios** - HTTP Client
- **WebSocket** - Echtzeit-Kommunikation

## Installation

```bash
# Dependencies installieren
npm install

# Development Server starten
npm run dev

# Production Build
npm run build
```

## Konfiguration

Erstelle eine `.env` Datei basierend auf `.env.example`:

```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:8080
VITE_DEMO_MODE=false
VITE_BASE_PATH=/
```

Fuer eine statische Produktvorschau ohne Backend kann das Dashboard im Demo-Modus gebaut werden:

```env
VITE_DEMO_MODE=true
VITE_BASE_PATH=/medisync-agent-platform/
```

## Oeffentliche Bereitstellung

Dieses Repository enthaelt einen GitHub-Pages-Workflow fuer das Dashboard. Der Workflow baut die App aus `dashboard/` und veroeffentlicht eine Demo-Vorschau mit Beispieldaten.

Aktuelle Live-Demo: https://diggaihh.github.io/medisync-agent-platform/
Repository: https://github.com/DiggAiHH/medisync-agent-platform

Fuer eine Live-Umgebung setzen Sie stattdessen beim Build:

```env
VITE_API_URL=https://api.example.com
VITE_WS_URL=wss://api.example.com
VITE_DEMO_MODE=false
```

## Projektstruktur

```
src/
├── api/
│   └── jobs.ts           # API Client und Axios Instance
├── components/
│   ├── CreateJobModal.tsx
│   ├── JobDetail.tsx
│   ├── JobList.tsx
│   ├── StatsPanel.tsx
│   ├── StatusBadge.tsx
│   └── StreamingView.tsx
├── hooks/
│   ├── useJobs.ts        # React Query Hooks
│   └── useWebSocket.ts   # WebSocket Hook mit Auto-Reconnect
├── types/
│   └── index.ts          # TypeScript Interfaces
├── App.tsx               # Hauptkomponente
├── main.tsx              # Entry Point
├── App.css               # App-spezifische Styles
└── index.css             # Globale Styles
```

## API Endpoints

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | /api/jobs | Alle Jobs holen |
| GET | /api/jobs/:id | Einzelnen Job holen |
| POST | /api/jobs | Neuen Job erstellen |
| GET | /api/jobs/stats | Job Statistiken |

## WebSocket Events

| Event | Beschreibung |
|-------|--------------|
| `job_update` | Job Status wurde aktualisiert |
| `stream_chunk` | Neuer Stream-Chunk empfangen |
| `stream_end` | Streaming beendet |
| `connected` | Verbindung hergestellt |

## Status Badges

| Status | Farbe | Beschreibung |
|--------|-------|--------------|
| `pending` | Grau | Job wartet auf Verarbeitung |
| `processing` | Blau | Job wird bearbeitet |
| `completed` | Grün | Job erfolgreich abgeschlossen |
| `failed` | Rot | Job fehlgeschlagen |

## Development

```bash
# Linting
npm run lint

# Preview Production Build
npm run preview
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
