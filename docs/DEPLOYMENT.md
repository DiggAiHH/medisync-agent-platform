# 🚀 MediSync Deployment-Guide

> Vollständige Anleitung für die Bereitstellung der MediSync Agenten-Plattform.

---

## 📋 Inhaltsverzeichnis

- [Übersicht](#-übersicht)
- [GitHub Codespaces](#-github-codespaces)
- [Docker Deployment](#-docker-deployment)
- [Cloudflare Tunnel](#-cloudflare-tunnel)
- [Monitoring](#-monitoring)
- [Backup & Restore](#-backup--restore)
- [Troubleshooting](#-troubleshooting)

---

## 🎯 Übersicht

### Deployment-Optionen

| Option | Beste für | Komplexität | Kosten |
|--------|-----------|-------------|--------|
| **GitHub Codespaces** | Entwicklung, Demos | ⭐ Einfach | Kostenlos bis 60h/Monat |
| **Docker Compose** | Kleine Teams, Testing | ⭐⭐ Mittel | Server-Kosten |
| **Kubernetes** | Produktion, Skalierung | ⭐⭐⭐ Komplex | Infrastruktur |
| **Cloud VPS** | Produktion, dediziert | ⭐⭐ Mittel | $10-50/Monat |

---

## 🐙 GitHub Codespaces

### Voraussetzungen

- GitHub Account
- Repository-Zugriff

### Einrichtung

#### Schritt 1: Codespace erstellen

1. Öffnen Sie das Repository auf GitHub
2. Klicken Sie **Code** → **Codespaces** → **Create codespace on main**

#### Schritt 2: Secrets konfigurieren

```bash
# GitHub Settings > Codespaces > Secrets
# Fügen Sie hinzu:
# - GITHUB_TOKEN
# - DISCORD_TOKEN
# - CF_TUNNEL_TOKEN (optional)
```

#### Schritt 3: Automatisches Setup

```bash
# Das Setup läuft automatisch via postCreateCommand.sh
# Warten Sie ca. 2-3 Minuten

# Status prüfen
bash scripts/status.sh
```

### Persistente URLs

```bash
# Temporäre URLs (ändern sich bei Neustart)
bash scripts/temp-tunnel.sh --all

# Persistente URLs (mit eigener Domain)
# Siehe Cloudflare Tunnel Setup
```

---

## 🐳 Docker Deployment

### Lokale Entwicklung

```bash
# Alle Services starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f [service]

# Services stoppen
docker-compose down

# Mit Volumes löschen (voller Reset)
docker-compose down -v
```

### Produktions-Deployment

#### Schritt 1: Docker Compose erstellen

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: always
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    ports:
      - "3000:3000"
    depends_on:
      - redis
    volumes:
      - ./logs:/app/logs

  discord-bot:
    build:
      context: ./bot/discord
      dockerfile: Dockerfile
    restart: always
    environment:
      - NODE_ENV=production
      - API_URL=http://backend:3000
      - WS_URL=ws://backend:8080
    depends_on:
      - backend

  dashboard:
    build:
      context: ./dashboard
      dockerfile: Dockerfile
    restart: always
    environment:
      - NODE_ENV=production
      - VITE_API_URL=/api
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  redis_data:
```

#### Schritt 2: Build und Deploy

```bash
# Build
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Logs
docker-compose logs -f
```

### VPS Deployment (z.B. Hetzner, DigitalOcean)

#### Schritt 1: Server vorbereiten

```bash
# SSH-Verbindung
ssh root@ihre-server-ip

# Updates
apt update && apt upgrade -y

# Docker installieren
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# Docker Compose installieren
apt install docker-compose-plugin
```

#### Schritt 2: Repository klonen

```bash
# Git installieren
apt install git -y

# Repository klonen
git clone https://github.com/ihr-username/medisync-agents.git
cd medisync-agents

# Environment kopieren
cp backend/.env.example backend/.env
# ... editieren
```

#### Schritt 3: Deploy

```bash
# Start
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Nginx als Reverse Proxy (optional)
apt install nginx -y

# Certbot für SSL
apt install certbot python3-certbot-nginx -y
certbot --nginx -d api.ihrefirma.de -d dashboard.ihrefirma.de
```

### Health Checks

```bash
# Container-Status
docker-compose ps

# Logs
docker-compose logs --tail 100 backend

# Redis-Check
docker-compose exec redis redis-cli ping

# API-Check
curl http://localhost:3000/health
```

---

## 🌥️ Cloudflare Tunnel

### Warum Cloudflare Tunnel?

- ✅ Keine Port-Forwarding nötig
- ✅ Automatisches HTTPS
- ✅ DDoS Protection
- ✅ Einfache Konfiguration

### Option 1: Temporäre URLs

```bash
# Schnellstart
bash scripts/temp-tunnel.sh --all

# Ausgabe:
# ================================================
# Temporäre Cloudflare Tunnel URLs
# ================================================
# API (Backend):       https://abc123.trycloudflare.com
# WebSocket Server:    https://def456.trycloudflare.com
# Dashboard (Vite):    https://ghi789.trycloudflare.com
# code-server:         https://jkl012.trycloudflare.com
# ================================================
```

### Option 2: Persistente URLs

#### Schritt 1: Domain registrieren

1. Registrieren Sie eine Domain bei Cloudflare
2. Fügen Sie die Domain zum Dashboard hinzu
3. Ändern Sie die Nameserver

#### Schritt 2: Tunnel erstellen

```bash
# Interaktives Setup
bash scripts/setup-tunnel.sh

# Eingaben:
# - Tunnel-Name: medisync-agents
# - Domain: ihre-firma.de
```

#### Schritt 3: Token konfigurieren

```bash
# Token als GitHub Secret hinzufügen
# Name: CF_TUNNEL_TOKEN
# Wert: eyJhIjoi...
```

#### Schritt 4: DNS-Einträge

| Typ | Name | Ziel |
|-----|------|------|
| CNAME | api | [tunnel-id].cfargotunnel.com |
| CNAME | ws | [tunnel-id].cfargotunnel.com |
| CNAME | dashboard | [tunnel-id].cfargotunnel.com |
| CNAME | code | [tunnel-id].cfargotunnel.com |

### Cloudflare Einstellungen

#### WebSocket Support

1. Cloudflare Dashboard → Ihre Domain
2. **Network** → **WebSockets** → **ON**

#### SSL/TLS

```
SSL/TLS Mode: Full (strict)
Always Use HTTPS: ON
Automatic HTTPS Rewrites: ON
```

#### Caching (optional)

```
Caching Level: Standard
Browser Cache TTL: 4 hours
```

---

## 📊 Monitoring

### Prometheus Metrics

#### Endpunkt

```bash
# JSON Format
curl http://localhost:3000/api/metrics

# Prometheus Format
curl http://localhost:3000/api/metrics?format=prometheus
```

#### Verfügbare Metriken

| Metrik | Typ | Beschreibung |
|--------|-----|--------------|
| `medisync_requests_total` | Counter | Gesamte Requests |
| `medisync_request_duration_seconds` | Histogram | Request-Latenz |
| `medisync_jobs_total` | Counter | Jobs nach Status |
| `medisync_tokens_total` | Counter | Verbrauchte Tokens |
| `medisync_cost_total` | Counter | Gesamtkosten |
| `medisync_errors_total` | Counter | Fehler nach Typ |

### Health Checks

```bash
# Basis Health
curl http://localhost:3000/health

# Detailliert
curl http://localhost:3000/health/detailed

# Kubernetes Probes
curl http://localhost:3000/health/ready  # Readiness
curl http://localhost:3000/health/live   # Liveness
```

### Dashboard-Monitoring

```bash
# Status-Skript
bash scripts/status.sh

# Ausgabe:
# ================================================
# MediSync Platform Status
# ================================================
# API:          http://localhost:3000 (OK)
# WebSocket:    ws://localhost:8080 (OK)
# Dashboard:    http://localhost:5173 (OK)
# Redis:        localhost:6379 (OK)
# Discord Bot:  Connected (OK)
# ================================================
```

### Alerting (Beispiel)

```yaml
# alertmanager.yml
groups:
  - name: medisync
    rules:
      - alert: HighErrorRate
        expr: rate(medisync_errors_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Hohe Fehlerrate in MediSync"
          
      - alert: QueueBacklog
        expr: medisync_jobs_pending > 100
        for: 10m
        labels:
          severity: critical
```

---

## 💾 Backup & Restore

### Redis Backup

```bash
# Backup erstellen
docker-compose exec redis redis-cli BGSAVE

# Backup-Datei kopieren
docker cp medisync-agents-redis-1:/data/dump.rdb ./backup/redis-$(date +%Y%m%d).rdb

# Automatisiertes Backup-Skript
#!/bin/bash
BACKUP_DIR="/backup/redis"
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T redis redis-cli BGSAVE
sleep 2
cp /var/lib/docker/volumes/medisync-agents_redis_data/_data/dump.rdb $BACKUP_DIR/redis-$DATE.rdb
```

### Restore

```bash
# Redis stoppen
docker-compose stop redis

# Backup einspielen
cp ./backup/redis-20240115.rdb /var/lib/docker/volumes/medisync-agents_redis_data/_data/dump.rdb

# Redis starten
docker-compose start redis
```

---

## 🐛 Troubleshooting

### Container startet nicht

```bash
# Logs prüfen
docker-compose logs backend

# Port-Konflikte
docker-compose ps
netstat -tlnp | grep 3000

# Ressourcen
docker stats
```

### Redis-Verbindungsfehler

```bash
# Redis-Status
docker-compose exec redis redis-cli ping

# Netzwerk
docker network ls
docker network inspect medisync-agents_default
```

### WebSocket-Probleme

```bash
# Cloudflare Dashboard prüfen
# Network -> WebSockets muss ON sein

# Lokaler Test
websocat ws://localhost:8080
```

---

<div align="center">

**[⬆️ Nach oben](#-medisync-deployment-guide)**

</div>
