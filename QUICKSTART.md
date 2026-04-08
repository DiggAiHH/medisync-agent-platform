# ⚡ MediSync 5-Minuten Quickstart

> **Für:** Erstbenutzer & Anfänger  
> **Dauer:** ~5 Minuten  
> **Ziel:** Plattform laufen haben

---

## 🎯 Was wir erreichen

Am Ende dieser Anleitung hast du:
- ✅ Alle Services laufen
- ✅ Dashboard im Browser geöffnet
- ✅ Funktionierende API

---

## 📋 Voraussetzungen

Stelle sicher, dass installiert ist:

| Software | Prüfbefehl | Download |
|----------|-----------|----------|
| **Node.js** 18+ | `node --version` | [nodejs.org](https://nodejs.org) |
| **Docker** | `docker --version` | [docker.com](https://docker.com) |

> 💡 **Hinweis:** Keine Zeit? Starte mit [GitHub Codespaces](https://github.com/codespaces) - alles vorinstalliert!

---

## 🚀 Schritt-für-Schritt (5 Minuten)

### Minute 1: Download

**Windows:**
```powershell
# PowerShell öffnen
git clone https://github.com/yourusername/medisync.git
cd medisync
```

**Mac/Linux:**
```bash
git clone https://github.com/yourusername/medisync.git
cd medisync
```

---

### Minute 2: Konfiguration

**Windows:**
```powershell
Copy-Item .env.example .env
```

**Mac/Linux:**
```bash
cp .env.example .env
```

> ⚠️ **Für den ersten Test:** Du kannst die `.env` so lassen (Standardwerte funktionieren).
> Für Discord-Bot-Funktionalität brauchst du später einen Token.

---

### Minute 3: Installation

```bash
# Alle Dependencies installieren
npm run install:all
```

> ☕ Das dauert 1-2 Minuten...

---

### Minute 4: Starten

```bash
# Mit Docker (einfachste Methode)
docker-compose up -d
```

Oder mit **Make**:
```bash
make start
```

---

### Minute 5: Testen

**Öffne deinen Browser:**

| URL | Was du siehst |
|-----|---------------|
| http://localhost:5173 | Dashboard 📊 |
| http://localhost:3000/health | API Status ✅ |

**Schnell-Test in PowerShell/Terminal:**

```powershell
# Windows
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

```bash
# Mac/Linux
curl http://localhost:3000/health
```

**Erwartete Ausgabe:**
```json
{
  "status": "healthy",
  "timestamp": "2026-04-08T...",
  "services": { "redis": "connected" }
}
```

---

## 🎉 Geschafft!

Deine MediSync Plattform läuft! Hier ist was du jetzt tun kannst:

### Optionen für weitere Schritte

| Nächster Schritt | Befehl/Dokumentation |
|------------------|---------------------|
| **Discord Bot einrichten** | Siehe [SETUP_GUIDE_QUICK.md](SETUP_GUIDE_QUICK.md) |
| **Ersten Agent-Job erstellen** | Dashboard → "Neuer Job" |
| **API erkunden** | http://localhost:3000/api/jobs |
| **Mit Make arbeiten** | `make help` |

---

## 🛑 Wieder Stoppen

```bash
# Services stoppen
docker-compose down

# Oder mit Make
make stop
```

---

## 🆘 Hilfe - Es funktioniert nicht!

### Problem: "Port already in use"

```bash
# Andere Services auf diesen Ports beenden
# oder: Docker auf andere Ports mappen
```

### Problem: "Docker not running"

```bash
# Docker Desktop starten
# Warten bis "Docker Desktop is running" angezeigt wird
```

### Problem: "npm command not found"

```bash
# Node.js ist nicht installiert
# → https://nodejs.org herunterladen
```

### Weitere Hilfe

- 📖 [Vollständiges Setup](SETUP_GUIDE_QUICK.md)
- 🪟 [Windows-spezifische Hilfe](WINDOWS_SETUP.md)
- 🚀 [Launch Readiness](LAUNCH_READINESS.md)

---

## 🎓 Erklärung der Komponenten

```
┌─────────────────────────────────────────────┐
│           MediSync Plattform                │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐    ┌──────────────┐      │
│  │  Dashboard   │◄──►│  Backend API │      │
│  │  (Port 5173) │    │  (Port 3000) │      │
│  └──────────────┘    └──────┬───────┘      │
│                             │               │
│                      ┌──────┴───────┐      │
│                      │    Worker    │      │
│                      └──────┬───────┘      │
│                             │               │
│                      ┌──────┴───────┐      │
│                      │    Redis     │      │
│                      │  (Port 6379) │      │
│                      └──────────────┘      │
│                                             │
│  ┌──────────────┐                           │
│  │ Discord Bot  │◄─── Optional             │
│  └──────────────┘                           │
│                                             │
└─────────────────────────────────────────────┘
```

| Komponente | Zweck | Port |
|------------|-------|------|
| **Dashboard** | Web-Oberfläche | 5173 |
| **Backend** | REST API | 3000 |
| **WebSocket** | Real-time Updates | 8080 |
| **Redis** | Datenbank/Queue | 6379 |
| **Bot** | Discord Integration | - |

---

## 📝 Nützliche Befehle

```bash
# Status aller Services
docker-compose ps

# Logs anzeigen
docker-compose logs -f

# Einen Service neustarten
docker-compose restart backend

# Alles stoppen und zurücksetzen
docker-compose down -v
```

---

## ⚡ Noch schneller: One-Line Start

```bash
# Für zukünftige Starts (wenn alles eingerichtet ist)
cd medisync && docker-compose up -d
```

---

**🎊 Willkommen bei MediSync!**

Fragen? Schau in die [README.md](README.md) oder das [Setup-Guide](SETUP_GUIDE_QUICK.md).

**Letzte Aktualisierung:** 2026-04-08
