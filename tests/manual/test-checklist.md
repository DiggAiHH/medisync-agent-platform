# MediSync Manuelle Test-Checkliste

Diese Checkliste dient der manuellen Verifizierung aller MediSync Flows.

---

## 🚀 Vorbereitung

### 1. Environment Setup

```bash
# Repository klonen (falls noch nicht geschehen)
git clone <repository-url>
cd agents-platform

# Dependencies installieren
cd backend && npm install
cd ../bot/discord && npm install

# Environment Variablen einrichten
cp backend/.env.example backend/.env
cp bot/discord/.env.example bot/discord/.env

# .env Dateien anpassen!
```

### 2. Services Starten

```bash
# Option 1: Automatisch (empfohlen)
./scripts/start-all.sh

# Option 2: Manuell
# Terminal 1: Redis
docker run -p 6379:6379 redis:7-alpine

# Terminal 2: Backend API
cd backend && npm run dev

# Terminal 3: Discord Bot
cd bot/discord && npm run dev
```

### 3. Health Check

```bash
# API Health
curl http://localhost:3000/health

# Redis Health
curl http://localhost:3000/health/redis

# Queue Health
curl http://localhost:3000/health/queue
```

---

## ✅ Test-Szenarien

### Szenario 1: Einfacher Agent-Aufruf

**Beschreibung**: `/agent Hallo` → Ergebnis in <10 Sekunden

**Schritte**:
1. Discord Server beitreten
2. `/agent Hallo` eingeben
3. Warte auf Antwort

**Erwartetes Ergebnis**:
- [ ] Nachricht "Processing..." erscheint sofort
- [ ] Antwort innerhalb von 10 Sekunden
- [ ] Antwort enthält Job-ID
- [ ] Keine Fehlermeldung

**Ergebnis**: ⬜ Bestanden ⬜ Fehlgeschlagen

**Notizen**:
```
Dauer: ___ Sekunden
Job ID: ________________
Antwort qualitativ: ⬜ Gut ⬜ Okay ⬜ Schlecht
```

---

### Szenario 2: Lange Antwort (>2000 Zeichen)

**Beschreibung**: Lange Antwort erzeugt automatisch einen Thread

**Schritte**:
1. `/agent Erkläre mir detailliert wie KI funktioniert. Schreibe mindestens 3000 Zeichen.`
2. Warte auf Antwort

**Erwartetes Ergebnis**:
- [ ] Thread wird automatisch erstellt
- [ ] Thread-Name enthält Job-ID (erste 8 Zeichen)
- [ ] Kurze Zusammenfassung im ursprünglichen Channel
- [ ] Vollständige Antwort im Thread
- [ ] Thread hat "Mögliche Folgefragen" (falls zutreffend)

**Ergebnis**: ⬜ Bestanden ⬜ Fehlgeschlagen

**Notizen**:
```
Thread erstellt: ⬜ Ja ⬜ Nein
Zeichenanzahl: ___
Thread Name: ________________
```

---

### Szenario 3: Rate Limiting

**Beschreibung**: 1 Nachricht pro Sekunde enforced

**Schritte**:
1. `/agent Test 1` sofort eingeben
2. Innerhalb von 1 Sekunde `/agent Test 2` eingeben
3. Nach 2 Sekunden `/agent Test 3` eingeben

**Erwartetes Ergebnis**:
- [ ] Erste Anfrage wird akzeptiert
- [ ] Zweite Anfrage zeigt Rate-Limit Warnung
- [ ] Dritte Anfrage wird nach Wartezeit akzeptiert
- [ ] Warnung zeigt verbleibende Wartezeit in Sekunden

**Ergebnis**: ⬜ Bestanden ⬜ Fehlgeschlagen

**Notizen**:
```
Wartezeit bei 2. Anfrage: ___ Sekunden
Fehlermeldung angezeigt: ⬜ Ja ⬜ Nein
```

---

### Szenario 4: API Down

**Beschreibung**: Graceful Error Message wenn API nicht erreichbar

**Schritte**:
1. API Server stoppen: `Ctrl+C` oder `./scripts/stop-all.sh`
2. In Discord: `/agent Test` eingeben

**Erwartetes Ergebnis**:
- [ ] Fehlermeldung wird angezeigt
- [ ] Fehlermeldung ist verständlich für Nutzer
- [ ] Kein Crash oder Timeout ohne Meldung
- [ ] Fehlermeldung enthält Verbindungs-Icon (🔌)

**Ergebnis**: ⬜ Bestanden ⬜ Fehlgeschlagen

**Notizen**:
```
Fehlermeldung: ________________________________
Nutzerfreundlich: ⬜ Ja ⬜ Nein
```

---

### Szenario 5: Worker Retry

**Beschreibung**: Failed Job wird automatisch wiederholt

**Schritte**:
1. Worker temporär stoppen (simuliere Crash)
2. `/agent Test` eingeben
3. Worker nach 5 Sekunden wieder starten

**Erwartetes Ergebnis**:
- [ ] Job bleibt in Queue
- [ ] Job wird verarbeitet nach Worker-Restart
- [ ] Kein Datenverlust
- [ ] Maximale Retry-Anzahl: 3

**Ergebnis**: ⬜ Bestanden ⬜ Fehlgeschlagen

**Notizen**:
```
Job Status Verlauf: pending → ___ → ___
Retry Anzahl: ___
Ergebnis nach Retry: ⬜ Erfolg ⬜ Fehler
```

---

### Szenario 6: WebSocket Reconnect

**Beschreibung**: Auto-Reconnect funktioniert

