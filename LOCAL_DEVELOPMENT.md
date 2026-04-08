# MediSync - Lokale Entwicklung (Ohne Docker)

Diese Anleitung beschreibt, wie du alle MediSync Services lokal ohne Docker starten kannst.

## Voraussetzungen

- **Node.js** 18 oder höher
- **npm** 9 oder höher
- **Windows PowerShell** 5.1 oder höher

## Schnellstart

```powershell
# In das Projektverzeichnis wechseln
cd agents-platform

# Services starten
.\scripts\start-local.ps1
```

Das Skript:
- Prüft alle Voraussetzungen
- Baut das Backend automatisch (falls nötig)
- Startet alle Services
- Zeigt URLs und Prozess-IDs an

## Gestartete Services

| Service | Port | URL | Beschreibung |
|---------|------|-----|--------------|
| Backend API | 3000 | http://localhost:3000 | REST API für Jobs |
| WebSocket | 8080 | ws://localhost:8080 | Echtzeit-Streaming |
| Dashboard | 4173 | http://localhost:4173 | React Web UI |
| Worker | - | - | Job-Verarbeitung |

## Was ist anders?

### Ohne Redis (In-Memory Queue)
Statt Redis wird eine **In-Memory Queue** verwendet:
- Jobs werden im RAM gespeichert
- Keine Persistenz über Neustarts
- Ideal für lokale Entwicklung und Tests

### Was wird NICHT gestartet?
- ❌ **Redis** - Nicht erforderlich (In-Memory)
- ❌ **Discord Bot** - Braucht echten Token
- ❌ **Monitoring** (Grafana/Prometheus) - Optional

## Befehle

### Services starten
```powershell
.\scripts\start-local.ps1
```

### Status prüfen
```powershell
.\scripts\status-local.ps1
```

Zeigt:
- Welche Ports belegt sind
- Laufende Node.js Prozesse
- API Health Status
- Queue-Statistiken

### Services stoppen
Drücke `Strg+C` im Terminal oder beende die Fenster.

Alternativ:
```powershell
# Finde und stoppe Node-Prozesse
Get-Process node | Stop-Process
```

## Manuelles Starten (für Debugging)

Falls du einzelne Services debuggen willst:

### 1. Backend API
```powershell
cd backend
$env:USE_MEMORY_QUEUE="true"
npm run dev
# oder: node dist/server.js
```

### 2. Worker (separates Terminal)
```powershell
cd backend
$env:USE_MEMORY_QUEUE="true"
node dist/worker/index.js
```

### 3. Dashboard (separates Terminal)
```powershell
cd dashboard
npm run dev        # Dev-Server mit Hot-Reload (Port 5173)
# oder:
npm run preview    # Production Preview (Port 4173)
```

## Umgebungsvariablen

Die wichtigsten Variablen für lokale Entwicklung:

```powershell
# Core
$env:NODE_ENV="development"
$env:USE_MEMORY_QUEUE="true"      # Aktiviert In-Memory Queue

# Ports
$env:PORT="3000"                   # API Port
$env:WS_PORT="8080"                # WebSocket Port

# URLs (für Dashboard)
$env:VITE_API_URL="http://localhost:3000"
$env:VITE_WS_URL="ws://localhost:8080"
```

## API Endpoints testen

### Health Check
```powershell
Invoke-WebRequest http://localhost:3000/health | Select-Object Content
```

### Job erstellen
```powershell
$body = @{
    prompt = "Test-Anfrage"
    userId = "test-user"
    sessionId = "test-session"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/jobs" -Method POST -Body $body -ContentType "application/json"
```

### Jobs auflisten
```powershell
Invoke-WebRequest http://localhost:3000/jobs | Select-Object -ExpandProperty Content
```

## Fehlerbehebung

### Port bereits belegt
```powershell
# Finde Prozess auf Port 3000
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess

# Beende Prozess
Stop-Process -Id <PID>
```

### Build-Fehler
```powershell
cd backend
npm install        # Abhängigkeiten installieren
npm run build      # Erneut bauen
```

### Queue funktioniert nicht
Stelle sicher, dass `USE_MEMORY_QUEUE=true` gesetzt ist:
```powershell
$env:USE_MEMORY_QUEUE="true"
```

## Unterschiede zur Docker-Version

| Feature | Docker | Lokal |
|---------|--------|-------|
| Redis | ✅ Persistent | ❌ In-Memory (flüchtig) |
| Discord Bot | ✅ Kann gestartet werden | ❌ Nicht verfügbar |
| Monitoring | ✅ Grafana/Prometheus | ❌ Nicht verfügbar |
| Hot Reload | ❌ Nein | ✅ Ja (dev mode) |
| Startzeit | Langsam (~30s) | Schnell (~5s) |

## Entwicklungstipps

### Backend Änderungen
- TypeScript-Dateien sind in `backend/src/`
- Nach Änderungen: `npm run build` im backend-Verzeichnis
- Der API-Server muss neu gestartet werden

### Dashboard Änderungen
- React-Dateien sind in `dashboard/src/`
- `npm run dev` für Hot-Reload
- Änderungen werden sofort sichtbar

### Worker Debuggen
- Logs erscheinen im Worker-Fenster
- Fehlerhafte Jobs landen in der Queue (DLQ)

## Ressourcen

- **API Dokumentation**: Siehe `backend/src/routes/`
- **Dashboard Code**: `dashboard/src/`
- **Worker Code**: `backend/src/worker/`
- **Queue Implementierung**: `backend/src/queue/agentQueue.ts`