**Schritte**:
1. `/agent Erzähl mir einen langen Witz` eingeben
2. Während der Verarbeitung: Backend neu starten
3. Beobachte Discord-Bot Logs

**Erwartetes Ergebnis**:
- [ ] WebSocket versucht Reconnect
- [ ] Max 5 Reconnect-Versuche
- [ ] Erhöhte Wartezeit zwischen Versuchen (5s, 10s, 15s...)
- [ ] Nach Verbindungswiederherstellung: normale Funktion

**Ergebnis**: ⬜ Bestanden ⬜ Fehlgeschlagen

**Notizen**:
```
Reconnect Versuche: ___
Erfolgreich reconnectet: ⬜ Ja ⬜ Nein
Maximale Wartezeit: ___ Sekunden
```

---

### Szenario 7: Session Management

**Beschreibung**: Sessions werden korrekt verwaltet

**Schritte**:
1. `/agent Frage 1` eingeben
2. Auf Antwort warten
3. `/agent Frage 2` eingeben (gleicher Channel)
4. Auf Antwort warten

**Erwartetes Ergebnis**:
- [ ] Jede Anfrage hat eigene Session-ID
- [ ] Sessions werden nach 30 Minuten aufgeräumt
- [ ] Alte Sessions werden bei neuer Anfrage geschlossen

**Ergebnis**: ⬜ Bestanden ⬜ Fehlgeschlagen

---

### Szenario 8: Dashboard Funktionalität

**Beschreibung**: Dashboard zeigt korrekte Daten

**Schritte**:
1. Mehrere Agent-Anfragen durchführen
2. Dashboard öffnen: http://localhost:5173 (falls vorhanden)
3. Oder API Stats abrufen: `curl http://localhost:3000/api/stats`

**Erwartetes Ergebnis**:
- [ ] Jobs werden korrekt angezeigt
- [ ] Status-Updates in Echtzeit
- [ ] Verarbeitungszeit wird angezeigt
- [ ] Filter funktionieren (Pending, Processing, Completed, Failed)

**Ergebnis**: ⬜ Bestanden ⬜ Fehlgeschlagen

---

## 🔧 Troubleshooting

### Problem: Redis Verbindungsfehler

**Symptome**:
- API startet nicht
- "ECONNREFUSED 127.0.0.1:6379"

**Lösung**:
```bash
# Prüfe ob Redis läuft
docker ps | grep redis

# Starte Redis
docker run -d -p 6379:6379 redis:7-alpine

# Oder mit Docker Compose
docker-compose up -d redis
```

---

### Problem: Discord Bot verbindet nicht

**Symptome**:
- Bot ist offline
- "DISALLOWED_INTENTS" Fehler

**Lösung**:
1. Discord Developer Portal öffnen
2. Bot → Privileged Gateway Intents
3. Aktiviere:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent

---

### Problem: API Endpoints geben 404

**Symptome**:
- "Cannot GET /api/jobs"

**Lösung**:
```bash
# Prüfe ob API läuft
curl http://localhost:3000/health

# Starte API neu
cd backend && npm run dev
```

---

### Problem: WebSocket Verbindung fehlgeschlagen

**Symptome**:
- "WebSocket connection failed"
- Keine Echtzeit-Updates

**Lösung**:
```bash
# Prüfe WebSocket Port
netstat -an | grep 8080

# Prüfe Firewall
# WebSocket sollte auf ws://localhost:8080 erreichbar sein
```

---

### Problem: Jobs bleiben auf "pending"

**Symptome**:
- Job wird erstellt aber nicht verarbeitet

**Lösung**:
```bash
# Prüfe Worker
curl http://localhost:3000/health/queue

# Worker Logs prüfen
tail -f backend/logs/worker.log

# Worker neu starten
cd backend && npm run dev
```

---

### Problem: Lange Antworten werden abgeschnitten

**Symptome**:
- Discord zeigt nur 2000 Zeichen
- Rest der Nachricht fehlt

**Lösung**:
- Thread sollte automatisch erstellt werden
- Prüfe Bot-Berechtigungen für Thread-Erstellung
- Prüfe messageHandler.ts Logs

---

## 📊 Ergebnis-Zusammenfassung

| Szenario | Status | Dauer | Notizen |
|----------|--------|-------|---------|
| 1. Einfacher Agent-Aufruf | ⬜ | ___s | |
| 2. Lange Antwort | ⬜ | ___s | |
| 3. Rate Limiting | ⬜ | ___s | |
| 4. API Down | ⬜ | ___s | |
| 5. Worker Retry | ⬜ | ___s | |
| 6. WebSocket Reconnect | ⬜ | ___s | |
| 7. Session Management | ⬜ | ___s | |
| 8. Dashboard | ⬜ | ___s | |

**Gesamtergebnis**: ___ / 8 Tests bestanden

---

## 📝 Test durchgeführt von

- **Name**: ________________
- **Datum**: ________________
- **Version**: ________________
- **Environment**: ⬜ Local ⬜ Staging ⬜ Production

---

## 🔗 Nützliche Links

- API Dokumentation: http://localhost:3000/
- Health Check: http://localhost:3000/health
- Metrics: http://localhost:3000/api/metrics
- WebSocket: ws://localhost:8080

---

## 🆘 Support

Bei Problemen:
1. Logs prüfen: `logs/api.log`, `logs/bot.log`
2. Health Checks durchführen
3. Dokumentation konsultieren
4. Issue erstellen mit:
   - Szenario-Nummer
   - Fehlermeldung
   - Logs
   - Umgebung (OS, Node Version)
